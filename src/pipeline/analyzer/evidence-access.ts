import type { AnalyzerFieldObservation, AnalyzerObservationState } from "./analyzer.types";

/**
 * Neutral view of a field observation for downstream code.
 *
 * A value is returned for OBSERVED, LOW_CONFIDENCE, and AMBIGUOUS — absence is
 * reported only for NOT_OBSERVED. State and confidence are carried alongside so
 * a consumer cannot mistake low-confidence evidence for high-confidence
 * evidence. This deliberately does not gate on a confidence threshold.
 */
export interface ObservationAccess {
  value: string | null;
  state: AnalyzerObservationState;
  confidence: number;
  /** True unless the state is NOT_OBSERVED. */
  isPresent: boolean;
}

export function readObservation(field: AnalyzerFieldObservation): ObservationAccess {
  const isPresent = field.state !== "NOT_OBSERVED";
  return {
    value: isPresent ? field.value : null,
    state: field.state,
    confidence: field.confidence,
    isPresent,
  };
}
