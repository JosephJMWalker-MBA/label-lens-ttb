/**
 * Issue #149 — canonical evidence record schema and fingerprint, frozen at
 * Stage 1.
 *
 * Evaluation-only and non-OCR. This is the reference implementation of the
 * algorithm frozen in
 * `artifacts/issue-149-brand-complete-evidence-acquisition/candidate-fingerprint-contract.json`
 * and of the record schema frozen in `candidate-decision-contract.json`.
 * Stage 2's acquisition must use it rather than reimplementing the rules.
 *
 * It lives OUTSIDE `src/fixtures/**` deliberately: the acquisition runner is
 * required to use this helper and is prohibited from importing anything under
 * `src/fixtures/**`. Amendment 3 left it inside fixtures, which made the
 * requirement and the prohibition contradict each other.
 *
 * It imports no production module, no governed truth and no fixture.
 */
import { createHash } from "node:crypto";

export const CANDIDATE_CANONICALIZATION_VERSION = "issue-149-candidate-canonical-v1";

/** Derived fields excluded from the preimage, because including them is circular. */
export const CANDIDATE_FINGERPRINT_EXCLUDED_KEYS = [
  "canonicalRecordSha256",
  "stableCandidateId",
] as const;

export class CandidateCanonicalizationError extends Error {
  constructor(
    readonly code: "UNDEFINED_ARRAY_VALUE" | "NON_FINITE_NUMBER",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "CandidateCanonicalizationError";
  }
}

type Json = unknown;

/**
 * Canonical JSON: keys recursively sorted, array order preserved, undefined
 * object properties omitted, no whitespace. Fails closed on an undefined array
 * value or a non-finite number rather than silently emitting `null`, which is
 * what `JSON.stringify` would do.
 */
export function canonicalize(value: Json, path = "$"): string {
  if (value === null) return "null";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CandidateCanonicalizationError("NON_FINITE_NUMBER", `${path} is ${String(value)}`);
    }
    return JSON.stringify(value);
  }

  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);

  if (Array.isArray(value)) {
    const parts = value.map((entry, index) => {
      if (entry === undefined) {
        throw new CandidateCanonicalizationError(
          "UNDEFINED_ARRAY_VALUE",
          `${path}[${index}] is undefined`,
        );
      }
      return canonicalize(entry, `${path}[${index}]`);
    });
    return `[${parts.join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    const parts = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalize(record[key], `${path}.${key}`)}`,
    );
    return `{${parts.join(",")}}`;
  }

  // `undefined` at the top level, functions, symbols and bigints are not valid
  // evidence values and are rejected rather than coerced.
  throw new CandidateCanonicalizationError(
    "UNDEFINED_ARRAY_VALUE",
    `${path} has unsupported type ${typeof value}`,
  );
}

/**
 * Anything object-shaped may be canonicalized. `CandidateEvidenceRecord` is a
 * closed interface rather than an index-signature type, so it is named here
 * explicitly instead of being widened with `[key: string]: unknown` — widening
 * it would defeat the point of having a schema.
 */
export type CandidateRecordInput = Record<string, unknown> | CandidateEvidenceRecord;

const asRecord = (record: CandidateRecordInput): Record<string, unknown> =>
  record as Record<string, unknown>;

/** The preimage: the record minus exactly the two derived fields. */
export function fingerprintPreimage(input: CandidateRecordInput): Record<string, unknown> {
  const record = asRecord(input);
  const preimage: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if ((CANDIDATE_FINGERPRINT_EXCLUDED_KEYS as readonly string[]).includes(key)) continue;
    preimage[key] = value;
  }
  return preimage;
}

/** Lowercase 64-character SHA-256 over the UTF-8 canonical bytes. */
export function canonicalRecordSha256(record: CandidateRecordInput): string {
  return createHash("sha256")
    .update(Buffer.from(canonicalize(fingerprintPreimage(record)), "utf8"))
    .digest("hex");
}

/**
 * The complete candidate evidence record.
 *
 * Every key here must be an OWN property of the record before either derived
 * identity field is attached. Production optionals that are absent are
 * normalized to explicit `null` by the acquisition, so the canonical preimage
 * has a stable key set and a missing field can never be confused with an
 * absent-and-therefore-omitted one.
 *
 * Amendment 4 introduced this list. Amendment 3 had no complete-record schema at
 * all, so `finalizeCandidateRecord` would happily finalize
 * `{ opaqueItemId, candidateOrdinal }` — a well-formed identity over no
 * evidence.
 */
