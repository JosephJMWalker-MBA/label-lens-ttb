/**
 * Corpus-scale evaluation truth for Issue #57.
 *
 * This module is evaluation-only. Production extraction receives image bytes and
 * operational provenance only; it must never import this manifest or any type
 * that carries expected answers, dispositions, review notes, or case identity.
 */

export const EVAL_MANIFEST_SCHEMA_VERSION = "extraction-eval-manifest.v2" as const;

/** Every committed image receives exactly one of these reconciled dispositions. */
export const EVAL_RECORD_STATUSES = [
  "included",
  "excluded_duplicate",
  "excluded_unreadable",
  "excluded_outside_current_scope",
  "excluded_uncertain_truth",
  "excluded_usage_or_provenance_concern",
  "excluded_other",
] as const;
export type EvalRecordStatus = (typeof EVAL_RECORD_STATUSES)[number];

export const EVAL_IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg"] as const;
export type EvalImageMediaType = (typeof EVAL_IMAGE_MEDIA_TYPES)[number];

export const EVAL_BEVERAGE_CATEGORIES = [
  "wine",
  "distilled-spirits",
  "beer-or-malt-beverage",
  "non-beverage-or-unrelated",
  "uncertain",
] as const;
export type EvalBeverageCategory = (typeof EVAL_BEVERAGE_CATEGORIES)[number];

/** Pixel-frame orientation, recorded separately from the orientation of printed text. */
export const EVAL_IMAGE_ORIENTATIONS = ["portrait", "landscape", "square", "unknown"] as const;
export type EvalImageOrientation = (typeof EVAL_IMAGE_ORIENTATIONS)[number];

/** Orientation of one annotated field in the original image coordinate frame. */
export const EVAL_TEXT_ORIENTATIONS = [
  "horizontal",
  "vertical-clockwise",
  "vertical-counterclockwise",
  "vertical-stacked",
  "rotated-180",
  "mixed",
  "unknown",
  "not-applicable",
] as const;
export type EvalTextOrientation = (typeof EVAL_TEXT_ORIENTATIONS)[number];

/**
 * Bounded visual strata used for grouped reporting. The first twelve values are
 * retained from the v1 sample so downstream report code can migrate without
 * losing its existing groups.
 */
export const EVAL_VISUAL_STRATA = [
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
  "front-label",
  "back-label",
  "dense-text",
  "wraparound",
  "multi-panel",
  "low-resolution",
  "photographic-distortion",
  "out-of-scope-category",
] as const;
export type EvalVisualStratum = (typeof EVAL_VISUAL_STRATA)[number];

/** Compatibility alias for the v1 report/harness migration. */
export const EVAL_STRATA = EVAL_VISUAL_STRATA;
export type EvalStratum = EvalVisualStratum;

/** Coarse v1 field location retained only for the temporary harness projection. */
export const EVAL_FIELD_LOCATIONS = ["top", "center", "bottom", "side", "rotated"] as const;
export type EvalFieldLocation = (typeof EVAL_FIELD_LOCATIONS)[number];

export const EVAL_USAGE_STATUSES = [
  "screened-approved",
  "repository-use-established",
  "derived-from-screened-parent",
  "screenshot-metadata-screened-author-attested",
  "usage-or-provenance-concern",
] as const;
export type EvalUsageStatus = (typeof EVAL_USAGE_STATUSES)[number];

export const EVAL_REVIEW_REASONS = [
  "uncertain-brand-identity",
  "illegible-alcohol-text",
  "conflicting-front-back-presentations",
  "possible-duplicate-artwork",
  "unclear-crop-or-wraparound-context",
  "uncertain-usage-provenance",
  "other",
] as const;
export type EvalReviewReason = (typeof EVAL_REVIEW_REASONS)[number];

export const EVAL_ALCOHOL_CHARACTERISTICS = [
  "rotated-or-vertical",
  "split-token",
  "no-percent-sign",
  "decimal-value",
  "multiple-statements",
  "proof-nearby",
] as const;
export type EvalAlcoholCharacteristic = (typeof EVAL_ALCOHOL_CHARACTERISTICS)[number];

export const EVAL_ANNOTATION_CONFIDENCES = ["high", "medium"] as const;
export type EvalAnnotationConfidence = (typeof EVAL_ANNOTATION_CONFIDENCES)[number];

