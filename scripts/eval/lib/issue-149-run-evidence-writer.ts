/**
 * Issue #149 — the one authenticated RUN-LEVEL evidence writer.
 *
 * ## Why this exists
 *
 * The item writer takes a per-item sealed package. The frozen schema also
 * requires run-level `counts.json`, `raw-evidence-manifest.json` and
 * `raw-evidence-manifest.sha256`, plus the determinism and repeat-comparison
 * reports — and every direct filesystem-write route is prohibited outside an
 * authenticated writer. So there was no route that could produce them at all.
 *
 * The answer is a second authenticated writer, not a hole in the prohibition.
 * Weakening the prohibition would reopen exactly the unauthenticated write route
 * that was closed by making package origin a recorded fact rather than a shape.
 *
 * This writer follows the same rules as the item writer: a sealed run summary is
 * built HERE from the committed item directories, registered in a module-private
 * WeakSet, revalidated independently, written by exclusive creation into a
 * staging directory, read back, and committed by an atomic rename. It takes no
 * caller-selected subset, and no truth-bearing input.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { types as nodeTypes } from "node:util";

import { canonicalize, sha256Bytes } from "./issue-149-evidence-canonical";

export class RunEvidenceError extends Error {
  constructor(
    readonly code:
      | "RUN_SUMMARY_UNAUTHENTIC"
      | "RUN_SUMMARY_INVALID"
      | "RUN_EVIDENCE_DESTINATION_EXISTS"
      | "RUN_EVIDENCE_ALREADY_CONSUMED"
      | "RUN_EVIDENCE_WRITE_UNVERIFIED"
      | "RUN_EVIDENCE_COMMIT_FAILED"
      | "RUN_ITEM_SET_INCOMPLETE"
      | "RUN_ITEM_FILE_SET_INVALID"
      | "RUN_COMMIT_MARKER_EXISTS"
      | "RUN_NOT_COMMITTED",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "RunEvidenceError";
  }
}

/** The closed run-level file set, in fixed order. */
export const RUN_EVIDENCE_FILES = [
  "counts.json",
  "raw-evidence-manifest.json",
  "raw-evidence-manifest.sha256",
  "determinism-report.json",
] as const;

/**
 * The final, exclusive commit marker.
 *
 * The run-level files land in a directory that already exists — it holds the
 * items — so there is no single directory rename to serve as the commit point.
 * Renaming each file individually leaves a window in which some are present and
 * some are not, and a reader cannot tell that state from a committed one.
 *
 * This marker closes it. It is created LAST, with exclusive creation, and it
 * binds every run-level digest. A run without a valid marker is UNCOMMITTED, no
 * matter which of its files happen to exist.
 */
export const RUN_COMMIT_MARKER = "RUN_COMMITTED.json";

/** The exact success and failure file suffix sets an item directory may hold. */
export const ITEM_SUCCESS_SUFFIXES = [
  ".provenance.json",
  ".passes.json",
  ".fingerprints.json",
  ".words.jsonl",
  ".lines.jsonl",
  ".candidates.jsonl",
  ".selection.json",
  ".counts.json",
] as const;
export const ITEM_FAILURE_SUFFIXES = [".provenance.json", ".failure.json"] as const;

const OPAQUE_ITEM_ID = /^item-\d{4}$/;
const RUN_FILE = /^[a-z0-9-]+\.(?:json|sha256)$/;

export interface RunEvidenceFile {
  readonly path: string;
  readonly byteLength: number;
  readonly sha256: string;
  /** A fresh copy on every read; the sealed buffer is module-private. */
  readonly bytes: Uint8Array;
}

export interface SealedRunEvidence {
  readonly runId: string;
  readonly itemCount: number;
  readonly files: readonly RunEvidenceFile[];
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly aggregateSha256: string;
}

