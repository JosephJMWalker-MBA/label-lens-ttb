import { describe, expect, it } from "vitest";

import { MAX_EVIDENCE_STRING, geometrySchema, observationSchema } from "./evidence.schema";

function geometry(overrides: Record<string, number> = {}) {
  return {
    imageIndex: 0,
    x: 10,
    y: 20,
    width: 100,
    height: 30,
    imageWidth: 494,
    imageHeight: 214,
    ...overrides,
  };
}

function observed(overrides: Record<string, unknown> = {}) {
  return {
    state: "OBSERVED",
    value: "M CELLARS",
    normalizedValue: "M CELLARS",
    rawText: "M CELLARS",
    confidence: 0.9,
    geometry: geometry(),
    alternates: [],
    ...overrides,
  };
}

describe("geometrySchema — bounds and numeric hygiene", () => {
  it("accepts an in-bounds integer box", () => {
    expect(geometrySchema.safeParse(geometry()).success).toBe(true);
  });

  const rejects: [string, Record<string, number>][] = [
    ["x + width exceeds imageWidth", { x: 400, width: 100, imageWidth: 494 }],
    ["y + height exceeds imageHeight", { y: 200, height: 30, imageHeight: 214 }],
    ["zero width", { width: 0 }],
    ["negative height", { height: -5 }],
    ["negative x", { x: -1 }],
    ["non-integer x", { x: 10.5 }],
  ];
  it.each(rejects)("rejects %s", (_label, patch) => {
    expect(geometrySchema.safeParse(geometry(patch)).success).toBe(false);
  });

  it("rejects non-finite and negative-zero coordinates", () => {
    expect(geometrySchema.safeParse(geometry({ x: Number.POSITIVE_INFINITY })).success).toBe(false);
    expect(geometrySchema.safeParse(geometry({ width: Number.NaN })).success).toBe(false);
    expect(geometrySchema.safeParse(geometry({ x: -0 })).success).toBe(false);
    expect(geometrySchema.safeParse(geometry({ y: Number.MAX_SAFE_INTEGER + 2 })).success).toBe(
      false,
    );
  });
});

describe("observationSchema — state-dependent semantic invariants", () => {
  it("accepts a well-formed OBSERVED / LOW_CONFIDENCE / AMBIGUOUS / NOT_OBSERVED", () => {
    expect(observationSchema.safeParse(observed()).success).toBe(true);
    expect(
      observationSchema.safeParse(observed({ state: "LOW_CONFIDENCE", confidence: 0.1 })).success,
    ).toBe(true);
    expect(
      observationSchema.safeParse(
        observed({ state: "AMBIGUOUS", alternates: [{ value: "N CELLARS", confidence: 0.4 }] }),
      ).success,
    ).toBe(true);
    expect(
      observationSchema.safeParse({
        state: "NOT_OBSERVED",
        value: null,
        confidence: 0,
        alternates: [],
      }).success,
    ).toBe(true);
  });

  const rejects: [string, Record<string, unknown>][] = [
    [
      "NOT_OBSERVED with a value",
      { state: "NOT_OBSERVED", value: "X", confidence: 0, alternates: [] },
    ],
    [
      "NOT_OBSERVED with a normalized candidate",
      { state: "NOT_OBSERVED", value: null, normalizedValue: "X", confidence: 0, alternates: [] },
    ],
    [
      "NOT_OBSERVED with stale raw text",
      { state: "NOT_OBSERVED", value: null, rawText: "X", confidence: 0, alternates: [] },
    ],
    [
      "NOT_OBSERVED with nonzero confidence",
      { state: "NOT_OBSERVED", value: null, confidence: 0.5, alternates: [] },
    ],
    [
      "NOT_OBSERVED with geometry",
      { state: "NOT_OBSERVED", value: null, confidence: 0, geometry: geometry(), alternates: [] },
    ],
    ["OBSERVED without value", observed({ value: null })],
    ["OBSERVED without raw text", { ...observed(), rawText: undefined }],
    ["OBSERVED without normalized candidate", { ...observed(), normalizedValue: undefined }],
    ["OBSERVED without geometry", { ...observed(), geometry: undefined }],
    ["LOW_CONFIDENCE without retained value", observed({ state: "LOW_CONFIDENCE", value: null })],
    ["AMBIGUOUS without alternates", observed({ state: "AMBIGUOUS", alternates: [] })],
    [
      "duplicate alternates",
      observed({
        state: "AMBIGUOUS",
        alternates: [
          { value: "N CELLARS", confidence: 0.4, geometry: geometry() },
          { value: "N CELLARS", confidence: 0.4, geometry: geometry() },
        ],
      }),
    ],
    [
      "alternate identical to selected value",
      observed({ state: "AMBIGUOUS", alternates: [{ value: "M CELLARS", confidence: 0.4 }] }),
    ],
    ["confidence below 0", observed({ confidence: -0.1 })],
    ["confidence above 1", observed({ confidence: 1.1 })],
    ["out-of-bounds geometry", observed({ geometry: geometry({ x: 480, width: 100 }) })],
    ["oversized string", observed({ value: "M".repeat(MAX_EVIDENCE_STRING + 1) })],
    ["whitespace-only raw text is empty", observed({ rawText: "" })],
  ];
  it.each(rejects)("rejects %s", (_label, candidate) => {
    expect(observationSchema.safeParse(candidate).success).toBe(false);
  });
});
