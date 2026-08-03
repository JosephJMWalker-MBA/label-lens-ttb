#!/usr/bin/env node
/**
 * Issue #149 isolated OCR runtime initialization probe.
 *
 * No recognition is permitted. The recognizer method is instrumented so an
 * attempted call is measured, halted, and never forwarded to the underlying
 * production engine.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  createLocalOcrEngine,
  resolveCorePath,
  resolveLangPath,
  type OcrEngine,
} from "../../src/pipeline/extractor/ocr-engine";
import type { OcrWord } from "../../src/pipeline/extractor/extractor.types";
import {
  assertRuntimePackageClosureEqual,
  runtimePackageClosure,
  type RuntimePackageClosure,
} from "./lib/issue-149-runtime-package-closure.mjs";

const EXPECTED_CLOSURE_PATH = "/opt/acquisition/runtime-package-closure.json";

export interface ProbeLifecycleState {
  workerInitializationAttempted: boolean;
  workerInitialized: boolean;
  workerTerminationAttempted: boolean;
  workerTerminated: boolean;
  recognizeCalls: number;
  failureStage: string | null;
  failureCode: string | null;
  failureDetail: string | null;
}

export interface ProbeDependencies {
  createEngine: () => Promise<OcrEngine>;
  languageAssetPath: () => string;
  corePath: () => string;
  packageRoot: string;
  expectedClosurePath: string;
  governedCorpusMounted: () => boolean;
  runtimeUid: () => number | null;
  runtimeGid: () => number | null;
  afterInitialize?: (engine: OcrEngine) => Promise<void>;
}

const emptyState = (): ProbeLifecycleState => ({
  workerInitializationAttempted: false,
  workerInitialized: false,
  workerTerminationAttempted: false,
  workerTerminated: false,
  recognizeCalls: 0,
  failureStage: null,
  failureCode: null,
  failureDetail: null,
});

const failureCode = (cause: unknown, fallback: string): string =>
  cause instanceof Error && /^[A-Z0-9_]+:/.test(cause.message)
    ? cause.message.split(":", 1)[0]
    : fallback;

const failureDetail = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

function instrumentEngine(engine: OcrEngine, state: ProbeLifecycleState): OcrEngine {
  return {
    async recognizeWords(_png: Buffer, _pageSegMode: number): Promise<OcrWord[]> {
      state.recognizeCalls += 1;
      throw new Error("OCR_RECOGNITION_FORBIDDEN_IN_INIT_PROBE");
    },
    async terminate(): Promise<void> {
      await engine.terminate();
    },
  };
}

function requireRuntimePaths(dependencies: ProbeDependencies): {
  languageAssetPath: string;
  corePath: string;
} {
  const languageAssetPath = dependencies.languageAssetPath();
  const corePath = dependencies.corePath();
  if (!existsSync(path.join(languageAssetPath, "eng.traineddata"))) {
    throw new Error(
      `OCR_LANGUAGE_ASSET_MISSING: ${path.join(languageAssetPath, "eng.traineddata")}`,
    );
  }
  if (!existsSync(path.join(corePath, "tesseract-core.wasm"))) {
    throw new Error(`OCR_CORE_WASM_MISSING: ${path.join(corePath, "tesseract-core.wasm")}`);
  }
  return { languageAssetPath, corePath };
}

function loadExpectedClosure(file: string): RuntimePackageClosure {
  if (!existsSync(file)) throw new Error(`RUNTIME_PACKAGE_CLOSURE_MISSING: ${file}`);
  return JSON.parse(readFileSync(file, "utf8")) as RuntimePackageClosure;
}

export async function runProbeLifecycle(
  dependencies: ProbeDependencies,
): Promise<Record<string, unknown>> {
  const state = emptyState();
  let languageAssetPath: string | null = null;
  let corePath: string | null = null;
  let expectedRuntimePackageClosure: RuntimePackageClosure | null = null;
  let observedRuntimePackageClosure: RuntimePackageClosure | null = null;
  let runtimePackageClosureMatched = false;

  try {
    state.failureStage = "runtime-paths";
    const paths = requireRuntimePaths(dependencies);
    languageAssetPath = paths.languageAssetPath;
    corePath = paths.corePath;

    state.failureStage = "initialize";
    state.workerInitializationAttempted = true;
    const productionEngine = await dependencies.createEngine();
    state.workerInitialized = true;
    const engine = instrumentEngine(productionEngine, state);

    if (dependencies.afterInitialize) {
      state.failureStage = "after-initialize";
      await dependencies.afterInitialize(engine);
    }

    state.failureStage = "terminate";
    state.workerTerminationAttempted = true;
    await engine.terminate();
    state.workerTerminated = true;

    state.failureStage = "runtime-package-closure";
    expectedRuntimePackageClosure = loadExpectedClosure(dependencies.expectedClosurePath);
    observedRuntimePackageClosure = runtimePackageClosure(dependencies.packageRoot);
    assertRuntimePackageClosureEqual(expectedRuntimePackageClosure, observedRuntimePackageClosure);
    runtimePackageClosureMatched = true;

    state.failureStage = null;
    return {
      status: "OK",
      ...state,
      governedCorpusMounted: dependencies.governedCorpusMounted(),
      governedCorpusUsed: false,
      acquisitionApiInvoked: false,
      networkEnabled: false,
      runtimeUid: dependencies.runtimeUid(),
      runtimeGid: dependencies.runtimeGid(),
      languageAssetPath,
      corePath,
      expectedRuntimePackageClosure,
      observedRuntimePackageClosure,
      runtimePackageClosureMatched,
    };
  } catch (cause) {
    state.failureCode = failureCode(cause, "OCR_RUNTIME_INIT_PROBE_FAILED");
    state.failureDetail = failureDetail(cause);
    return {
      status: "HALTED",
      ...state,
      governedCorpusMounted: dependencies.governedCorpusMounted(),
      governedCorpusUsed: false,
      acquisitionApiInvoked: false,
      networkEnabled: false,
      runtimeUid: dependencies.runtimeUid(),
      runtimeGid: dependencies.runtimeGid(),
      languageAssetPath,
      corePath,
      expectedRuntimePackageClosure,
      observedRuntimePackageClosure,
      runtimePackageClosureMatched,
    };
  }
}

export async function runProbe(): Promise<Record<string, unknown>> {
  const corePath = resolveCorePath();
  return runProbeLifecycle({
    createEngine: createLocalOcrEngine,
    languageAssetPath: resolveLangPath,
    corePath: () => corePath,
    packageRoot: path.dirname(corePath),
    expectedClosurePath:
      process.env.LABEL_LENS_OCR_RUNTIME_PACKAGE_CLOSURE ?? EXPECTED_CLOSURE_PATH,
    governedCorpusMounted: () => existsSync("/input"),
    runtimeUid: () => process.getuid?.() ?? null,
    runtimeGid: () => process.getgid?.() ?? null,
  });
}

export async function main(): Promise<number> {
  const report = await runProbe();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.status === "OK" ? 0 : 1;
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname)) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
