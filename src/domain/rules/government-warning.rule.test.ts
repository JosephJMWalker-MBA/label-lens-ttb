import { describe, expect, it } from "vitest";

import {
  CANONICAL_GOVERNMENT_WARNING,
  diffGovernmentWarning,
  evaluateGovernmentWarningPackage,
  governmentWarningMatchSignals,
  normalizeGovernmentWarningForComparison,
  type GovernmentWarningObservation,
} from "./government-warning.rule";

function observation(
  rawTranscript: string | null,
  overrides: Partial<GovernmentWarningObservation> = {},
): GovernmentWarningObservation {
  const match = governmentWarningMatchSignals(rawTranscript ?? "");
  return {
    panelId: "back",
    evidenceState: rawTranscript ? "observed" : "not_observed",
    rawTranscript,
    normalizedComparisonText: rawTranscript
      ? normalizeGovernmentWarningForComparison(rawTranscript)
      : null,
    ocrEvidenceScore: 0.92,
    detectedOrientation: 0,
    extractionProvenance: null,
    match,
    ...overrides,
  };
}

describe("government warning prescribed text rule", () => {
  it("passes only exact readable prescribed text", () => {
    const finding = evaluateGovernmentWarningPackage([observation(CANONICAL_GOVERNMENT_WARNING)]);
    expect(finding.result).toBe("PASS");
    expect(finding.ruleId).toBe("government-warning-prescribed-text-v1");
    expect(finding.authority.citation).toContain("27 CFR 16.21");
    expect(finding.diff.every((token) => token.status === "equal")).toBe(true);
  });

  it("fails when a readable warning is missing a word", () => {
    const altered = CANONICAL_GOVERNMENT_WARNING.replace("birth defects", "defects");
    const finding = evaluateGovernmentWarningPackage([observation(altered)]);
    expect(finding.result).toBe("FAIL");
    expect(diffGovernmentWarning(altered).some((token) => token.status !== "equal")).toBe(true);
  });

  it("fails when a readable warning substitutes a word or heading", () => {
    const altered = CANONICAL_GOVERNMENT_WARNING.replace("GOVERNMENT WARNING", "GENERAL WARNING");
    const finding = evaluateGovernmentWarningPackage([observation(altered)]);
    expect(finding.result).toBe("FAIL");
    expect(finding.rationale).toMatch(/wording defect/i);
  });

  it("fails changed clause identifiers and reversed clauses", () => {
    const changedNumber = CANONICAL_GOVERNMENT_WARNING.replace("(2)", "(3)");
    expect(evaluateGovernmentWarningPackage([observation(changedNumber)]).result).toBe("FAIL");

    const reversed =
      "GOVERNMENT WARNING: (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems. (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects.";
    expect(evaluateGovernmentWarningPackage([observation(reversed)]).result).toBe("FAIL");
  });

  it("routes cropped or unreadable warning evidence to review", () => {
    const partial =
      "GOVERNMENT WARNING: According to the Surgeon General women should not drink during pregnancy";
    const finding = evaluateGovernmentWarningPackage([
      observation(partial, { evidenceState: "partial", ocrEvidenceScore: 0.42 }),
    ]);
    expect(finding.result).toBe("NEEDS_REVIEW");
  });

  it("fails definite absence only after panel observations exist", () => {
    expect(evaluateGovernmentWarningPackage([]).result).toBe("not_run");
    expect(
      evaluateGovernmentWarningPackage([
        observation(null, {
          panelId: "front",
          evidenceState: "not_observed",
          match: {
            anchorFound: false,
            canonicalTokenCoverage: 0,
            exactTextMatch: false,
            distinctivePhraseHits: [],
          },
        }),
      ]).result,
    ).toBe("FAIL");
  });
});