/**
 * The determinism report's CLOSED schema.
 *
 * It was `Record<string, unknown>` and was spread AFTER the writer's own `runId`
 * and `itemCount`, so a caller field could silently overwrite either. A closed
 * schema removes both problems: unknown keys are rejected, and the writer's own
 * facts are written last.
 */
export interface DeterminismReport {
  readonly verdict:
    | "COMPLETE_DETERMINISTIC_EVIDENCE"
    | "COMPLETE_WITH_NONDETERMINISM"
    | "INCOMPLETE_EVIDENCE"
    | "TRUTH_ISOLATION_FAILURE"
    | "RUNTIME_FAILURE";
  readonly comparedItems: number;
  readonly semanticallyDifferingItems: readonly string[];
  readonly timingOnlyDifferingItems: readonly string[];
  readonly differencesByLevel: Readonly<Record<string, readonly string[]>>;
  readonly comparedLevels: readonly string[];
}

const DETERMINISM_KEYS = [
  "verdict",
  "comparedItems",
  "semanticallyDifferingItems",
  "timingOnlyDifferingItems",
  "differencesByLevel",
  "comparedLevels",
] as const;

const DETERMINISM_VERDICTS = [
  "COMPLETE_DETERMINISTIC_EVIDENCE",
  "COMPLETE_WITH_NONDETERMINISM",
  "INCOMPLETE_EVIDENCE",
  "TRUTH_ISOLATION_FAILURE",
  "RUNTIME_FAILURE",
] as const;

/** What the sealer DERIVES for each item. Nothing here is taken from the caller. */
export interface DerivedItemOutcome {
  readonly itemId: string;
  readonly outcome: "extracted" | "extraction-failed";
  readonly aggregateSha256: string;
  readonly files: ReadonlyArray<{ path: string; byteLength: number; sha256: string }>;
}

const AUTHENTIC_RUN_SUMMARIES = new WeakSet<SealedRunEvidence>();
const AUTHENTIC_RUN_FILES = new WeakSet<RunEvidenceFile>();
const CONSUMED_RUN_SUMMARIES = new WeakSet<SealedRunEvidence>();

const canonicalLine = (value: unknown): string => `${canonicalize(value)}\n`;

const aggregateOf = (files: readonly RunEvidenceFile[]): string =>
  sha256Bytes(
    canonicalize(
      files.map((file) => ({ path: file.path, byteLength: file.byteLength, sha256: file.sha256 })),
    ),
  );

function sealRunFile(path: string, text: string): RunEvidenceFile {
  const sealed = Uint8Array.from(Buffer.from(text, "utf8"));
  const descriptor = {
    path,
    byteLength: sealed.byteLength,
    sha256: sha256Bytes(sealed),
    get bytes(): Uint8Array {
      return Uint8Array.from(sealed);
    },
  };
  AUTHENTIC_RUN_FILES.add(descriptor);
  return Object.freeze(descriptor);
}

/**
 * Read the COMMITTED item directories and seal the run-level evidence.
 *
 * The manifest is built from what is actually on disk, not from what the runner
 * says it wrote. A runner that persisted 114 items and reported 115 produces a
 * manifest that disagrees with its declared item set, and this halts.
 */
