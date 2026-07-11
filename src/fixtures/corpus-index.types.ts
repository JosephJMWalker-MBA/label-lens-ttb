/**
 * Versioned corpus-index contract for the domestic-wine fixture corpus.
 *
 * The corpus index is an evaluation-only catalogue. It references individual
 * fixture manifests (their source-chain provenance is authoritative and is NOT
 * duplicated here) and records, for each fixture, the bounded expectations the
 * current two-field Slice 3 system should be measured against.
 *
 * Hard boundary: nothing in this module — and nothing that transitively imports
 * it — may be reachable from production extraction or service code. Truth labels
 * and expectations exist to evaluate the extractor from the outside; they are
 * never inputs to it. See `corpusEntrySchema` and the truth-boundary tests.
 */

export const FIXTURE_CORPUS_SCHEMA_VERSION = "label-fixture-corpus.v1" as const;

/**
 * The single, explicit statement (asserted by every entry) that fixture truth is
 * for evaluation only and is never fed to the extractor. Kept as a literal so a
 * schema test can prove the prohibition is present and unaltered.
 */
export const TRUTH_LABEL_PROHIBITION =
  "Truth labels and expectations in this entry are for evaluation and regression only. They MUST NOT be passed to the extractor or production service as inputs; expected declared values may reach downstream deterministic rules only through the existing declared-facts contract." as const;

/** Observation states the current extractor can report for a supported field. */
export const CORPUS_OBSERVATION_STATES = [
  "OBSERVED",
  "LOW_CONFIDENCE",
  "AMBIGUOUS",
  "NOT_OBSERVED",
] as const;
export type CorpusObservationState = (typeof CORPUS_OBSERVATION_STATES)[number];

/** Evidence-sufficiency outcomes the current pre-check can report. */
export const CORPUS_SUFFICIENCY_STATES = ["sufficient", "insufficient"] as const;
export type CorpusSufficiencyState = (typeof CORPUS_SUFFICIENCY_STATES)[number];

/** The two fields the bounded first slice extracts. Nothing else is evaluated. */
export const CORPUS_SUPPORTED_FIELDS = ["brandName", "alcoholStatement"] as const;
export type CorpusSupportedField = (typeof CORPUS_SUPPORTED_FIELDS)[number];

/**
 * The role a fixture plays in the corpus. `candidate` is an ingested,
 * privacy/provenance-checked real-label record that is NOT yet annotated with
 * expectations and is NOT enabled for real-OCR regression — corpus inventory
 * awaiting annotation and an evaluation-split assignment.
 */
export const CORPUS_FIXTURE_ROLES = [
  "baseline",
  "adversarial",
  "degraded",
  "synthetic",
  "insufficient",
  "unavailable",
  "candidate",
] as const;
export type CorpusFixtureRole = (typeof CORPUS_FIXTURE_ROLES)[number];

/** Where a fixture's evidence ultimately comes from. */
export const CORPUS_SOURCE_AUTHORITIES = [
  "Alcohol and Tobacco Tax and Trade Bureau",
  "repository-derived",
  "synthetic",
  "unavailable",
  // Author-provided local corpus acquisition (e.g. a screenshot of previously
  // approved artwork). Carries no independently reverified public-record claim.
  "author-provided-local-acquisition",
] as const;
export type CorpusSourceAuthority = (typeof CORPUS_SOURCE_AUTHORITIES)[number];

/** Privacy-review disposition for the committed asset(s), if any. */
export const CORPUS_PRIVACY_REVIEW_STATES = [
  "screened-approved",
  "synthetic-no-personal-data",
  "derived-from-screened-parent",
  "not-applicable-unavailable",
  // Automated byte/metadata privacy screening passed; pixel-level visual
  // screening relies on author attestation and awaits second-pass review.
  "screenshot-metadata-screened-author-attested",
] as const;
export type CorpusPrivacyReviewState = (typeof CORPUS_PRIVACY_REVIEW_STATES)[number];

/** Wine color, when the fixture records it (bounded enum, not a free-text tag). */
export const CORPUS_WINE_COLORS = ["red", "white"] as const;
export type CorpusWineColor = (typeof CORPUS_WINE_COLORS)[number];

