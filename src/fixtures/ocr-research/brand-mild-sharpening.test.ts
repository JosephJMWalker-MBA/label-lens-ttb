import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BRAND_MILD_SHARPENING_CONTROL,
  BRAND_MILD_SHARPENING_TREATMENT,
  MILD_SHARPENING_PARAMETERS,
  aggregateBrandCases,
  assignBrandVisualSlices,
  compareBrandArms,
  decideSharpeningExperiment,
  type BrandArmReport,
  type BrandCaseReport,
} from "./brand-mild-sharpening";
import { validateConfigurationIsolation } from "./experiment";

const HASHES_AT_MERGED_PR_197 = {
  "src/pipeline/extractor/field-selection.ts":
    "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d",
  "src/pipeline/extractor/regions.ts":
    "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
  "src/pipeline/extractor/extractor.ts":
    "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
} as const;

function sha256File(filePath: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(process.cwd(), filePath)))
    .digest("hex");
}

function visualSlices(
  caseId: string,
  imageSha256 = "a".repeat(64),
): BrandCaseReport["visualSlices"] {
  return assignBrandVisualSlices({
    caseId,
    crop: { width: 240, height: 100 },
    imageSha256,
  });
}

function brandCase(args: {
  caseId: "approved-wine-023" | "approved-wine-031";
  correct: boolean;
  empty?: boolean;
  reliable?: boolean;
  latency?: number;
  behaviorMarker?: string;
}): BrandCaseReport {
  const expected = args.caseId === "approved-wine-023" ? "ALPHA" : "BETA";
  const selected = args.correct ? expected : (args.behaviorMarker ?? "MISS");
  const empty = args.empty ?? false;
  const reliable = args.reliable ?? false;
  const normalizedSelected = empty ? null : selected.toLowerCase();
  return {
    caseId: args.caseId,
    fixtureId: args.caseId,
    regionId: "brand-region-1",
    slices: [],
    expectedValues: [expected],
    expectedBrandTruth: [expected],
    imageSha256: "a".repeat(64),
    visualSlices: visualSlices(args.caseId),
    rawTranscript: empty ? "" : selected,
    rawWords: empty
      ? []
      : [
          {
            text: selected,
            rawConfidence: 80,
            bbox: { x0: 0, y0: 0, x1: 20, y1: 10 },
          },
        ],
    meanConfidence: empty ? null : 80,
    selectedValue: empty ? null : selected,
    normalizedSelectedCandidate: normalizedSelected,
    selectedEvidenceScore: empty ? null : 0.8,
    selectedState: reliable ? "OBSERVED" : "AMBIGUOUS",
    reliable,
    correct: args.correct,
    exactCorrect: args.correct,
    normalizedCorrect: args.correct,
    falseCertainty: reliable && !args.correct,
    rawTruthRecall: args.correct,
    candidateListTruthRecall: args.correct,
    top3TruthRecall: args.correct,
    wrongReliableRead: reliable && !args.correct,
    correctButConservative: args.correct && !reliable,
    emptyOcr: empty,
    failureClass: args.correct
      ? reliable
        ? "CORRECT"
        : "CONSERVATIVE_AUTHORITY"
      : reliable
        ? "WRONG_RELIABLE_READ"
        : empty
          ? "OCR_EMPTY"
          : "OCR_RECOGNITION_MISS",
    candidateValues: empty ? [] : [selected],
    candidateTop3: empty ? [] : [selected],
    candidateTrace: null,
    warningAnchorTrace: null,
    warningResult: null,
    crop: { left: 0, top: 0, width: 240, height: 100 },
    transformedSize: { width: 720, height: 300 },
    preprocessing: [],
    latencyMs: {
      preprocess: 1,
      ocr: args.latency ?? 100,
      selection: 1,
      total: args.latency ?? 100,
    },
    memory: { rssBefore: 100, rssAfter: 110, rssDelta: 10 },
    artifactPaths: {
      crop: `control/crops/${args.caseId}.png`,
      preprocessed: `control/preprocessed/${args.caseId}.png`,
      transcript: `control/transcripts/${args.caseId}.txt`,
    },
  };
}

