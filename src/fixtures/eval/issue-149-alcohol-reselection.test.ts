// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  selectAlcoholObservation,
  selectBrandObservation,
} from "@/pipeline/extractor/field-selection";
import { selectGovernmentWarningObservation } from "@/pipeline/extractor/government-warning";
import type { OcrPassKind, OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";

import {
  ALCOHOL_RESELECTION_KILL_RECOMMENDATION,
  classifyAlcoholReselectionMechanism,
  decideAlcoholReselection,
  passTraceBehavior,
  selectionsBehaviorallyEqual,
  selectAlcoholForReselectionArm,
  sha256Canonical,
} from "./issue-149-alcohol-reselection";

let xCursor = 0;

function words(tokens: Array<[text: string, confidence: number]>, y: number): OcrWord[] {
  xCursor = 0;
  return tokens.map(([text, rawConfidence]) => {
    const x0 = xCursor;
    xCursor += 48;
    return {
      text,
      rawConfidence,
      bbox: { x0, y0: y, x1: x0 + 44, y1: y + 18 },
      originalGeometry: {
        imageIndex: 0,
        x: x0,
        y,
        width: 44,
        height: 18,
        imageWidth: 400,
        imageHeight: 300,
      },
    };
  });
}

function pass(
  id: string,
  passWords: OcrWord[],
  kind: OcrPassKind = "full-image-primary",
): RegionOcrResult {
  const recovery = kind !== "full-image-primary";
  return {
    passId: id,
    regionName: id,
    passKind: kind,
    triggerReasons: recovery ? ["alcohol-not-observed"] : ["primary-pass"],
    preprocessing: recovery
      ? ["crop:edge-strip", "rotate:90", "grayscale", "normalise", "scale:3"]
      : ["grayscale", "normalise", "scale:1.5"],
    fieldEligibility: { brand: true, alcohol: true },
    transform: {
      crop: { left: 0, top: 0, width: 400, height: 300 },
      rotate: recovery ? 90 : 0,
      scale: recovery ? 3 : 1.5,
      originalWidth: 400,
      originalHeight: 300,
    },
    transformedSize: { width: 400, height: 300 },
    pageSegMode: 11,
    rawWordCount: passWords.length,
    discardedWordCount: 0,
    timings: { preprocessMs: 1, ocrMs: 2, inverseMappingMs: 3, totalMs: 6 },
    words: passWords,
  };
}

function alcoholPass(id: string, value: string, confidence: number, kind?: OcrPassKind) {
  return pass(
    id,
    words(
      [
        [value, confidence],
        ["ALC./VOL.", confidence],
      ],
      40,
    ),
    kind,
  );
}

function hashFile(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(join(process.cwd(), relativePath)))
    .digest("hex");
}

const safeDecisionInput = {
  eligibilityPassed: true,
  improvedCaseCount: 2,
  improvementChecksumFamilyCount: 2,
  detectionRecallImproved: true,
  parsedAccuracyImproved: true,
  recoveryTruthPromotionCount: 1,
  correctRegressionCount: 0,
  falseReliableReadIncrease: 0,
  wrongReliableReadIncrease: 0,
  absenceFalsePositiveCount: 0,
  brandChangedCaseCount: 0,
  warningChangedCaseCount: 0,
  medianLatencyIncreasePercent: 0,
  p95LatencyIncreasePercent: 0,
  isolationViolationCount: 0,
  sellerTruthLeak: false,
  behaviorReproduced: true,
  behaviorallyIdenticalEveryEvaluableCase: false,
} as const;