/** The acquisition stratum a candidate belongs to. */
export const CORPUS_SOURCE_STRATA = ["approved_artwork_screenshot"] as const;
export type CorpusSourceStratum = (typeof CORPUS_SOURCE_STRATA)[number];

/** Whether the record is an independent real label or a derived/synthetic case. */
export const CORPUS_INDEPENDENCE = ["independent_real_label"] as const;
export type CorpusIndependence = (typeof CORPUS_INDEPENDENCE)[number];

/** Bounded measurement-eligibility markers for a candidate record. */
export const CORPUS_MEASUREMENT_ELIGIBILITY = [
  "corpus_inventory",
  "future_ocr_evaluation_candidate",
  "future_annotation_candidate",
] as const;
export type CorpusMeasurementEligibility = (typeof CORPUS_MEASUREMENT_ELIGIBILITY)[number];

/** Annotation lifecycle of a candidate: no expected answers exist until annotated. */
export const CORPUS_ANNOTATION_STATUS = ["unannotated", "annotated"] as const;
export type CorpusAnnotationStatus = (typeof CORPUS_ANNOTATION_STATUS)[number];

/** Evaluation-split assignment (development/validation/holdout) or unassigned. */
export const CORPUS_SPLIT_STATUS = ["unassigned", "development", "validation", "holdout"] as const;
export type CorpusSplitStatus = (typeof CORPUS_SPLIT_STATUS)[number];

/** Mapping lifecycle for a per-record review-queue item. */
export const CORPUS_MAPPING_STATUS = ["unmapped", "mapped", "not_applicable"] as const;
export type CorpusMappingStatus = (typeof CORPUS_MAPPING_STATUS)[number];

/** Whether a real, committed asset backs the fixture. */
export const CORPUS_AVAILABILITY_STATES = ["available", "unavailable"] as const;
export type CorpusAvailabilityState = (typeof CORPUS_AVAILABILITY_STATES)[number];

/**
 * Bounded, useful challenge tags. Each asserts something the fixture actually
 * demonstrates — never an aspirational claim about an image that does not show
 * it.
 */
export const CORPUS_CHALLENGE_TAGS = [
  "clean-front-label",
  "low-resolution",
  "curved-text",
  "integrated-panels",
  "producer-brand-confusion",
  "slogan-confusion",
  "website-confusion",
  "varietal-confusion",
  "appellation-confusion",
  "vintage-confusion",
  "alcohol-direct",
  "alcohol-range",
  "alcohol-malformed",
  "glare",
  "blur",
  "perspective",
  "insufficient-evidence",
] as const;
export type CorpusChallengeTag = (typeof CORPUS_CHALLENGE_TAGS)[number];

/**
 * Synthetic OCR evidence for a domain-only entry: constructed token lines that
 * stand in for OCR output. These are synthetic *inputs* to the domain selectors
 * (equivalent to pixels), NOT truth labels, and are only ever read by tests.
 */
export interface CorpusSyntheticEvidence {
  /** Candidate front-label lines, each a list of OCR tokens (uppercase artwork). */
  brandLines: string[][];
  /** Candidate lines that may carry an alcohol statement, each a token list. */
  alcoholLines: string[][];
}

/** The bounded evaluation expectations for one fixture. */
export interface CorpusExpectations {
  /** Expected brand observation state (one allowed value or an allowed set). */
  brandStateAllowed: CorpusObservationState[];
  /** Expected alcohol observation state (allowed set). */
  alcoholStateAllowed: CorpusObservationState[];
  /** Parsed alcohol value when honestly recoverable, else null. */
  alcoholParsedValue: string | null;
  /** Tokens that MUST appear in the recovered alcohol value, when specified. */
  requiredAlcoholTokens: string[];
  /** Brand candidate values that are acceptable if selected (may be empty). */
  permittedBrandCandidates: string[];
  /** Brand candidate values that MUST NOT be selected (false-OBSERVED guards). */
  forbiddenBrandCandidates: string[];
  /** Expected evidence sufficiency per supported field, when evaluated. */
  sufficiency: Partial<Record<CorpusSupportedField, CorpusSufficiencyState>>;
  /** Expected extraction outcome. `success` or a typed extraction failure code. */
  extractionOutcome: "success" | { failureCode: string };
  /** Declared-comparison rule cases the current Slice 3 rules already support. */
  declaredComparison: {
    /** Declared alcohol values expected to PASS the declared-comparison rule. */
    passValues: string[];
    /** Declared alcohol values expected to FAIL the declared-comparison rule. */
    failValues: string[];
  };
  /** Rules that must remain not-run (external evidence dependency). */
  notRunRuleIds: string[];
}

