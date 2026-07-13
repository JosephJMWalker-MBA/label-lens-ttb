import type {
  AnalyzerFieldObservation,
  AnalyzerObservationState,
  EvidenceGeometry,
} from "@/pipeline/analyzer/analyzer.types";

/**
 * A traceable pointer from a finding back to the evidence it relied on.
 *
 * It carries only what is needed to trace evidence — it never duplicates the
 * full analyzer response or the run version manifest.
 */
export interface EvidenceReference {
  /** SHA-256 of the sanitized derivative the observation came from. */
  derivativeSha256: string;
  fieldId: string;
  observationState: AnalyzerObservationState;
  /** Explicit OCR-derived evidence score in [0,1]. */
  ocrEvidenceScore: number;
  /** Compatibility alias for `ocrEvidenceScore`. */
  confidence: number;
  geometry?: EvidenceGeometry;
  /** Index into the observation's alternates, when a finding cites one. */
  alternateIndex?: number;
}

/** Build an evidence reference from one analyzer observation. */
export function evidenceReferenceFromObservation(
  derivativeSha256: string,
  fieldId: string,
  observation: AnalyzerFieldObservation,
): EvidenceReference {
  return {
    derivativeSha256,
    fieldId,
    observationState: observation.state,
    ocrEvidenceScore: observation.ocrEvidenceScore,
    confidence: observation.ocrEvidenceScore,
    ...(observation.geometry ? { geometry: observation.geometry } : {}),
  };
}