describe("Issue #149 Alcohol reselection treatment seam", () => {
  it("preserves the exact primary object when no recovery pass exists", () => {
    const primaryPass = alcoholPass("pass-0-full-image", "12.5%", 94);
    const primary = selectAlcoholObservation([primaryPass]);

    expect(
      selectAlcoholForReselectionArm({
        arm: "treatment",
        primary,
        passes: [primaryPass],
      }),
    ).toBe(primary);
  });

  it("considers every already-collected pass without changing their plan, PSM, or preprocessing", () => {
    const primaryPass = pass("pass-0-full-image", []);
    const left = alcoholPass("pass-1-left", "12.5%", 96, "left-edge-strip-rot270");
    const right = alcoholPass("pass-2-right", "13.0%", 20, "right-edge-strip-rot90");
    const passes = [primaryPass, left, right];
    const before = sha256Canonical(passTraceBehavior(passes));
    const primary = selectAlcoholObservation([primaryPass]);

    const selected = selectAlcoholForReselectionArm({
      arm: "treatment",
      primary,
      passes,
    });

    expect(selected.observation.value).toBe("12.5% ALC./VOL.");
    expect(selected.source?.passId).toBe("pass-1-left");
    expect(sha256Canonical(passTraceBehavior(passes))).toBe(before);
    expect(passes.map((item) => item.pageSegMode)).toEqual([11, 11, 11]);
  });

  it("allows a stronger recovery candidate to replace a weak primary candidate", () => {
    const primaryPass = alcoholPass("pass-0-full-image", "12.0%", 50);
    const recoveryPass = alcoholPass("pass-1-right", "12.5%", 95, "right-edge-strip-rot90");
    const primary = selectAlcoholObservation([primaryPass]);

    const treatment = selectAlcoholForReselectionArm({
      arm: "treatment",
      primary,
      passes: [primaryPass, recoveryPass],
    });

    expect(primary.observation.state).toBe("LOW_CONFIDENCE");
    expect(treatment.observation.value).toBe("12.5% ALC./VOL.");
    expect(treatment.observation.state).toBe("OBSERVED");
  });

  it("does not allow weak recovery evidence to replace a stronger correct primary", () => {
    const primaryPass = alcoholPass("pass-0-full-image", "12.5%", 96);
    const recoveryPass = alcoholPass("pass-1-right", "13.0%", 20, "right-edge-strip-rot90");
    const primary = selectAlcoholObservation([primaryPass]);

    const treatment = selectAlcoholForReselectionArm({
      arm: "treatment",
      primary,
      passes: [primaryPass, recoveryPass],
    });

    expect(treatment.observation.value).toBe("12.5% ALC./VOL.");
    expect(treatment.observation.state).toBe("OBSERVED");
  });

  it("uses the unchanged deterministic value-key tie-break", () => {
    const primaryPass = alcoholPass("pass-0-full-image", "13.0%", 90);
    const recoveryPass = alcoholPass("pass-1-right", "12.0%", 90, "right-edge-strip-rot90");
    const primary = selectAlcoholObservation([primaryPass]);
    const first = selectAlcoholForReselectionArm({
      arm: "treatment",
      primary,
      passes: [primaryPass, recoveryPass],
    });
    const second = selectAlcoholForReselectionArm({
      arm: "treatment",
      primary,
      passes: [primaryPass, recoveryPass],
    });

    expect(first.observation.value).toBe("12.0% ALC./VOL.");
    expect(selectionsBehaviorallyEqual(first, second)).toBe(true);
  });

  it("keeps absence negative when no pass contains an Alcohol candidate", () => {
    const primaryPass = pass("pass-0-full-image", words([["GOVERNMENT", 95]], 20));
    const recoveryPass = pass(
      "pass-1-right",
      words([["WARNING", 95]], 20),
      "right-edge-strip-rot90",
    );
    const primary = selectAlcoholObservation([primaryPass]);
    const treatment = selectAlcoholForReselectionArm({
      arm: "treatment",
      primary,
      passes: [primaryPass, recoveryPass],
    });

    expect(treatment.observation.state).toBe("NOT_OBSERVED");
    expect(treatment.observation.value).toBeNull();
  });

  it("does not mutate Brand or Government Warning behavior", () => {
    const primaryPass = pass(
      "pass-0-full-image",
      words(
        [
          ["ACME", 94],
          ["CELLARS", 94],
          ["GOVERNMENT", 93],
          ["WARNING", 93],
        ],
        20,
      ),
    );
    const primaryAlcohol = selectAlcoholObservation([primaryPass]);
    const brandBefore = selectBrandObservation([primaryPass]);
    const warningBefore = selectGovernmentWarningObservation("panel", [primaryPass]);

    selectAlcoholForReselectionArm({
      arm: "treatment",
      primary: primaryAlcohol,
      passes: [primaryPass],
    });

    expect(selectBrandObservation([primaryPass])).toEqual(brandBefore);
    expect(selectGovernmentWarningObservation("panel", [primaryPass])).toEqual(warningBefore);
  });

  it("produces stable primary/repeat hashes with timing excluded", () => {
    const primaryPass = alcoholPass("pass-0-full-image", "12.5%", 95);
    const traceA = passTraceBehavior([primaryPass]);
    const traceB = passTraceBehavior([
      {
        ...primaryPass,
        timings: { preprocessMs: 100, ocrMs: 200, inverseMappingMs: 3, totalMs: 303 },
      },
    ]);
    expect(sha256Canonical(traceA)).toBe(sha256Canonical(traceB));
  });
});

