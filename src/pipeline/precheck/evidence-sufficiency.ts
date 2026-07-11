import type { EvidenceStatus } from "@/domain/run/run-status";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";

import type { EvidenceAssessment, PrecheckCheckId } from "./precheck.types";

/**
 * Per-check evidence sufficiency. Brand and alcohol are assessed independently —
 * there is deliberately no single global evidence status. Confidence and image
 * quality are never consulted here: a LOW_CONFIDENCE observation with valid
 * provenance can still be sufficient.
 */

interface CommonInputs {
  /** The validated intake/run sanitized derivative identity. */
  runDerivativeSha256: string;
  /** The analyzer provenance derivative identity. */
  provenanceDerivativeSha256: string;
}

function hasValue(observation: AnalyzerFieldObservation): boolean {
  return observation.value !== null && observation.value.trim() !== "";
}

function assess(
  checkId: PrecheckCheckId,
  status: EvidenceStatus,
  reasonCode: string,
): EvidenceAssessment {
  return { checkId, evidenceStatus: status, reasonCode };
}

/**
 * Brand-name evidence sufficiency. A present observation (OBSERVED,
 * LOW_CONFIDENCE, or AMBIGUOUS) with a nonempty value and consistent derivative
 * identity is sufficient; an AMBIGUOUS observation stays sufficient and the rule
 * decides NEEDS_REVIEW. NOT_OBSERVED, a hash mismatch, or an unprocessed region
 * is insufficient.
 */
export function assessBrandEvidence(
  observation: AnalyzerFieldObservation,
  processed: boolean,
  common: CommonInputs,
): EvidenceAssessment {
  const checkId: PrecheckCheckId = "brand-name-check";

  if (common.provenanceDerivativeSha256 !== common.runDerivativeSha256) {
    return assess(checkId, "insufficient", "DERIVATIVE_HASH_MISMATCH");
  }
  if (!processed) {
    return assess(checkId, "insufficient", "ARTIFACT_REGION_NOT_PROCESSED");
  }
  if (observation.state === "NOT_OBSERVED") {
    return assess(checkId, "insufficient", "BRAND_NOT_OBSERVED");
  }
  if (!hasValue(observation)) {
    return assess(checkId, "insufficient", "BRAND_VALUE_EMPTY");
  }
  return assess(checkId, "sufficient", "BRAND_OBSERVATION_PRESENT");
}

/**
 * Alcohol-statement evidence sufficiency. Unlike the brand check, a genuine
 * NOT_OBSERVED can be sufficient — but only when the analyzer affirmatively
 * processed the relevant artifact/region, so the syntax rule can execute and
 * return NEEDS_REVIEW for the absence. When the region was not processed or the
 * derivative identity is inconsistent, evidence is insufficient and the rule
 * does not run.
 */
export function assessAlcoholEvidence(
  observation: AnalyzerFieldObservation,
  processed: boolean,
  common: CommonInputs,
): EvidenceAssessment {
  const checkId: PrecheckCheckId = "wine-alcohol-check";

  if (common.provenanceDerivativeSha256 !== common.runDerivativeSha256) {
    return assess(checkId, "insufficient", "DERIVATIVE_HASH_MISMATCH");
  }
  if (!processed) {
    return assess(checkId, "insufficient", "ARTIFACT_REGION_NOT_PROCESSED");
  }
  if (observation.state === "NOT_OBSERVED") {
    // Affirmatively processed but nothing found: sufficient so the rule must
    // explicitly evaluate the absence.
    return assess(checkId, "sufficient", "ALCOHOL_NOT_OBSERVED_BUT_PROCESSED");
  }
  if (!hasValue(observation)) {
    return assess(checkId, "insufficient", "ALCOHOL_VALUE_EMPTY");
  }
  return assess(checkId, "sufficient", "ALCOHOL_OBSERVATION_PRESENT");
}
