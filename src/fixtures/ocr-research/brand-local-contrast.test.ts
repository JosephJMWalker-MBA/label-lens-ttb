import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BRAND_LOCAL_CONTRAST_CONTROL,
  BRAND_LOCAL_CONTRAST_TREATMENT,
  LOCAL_CONTRAST_CLAHE_PARAMETERS,
  aggregateLocalContrastCases,
  compareLocalContrastArms,
  decideLocalContrastExperiment,
  type LocalContrastArmReport,
} from "./brand-local-contrast";
import {
  aggregateBrandCases,
  assignBrandVisualSlices,
  type BrandCaseReport,
} from "./brand-mild-sharpening";
import { validateConfigurationIsolation } from "./experiment";

const BASELINE_CONTROL_BEHAVIOR_HASH =
  "b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41";
const HASHES_AT_MERGED_PR_198 = {
  "src/pipeline/extractor/field-selection.ts":
    "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d",
  "src/pipeline/extractor/regions.ts":
    "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
  "src/pipeline/extractor/extractor.ts":
    "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
} as const;

/**
 * Owner-authorized boundary move for PR #220. The constant above remains the
 * historical record and is NOT edited; this is the boundary the live guard
 * compares against.
 *
 * `extractor.ts` and `regions.ts` remain frozen at their historical values.
 * `field-selection.ts` moved only through PR #220's default-off diagnostics
 * change: the authoritative ladder, `filterReason`, kept/rejected status,
 * candidate formation, ranking, selection, authority and state are unchanged,
 * and that is now protected by the diagnostics equivalence and runtime invariant
 * tests in src/pipeline/extractor/brand-filter-diagnostics.test.ts rather than by
 * this file hash alone.
 *
 * Prior boundary: 3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d
 */
const APPROVED_CURRENT_HASHES_AFTER_PR_220 = {
  ...HASHES_AT_MERGED_PR_198,
  "src/pipeline/extractor/field-selection.ts":
    "8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c",
} as const;

function sha256File(filePath: string): string {
  return createHash("sha256")
    .update(readFileSync(path.join(process.cwd(), filePath)))
    .digest("hex");
}

function brandCase(args: {
  caseId: "approved-wine-023" | "approved-wine-031";
  correct: boolean;
  imageSha256?: string;
  empty?: boolean;
  reliable?: boolean;
  latency?: number;
  candidateTruth?: boolean;
  rawTruth?: boolean;
  selectedValue?: string;
}): BrandCaseReport {
  const expected = args.caseId === "approved-wine-023" ? "ALPHA" : "BETA";
  const empty = args.empty ?? false;
  const reliable = args.reliable ?? false;
  const selected = empty ? null : (args.selectedValue ?? (args.correct ? expected : "MISS"));
  const candidateTruth = args.candidateTruth ?? args.correct;
  const rawTruth = args.rawTruth ?? args.correct;
  const imageSha256 = args.imageSha256 ?? "a".repeat(64);
  const visualSlices = assignBrandVisualSlices({
    caseId: args.caseId,
    crop: { width: 240, height: 100 },
    imageSha256,
  });
  return {
    caseId: args.caseId,
    fixtureId: args.caseId,
    regionId: "brand-region-1",
    slices: visualSlices.labels,
    expectedValues: [expected],
    expectedBrandTruth: [expected],
    imageSha256,
    visualSlices,
    rawTranscript: empty ? "" : rawTruth ? expected : (selected ?? "MISS"),
    rawWords: empty
      ? []
      : [
          {
            text: rawTruth ? expected : (selected ?? "MISS"),
            rawConfidence: 80,
            bbox: { x0: 0, y0: 0, x1: 20, y1: 10 },
          },
        ],
    meanConfidence: empty ? null : 80,
    selectedValue: selected,
    normalizedSelectedCandidate: selected === null ? null : selected.toLowerCase(),
    selectedEvidenceScore: selected === null ? null : 0.8,
    selectedState: reliable ? "OBSERVED" : "AMBIGUOUS",
    reliable,
    correct: args.correct,
    exactCorrect: args.correct,
    normalizedCorrect: args.correct,
    falseCertainty: reliable && !args.correct,
    rawTruthRecall: rawTruth,
    candidateListTruthRecall: candidateTruth,
    top3TruthRecall: candidateTruth,
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
          : rawTruth
            ? "SELECTOR_MISS_WITH_OCR_HIT"
            : "OCR_RECOGNITION_MISS",
    candidateValues: empty ? [] : candidateTruth ? [expected] : [selected ?? "MISS"],
    candidateTop3: empty ? [] : candidateTruth ? [expected] : [selected ?? "MISS"],
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
): LocalContrastArmReport {
  const brandMetrics = aggregateBrandCases(cases);
  return {
    schemaVersion: "ocr-research-report.v1",
    experimentId: "brand-local-contrast-test",
    arm: armName,
    configuration:
      armName === "control" ? BRAND_LOCAL_CONTRAST_CONTROL : BRAND_LOCAL_CONTRAST_TREATMENT,
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
      medianLatencyMs: brandMetrics.medianLatencyMs,
      p95LatencyMs: brandMetrics.p95LatencyMs,
      medianRssDeltaBytes: 10,
      failureClassCounts: {},
      sliceMetrics: {},
    },
    cases,
    brandMetrics,
    brandSliceMetrics: {},
    localContrastMetrics: aggregateLocalContrastCases(cases),
    localContrastSliceMetrics: {},
  };
}

