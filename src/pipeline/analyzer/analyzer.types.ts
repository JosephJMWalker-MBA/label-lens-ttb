/**
 * Evidence-only analyzer contract for the wine pre-check slice.
 *
 * The analyzer reports what it observed on the sanitized derivative and nothing
 * more. It never returns a compliance/regulatory conclusion, a finding, a rule
 * identifier, or a disposition — those belong to the deterministic rules and the
 * human reviewer. The contract carries only brand name and alcohol statement,
 * the two fields the bounded first slice needs.
 */

export const ANALYZER_EVIDENCE_SCHEMA_VERSION = "analyzer-evidence.v2" as const;

/** The only fields this slice extracts. Intentionally narrow. */
export const ANALYZER_FIELD_KEYS = ["brandName", "alcoholStatement"] as const;
export type AnalyzerFieldKey = (typeof ANALYZER_FIELD_KEYS)[number];

/**
 * Observation states. Confidence is numeric evidence, never an execution gate:
 * a low-confidence or ambiguous observation still carries its value. Only
 * NOT_OBSERVED means nothing was extracted.
 */
export const ANALYZER_OBSERVATION_STATES = [
  "OBSERVED",
  "LOW_CONFIDENCE",
  "AMBIGUOUS",
  "NOT_OBSERVED",
] as const;
export type AnalyzerObservationState = (typeof ANALYZER_OBSERVATION_STATES)[number];

/**
 * Bounded reason an observation is AMBIGUOUS. It distinguishes the two honest
 * uncertainty situations that both defer to a human:
 *   - `competing_candidates`: two or more non-corroborating candidates of
 *     comparable prominence rivalled each other (alternates carry the rivals);
 *   - `single_unconfirmed_candidate`: exactly one plausible line was found but it
 *     could not be positively distinguished as brand presentation, and there is
 *     no second candidate — usable uncertainty, NOT a schema-invalidating gap.
 * The reason is required when an AMBIGUOUS observation carries no alternate, so a
 * lone unconfirmed candidate stays valid uncertainty instead of an invalid shape.
 */
export const ANALYZER_AMBIGUITY_REASONS = [
  "competing_candidates",
  "single_unconfirmed_candidate",
] as const;
export type AnalyzerAmbiguityReason = (typeof ANALYZER_AMBIGUITY_REASONS)[number];

/** Bounded evidence region, with the reference frame needed to interpret it. */
export interface EvidenceGeometry {
  /** Page or image index within the artifact. */
  imageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Reference frame: dimensions of the image the box is measured against. */
  imageWidth: number;
  imageHeight: number;
}

export interface AnalyzerOcrConfidence {
  aggregation: "mean";
  rawScale: "0-100";
  rawTokenConfidences: Array<number | null>;
  rawMean: number | null;
  rawMin: number | null;
  rawMax: number | null;
  missingTokenCount: number;
}

export interface AnalyzerCandidateProvenance {
  passId: string;
  passKind: string;
  triggerReasons: string[];
  preprocessing: string[];
  regionName: string;
  supportingPassIds: string[];
  supportingPassKinds: string[];
  recoveryPassUsed: boolean;
}

export const ANALYZER_RANKING_DIRECTIONS = ["asc", "desc"] as const;
export type AnalyzerRankingDirection = (typeof ANALYZER_RANKING_DIRECTIONS)[number];

export const ANALYZER_CANDIDATE_RANKING_STRATEGIES = [
  "alcohol-ocr-evidence-comparator",
  "brand-mixed-prominence-score",
] as const;
export type AnalyzerCandidateRankingStrategy =
  (typeof ANALYZER_CANDIDATE_RANKING_STRATEGIES)[number];

export const ANALYZER_CANDIDATE_RANKING_MODES = [
  "ocr-evidence-first",
  "score-first",
  "prominence-first",
] as const;
export type AnalyzerCandidateRankingMode = (typeof ANALYZER_CANDIDATE_RANKING_MODES)[number];

