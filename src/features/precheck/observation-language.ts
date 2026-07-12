import type { AnalyzerObservationState } from "@/pipeline/analyzer/analyzer.types";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type { ResultObservations } from "@/pipeline/result/result.types";

/**
 * Presentation-only language helpers for the review-first workflow.
 *
 * The authoritative machine states (OBSERVED, LOW_CONFIDENCE, AMBIGUOUS,
 * NOT_OBSERVED) remain the source of truth in the data; these helpers only map
 * them to readable labels and derive the concise first-result summary. Nothing
 * here changes any value, ordering, or rule outcome — it never invents an
 * overall pass/fail status.
 */

/** Plain-language label for each machine observation state. */
export const OBSERVATION_STATE_LABEL: Record<AnalyzerObservationState, string> = {
  OBSERVED: "Found",
  LOW_CONFIDENCE: "Found with low confidence",
  AMBIGUOUS: "Multiple possibilities",
  NOT_OBSERVED: "Not found",
};

export function observationStateLabel(state: AnalyzerObservationState): string {
  return OBSERVATION_STATE_LABEL[state];
}

/** Concise brand line: the extracted value, or an honest "could not identify". */
export function summarizeBrand(observations: ResultObservations): string {
  const brand = observations.brandName;
  if (brand.state === "NOT_OBSERVED" || brand.value === null) return "Could not identify safely";
  return brand.value;
}

/** Concise alcohol line: the extracted value, or an honest "not found". */
export function summarizeAlcohol(observations: ResultObservations): string {
  const alcohol = observations.alcoholStatement;
  if (alcohol.state === "NOT_OBSERVED" || alcohol.value === null) {
    return "Not found on the submitted artwork";
  }
  return alcohol.value;
}

/**
 * How many executed checks a human still needs to look at. Only findings whose
 * rule actually ran and returned a non-clearing outcome count — checks that did
 * not run (external-evidence dependencies) are surfaced separately and are not
 * "needing review". This mirrors the data; it is not a new verdict.
 */
export function countChecksNeedingReview(findings: VerificationFinding[]): number {
  return findings.filter(
    (f) =>
      f.ruleExecutionStatus === "executed" &&
      (f.findingStatus === "NEEDS_REVIEW" ||
        f.findingStatus === "FAIL" ||
        f.findingStatus === "WARN"),
  ).length;
}

/** Findings whose rule executed, in their existing order. */
export function executedFindings(findings: VerificationFinding[]): VerificationFinding[] {
  return findings.filter((f) => f.ruleExecutionStatus === "executed");
}

/** Findings whose rule did not run (evidence-dependent), in their existing order. */
export function notRunFindings(findings: VerificationFinding[]): VerificationFinding[] {
  return findings.filter((f) => f.ruleExecutionStatus !== "executed");
}

/**
 * One plain-language next action, chosen from the observation states and the
 * review count. Deterministic and side-effect free; never a pass/fail verdict.
 */
export function nextAction(observations: ResultObservations, reviewCount: number): string {
  const brand = observations.brandName;
  const alcohol = observations.alcoholStatement;
  const brandMissing = brand.state === "NOT_OBSERVED" || brand.value === null;
  const alcoholMissing = alcohol.state === "NOT_OBSERVED" || alcohol.value === null;

  if (brandMissing && alcoholMissing) {
    return "No supported evidence was found; provide clearer artwork or mark the field for human review.";
  }
  if (brand.state === "AMBIGUOUS") {
    return "Review the highlighted brand candidates.";
  }
  if (alcoholMissing) {
    return "Confirm where the alcohol statement appears.";
  }
  if (reviewCount > 0) {
    return "Review the highlighted brand candidates.";
  }
  return "Compare the extracted evidence with the application facts.";
}
