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
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
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

const OUT = path.resolve(process.argv[2] ?? ".local/issue-149-rehearsal");
const ITEM_IDS = ["item-9001", "item-9002"];
const RESTRICTIVE_UMASK = "077";
const ATTESTED_SOURCE_PATHS = [
  "raw",
  "raw/primary",
  "raw/primary/item-9001",
  "planted-unreadable-0700/raw/primary/item-9001",
  "planted-unreadable-0700/raw/primary/item-9001/partial.txt",
] as const;

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

function resetOutputDirectory(outputRoot: string): void {
  const parsed = path.parse(outputRoot);
  if (outputRoot === parsed.root) {
    throw new Error(`REHEARSAL_OUTPUT_ROOT_REFUSED: ${outputRoot}`);
  }
  if (!existsSync(outputRoot)) {
    mkdirSync(outputRoot, { recursive: true });
    return;
  }
  const outputStat = lstatSync(outputRoot);
  if (outputStat.isSymbolicLink()) {
    throw new Error(`REHEARSAL_OUTPUT_SYMLINK_REFUSED: ${outputRoot}`);
  }
  if (!outputStat.isDirectory()) {
    throw new Error(`REHEARSAL_OUTPUT_NOT_DIRECTORY: ${outputRoot}`);
  }
  for (const child of readdirSync(outputRoot)) {
    rmSync(path.join(outputRoot, child), { recursive: true, force: true });
  }
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function attestSourceEntry(relativePath: string): {
  path: string;
  type: "directory" | "file";
  mode: string;
  uid: number;
  gid: number;
  length: number | null;
  sha256: string | null;
} {
  const absolute = path.join(OUT, relativePath);
  const stat = lstatSync(absolute);
  const type = stat.isDirectory() ? "directory" : stat.isFile() ? "file" : null;
  if (type === null) throw new Error(`REHEARSAL_ATTESTATION_UNEXPECTED_TYPE: ${relativePath}`);
  return {
    path: relativePath.split(path.sep).join(path.posix.sep),
    type,
    mode: (stat.mode & 0o777).toString(8).padStart(4, "0"),
    uid: stat.uid,
    gid: stat.gid,
    length: stat.isFile() ? stat.size : null,
    sha256: stat.isFile() ? sha256File(absolute) : null,
  };
}

resetOutputDirectory(OUT);

const priorUmask = process.umask(Number.parseInt(RESTRICTIVE_UMASK, 8));

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

// Planted failure 3: a partial unreadable tree created by the pinned container
// UID/GID under umask 077. The host must be unable to traverse this before the
// trusted handoff, while the archive still preserves it.
const unreadableItem = path.join(OUT, "planted-unreadable-0700", "raw", "primary", "item-9001");
mkdirSync(unreadableItem, { recursive: true, mode: 0o700 });
writeFileSync(path.join(unreadableItem, "partial.txt"), "preserved\n", {
  mode: 0o600,
});
chmodSync(unreadableItem, 0o700);

process.umask(priorUmask);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "REHEARSAL_EVIDENCE_BUILT",
      root: OUT,
      runtimeUid: process.getuid?.() ?? null,
      runtimeGid: process.getgid?.() ?? null,
      restrictiveUmask: RESTRICTIVE_UMASK,
      itemIds: ITEM_IDS,
      runs: ["primary", "repeat"],
      plantedFailures: ["missing-marker", "phantom-manifest-entry", "unreadable-0700"],
      sourceAttestation: ATTESTED_SOURCE_PATHS.map((entry) => attestSourceEntry(entry)),
      ocrRun: false,
      acquisitionApiInvoked: false,
      governedCorpusUsed: false,
    },
    null,
    2,
  )}\n`,
);
