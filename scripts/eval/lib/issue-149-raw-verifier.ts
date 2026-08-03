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

    // 1. the run is COMMITTED — a valid marker binding every run-level digest,
    //    and naming THIS run.
    const committed = verifyRunCommitted(runRoot, { runId });
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

    // 3b. THE REVERSE DIRECTION. Checking every file on disk against the
    //     manifest leaves a manifest free to contain phantom entries pointing at
    //     files that do not exist, or duplicates. Both directions, or neither.
    const onDiskPaths = new Set<string>();
    for (const itemId of items) {
      for (const file of readdirSync(path.join(runRoot, itemId))) {
        onDiskPaths.add(`${itemId}/${file}`);
      }
    }
    const declaredPaths = (manifest?.itemFiles ?? []).map((entry) => entry.path);
    const phantom = declaredPaths.filter((declared) => !onDiskPaths.has(declared));
    const duplicated = declaredPaths.filter(
      (declared, index) => declaredPaths.indexOf(declared) !== index,
    );
    const unlisted = [...onDiskPaths].filter((actual) => !declaredPaths.includes(actual));
    const sortedDeclared = [...declaredPaths].sort();
    const reordered = declaredPaths.some((declared, index) => declared !== sortedDeclared[index]);
    record(
      `${runId}: manifest-covers-exactly-what-is-on-disk`,
      phantom.length === 0 && duplicated.length === 0 && unlisted.length === 0 && !reordered,
      { phantom, duplicated, unlisted, reordered },
    );

    // 3c. the manifest's own declared identity.
    const declaredIdentity = manifest as unknown as { runId?: string; itemCount?: number } | null;
    record(
      `${runId}: manifest-identity-exact`,
      declaredIdentity?.runId === runId && declaredIdentity?.itemCount === expected.length,
      { runId: declaredIdentity?.runId, itemCount: declaredIdentity?.itemCount },
    );

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
    const declaredRunPaths = (manifest?.runFiles ?? []).map((entry) => entry.path);
    const expectedRunPaths = ["counts.json", "determinism-report.json"];
    if (
      declaredRunPaths.length !== expectedRunPaths.length ||
      declaredRunPaths.some((declared, index) => declared !== expectedRunPaths[index])
    ) {
      runFileProblems.push(
        `runFiles ${JSON.stringify(declaredRunPaths)} is not exactly ${JSON.stringify(expectedRunPaths)}`,
      );
    }
    for (const file of expectedRunPaths) {
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

  // 8. Both runs' determinism reports must agree, apart from the writer-owned
  //    runId, and both verdicts must be complete outcomes.
  const reports = runIds.map((runId) => {
    const file = path.join(rawRoot, runId, "determinism-report.json");
    return existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
      : null;
  });
  const withoutRunId = (report: Record<string, unknown> | null): string | null =>
    report === null
      ? null
      : canonicalize(Object.fromEntries(Object.entries(report).filter(([key]) => key !== "runId")));
  record(
    "both-determinism-reports-agree-apart-from-runId",
    reports.every((report) => report !== null) && new Set(reports.map(withoutRunId)).size === 1,
    reports.map((report) => report?.verdict),
  );

  // NOT a forbidden-key finding. Actor 2 does not perform that scan, and
  // recording `ok: true` for a check it did not run was the same defect as a
  // size check standing in for verification. The result is DELEGATED to Job C
  // and is not adjudicated here.
  findings.push({
    check: "forbidden-evidence-key-scan",
    ok: true,
    detail: {
      adjudicatedHere: false,
      delegatedTo: "Job C — verifyNoHistoricalIdentity",
      note: "Actor 2 does not scan for forbidden evidence keys. This entry records the delegation; Job C supplies the actual result and its own halt code.",
    },
  });

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

export class IdentityInventoryError extends Error {
  constructor(
    readonly code:
      | "IDENTITY_INVENTORY_ABSENT"
      | "IDENTITY_INVENTORY_MALFORMED"
      | "IDENTITY_INVENTORY_DIGEST_MISMATCH",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "IdentityInventoryError";
  }
}

const INVENTORY_KEYS = [
  "artifact",
  "experimentId",
  "historicalCaseIds",
  "historicalImagePaths",
  "forbiddenEvidenceKeys",
  "containsNo",
] as const;

/**
 * Load and VERIFY the Job C inventory.
 *
 * The previous CLI turned a missing file into an empty array. Job C would then
 * scan for zero markers and report clean — a load-bearing check that could not
 * fail, and the exact failure mode this project keeps producing. A zero-marker
 * scan is never a successful clean scan.
 */
export function loadIdentityInventory(input: {
  inventoryText: string | null;
  expected: {
    inventorySha256: string;
    historicalCaseIdCount: number;
    historicalImagePathCount: number;
    forbiddenEvidenceKeyCount: number;
  } | null;
}): {
  historicalCaseIds: string[];
  historicalImagePaths: string[];
  forbiddenEvidenceKeys: string[];
} {
  if (input.inventoryText === null) {
    throw new IdentityInventoryError(
      "IDENTITY_INVENTORY_ABSENT",
      "the identity inventory is required when --identity is supplied; an absent file is not an empty inventory",
    );
  }
  if (input.expected === null) {
    throw new IdentityInventoryError(
      "IDENTITY_INVENTORY_ABSENT",
      "the identity inventory manifest is required; without it the inventory's digest and counts cannot be checked",
    );
  }

  const digest = sha256Bytes(input.inventoryText);
  if (digest !== input.expected.inventorySha256) {
    throw new IdentityInventoryError(
      "IDENTITY_INVENTORY_DIGEST_MISMATCH",
      `inventory digest ${digest} does not equal the frozen ${input.expected.inventorySha256}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.inventoryText);
  } catch (cause) {
    throw new IdentityInventoryError(
      "IDENTITY_INVENTORY_MALFORMED",
      cause instanceof Error ? cause.message : String(cause),
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new IdentityInventoryError("IDENTITY_INVENTORY_MALFORMED", "not an object");
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = [...INVENTORY_KEYS].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, i) => key !== expectedKeys[i])) {
    throw new IdentityInventoryError(
      "IDENTITY_INVENTORY_MALFORMED",
      `key set ${JSON.stringify(keys)} is not the closed inventory schema`,
    );
  }

  const list = (value: unknown, name: string): string[] => {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      throw new IdentityInventoryError(
        "IDENTITY_INVENTORY_MALFORMED",
        `${name} is not a string array`,
      );
    }
    const entries = value as string[];
    if (entries.some((entry) => entry.trim().length === 0)) {
      throw new IdentityInventoryError(
        "IDENTITY_INVENTORY_MALFORMED",
        `${name} contains an empty marker`,
      );
    }
    if (new Set(entries).size !== entries.length) {
      throw new IdentityInventoryError(
        "IDENTITY_INVENTORY_MALFORMED",
        `${name} contains a duplicate`,
      );
    }
    return entries;
  };

  const historicalCaseIds = list(record.historicalCaseIds, "historicalCaseIds");
  const historicalImagePaths = list(record.historicalImagePaths, "historicalImagePaths");
  const forbiddenEvidenceKeys = list(record.forbiddenEvidenceKeys, "forbiddenEvidenceKeys");

  const counts: Array<[string, number, number]> = [
    ["historicalCaseIds", historicalCaseIds.length, input.expected.historicalCaseIdCount],
    ["historicalImagePaths", historicalImagePaths.length, input.expected.historicalImagePathCount],
    [
      "forbiddenEvidenceKeys",
      forbiddenEvidenceKeys.length,
      input.expected.forbiddenEvidenceKeyCount,
    ],
  ];
  for (const [name, actual, frozen] of counts) {
    if (actual !== frozen) {
      throw new IdentityInventoryError(
        "IDENTITY_INVENTORY_MALFORMED",
        `${name} has ${actual} entries, frozen count is ${frozen}`,
      );
    }
  }
  if (forbiddenEvidenceKeys.length === 0 || historicalCaseIds.length === 0) {
    throw new IdentityInventoryError(
      "IDENTITY_INVENTORY_MALFORMED",
      "a zero-marker inventory would make a clean scan meaningless",
    );
  }

  return { historicalCaseIds, historicalImagePaths, forbiddenEvidenceKeys };
}

export interface IdentityLeakReport {
  ok: boolean;
  haltCode: "TRUTH_ISOLATION_FAILURE" | null;
  filesScanned: number;
  bytesScanned: number;
  inventorySize: number;
  hits: Array<{ file: string; marker: string; location?: string; reason?: string }>;
  receivedOnly: string[];
  didNotReceive: string[];
  reportDigest: string;
}

type JsonHit = {
  marker: string;
  path: string;
  value: string;
  record: unknown;
};

const parseJsonRecords = (relative: string, text: string): unknown[] | null => {
  try {
    if (relative.endsWith(".jsonl")) {
      return text
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
    }
    if (relative.endsWith(".json")) return [JSON.parse(text)];
  } catch {
    return null;
  }
  return null;
};

const findJsonHits = (
  value: unknown,
  marker: string,
  pathParts: string[] = [],
  record: unknown = value,
): JsonHit[] => {
  if (typeof value === "string") {
    return value.includes(marker) ? [{ marker, path: pathParts.join("."), value, record }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findJsonHits(entry, marker, [...pathParts, `[${index}]`], entry),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) =>
      findJsonHits(entry, marker, [...pathParts, key], value),
    );
  }
  return [];
};

const normalized = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const recordHasSourceText = (record: unknown, marker: string): boolean => {
  if (!record || typeof record !== "object") return false;
  const candidate = record as Record<string, unknown>;
  for (const key of ["rawText", "cleanedValue", "normalizedValue", "value"]) {
    const value = candidate[key];
    if (typeof value === "string" && normalized(value).includes(normalized(marker))) return true;
  }
  return false;
};

const isSourceDerivedHistoricalHit = (relative: string, hit: JsonHit): boolean => {
  const leaf = hit.path.split(".").at(-1);
  if (leaf === "text" && (relative.endsWith(".words.jsonl") || relative.endsWith(".passes.json"))) {
    return true;
  }
  if (
    (leaf === "rawText" || leaf === "cleanedValue") &&
    recordHasSourceText(hit.record, hit.marker)
  ) {
    return true;
  }
  if (
    (leaf === "value" || leaf === "normalizedValue") &&
    recordHasSourceText(hit.record, hit.marker)
  ) {
    return true;
  }
  if (
    hit.path.endsWith(".ranking.comparator.[4].value") &&
    recordHasSourceText(hit.record, hit.marker)
  ) {
    return true;
  }
  return false;
};

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

    const records = parseJsonRecords(relative, text);
    for (const marker of historicalCaseIds) {
      if (!text.includes(marker)) continue;
      if (records === null) {
        hits.push({
          file: relative,
          marker: "historical case ID",
          reason: "non-json-or-binary-field",
        });
        continue;
      }
      for (const record of records) {
        for (const hit of findJsonHits(record, marker)) {
          if (!isSourceDerivedHistoricalHit(relative, hit)) {
            hits.push({
              file: relative,
              marker: "historical case ID",
              location: hit.path,
              reason: "external-identity-field",
            });
          }
        }
      }
    }
    for (const marker of historicalImagePaths) {
      if (text.includes(marker)) {
        hits.push({ file: relative, marker: "historical fixture path" });
      }
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