export const ANALYZER_RANKING_COMPARATOR_IDS = [
  "score-eligibility",
  "ranking-score",
  "prominence",
  "ocr-evidence-score",
  "normalized-value-key",
] as const;
export type AnalyzerRankingComparatorId = (typeof ANALYZER_RANKING_COMPARATOR_IDS)[number];

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
export type AnalyzerRankingScoreFactorId = (typeof ANALYZER_RANKING_SCORE_FACTOR_IDS)[number];

export const ANALYZER_RANKING_SCORE_FACTOR_DIRECTIONS = ["benefit", "penalty"] as const;
export type AnalyzerRankingScoreFactorDirection =
  (typeof ANALYZER_RANKING_SCORE_FACTOR_DIRECTIONS)[number];

export interface AnalyzerRankingComparatorEntry {
  id: AnalyzerRankingComparatorId;
  direction: AnalyzerRankingDirection;
  value: number | string | boolean;
}

export interface AnalyzerRankingScoreFactor {
  id: AnalyzerRankingScoreFactorId;
  value: number;
  contribution: number;
  direction: AnalyzerRankingScoreFactorDirection;
}

export interface AnalyzerCandidateRanking {
  strategy: AnalyzerCandidateRankingStrategy;
  orderingMode: AnalyzerCandidateRankingMode;
  comparator: AnalyzerRankingComparatorEntry[];
  rankingScore?: number;
  scoreFactors?: AnalyzerRankingScoreFactor[];
}

export interface AnalyzerAlternate {
  value: string;
  /** Compatibility alias for `ocrEvidenceScore`. */
  confidence: number;
  ocrEvidenceScore: number;
  ocrConfidence: AnalyzerOcrConfidence;
  candidateProvenance: AnalyzerCandidateProvenance;
  ranking: AnalyzerCandidateRanking;
  geometry?: EvidenceGeometry;
}

/**
 * One field observation. `value` is preserved for OBSERVED, LOW_CONFIDENCE, and
 * AMBIGUOUS; it is null only for NOT_OBSERVED. The state and confidence travel
 * with the value so downstream code cannot mistake low-confidence evidence for
 * high-confidence evidence.
 */
export interface AnalyzerFieldObservation {
  state: AnalyzerObservationState;
  value: string | null;
  normalizedValue?: string | null;
  rawText?: string;
  /** Compatibility alias for `ocrEvidenceScore`. */
  confidence: number;
  ocrEvidenceScore: number;
  ocrConfidence?: AnalyzerOcrConfidence;
  candidateProvenance?: AnalyzerCandidateProvenance;
  ranking?: AnalyzerCandidateRanking;
  geometry?: EvidenceGeometry;
  /** Ordered alternate candidates; never promoted into a result. */
  alternates: AnalyzerAlternate[];
  /**
   * Why the observation is AMBIGUOUS. Required for an AMBIGUOUS observation that
   * carries no alternate (a lone unconfirmed candidate); optional otherwise.
   */
  ambiguityReason?: AnalyzerAmbiguityReason;
}

/** OCR engine identity, or an explicit statement that none was used. */
export type AnalyzerOcrEngine =
  | {
      kind: "ocr";
      engineId: string;
      engineVersion: string;
      modelId?: string;
      modelVersion?: string;
      modelSha256?: string;
    }
  | { kind: "not_applicable" };

/**
 * Shared, observation-specific provenance for the whole response. It records
 * only what is needed to trace evidence — it does not copy the immutable run
 * version manifest.
 */
export interface AnalyzerProvenance {
  artifactRef: string;
  derivativeSha256: string;
  extractionAdapterId: string;
  extractionAdapterVersion: string;
  ocrEngine: AnalyzerOcrEngine;
  parserId: string;
  parserVersion: string;
  processedAt: string;
}

export interface AnalyzerEvidenceResponse {
  schemaVersion: typeof ANALYZER_EVIDENCE_SCHEMA_VERSION;
  provenance: AnalyzerProvenance;
  fields: {
    brandName: AnalyzerFieldObservation;
    alcoholStatement: AnalyzerFieldObservation;
  };
  limitations: string[];
}

export type AnalyzerValidationErrorCode = "REGULATORY_DECISION" | "INVALID_SHAPE";

export interface AnalyzerValidationError {
  code: AnalyzerValidationErrorCode;
  message: string;
  issues: string[];
}
