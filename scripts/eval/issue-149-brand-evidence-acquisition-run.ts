/**
 * Issue #149 — the Stage 2 acquisition runner entrypoint.
 *
 * **This file runs INSIDE the isolated boundary.** It imports the acquisition
 * adapter and node builtins and nothing else: no fixtures, no evaluation
 * harness, no truth module, no `artifacts/**`, no `src/domain/rules/**`.
 *
 * ## Mode
 *
 * The committed mode file selects what this does. In `discover` it performs the
 * runtime-boundary discovery and **returns before any acquisition call**. Only
 * `execute` reaches the acquisition and persistence calls below.
 *
 * The two acquisition-route calls are present in the source unconditionally, and
 * that is deliberate: the Stage 2 source-closure gate resolves them by symbol and
 * requires exactly one of each, in this file, awaited, with an identifier
 * argument. A runner that hid them behind a dynamic import would satisfy discover
 * while leaving the execute path unanalysed. The gate checks the source; the mode
 * check below decides whether the source is reached.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  acquireProductionBrandEvidence,
  writeSealedEvidencePackage,
} from "./lib/issue-149-candidate-adapter";
import { sealRunEvidence, writeRunEvidence } from "./lib/issue-149-run-evidence-writer";
import {
  comparisonDigest,
  compareRuns,
  isSuccessfulAcquisition,
} from "./lib/issue-149-semantic-comparison";
import { runRuntimeDiscovery } from "./lib/issue-149-runtime-discovery";

const OUTPUT_ROOT = "/output";
const INPUT_MANIFEST = "/input/truth-free-input-manifest.json";
const STAGED_IMAGES = "/input/images";

export type RunnerMode = "discover" | "execute" | "complete";

export function resolveRunnerMode(environment: NodeJS.ProcessEnv): RunnerMode {
  const declared = (environment.ISSUE_149_MODE ?? "").trim();
  if (declared === "discover" || declared === "execute" || declared === "complete") {
    return declared;
  }
  throw new Error(
    `ISSUE_149_MODE must be exactly discover, execute or complete; received ${JSON.stringify(declared)}`,
  );
}

/**
 * Discover: verify the boundary and stop.
 *
 * It writes NOTHING to the output mount. The report goes to stdout, and the
 * trusted workflow wrapper — outside the boundary — captures, hashes and uploads
 * it. Writing the report into `/output` would mean discovery had created files in
 * the mount whose emptiness it is supposed to be reporting on.
 */
async function discover(): Promise<number> {
  const report = await runRuntimeDiscovery(process.env);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.ok ? 0 : 1;
}

/**
 * Execute: the complete governed acquisition.
 *
 * **NOT REACHABLE IN DISCOVER MODE.** The committed mode is `discover`, the
 * execute job additionally requires the execute-transition gate to pass, and
 * that gate rejects while `execute-authorization.json` says
 * `EXECUTE_NOT_AUTHORIZED`. This code is implemented and dormant so it can be
 * reviewed and analysed, not so it can be run.
 */
