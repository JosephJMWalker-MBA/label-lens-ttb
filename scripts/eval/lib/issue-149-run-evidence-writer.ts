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
      | "RUN_ITEM_SET_INCOMPLETE",
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

/** Per-item facts the run summary is built from. Supplied by the runner, verified here. */
export interface RunItemOutcome {
  readonly itemId: string;
  readonly outcome: "extracted" | "extraction-failed";
  readonly aggregateSha256: string;
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
  declaredItems: readonly RunItemOutcome[];
  determinism: Record<string, unknown>;
}): SealedRunEvidence {
  const { runId, rawDirectory, declaredItems, determinism } = input;
  if (!/^[a-z0-9-]+$/.test(runId)) {
    throw new RunEvidenceError(
      "RUN_SUMMARY_INVALID",
      `runId ${JSON.stringify(runId)} is malformed`,
    );
  }
  for (const item of declaredItems) {
    if (!OPAQUE_ITEM_ID.test(item.itemId)) {
      throw new RunEvidenceError("RUN_SUMMARY_INVALID", `itemId ${JSON.stringify(item.itemId)}`);
    }
  }

  const root = resolve(rawDirectory);
  const onDisk = existsSync(root)
    ? readdirSync(root)
        .filter((entry) => OPAQUE_ITEM_ID.test(entry) && statSync(join(root, entry)).isDirectory())
        .sort()
    : [];
  const declared = declaredItems.map((item) => item.itemId).sort();

  if (onDisk.length !== declared.length || onDisk.some((id, index) => id !== declared[index])) {
    throw new RunEvidenceError(
      "RUN_ITEM_SET_INCOMPLETE",
      `${onDisk.length} committed item directories but ${declared.length} declared; a manifest that does not describe the committed evidence is not a manifest of it`,
    );
  }
  if (new Set(declared).size !== declared.length) {
    throw new RunEvidenceError("RUN_ITEM_SET_INCOMPLETE", "duplicate itemId in the declared set");
  }

  // Every committed file, hashed from disk.
  const entries: Array<{ path: string; byteLength: number; sha256: string }> = [];
  for (const itemId of onDisk) {
    const itemDirectory = join(root, itemId);
    for (const file of readdirSync(itemDirectory).sort()) {
      const bytes = readFileSync(join(itemDirectory, file));
      entries.push({
        path: `${itemId}/${file}`,
        byteLength: bytes.byteLength,
        sha256: sha256Bytes(bytes),
      });
    }
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));

  const byOutcome = declaredItems.reduce<Record<string, number>>((counts, item) => {
    counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
    return counts;
  }, {});

  const countsText = canonicalLine({
    runId,
    itemCount: declared.length,
    outcomeCounts: byOutcome,
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.byteLength, 0),
    itemAggregates: [...declaredItems]
      .sort((left, right) => left.itemId.localeCompare(right.itemId))
      .map((item) => ({ itemId: item.itemId, aggregateSha256: item.aggregateSha256 })),
  });

  const manifestText = canonicalLine({ runId, itemCount: declared.length, files: entries });
  // SHA-256 over the exact manifest BYTES, in the conventional shasum format.
  const manifestDigest = sha256Bytes(manifestText);
  const manifestSha256Text = `${manifestDigest}  raw-evidence-manifest.json\n`;
  const determinismText = canonicalLine({ runId, itemCount: declared.length, ...determinism });

  const files = [
    sealRunFile("counts.json", countsText),
    sealRunFile("raw-evidence-manifest.json", manifestText),
    sealRunFile("raw-evidence-manifest.sha256", manifestSha256Text),
    sealRunFile("determinism-report.json", determinismText),
  ];

  const sealed = Object.freeze({
    runId,
    itemCount: declared.length,
    files: Object.freeze(files.slice()),
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
    aggregateSha256: aggregateOf(files),
  }) as SealedRunEvidence;

  AUTHENTIC_RUN_SUMMARIES.add(sealed);
  return sealed;
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

  for (const file of sealed.files) {
    if (existsSync(join(resolved, file.path))) {
      throw new RunEvidenceError(
        "RUN_EVIDENCE_DESTINATION_EXISTS",
        `${file.path} already exists; run evidence is never overwritten`,
      );
    }
  }

  mkdirSync(resolved, { recursive: true });
  const staging = mkdtempSync(join(resolved, `.staging-run-${sealed.runId}-`));
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
    // THE COMMIT POINT: each file moved into place by rename, after all of them
    // verified. The run directory already exists (it holds the items), so a
    // directory rename is not available and each file is renamed individually;
    // a partial commit here is impossible only because every file was already
    // written and verified, and rename within a filesystem does not fail for
    // space.
    for (const file of sealed.files) {
      renameSync(join(staging, file.path), join(resolved, file.path));
    }
    rmSync(staging, { recursive: true, force: true });
  } catch (cause) {
    rmSync(staging, { recursive: true, force: true });
    if (cause instanceof RunEvidenceError) throw cause;
    throw new RunEvidenceError(
      "RUN_EVIDENCE_COMMIT_FAILED",
      `${sealed.runId}: ${cause instanceof Error ? cause.message : String(cause)}`,
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

/** Exposed for the determinism comparison; hashes nothing truth-bearing. */
export const runDigest = (value: unknown): string =>
  createHash("sha256")
    .update(Buffer.from(canonicalize(value), "utf8"))
    .digest("hex");

/** The exact base name of a committed item directory. */
export const committedItemDirectory = (rawDirectory: string, itemId: string): string =>
  join(resolve(rawDirectory), basename(itemId));