describe("Issue #149 frozen decision and mechanism rules", () => {
  it("forces KILL for false reliable reads, wrong reliable reads, or correct-case regression", () => {
    for (const delta of [
      { falseReliableReadIncrease: 1 },
      { wrongReliableReadIncrease: 1 },
      { correctRegressionCount: 1 },
    ]) {
      const result = decideAlcoholReselection({ ...safeDecisionInput, ...delta });
      expect(result.decision).toBe("KILL");
      expect(result.nextRecommendation).toBe(ALCOHOL_RESELECTION_KILL_RECOMMENDATION);
    }
  });

  it("forces KILL when control and treatment are identical", () => {
    const result = decideAlcoholReselection({
      ...safeDecisionInput,
      improvedCaseCount: 0,
      improvementChecksumFamilyCount: 0,
      detectionRecallImproved: false,
      parsedAccuracyImproved: false,
      recoveryTruthPromotionCount: 0,
      behaviorallyIdenticalEveryEvaluableCase: true,
    });
    expect(result.decision).toBe("KILL");
    expect(result.reasons).toContain(
      "Control and treatment were behaviorally identical in every evaluable case.",
    );
  });

  it("does not use an inconclusive decision after eligibility passes", () => {
    expect(
      decideAlcoholReselection({
        ...safeDecisionInput,
        improvedCaseCount: 0,
        improvementChecksumFamilyCount: 0,
        behaviorallyIdenticalEveryEvaluableCase: true,
      }).decision,
    ).toBe("KILL");
    expect(
      decideAlcoholReselection({ ...safeDecisionInput, eligibilityPassed: false }).decision,
    ).toBe("INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED");
  });

  it("classifies unchanged and regressed outcomes deterministically", () => {
    const base = {
      changed: false,
      primaryCorrect: true,
      controlCorrect: true,
      treatmentCorrect: true,
      truthPresentInRecovery: false,
      controlState: "OBSERVED" as const,
      treatmentState: "OBSERVED" as const,
      controlValue: "12.5%",
      treatmentValue: "12.5%",
      treatmentConfidence: 0.9,
      controlConfidence: 0.9,
      truthAbsent: false,
    };
    expect(classifyAlcoholReselectionMechanism(base)).toBe("NO_MEANINGFUL_EFFECT");
    expect(
      classifyAlcoholReselectionMechanism({
        ...base,
        changed: true,
        treatmentCorrect: false,
        treatmentValue: "13.0%",
      }),
    ).toBe("WEAKER_RECOVERY_REPLACED_PRIMARY");
  });
});

/**
 * The Brand selector boundary before PR #220, kept for provenance and not edited.
 */
const FIELD_SELECTION_HASH_BEFORE_PR_220 =
  "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d";

/**
 * Owner-authorized boundary move for PR #220. `field-selection.ts` moved only
 * through the default-off diagnostics change; every other guarded file below
 * remains frozen at its historical value. The authoritative selector behaviour is
 * protected by the diagnostics equivalence and runtime invariant tests in
 * src/pipeline/extractor/brand-filter-diagnostics.test.ts.
 */
const FIELD_SELECTION_HASH_APPROVED_AFTER_PR_220 =
  "8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c";

describe("Issue #149 frozen boundaries", () => {
  it("keeps OCR, preprocessing, PSM, parsing, thresholds, Warning and route hashes frozen, with field-selection.ts at the PR 220 approved boundary", () => {
    expect(FIELD_SELECTION_HASH_APPROVED_AFTER_PR_220).not.toBe(FIELD_SELECTION_HASH_BEFORE_PR_220);
    expect(hashFile("src/pipeline/extractor/extractor.ts")).toBe(
      "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
    );
    expect(hashFile("src/pipeline/extractor/field-selection.ts")).toBe(
      FIELD_SELECTION_HASH_APPROVED_AFTER_PR_220,
    );
    expect(hashFile("src/pipeline/extractor/regions.ts")).toBe(
      "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
    );
    expect(hashFile("src/domain/rules/wine-alcohol-parse.ts")).toBe(
      "2ec1368cf3f4fcfab264d1507f98267aa6f6112091332d4dda5a76152ea816e7",
    );
    expect(hashFile("src/pipeline/extractor/government-warning.ts")).toBe(
      "bd8b59420a29865f5cfb843b9e52a127c7737737d0128c63cba3c1e4b73794d1",
    );
    expect(hashFile("src/app/api/package/analyze/route.ts")).toBe(
      "2b49932096917c40c88dadc8cdef4017126b72968fb47e0f32104818bd4ff41b",
    );
  });

  it("has no production import edge and no truth-bearing selector input", () => {
    const productionSources = [
      "src/pipeline/extractor/extractor.ts",
      "src/pipeline/extractor/regions.ts",
      "src/app/api/package/analyze/route.ts",
    ].map((file) => readFileSync(join(process.cwd(), file), "utf8"));
    const experimentSource = readFileSync(
      join(process.cwd(), "src/fixtures/eval/issue-149-alcohol-reselection.ts"),
      "utf8",
    );

    expect(productionSources.join("\n")).not.toContain("issue-149-alcohol-reselection");
    expect(experimentSource).not.toContain("eval-manifest");
    expect(experimentSource).not.toContain("sellerRegion");
    expect(experimentSource).not.toContain("seller-text");
  });
});
