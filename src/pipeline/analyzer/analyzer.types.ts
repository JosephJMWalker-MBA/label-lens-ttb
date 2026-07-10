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

export interface AnalyzerAlternate {
  value: string;
  confidence: number;
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
  /** Numeric evidence in [0, 1]. */
  confidence: number;
  geometry?: EvidenceGeometry;
  /** Ordered alternate candidates; never promoted into a result. */
  alternates: AnalyzerAlternate[];
}

/** OCR engine identity, or an explicit statement that none was used. */
export type AnalyzerOcrEngine =
  | {
      kind: "ocr";
      engineId: string;
      engineVersion: string;
      modelId?: string;
      modelVersion?: string;
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
