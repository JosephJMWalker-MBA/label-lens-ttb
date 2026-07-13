import type { AnalyzerFieldObservation, AnalyzerObservationState } from "./analyzer.types";

/**
 * Neutral view of a field observation for downstream code.
 *
 * A value is returned for OBSERVED, LOW_CONFIDENCE, and AMBIGUOUS — absence is
 * reported only for NOT_OBSERVED. State and the OCR-derived evidence score are
 * carried alongside so a consumer cannot mistake weak evidence for high-quality
 * evidence or for a correctness probability. This deliberately does not gate on
 * an evidence-score threshold.
 */
export interface ObservationAccess {
  value: string | null;
  state: AnalyzerObservationState;
  /** Explicit OCR-derived evidence score in [0,1]. */
  ocrEvidenceScore: number;
  /** Compatibility alias for `ocrEvidenceScore`. */
  confidence: number;
  /** True unless the state is NOT_OBSERVED. */
  isPresent: boolean;
}

export function readObservation(field: AnalyzerFieldObservation): ObservationAccess {
  const isPresent = field.state !== "NOT_OBSERVED";
  return {
    value: isPresent ? field.value : null,
    state: field.state,
    ocrEvidenceScore: field.ocrEvidenceScore,
    confidence: field.ocrEvidenceScore,
    isPresent,
  };
}
