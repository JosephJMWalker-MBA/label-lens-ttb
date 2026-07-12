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

/**
 * Plain-language label for each machine observation state. NOT_OBSERVED is
 * "Not detected": the extractor produced no supported evidence, which does NOT
 * prove the statement is absent from the artwork (see the Luigi & Giovanni
 * case). The wording stays on the machine-performance side of that boundary.
 */
export const OBSERVATION_STATE_LABEL: Record<AnalyzerObservationState, string> = {
  OBSERVED: "Found",
  LOW_CONFIDENCE: "Found with low confidence",
  AMBIGUOUS: "Multiple possibilities",
  NOT_OBSERVED: "Not detected",
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

/**
 * Concise alcohol line: the extracted value, or an honest "not detected". The
 * wording reports what the extractor did (no supported detection), never that
 * the statement is definitively absent from the artwork.
 */
export function summarizeAlcohol(observations: ResultObservations): string {
  const alcohol = observations.alcoholStatement;
  if (alcohol.state === "NOT_OBSERVED" || alcohol.value === null) {
    return "Not detected in the submitted artwork";
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

/** Stable rule ids the next-action logic keys on (never message-string parsing). */
const ALCOHOL_REVIEW_RULE_IDS = ["wine-alcohol-syntax", "wine-alcohol-declared-comparison"];
const BRAND_COMPARISON_RULE_ID = "brand-name-canonical-comparison";

/** An executed finding that returned a non-clearing (reviewable) outcome. */
function needsReview(f: VerificationFinding): boolean {
  return (
    f.ruleExecutionStatus === "executed" &&
    (f.findingStatus === "NEEDS_REVIEW" || f.findingStatus === "FAIL" || f.findingStatus === "WARN")
  );
}

/**
 * One plain-language next action, chosen from the observation states and the
 * actual executed findings that need review — never a bare review count, so the
 * suggestion names the real unresolved issue (brand vs. alcohol vs. other).
 * Deterministic and side-effect free; never a pass/fail verdict.
 */
export function nextAction(
  observations: ResultObservations,
  findings: VerificationFinding[],
): string {
  const reviewable = findings.filter(needsReview);
  const reviewableIds = new Set(reviewable.map((f) => f.ruleId));

  // 1. An ambiguous brand is the clearest actionable signal.
  if (observations.brandName.state === "AMBIGUOUS") {
    return "Review the highlighted brand candidates.";
  }
  // 2. No alcohol detected: point the reviewer at the statement's location.
  if (observations.alcoholStatement.state === "NOT_OBSERVED") {
    return "Confirm where the alcohol statement appears.";
  }
  // 3. An executed alcohol syntax or declared-comparison check needs review.
  if (ALCOHOL_REVIEW_RULE_IDS.some((id) => reviewableIds.has(id))) {
    return "Compare the alcohol evidence with the application facts.";
  }
  // 4. An executed brand canonical-comparison check needs review.
  if (reviewableIds.has(BRAND_COMPARISON_RULE_ID)) {
    return "Compare the detected brand with the application brand.";
  }
  // 5. Some other executed check needs review.
  if (reviewable.length > 0) {
    return "Review the highlighted findings.";
  }
  // 6. Nothing executed needs review.
  return "Compare the extracted evidence with the application facts.";
}
