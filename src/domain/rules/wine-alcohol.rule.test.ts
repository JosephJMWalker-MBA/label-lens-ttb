import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateVerificationFinding } from "@/domain/verification/finding.schema";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";

import type { RuleContext } from "./rule.types";
import { decimalToBasisPoints, parseWineAlcoholStatement } from "./wine-alcohol-parse";
import {
  wineAlcoholActualToleranceRule,
  wineAlcoholClassTypeBoundaryRule,
  wineAlcoholDeclaredComparisonRule,
  wineAlcoholOmissionEligibilityRule,
  wineAlcoholSyntaxRule,
} from "./wine-alcohol.rule";

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

function declaredFact(value: string) {
  return {
    value,
    provenance: {
      sourceType: "public-certificate-form-field" as const,
      sourceReference: "24205001000905",
      recordedBy: "op",
      recordedAt: "2026-07-10T00:00:00Z",
    },
  };
}

function ctx(opts: {
  declared?: string;
  observation?: AnalyzerFieldObservation;
  evidenceStatus?: "sufficient" | "insufficient";
  extraFacts?: Record<string, ReturnType<typeof declaredFact>>;
}): RuleContext {
  return {
    declaredFacts: {
      ...(opts.declared !== undefined
        ? { applicationAlcoholValue: declaredFact(opts.declared) }
        : {}),
      ...(opts.extraFacts ?? {}),
    },
    observations: opts.observation ? { alcoholStatement: opts.observation } : {},
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

function syntax(opts: Parameters<typeof ctx>[0]) {
  const finding = wineAlcoholSyntaxRule.evaluate(ctx(opts));
  expect(validateVerificationFinding(finding).ok).toBe(true);
  return finding;
}

function compare(opts: Parameters<typeof ctx>[0]) {
  const finding = wineAlcoholDeclaredComparisonRule.evaluate(ctx(opts));
  expect(validateVerificationFinding(finding).ok).toBe(true);
  return finding;
}

describe("decimalToBasisPoints", () => {
  it("parses exact decimals to basis points without floating error", () => {
    expect(decimalToBasisPoints("12.5")).toBe(1250);
    expect(decimalToBasisPoints("12.50")).toBe(1250);
    expect(decimalToBasisPoints("13")).toBe(1300);
    expect(decimalToBasisPoints("0")).toBe(0);
    expect(decimalToBasisPoints("100")).toBe(10000);
  });

  it("rejects out-of-range, negative, non-numeric, and over-precise values", () => {
    expect(decimalToBasisPoints("-1")).toBeNull();
    expect(decimalToBasisPoints("101")).toBeNull();
    expect(decimalToBasisPoints("12.345")).toBeNull();
    expect(decimalToBasisPoints("abc")).toBeNull();
    expect(decimalToBasisPoints("NaN")).toBeNull();
  });

  it("accepts comma decimals exactly", () => {
    expect(decimalToBasisPoints("12,5")).toBe(1250);
    expect(decimalToBasisPoints("13,25")).toBe(1325);
  });
});

describe("parseWineAlcoholStatement", () => {
  it("parses permitted direct wording variants", () => {
    for (const s of ["12.5% ALC./VOL.", "Alcohol 12.5% by volume", "12.5% alc by vol"]) {
      expect(parseWineAlcoholStatement(s)).toEqual({ kind: "direct", basisPoints: 1250 });
    }
    expect(parseWineAlcoholStatement("13.5% by vol.")).toEqual({
      kind: "direct",
      basisPoints: 1350,
    });
    expect(parseWineAlcoholStatement("ALCOHOL 13.5 BY VOLUME")).toEqual({
      kind: "direct",
      basisPoints: 1350,
    });
    expect(parseWineAlcoholStatement("ALC 14 BY VOL")).toEqual({
      kind: "direct",
      basisPoints: 1400,
    });
    expect(parseWineAlcoholStatement("ALC 13,5% VOL")).toEqual({
      kind: "direct",
      basisPoints: 1350,
    });
  });

  it("parses a bounded range", () => {
    expect(parseWineAlcoholStatement("Alcohol 11% to 13% by volume")).toEqual({
      kind: "range",
      lowerBasisPoints: 1100,
      upperBasisPoints: 1300,
    });
  });

  it("rejects proof, unitless, unsupported abbreviations, reversed ranges, weak bare vol, and prose", () => {
    expect(parseWineAlcoholStatement("80 proof")).toEqual({ kind: "proof" });
    expect(parseWineAlcoholStatement("40 proof alc./vol.")).toEqual({ kind: "proof" });
    expect(parseWineAlcoholStatement("12.5")).toEqual({ kind: "malformed" }); // unitless
    expect(parseWineAlcoholStatement("12.5% v/v")).toEqual({ kind: "malformed" }); // unsupported abbr
    expect(parseWineAlcoholStatement("13% vol")).toEqual({ kind: "malformed" });
    expect(parseWineAlcoholStatement("13 by volume")).toEqual({ kind: "malformed" });
    expect(parseWineAlcoholStatement("Alcohol 13% to 11% by volume")).toEqual({
      kind: "malformed",
    });
    expect(parseWineAlcoholStatement("Contains 12.5% grape juice")).toEqual({ kind: "malformed" });
    expect(parseWineAlcoholStatement("12.5% alc./vol. and 13% alc./vol.")).toEqual({
      kind: "malformed",
    });
  });

  // Regression: a lawful marker embedded in unrelated prose is not a lawful
  // statement. The whole normalized string must match a permitted grammar.
  it("rejects a valid marker embedded in surrounding prose (unanchored)", () => {
    for (const s of [
      "Contains 12.5% poison by volume",
      "Alcohol 12.5% by volume definitely not wine",
      "12.5% random words alc by vol",
      "notice: 12.5% alc./vol. extra",
      "This wine is 12.5% alc./vol. and delicious",
    ]) {
      expect(parseWineAlcoholStatement(s)).toEqual({ kind: "malformed" });
    }
  });
});

describe("wine-alcohol-syntax", () => {
  it("passes a direct statement with a distinct reason", () => {
    const f = syntax({ observation: obs("12.5% ALC./VOL.") });
    expect([f.ruleExecutionStatus, f.findingStatus]).toEqual(["executed", "PASS"]);
    expect(f.message).toMatch(/WINE_ALC_SYNTAX_DIRECT/);
  });

  it("passes permitted direct wording variants", () => {
    expect(syntax({ observation: obs("Alcohol 12.5% by volume") }).findingStatus).toBe("PASS");
    expect(syntax({ observation: obs("12.5% alc by vol") }).findingStatus).toBe("PASS");
    expect(syntax({ observation: obs("13.5% by vol.") }).findingStatus).toBe("PASS");
    expect(syntax({ observation: obs("ALCOHOL 13.5 BY VOLUME") }).findingStatus).toBe("PASS");
  });

  it("passes a range statement with a distinct reason", () => {
    const f = syntax({ observation: obs("Alcohol 11% to 13% by volume") });
    expect(f.findingStatus).toBe("PASS");
    expect(f.message).toMatch(/WINE_ALC_SYNTAX_RANGE/);
  });

  it("fails proof, unitless, unsupported abbreviations, reversed ranges, and malformed", () => {
    expect(syntax({ observation: obs("80 proof") }).findingStatus).toBe("FAIL");
    expect(syntax({ observation: obs("12.5") }).findingStatus).toBe("FAIL");
    expect(syntax({ observation: obs("12.5% v/v") }).findingStatus).toBe("FAIL");
    expect(syntax({ observation: obs("13% vol") }).findingStatus).toBe("FAIL");
    expect(syntax({ observation: obs("13% to 11% by volume") }).findingStatus).toBe("FAIL");
    expect(syntax({ observation: obs("12.x% by volume") }).findingStatus).toBe("FAIL");
  });

  // Regression: prose surrounding a valid marker must FAIL the syntax rule.
  it("fails prose that merely embeds a valid alcohol marker", () => {
    for (const s of [
      "Contains 12.5% poison by volume",
      "Alcohol 12.5% by volume definitely not wine",
      "12.5% random words alc by vol",
      "notice: 12.5% alc./vol. extra",
    ]) {
      const f = syntax({ observation: obs(s) });
      expect(f.findingStatus).toBe("FAIL");
      expect(f.message).toMatch(/WINE_ALC_SYNTAX_MALFORMED/);
    }
  });

  it("returns not_run for insufficient evidence", () => {
    const f = syntax({ observation: obs("12.5% ALC./VOL."), evidenceStatus: "insufficient" });
    expect([f.ruleExecutionStatus, f.findingStatus]).toEqual([
      "not_run_insufficient_evidence",
      "not_run",
    ]);
    expect(f.evidenceReferences).toHaveLength(0);
  });

  it("does not suppress low-confidence evidence", () => {
    const f = syntax({
      observation: obs("12.5% ALC./VOL.", { state: "LOW_CONFIDENCE", confidence: 0.05 }),
    });
    expect(f.findingStatus).toBe("PASS");
    expect(f.evidenceReferences[0].observationState).toBe("LOW_CONFIDENCE");
    expect(f.evidenceReferences[0].confidence).toBe(0.05);
  });

  it("returns NEEDS_REVIEW for ambiguous evidence", () => {
    const f = syntax({
      observation: obs("12.5% ALC./VOL.", {
        state: "AMBIGUOUS",
        alternates: [{ value: "13% ALC./VOL.", confidence: 0.4 }],
      }),
    });
    expect([f.ruleExecutionStatus, f.findingStatus]).toEqual(["executed", "NEEDS_REVIEW"]);
  });

  it("does not turn NOT_OBSERVED with sufficient evidence into a false pass", () => {
    const f = syntax({ observation: obs(null, { state: "NOT_OBSERVED" }) });
    expect([f.ruleExecutionStatus, f.findingStatus]).toEqual(["executed", "NEEDS_REVIEW"]);
    expect(f.message).toMatch(/WINE_ALC_SYNTAX_NOT_OBSERVED/);
  });
});

describe("wine-alcohol-declared-comparison", () => {
  it("passes on exact agreement", () => {
    const f = compare({ declared: "12.5", observation: obs("12.5% ALC./VOL.") });
    expect([f.ruleExecutionStatus, f.findingStatus]).toEqual(["executed", "PASS"]);
    expect(f.message).toMatch(/WINE_ALC_EXACT_AGREEMENT/);
  });

  it("fails on a clear mismatch", () => {
    expect(compare({ declared: "13", observation: obs("12.5% ALC./VOL.") }).findingStatus).toBe(
      "FAIL",
    );
  });

  it("is categorically tolerance-free: a 0.1 difference still fails", () => {
    expect(compare({ declared: "12.6", observation: obs("12.5% ALC./VOL.") }).findingStatus).toBe(
      "FAIL",
    );
    // No ±1.0 / ±1.5 tolerance: a 1.0-point difference fails.
    expect(compare({ declared: "13.5", observation: obs("12.5% ALC./VOL.") }).findingStatus).toBe(
      "FAIL",
    );
    // No ±1.5 tolerance either.
    expect(compare({ declared: "14.0", observation: obs("12.5% ALC./VOL.") }).findingStatus).toBe(
      "FAIL",
    );
  });

  it("returns NEEDS_REVIEW for a missing declared value", () => {
    const f = compare({ observation: obs("12.5% ALC./VOL.") });
    expect(f.findingStatus).toBe("NEEDS_REVIEW");
    expect(f.message).toMatch(/WINE_ALC_DECLARED_MISSING/);
  });

  it("returns NEEDS_REVIEW for a malformed declared value", () => {
    const f = compare({ declared: "twelve", observation: obs("12.5% ALC./VOL.") });
    expect(f.findingStatus).toBe("NEEDS_REVIEW");
    expect(f.message).toMatch(/WINE_ALC_DECLARED_MALFORMED/);
  });

  it("returns NEEDS_REVIEW for an ambiguous observed value", () => {
    const f = compare({
      declared: "12.5",
      observation: obs("12.5% ALC./VOL.", {
        state: "AMBIGUOUS",
        alternates: [{ value: "13% ALC./VOL.", confidence: 0.4 }],
      }),
    });
    expect(f.findingStatus).toBe("NEEDS_REVIEW");
  });

  it("does not silently collapse an observed range to a single value", () => {
    const f = compare({ declared: "12", observation: obs("Alcohol 11% to 13% by volume") });
    expect(f.findingStatus).toBe("NEEDS_REVIEW");
    expect(f.message).toMatch(/WINE_ALC_OBSERVED_RANGE/);
  });

  it("bypasses any actual-content-tagged input and compares only the application value", () => {
    // An actual-content value under a different key must never enter the
    // comparison; the result stays based on the application-declared value.
    const f = compare({
      declared: "12.5",
      observation: obs("12.5% ALC./VOL."),
      extraFacts: { actualAlcoholContent: declaredFact("13.0") },
    });
    expect(f.findingStatus).toBe("PASS");
  });
});

describe("wine-alcohol actual-content external-dependency rules", () => {
  const cases: Array<[typeof wineAlcoholActualToleranceRule, RegExp]> = [
    [wineAlcoholActualToleranceRule, /actual alcohol content with provenance/],
    [wineAlcoholOmissionEligibilityRule, /table\/light-wine designation evidence/],
    [wineAlcoholClassTypeBoundaryRule, /class\/type or taxable-boundary evidence/],
  ];

  it("do not execute and name their exact missing dependency", () => {
    for (const [rule, dependency] of cases) {
      const f = rule.evaluate(ctx({ observation: obs("12.5% ALC./VOL.") }));
      expect(validateVerificationFinding(f).ok).toBe(true);
      expect([f.ruleExecutionStatus, f.findingStatus]).toEqual([
        "not_run_external_dependency",
        "not_run",
      ]);
      expect(f.externalEvidenceDependency).toMatch(dependency);
      // No artwork-derived value is ever accepted as actual content.
      expect(f.evidenceReferences).toHaveLength(0);
    }
  });
});

describe("wine-alcohol finding contract", () => {
  it("copies rule, profile, and authority versions and cites 4.36", () => {
    const f = syntax({ observation: obs("12.5% ALC./VOL.") });
    expect(f.ruleId).toBe("wine-alcohol-syntax");
    expect(f.ruleVersion).toBe("1.0.0");
    expect(f.profileId).toBe("wine-precheck");
    expect(f.profileVersion).toBe("1.0.0");
    expect(f.authority.citation).toBe("27 CFR 4.36");
    expect(f.authority.snapshotDate).toBe("2026-07-10");
  });

  it("preserves evidence state, confidence, and geometry in the evidence reference", () => {
    const f = compare({
      declared: "12.5",
      observation: obs("12.5% ALC./VOL.", { geometry: geometry() }),
    });
    const ref = f.evidenceReferences[0];
    expect(ref.derivativeSha256).toBe(SHA);
    expect(ref.fieldId).toBe("alcoholStatement");
    expect(ref.observationState).toBe("OBSERVED");
    expect(ref.confidence).toBe(0.95);
    expect(ref.geometry).toEqual(geometry());
  });

  it("serializes identical inputs to identical findings", () => {
    const build = () =>
      wineAlcoholDeclaredComparisonRule.evaluate(
        ctx({ declared: "12.5", observation: obs("12.5% ALC./VOL.") }),
      );
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});

describe("wine-alcohol module independence", () => {
  it("imports no proof, report, UI, disposition, warning, external-AI, or actual-content-ingestion modules", () => {
    for (const file of ["wine-alcohol.rule.ts", "wine-alcohol-parse.ts"]) {
      const source = readFileSync(join(process.cwd(), "src/domain/rules", file), "utf8");
      const importPaths = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const path of importPaths) {
        expect(path).not.toMatch(
          /report|features|app\/|disposition|warning|openai|external|intake|extract/,
        );
      }
    }
  });
});
