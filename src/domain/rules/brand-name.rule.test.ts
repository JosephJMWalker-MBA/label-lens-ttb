import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateVerificationFinding } from "@/domain/verification/finding.schema";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";

import { brandNameRule } from "./brand-name.rule";
import { canonicalizeBrand } from "./brand-canonical";
import type { RuleContext } from "./rule.types";

const SHA = "6829add3d99c61851028b2422bdd9672bb975183d198de5e280bc961f4a489e7";

function geometry() {
  return { imageIndex: 0, x: 10, y: 20, width: 100, height: 30, imageWidth: 494, imageHeight: 214 };
}

function obs(
  value: string | null,
  overrides: Partial<AnalyzerFieldObservation> = {},
): AnalyzerFieldObservation {
  return { state: "OBSERVED", value, confidence: 0.95, alternates: [], ...overrides };
}

function ctx(opts: {
  declared?: string;
  observation?: AnalyzerFieldObservation;
  evidenceStatus?: "sufficient" | "insufficient";
}): RuleContext {
  return {
    declaredFacts:
      opts.declared !== undefined
        ? {
            applicationBrandName: {
              value: opts.declared,
              provenance: {
                sourceType: "public-certificate-form-field",
                sourceReference: "24205001000905",
                recordedBy: "op",
                recordedAt: "2026-07-10T00:00:00Z",
              },
            },
          }
        : {},
    observations: opts.observation ? { brandName: opts.observation } : {},
    evidenceStatus: opts.evidenceStatus ?? "sufficient",
    run: {
      runId: "run-1",
      ruleProfileId: "wine-precheck",
      ruleProfileVersion: "1.0.0",
      derivativeSha256: SHA,
    },
    evidenceReferences: [],
  };
}

function evaluate(opts: Parameters<typeof ctx>[0]) {
  const finding = brandNameRule.evaluate(ctx(opts));
  // Every produced finding must satisfy the finding contract.
  expect(validateVerificationFinding(finding).ok).toBe(true);
  return finding;
}

describe("canonicalizeBrand", () => {
  it("folds case and whitespace without removing a suffix", () => {
    const c = canonicalizeBrand("  M   CELLARS ");
    expect(c.base).toBe("m cellars");
    expect(c.suffixRemoved).toBeNull();
  });

  it("removes a terminal LLC after a comma", () => {
    const c = canonicalizeBrand("RAINBOW HILLS WINERY, LLC");
    expect(c.stripped).toBe("rainbow hills winery");
    expect(c.suffixRemoved).not.toBeNull();
  });

  it("removes each approved terminal suffix", () => {
    for (const suffix of [
      "LLC",
      "L.L.C.",
      "INC.",
      "CORP",
      "CO.",
      "COMPANY",
      "LTD",
      "LLP",
      "LP",
      "PLC",
    ]) {
      expect(canonicalizeBrand(`ACME ${suffix}`).stripped).toBe("acme");
    }
  });

  it("removes at most one terminal suffix", () => {
    expect(canonicalizeBrand("ACME LLC INC").stripped).toBe("acme llc");
  });

  it("does not remove a leading or embedded suffix token", () => {
    expect(canonicalizeBrand("CO CELLARS").stripped).toBe("co cellars");
    expect(canonicalizeBrand("THE COMPANY STORE").stripped).toBe("the company store");
    expect(canonicalizeBrand("LLC").stripped).toBe("llc"); // would leave empty
  });

  it("does not remove ordinary winery/estate/geography words", () => {
    expect(canonicalizeBrand("LAKE ERIE CELLARS").stripped).toBe("lake erie cellars");
    expect(canonicalizeBrand("STONE ESTATE").stripped).toBe("stone estate");
  });
});

