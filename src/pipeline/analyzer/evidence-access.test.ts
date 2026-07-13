import { describe, expect, it } from "vitest";

import type { AnalyzerFieldObservation } from "./analyzer.types";
import { readObservation } from "./evidence-access";

function observation(overrides: Partial<AnalyzerFieldObservation>): AnalyzerFieldObservation {
  const ocrEvidenceScore = overrides.ocrEvidenceScore ?? overrides.confidence ?? 0.95;
  return {
    state: "OBSERVED",
    value: "M CELLARS",
    confidence: ocrEvidenceScore,
    ocrEvidenceScore,
    alternates: [],
    ...overrides,
  };
}

function alt(value: string, score: number): AnalyzerFieldObservation["alternates"][number] {
  return {
    value,
    confidence: score,
    ocrEvidenceScore: score,
    ocrConfidence: {
      aggregation: "mean",
      rawScale: "0-100",
      rawTokenConfidences: [Math.round(score * 100)],
      rawMean: Math.round(score * 100),
      rawMin: Math.round(score * 100),
      rawMax: Math.round(score * 100),
      missingTokenCount: 0,
    },
    candidateProvenance: {
      passId: `pass-${value}`,
      passKind: "full-image-primary",
      triggerReasons: ["primary-pass"],
      preprocessing: ["grayscale"],
      regionName: "alcohol",
      supportingPassIds: [`pass-${value}`],
      supportingPassKinds: ["full-image-primary"],
      recoveryPassUsed: false,
    },
    ranking: {
      strategy: "alcohol-ocr-evidence-comparator",
      orderingMode: "ocr-evidence-first",
      comparator: [
        { id: "ocr-evidence-score", direction: "desc", value: score },
        { id: "normalized-value-key", direction: "asc", value: value.toLowerCase() },
      ],
    },
  };
}

describe("readObservation", () => {
  it("returns the value for OBSERVED", () => {
    const access = readObservation(observation({ state: "OBSERVED", value: "M CELLARS" }));
    expect(access).toEqual({
      value: "M CELLARS",
      state: "OBSERVED",
      ocrEvidenceScore: 0.95,
      confidence: 0.95,
      isPresent: true,
    });
  });

  it("returns the value for LOW_CONFIDENCE without gating on confidence", () => {
    const access = readObservation(
      observation({ state: "LOW_CONFIDENCE", value: "M CELLARS", confidence: 0.05 }),
    );
    expect(access.value).toBe("M CELLARS");
    expect(access.isPresent).toBe(true);
    expect(access.confidence).toBe(0.05);
  });

  it("returns the primary value for AMBIGUOUS and preserves the state", () => {
    const access = readObservation(
      observation({
        state: "AMBIGUOUS",
        value: "12.5% ALC./VOL.",
        alternates: [alt("13% ALC./VOL.", 0.4)],
      }),
    );
    expect(access.value).toBe("12.5% ALC./VOL.");
    expect(access.state).toBe("AMBIGUOUS");
  });

  it("returns absence only for NOT_OBSERVED", () => {
    const access = readObservation(
      observation({ state: "NOT_OBSERVED", value: null, confidence: 0 }),
    );
    expect(access.value).toBeNull();
    expect(access.isPresent).toBe(false);
  });

  it("carries state and confidence so low confidence is not mistaken for high", () => {
    const low = readObservation(observation({ state: "LOW_CONFIDENCE", confidence: 0.1 }));
    const high = readObservation(observation({ state: "OBSERVED", confidence: 0.99 }));
    expect(low.value).toBe(high.value);
    expect(low.state).not.toBe(high.state);
    expect(low.confidence).toBeLessThan(high.confidence);
  });
});