export const EVAL_QC_CHECKS = [
  "capitalization-and-punctuation",
  "varietal-not-brand",
  "producer-importer-bottler-not-brand",
  "proof-not-alcohol-by-volume",
  "rotated-or-vertical-alcohol",
  "absent-field-annotations",
  "genuine-ambiguity",
  "duplicate-labels",
] as const;
export type EvalQcCheck = (typeof EVAL_QC_CHECKS)[number];

/** Pipeline stage and reviewer-risk outcome are deliberately orthogonal. */
export const EVAL_FAILURE_STAGES = [
  "ocr-recognition",
  "region-coverage",
  "orientation",
  "line-reconstruction",
  "candidate-generation",
  "candidate-filtering",
  "candidate-ranking",
  "parsing",
] as const;
export type EvalFailureStage = (typeof EVAL_FAILURE_STAGES)[number];

export const EVAL_OUTCOMES = [
  "correct",
  "useful-deferred",
  "correct-uncertainty",
  "false-certainty",
  "incorrect-uncertain",
  "not-observed",
] as const;
export type EvalOutcome = (typeof EVAL_OUTCOMES)[number];

/**
 * V1 mutually-exclusive classes retained while metrics/report migrate to the
 * independent stage + outcome model above.
 */
export const EVAL_FAILURE_CLASSES = [
  "correct",
  "correct-uncertainty",
  "ocr-recognition-failure",
  "region-coverage-failure",
  "line-reconstruction-failure",
  "candidate-generation-failure",
  "candidate-filtering-failure",
  "candidate-ranking-failure",
  "parser-failure",
  "false-certainty",
] as const;
export type EvalFailureClass = (typeof EVAL_FAILURE_CLASSES)[number];

/**
 * Evaluation-only diagnostic refinement for the broad candidate-filtering
 * failure bucket. These never affect production selection; they only explain
 * which bounded filter path the acceptable field was lost to.
 */
export const EVAL_CANDIDATE_FILTERING_SUBTYPES = [
  "brand-rejected-no-letters-or-too-short",
  "brand-rejected-producer-line",
  "brand-rejected-non-brand-keyword",
  "brand-rejected-too-many-words",
  "brand-rejected-domain-like",
  "brand-rejected-varietal-or-designation",
  "brand-rejected-generic-product-language",
  "brand-rejected-location-or-appellation",
  "brand-rejected-low-information-fragment",
  "brand-rejected-sentence-fragment",
  "brand-kept-overextended-candidate",
  "brand-kept-partial-candidate",
  "brand-filtering-cause-unattributed",
  "alcohol-rejected-proof-only",
  "alcohol-rejected-no-supported-number",
  "alcohol-rejected-missing-volume-marker",
  "alcohol-rejected-missing-explicit-alcohol-marker",
  "alcohol-rejected-bare-volume-marker-too-weak",
  "alcohol-rejected-unsupported-pattern",
] as const;
export type EvalCandidateFilteringSubtype = (typeof EVAL_CANDIDATE_FILTERING_SUBTYPES)[number];

/** Approximate geometry normalized to the original image: every value is in [0, 1]. */
export interface EvalNormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EvalImageIdentity {
  mediaType: EvalImageMediaType;
  width: number;
  height: number;
}

export interface EvalSource {
  authority: string;
  description: string;
  usageStatus: EvalUsageStatus;
  /** Repository-relative source/inventory/manifest references only. */
  provenanceRefs: string[];
}

export interface EvalInspection {
  imageOrientation: EvalImageOrientation;
  visualStrata: EvalVisualStratum[];
  reviewReasons: EvalReviewReason[];
  notes: string;
}

export interface EvalBrandPresentTruth {
  presence: "present";
  acceptablePresentations: string[];
  genuinelyAmbiguous: boolean;
  ambiguityReason: string | null;
  forbiddenPresentations: string[];
  approxGeometry: EvalNormalizedBox[];
  orientation: Exclude<EvalTextOrientation, "not-applicable">;
}

/**
 * A visible producer/importer/bottler identity is not automatically a brand
 * presentation. This branch represents an honestly absent brand field without
 * fabricating an answer or calling extractor uncertainty artwork ambiguity.
 */
export interface EvalBrandAbsentTruth {
  presence: "absent";
  acceptablePresentations: [];
  genuinelyAmbiguous: false;
  ambiguityReason: null;
  absenceReason: string;
  forbiddenPresentations: string[];
  approxGeometry: [];
  orientation: "not-applicable";
}

