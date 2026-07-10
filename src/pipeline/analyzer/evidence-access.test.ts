import { describe, expect, it } from "vitest";

import type { AnalyzerFieldObservation } from "./analyzer.types";
import { readObservation } from "./evidence-access";

function observation(overrides: Partial<AnalyzerFieldObservation>): AnalyzerFieldObservation {
  return {
    state: "OBSERVED",
    value: "M CELLARS",
    confidence: 0.95,
    alternates: [],
    ...overrides,
  };
}

describe("readObservation", () => {
  it("returns the value for OBSERVED", () => {
    const access = readObservation(observation({ state: "OBSERVED", value: "M CELLARS" }));
    expect(access).toEqual({
      value: "M CELLARS",
      state: "OBSERVED",
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
        alternates: [{ value: "13% ALC./VOL.", confidence: 0.4 }],
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
