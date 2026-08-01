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
 * Execute: acquire and persist one item.
 *
 * NOT REACHABLE IN DISCOVER MODE. Execute authorization is a separate decision
 * and the committed mode file is `discover`.
 */
async function execute(): Promise<number> {
  const manifest = JSON.parse((await import("node:fs")).readFileSync(INPUT_MANIFEST, "utf8")) as {
    cases: Array<{ opaqueItemId: string; stagedImageFileName: string; sourceImageSha256: string }>;
  };

  let failures = 0;
  for (const item of manifest.cases) {
    const imageBytes = readFileSync(path.join(STAGED_IMAGES, item.stagedImageFileName));
    const extractionInput = {
      imageBytes: Uint8Array.from(imageBytes),
      artifactRef: item.opaqueItemId,
      derivativeSha256: item.sourceImageSha256,
      processedAt: "2026-07-12T00:00:00Z",
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: {
        kind: "ocr" as const,
        engineId: "tesseract.js",
        engineVersion: "7.0.0",
        modelId: "eng",
      },
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
    };

    const sealed = await acquireProductionBrandEvidence(extractionInput);
    const written = writeSealedEvidencePackage(sealed, { directory: runDirectory() });
    if (sealed.outcome !== "extracted") failures += 1;
    process.stdout.write(`${JSON.stringify({ item: item.opaqueItemId, ...written })}\n`);
  }
  return failures === 0 ? 0 : 1;
}

/**
 * The primary run directory. It is NOT created here: the authenticated writer
 * creates its own destination, and creating it from the runner would be a second
 * filesystem route into the output mount.
 */
const runDirectory = (): string => path.join(OUTPUT_ROOT, "raw", "primary");

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

// NOTE, recorded as an execute blocker rather than worked around: the frozen
// schema still requires run-level `counts.json`, `raw-evidence-manifest.json`
// and `raw-evidence-manifest.sha256`, and there is no governed writer for them
// while every direct filesystem write route is prohibited. This runner therefore
// cannot produce a complete run, and execute must not be authorized until that
// boundary exists. See execute-readiness-blockers.json.
