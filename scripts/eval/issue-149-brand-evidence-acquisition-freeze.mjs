#!/usr/bin/env node
/**
 * Issue #149 — complete Brand evidence acquisition, STAGE 1 trusted freeze/staging.
 *
 * This is the CLI wrapper. It loads the real inputs and calls the shared core in
 * `scripts/eval/lib/issue-149-freeze-core.mjs`; the core holds the whole
 * algorithm, so normal staging, `--check`, and the staging-independence tests all
 * exercise the same implementation rather than a restatement of it.
 *
 * It runs NO OCR and changes nothing in production. It IS trusted staging: it
 * reads the PR #217 attribution artifact — which is truth-bearing — and uses
 * `governedTruth.present`, and only that, for the preregistered 105/10
 * corpus-accounting assertion.
 *
 * It emits three separated things:
 *
 *   1. a TRUTH-FREE input manifest naming only opaque item IDs and generic
 *      staged filenames — no historical case ID, no fixture path;
 *   2. staged images under generic `item-NNNN.png` names in an untracked
 *      directory, which is the only thing the acquisition process ever sees;
 *   3. a POST-FREEZE id map, written outside every acquisition mount and outside
 *      every raw evidence directory, which the acquisition process must never
 *      import, read, resolve or receive.
 *
 * Only this boundary decides the exit code. The core never calls `process.exit`.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  EVAL_MANIFEST_PATH,
  EXPERIMENT_ID,
  FreezeError,
  PR217_PATH,
  PR218_PATH,
  compareGeneratedArtifacts,
  generateStageOneArtifacts,
} from "./lib/issue-149-freeze-core.mjs";

const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
/** Post-freeze area. Deliberately a sibling of the contracts, never under raw/. */
const POST_FREEZE = path.join(ROOT, "post-freeze");
/**
 * The staged acquisition inputs. Untracked (.local is gitignored) so 115 image
 * copies never enter Git, and mounted read-only as the ONLY input the
 * acquisition process receives.
 */
const STAGED = path.join(process.cwd(), ".local/issue-149-acquisition-inputs");

const readJson = (file) => JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8"));

/** The one authoritative forbidden evidence-key inventory, read from the asset. */
const TRUTH_KEY_INVENTORY = path.join(ROOT, "runtime/truth-key-inventory.json");

function realInputs() {
  return {
    pr217: readJson(PR217_PATH),
    pr218: readJson(PR218_PATH),
    evalManifest: readJson(EVAL_MANIFEST_PATH),
    loadSourceImage: (imagePath) => readFileSync(path.join(process.cwd(), imagePath)),
    forbiddenEvidenceKeys: JSON.parse(readFileSync(TRUTH_KEY_INVENTORY, "utf8")),
  };
}

/**
 * The expected artifacts a check compares against. Injectable so the
 * intentional-drift test can point the REAL check path at temporary copies
 * instead of mutating a governed tracked file — which would race with any other
 * test reading the same package.
 */
function expectedFromArgv() {
  const flag = process.argv.find((argument) => argument.startsWith("--expected-root="));
  if (flag === undefined) return COMMITTED;
  const root = flag.slice("--expected-root=".length);
  return {
    truthFreeInputManifest: path.join(root, "truth-free-input-manifest.json"),
    populationFreeze: path.join(root, "population-freeze.json"),
    idMap: path.join(root, "id-map.json"),
  };
}

const COMMITTED = {
  truthFreeInputManifest: path.join(ROOT, "truth-free-input-manifest.json"),
  populationFreeze: path.join(ROOT, "population-freeze.json"),
  idMap: path.join(POST_FREEZE, "id-map.json"),
};

/** Normal staging: write the committed artifacts and stage the real images. */
function stage() {
  const result = generateStageOneArtifacts({
    ...realInputs(),
    out: { root: ROOT, postFreeze: POST_FREEZE, staged: STAGED },
  });
  return {
    status: "STAGE_1_POPULATION_FROZEN",
    ...result.summary,
    stagedImageDirectory: path.relative(process.cwd(), STAGED),
    stagedImageDirectoryTracked: false,
    historicalIdentityInAcquisitionInput: false,
    idMapLocation: path.relative(process.cwd(), COMMITTED.idMap),
    ocrRun: false,
  };
}

/**
 * Reproducibility check. Regenerates all three artifacts into a UNIQUE temporary
 * root and compares the exact bytes against the committed files.
 *
 * It touches no tracked artifact and no real staging directory, and it runs no
 * OCR. Cleanup happens in `finally` on both paths — the core throws rather than
 * exiting, so a drift failure can no longer terminate the process before the
 * temporary staging tree is removed.
 *
 * `expected` defaults to the committed artifacts. `--expected-root=<dir>` points
 * it at copies instead, so a drift test never needs to write a governed file.
 */
export function runFreezeCheck(expected = COMMITTED) {
  const scratch = mkdtempSync(path.join(tmpdir(), "issue-149-freeze-check-"));
  try {
    const generated = generateStageOneArtifacts({
      ...realInputs(),
      out: {
        root: path.join(scratch, "artifacts"),
        postFreeze: path.join(scratch, "artifacts/post-freeze"),
        staged: path.join(scratch, "staged"),
      },
    });
    const artifactsCompared = compareGeneratedArtifacts({
      generated: generated.written,
      expected,
    });
    return {
      status: "STAGE_1_GENERATED_ARTIFACTS_REPRODUCIBLE",
      artifactsCompared,
      byteIdentical: true,
      trackedArtifactsModified: false,
      realStagingDirectoryModified: false,
      ocrRun: false,
      ...generated.summary,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ---- the only boundary that decides an exit code ---------------------------
try {
  const result = process.argv.includes("--check") ? runFreezeCheck(expectedFromArgv()) : stage();
  console.log(JSON.stringify(result, null, 2));
} catch (cause) {
  const failure =
    cause instanceof FreezeError
      ? { status: "HALTED", reason: cause.code, detail: cause.detail, ocrRun: false }
      : {
          status: "HALTED",
          reason: "UNEXPECTED_FAILURE",
          detail: cause instanceof Error ? cause.message : String(cause),
          ocrRun: false,
        };
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
}