async function execute(): Promise<number> {
  // ---- THE PREFLIGHT ------------------------------------------------------
  //
  // Before the first acquisition call, the container re-verifies the boundary
  // ITSELF. A workflow flag is not a runtime observation: the job could be
  // started with the right arguments against the wrong container, and nothing
  // downstream would notice. This runs the SAME implementation discovery runs —
  // one shared core, not a second restatement.
  const preflight = await runRuntimeDiscovery(process.env);
  if (!preflight.ok) {
    process.stderr.write(
      `${JSON.stringify(
        {
          status: "HALTED",
          reason: "EXECUTE_BOUNDARY_PREFLIGHT_FAILED",
          failedChecks: preflight.findings.filter((finding) => !finding.ok),
          acquisitionApiCalls: 0,
          extractorCalls: 0,
          itemWriterCalls: 0,
          runWriterCalls: 0,
          outputFilesCreated: 0,
        },
        null,
        2,
      )}\n`,
    );
    return 1;
  }

  const manifest = JSON.parse(readFileSync(INPUT_MANIFEST, "utf8")) as {
    cases: Array<{ opaqueItemId: string; stagedImageFileName: string; sourceImageSha256: string }>;
  };
  const expectedItemIds = manifest.cases.map((item) => item.opaqueItemId);

  for (const runId of ["primary", "repeat"] as const) {
    const rawDirectory = path.join(OUTPUT_ROOT, "raw", runId);

    for (const item of manifest.cases) {
      const imageBytes = readFileSync(path.join(STAGED_IMAGES, item.stagedImageFileName));
      const extractionInput = {
        imageBytes: Uint8Array.from(imageBytes),
        artifactRef: item.opaqueItemId,
        derivativeSha256: item.sourceImageSha256,
        // The identical frozen configuration on BOTH runs. A repeat under a
        // different configuration would measure the configuration, not the
        // pipeline.
        processedAt: FROZEN_PROCESSED_AT,
        extractionAdapterId: FROZEN_ADAPTER_ID,
        extractionAdapterVersion: FROZEN_ADAPTER_VERSION,
        ocrEngine: FROZEN_OCR_ENGINE,
        parserId: FROZEN_PARSER_ID,
        parserVersion: FROZEN_PARSER_VERSION,
      };

      // Exactly once per item, per run. No retry, no selective rerun: a failed
      // item seals its governed failure evidence and the run continues.
      const sealed = await acquireProductionBrandEvidence(extractionInput);
      const written = writeSealedEvidencePackage(sealed, { directory: rawDirectory });
      process.stdout.write(`${JSON.stringify({ run: runId, ...written })}\n`);
    }
  }

  // ---- the COMPLETE semantic comparison -----------------------------------
  //
  // Every preregistered level, not the pass fingerprints alone. A difference is
  // timing-only when NO semantic level differs and the byte difference is
  // confined to `timings`; anything else is semantic.
  const comparison = compareRuns({
    primaryDirectory: path.join(OUTPUT_ROOT, "raw", "primary"),
    repeatDirectory: path.join(OUTPUT_ROOT, "raw", "repeat"),
    expectedItemIds,
  });

  const determinism = {
    verdict: comparison.verdict,
    comparedItems: comparison.comparedItems,
    semanticallyDifferingItems: comparison.semanticallyDifferingItems,
    timingOnlyDifferingItems: comparison.timingOnlyDifferingItems,
    differencesByLevel: comparison.differencesByLevel,
    comparedLevels: comparison.comparedLevels,
    extractedItemCount: comparison.extractedItemCount,
    failedItemCount: comparison.failedItemCount,
    runtimeUnavailableItemCount: comparison.runtimeUnavailableItemCount,
    runtimeFailureCodes: comparison.runtimeFailureCodes,
    runtimeFailureDetail: comparison.runtimeFailureDetail,
    scientificResultProduced: comparison.scientificResultProduced,
  };

  // Governed run-level evidence, through the ONE authenticated run writer, which
  // derives every item fact from the committed files itself.
  for (const runId of ["primary", "repeat"] as const) {
    const rawDirectory = path.join(OUTPUT_ROOT, "raw", runId);
    const sealedRun = sealRunEvidence({ runId, rawDirectory, expectedItemIds, determinism });
    const written = writeRunEvidence(sealedRun, { directory: rawDirectory });
    process.stdout.write(`${JSON.stringify({ runLevel: runId, ...written })}\n`);
  }

  process.stdout.write(
    `${JSON.stringify({
      status:
        comparison.verdict === "RUNTIME_FAILURE"
          ? "ACQUISITION_RUNTIME_FAILURE"
          : "ACQUISITION_COMPLETE",
      haltCode: comparison.verdict === "RUNTIME_FAILURE" ? "OCR_RUNTIME_FAILURE" : null,
      ...determinism,
      comparisonDigest: comparisonDigest(comparison),
    })}\n`,
  );

  // A COMPLETE nondeterministic result is a SUCCESSFUL acquisition outcome. It
  // must not return a failing status: the verification and upload steps that
  // follow are exactly what a nondeterministic result most needs, and a nonzero
  // exit would skip them. Nonzero is reserved for incomplete evidence, an
  // isolation failure or a runtime failure.
  return isSuccessfulAcquisition(comparison.verdict) ? 0 : 1;
}

/** The frozen incumbent identities, identical on the primary and repeat runs. */
const FROZEN_PROCESSED_AT = "2026-07-12T00:00:00Z";
const FROZEN_ADAPTER_ID = "local-two-field-extractor";
const FROZEN_ADAPTER_VERSION = "1.0.0";
const FROZEN_PARSER_ID = "wine-alcohol-parse";
const FROZEN_PARSER_VERSION = "1.0.0";
const FROZEN_OCR_ENGINE = {
  kind: "ocr" as const,
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};

/** Recorded so a reader can see the runner never silently changed its own mode. */
export function declaredModeMarker(mode: RunnerMode): string {
  return `ISSUE_149_RUNNER_MODE=${mode}`;
}

export async function main(): Promise<number> {
  const mode = resolveRunnerMode(process.env);
  // STDERR. The wrapper captures stdout as `discovery-report.json` and hashes
  // it, and the first successful run produced a file that was not valid JSON
  // because this marker sat ahead of the report and inside its digest.
  process.stderr.write(`${declaredModeMarker(mode)}\n`);

  if (mode !== "execute") {
    // The halt. Discover returns HERE, before any acquisition, extractor, OCR
    // engine or writer call. `complete` is a no-op terminal state.
    return mode === "discover" ? discover() : 0;
  }
  return execute();
}

/**
 * Is this module the program being run?
 *
 * Compared by IDENTITY, not by filename. The previous guard matched the source
 * basename, which the BUNDLED artifact does not carry — the emitted module is
 * `acquisition.mjs`, so the bundle loaded, matched nothing, and exited silently
 * having done no work and reported nothing. That is worse than failing.
 *
 * `import.meta.url` survives bundling to ES-module output, so this holds for the
 * source entrypoint and the bundle alike, and is false when a test imports the
 * module.
 */
export function isProgramEntrypoint(argv: string[], moduleUrl: string): boolean {
  const entry = argv[1];
  if (entry === undefined) return false;
  try {
    return pathToFileURL(entry).href === moduleUrl;
  } catch {
    return false;
  }
}

if (isProgramEntrypoint(process.argv, import.meta.url)) {
  void main().then(
    (code) => {
      process.exitCode = code;
    },
    (cause: unknown) => {
      process.stderr.write(
        `${JSON.stringify({ status: "HALTED", detail: cause instanceof Error ? cause.message : String(cause) })}\n`,
      );
      process.exitCode = 1;
    },
  );
}