function decisionFixture(overrides?: {
  treatmentCases?: BrandCaseReport[];
  repeatTreatmentCases?: BrandCaseReport[];
  treatmentHash?: string;
  repeatTreatmentHash?: string;
}) {
  const controlCases = [
    brandCase({
      caseId: "approved-wine-023",
      correct: false,
      imageSha256: "1".repeat(64),
    }),
    brandCase({
      caseId: "approved-wine-031",
      correct: false,
      imageSha256: "2".repeat(64),
    }),
  ];
  const treatmentCases = overrides?.treatmentCases ?? [
    brandCase({
      caseId: "approved-wine-023",
      correct: true,
      imageSha256: "1".repeat(64),
    }),
    brandCase({
      caseId: "approved-wine-031",
      correct: true,
      imageSha256: "2".repeat(64),
    }),
  ];
  const repeatTreatmentCases = overrides?.repeatTreatmentCases ?? treatmentCases;
  return {
    primaryControl: arm(controlCases, "control", "control-behavior"),
    primaryTreatment: arm(
      treatmentCases,
      "treatment",
      overrides?.treatmentHash ?? "treatment-behavior",
    ),
    repeatControl: arm(controlCases, "control", "control-behavior"),
    repeatTreatment: arm(
      repeatTreatmentCases,
      "treatment",
      overrides?.repeatTreatmentHash ?? "treatment-behavior",
    ),
    changedVariables: ["localContrast"],
    productionPathChanged: false,
    pr195BaselineChanged: false,
    sellerTruthPassedToOcr: false,
    expectedCaseCount: 2,
  } as const;
}

