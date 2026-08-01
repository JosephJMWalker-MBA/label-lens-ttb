/**
 * Issue #149 — synthetic evidence for the no-OCR verifier-transport rehearsal.
 *
 * **No OCR, no acquisition API, no governed corpus.** It writes a small
 * synthetic committed primary/repeat tree using the REAL run-level writer, plus
 * two deliberately planted-failure copies, so the rehearsal can prove the
 * host-side verifier actually runs — and actually fails — in a job with no
 * repository checkout.
 *
 * The item IDs are synthetic (`item-9001`, `item-9002`) and no staged image,
 * historical identifier or governed truth is involved.
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

import { canonicalize } from "./lib/issue-149-evidence-canonical";
import {
  ITEM_SUCCESS_SUFFIXES,
  RUN_COMMIT_MARKER,
  sealRunEvidence,
  writeRunEvidence,
  type DeterminismReport,
} from "./lib/issue-149-run-evidence-writer";
import { SEMANTIC_LEVELS } from "./lib/issue-149-semantic-comparison";

const OUT = process.argv[2] ?? ".local/issue-149-rehearsal";
const ITEM_IDS = ["item-9001", "item-9002"];

const DETERMINISM: DeterminismReport = {
  verdict: "COMPLETE_DETERMINISTIC_EVIDENCE",
  comparedItems: ITEM_IDS.length,
  semanticallyDifferingItems: [],
  timingOnlyDifferingItems: [],
  differencesByLevel: {},
  comparedLevels: SEMANTIC_LEVELS.map((entry) => entry.level),
};

function writeItem(runRoot: string, itemId: string): void {
  const directory = path.join(runRoot, itemId);
  mkdirSync(directory, { recursive: true });
  for (const suffix of ITEM_SUCCESS_SUFFIXES) {
    writeFileSync(
      path.join(directory, `${itemId}${suffix}`),
      `${canonicalize({ itemId, suffix, synthetic: true })}\n`,
    );
  }
}

function buildRun(root: string, runId: string): void {
  const runRoot = path.join(root, runId);
  mkdirSync(runRoot, { recursive: true });
  for (const itemId of ITEM_IDS) writeItem(runRoot, itemId);
  const sealed = sealRunEvidence({
    runId,
    rawDirectory: runRoot,
    expectedItemIds: ITEM_IDS,
    determinism: DETERMINISM,
  });
  writeRunEvidence(sealed, { directory: runRoot });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// The good tree.
const raw = path.join(OUT, "raw");
buildRun(raw, "primary");
buildRun(raw, "repeat");

// The expected-ID manifest, in the same shape the truth-free manifest uses.
writeFileSync(
  path.join(OUT, "expected-items.json"),
  `${JSON.stringify({ cases: ITEM_IDS.map((opaqueItemId) => ({ opaqueItemId })) }, null, 2)}\n`,
);

// Planted failure 1: the run commit marker removed. Every run-level file is
// still present, which is exactly the state a crash between renames leaves.
const missingMarker = path.join(OUT, "planted-missing-marker");
cpSync(raw, path.join(missingMarker, "raw"), { recursive: true });
rmSync(path.join(missingMarker, "raw", "primary", RUN_COMMIT_MARKER));

// Planted failure 2: a phantom manifest entry naming a file that does not
// exist. Verifying only the files on disk against the manifest would miss it.
const phantom = path.join(OUT, "planted-phantom-manifest-entry");
cpSync(raw, path.join(phantom, "raw"), { recursive: true });
const manifestPath = path.join(phantom, "raw", "primary", "raw-evidence-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
  itemFiles: Array<{ path: string; byteLength: number; sha256: string }>;
};
manifest.itemFiles.push({
  path: "item-9001/item-9001.phantom.json",
  byteLength: 1,
  sha256: "0".repeat(64),
});
writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "REHEARSAL_EVIDENCE_BUILT",
      root: OUT,
      itemIds: ITEM_IDS,
      runs: ["primary", "repeat"],
      plantedFailures: ["missing-marker", "phantom-manifest-entry"],
      ocrRun: false,
      acquisitionApiInvoked: false,
      governedCorpusUsed: false,
    },
    null,
    2,
  )}\n`,
);