export function sealRunEvidence(input: {
  runId: string;
  rawDirectory: string;
  /** The closed, truth-free set of item IDs this run must contain. */
  expectedItemIds: readonly string[];
  determinism: DeterminismReport;
}): SealedRunEvidence {
  const { runId, rawDirectory, expectedItemIds, determinism } = input;
  if (!/^[a-z0-9-]+$/.test(runId)) {
    throw new RunEvidenceError(
      "RUN_SUMMARY_INVALID",
      `runId ${JSON.stringify(runId)} is malformed`,
    );
  }
  for (const itemId of expectedItemIds) {
    if (!OPAQUE_ITEM_ID.test(itemId)) {
      throw new RunEvidenceError("RUN_SUMMARY_INVALID", `itemId ${JSON.stringify(itemId)}`);
    }
  }
  if (new Set(expectedItemIds).size !== expectedItemIds.length) {
    throw new RunEvidenceError("RUN_ITEM_SET_INCOMPLETE", "duplicate itemId in the expected set");
  }
  assertDeterminismReport(determinism);

  const root = resolve(rawDirectory);
  const onDisk = existsSync(root)
    ? readdirSync(root)
        .filter((entry) => OPAQUE_ITEM_ID.test(entry) && statSync(join(root, entry)).isDirectory())
        .sort()
    : [];
  const expected = [...expectedItemIds].sort();

  if (onDisk.length !== expected.length || onDisk.some((id, index) => id !== expected[index])) {
    throw new RunEvidenceError(
      "RUN_ITEM_SET_INCOMPLETE",
      `${onDisk.length} committed item directories but ${expected.length} expected; a manifest that does not describe the committed evidence is not a manifest of it`,
    );
  }

  // Every item fact is DERIVED from the committed files. The runner supplies the
  // expected ID set — a closed, truth-free declaration — and nothing else. It
  // previously supplied each item's outcome and aggregate, which the sealer then
  // recorded without checking: a runner that mislabelled a failure as a success,
  // or reported a stale aggregate, would have had that written into the governed
  // manifest as fact.
  const derived: DerivedItemOutcome[] = onDisk.map((itemId) => deriveItemOutcome(root, itemId));

  const entries = derived.flatMap((item) =>
    item.files.map((file) => ({
      path: `${item.itemId}/${file.path}`,
      byteLength: file.byteLength,
      sha256: file.sha256,
    })),
  );
  entries.sort((left, right) => left.path.localeCompare(right.path));

  const outcomeCounts = derived.reduce<Record<string, number>>((counts, item) => {
    counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
    return counts;
  }, {});

  const countsText = canonicalLine({
    runId,
    itemCount: derived.length,
    outcomeCounts,
    itemFileCount: entries.length,
    itemTotalBytes: entries.reduce((sum, entry) => sum + entry.byteLength, 0),
    itemAggregates: derived.map((item) => ({
      itemId: item.itemId,
      outcome: item.outcome,
      aggregateSha256: item.aggregateSha256,
    })),
  });

  // The determinism report: the writer's own facts LAST, so caller data cannot
  // overwrite them.
  const determinismText = canonicalLine({
    ...determinism,
    semanticallyDifferingItems: [...determinism.semanticallyDifferingItems],
    timingOnlyDifferingItems: [...determinism.timingOnlyDifferingItems],
    comparedLevels: [...determinism.comparedLevels],
    runId,
    itemCount: derived.length,
  });

  // The manifest covers the run-level files too, so integrity is not confined to
  // the item directories.
  const countsDigest = sha256Bytes(countsText);
  const determinismDigest = sha256Bytes(determinismText);
  const manifestText = canonicalLine({
    runId,
    itemCount: derived.length,
    itemFiles: entries,
    runFiles: [
      { path: "counts.json", byteLength: Buffer.byteLength(countsText), sha256: countsDigest },
      {
        path: "determinism-report.json",
        byteLength: Buffer.byteLength(determinismText),
        sha256: determinismDigest,
      },
    ],
  });
  const manifestDigest = sha256Bytes(manifestText);
  const manifestSha256Text = `${manifestDigest}  raw-evidence-manifest.json\n`;

  const files = [
    sealRunFile("counts.json", countsText),
    sealRunFile("raw-evidence-manifest.json", manifestText),
    sealRunFile("raw-evidence-manifest.sha256", manifestSha256Text),
    sealRunFile("determinism-report.json", determinismText),
  ];

  const sealed = Object.freeze({
    runId,
    itemCount: derived.length,
    files: Object.freeze(files.slice()),
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
    aggregateSha256: aggregateOf(files),
  }) as SealedRunEvidence;

  AUTHENTIC_RUN_SUMMARIES.add(sealed);
  return sealed;
}

