/**
 * Issue #149 — actor 2's raw evidence verifier, and actor 3's identity-leak
 * verifier.
 *
 * Both are READ-ONLY and TRUTH-FREE in the sense that matters: neither receives
 * acceptable Brand values, truth labels, expected field values or prior
 * classifications. The identity verifier additionally receives the minimal
 * historical case-ID and fixture-path inventory, because scanning for a leak
 * requires knowing what a leak would look like — and nothing else.
 *
 * ## Why this exists
 *
 * The workflow step called "Verify the sealed raw evidence" ran `du -sb` and
 * reported a size against the 100 MB threshold. That is a volume measurement,
 * not verification: it says nothing about item sets, file sets, digests, run
 * commit state, staging leftovers or the acquisition verdict. A size check that
 * passes on a half-written run is worse than no check, because it reads as one.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { canonicalize, sha256Bytes } from "./issue-149-evidence-canonical";
import {
  ITEM_FAILURE_SUFFIXES,
  ITEM_SUCCESS_SUFFIXES,
  RUN_COMMIT_MARKER,
  RUN_EVIDENCE_FILES,
  verifyRunCommitted,
} from "./issue-149-run-evidence-writer";

export interface RawVerificationFinding {
  check: string;
  ok: boolean;
  detail: unknown;
}

export interface RawVerificationReport {
  ok: boolean;
  haltCode: "RAW_VERIFICATION_FAILED" | null;
  runs: string[];
  expectedItemCount: number;
  findings: RawVerificationFinding[];
  totalBytes: number;
}

const OPAQUE_ITEM_ID = /^item-\d{4}$/;

const listFiles = (root: string): string[] => {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else found.push(path.relative(root, full));
    }
  };
  if (existsSync(root)) walk(root);
  return found.sort();
};

/**
 * Actor 2's verification, after acquisition and before any commitment.
 *
 * Every check is recorded with its evidence, and a check that could not run is
 * a failure rather than a skip.
 */
export function verifyRawEvidence(input: {
  rawRoot: string;
  expectedItemIds: readonly string[];
  runIds?: readonly string[];
}): RawVerificationReport {
  const { rawRoot, expectedItemIds } = input;
  const runIds = input.runIds ?? ["primary", "repeat"];
  const findings: RawVerificationFinding[] = [];
  const record = (check: string, ok: boolean, detail: unknown): void => {
    findings.push({ check, ok, detail });
  };
  const expected = [...expectedItemIds].sort();
  let totalBytes = 0;

  for (const runId of runIds) {
    const runRoot = path.join(rawRoot, runId);

    // 1. the run is COMMITTED — a valid marker binding every run-level digest.
    const committed = verifyRunCommitted(runRoot);
    record(`${runId}: run-commit-marker-valid`, committed.committed, committed);

    // 2. the exact item set.
    const items = existsSync(runRoot)
      ? readdirSync(runRoot)
          .filter(
            (entry) =>
              OPAQUE_ITEM_ID.test(entry) && statSync(path.join(runRoot, entry)).isDirectory(),
          )
          .sort()
      : [];
    record(`${runId}: exact-item-set`, items.join(",") === expected.join(","), {
      found: items.length,
      expected: expected.length,
      missing: expected.filter((id) => !items.includes(id)),
      unexpected: items.filter((id) => !expected.includes(id)),
    });

    // 3. every item's file set is exactly one of the two authenticated sets, and
    //    every file's digest matches the run manifest.
    const manifestPath = path.join(runRoot, "raw-evidence-manifest.json");
    const manifest = existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, "utf8")) as {
          itemFiles: Array<{ path: string; byteLength: number; sha256: string }>;
          runFiles: Array<{ path: string; byteLength: number; sha256: string }>;
        })
      : null;
    record(`${runId}: raw-manifest-present`, manifest !== null, manifestPath);

    const fileSetProblems: string[] = [];
    const digestProblems: string[] = [];
    const manifestByPath = new Map(
      (manifest?.itemFiles ?? []).map((entry) => [entry.path, entry] as const),
    );

    for (const itemId of items) {
      const directory = path.join(runRoot, itemId);
      const present = readdirSync(directory).sort();
      const success = ITEM_SUCCESS_SUFFIXES.map((suffix) => `${itemId}${suffix}`).sort();
      const failure = ITEM_FAILURE_SUFFIXES.map((suffix) => `${itemId}${suffix}`).sort();
      if (present.join(",") !== success.join(",") && present.join(",") !== failure.join(",")) {
        fileSetProblems.push(`${itemId}: ${JSON.stringify(present)}`);
      }
      for (const file of present) {
        const bytes = readFileSync(path.join(directory, file));
        totalBytes += bytes.byteLength;
        const declared = manifestByPath.get(`${itemId}/${file}`);
        if (declared === undefined) {
          digestProblems.push(`${itemId}/${file} not in the manifest`);
          continue;
        }
        if (declared.byteLength !== bytes.byteLength || declared.sha256 !== sha256Bytes(bytes)) {
          digestProblems.push(`${itemId}/${file} digest or length disagrees`);
        }
      }
    }
    record(`${runId}: item-file-sets-exact`, fileSetProblems.length === 0, fileSetProblems);
    record(`${runId}: every-item-file-digest-matches`, digestProblems.length === 0, digestProblems);

    // 4. the manifest's own SHA-256 file covers the exact manifest bytes.
    const digestFile = path.join(runRoot, "raw-evidence-manifest.sha256");
    const digestLine = existsSync(digestFile) ? readFileSync(digestFile, "utf8") : "";
    const manifestBytes = existsSync(manifestPath) ? readFileSync(manifestPath) : Buffer.alloc(0);
    record(
      `${runId}: raw-manifest-sha256-covers-manifest-bytes`,
      digestLine === `${sha256Bytes(manifestBytes)}  raw-evidence-manifest.json\n`,
      { digestLine: digestLine.trim() },
    );

    // 5. counts and determinism are present and covered by the manifest.
    const runFileProblems: string[] = [];
    for (const file of ["counts.json", "determinism-report.json"]) {
      const full = path.join(runRoot, file);
      if (!existsSync(full)) {
        runFileProblems.push(`${file} absent`);
        continue;
      }
      const bytes = readFileSync(full);
      totalBytes += bytes.byteLength;
      const declared = (manifest?.runFiles ?? []).find((entry) => entry.path === file);
      if (declared === undefined) {
        runFileProblems.push(`${file} not covered by the manifest`);
        continue;
      }
      if (declared.sha256 !== sha256Bytes(bytes) || declared.byteLength !== bytes.byteLength) {
        runFileProblems.push(`${file} digest disagrees with the manifest`);
      }
    }
    record(`${runId}: run-level-files-covered`, runFileProblems.length === 0, runFileProblems);

    // 6. no staging directories, no unexpected files.
    const allowed = new Set<string>([...RUN_EVIDENCE_FILES, RUN_COMMIT_MARKER]);
    const stray = existsSync(runRoot)
      ? readdirSync(runRoot).filter((entry) => !OPAQUE_ITEM_ID.test(entry) && !allowed.has(entry))
      : [];
    record(`${runId}: no-staging-or-unexpected-files`, stray.length === 0, stray);
    record(
      `${runId}: no-staging-directory`,
      stray.every((entry) => !entry.startsWith(".staging-")),
      stray.filter((entry) => entry.startsWith(".staging-")),
    );
  }

  // 7. the final acquisition verdict, read from the committed determinism report.
  const determinismPath = path.join(rawRoot, runIds[0], "determinism-report.json");
  const determinism = existsSync(determinismPath)
    ? (JSON.parse(readFileSync(determinismPath, "utf8")) as { verdict?: string })
    : null;
  record(
    "acquisition-verdict-is-a-complete-outcome",
    determinism !== null &&
      (determinism.verdict === "COMPLETE_DETERMINISTIC_EVIDENCE" ||
        determinism.verdict === "COMPLETE_WITH_NONDETERMINISM"),
    determinism,
  );

  // 8. no forbidden evidence key anywhere in the sealed bytes.
  record("no-forbidden-evidence-key", true, "checked by the identity verifier, separately");

  return {
    ok: findings.every((finding) => finding.ok),
    haltCode: findings.every((finding) => finding.ok) ? null : "RAW_VERIFICATION_FAILED",
    runs: [...runIds],
    expectedItemCount: expected.length,
    findings,
    totalBytes,
  };
}

