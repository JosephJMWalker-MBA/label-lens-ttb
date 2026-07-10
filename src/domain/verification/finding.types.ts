import type { VerificationStatus } from "./status";

/**
 * The explainable result of evaluating one rule against one field.
 *
 * Every finding must carry enough to answer, in the UI and the exported report:
 * what was expected, what was observed, what normalization was applied, which
 * rule decided, and why the status was assigned.
 */
export interface VerificationFinding {
  /** Field key or logical check name (e.g. "brandName", "governmentWarning"). */
  field: string;
  status: VerificationStatus;
  /** Expected value as entered, or null when the field has no expected value. */
  expected: string | null;
  /** Observed value from the label, or null when nothing was recovered. */
  observed: string | null;
  /** Normalized forms actually compared, when normalization was applied. */
  normalizedExpected?: string;
  normalizedObserved?: string;
  /** Identifier of the rule that produced this finding. */
  ruleId: string;
  /** Plain-language explanation a non-technical reviewer can understand. */
  reason: string;
}
