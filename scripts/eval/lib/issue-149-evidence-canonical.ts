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

// ---------------------------------------------------------------------------
// Frozen incumbent vocabularies
//
// Copied as literals so this module imports nothing. `issue-149-frozen-vocabulary
// .test.ts` asserts each list is identical to the production constant it mirrors,
// so a drift is a test failure rather than a silent divergence.
// ---------------------------------------------------------------------------

export const OCR_PASS_KINDS = [
  "full-image-primary",
  "full-image-rot180",
  "left-edge-strip-rot270",
  "right-edge-strip-rot90",
  "focus-crop",
  "focus-edge-strip-rot270",
  "focus-edge-strip-rot90",
  "seller-region",
] as const;

export const OCR_PASS_TRIGGER_REASONS = [
  "primary-pass",
  "brand-not-observed",
  "alcohol-not-observed",
  "low-text-density",
  "edge-text-heuristic",
  "focus-crop-distinct",
  "orientation-fallback",
  "seller-region-target",
] as const;

export const ROTATION_DEGREES = [0, 90, 180, 270] as const;

export const BRAND_FILTER_CHECK_ORDER = [
  "producer-line",
  "no-letters-or-too-short",
  "non-brand-keyword",
  "too-many-words",
  "domain-like",
  "varietal-or-designation",
  "generic-product-language",
  "location-or-appellation",
  "low-information-fragment",
  "sentence-fragment",
] as const;

/** The two reasons a KEPT candidate carries; every other value marks a rejection. */
export const BRAND_KEPT_REASONS = ["candidate-positive", "candidate-plausible"] as const;

export const BRAND_LINE_REASONS = [...BRAND_FILTER_CHECK_ORDER, ...BRAND_KEPT_REASONS] as const;

export const BRAND_CANDIDATE_ASSEMBLIES = [
  "whole-line",
  "line-window",
  "multi-line-merge",
] as const;

export const BRAND_CANDIDATE_DECISIONS = ["selected", "alternate", "ambiguous-rival"] as const;

export const ANALYZER_CANDIDATE_RANKING_STRATEGIES = [
  "alcohol-ocr-evidence-comparator",
  "brand-mixed-prominence-score",
] as const;

export const ANALYZER_CANDIDATE_RANKING_MODES = [
  "ocr-evidence-first",
  "score-first",
  "prominence-first",
] as const;

export const ANALYZER_RANKING_COMPARATOR_IDS = [
  "score-eligibility",
  "ranking-score",
  "prominence",
  "ocr-evidence-score",
  "normalized-value-key",
] as const;

export const ANALYZER_RANKING_DIRECTIONS = ["asc", "desc"] as const;

export const ANALYZER_RANKING_SCORE_FACTOR_IDS = [
  "positive-signal",
  "meaningful-chars",
  "structure",
  "ocr-evidence-score",
  "prominence",
  "area",
  "centrality",
  "alignment",
  "line-proximity",
  "low-information-penalty",
  "residual-penalty",
] as const;

export const ANALYZER_RANKING_SCORE_FACTOR_DIRECTIONS = ["benefit", "penalty"] as const;

export const BRAND_CANDIDATE_SCORE_KEYS = [
  "positiveSignal",
  "meaningfulChars",
  "structure",
  "ocrEvidenceScore",
  "prominence",
  "area",
  "centrality",
  "alignment",
  "lineProximity",
  "lowInformationPenalty",
  "residualPenalty",
  "total",
] as const;

/**
 * All SEVEN fields of `AnalyzerOcrConfidence`.
 *
 * Amendment 5 listed six and omitted `missingTokenCount`, which `ocrConfidenceOf`
 * emits on every candidate. The closed schema therefore rejected every REAL
 * production candidate as carrying an unexpected key, while the synthetic tests
 * and a hard-coded "drift guard" both repeated the same wrong list, so CI stayed
 * green and Stage 2 would have failed on its first case. That is precisely what a
 * synthetic-only schema test cannot catch, which is why
 * `issue-149-production-candidate-compatibility.test.ts` now drives the real
 * selector.
 */
export const ANALYZER_OCR_CONFIDENCE_KEYS = [
  "aggregation",
  "rawScale",
  "rawTokenConfidences",
  "rawMean",
  "rawMin",
  "rawMax",
  "missingTokenCount",
] as const;

export const ANALYZER_CANDIDATE_PROVENANCE_KEYS = [
  "passId",
  "passKind",
  "triggerReasons",
  "preprocessing",
  "regionName",
  "supportingPassIds",
  "supportingPassKinds",
  "recoveryPassUsed",
] as const;