/** Reject an open or overriding determinism object. */
function assertDeterminismReport(report: DeterminismReport): void {
  if (typeof report !== "object" || report === null || nodeTypes.isProxy(report)) {
    throw new RunEvidenceError(
      "RUN_SUMMARY_INVALID",
      "the determinism report must be a plain object",
    );
  }
  const keys = Reflect.ownKeys(report);
  if (keys.some((key) => typeof key === "symbol")) {
    throw new RunEvidenceError("RUN_SUMMARY_INVALID", "the determinism report carries symbol keys");
  }
  const names = keys as string[];
  const problems = [
    ...DETERMINISM_KEYS.filter((key) => !names.includes(key)).map((key) => `missing ${key}`),
    ...names
      .filter((key) => !(DETERMINISM_KEYS as readonly string[]).includes(key))
      .map((key) => `unexpected ${key}`),
  ];
  if (problems.length > 0) {
    throw new RunEvidenceError(
      "RUN_SUMMARY_INVALID",
      `determinism report: ${problems.join("; ")}. runId and itemCount are the writer's own facts and cannot be supplied.`,
    );
  }
  if (!(DETERMINISM_VERDICTS as readonly string[]).includes(report.verdict)) {
    throw new RunEvidenceError(
      "RUN_SUMMARY_INVALID",
      `determinism verdict ${JSON.stringify(report.verdict)} is not preregistered`,
    );
  }
}

/**
 * Derive one item's outcome and aggregate from its COMMITTED files.
 *
 * The outcome comes from which authenticated suffix set is present, and the
 * aggregate is recomputed with the same algorithm the item sealer used, over the
 * bytes actually on disk.
 */
function deriveItemOutcome(root: string, itemId: string): DerivedItemOutcome {
  const directory = join(root, itemId);
  const present = readdirSync(directory).sort();
  const success = ITEM_SUCCESS_SUFFIXES.map((suffix) => `${itemId}${suffix}`);
  const failure = ITEM_FAILURE_SUFFIXES.map((suffix) => `${itemId}${suffix}`);

  const matches = (expected: string[]): boolean =>
    present.length === expected.length &&
    [...expected].sort().every((name, index) => name === present[index]);

  const outcome = matches(success)
    ? ("extracted" as const)
    : matches(failure)
      ? ("extraction-failed" as const)
      : null;
  if (outcome === null) {
    throw new RunEvidenceError(
      "RUN_ITEM_FILE_SET_INVALID",
      `${itemId} holds ${JSON.stringify(present)}, which is neither the success set nor the failure set`,
    );
  }

  // The item aggregate, recomputed in the sealer's own ORDER — the order the
  // suffix list defines, not directory order.
  const ordered = (outcome === "extracted" ? ITEM_SUCCESS_SUFFIXES : ITEM_FAILURE_SUFFIXES).map(
    (suffix) => {
      const name = `${itemId}${suffix}`;
      const bytes = readFileSync(join(directory, name));
      return { path: name, byteLength: bytes.byteLength, sha256: sha256Bytes(bytes) };
    },
  );
  const aggregateSha256 = sha256Bytes(canonicalize(ordered));
  return { itemId, outcome, aggregateSha256, files: ordered };
}

/**
 * Write the COMPLETE run-level evidence, transactionally.
 *
 * Same protocol as the item writer: authenticity by identity, full independent
 * revalidation, exclusive creation into staging, readback, and an atomic rename
 * as the single commit point.
 */