/** One catalogued fixture. */
export interface CorpusEntry {
  fixtureId: string;
  /** Display-safe name; carries no personal data. */
  displayName: string;
  beverageCategory: "wine";
  sourceAuthority: CorpusSourceAuthority;
  /** Public record id (e.g. TTB ID) where applicable, else null. */
  publicRecordId: string | null;
  role: CorpusFixtureRole;
  /** Relative image filename under the fixture directory, or null. */
  imageFilename: string | null;
  /** Relative manifest filename under the fixture directory, or null. */
  manifestFilename: string | null;
  /** Fixture directory relative to `tests/fixtures/precheck/`, or null. */
  fixtureDir: string | null;
  privacyReviewStatus: CorpusPrivacyReviewState;
  availability: CorpusAvailabilityState;
  /** Present only for `unavailable` fixtures: exactly what evidence is missing. */
  unavailableReason: string | null;
  /** For derived fixtures: the parent corpus fixtureId it was generated from. */
  derivedFromFixtureId: string | null;
  /** Intended test dimensions (human-readable measurement goals). */
  testDimensions: string[];
  challengeTags: CorpusChallengeTag[];
  /** Which fields this fixture is expected to yield a supported observation for. */
  expectedSupportedObservations: CorpusSupportedField[];
  /** Known ambiguity note, or null when the fixture is unambiguous. */
  knownAmbiguity: string | null;
  /** Honest note on fields the current system does NOT support/evaluate. */
  unsupportedFieldsNote: string;
  /** Whether the asset is enabled for real-OCR regression in CI. */
  enabledForRealOcr: boolean;
  /** True when the entry is domain-only/synthetic (no committed image asset). */
  domainOnlySynthetic: boolean;
  /** Synthetic OCR evidence, present only for domain-only synthetic entries. */
  syntheticEvidence: CorpusSyntheticEvidence | null;
  /**
   * Bounded evaluation expectations, or `null` for an unannotated `candidate`.
   * A candidate carries NO invented expected answers until it is annotated.
   */
  expectations: CorpusExpectations | null;
  /** The explicit, unaltered truth-label prohibition. */
  truthLabelProhibition: typeof TRUTH_LABEL_PROHIBITION;

  // --- Candidate-stratum fields (present on `candidate` entries) ---
  /** Wine color, when recorded. */
  wineColor?: CorpusWineColor;
  /** Acquisition stratum for a candidate. */
  sourceStratum?: CorpusSourceStratum;
  /** Independence class for a candidate. */
  independence?: CorpusIndependence;
  /** Bounded measurement-eligibility markers. */
  measurementEligibility?: CorpusMeasurementEligibility[];
  /** Annotation lifecycle; `unannotated` means no expectations exist yet. */
  annotationStatus?: CorpusAnnotationStatus;
  /** Evaluation-split assignment. */
  splitStatus?: CorpusSplitStatus;
  /** Whether this record has been mapped as a multi-panel (front/back) example. */
  multiPanelStatus?: CorpusMappingStatus;
  /** Whether this record has been mapped as a decimal-comma alcohol example. */
  decimalCommaStatus?: CorpusMappingStatus;
  /** Ingestion date (YYYY-MM-DD), when recorded. */
  acquisitionDate?: string;
}

export interface FixtureCorpusIndex {
  schemaId: "label-fixture-corpus";
  schemaVersion: typeof FIXTURE_CORPUS_SCHEMA_VERSION;
  description: string;
  entries: CorpusEntry[];
}

export type FixtureCorpusErrorCode =
  "INVALID_SHAPE" | "INVALID_CORPUS" | "UNSUPPORTED_CORPUS_VERSION";

export interface FixtureCorpusError {
  code: FixtureCorpusErrorCode;
  message: string;
  issues: string[];
}
