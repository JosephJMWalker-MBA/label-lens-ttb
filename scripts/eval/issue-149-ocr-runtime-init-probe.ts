#!/usr/bin/env node
/**
 * Issue #149 isolated OCR runtime initialization probe.
 *
 * This is a no-recognition runtime-closure check. It imports the production OCR
 * engine factory, initializes and terminates the worker, and never mounts or
 * reads governed evidence.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync, type Stats } from "node:fs";
import path from "node:path";

import {
  createLocalOcrEngine,
  resolveCorePath,
  resolveLangPath,
} from "../../src/pipeline/extractor/ocr-engine";

const require = createRequire(import.meta.url);
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const sha256File = (file: string) => sha256(readFileSync(file));

interface PackageClosure {
  name: string;
  version: string | null;
  directory: string;
  fileCount: number;
  byteLength: number;
  aggregateSha256: string;
}

function packageRoot(name: string): string {
  let current = path.dirname(require.resolve(name));
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "package.json"))) return current;
    current = path.dirname(current);
  }
  throw new Error(`RUNTIME_PACKAGE_ROOT_NOT_FOUND: ${name}`);
}

function walkPackageEntries(root: string): Array<{ path: string; stat: Stats; sha256: string }> {
  const entries: Array<{ path: string; stat: Stats; sha256: string }> = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory).sort()) {
      const absolute = path.join(directory, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        walk(absolute);
      } else if (stat.isFile()) {
        entries.push({
          path: path.relative(root, absolute),
          stat,
          sha256: sha256File(absolute),
        });
      }
    }
  };
  walk(root);
  return entries;
}

function packageClosure(name: string): PackageClosure {
  const directory = packageRoot(name);
  const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")) as {
    version?: string;
  };
  const entries = walkPackageEntries(directory);
  return {
    name,
    version: manifest.version ?? null,
    directory,
    fileCount: entries.length,
    byteLength: entries.reduce((sum, entry) => sum + entry.stat.size, 0),
    aggregateSha256: sha256(
      JSON.stringify(entries.map((entry) => [entry.path, entry.stat.size, entry.sha256])),
    ),
  };
}

function requireRuntimePaths(): { languageAssetPath: string; corePath: string } {
  const languageAssetPath = resolveLangPath();
  const corePath = resolveCorePath();
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

export async function runProbe(): Promise<Record<string, unknown>> {
  const { languageAssetPath, corePath } = requireRuntimePaths();
  let workerInitialized = false;
  let workerTerminated = false;
  let recognizeCalls = 0;
  const engine = await createLocalOcrEngine();
  workerInitialized = true;
  try {
    await engine.terminate();
    workerTerminated = true;
  } finally {
    recognizeCalls = 0;
  }

  return {
    status: "OK",
    workerInitialized,
    workerTerminated,
    recognizeCalls,
    governedCorpusMounted: existsSync("/input"),
    governedCorpusUsed: false,
    acquisitionApiInvoked: false,
    networkEnabled: false,
    runtimeUid: process.getuid?.() ?? null,
    runtimeGid: process.getgid?.() ?? null,
    languageAssetPath,
    corePath,
    tesseractPackages: [packageClosure("tesseract.js"), packageClosure("tesseract.js-core")],
  };
}

export async function main(): Promise<number> {
  try {
    const report = await runProbe();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (cause) {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "HALTED",
          workerInitialized: false,
          workerTerminated: false,
          recognizeCalls: 0,
          governedCorpusMounted: existsSync("/input"),
          governedCorpusUsed: false,
          acquisitionApiInvoked: false,
          networkEnabled: false,
          detail: cause instanceof Error ? cause.message : String(cause),
        },
        null,
        2,
      )}\n`,
    );
    return 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname)) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