export const CANDIDATE_EVIDENCE_REQUIRED_KEYS = [
  "activeRejectionReasons",
  "assembly",
  "candidateOrdinal",
  "candidateProvenance",
  "canonicalizationVersion",
  "cleanedValue",
  "completeCandidateArrayLength",
  "confidence",
  "decision",
  "filterChecks",
  "filterReason",
  "kept",
  "lineIndexes",
  "ocrConfidence",
  "ocrEvidenceScore",
  "opaqueItemId",
  "passId",
  "passKind",
  "prominence",
  "rankedPosition",
  "ranking",
  "rankingEligible",
  "rankingScore",
  "rawText",
  "regionName",
  "score",
  "selected",
  "supportPassIds",
] as const;

export type CandidateEvidenceRequiredKey = (typeof CANDIDATE_EVIDENCE_REQUIRED_KEYS)[number];

/** Exactly the required keys, plus the two derived fields once finalized. */
export interface CandidateEvidenceRecord {
  canonicalizationVersion: string;
  opaqueItemId: string;
  candidateOrdinal: number;
  completeCandidateArrayLength: number;
  rawText: string;
  /** `BrandCandidateDiagnostic.cleanedValue` is `string | null` in production. */
  cleanedValue: string | null;
  confidence: number;
  ocrEvidenceScore: number;
  ocrConfidence: Record<string, unknown>;
  prominence: number;
  regionName: string;
  passId: string;
  passKind: string;
  supportPassIds: string[];
  candidateProvenance: Record<string, unknown>;
  assembly: string;
  lineIndexes: number[];
  kept: boolean;
  /** The authoritative production property name. Never renamed. */
  filterReason: string | null;
  decision: string | null;
  score: Record<string, unknown> | null;
  /** The COMPLETE `AnalyzerCandidateRanking` object, not only its score. */
  ranking: Record<string, unknown> | null;
  filterChecks: Array<{ check: string; failed: boolean }>;
  activeRejectionReasons: string[];
  rankingEligible: boolean;
  rankingScore: number | null;
  rankedPosition: number | null;
  selected: boolean;
  canonicalRecordSha256?: string;
  stableCandidateId?: string;
}

export class CandidateRecordError extends Error {
  constructor(
    readonly code:
      | "MISSING_OPAQUE_ITEM_ID"
      | "MALFORMED_OPAQUE_ITEM_ID"
      | "MISSING_CANDIDATE_ORDINAL"
      | "MALFORMED_CANDIDATE_ORDINAL"
      | "MALFORMED_ARRAY_LENGTH"
      | "ORDINAL_OUT_OF_RANGE"
      | "MISSING_REQUIRED_FIELD"
      | "FIELD_TYPE_MISMATCH"
      | "WRONG_CANONICALIZATION_VERSION"
      | "ALREADY_FINALIZED"
      | "MISSING_DIGEST"
      | "MALFORMED_DIGEST"
      | "DIGEST_DOES_NOT_MATCH_RECORD",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "CandidateRecordError";
  }
}

const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const OPAQUE_ITEM_ID = /^item-\d{4}$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

/** Per-key type predicate. Anything not listed is rejected by omission. */
const FIELD_PREDICATES: Record<CandidateEvidenceRequiredKey, (value: unknown) => boolean> = {
  activeRejectionReasons: isStringArray,
  assembly: (v) => typeof v === "string" && v.length > 0,
  candidateOrdinal: (v) => Number.isInteger(v) && (v as number) >= 0,
  candidateProvenance: isPlainObject,
  canonicalizationVersion: (v) => v === CANDIDATE_CANONICALIZATION_VERSION,
  cleanedValue: (v) => v === null || typeof v === "string",
  completeCandidateArrayLength: (v) => Number.isInteger(v) && (v as number) > 0,
  confidence: isFiniteNumber,
  decision: (v) => v === null || typeof v === "string",
  filterChecks: (v) =>
    Array.isArray(v) &&
    v.every(
      (entry) =>
        isPlainObject(entry) &&
        typeof entry.check === "string" &&
        typeof entry.failed === "boolean",
    ),
  filterReason: (v) => v === null || typeof v === "string",
  kept: (v) => typeof v === "boolean",
  lineIndexes: (v) => Array.isArray(v) && v.every((entry) => Number.isInteger(entry)),
  ocrConfidence: isPlainObject,
  ocrEvidenceScore: isFiniteNumber,
  opaqueItemId: (v) => typeof v === "string" && OPAQUE_ITEM_ID.test(v),
  passId: (v) => typeof v === "string" && v.length > 0,
  passKind: (v) => typeof v === "string" && v.length > 0,
  prominence: isFiniteNumber,
  rankedPosition: (v) => v === null || (Number.isInteger(v) && (v as number) >= 0),
  ranking: (v) => v === null || isPlainObject(v),
  rankingEligible: (v) => typeof v === "boolean",
  rankingScore: (v) => v === null || isFiniteNumber(v),
  rawText: (v) => typeof v === "string",
  regionName: (v) => typeof v === "string" && v.length > 0,
  score: (v) => v === null || isPlainObject(v),
  selected: (v) => typeof v === "boolean",
  supportPassIds: isStringArray,
};