describe("bounded Brand fixed local-contrast governance", () => {
  it("isolates treatment to local contrast", () => {
    const validated = validateConfigurationIsolation({
      schemaVersion: "ocr-research-experiment.v1",
      experimentId: "brand-local-contrast-test",
      design: "one-variable-at-a-time",
      declaredVariable: "localContrast",
      control: BRAND_LOCAL_CONTRAST_CONTROL,
      treatment: BRAND_LOCAL_CONTRAST_TREATMENT,
    });
    expect(validated.isolation.changedVariables).toEqual(["localContrast"]);
  });

  it("pins the exact Sharp CLAHE invocation and parameters", () => {
    expect(LOCAL_CONTRAST_CLAHE_PARAMETERS).toEqual({
      width: 3,
      height: 3,
      maxSlope: 3,
    });
    const implementation = readFileSync(
      path.join(process.cwd(), "src/fixtures/ocr-research/experiment.ts"),
      "utf8",
    );
    expect(implementation).toContain("pipeline = pipeline.clahe(LOCAL_CONTRAST_CLAHE_PARAMETERS)");
  });

  it("rejects any configuration that combines CLAHE and sharpening", () => {
    expect(() =>
      validateConfigurationIsolation({
        schemaVersion: "ocr-research-experiment.v1",
        experimentId: "brand-local-contrast-invalid",
        design: "one-variable-at-a-time",
        declaredVariable: "localContrast",
        control: BRAND_LOCAL_CONTRAST_CONTROL,
        treatment: {
          ...BRAND_LOCAL_CONTRAST_TREATMENT,
          sharpening: "mild",
        },
      }),
    ).toThrow(/CLAHE_AND_SHARPENING_MUTUALLY_EXCLUSIVE/);
  });

  it("keeps visual slice assignment independent of OCR correctness", () => {
    const imageOnly = {
      caseId: "approved-wine-023",
      crop: { width: 240, height: 100 },
      imageSha256: "b".repeat(64),
    };
    expect(assignBrandVisualSlices({ ...imageOnly, correct: true } as typeof imageOnly)).toEqual(
      assignBrandVisualSlices({ ...imageOnly, correct: false } as typeof imageOnly),
    );
  });

  it("reconciles report totals including recognition and grouping/ranking misses", () => {
    const cases = [
      brandCase({ caseId: "approved-wine-023", correct: false }),
      brandCase({
        caseId: "approved-wine-031",
        correct: false,
        rawTruth: true,
        candidateTruth: true,
      }),
    ];
    const metrics = aggregateLocalContrastCases(cases);
    expect(metrics.caseCount).toBe(2);
    expect(metrics.ocrRecognitionMisses.count).toBe(1);
    expect(metrics.groupingRankingMisses.count).toBe(1);
  });

  it("tracks checksum and independence families in deterministic deltas", () => {
    const fixture = decisionFixture();
    const deltas = compareLocalContrastArms(fixture.primaryControl, fixture.primaryTreatment);
    expect(deltas.map((item) => item.checksumFamily)).toEqual([
      `sha256:${"1".repeat(64)}`,
      `sha256:${"2".repeat(64)}`,
    ]);
    expect(new Set(deltas.map((item) => item.independenceFamily)).size).toBe(2);
    expect(compareLocalContrastArms(fixture.primaryControl, fixture.primaryTreatment)).toEqual(
      deltas,
    );
  });

  it("produces deterministic success and kill decisions", () => {
    const fixture = decisionFixture();
    expect(decideLocalContrastExperiment(fixture)).toEqual(decideLocalContrastExperiment(fixture));
    expect(decideLocalContrastExperiment(fixture).decision).toBe("ADOPT_FOR_LARGER_EVALUATION");
    const unreproduced = decideLocalContrastExperiment(
      decisionFixture({ repeatTreatmentHash: "different-treatment" }),
    );
    expect(unreproduced.decision).toBe("KILL");
    expect(unreproduced.successCriteria.reproducible).toBe(false);
  });

  it("forces KILL for false reliable reads", () => {
    const unsafe = [
      brandCase({
        caseId: "approved-wine-023",
        correct: false,
        reliable: true,
        imageSha256: "1".repeat(64),
      }),
      brandCase({
        caseId: "approved-wine-031",
        correct: true,
        imageSha256: "2".repeat(64),
      }),
    ];
    const result = decideLocalContrastExperiment(
      decisionFixture({ treatmentCases: unsafe, repeatTreatmentCases: unsafe }),
    );
    expect(result.decision).toBe("KILL");
    expect(result.successCriteria.falseReliableReadsRemainZero).toBe(false);
  });

  it("forces KILL for wrong reliable reads", () => {
    const unsafe = [
      brandCase({
        caseId: "approved-wine-023",
        correct: true,
        imageSha256: "1".repeat(64),
      }),
      brandCase({
        caseId: "approved-wine-031",
        correct: false,
        reliable: true,
        imageSha256: "2".repeat(64),
      }),
    ];
    const result = decideLocalContrastExperiment(
      decisionFixture({ treatmentCases: unsafe, repeatTreatmentCases: unsafe }),
    );
    expect(result.decision).toBe("KILL");
    expect(result.successCriteria.wrongReliableReadsRemainZero).toBe(false);
  });

  it("forces KILL when empty OCR increases", () => {
    const empty = [
      brandCase({
        caseId: "approved-wine-023",
        correct: false,
        empty: true,
        imageSha256: "1".repeat(64),
      }),
      brandCase({
        caseId: "approved-wine-031",
        correct: true,
        imageSha256: "2".repeat(64),
      }),
    ];
    const result = decideLocalContrastExperiment(
      decisionFixture({ treatmentCases: empty, repeatTreatmentCases: empty }),
    );
    expect(result.decision).toBe("KILL");
    expect(result.successCriteria.emptyOcrDoesNotIncrease).toBe(false);
  });

  it("enforces the 30% median and 40% p95 latency ceilings", () => {
    const slow = [
      brandCase({
        caseId: "approved-wine-023",
        correct: true,
        latency: 131,
        imageSha256: "1".repeat(64),
      }),
      brandCase({
        caseId: "approved-wine-031",
        correct: true,
        latency: 141,
        imageSha256: "2".repeat(64),
      }),
    ];
    const result = decideLocalContrastExperiment(
      decisionFixture({ treatmentCases: slow, repeatTreatmentCases: slow }),
    );
    expect(result.decision).toBe("KILL");
    expect(result.successCriteria.latencyWithinCeilings).toBe(false);
  });

  it("detects material regression in clean or high-contrast slices", () => {
    const controlCases = [
      brandCase({
        caseId: "approved-wine-023",
        correct: true,
        imageSha256: "1".repeat(64),
      }),
      brandCase({
        caseId: "approved-wine-031",
        correct: false,
        imageSha256: "2".repeat(64),
      }),
    ];
    const treatmentCases = [
      brandCase({
        caseId: "approved-wine-023",
        correct: false,
        imageSha256: "1".repeat(64),
      }),
      brandCase({
        caseId: "approved-wine-031",
        correct: true,
        imageSha256: "2".repeat(64),
      }),
    ];
    const fixture = decisionFixture({
      treatmentCases,
      repeatTreatmentCases: treatmentCases,
    });
    const result = decideLocalContrastExperiment({
      ...fixture,
      primaryControl: arm(controlCases, "control", "control-behavior"),
      repeatControl: arm(controlCases, "control", "control-behavior"),
    });
    expect(result.decision).toBe("KILL");
    expect(result.successCriteria.noCleanHighContrastRegression).toBe(false);
  });

  it("retains the merged no-op and 3x control behavior baseline", () => {
    const summary = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          "artifacts/issue-149-ocr-research-platform/generated-summary.json",
        ),
        "utf8",
      ),
    ) as {
      noOp: {
        diff: { behavioralDeltaCount: number };
        metrics: { correctCount: number; falseCertaintyCount: number };
      };
    };
    const control = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          "artifacts/issue-149-ocr-research-platform/examples/no-op/control/report.json",
        ),
        "utf8",
      ),
    ) as { behaviorHash: string };
    expect(summary.noOp.diff.behavioralDeltaCount).toBe(0);
    expect(summary.noOp.metrics).toMatchObject({
      correctCount: 0,
      falseCertaintyCount: 0,
    });
    expect(control.behaviorHash).toBe(BASELINE_CONTROL_BEHAVIOR_HASH);
  });

  it("keeps extractor.ts and regions.ts frozen, and field-selection.ts at the PR 220 approved boundary", () => {
    expect(
      Object.fromEntries(
        Object.keys(APPROVED_CURRENT_HASHES_AFTER_PR_220).map((filePath) => [
          filePath,
          sha256File(filePath),
        ]),
      ),
    ).toEqual(APPROVED_CURRENT_HASHES_AFTER_PR_220);
  });
});