describe("brandNameRule outcomes", () => {
  it("passes on an exact canonical match", () => {
    const f = evaluate({ declared: "M CELLARS", observation: obs("M CELLARS") });
    expect([f.ruleExecutionStatus, f.findingStatus]).toEqual(["executed", "PASS"]);
    expect(f.message).toMatch(/BRAND_EXACT_MATCH/);
  });

  it("passes on case and whitespace differences", () => {
    const f = evaluate({ declared: "M CELLARS", observation: obs("m   cellars") });
    expect(f.findingStatus).toBe("PASS");
  });

  it("passes when only an approved punctuation separator differs", () => {
    // Curly vs. straight apostrophe is conservative punctuation normalization,
    // not fuzzy matching.
    const f = evaluate({ declared: "O’BRIEN CELLARS", observation: obs("O'BRIEN CELLARS") });
    expect(f.findingStatus).toBe("PASS");
    expect(f.message).toMatch(/BRAND_EXACT_MATCH/);
  });

  it("passes after approved terminal suffix removal, with a distinct reason code", () => {
    const f = evaluate({
      declared: "Rainbow Hills Winery",
      observation: obs("RAINBOW HILLS WINERY, LLC"),
    });
    expect(f.findingStatus).toBe("PASS");
    expect(f.message).toMatch(/BRAND_SUFFIX_NORMALIZED_MATCH/);
  });

  it("fails on word-order differences", () => {
    expect(evaluate({ declared: "M CELLARS", observation: obs("CELLARS M") }).findingStatus).toBe(
      "FAIL",
    );
  });

  it("fails on misspellings and fuzzy-near matches (no fuzzy logic)", () => {
    expect(evaluate({ declared: "M CELLARS", observation: obs("M CELARS") }).findingStatus).toBe(
      "FAIL",
    );
    expect(evaluate({ declared: "M CELLARS", observation: obs("M CELLAR") }).findingStatus).toBe(
      "FAIL",
    );
  });

  it("returns not_run for insufficient evidence", () => {
    const f = evaluate({
      declared: "M CELLARS",
      observation: obs("M CELLARS"),
      evidenceStatus: "insufficient",
    });
    expect([f.ruleExecutionStatus, f.findingStatus]).toEqual([
      "not_run_insufficient_evidence",
      "not_run",
    ]);
    expect(f.evidenceReferences).toHaveLength(0);
  });

  it("does not suppress low-confidence evidence", () => {
    const f = evaluate({
      declared: "M CELLARS",
      observation: obs("M CELLARS", { state: "LOW_CONFIDENCE", confidence: 0.07 }),
    });
    expect(f.findingStatus).toBe("PASS");
    expect(f.evidenceReferences[0].observationState).toBe("LOW_CONFIDENCE");
    expect(f.evidenceReferences[0].confidence).toBe(0.07);
  });

  it("returns NEEDS_REVIEW for ambiguous evidence without selecting an alternate", () => {
    const f = evaluate({
      declared: "M CELLARS",
      observation: obs("M CELLARS", {
        state: "AMBIGUOUS",
        alternates: [{ value: "N CELLARS", confidence: 0.4 }],
      }),
    });
    expect([f.ruleExecutionStatus, f.findingStatus]).toEqual(["executed", "NEEDS_REVIEW"]);
  });

  it("returns NEEDS_REVIEW when the declared or observed brand is missing", () => {
    expect(evaluate({ observation: obs("M CELLARS") }).findingStatus).toBe("NEEDS_REVIEW");
    expect(
      evaluate({ declared: "M CELLARS", observation: obs(null, { state: "NOT_OBSERVED" }) })
        .findingStatus,
    ).toBe("NEEDS_REVIEW");
  });

  // Regression: a producer/bottler entity must never manufacture a brand PASS.
  it("never passes the brand rule from a declared bottler name", () => {
    // Honest ambiguous artwork (no clean brand mark) declaring the bottler.
    const ambiguous = evaluate({
      declared: "OTHER WINERY",
      observation: obs("ACME RESERVE", {
        state: "AMBIGUOUS",
        alternates: [{ value: "OTHER LABEL", confidence: 0.7 }],
      }),
    });
    expect(ambiguous.findingStatus).toBe("NEEDS_REVIEW");
    expect(ambiguous.findingStatus).not.toBe("PASS");

    // A cleanly observed brand-art value that differs from the declared bottler
    // is a genuine mismatch, never a pass borrowed from the producer line.
    const mismatch = evaluate({
      declared: "OTHER WINERY",
      observation: obs("ACME RESERVE"),
    });
    expect(mismatch.findingStatus).toBe("FAIL");
  });
});

describe("brandNameRule finding contract", () => {
  it("copies rule, profile, and authority versions and cites 4.32/4.33", () => {
    const f = evaluate({ declared: "M CELLARS", observation: obs("M CELLARS") });
    expect(f.ruleId).toBe("brand-name-canonical-comparison");
    expect(f.ruleVersion).toBe("1.0.0");
    expect(f.profileId).toBe("wine-precheck");
    expect(f.profileVersion).toBe("1.0.0");
    expect(f.authority.citation).toMatch(/4\.32/);
    expect(f.authority.citation).toMatch(/4\.33/);
  });

  it("preserves evidence state, confidence, and geometry in the evidence reference", () => {
    const f = evaluate({
      declared: "M CELLARS",
      observation: obs("M CELLARS", { geometry: geometry() }),
    });
    const ref = f.evidenceReferences[0];
    expect(ref.derivativeSha256).toBe(SHA);
    expect(ref.fieldId).toBe("brandName");
    expect(ref.observationState).toBe("OBSERVED");
    expect(ref.geometry).toEqual(geometry());
  });

  it("serializes identical inputs to identical findings", () => {
    const a = brandNameRule.evaluate(ctx({ declared: "M CELLARS", observation: obs("M CELLARS") }));
    const b = brandNameRule.evaluate(ctx({ declared: "M CELLARS", observation: obs("M CELLARS") }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("brandNameRule module independence", () => {
  it("imports no report, UI, disposition, alcohol-rule, or external-AI modules", () => {
    for (const file of ["brand-name.rule.ts", "brand-canonical.ts"]) {
      const source = readFileSync(join(process.cwd(), "src/domain/rules", file), "utf8");
      const importPaths = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const path of importPaths) {
        expect(path).not.toMatch(/report|features|app\/|disposition|alcohol|openai|external/);
      }
    }
  });
});
