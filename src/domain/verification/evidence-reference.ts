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
    confidence: observation.confidence,
    ...(observation.geometry ? { geometry: observation.geometry } : {}),
  };
}