export type EvalBrandTruthV2 = EvalBrandPresentTruth | EvalBrandAbsentTruth;

export interface EvalAlcoholPresentTruth {
  presence: "present";
  acceptablePercents: number[];
  acceptableStatements: string[];
  characteristics: EvalAlcoholCharacteristic[];
  approxGeometry: EvalNormalizedBox[];
  orientation: Exclude<EvalTextOrientation, "not-applicable">;
}

export interface EvalAlcoholAbsentTruth {
  presence: "absent";
  acceptablePercents: [];
  acceptableStatements: [];
  characteristics: [];
  absenceReason: string;
  approxGeometry: [];
  orientation: "not-applicable";
}

export type EvalAlcoholTruthV2 = EvalAlcoholPresentTruth | EvalAlcoholAbsentTruth;

export interface EvalAnnotationProvenance {
  annotatedBy: string;
  annotatedOn: string;
  method: string;
}

export interface EvalAnnotation {
  brand: EvalBrandTruthV2;
  alcohol: EvalAlcoholTruthV2;
  confidence: {
    overall: EvalAnnotationConfidence;
    brand: EvalAnnotationConfidence;
    alcohol: EvalAnnotationConfidence;
  };
  provenance: EvalAnnotationProvenance;
  notes: string;
}

export interface EvalQualityControlCorrection {
  fieldPath: string;
  before: string;
  after: string;
  reason: string;
}

export interface EvalQualityControl {
  reviewedBy: string;
  reviewedOn: string;
  method: "second-pass-visual-inspection";
  outcome: "confirmed" | "corrected";
  checks: EvalQcCheck[];
  corrections: EvalQualityControlCorrection[];
  notes: string;
}

interface EvalInventoryRecordBase {
  /** Stable evaluation identity; never passed to production selection logic. */
  caseId: string;
  /** POSIX-style repository-relative image path. */
  imagePath: string;
  expectedSha256: string;
  image: EvalImageIdentity;
  beverageCategory: EvalBeverageCategory;
  source: EvalSource;
  inspection: EvalInspection;
}

export interface IncludedEvalRecord extends EvalInventoryRecordBase {
  status: "included";
  exclusionReason: null;
  duplicateOfCaseId: null;
  annotation: EvalAnnotation;
  qualityControl: EvalQualityControl;
}

export interface ExcludedDuplicateEvalRecord extends EvalInventoryRecordBase {
  status: "excluded_duplicate";
  exclusionReason: string;
  duplicateOfCaseId: string;
  annotation: null;
  qualityControl: null;
}

export interface OtherExcludedEvalRecord extends EvalInventoryRecordBase {
  status: Exclude<EvalRecordStatus, "included" | "excluded_duplicate">;
  exclusionReason: string;
  duplicateOfCaseId: null;
  annotation: null;
  qualityControl: null;
}

export type EvalInventoryRecord =
  IncludedEvalRecord | ExcludedDuplicateEvalRecord | OtherExcludedEvalRecord;

export interface EvalManifest {
  schemaVersion: typeof EVAL_MANIFEST_SCHEMA_VERSION;
  corpusRoot: "tests/fixtures/precheck";
  description: string;
  records: EvalInventoryRecord[];
}

// ---------------------------------------------------------------------------
// Temporary v1 harness compatibility. Remove once harness/metrics consume the
// included v2 record directly. These types do not weaken the v2 JSON schema.
// ---------------------------------------------------------------------------

export interface EvalBrandTruth {
  present: boolean;
  acceptable: string[];
  knownAmbiguous: boolean;
  approxLocation?: EvalFieldLocation;
  forbidden?: string[];
  absenceReason?: string;
}

export interface EvalAlcoholTruth {
  present: boolean;
  acceptablePercents: number[];
  acceptableText: string[];
  approxLocation?: EvalFieldLocation;
  detectionChallenge?: string;
}

export interface EvalCase {
  caseId: string;
  fixtureDir: string;
  imageFilename: string;
  expectedSha256: string;
  source: string;
  usageStatus: string;
  strata: EvalStratum[];
  brand: EvalBrandTruth;
  alcohol: EvalAlcoholTruth;
  annotation: EvalAnnotationProvenance & { notes?: string };
}

export interface LoadedEvalManifest extends EvalManifest {
  /** Derived compatibility projection; not present in or accepted by v2 JSON. */
  cases: EvalCase[];
}

/** The documented live production datum retained from the v1 baseline. */
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