export const EVIDENCE_GEOMETRY_KEYS = [
  "imageIndex",
  "x",
  "y",
  "width",
  "height",
  "imageWidth",
  "imageHeight",
] as const;

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const OPAQUE_ITEM_ID = /^item-\d{4}$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isInteger = (value: unknown): value is number => Number.isInteger(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;
const oneOf = (allowed: readonly unknown[], value: unknown): boolean => allowed.includes(value);
const isArrayOf = (value: unknown, predicate: (entry: unknown) => boolean): boolean =>
  Array.isArray(value) && value.every(predicate);

/** Own-key set equality. This is what makes a schema CLOSED rather than minimal. */
function exactKeys(record: Record<string, unknown>, required: readonly string[]): string[] {
  const actual = Object.keys(record);
  const missing = required.filter((key) => !Object.hasOwn(record, key));
  const unexpected = actual.filter((key) => !required.includes(key));
  return [
    ...missing.map((key) => `missing ${key}`),
    ...unexpected.map((key) => `unexpected ${key}`),
  ];
}

/** Validate a nested object against an exact key set plus per-key predicates. */
function exactShape(
  value: unknown,
  keys: readonly string[],
  predicates: Record<string, (entry: unknown) => boolean>,
): string | null {
  if (!isPlainObject(value)) return "is not a plain object";
  const problems = exactKeys(value, keys);
  if (problems.length > 0) return problems.join("; ");
  for (const key of keys) {
    if (!predicates[key](value[key])) {
      return `${key} is invalid: ${JSON.stringify(value[key])}`;
    }
  }
  return null;
}

const GEOMETRY_PREDICATES: Record<string, (v: unknown) => boolean> = Object.fromEntries(
  EVIDENCE_GEOMETRY_KEYS.map((key) => [key, isFiniteNumber]),
);

const isEvidenceGeometry = (value: unknown): boolean =>
  exactShape(value, EVIDENCE_GEOMETRY_KEYS, GEOMETRY_PREDICATES) === null;

const isBbox = (value: unknown): boolean =>
  exactShape(value, ["x0", "y0", "x1", "y1"], {
    x0: isFiniteNumber,
    y0: isFiniteNumber,
    x1: isFiniteNumber,
    y1: isFiniteNumber,
  }) === null;

/**
 * Shape plus the arithmetic that `ocrConfidenceOf` guarantees. Checking the shape
 * alone would accept an aggregate that contradicts its own token list.
 */
function ocrConfidenceProblem(value: unknown): string | null {
  const shape = exactShape(value, ANALYZER_OCR_CONFIDENCE_KEYS, {
    aggregation: (v) => v === "mean",
    rawScale: (v) => v === "0-100",
    rawTokenConfidences: (v) => isArrayOf(v, (e) => e === null || isFiniteNumber(e)),
    rawMean: (v) => v === null || isFiniteNumber(v),
    rawMin: (v) => v === null || isFiniteNumber(v),
    rawMax: (v) => v === null || isFiniteNumber(v),
    missingTokenCount: (v) => isInteger(v) && (v as number) >= 0,
  });
  if (shape !== null) return shape;

  const confidence = value as {
    rawTokenConfidences: Array<number | null>;
    rawMean: number | null;
    rawMin: number | null;
    rawMax: number | null;
    missingTokenCount: number;
  };
  const observed = confidence.rawTokenConfidences.filter(
    (entry): entry is number => entry !== null,
  );
  const missing = confidence.rawTokenConfidences.length - observed.length;

  if (confidence.missingTokenCount !== missing) {
    return `missingTokenCount is ${confidence.missingTokenCount} but rawTokenConfidences holds ${missing} null entries`;
  }
  if (observed.length === 0) {
    if (confidence.rawMean !== null || confidence.rawMin !== null || confidence.rawMax !== null) {
      return "no token confidence is present, so rawMean, rawMin and rawMax must all be null";
    }
    return null;
  }
  const mean = observed.reduce((sum, entry) => sum + entry, 0) / observed.length;
  if (confidence.rawMean === null || !nearlyEqual(confidence.rawMean, mean)) {
    return `rawMean is ${JSON.stringify(confidence.rawMean)} but the observed tokens average ${mean}`;
  }
  if (confidence.rawMin !== Math.min(...observed)) {
    return `rawMin is ${JSON.stringify(confidence.rawMin)} but the observed minimum is ${Math.min(...observed)}`;
  }
  if (confidence.rawMax !== Math.max(...observed)) {
    return `rawMax is ${JSON.stringify(confidence.rawMax)} but the observed maximum is ${Math.max(...observed)}`;
  }
  return null;
}

/** Floating-point means are compared with a tolerance, never with `===`. */
const nearlyEqual = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

const isOcrConfidence = (value: unknown): boolean => ocrConfidenceProblem(value) === null;

const isCandidateProvenance = (value: unknown): boolean =>
  exactShape(value, ANALYZER_CANDIDATE_PROVENANCE_KEYS, {
    passId: isNonEmptyString,
    passKind: (v) => oneOf(OCR_PASS_KINDS, v),
    triggerReasons: (v) => isArrayOf(v, (e) => oneOf(OCR_PASS_TRIGGER_REASONS, e)),
    preprocessing: (v) => isArrayOf(v, isNonEmptyString),
    regionName: isNonEmptyString,
    supportingPassIds: (v) => isArrayOf(v, isNonEmptyString),
    supportingPassKinds: (v) => isArrayOf(v, (e) => oneOf(OCR_PASS_KINDS, e)),
    recoveryPassUsed: (v) => typeof v === "boolean",
  }) === null;

const isCandidateScore = (value: unknown): boolean =>
  exactShape(
    value,
    BRAND_CANDIDATE_SCORE_KEYS,
    Object.fromEntries(BRAND_CANDIDATE_SCORE_KEYS.map((key) => [key, isFiniteNumber])),
  ) === null;

const isComparatorEntry = (value: unknown): boolean =>
  exactShape(value, ["id", "direction", "value"], {
    id: (v) => oneOf(ANALYZER_RANKING_COMPARATOR_IDS, v),
    direction: (v) => oneOf(ANALYZER_RANKING_DIRECTIONS, v),
    value: (v) => isFiniteNumber(v) || typeof v === "string" || typeof v === "boolean",
  }) === null;

const isScoreFactor = (value: unknown): boolean =>
  exactShape(value, ["id", "value", "contribution", "direction"], {
    id: (v) => oneOf(ANALYZER_RANKING_SCORE_FACTOR_IDS, v),
    value: isFiniteNumber,
    contribution: isFiniteNumber,
    direction: (v) => oneOf(ANALYZER_RANKING_SCORE_FACTOR_DIRECTIONS, v),
  }) === null;

/**
 * `AnalyzerCandidateRanking` has two optional properties. The persisted record
 * normalizes them to explicit null so the canonical key set is stable, which is
 * why the closed shape lists all five keys.
 */
const isCandidateRanking = (value: unknown): boolean =>
  exactShape(value, ["strategy", "orderingMode", "comparator", "rankingScore", "scoreFactors"], {
    strategy: (v) => oneOf(ANALYZER_CANDIDATE_RANKING_STRATEGIES, v),
    orderingMode: (v) => oneOf(ANALYZER_CANDIDATE_RANKING_MODES, v),
    comparator: (v) => isArrayOf(v, isComparatorEntry),
    rankingScore: (v) => v === null || isFiniteNumber(v),
    scoreFactors: (v) => v === null || isArrayOf(v, isScoreFactor),
  }) === null;

// ---------------------------------------------------------------------------
// Exact byte integrity versus canonical semantic digests
// ---------------------------------------------------------------------------

/**
 * SHA-256 over the EXACT bytes supplied. This is the only artifact-integrity
 * primitive: raw evidence files and their manifests are hashed with it, so a
 * changed byte — including whitespace or a terminal newline — changes the value.
 *
 * Amendment 4 exported `fullRecordIntegritySha256`, which canonicalized an object
 * first and therefore did NOT hash the persisted bytes, while the determinism
 * contract defined artifact integrity as SHA-256 over file bytes. That name is
 * removed rather than reinterpreted.
 */
export function sha256Bytes(bytes: Uint8Array | Buffer | string): string {
  const buffer = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Canonical digest of an in-memory object. Useful for comparing two parsed
 * structures irrespective of formatting.
 *
 * **This is not a raw-file integrity proof.** It cannot see whitespace, key order
 * or a terminal newline, because canonicalization deliberately erases them. Use
 * `sha256Bytes` for anything that claims a file is unaltered.
 */
export function canonicalRecordDigest(record: CandidateRecordInput): string {
  return createHash("sha256")
    .update(Buffer.from(canonicalize(asRecord(record)), "utf8"))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// The persisted RegionOcrResult record — an exact, closed schema
// ---------------------------------------------------------------------------

/** Exactly the thirteen own properties of `RegionOcrResult`. Nothing else. */
export const REGION_OCR_RESULT_KEYS = [
  "passId",
  "regionName",
  "passKind",
  "triggerReasons",
  "preprocessing",
  "fieldEligibility",
  "transform",
  "transformedSize",
  "pageSegMode",
  "rawWordCount",
  "discardedWordCount",
  "timings",
  "words",
] as const;

export type RegionOcrResultKey = (typeof REGION_OCR_RESULT_KEYS)[number];

export class PassRecordError extends Error {
  constructor(
    readonly code:
      | "PASS_RECORD_NOT_AN_OBJECT"
      | "PASS_RECORD_KEY_SET_MISMATCH"
      | "PASS_RECORD_FIELD_INVALID"
      | "PASS_WORD_INVALID"
      | "PASS_WORD_ORIGINAL_GEOMETRY_NULL"
      | "PASS_ARRAY_INVALID",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "PassRecordError";
  }
}

/**
 * One `OcrWord`. `originalGeometry` is OPTIONAL in production, and the faithful
 * JSON representation of an absent optional is OMISSION, not `null`.
 *
 * Amendment 4's raw contract said absent `originalGeometry` was persisted as
 * `null`. That is not an exact `RegionOcrResult`: a replay reading `null` would
 * see a present-but-empty property where production had no property at all, and
 * `mapBoxToOriginalGeometry` returning nothing is precisely the signal that the
 * token was never mapped back to the original frame.
 */
function validateWord(word: unknown, at: string): void {
  if (!isPlainObject(word)) {
    throw new PassRecordError("PASS_WORD_INVALID", `${at} is not a plain object`);
  }
  if (Object.hasOwn(word, "originalGeometry") && word.originalGeometry === null) {
    throw new PassRecordError(
      "PASS_WORD_ORIGINAL_GEOMETRY_NULL",
      `${at}.originalGeometry is null; an absent optional is OMITTED, never normalized to null`,
    );
  }
  const keys: string[] = ["text", "rawConfidence", "bbox"];
  if (Object.hasOwn(word, "originalGeometry")) keys.push("originalGeometry");
  const problem = exactShape(word, keys, {
    text: (v) => typeof v === "string",
    rawConfidence: isFiniteNumber,
    bbox: isBbox,
    originalGeometry: isEvidenceGeometry,
  });
  if (problem !== null) throw new PassRecordError("PASS_WORD_INVALID", `${at} ${problem}`);
}

const PASS_FIELD_PREDICATES: Record<RegionOcrResultKey, (value: unknown) => boolean> = {
  passId: isNonEmptyString,
  regionName: isNonEmptyString,
  passKind: (v) => oneOf(OCR_PASS_KINDS, v),
  triggerReasons: (v) => isArrayOf(v, (e) => oneOf(OCR_PASS_TRIGGER_REASONS, e)),
  preprocessing: (v) => isArrayOf(v, isNonEmptyString),
  fieldEligibility: (v) =>
    exactShape(v, ["brand", "alcohol"], {
      brand: (e) => typeof e === "boolean",
      alcohol: (e) => typeof e === "boolean",
    }) === null,
  transform: (v) =>
    exactShape(v, ["crop", "rotate", "scale", "originalWidth", "originalHeight"], {
      crop: (e) =>
        exactShape(e, ["left", "top", "width", "height"], {
          left: isFiniteNumber,
          top: isFiniteNumber,
          width: isFiniteNumber,
          height: isFiniteNumber,
        }) === null,
      rotate: (e) => oneOf(ROTATION_DEGREES, e),
      scale: isFiniteNumber,
      originalWidth: isFiniteNumber,
      originalHeight: isFiniteNumber,
    }) === null,
  transformedSize: (v) =>
    exactShape(v, ["width", "height"], { width: isFiniteNumber, height: isFiniteNumber }) === null,
  pageSegMode: isInteger,
  rawWordCount: (v) => isInteger(v) && (v as number) >= 0,
  discardedWordCount: (v) => isInteger(v) && (v as number) >= 0,
  timings: (v) =>
    exactShape(v, ["preprocessMs", "ocrMs", "inverseMappingMs", "totalMs"], {
      preprocessMs: isFiniteNumber,
      ocrMs: isFiniteNumber,
      inverseMappingMs: isFiniteNumber,
      totalMs: isFiniteNumber,
    }) === null,
  words: (v) => Array.isArray(v),
};

/**
 * Validate one persisted pass record against the exact `RegionOcrResult` shape.
 *
 * The key set must MATCH — a missing field and an extra field are equally fatal.
 * Run metadata (workflow run id, artifact id, runner identity, wall clock) is an
 * extra field here and is rejected: it lives beside the evidence, never on it.
 */
export function assertRegionOcrResultRecord(pass: unknown, at = "pass"): void {
  if (!isPlainObject(pass)) {
    throw new PassRecordError("PASS_RECORD_NOT_AN_OBJECT", `${at} is not a plain object`);
  }
  const problems = exactKeys(pass, REGION_OCR_RESULT_KEYS);
  if (problems.length > 0) {
    throw new PassRecordError("PASS_RECORD_KEY_SET_MISMATCH", `${at}: ${problems.join("; ")}`);
  }
  for (const key of REGION_OCR_RESULT_KEYS) {
    if (!PASS_FIELD_PREDICATES[key](pass[key])) {
      throw new PassRecordError(
        "PASS_RECORD_FIELD_INVALID",
        `${at}.${key} is invalid: ${JSON.stringify(pass[key])}`,
      );
    }
  }
  (pass.words as unknown[]).forEach((word, index) => validateWord(word, `${at}.words[${index}]`));
}

/** Pass-record keys excluded from every SEMANTIC fingerprint. */
export const SEMANTIC_PASS_EXCLUDED_KEYS = ["timings"] as const;

/**
 * The complete validated pass record minus exactly `timings`.
 *
 * `timings` come from `performance.now()` and differ between any two runs by
 * construction. Amendment 3 fingerprinted the record INCLUDING them and then
 * demanded exact agreement between runs, which guaranteed a nondeterminism
 * verdict on every possible run.
 */
export function semanticPassPreimage(pass: unknown, at = "pass"): Record<string, unknown> {
  assertRegionOcrResultRecord(pass, at);
  const record = pass as Record<string, unknown>;
  const preimage: Record<string, unknown> = {};
  for (const key of REGION_OCR_RESULT_KEYS) {
    if ((SEMANTIC_PASS_EXCLUDED_KEYS as readonly string[]).includes(key)) continue;
    preimage[key] = record[key];
  }
  return preimage;
}

/** Semantic fingerprint of one validated `RegionOcrResult`. */
export function semanticPassFingerprint(pass: unknown, at = "pass"): string {
  return createHash("sha256")
    .update(Buffer.from(canonicalize(semanticPassPreimage(pass, at)), "utf8"))
    .digest("hex");
}

/**
 * Fingerprint over the ORDERED WORD RECORDS ONLY.
 *
 * Distinct from the semantic pass fingerprint, which covers every
 * `RegionOcrResult` field except `timings`. This one covers words alone, so it
 * changes when text, order or geometry changes and does NOT change when a
 * non-word pass field does. `raw-ocr-contract.json` names both; two different
 * digests must not share a name that suggests either could stand for the other.
 */
export function orderedWordsOnlyFingerprint(pass: unknown, at = "pass"): string {
  assertRegionOcrResultRecord(pass, at);
  return createHash("sha256")
    .update(Buffer.from(canonicalize((pass as Record<string, unknown>).words), "utf8"))
    .digest("hex");
}

/**
 * Semantic fingerprint of the COMPLETE ORDERED pass array. Order is part of the
 * hash: production selects over the array in order, so a reordered replay is a
 * different experiment.
 */
export function semanticOrderedPassArrayFingerprint(passes: unknown): string {
  if (!Array.isArray(passes)) {
    throw new PassRecordError("PASS_ARRAY_INVALID", "the pass array is not an array");
  }
  const preimages = passes.map((pass, index) => semanticPassPreimage(pass, `passes[${index}]`));
  return createHash("sha256")
    .update(Buffer.from(canonicalize(preimages), "utf8"))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// The persisted candidate evidence record — an exact, closed schema
// ---------------------------------------------------------------------------

/**
 * Exactly the own properties a candidate record carries BEFORE finalization.
 *
 * The set is CLOSED: a missing key and an unexpected key are equally fatal. An
 * open set would let an undeclared acquisition, truth, debug or convenience
 * property enter the fingerprint silently, so the digest would cover something
 * the contract never described.
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

/** The own-key set AFTER finalization: the required keys plus the two derived. */
export const CANDIDATE_FINALIZED_KEYS = [
  ...CANDIDATE_EVIDENCE_REQUIRED_KEYS,
  ...CANDIDATE_FINGERPRINT_EXCLUDED_KEYS,
] as const;

export interface CandidateEvidenceRecord {
  canonicalizationVersion: string;
  opaqueItemId: string;
  candidateOrdinal: number;
  completeCandidateArrayLength: number;
  rawText: string;
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
  /** The authoritative production property name, never null. */
  filterReason: string;
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
      | "UNEXPECTED_FIELD"
      | "FIELD_TYPE_MISMATCH"
      | "FILTER_LADDER_INVARIANT_VIOLATED"
      | "DERIVED_FIELD_INCONSISTENT"
      | "RANKED_MEMBERSHIP_INCONSISTENT"
      | "KEPT_CANDIDATE_EVIDENCE_INCOMPLETE"
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

const CANDIDATE_FIELD_PREDICATES: Record<
  CandidateEvidenceRequiredKey,
  (value: unknown) => boolean
> = {
  activeRejectionReasons: (v) => isArrayOf(v, (e) => oneOf(BRAND_FILTER_CHECK_ORDER, e)),
  assembly: (v) => oneOf(BRAND_CANDIDATE_ASSEMBLIES, v),
  candidateOrdinal: (v) => isInteger(v) && (v as number) >= 0,
  candidateProvenance: isCandidateProvenance,
  canonicalizationVersion: (v) => v === CANDIDATE_CANONICALIZATION_VERSION,
  cleanedValue: (v) => v === null || typeof v === "string",
  completeCandidateArrayLength: (v) => isInteger(v) && (v as number) > 0,
  confidence: isFiniteNumber,
  decision: (v) => v === null || oneOf(BRAND_CANDIDATE_DECISIONS, v),
  filterChecks: (v) =>
    isArrayOf(
      v,
      (e) =>
        exactShape(e, ["check", "failed"], {
          check: (c) => oneOf(BRAND_FILTER_CHECK_ORDER, c),
          failed: (f) => typeof f === "boolean",
        }) === null,
    ),
  filterReason: (v) => oneOf(BRAND_LINE_REASONS, v),
  kept: (v) => typeof v === "boolean",
  lineIndexes: (v) => isArrayOf(v, (e) => isInteger(e) && (e as number) >= 0),
  ocrConfidence: isOcrConfidence,
  ocrEvidenceScore: isFiniteNumber,
  opaqueItemId: (v) => typeof v === "string" && OPAQUE_ITEM_ID.test(v),
  passId: isNonEmptyString,
  passKind: (v) => oneOf(OCR_PASS_KINDS, v),
  prominence: isFiniteNumber,
  rankedPosition: (v) => v === null || (isInteger(v) && (v as number) >= 0),
  ranking: (v) => v === null || isCandidateRanking(v),
  rankingEligible: (v) => typeof v === "boolean",
  rankingScore: (v) => v === null || isFiniteNumber(v),
  rawText: (v) => typeof v === "string",
  regionName: isNonEmptyString,
  score: (v) => v === null || isCandidateScore(v),
  selected: (v) => typeof v === "boolean",
  supportPassIds: (v) => isArrayOf(v, isNonEmptyString),
};

/**
 * Cross-field invariants, mirroring `assertBrandFilterDiagnosticInvariants` in
 * production plus the acquisition's own derived-field rules. These are what stop
 * an individually well-typed record from being internally incoherent.
 */
function assertCandidateInvariants(record: Record<string, unknown>): void {
  const checks = record.filterChecks as Array<{ check: string; failed: boolean }>;

  if (checks.length !== BRAND_FILTER_CHECK_ORDER.length) {
    throw new CandidateRecordError(
      "FILTER_LADDER_INVARIANT_VIOLATED",
      `filterChecks has ${checks.length} entries, expected all ${BRAND_FILTER_CHECK_ORDER.length} ladder rules`,
    );
  }
  checks.forEach((entry, index) => {
    if (entry.check !== BRAND_FILTER_CHECK_ORDER[index]) {
      throw new CandidateRecordError(
        "FILTER_LADDER_INVARIANT_VIOLATED",
        `filterChecks[${index}] is ${entry.check}, expected ${BRAND_FILTER_CHECK_ORDER[index]}`,
      );
    }
  });

  const failedInOrder = checks.filter((entry) => entry.failed).map((entry) => entry.check);
  const active = record.activeRejectionReasons as string[];
  if (
    active.length !== failedInOrder.length ||
    active.some((reason, index) => reason !== failedInOrder[index])
  ) {
    throw new CandidateRecordError(
      "FILTER_LADDER_INVARIANT_VIOLATED",
      `activeRejectionReasons ${JSON.stringify(active)} does not equal the failed checks in ladder order ${JSON.stringify(failedInOrder)}`,
    );
  }

  if (record.kept === true) {
    if (active.length !== 0) {
      throw new CandidateRecordError(
        "FILTER_LADDER_INVARIANT_VIOLATED",
        `kept candidate has ${active.length} active rejection reason(s), expected 0`,
      );
    }
    if (checks.some((entry) => entry.failed)) {
      throw new CandidateRecordError(
        "FILTER_LADDER_INVARIANT_VIOLATED",
        "kept candidate has at least one failed filter check, expected none",
      );
    }
    if (!oneOf(BRAND_KEPT_REASONS, record.filterReason)) {
      throw new CandidateRecordError(
        "FILTER_LADDER_INVARIANT_VIOLATED",
        `kept candidate filterReason ${JSON.stringify(record.filterReason)} is not one of ${JSON.stringify(BRAND_KEPT_REASONS)}`,
      );
    }
  } else {
    if (active.length === 0) {
      throw new CandidateRecordError(
        "FILTER_LADDER_INVARIANT_VIOLATED",
        "rejected candidate has no active rejection reason",
      );
    }
    if (active[0] !== record.filterReason) {
      throw new CandidateRecordError(
        "FILTER_LADDER_INVARIANT_VIOLATED",
        `first active reason ${active[0]} does not equal the authoritative filterReason ${String(record.filterReason)}`,
      );
    }
  }

  // Derived fields must be derivable, not merely present.
  const ranking = record.ranking as Record<string, unknown> | null;
  if (record.rankingEligible !== (ranking !== null)) {
    throw new CandidateRecordError(
      "DERIVED_FIELD_INCONSISTENT",
      `rankingEligible is ${String(record.rankingEligible)} but ranking is ${ranking === null ? "null" : "present"}`,
    );
  }
  const expectedScore = ranking === null ? null : (ranking.rankingScore ?? null);
  if (record.rankingScore !== expectedScore) {
    throw new CandidateRecordError(
      "DERIVED_FIELD_INCONSISTENT",
      `rankingScore ${JSON.stringify(record.rankingScore)} does not equal ranking?.rankingScore ?? null (${JSON.stringify(expectedScore)})`,
    );
  }
  if (record.selected !== (record.decision === "selected")) {
    throw new CandidateRecordError(
      "DERIVED_FIELD_INCONSISTENT",
      `selected is ${String(record.selected)} but decision is ${JSON.stringify(record.decision)}`,
    );
  }

  // ---- final ranked membership --------------------------------------------
  //
  // Production assigns `ranking` semantics to every scored candidate, then
  // reduces them by family selection and normalized-value deduplication, sorts
  // the survivors, and assigns a `decision` ONLY to that final ranked array. So
  // `decision` — not `ranking` — is what final ranked membership means, and
  // `rankedPosition` must track `decision` exactly.
  const decision = record.decision;
  const rankedPosition = record.rankedPosition;

  if ((decision === null) !== (rankedPosition === null)) {
    throw new CandidateRecordError(
      "RANKED_MEMBERSHIP_INCONSISTENT",
      `decision ${JSON.stringify(decision)} and rankedPosition ${JSON.stringify(rankedPosition)} disagree; final ranked membership is exactly the set of candidates carrying a decision`,
    );
  }
  if (decision !== null && ranking === null) {
    throw new CandidateRecordError(
      "RANKED_MEMBERSHIP_INCONSISTENT",
      "a candidate in the final ranked list must carry ranking semantics",
    );
  }
  if (record.selected === true && rankedPosition !== 0) {
    throw new CandidateRecordError(
      "RANKED_MEMBERSHIP_INCONSISTENT",
      `the selected candidate must be ranked position 0, received ${JSON.stringify(rankedPosition)}`,
    );
  }
  if (rankedPosition === 0 && decision !== "selected") {
    throw new CandidateRecordError(
      "RANKED_MEMBERSHIP_INCONSISTENT",
      `ranked position 0 is production's selected candidate, but decision is ${JSON.stringify(decision)}`,
    );
  }
  // ---- kept and rejected candidates carry different complete evidence -------
  //
  // Production scores and assigns ranking semantics to EVERY kept candidate
  // before family reduction and deduplication (field-selection.ts:2536-2543). A
  // rejected span returns from analyzeBrandSpan before a Candidate object is
  // constructed, so it can carry none of it.
  if (record.kept === true) {
    if (record.score === null) {
      throw new CandidateRecordError(
        "KEPT_CANDIDATE_EVIDENCE_INCOMPLETE",
        "every kept candidate is scored before family reduction, so score may not be null",
      );
    }
    if (ranking === null) {
      throw new CandidateRecordError(
        "KEPT_CANDIDATE_EVIDENCE_INCOMPLETE",
        "every kept candidate receives ranking semantics before family reduction, so ranking may not be null",
      );
    }
    if (record.rankingEligible !== true) {
      throw new CandidateRecordError(
        "KEPT_CANDIDATE_EVIDENCE_INCOMPLETE",
        "a kept candidate always has ranking semantics, so rankingEligible must be true",
      );
    }
  } else {
    for (const [key, value] of [
      ["score", record.score],
      ["ranking", ranking],
      ["decision", decision],
      ["rankedPosition", rankedPosition],
    ] as const) {
      if (value !== null) {
        throw new CandidateRecordError(
          "RANKED_MEMBERSHIP_INCONSISTENT",
          `a rejected candidate returns before a Candidate object exists, so ${key} must be null`,
        );
      }
    }
    if (record.rankingEligible !== false || record.selected !== false) {
      throw new CandidateRecordError(
        "RANKED_MEMBERSHIP_INCONSISTENT",
        "a rejected candidate has no ranking semantics and is never selected",
      );
    }
  }
}

/**
 * Validate a candidate evidence record against the frozen CLOSED schema. Throws
 * on the first violation; returns nothing on success.
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
  for (const key of Object.keys(record)) {
    if (!(CANDIDATE_EVIDENCE_REQUIRED_KEYS as readonly string[]).includes(key)) {
      throw new CandidateRecordError(
        "UNEXPECTED_FIELD",
        `${key} is not part of the frozen record schema; the key set is closed so nothing undeclared enters the fingerprint`,
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
  if (!isInteger(ordinal) || (ordinal as number) < 0) {
    throw new CandidateRecordError(
      "MALFORMED_CANDIDATE_ORDINAL",
      `candidateOrdinal must be a non-negative integer, received ${JSON.stringify(ordinal)}`,
    );
  }

  const length = record.completeCandidateArrayLength;
  if (!isInteger(length) || (length as number) <= 0) {
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
    if (!CANDIDATE_FIELD_PREDICATES[key](record[key])) {
      throw new CandidateRecordError(
        "FIELD_TYPE_MISMATCH",
        `${key} does not satisfy the frozen schema, received ${JSON.stringify(record[key])}`,
      );
    }
  }

  assertCandidateInvariants(record);
}

/**
 * Build the stable id from a FINALIZED record. Fails closed.
 *
 * It validates the complete candidate preimage schema before it will accept the
 * supplied digest. Amendment 4 checked only that a digest was present, correctly
 * formatted and self-consistent — so a caller could hash a two-field partial and
 * pass the result back in, and the digest matched because it was computed over
 * exactly that partial. A self-consistent digest over incomplete evidence is
 * still incomplete evidence.
 */
export function stableCandidateId(input: CandidateRecordInput): string {
  const record = asRecord(input);
  const digest = record.canonicalRecordSha256;

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

  // The preimage — the record minus the two derived fields — must be a complete,
  // valid, closed candidate evidence record.
  assertCompleteCandidateEvidenceRecord(fingerprintPreimage(record));

  const extra = Object.keys(record).filter(
    (key) => !(CANDIDATE_FINALIZED_KEYS as readonly string[]).includes(key),
  );
  if (extra.length > 0) {
    throw new CandidateRecordError(
      "UNEXPECTED_FIELD",
      `${extra.join(", ")} is not part of the finalized record schema`,
    );
  }

  const recomputed = canonicalRecordSha256(record);
  if (recomputed !== digest) {
    throw new CandidateRecordError(
      "DIGEST_DOES_NOT_MATCH_RECORD",
      `supplied ${digest} but the complete record canonicalizes to ${recomputed}`,
    );
  }
  return `${String(record.opaqueItemId)}:${String(record.candidateOrdinal)}:${digest}`;
}

/**
 * The only sanctioned way to produce a persisted candidate record.
 *
 * Validates the COMPLETE closed schema and every cross-field invariant first,
 * then computes the digest, attaches it, verifies it, and attaches the stable id.
 */
export function finalizeCandidateRecord(
  completeEvidenceRecord: CandidateRecordInput,
): CandidateEvidenceRecord {
  assertCompleteCandidateEvidenceRecord(completeEvidenceRecord);

  const digest = canonicalRecordSha256(completeEvidenceRecord);
  const withDigest = { ...asRecord(completeEvidenceRecord), canonicalRecordSha256: digest };
  const finalized = { ...withDigest, stableCandidateId: stableCandidateId(withDigest) };

  const problems = exactKeys(finalized, CANDIDATE_FINALIZED_KEYS);
  if (problems.length > 0) {
    throw new CandidateRecordError("UNEXPECTED_FIELD", `finalized record: ${problems.join("; ")}`);
  }
  return finalized as unknown as CandidateEvidenceRecord;
}