export function writeRunEvidence(
  sealed: SealedRunEvidence,
  options: { directory: string },
): {
  runId: string;
  directory: string;
  filesWritten: number;
  totalBytes: number;
  aggregateSha256: string;
} {
  if (
    typeof sealed !== "object" ||
    sealed === null ||
    nodeTypes.isProxy(sealed) ||
    !AUTHENTIC_RUN_SUMMARIES.has(sealed)
  ) {
    throw new RunEvidenceError(
      "RUN_SUMMARY_UNAUTHENTIC",
      "this run summary was not produced by sealRunEvidence; a coherently reconstructed object is still a forgery",
    );
  }
  if (CONSUMED_RUN_SUMMARIES.has(sealed)) {
    throw new RunEvidenceError(
      "RUN_EVIDENCE_ALREADY_CONSUMED",
      `${sealed.runId} run evidence has already been written`,
    );
  }
  CONSUMED_RUN_SUMMARIES.add(sealed);

  const fail = (detail: string): never => {
    throw new RunEvidenceError("RUN_SUMMARY_INVALID", detail);
  };

  const expected = [...RUN_EVIDENCE_FILES];
  const actual = sealed.files.map((file) => file.path);
  if (actual.length !== expected.length || actual.some((path, index) => path !== expected[index])) {
    fail(`run files ${JSON.stringify(actual)} do not match the required ordered set`);
  }
  if (sealed.fileCount !== sealed.files.length || sealed.fileCount !== expected.length) {
    fail(`fileCount ${sealed.fileCount} disagrees with files.length ${sealed.files.length}`);
  }

  const resolved = resolve(options.directory);
  let recomputedTotal = 0;
  sealed.files.forEach((file, index) => {
    if (!AUTHENTIC_RUN_FILES.has(file)) fail(`files[${index}] was not produced by the sealer`);
    if (!Object.isFrozen(file)) fail(`files[${index}] is not frozen`);
    if (!RUN_FILE.test(file.path) || file.path.includes("\0")) {
      fail(`files[${index}].path ${JSON.stringify(file.path)} is not a bare run evidence filename`);
    }
    const bytes = file.bytes;
    if (bytes.byteLength !== file.byteLength) fail(`files[${index}] length disagrees`);
    if (sha256Bytes(bytes) !== file.sha256) fail(`files[${index}] digest disagrees`);
    recomputedTotal += file.byteLength;

    const target = resolve(join(resolved, file.path));
    if (target !== join(resolved, file.path) || !target.startsWith(`${resolved}${sep}`)) {
      fail(`files[${index}].path escapes the destination directory`);
    }
  });
  if (recomputedTotal !== sealed.totalBytes) fail("totalBytes recomputes differently");
  if (aggregateOf(sealed.files) !== sealed.aggregateSha256)
    fail("aggregateSha256 recomputes differently");

  for (const file of [...sealed.files.map((entry) => entry.path), RUN_COMMIT_MARKER]) {
    if (existsSync(join(resolved, file))) {
      throw new RunEvidenceError(
        file === RUN_COMMIT_MARKER ? "RUN_COMMIT_MARKER_EXISTS" : "RUN_EVIDENCE_DESTINATION_EXISTS",
        `${file} already exists; run evidence is never overwritten`,
      );
    }
  }

  mkdirSync(resolved, { recursive: true });
  const staging = mkdtempSync(join(resolved, `.staging-run-${sealed.runId}-`));
  let committed = false;
  try {
    for (const file of sealed.files) {
      const stagedPath = join(staging, file.path);
      writeFileSync(stagedPath, file.bytes, { flag: "wx" });
      const readBack = readFileSync(stagedPath);
      if (readBack.byteLength !== file.byteLength || sha256Bytes(readBack) !== file.sha256) {
        throw new RunEvidenceError(
          "RUN_EVIDENCE_WRITE_UNVERIFIED",
          `${file.path} did not read back as written`,
        );
      }
    }
    for (const file of sealed.files) {
      renameSync(join(staging, file.path), join(resolved, file.path));
    }

    // THE COMMIT POINT: one exclusive marker, created LAST, binding every
    // run-level digest. Renaming the files individually leaves a window in which
    // some exist and some do not; a reader cannot distinguish that from a
    // completed run. A run without a valid marker is UNCOMMITTED, whatever files
    // happen to be present.
    const marker = `${canonicalize({
      runId: sealed.runId,
      itemCount: sealed.itemCount,
      requiredFiles: [...RUN_EVIDENCE_FILES],
      fileDigests: sealed.files.map((file) => ({
        path: file.path,
        byteLength: file.byteLength,
        sha256: file.sha256,
      })),
      aggregateSha256: sealed.aggregateSha256,
    })}\n`;
    writeFileSync(join(resolved, RUN_COMMIT_MARKER), Buffer.from(marker, "utf8"), { flag: "wx" });
    committed = true;
    rmSync(staging, { recursive: true, force: true });
  } catch (cause) {
    rmSync(staging, { recursive: true, force: true });
    if (cause instanceof RunEvidenceError) throw cause;
    throw new RunEvidenceError(
      "RUN_EVIDENCE_COMMIT_FAILED",
      `${sealed.runId}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  if (!committed) {
    throw new RunEvidenceError(
      "RUN_NOT_COMMITTED",
      `${sealed.runId} did not reach the commit point`,
    );
  }

  return {
    runId: sealed.runId,
    directory: resolved,
    filesWritten: sealed.files.length,
    totalBytes: sealed.totalBytes,
    aggregateSha256: sealed.aggregateSha256,
  };
}

/**
 * Is this run committed?
 *
 * A valid marker is required, and every digest it binds must match the file on
 * disk. Actor 2 treats anything else as UNCOMMITTED — including a run whose four
 * files are all present but whose marker is absent, which is exactly the state a
 * crash between renames leaves behind.
 */
export function verifyRunCommitted(rawDirectory: string): {
  committed: boolean;
  reason: string | null;
  runId: string | null;
  itemCount: number | null;
} {
  const root = resolve(rawDirectory);
  const markerPath = join(root, RUN_COMMIT_MARKER);
  if (!existsSync(markerPath)) {
    return { committed: false, reason: "RUN_COMMIT_MARKER_ABSENT", runId: null, itemCount: null };
  }
  let marker: {
    runId: string;
    itemCount: number;
    requiredFiles: string[];
    fileDigests: Array<{ path: string; byteLength: number; sha256: string }>;
    aggregateSha256: string;
  };
  try {
    marker = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    return {
      committed: false,
      reason: "RUN_COMMIT_MARKER_MALFORMED",
      runId: null,
      itemCount: null,
    };
  }

  const required = [...RUN_EVIDENCE_FILES].sort();
  if (
    !Array.isArray(marker.requiredFiles) ||
    [...marker.requiredFiles].sort().join(",") !== required.join(",")
  ) {
    return {
      committed: false,
      reason: "RUN_COMMIT_MARKER_FILE_SET_MISMATCH",
      runId: marker.runId ?? null,
      itemCount: marker.itemCount ?? null,
    };
  }
  for (const entry of marker.fileDigests) {
    const filePath = join(root, entry.path);
    if (!existsSync(filePath)) {
      return {
        committed: false,
        reason: `RUN_FILE_ABSENT: ${entry.path}`,
        runId: marker.runId,
        itemCount: marker.itemCount,
      };
    }
    const bytes = readFileSync(filePath);
    if (bytes.byteLength !== entry.byteLength || sha256Bytes(bytes) !== entry.sha256) {
      return {
        committed: false,
        reason: `RUN_FILE_DIGEST_MISMATCH: ${entry.path}`,
        runId: marker.runId,
        itemCount: marker.itemCount,
      };
    }
  }
  return { committed: true, reason: null, runId: marker.runId, itemCount: marker.itemCount };
}

/** Exposed for the determinism comparison; hashes nothing truth-bearing. */
export const runDigest = (value: unknown): string =>
  createHash("sha256")
    .update(Buffer.from(canonicalize(value), "utf8"))
    .digest("hex");

/** The exact base name of a committed item directory. */
export const committedItemDirectory = (rawDirectory: string, itemId: string): string =>
  join(resolve(rawDirectory), basename(itemId));
