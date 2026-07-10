import { describe, expect, it } from "vitest";

import { governmentWarningRule } from "./warning.rule";
import { REQUIRED_GOVERNMENT_WARNING } from "./warning-text";

function evaluate(observed: string | null) {
  return governmentWarningRule.evaluate({ field: "governmentWarning", expected: null, observed });
}

describe("governmentWarningRule", () => {
  it("returns NEEDS_REVIEW when wording and capitalization are correct", () => {
    // Correct text still cannot PASS: bold/layout is unverifiable from text alone.
    const finding = evaluate(REQUIRED_GOVERNMENT_WARNING);
    expect(finding.status).toBe("NEEDS_REVIEW");
    expect(finding.reason).toMatch(/bold type, font size, and placement/i);
  });

  it("tolerates line wraps and extra whitespace in OCR text", () => {
    const wrapped = REQUIRED_GOVERNMENT_WARNING.replace(/ /g, "\n  ");
    expect(evaluate(wrapped).status).toBe("NEEDS_REVIEW");
  });

  it("FAILs when the statement is missing", () => {
    expect(evaluate(null).status).toBe("FAIL");
    expect(evaluate("   ").status).toBe("FAIL");
    expect(evaluate("   ").reason).toMatch(/missing/i);
  });

  it("FAILs when the heading capitalization is wrong (no fuzzy pass)", () => {
    const miscap = REQUIRED_GOVERNMENT_WARNING.replace(
      "GOVERNMENT WARNING:",
      "Government Warning:",
    );
    const finding = evaluate(miscap);
    expect(finding.status).toBe("FAIL");
    expect(finding.reason).toMatch(/capital letters/i);
  });

  it("FAILs when mandatory wording is altered", () => {
    const altered = REQUIRED_GOVERNMENT_WARNING.replace(
      "impairs your ability to drive a car",
      "may affect your ability to drive",
    );
    expect(evaluate(altered).status).toBe("FAIL");
  });

  it("FAILs when the heading is absent entirely", () => {
    const finding = evaluate("According to the Surgeon General, women should not drink...");
    expect(finding.status).toBe("FAIL");
    expect(finding.reason).toMatch(/not found/i);
  });

  it("always includes the required text as expected evidence", () => {
    expect(evaluate("anything").expected).toBe(REQUIRED_GOVERNMENT_WARNING);
  });
});