/**
 * Validate a candidate evidence record against the frozen schema. Throws on the
 * first violation; returns nothing on success.
 */
export function assertCompleteCandidateEvidenceRecord(input: CandidateRecordInput): void {
  const record = asRecord(input);
  for (const key of CANDIDATE_FINGERPRINT_EXCLUDED_KEYS) {
    if (Object.hasOwn(record, key)) {
      throw new CandidateRecordError(
        "ALREADY_FINALIZED",
        `${key} is already present; finalization runs exactly once per record`,
      );
    }
  }

  for (const key of CANDIDATE_EVIDENCE_REQUIRED_KEYS) {
    if (!Object.hasOwn(record, key)) {
      throw new CandidateRecordError(
        "MISSING_REQUIRED_FIELD",
        `${key} is not an own property; absent production optionals are normalized to null, never omitted`,
      );
    }
  }

  const id = record.opaqueItemId;
  if (typeof id !== "string" || id.length === 0) {
    throw new CandidateRecordError("MISSING_OPAQUE_ITEM_ID", "opaqueItemId must be a string");
  }
  if (!OPAQUE_ITEM_ID.test(id)) {
    throw new CandidateRecordError(
      "MALFORMED_OPAQUE_ITEM_ID",
      `opaqueItemId must match ^item-\\d{4}$, received ${JSON.stringify(id)}`,
    );
  }

  const ordinal = record.candidateOrdinal;
  if (!Number.isInteger(ordinal) || (ordinal as number) < 0) {
    throw new CandidateRecordError(
      "MALFORMED_CANDIDATE_ORDINAL",
      `candidateOrdinal must be a non-negative integer, received ${JSON.stringify(ordinal)}`,
    );
  }

  const length = record.completeCandidateArrayLength;
  if (!Number.isInteger(length) || (length as number) <= 0) {
    throw new CandidateRecordError(
      "MALFORMED_ARRAY_LENGTH",
      `completeCandidateArrayLength must be a positive integer, received ${JSON.stringify(length)}`,
    );
  }

  if ((ordinal as number) >= (length as number)) {
    throw new CandidateRecordError(
      "ORDINAL_OUT_OF_RANGE",
      `candidateOrdinal ${ordinal} is not below completeCandidateArrayLength ${length}`,
    );
  }

  if (record.canonicalizationVersion !== CANDIDATE_CANONICALIZATION_VERSION) {
    throw new CandidateRecordError(
      "WRONG_CANONICALIZATION_VERSION",
      `expected ${CANDIDATE_CANONICALIZATION_VERSION}, received ${JSON.stringify(record.canonicalizationVersion)}`,
    );
  }

  for (const key of CANDIDATE_EVIDENCE_REQUIRED_KEYS) {
    if (!FIELD_PREDICATES[key](record[key])) {
      throw new CandidateRecordError(
        "FIELD_TYPE_MISMATCH",
        `${key} does not satisfy the frozen schema, received ${JSON.stringify(record[key])}`,
      );
    }
  }
}

/**
 * Build the stable id. Fails closed.
 *
 * The digest is REQUIRED and is re-derived from the complete record before the
 * id is returned, so a partial object cannot yield a valid-looking id. An
 * earlier revision made the digest optional and computed it from whatever it was
 * given, which meant `{ opaqueItemId, candidateOrdinal }` alone produced a
 * plausible 64-hex id that was never derived from the evidence.
 */