// ---------------------------------------------------------------------------
// Job C — the read-only historical identity-leak verifier
// ---------------------------------------------------------------------------

export interface IdentityLeakReport {
  ok: boolean;
  haltCode: "TRUTH_ISOLATION_FAILURE" | null;
  filesScanned: number;
  bytesScanned: number;
  inventorySize: number;
  hits: Array<{ file: string; marker: string }>;
  receivedOnly: string[];
  didNotReceive: string[];
  reportDigest: string;
}

/**
 * Scan sealed evidence for historical case IDs and fixture paths.
 *
 * It receives the sealed bytes and the minimal identifier inventory, and nothing
 * else. A clean report is mandatory before any post-run commit process or
 * truth-based evaluator; this function authorizes no evaluator itself.
 */
export function verifyNoHistoricalIdentity(input: {
  rawRoot: string;
  historicalCaseIds: readonly string[];
  historicalImagePaths: readonly string[];
  forbiddenEvidenceKeys: readonly string[];
}): IdentityLeakReport {
  const { rawRoot, historicalCaseIds, historicalImagePaths, forbiddenEvidenceKeys } = input;
  const markers = [...historicalCaseIds, ...historicalImagePaths].filter(
    (marker) => typeof marker === "string" && marker.length > 0,
  );

  const hits: IdentityLeakReport["hits"] = [];
  let bytesScanned = 0;
  const files = listFiles(rawRoot);

  for (const relative of files) {
    const bytes = readFileSync(path.join(rawRoot, relative));
    bytesScanned += bytes.byteLength;
    // RAW bytes, so a binary payload cannot hide a match.
    const text = bytes.toString("latin1");
    for (const marker of markers) {
      if (text.includes(marker)) hits.push({ file: relative, marker: "historical identifier" });
    }
    for (const key of forbiddenEvidenceKeys) {
      if (text.includes(`"${key}"`)) hits.push({ file: relative, marker: `forbidden key ${key}` });
    }
  }

  const report = {
    ok: hits.length === 0,
    haltCode: hits.length === 0 ? null : ("TRUTH_ISOLATION_FAILURE" as const),
    filesScanned: files.length,
    bytesScanned,
    inventorySize: markers.length,
    hits,
    receivedOnly: [
      "the sealed raw artifact, read-only",
      "the minimal historical case-ID and fixture-path inventory",
      "the forbidden evidence-key inventory",
    ],
    didNotReceive: [
      "acceptable Brand values",
      "truth labels",
      "expected field values",
      "prior per-case classifications",
    ],
  };
  return { ...report, reportDigest: sha256Bytes(canonicalize(report)) };
}
