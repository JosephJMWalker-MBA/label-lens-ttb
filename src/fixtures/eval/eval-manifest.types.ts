/**
 * Evaluation manifest for measured extraction accuracy (Issue #57).
 *
 * This is TRUTH data, used only by the evaluation harness and its tests. It is
 * never an input to the extractor or the production service: the truth-boundary
 * tests (and `eval-boundary.test.ts`) enforce that the extractor cannot import
 * or read it, and that no fixture identity influences an extraction result.
 *
 * The manifest records, per case, the acceptable answers a reviewer would judge
 * "useful evidence" — not a single canonical string — because the product
 * standard is that the reviewer received a correct-or-useful candidate and that
 * uncertainty was represented honestly.
 */

export const EVAL_MANIFEST_SCHEMA_VERSION = "extraction-eval-manifest.v1" as const;

/**
 * Coverage strata the evaluation set is designed to exercise. A case may carry
 * several. These name real presentation/robustness conditions, never expected
 * answers.
 */
export const EVAL_STRATA = [
  "simple-centered-brand",
  "decorative-or-script-brand",
  "multi-line-brand",
  "brand-punctuation",
  "low-contrast",
  "multiple-brand-like-phrases",
  "alcohol-at-bottom",
  "alcohol-at-side-or-rotated",
  "vertical-mandatory-strip",
  "split-alcohol-tokens",
  "missing-alcohol-statement",
  "genuinely-ambiguous",
] as const;
export type EvalStratum = (typeof EVAL_STRATA)[number];

/** Coarse, human-annotated location of a field on the label (documentation only). */
export const EVAL_FIELD_LOCATIONS = ["top", "center", "bottom", "side", "rotated"] as const;
export type EvalFieldLocation = (typeof EVAL_FIELD_LOCATIONS)[number];

/**
 * Failure taxonomy. Failures are classified by WHERE in the pipeline the
 * evidence was lost, never collapsed into one "incorrect" bucket. The two
 * non-failure outcomes (`correct`, `correct-uncertainty`) are included so every
 * field maps to exactly one class.
 */
export const EVAL_FAILURE_CLASSES = [
  /** The value was extracted and is acceptable. */
  "correct",
  /** The label is genuinely ambiguous and the extractor honestly deferred. */
  "correct-uncertainty",
  /** OCR never recognized the needed text in any region. */
  "ocr-recognition-failure",
  /** The needed text falls outside every scanned region. */
  "region-coverage-failure",
  /** OCR read the text but it was split/merged into the wrong lines. */
  "line-reconstruction-failure",
  /** Tokens were present and well-formed but no candidate was generated. */
  "candidate-generation-failure",
  /** A correct candidate was generated but wrongly filtered out. */
  "candidate-filtering-failure",
  /** The correct candidate survived but was out-ranked by a weaker one. */
  "candidate-ranking-failure",
  /** A candidate reached the parser but was parsed to the wrong value. */
  "parser-failure",
  /** A confident value was emitted that is wrong or should have been absent. */
  "false-certainty",
] as const;
export type EvalFailureClass = (typeof EVAL_FAILURE_CLASSES)[number];

/** Acceptable brand answers and whether the label is genuinely ambiguous. */
export interface EvalBrandTruth {
  /**
   * Brand strings a reviewer would accept as the correct-or-useful evidence.
   * At least one is required. Matching is punctuation/case/whitespace tolerant.
   */
  acceptable: string[];
  /**
   * True when no single brand is objectively correct from the artwork alone
   * (competing brand-like phrases, or brand art that is not cleanly recoverable).
   * For these, an honest AMBIGUOUS observation is a success, not a failure.
   */
  knownAmbiguous: boolean;
  /** Coarse location of the brand presentation, when known. */
  approxLocation?: EvalFieldLocation;
  /** Brand-like phrases that must NOT be selected as the brand (e.g. importer). */
  forbidden?: string[];
}

/** Acceptable alcohol answers and expected presence. */
export interface EvalAlcoholTruth {
  /** Whether an alcohol statement is present on the label at all. */
  present: boolean;
  /**
   * Acceptable parsed alcohol percents (e.g. 14 for "14% ALC./VOL."). Empty when
   * absent. A parsed value is accurate when it equals one of these.
   */
  acceptablePercents: number[];
  /** Acceptable literal alcohol statement fragments (documentation + text match). */
  acceptableText: string[];
  /** Coarse location of the alcohol statement, when known. */
  approxLocation?: EvalFieldLocation;
  /**
   * Why detection is expected to be hard, when applicable (e.g. the "%" is a
   * separate OCR token, or the printed statement omits "%"). Documentation only.
   */
  detectionChallenge?: string;
}

/** Provenance for the annotation itself (who/when/how the truth was set). */
export interface EvalAnnotationProvenance {
  annotatedBy: string;
  annotatedOn: string;
  method: string;
  notes?: string;
}

/** One evaluation case: a versioned image reference plus its truth. */
export interface EvalCase {
  /** Stable case id, independent of ordering. */
  caseId: string;
  /** Directory under `tests/fixtures/precheck` holding the image. */
  fixtureDir: string;
  /** Image filename within `fixtureDir`. */
  imageFilename: string;
  /** Expected SHA-256 of the image bytes; the loader verifies it. */
  expectedSha256: string;
  /** Human-readable source of the image. */
  source: string;
  /** Usage/clearance status for repository use. */
  usageStatus: string;
  /** Coverage strata this case exercises. */
  strata: EvalStratum[];
  brand: EvalBrandTruth;
  alcohol: EvalAlcoholTruth;
  annotation: EvalAnnotationProvenance;
}

export interface EvalManifest {
  schemaVersion: typeof EVAL_MANIFEST_SCHEMA_VERSION;
  description: string;
  cases: EvalCase[];
}

/**
 * The documented live production failure. Recorded verbatim as a datum; this PR
 * does not tune the extractor to correct it.
 */
export interface EvalLiveBaselineRecord {
  caseId: string;
  expectedBrand: string;
  enteredAlcohol: string;
  selectedBrand: string;
  selectedBrandConfidence: number;
  alternates: { value: string; confidence: number }[];
  alcoholObservation: string;
}

export type EvalManifestErrorCode = "INVALID_SHAPE";

export interface EvalManifestError {
  code: EvalManifestErrorCode;
  message: string;
  issues: string[];
}