function arm(
  cases: BrandCaseReport[],
  armName: "control" | "treatment",
  behaviorHash: string,
): BrandArmReport {
  return {
    schemaVersion: "ocr-research-report.v1",
    experimentId: "brand-mild-sharpening-test",
    arm: armName,
    configuration:
      armName === "control" ? BRAND_MILD_SHARPENING_CONTROL : BRAND_MILD_SHARPENING_TREATMENT,
    configurationHash: armName,
    behaviorHash,
    gitSha: "test",
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      sharp: "test",
      ocrEngine: "test",
    },
    metrics: {
      governedFixtureCount: cases.length,
      caseCount: cases.length,
      correctCount: cases.filter((item) => item.correct).length,
      failureCount: cases.filter((item) => !item.correct).length,
      accuracy: cases.filter((item) => item.correct).length / cases.length,
      accuracyWilson95: {
        confidenceLevel: 0.95,
        lower: 0,
        upper: 1,
      },
      falseCertaintyCount: cases.filter((item) => item.falseCertainty).length,
      falseCertaintyRate: 0,
      falseCertaintyWilson95: {
        confidenceLevel: 0.95,
        lower: 0,
        upper: 1,
      },
      medianLatencyMs: 100,
      p95LatencyMs: 100,
      medianRssDeltaBytes: 10,
      failureClassCounts: {},
      sliceMetrics: {},
    },
    cases,
    brandMetrics: aggregateBrandCases(cases),
    brandSliceMetrics: {},
  };
}

function decisionFixture(overrides?: {
  treatmentCases?: BrandCaseReport[];
  repeatTreatmentCases?: BrandCaseReport[];
}) {
  const controlCases = [
    brandCase({ caseId: "approved-wine-023", correct: false }),
    brandCase({ caseId: "approved-wine-031", correct: false }),
  ];
  const treatmentCases = overrides?.treatmentCases ?? [
    brandCase({ caseId: "approved-wine-023", correct: true }),
    brandCase({ caseId: "approved-wine-031", correct: true }),
  ];
  const repeatTreatmentCases = overrides?.repeatTreatmentCases ?? treatmentCases;
  return {
    primaryControl: arm(controlCases, "control", "control-behavior"),
    primaryTreatment: arm(treatmentCases, "treatment", "treatment-behavior"),
    repeatControl: arm(controlCases, "control", "control-behavior"),
    repeatTreatment: arm(repeatTreatmentCases, "treatment", "treatment-behavior"),
    changedVariables: ["sharpening"],
    productionPathChanged: false,
    sellerTruthPassedToOcr: false,
  } as const;
}

