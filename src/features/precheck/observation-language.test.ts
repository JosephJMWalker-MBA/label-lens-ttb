import { describe, expect, it } from "vitest";

import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type { ResultObservations } from "@/pipeline/result/result.types";

import {
  OBSERVATION_STATE_LABEL,
  countChecksNeedingReview,
  executedFindings,
  nextAction,
  notRunFindings,
  observationStateLabel,
  summarizeAlcohol,
  summarizeBrand,
} from "./observation-language";

const obs = (over: Partial<AnalyzerFieldObservation> = {}): AnalyzerFieldObservation => ({
  state: "OBSERVED",
  value: "value",
  confidence: 0.9,
  alternates: [],
  ...over,
});

function observations(
  brand: AnalyzerFieldObservation,
  alcohol: AnalyzerFieldObservation,
): ResultObservations {
  return {
    provenance: {
      artifactRef: "a",
      derivativeSha256: "b".repeat(64),
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0" },
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
      processedAt: "t",
    },
    brandName: brand,
    alcoholStatement: alcohol,
  };
}

function finding(over: Partial<VerificationFinding>): VerificationFinding {
  return {
    ruleId: "r",
    ruleVersion: "1.0.0",
    profileId: "wine-precheck",
    profileVersion: "1.0.0",
    authority: { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" },
    findingStatus: "PASS",
    ruleExecutionStatus: "executed",
    evidenceReferences: [],
    message: "m",
    ...over,
  };
}

describe("plain-language observation states", () => {
  it("maps every machine state to a readable label", () => {
    expect(OBSERVATION_STATE_LABEL).toEqual({
      OBSERVED: "Found",
      LOW_CONFIDENCE: "Found with low confidence",
      AMBIGUOUS: "Multiple possibilities",
      NOT_OBSERVED: "Not detected",
    });
    expect(observationStateLabel("AMBIGUOUS")).toBe("Multiple possibilities");
  });

  it("does not claim NOT_OBSERVED means the text is absent from the artwork", () => {
    // "Not detected" is about the extractor's performance, not image reality.
    const label = observationStateLabel("NOT_OBSERVED");
    expect(label).toBe("Not detected");
    expect(label).not.toMatch(/absent|not (present|on the)|missing from/i);
  });
});

describe("concise summary values", () => {
  it("shows the extracted brand, or an honest could-not-identify", () => {
    expect(summarizeBrand(observations(obs({ value: "M CELLARS" }), obs()))).toBe("M CELLARS");
    expect(summarizeBrand(observations(obs({ state: "NOT_OBSERVED", value: null }), obs()))).toBe(
      "Could not identify safely",
    );
  });

  it("shows the extracted alcohol, or an honest not-detected", () => {
    expect(summarizeAlcohol(observations(obs(), obs({ value: "12.5% ALC./VOL." })))).toBe(
      "12.5% ALC./VOL.",
    );
    const missing = summarizeAlcohol(
      observations(obs(), obs({ state: "NOT_OBSERVED", value: null })),
    );
    expect(missing).toBe("Not detected in the submitted artwork");
    // It must not assert the statement is definitively absent from the artwork.
    expect(missing).not.toMatch(/\bnot (present|on|found)\b|absent|missing from/i);
  });
});

describe("review counting and finding partition", () => {
  const findings = [
    finding({ ruleId: "a", findingStatus: "PASS", ruleExecutionStatus: "executed" }),
    finding({ ruleId: "b", findingStatus: "NEEDS_REVIEW", ruleExecutionStatus: "executed" }),
    finding({ ruleId: "c", findingStatus: "FAIL", ruleExecutionStatus: "executed" }),
    finding({
      ruleId: "d",
      findingStatus: "not_run",
      ruleExecutionStatus: "not_run_external_dependency",
    }),
  ];

  it("counts only executed, non-clearing findings as needing review", () => {
    expect(countChecksNeedingReview(findings)).toBe(2); // b, c — not the not_run one
  });

  it("partitions executed vs not-run preserving order", () => {
    expect(executedFindings(findings).map((f) => f.ruleId)).toEqual(["a", "b", "c"]);
    expect(notRunFindings(findings).map((f) => f.ruleId)).toEqual(["d"]);
  });
});

describe("next action (finding-aware)", () => {
  const clean = observations(obs(), obs());
  const review = (ruleId: string) =>
    finding({ ruleId, findingStatus: "NEEDS_REVIEW", ruleExecutionStatus: "executed" });

  it("1 · ambiguous brand → review brand candidates (even if alcohol checks need review)", () => {
    const o = observations(obs({ state: "AMBIGUOUS" }), obs());
    expect(nextAction(o, [review("wine-alcohol-syntax")])).toBe(
      "Review the highlighted brand candidates.",
    );
  });

  it("2 · alcohol not detected → confirm where the statement appears", () => {
    const o = observations(obs(), obs({ state: "NOT_OBSERVED", value: null }));
    expect(nextAction(o, [])).toBe("Confirm where the alcohol statement appears.");
  });

  it("3 · alcohol-only review (brand found cleanly) → compare alcohol with application facts", () => {
    // The old fallback wrongly said "review brand candidates" here.
    expect(nextAction(clean, [review("wine-alcohol-declared-comparison")])).toBe(
      "Compare the alcohol evidence with the application facts.",
    );
    expect(nextAction(clean, [review("wine-alcohol-syntax")])).toBe(
      "Compare the alcohol evidence with the application facts.",
    );
  });

  it("4 · brand-only review → compare the detected brand with the application brand", () => {
    expect(nextAction(clean, [review("brand-name-canonical-comparison")])).toBe(
      "Compare the detected brand with the application brand.",
    );
  });

  it("5 · another executed finding needs review → review the highlighted findings", () => {
    expect(nextAction(clean, [review("some-other-executed-rule")])).toBe(
      "Review the highlighted findings.",
    );
  });

  it("6 · no executed finding needs review → compare extracted evidence with application facts", () => {
    expect(
      nextAction(clean, [
        finding({ ruleId: "wine-alcohol-syntax", findingStatus: "PASS" }),
        finding({
          ruleId: "wine-alcohol-actual-content-tolerance",
          findingStatus: "not_run",
          ruleExecutionStatus: "not_run_external_dependency",
        }),
      ]),
    ).toBe("Compare the extracted evidence with the application facts.");
  });

  it("ignores not-run alcohol dependencies when choosing the action", () => {
    // A not-run external dependency must not trigger the alcohol-compare action.
    expect(
      nextAction(clean, [
        finding({
          ruleId: "wine-alcohol-declared-comparison",
          findingStatus: "not_run",
          ruleExecutionStatus: "not_run_external_dependency",
        }),
      ]),
    ).toBe("Compare the extracted evidence with the application facts.");
  });
});
