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
  const ocrEvidenceScore = 0.9;
  return {
    state: "OBSERVED",
    value: "M CELLARS",
    normalizedValue: "M CELLARS",
    rawText: "M CELLARS",
    confidence: ocrEvidenceScore,
    ocrEvidenceScore,
    ocrConfidence: {
      aggregation: "mean",
      rawScale: "0-100",
      rawTokenConfidences: [90],
      rawMean: 90,
      rawMin: 90,
      rawMax: 90,
      missingTokenCount: 0,
    },
    candidateProvenance: {
      passId: "pass-0-full-image",
      passKind: "full-image-primary",
      triggerReasons: ["primary-pass"],
      preprocessing: ["grayscale"],
      regionName: "brand",
      supportingPassIds: ["pass-0-full-image"],
      supportingPassKinds: ["full-image-primary"],
      recoveryPassUsed: false,
    },
    ranking: {
      strategy: "brand-mixed-prominence-score",
      orderingMode: "score-first",
      comparator: [
        { id: "score-eligibility", direction: "desc", value: true },
        { id: "ranking-score", direction: "desc", value: 5.4 },
        { id: "prominence", direction: "desc", value: 30 },
        { id: "ocr-evidence-score", direction: "desc", value: ocrEvidenceScore },
        { id: "normalized-value-key", direction: "asc", value: "mcellars" },
      ],
      rankingScore: 5.4,
      scoreFactors: [
        { id: "positive-signal", value: 1, contribution: 2, direction: "benefit" },
        {
          id: "ocr-evidence-score",
          value: ocrEvidenceScore,
          contribution: ocrEvidenceScore,
          direction: "benefit",
        },
      ],
    },
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
      observationSchema.safeParse(
        observed({ state: "LOW_CONFIDENCE", confidence: 0.1, ocrEvidenceScore: 0.1 }),
      ).success,
    ).toBe(true);
    expect(
      observationSchema.safeParse(
        observed({
          state: "AMBIGUOUS",
          alternates: [
            {
              value: "N CELLARS",
              confidence: 0.4,
              ocrEvidenceScore: 0.4,
              ocrConfidence: {
                aggregation: "mean",
                rawScale: "0-100",
                rawTokenConfidences: [40],
                rawMean: 40,
                rawMin: 40,
                rawMax: 40,
                missingTokenCount: 0,
              },
              candidateProvenance: {
                passId: "pass-1-alt",
                passKind: "full-image-primary",
                triggerReasons: ["primary-pass"],
                preprocessing: ["grayscale"],
                regionName: "brand",
                supportingPassIds: ["pass-1-alt"],
                supportingPassKinds: ["full-image-primary"],
                recoveryPassUsed: false,
              },
              ranking: {
                strategy: "brand-mixed-prominence-score",
                orderingMode: "score-first",
                comparator: [
                  { id: "score-eligibility", direction: "desc", value: true },
                  { id: "ranking-score", direction: "desc", value: 4.2 },
                  { id: "prominence", direction: "desc", value: 24 },
                  { id: "ocr-evidence-score", direction: "desc", value: 0.4 },
                  { id: "normalized-value-key", direction: "asc", value: "ncellars" },
                ],
                rankingScore: 4.2,
                scoreFactors: [
                  { id: "positive-signal", value: 1, contribution: 2, direction: "benefit" },
                  { id: "ocr-evidence-score", value: 0.4, contribution: 0.4, direction: "benefit" },
                ],
              },
            },
          ],
        }),
      ).success,
    ).toBe(true);
    expect(
      observationSchema.safeParse({
        state: "NOT_OBSERVED",
        value: null,
        confidence: 0,
        ocrEvidenceScore: 0,
        alternates: [],
      }).success,
    ).toBe(true);
  });

  it("accepts explicit missing raw OCR confidence when every token is missing", () => {
    expect(
      observationSchema.safeParse(
        observed({
          ocrConfidence: {
            aggregation: "mean",
            rawScale: "0-100",
            rawTokenConfidences: [null, null],
            rawMean: null,
            rawMin: null,
            rawMax: null,
            missingTokenCount: 2,
          },
        }),
      ).success,
    ).toBe(true);
  });

  it("accepts mixed missing and zero raw OCR confidence without collapsing them", () => {
    const parsed = observationSchema.safeParse(
      observed({
        ocrConfidence: {
          aggregation: "mean",
          rawScale: "0-100",
          rawTokenConfidences: [0, null, 50],
          rawMean: 25,
          rawMin: 0,
          rawMax: 50,
          missingTokenCount: 1,
        },
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.ocrConfidence?.rawTokenConfidences).toEqual([0, null, 50]);
    expect(parsed.data.ocrConfidence?.rawMin).toBe(0);
  });

  const rejects: [string, Record<string, unknown>][] = [
    [
      "NOT_OBSERVED with a value",
      { state: "NOT_OBSERVED", value: "X", confidence: 0, ocrEvidenceScore: 0, alternates: [] },
    ],
    [
      "NOT_OBSERVED with a normalized candidate",
      {
        state: "NOT_OBSERVED",
        value: null,
        normalizedValue: "X",
        confidence: 0,
        ocrEvidenceScore: 0,
        alternates: [],
      },
    ],
    [
      "NOT_OBSERVED with stale raw text",
      {
        state: "NOT_OBSERVED",
        value: null,
        rawText: "X",
        confidence: 0,
        ocrEvidenceScore: 0,
        alternates: [],
      },
    ],
    [
      "NOT_OBSERVED with nonzero confidence",
      {
        state: "NOT_OBSERVED",
        value: null,
        confidence: 0.5,
        ocrEvidenceScore: 0.5,
        alternates: [],
      },
    ],
    [
      "NOT_OBSERVED with geometry",
      {
        state: "NOT_OBSERVED",
        value: null,
        confidence: 0,
        ocrEvidenceScore: 0,
        geometry: geometry(),
        alternates: [],
      },
    ],
    [
      "NOT_OBSERVED with stale OCR confidence semantics",
      {
        state: "NOT_OBSERVED",
        value: null,
        confidence: 0,
        ocrEvidenceScore: 0,
        ocrConfidence: {
          aggregation: "mean",
          rawScale: "0-100",
          rawTokenConfidences: [40],
          rawMean: 40,
          rawMin: 40,
          rawMax: 40,
          missingTokenCount: 0,
        },
        alternates: [],
      },
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
          {
            value: "N CELLARS",
            confidence: 0.4,
            ocrEvidenceScore: 0.4,
            geometry: geometry(),
            ocrConfidence: {
              aggregation: "mean",
              rawScale: "0-100",
              rawTokenConfidences: [40],
              rawMean: 40,
              rawMin: 40,
              rawMax: 40,
              missingTokenCount: 0,
            },
            candidateProvenance: {
              passId: "alt-0",
              passKind: "full-image-primary",
              triggerReasons: ["primary-pass"],
              preprocessing: ["grayscale"],
              regionName: "brand",
              supportingPassIds: ["alt-0"],
              supportingPassKinds: ["full-image-primary"],
              recoveryPassUsed: false,
            },
            ranking: {
              strategy: "brand-mixed-prominence-score",
              orderingMode: "score-first",
              comparator: [
                { id: "score-eligibility", direction: "desc", value: true },
                { id: "ranking-score", direction: "desc", value: 4.2 },
                { id: "prominence", direction: "desc", value: 24 },
                { id: "ocr-evidence-score", direction: "desc", value: 0.4 },
                { id: "normalized-value-key", direction: "asc", value: "ncellars" },
              ],
              rankingScore: 4.2,
              scoreFactors: [
                { id: "positive-signal", value: 1, contribution: 2, direction: "benefit" },
                { id: "ocr-evidence-score", value: 0.4, contribution: 0.4, direction: "benefit" },
              ],
            },
          },
          {
            value: "N CELLARS",
            confidence: 0.4,
            ocrEvidenceScore: 0.4,
            geometry: geometry(),
            ocrConfidence: {
              aggregation: "mean",
              rawScale: "0-100",
              rawTokenConfidences: [40],
              rawMean: 40,
              rawMin: 40,
              rawMax: 40,
              missingTokenCount: 0,
            },
            candidateProvenance: {
              passId: "alt-1",
              passKind: "full-image-primary",
              triggerReasons: ["primary-pass"],
              preprocessing: ["grayscale"],
              regionName: "brand",
              supportingPassIds: ["alt-1"],
              supportingPassKinds: ["full-image-primary"],
              recoveryPassUsed: false,
            },
            ranking: {
              strategy: "brand-mixed-prominence-score",
              orderingMode: "score-first",
              comparator: [
                { id: "score-eligibility", direction: "desc", value: true },
                { id: "ranking-score", direction: "desc", value: 4.2 },
                { id: "prominence", direction: "desc", value: 24 },
                { id: "ocr-evidence-score", direction: "desc", value: 0.4 },
                { id: "normalized-value-key", direction: "asc", value: "ncellars" },
              ],
              rankingScore: 4.2,
              scoreFactors: [
                { id: "positive-signal", value: 1, contribution: 2, direction: "benefit" },
                { id: "ocr-evidence-score", value: 0.4, contribution: 0.4, direction: "benefit" },
              ],
            },
          },
          {
            value: "N CELLARS",
            confidence: 0.4,
            ocrEvidenceScore: 0.4,
            geometry: geometry(),
            ocrConfidence: {
              aggregation: "mean",
              rawScale: "0-100",
              rawTokenConfidences: [40],
              rawMean: 40,
              rawMin: 40,
              rawMax: 40,
              missingTokenCount: 0,
            },
            candidateProvenance: {
              passId: "alt-2",
              passKind: "full-image-primary",
              triggerReasons: ["primary-pass"],
              preprocessing: ["grayscale"],
              regionName: "brand",
              supportingPassIds: ["alt-2"],
              supportingPassKinds: ["full-image-primary"],
              recoveryPassUsed: false,
            },
            ranking: {
              strategy: "brand-mixed-prominence-score",
              orderingMode: "score-first",
              comparator: [
                { id: "score-eligibility", direction: "desc", value: true },
                { id: "ranking-score", direction: "desc", value: 4.2 },
                { id: "prominence", direction: "desc", value: 24 },
                { id: "ocr-evidence-score", direction: "desc", value: 0.4 },
                { id: "normalized-value-key", direction: "asc", value: "ncellars" },
              ],
              rankingScore: 4.2,
              scoreFactors: [
                { id: "positive-signal", value: 1, contribution: 2, direction: "benefit" },
                { id: "ocr-evidence-score", value: 0.4, contribution: 0.4, direction: "benefit" },
              ],
            },
          },
        ],
      }),
    ],
    [
      "alternate identical to selected value",
      observed({
        state: "AMBIGUOUS",
        alternates: [
          {
            value: "M CELLARS",
            confidence: 0.4,
            ocrEvidenceScore: 0.4,
            ocrConfidence: {
              aggregation: "mean",
              rawScale: "0-100",
              rawTokenConfidences: [40],
              rawMean: 40,
              rawMin: 40,
              rawMax: 40,
              missingTokenCount: 0,
            },
            candidateProvenance: {
              passId: "alt-1",
              passKind: "full-image-primary",
              triggerReasons: ["primary-pass"],
              preprocessing: ["grayscale"],
              regionName: "brand",
              supportingPassIds: ["alt-1"],
              supportingPassKinds: ["full-image-primary"],
              recoveryPassUsed: false,
            },
            ranking: {
              strategy: "brand-mixed-prominence-score",
              orderingMode: "score-first",
              comparator: [
                { id: "score-eligibility", direction: "desc", value: true },
                { id: "ranking-score", direction: "desc", value: 4.2 },
                { id: "prominence", direction: "desc", value: 24 },
                { id: "ocr-evidence-score", direction: "desc", value: 0.4 },
                { id: "normalized-value-key", direction: "asc", value: "mcellars" },
              ],
              rankingScore: 4.2,
              scoreFactors: [
                { id: "positive-signal", value: 1, contribution: 2, direction: "benefit" },
                { id: "ocr-evidence-score", value: 0.4, contribution: 0.4, direction: "benefit" },
              ],
            },
          },
        ],
      }),
    ],
    ["confidence below 0", observed({ confidence: -0.1, ocrEvidenceScore: -0.1 })],
    ["confidence above 1", observed({ confidence: 1.1, ocrEvidenceScore: 1.1 })],
    ["confidence alias mismatch", observed({ confidence: 0.2, ocrEvidenceScore: 0.3 })],
    [
      "raw OCR missing-token count mismatch",
      observed({
        ocrConfidence: {
          aggregation: "mean",
          rawScale: "0-100",
          rawTokenConfidences: [40, null],
          rawMean: 40,
          rawMin: 40,
          rawMax: 40,
          missingTokenCount: 0,
        },
      }),
    ],
    [
      "raw OCR summaries must be null when all confidences are missing",
      observed({
        ocrConfidence: {
          aggregation: "mean",
          rawScale: "0-100",
          rawTokenConfidences: [null, null],
          rawMean: 0,
          rawMin: 0,
          rawMax: 0,
          missingTokenCount: 2,
        },
      }),
    ],
    [
      "raw OCR summaries must reconcile with observed confidences",
      observed({
        ocrConfidence: {
          aggregation: "mean",
          rawScale: "0-100",
          rawTokenConfidences: [0, null, 50],
          rawMean: 40,
          rawMin: 0,
          rawMax: 50,
          missingTokenCount: 1,
        },
      }),
    ],
    [
      "raw OCR confidence above the documented scale",
      observed({
        ocrConfidence: {
          aggregation: "mean",
          rawScale: "0-100",
          rawTokenConfidences: [101],
          rawMean: 101,
          rawMin: 101,
          rawMax: 101,
          missingTokenCount: 0,
        },
      }),
    ],
    [
      "raw OCR confidence must be finite",
      observed({
        ocrConfidence: {
          aggregation: "mean",
          rawScale: "0-100",
          rawTokenConfidences: [Number.NaN],
          rawMean: Number.NaN,
          rawMin: Number.NaN,
          rawMax: Number.NaN,
          missingTokenCount: 0,
        },
      }),
    ],
    ["out-of-bounds geometry", observed({ geometry: geometry({ x: 480, width: 100 }) })],
    ["oversized string", observed({ value: "M".repeat(MAX_EVIDENCE_STRING + 1) })],
    ["whitespace-only raw text is empty", observed({ rawText: "" })],
  ];
  it.each(rejects)("rejects %s", (_label, candidate) => {
    expect(observationSchema.safeParse(candidate).success).toBe(false);
  });
});