export function stableCandidateId(input: CandidateRecordInput): string {
  const record = asRecord(input);
  const opaqueItemId = record.opaqueItemId;
  const candidateOrdinal = record.candidateOrdinal;
  const digest = record.canonicalRecordSha256;

  if (typeof opaqueItemId !== "string" || opaqueItemId.length === 0) {
    throw new CandidateRecordError(
      "MISSING_OPAQUE_ITEM_ID",
      "opaqueItemId must be a non-empty string",
    );
  }
  if (!OPAQUE_ITEM_ID.test(opaqueItemId)) {
    throw new CandidateRecordError(
      "MALFORMED_OPAQUE_ITEM_ID",
      `opaqueItemId must match ^item-\\d{4}$, received ${JSON.stringify(opaqueItemId)}`,
    );
  }
  if (typeof candidateOrdinal !== "number" || !Number.isInteger(candidateOrdinal)) {
    throw new CandidateRecordError(
      "MISSING_CANDIDATE_ORDINAL",
      "candidateOrdinal must be an integer",
    );
  }
  if (digest === undefined || digest === null) {
    throw new CandidateRecordError(
      "MISSING_DIGEST",
      "canonicalRecordSha256 is required; a stable id may not be built from identity fields alone",
    );
  }
  if (typeof digest !== "string" || !LOWER_HEX_64.test(digest)) {
    throw new CandidateRecordError(
      "MALFORMED_DIGEST",
      `canonicalRecordSha256 must be lowercase 64-hex, received ${JSON.stringify(digest)}`,
    );
  }
  const recomputed = canonicalRecordSha256(record);
  if (recomputed !== digest) {
    throw new CandidateRecordError(
      "DIGEST_DOES_NOT_MATCH_RECORD",
      `supplied ${digest} but the complete record canonicalizes to ${recomputed}`,
    );
  }
  return `${opaqueItemId}:${candidateOrdinal}:${digest}`;
}

/**
 * The only sanctioned way to produce a persisted candidate record.
 *
 * Validates the COMPLETE schema first, then computes the digest, attaches it,
 * verifies it, and attaches the stable id. There is no path here that produces
 * an id from identity fields alone, and no path that finalizes a record missing
 * any required evidence field.
 */
export function finalizeCandidateRecord(
  completeEvidenceRecord: CandidateRecordInput,
): CandidateEvidenceRecord {
  assertCompleteCandidateEvidenceRecord(completeEvidenceRecord);

  const digest = canonicalRecordSha256(completeEvidenceRecord);
  const withDigest = { ...asRecord(completeEvidenceRecord), canonicalRecordSha256: digest };

  const verified = canonicalRecordSha256(withDigest);
  if (verified !== digest) {
    throw new CandidateRecordError(
      "DIGEST_DOES_NOT_MATCH_RECORD",
      `attaching the digest changed the preimage: ${digest} became ${verified}`,
    );
  }

  return {
    ...withDigest,
    stableCandidateId: stableCandidateId(withDigest),
  } as unknown as CandidateEvidenceRecord;
}

/**
 * Pass-record keys excluded from every SEMANTIC fingerprint.
 *
 * `timings` are wall-clock measurements from `performance.now()` and differ
 * between any two runs by construction. Amendment 3 required a fingerprint over
 * the complete pass record INCLUDING timings and then required exact agreement
 * between the primary and repeat runs, which guaranteed a nondeterminism verdict
 * on every possible run. Timings stay persisted and stay covered by the artifact
 * integrity hashes; they are simply not part of semantic equality.
 */
export const SEMANTIC_PASS_EXCLUDED_KEYS = ["timings"] as const;

/** The complete pass record minus exactly the excluded telemetry keys. */
export function semanticPassPreimage(pass: CandidateRecordInput): Record<string, unknown> {
  const record = asRecord(pass);
  const preimage: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if ((SEMANTIC_PASS_EXCLUDED_KEYS as readonly string[]).includes(key)) continue;
    preimage[key] = value;
  }
  return preimage;
}

/**
 * Semantic fingerprint of one `RegionOcrResult`: every field except `timings`,
 * with all array order preserved.
 */
export function semanticPassFingerprint(pass: CandidateRecordInput): string {
  return createHash("sha256")
    .update(Buffer.from(canonicalize(semanticPassPreimage(pass)), "utf8"))
    .digest("hex");
}

/**
 * Semantic fingerprint of the COMPLETE ORDERED pass array. Pass order is part of
 * the hash: production selects over the array in order, so a reordered replay is
 * a different experiment.
 */
export function semanticOrderedPassArrayFingerprint(passes: CandidateRecordInput[]): string {
  return createHash("sha256")
    .update(Buffer.from(canonicalize(passes.map(semanticPassPreimage)), "utf8"))
    .digest("hex");
}

/**
 * Full artifact integrity digest: every persisted byte, including timings and
 * run metadata. This proves immutability of what was written. It is NOT expected
 * to match between the primary and repeat runs.
 */
export function fullRecordIntegritySha256(record: CandidateRecordInput): string {
  return createHash("sha256")
    .update(Buffer.from(canonicalize(asRecord(record)), "utf8"))
    .digest("hex");
}
