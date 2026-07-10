import type { VerificationFinding } from "@/domain/verification/finding.types";

import type { RuleContext, VerificationRule } from "./rule.types";
import { collapseWhitespace, REQUIRED_GOVERNMENT_WARNING, WARNING_HEADING } from "./warning-text";

const RULE_ID = "government-warning";
const RULE_VERSION = "1.0.0";

/**
 * Strict validation of the government health warning statement.
 *
 * Mandatory language is never fuzzy-matched. Because bold type, font size, and
 * placement cannot be established from text evidence alone, a correct statement
 * yields NEEDS_REVIEW (not PASS) — the honest ceiling until layout evidence
 * exists. Missing, mis-capitalized, or altered wording fails.
 */
export const governmentWarningRule: VerificationRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  title: "Government health warning statement",
  category: "exact-statutory",
  evaluate,
};

function evaluate(context: RuleContext): VerificationFinding {
  const observedRaw = context.observed;
  const requiredCollapsed = collapseWhitespace(REQUIRED_GOVERNMENT_WARNING);

  const base = {
    field: context.field,
    expected: REQUIRED_GOVERNMENT_WARNING,
    observed: observedRaw,
    normalizedExpected: requiredCollapsed,
    ruleId: RULE_ID,
  };

  if (observedRaw === null || collapseWhitespace(observedRaw) === "") {
    return {
      ...base,
      status: "FAIL",
      reason: "The government warning statement is missing.",
    };
  }

  const observed = collapseWhitespace(observedRaw);
  const finding = { ...base, normalizedObserved: observed };

  const hasExactHeading = observed.includes(WARNING_HEADING);
  const hasHeadingAnyCase = observed.toLowerCase().includes(WARNING_HEADING.toLowerCase());

  if (!hasExactHeading) {
    return {
      ...finding,
      status: "FAIL",
      reason: hasHeadingAnyCase
        ? `The heading must appear exactly as "${WARNING_HEADING}" in capital letters.`
        : `The required "${WARNING_HEADING}" heading was not found.`,
    };
  }

  if (!observed.includes(requiredCollapsed)) {
    return {
      ...finding,
      status: "FAIL",
      reason: "The mandatory warning wording is incomplete or altered from the required statement.",
    };
  }

  return {
    ...finding,
    status: "NEEDS_REVIEW",
    reason:
      "Warning wording and capitalization match. Bold type, font size, and placement cannot be " +
      "verified from text evidence, so a human should confirm the visual formatting.",
  };
}
