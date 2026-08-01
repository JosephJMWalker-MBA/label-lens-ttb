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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  acquireProductionBrandEvidence,
  writeSealedEvidencePackage,
} from "./lib/issue-149-candidate-adapter";
import {
  sealRunEvidence,
  writeRunEvidence,
  type RunItemOutcome,
} from "./lib/issue-149-run-evidence-writer";
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
 * that gate rejects today because `execute-authorization.json` says
 * `EXECUTE_NOT_AUTHORIZED`. This code is implemented and dormant so it can be
 * reviewed and analysed by the closure gate, not so it can be run.
 *
 * The shape is the frozen plan: a PRIMARY pass over all 115 items and a REPEAT
 * pass over all 115, under the identical frozen configuration, with no retry and
 * no selective rerun, transactional per-item persistence, governed run-level
 * counts and manifests, and a semantic determinism comparison in which
 * timing-only differences are descriptive rather than failures.
 */
async function execute(): Promise<number> {
  const manifest = JSON.parse(readFileSync(INPUT_MANIFEST, "utf8")) as {
    cases: Array<{ opaqueItemId: string; stagedImageFileName: string; sourceImageSha256: string }>;
  };

  const runs: Array<{ runId: "primary" | "repeat"; outcomes: RunItemOutcome[] }> = [];

  for (const runId of ["primary", "repeat"] as const) {
    const rawDirectory = path.join(OUTPUT_ROOT, "raw", runId);
    const outcomes: RunItemOutcome[] = [];

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

      // Exactly once per item, per run. There is no retry and no selective
      // rerun: a failed item seals its governed failure evidence and the run
      // continues.
      const sealed = await acquireProductionBrandEvidence(extractionInput);
      const written = writeSealedEvidencePackage(sealed, { directory: rawDirectory });
      outcomes.push({
        itemId: sealed.itemId,
        outcome: sealed.outcome,
        aggregateSha256: sealed.aggregateSha256,
      });
      process.stdout.write(`${JSON.stringify({ run: runId, ...written })}\n`);
    }

    if (outcomes.length !== manifest.cases.length) {
      throw new Error(
        `${runId}: ${outcomes.length} items persisted for ${manifest.cases.length} declared`,
      );
    }
    runs.push({ runId, outcomes });
  }

  // The semantic determinism comparison. Item aggregates cover the sealed bytes,
  // which include `timings` — so an aggregate difference alone does not mean the
  // pipeline was nondeterministic. The SEMANTIC fingerprints exclude timings and
  // are what the verdict rests on; a timing-only difference is recorded
  // descriptively.
  const [primary, repeat] = runs;
  const byItem = new Map(repeat.outcomes.map((outcome) => [outcome.itemId, outcome]));
  const aggregateDifferences = primary.outcomes.filter(
    (outcome) => byItem.get(outcome.itemId)?.aggregateSha256 !== outcome.aggregateSha256,
  );
  const semanticDifferences = compareSemanticFingerprints(
    path.join(OUTPUT_ROOT, "raw", "primary"),
    path.join(OUTPUT_ROOT, "raw", "repeat"),
  );

  const determinism = {
    comparedItems: primary.outcomes.length,
    aggregateDifferingItems: aggregateDifferences.map((outcome) => outcome.itemId),
    semanticDifferingItems: semanticDifferences,
    timingOnlyDifferences: aggregateDifferences
      .map((outcome) => outcome.itemId)
      .filter((itemId) => !semanticDifferences.includes(itemId)),
    timingOnlyDifferencesAreDescriptive: true,
    verdict:
      semanticDifferences.length === 0 ? "SEMANTICALLY_DETERMINISTIC" : "SEMANTIC_DIFFERENCE",
  };

  // Governed run-level evidence, through the ONE authenticated run writer. The
  // runner writes no file itself.
  for (const run of runs) {
    const rawDirectory = path.join(OUTPUT_ROOT, "raw", run.runId);
    const sealedRun = sealRunEvidence({
      runId: run.runId,
      rawDirectory,
      declaredItems: run.outcomes,
      determinism: run.runId === "primary" ? determinism : { ...determinism, role: "repeat" },
    });
    const written = writeRunEvidence(sealedRun, { directory: rawDirectory });
    process.stdout.write(`${JSON.stringify({ runLevel: run.runId, ...written })}\n`);
  }

  // The emitted-evidence truth-key scan, over what was actually written.
  const leaked = scanEmittedEvidenceForForbiddenKeys(path.join(OUTPUT_ROOT, "raw"));
  if (leaked.length > 0) {
    process.stderr.write(
      `${JSON.stringify({ status: "HALTED", reason: "EMITTED_EVIDENCE_FORBIDDEN_KEY", detail: leaked })}\n`,
    );
    return 1;
  }

  process.stdout.write(`${JSON.stringify({ status: "ACQUISITION_COMPLETE", ...determinism })}\n`);
  return determinism.verdict === "SEMANTICALLY_DETERMINISTIC" ? 0 : 1;
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

/**
 * Compare the SEALED semantic fingerprints of two runs.
 *
 * Reads `<item>.fingerprints.json` from both, which carries the per-pass
 * semantic fingerprints (excluding `timings`) and the ordered pass-array
 * fingerprint. Timing differences cannot reach this comparison by construction.
 */
function compareSemanticFingerprints(primaryRaw: string, repeatRaw: string): string[] {
  const differing: string[] = [];
  for (const itemId of readdirSync(primaryRaw).filter((entry) => /^item-\d{4}$/.test(entry))) {
    const file = `${itemId}.fingerprints.json`;
    const primaryPath = path.join(primaryRaw, itemId, file);
    const repeatPath = path.join(repeatRaw, itemId, file);
    if (!existsSync(primaryPath) || !existsSync(repeatPath)) {
      differing.push(itemId);
      continue;
    }
    if (readFileSync(primaryPath, "utf8") !== readFileSync(repeatPath, "utf8")) {
      differing.push(itemId);
    }
  }
  return differing;
}

/**
 * Scan the emitted evidence for forbidden truth keys.
 *
 * The inventory is the canonical asset mounted with the bundle. No executable
 * module carries a duplicate literal list.
 */
function scanEmittedEvidenceForForbiddenKeys(rawRoot: string): string[] {
  const inventory = JSON.parse(
    readFileSync("/opt/acquisition/truth-key-inventory.json", "utf8"),
  ) as string[];
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const text = readFileSync(full, "utf8");
      for (const key of inventory) {
        if (text.includes(`"${key}"`)) found.push(`${full}: ${key}`);
      }
    }
  };
  if (existsSync(rawRoot)) walk(rawRoot);
  return found;
}

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
