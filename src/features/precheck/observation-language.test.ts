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
      NOT_OBSERVED: "Not found",
    });
    expect(observationStateLabel("AMBIGUOUS")).toBe("Multiple possibilities");
  });
});

describe("concise summary values", () => {
  it("shows the extracted brand, or an honest could-not-identify", () => {
    expect(summarizeBrand(observations(obs({ value: "M CELLARS" }), obs()))).toBe("M CELLARS");
    expect(summarizeBrand(observations(obs({ state: "NOT_OBSERVED", value: null }), obs()))).toBe(
      "Could not identify safely",
    );
  });

  it("shows the extracted alcohol, or an honest not-found", () => {
    expect(summarizeAlcohol(observations(obs(), obs({ value: "12.5% ALC./VOL." })))).toBe(
      "12.5% ALC./VOL.",
    );
    expect(summarizeAlcohol(observations(obs(), obs({ state: "NOT_OBSERVED", value: null })))).toBe(
      "Not found on the submitted artwork",
    );
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

describe("next action", () => {
  it("directs to clearer artwork when nothing was found", () => {
    const o = observations(
      obs({ state: "NOT_OBSERVED", value: null }),
      obs({ state: "NOT_OBSERVED", value: null }),
    );
    expect(nextAction(o, 0)).toMatch(/no supported evidence was found/i);
  });

  it("directs to brand candidates when the brand is ambiguous", () => {
    const o = observations(obs({ state: "AMBIGUOUS" }), obs());
    expect(nextAction(o, 0)).toBe("Review the highlighted brand candidates.");
  });

  it("directs to the alcohol statement when alcohol is missing", () => {
    const o = observations(obs(), obs({ state: "NOT_OBSERVED", value: null }));
    expect(nextAction(o, 0)).toBe("Confirm where the alcohol statement appears.");
  });

  it("directs to comparison when both fields are found cleanly", () => {
    expect(nextAction(observations(obs(), obs()), 0)).toBe(
      "Compare the extracted evidence with the application facts.",
    );
  });
});