describe("bounded Brand mild sharpening governance", () => {
  it("isolates the treatment to exactly the sharpening switch", () => {
    const validated = validateConfigurationIsolation({
      schemaVersion: "ocr-research-experiment.v1",
      experimentId: "brand-mild-sharpening-test",
      design: "one-variable-at-a-time",
      declaredVariable: "sharpening",
      control: BRAND_MILD_SHARPENING_CONTROL,
      treatment: BRAND_MILD_SHARPENING_TREATMENT,
    });
    expect(validated.isolation.changedVariables).toEqual(["sharpening"]);
  });

  it("pins every Sharp mild-sharpening parameter and the implementation constant", () => {
    expect(MILD_SHARPENING_PARAMETERS).toEqual({
      sigma: 1,
      m1: 1,
      m2: 2,
      x1: 2,
      y2: 10,
      y3: 20,
    });
    const implementation = readFileSync(
      path.join(process.cwd(), "src/fixtures/ocr-research/experiment.ts"),
      "utf8",
    );
    expect(implementation).toContain("pipeline = pipeline.sharpen(MILD_SHARPENING_PARAMETERS)");
  });

  it("assigns visual slices without consulting OCR correctness", () => {
    const imageOnly = {
      caseId: "approved-wine-023",
      crop: { width: 240, height: 100 },
      imageSha256: "b".repeat(64),
    };
    const allegedCorrect = assignBrandVisualSlices({
      ...imageOnly,
      correct: true,
    } as typeof imageOnly);
    const allegedWrong = assignBrandVisualSlices({
      ...imageOnly,
      correct: false,
    } as typeof imageOnly);
    expect(allegedCorrect).toEqual(allegedWrong);
  });

  it("tracks duplicate families and source checksum families separately", () => {
    const first = assignBrandVisualSlices({
      caseId: "approved-wine-004",
      crop: { width: 690, height: 308 },
      imageSha256: "1".repeat(64),
    });
    const rotated = assignBrandVisualSlices({
      caseId: "la-fattoria-rotated",
      crop: { width: 690, height: 308 },
      imageSha256: "2".repeat(64),
    });
    expect(first.independenceFamily).toBe("la-fattoria");
    expect(rotated.independenceFamily).toBe("la-fattoria");
    expect(first.sourceChecksumFamily).not.toBe(rotated.sourceChecksumFamily);
  });

  it("reconciles all aggregate counts to the governed case total", () => {
    const cases = [
      brandCase({ caseId: "approved-wine-023", correct: true }),
      brandCase({ caseId: "approved-wine-031", correct: false, reliable: true }),
    ];
    const metrics = aggregateBrandCases(cases);
    expect(metrics.caseCount).toBe(2);
    expect(metrics.normalizedAccuracy.count + metrics.wrongReliableReads.count).toBe(2);
    expect(metrics.falseReliableReads.count).toBe(metrics.wrongReliableReads.count);
  });

  it("produces deterministic per-case changes and a deterministic decision", () => {
    const fixture = decisionFixture();
    const firstDeltas = compareBrandArms(fixture.primaryControl, fixture.primaryTreatment);
    const secondDeltas = compareBrandArms(fixture.primaryControl, fixture.primaryTreatment);
    expect(secondDeltas).toEqual(firstDeltas);
    expect(decideSharpeningExperiment(fixture)).toEqual(decideSharpeningExperiment(fixture));
    expect(decideSharpeningExperiment(fixture).decision).toBe("ADOPT_FOR_LARGER_EVALUATION");
  });

  it("enforces both preregistered latency ceilings", () => {
    const tooSlow = [
      brandCase({ caseId: "approved-wine-023", correct: true, latency: 126 }),
      brandCase({ caseId: "approved-wine-031", correct: true, latency: 136 }),
    ];
    const result = decideSharpeningExperiment(
      decisionFixture({
        treatmentCases: tooSlow,
        repeatTreatmentCases: tooSlow,
      }),
    );
    expect(result.decision).toBe("KILL");
    expect(result.successCriteria.latencyWithinCeilings).toBe(false);
  });

  it("forces KILL when a false or wrong reliable read appears", () => {
    const unsafe = [
      brandCase({ caseId: "approved-wine-023", correct: false, reliable: true }),
      brandCase({ caseId: "approved-wine-031", correct: true }),
    ];
    const result = decideSharpeningExperiment(
      decisionFixture({
        treatmentCases: unsafe,
        repeatTreatmentCases: unsafe,
      }),
    );
    expect(result.decision).toBe("KILL");
    expect(result.successCriteria.falseReliableReadsRemainZero).toBe(false);
    expect(result.successCriteria.wrongReliableReadsRemainZero).toBe(false);
  });

  it("forces KILL when empty OCR increases", () => {
    const empty = [
      brandCase({ caseId: "approved-wine-023", correct: false, empty: true }),
      brandCase({ caseId: "approved-wine-031", correct: true }),
    ];
    const result = decideSharpeningExperiment(
      decisionFixture({
        treatmentCases: empty,
        repeatTreatmentCases: empty,
      }),
    );
    expect(result.decision).toBe("KILL");
    expect(result.successCriteria.emptyOcrDoesNotIncrease).toBe(false);
  });

  it("leaves production OCR and the open PR 195 Brand selector baseline untouched", () => {
    expect(
      Object.fromEntries(
        Object.keys(HASHES_AT_MERGED_PR_197).map((filePath) => [filePath, sha256File(filePath)]),
      ),
    ).toEqual(HASHES_AT_MERGED_PR_197);
  });
});
