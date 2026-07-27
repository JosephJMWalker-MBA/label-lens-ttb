import {
  aggregateBrandCases,
  enrichBrandArm,
  normalizeBrand,
  type BrandAggregateMetrics,
  type BrandArmReport,
  type BrandCaseReport,
  type BrandMetric,
} from "./brand-mild-sharpening";
import {
  OTSU_IMPLEMENTATION_ID,
  OTSU_OUTPUT_ADAPTER_ID,
  PRODUCTION_BOUNDED_BRAND_CONTROL,
  wilson95,
  type ArmReport,
  type OcrConfiguration,
} from "./experiment";

export { OTSU_IMPLEMENTATION_ID, OTSU_OUTPUT_ADAPTER_ID };

export const BRAND_OTSU_CONTROL: OcrConfiguration = Object.freeze({
  ...PRODUCTION_BOUNDED_BRAND_CONTROL,
  padding: Object.freeze({ ...PRODUCTION_BOUNDED_BRAND_CONTROL.padding }),
  localContrast: "none",
  thresholdMethod: "none",
  sharpening: "none",
  inversion: false,
});

export const BRAND_OTSU_TREATMENT: OcrConfiguration = Object.freeze({
  ...PRODUCTION_BOUNDED_BRAND_CONTROL,
  padding: Object.freeze({ ...PRODUCTION_BOUNDED_BRAND_CONTROL.padding }),
  localContrast: "none",
  thresholdMethod: "otsu",
  sharpening: "none",
  inversion: false,
});

export type OtsuMechanism =
  | "OTSU_RECOVERED_CHARACTER"
  | "OTSU_RECOVERED_WORD"
  | "OTSU_IMPROVED_CANDIDATE_GENERATION"
  | "OTSU_IMPROVED_RANKING"
  | "OTSU_REMOVED_BACKGROUND_NOISE"
  | "OTSU_LOST_THIN_STROKES"
  | "OTSU_MERGED_CHARACTERS"
  | "OTSU_FRAGMENTED_CHARACTERS"
  | "OTSU_REMOVED_DECORATIVE_OUTLINE"
  | "OTSU_CREATED_ARTIFACT"
  | "OTSU_CAUSED_EMPTY_OCR"
  | "OTSU_CHANGED_CONFIDENCE_ONLY"
  | "OTSU_NO_MEANINGFUL_EFFECT"
  | "UNDETERMINED";

export interface OtsuAggregateMetrics extends BrandAggregateMetrics {
  ocrRecognitionMisses: BrandMetric;
  groupingRankingMisses: BrandMetric;
}

export interface OtsuSliceMetrics extends OtsuAggregateMetrics {
  slice: string;
}

export type OtsuArmReport = BrandArmReport & {
  otsuMetrics: OtsuAggregateMetrics;
  otsuSliceMetrics: Record<string, OtsuSliceMetrics>;
};

interface CaseProjection {
  rawTranscript: string;
  selectedCandidate: string | null;
  normalizedSelectedCandidate: string | null;
  candidateList: string[];
  top3: string[];
  meanConfidence: number | null;
  selectedEvidenceScore: number | null;
  reliability: boolean;
  authorityState: string;
  failureClassification: string;
  exactCorrect: boolean;
  normalizedCorrect: boolean;
  rawTruthRecall: boolean;
  candidateListTruthRecall: boolean;
  top3TruthRecall: boolean;
  emptyOcr: boolean;
  latencyMs: number;
  rssDeltaBytes: number;
}

export interface OtsuCaseDelta {
  caseId: string;
  fixtureId: string;
  regionId: string;
  expectedBrandTruth: string[];
  imageSha256: string;
  checksumFamily: string;
  independenceFamily: string;
  visualSlices: BrandCaseReport["visualSlices"];
  controlBehaviorHash: string;
  treatmentBehaviorHash: string;
  control: CaseProjection;
  treatment: CaseProjection;
  outputChanged: boolean;
  improved: boolean;
  regressed: boolean;
  materiallyRegressed: boolean;
  becameEmpty: boolean;
  mechanism: OtsuMechanism;
  mechanismEvidence: string;
}

export type OtsuDecision =
  "ADOPT_FOR_LARGER_EVALUATION" | "KILL" | "INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED";

export interface OtsuDecisionReport {
  decision: OtsuDecision;
  successCriteria: Record<string, boolean>;
  killReasons: string[];
  incompleteEvidence: string[];
  improvedCaseIds: string[];
  regressedCaseIds: string[];
  improvementChecksumFamilies: string[];
  improvementIndependenceFamilies: string[];
  regressionChecksumFamilies: string[];
  regressionIndependenceFamilies: string[];
  primaryLatencyRatios: { median: number | null; p95: number | null };
  repeatLatencyRatios: { median: number | null; p95: number | null };
  reproducible: boolean;
}

function metric(count: number, total: number): BrandMetric {
  return {
    count,
    rate: total === 0 ? null : count / total,
    wilson95: wilson95(count, total),
  };
}

export function aggregateOtsuCases(cases: readonly BrandCaseReport[]): OtsuAggregateMetrics {
  const base = aggregateBrandCases(cases);
  const recognitionMissCount = cases.filter(
    (item) => item.failureClass === "OCR_RECOGNITION_MISS",
  ).length;
  const groupingRankingMissCount = cases.filter(
    (item) =>
      !item.normalizedCorrect &&
      (item.failureClass === "SELECTOR_MISS_WITH_OCR_HIT" ||
        item.candidateListTruthRecall ||
        item.top3TruthRecall),
  ).length;
  return {
    ...base,
    ocrRecognitionMisses: metric(recognitionMissCount, cases.length),
    groupingRankingMisses: metric(groupingRankingMissCount, cases.length),
  };
}

export function enrichOtsuArm(
  report: ArmReport,
  imageShaByFixture: Readonly<Record<string, string>>,
): OtsuArmReport {
  const enriched = enrichBrandArm(report, imageShaByFixture);
  const labels = [...new Set(enriched.cases.flatMap((item) => item.visualSlices.labels))].sort();
  return {
    ...enriched,
    otsuMetrics: aggregateOtsuCases(enriched.cases),
    otsuSliceMetrics: Object.fromEntries(
      labels.map((slice) => {
        const members = enriched.cases.filter((item) => item.visualSlices.labels.includes(slice));
        return [slice, { slice, ...aggregateOtsuCases(members) }];
      }),
    ),
  };
}

function levenshtein(leftValue: string, rightValue: string): number {
  const left = normalizeBrand(leftValue);
  const right = normalizeBrand(rightValue);
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function closestTruthDistance(item: BrandCaseReport): number {
  const observed = item.selectedValue ?? item.rawTranscript;
  return Math.min(...item.expectedValues.map((expected) => levenshtein(observed, expected)));
}

function behaviorProjection(item: BrandCaseReport) {
  return {
    rawTranscript: item.rawTranscript,
    rawWords: item.rawWords.map((word) => ({
      text: word.text,
      rawConfidence: word.rawConfidence,
      bbox: word.bbox,
    })),
    selectedValue: item.selectedValue,
    selectedState: item.selectedState,
    reliable: item.reliable,
    failureClass: item.failureClass,
    candidateValues: item.candidateValues,
  };
}

function sameProjection(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function projectCase(item: BrandCaseReport): CaseProjection {
  return {
    rawTranscript: item.rawTranscript,
    selectedCandidate: item.selectedValue,
    normalizedSelectedCandidate: item.normalizedSelectedCandidate,
    candidateList: item.candidateValues,
    top3: item.candidateTop3,
    meanConfidence: item.meanConfidence,
    selectedEvidenceScore: item.selectedEvidenceScore,
    reliability: item.reliable,
    authorityState: item.selectedState,
    failureClassification: item.failureClass,
    exactCorrect: item.exactCorrect,
    normalizedCorrect: item.normalizedCorrect,
    rawTruthRecall: item.rawTruthRecall,
    candidateListTruthRecall: item.candidateListTruthRecall,
    top3TruthRecall: item.top3TruthRecall,
    emptyOcr: item.emptyOcr,
    latencyMs: item.latencyMs.total,
    rssDeltaBytes: item.memory.rssDelta,
  };
}

function gainedEvidence(control: BrandCaseReport, treatment: BrandCaseReport): boolean {
  return (
    (!control.normalizedCorrect && treatment.normalizedCorrect) ||
    (!control.rawTruthRecall && treatment.rawTruthRecall) ||
    (!control.candidateListTruthRecall && treatment.candidateListTruthRecall) ||
    (!control.top3TruthRecall && treatment.top3TruthRecall)
  );
}

function lostEvidence(control: BrandCaseReport, treatment: BrandCaseReport): boolean {
  return (
    (control.normalizedCorrect && !treatment.normalizedCorrect) ||
    (control.rawTruthRecall && !treatment.rawTruthRecall) ||
    (control.candidateListTruthRecall && !treatment.candidateListTruthRecall) ||
    (control.top3TruthRecall && !treatment.top3TruthRecall)
  );
}

export function classifyOtsuMechanism(
  control: BrandCaseReport,
  treatment: BrandCaseReport,
): { mechanism: OtsuMechanism; evidence: string } {
  if (!control.emptyOcr && treatment.emptyOcr) {
    return {
      mechanism: "OTSU_CAUSED_EMPTY_OCR",
      evidence: "Treatment changed non-empty control OCR into empty OCR.",
    };
  }
  if (!control.normalizedCorrect && treatment.normalizedCorrect) {
    if (control.candidateListTruthRecall) {
      return {
        mechanism: "OTSU_IMPROVED_RANKING",
        evidence: "Truth was already in the control candidate list and became top one.",
      };
    }
    if (!control.candidateListTruthRecall && treatment.candidateListTruthRecall) {
      return {
        mechanism: "OTSU_RECOVERED_WORD",
        evidence: "Treatment introduced fixed truth and selected it as top one.",
      };
    }
  }
  if (
    (!control.candidateListTruthRecall && treatment.candidateListTruthRecall) ||
    (!control.top3TruthRecall && treatment.top3TruthRecall)
  ) {
    return {
      mechanism: "OTSU_IMPROVED_CANDIDATE_GENERATION",
      evidence: "Fixed truth newly appeared in the kept candidate list or top three.",
    };
  }
  if (!control.rawTruthRecall && treatment.rawTruthRecall) {
    return {
      mechanism: "OTSU_RECOVERED_WORD",
      evidence: "Fixed truth newly appeared in the normalized raw transcript.",
    };
  }
  const sameTranscript =
    normalizeBrand(control.rawTranscript) === normalizeBrand(treatment.rawTranscript);
  if (
    sameTranscript &&
    control.normalizedSelectedCandidate === treatment.normalizedSelectedCandidate &&
    sameProjection(control.candidateValues, treatment.candidateValues) &&
    (control.meanConfidence !== treatment.meanConfidence ||
      control.selectedEvidenceScore !== treatment.selectedEvidenceScore ||
      control.reliable !== treatment.reliable)
  ) {
    return {
      mechanism: "OTSU_CHANGED_CONFIDENCE_ONLY",
      evidence: "Transcript, candidates, and selection held while confidence changed.",
    };
  }
  if (sameProjection(behaviorProjection(control), behaviorProjection(treatment))) {
    return {
      mechanism: "OTSU_NO_MEANINGFUL_EFFECT",
      evidence: "OCR words, transcript, candidates, selection, and authority held.",
    };
  }
  const controlDistance = closestTruthDistance(control);
  const treatmentDistance = closestTruthDistance(treatment);
  const direction =
    treatmentDistance < controlDistance
      ? "improved"
      : treatmentDistance > controlDistance
        ? "worsened"
        : "did not change";
  return {
    mechanism: "UNDETERMINED",
    evidence: `Edit distance ${direction} (${controlDistance} -> ${treatmentDistance}); paired-image evidence is required to name a mechanism.`,
  };
}

export function compareOtsuArms(control: OtsuArmReport, treatment: OtsuArmReport): OtsuCaseDelta[] {
  const treatmentByCase = new Map(treatment.cases.map((item) => [item.caseId, item]));
  return control.cases.map((base) => {
    const next = treatmentByCase.get(base.caseId);
    if (!next) throw new Error(`MISSING_TREATMENT_CASE: ${base.caseId}`);
    const classification = classifyOtsuMechanism(base, next);
    const becameEmpty = !base.emptyOcr && next.emptyOcr;
    const materiallyRegressed = lostEvidence(base, next) || becameEmpty;
    return {
      caseId: base.caseId,
      fixtureId: base.fixtureId,
      regionId: base.regionId,
      expectedBrandTruth: base.expectedBrandTruth,
      imageSha256: base.imageSha256,
      checksumFamily: `sha256:${base.imageSha256}`,
      independenceFamily: base.visualSlices.independenceFamily,
      visualSlices: base.visualSlices,
      controlBehaviorHash: control.behaviorHash,
      treatmentBehaviorHash: treatment.behaviorHash,
      control: projectCase(base),
      treatment: projectCase(next),
      outputChanged: !sameProjection(behaviorProjection(base), behaviorProjection(next)),
      improved: gainedEvidence(base, next),
      regressed: materiallyRegressed,
      materiallyRegressed,
      becameEmpty,
      mechanism: classification.mechanism,
      mechanismEvidence: classification.evidence,
    };
  });
}

function ratio(treatment: number | null, control: number | null): number | null {
  if (treatment === null || control === null || control <= 0) return null;
  return treatment / control;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function candidateRecallImproved(control: OtsuArmReport, treatment: OtsuArmReport): boolean {
  return (
    treatment.otsuMetrics.candidateListTruthRecall.count >
      control.otsuMetrics.candidateListTruthRecall.count ||
    treatment.otsuMetrics.top3TruthRecall.count > control.otsuMetrics.top3TruthRecall.count
  );
}

export function decideOtsuExperiment(args: {
  primaryControl: OtsuArmReport;
  primaryTreatment: OtsuArmReport;
  repeatControl: OtsuArmReport;
  repeatTreatment: OtsuArmReport;
  changedVariables: readonly string[];
  productionPathChanged: boolean;
  pr195BaselineChanged: boolean;
  sellerTruthPassedToOcr: boolean;
  implementationVerified: boolean;
  outputIsolationVerified: boolean;
  expectedControlBehaviorHash: string;
  expectedCaseCount?: number;
}): OtsuDecisionReport {
  const primaryDeltas = compareOtsuArms(args.primaryControl, args.primaryTreatment);
  const repeatDeltas = compareOtsuArms(args.repeatControl, args.repeatTreatment);
  const improved = primaryDeltas.filter((item) => item.improved);
  const repeatImproved = repeatDeltas.filter((item) => item.improved);
  const regressed = primaryDeltas.filter((item) => item.regressed);
  const previouslyCorrectRegressions = primaryDeltas.filter(
    (item) => item.control.normalizedCorrect && !item.treatment.normalizedCorrect,
  );
  const repeatPreviouslyCorrectRegressions = repeatDeltas.filter(
    (item) => item.control.normalizedCorrect && !item.treatment.normalizedCorrect,
  );
  const improvementChecksumFamilies = unique(improved.map((item) => item.checksumFamily));
  const repeatImprovementChecksumFamilies = unique(
    repeatImproved.map((item) => item.checksumFamily),
  );
  const improvementIndependenceFamilies = unique(improved.map((item) => item.independenceFamily));
  const regressionChecksumFamilies = unique(regressed.map((item) => item.checksumFamily));
  const regressionIndependenceFamilies = unique(regressed.map((item) => item.independenceFamily));
  const primaryLatencyRatios = {
    median: ratio(
      args.primaryTreatment.otsuMetrics.medianLatencyMs,
      args.primaryControl.otsuMetrics.medianLatencyMs,
    ),
    p95: ratio(
      args.primaryTreatment.otsuMetrics.p95LatencyMs,
      args.primaryControl.otsuMetrics.p95LatencyMs,
    ),
  };
  const repeatLatencyRatios = {
    median: ratio(
      args.repeatTreatment.otsuMetrics.medianLatencyMs,
      args.repeatControl.otsuMetrics.medianLatencyMs,
    ),
    p95: ratio(
      args.repeatTreatment.otsuMetrics.p95LatencyMs,
      args.repeatControl.otsuMetrics.p95LatencyMs,
    ),
  };
  const reproducible =
    args.primaryControl.behaviorHash === args.repeatControl.behaviorHash &&
    args.primaryTreatment.behaviorHash === args.repeatTreatment.behaviorHash;
  const controlBaselineReproduced =
    args.primaryControl.behaviorHash === args.expectedControlBehaviorHash &&
    args.repeatControl.behaviorHash === args.expectedControlBehaviorHash;
  const cleanHighRegressions = [...primaryDeltas, ...repeatDeltas].filter(
    (item) =>
      item.materiallyRegressed &&
      (item.visualSlices.background === "clean" || item.visualSlices.contrast === "high"),
  );
  const latencyWithinCeilings =
    primaryLatencyRatios.median !== null &&
    primaryLatencyRatios.median <= 1.25 &&
    primaryLatencyRatios.p95 !== null &&
    primaryLatencyRatios.p95 <= 1.35 &&
    repeatLatencyRatios.median !== null &&
    repeatLatencyRatios.median <= 1.25 &&
    repeatLatencyRatios.p95 !== null &&
    repeatLatencyRatios.p95 <= 1.35;
  const successCriteria = {
    atLeastTwoRegionsImprove: improved.length >= 2 && repeatImproved.length >= 2,
    atLeastTwoChecksumFamiliesImprove:
      improvementChecksumFamilies.length >= 2 && repeatImprovementChecksumFamilies.length >= 2,
    normalizedTop1AccuracyImproves:
      args.primaryTreatment.otsuMetrics.normalizedAccuracy.count >
        args.primaryControl.otsuMetrics.normalizedAccuracy.count &&
      args.repeatTreatment.otsuMetrics.normalizedAccuracy.count >
        args.repeatControl.otsuMetrics.normalizedAccuracy.count,
    candidateListOrTop3RecallImproves:
      candidateRecallImproved(args.primaryControl, args.primaryTreatment) &&
      candidateRecallImproved(args.repeatControl, args.repeatTreatment),
    noPreviouslyCorrectRegionRegresses:
      previouslyCorrectRegressions.length === 0 && repeatPreviouslyCorrectRegressions.length === 0,
    falseReliableReadsRemainZero:
      args.primaryTreatment.otsuMetrics.falseReliableReads.count === 0 &&
      args.repeatTreatment.otsuMetrics.falseReliableReads.count === 0,
    wrongReliableReadsRemainZero:
      args.primaryTreatment.otsuMetrics.wrongReliableReads.count === 0 &&
      args.repeatTreatment.otsuMetrics.wrongReliableReads.count === 0,
    emptyOcrDoesNotIncrease:
      args.primaryTreatment.otsuMetrics.emptyOcr.count <=
        args.primaryControl.otsuMetrics.emptyOcr.count &&
      args.repeatTreatment.otsuMetrics.emptyOcr.count <=
        args.repeatControl.otsuMetrics.emptyOcr.count,
    noCleanHighContrastRegression: cleanHighRegressions.length === 0,
    latencyWithinCeilings,
    reproducible,
    controlBaselineReproduced,
    onlyThresholdMethodChanged:
      args.changedVariables.length === 1 && args.changedVariables[0] === "thresholdMethod",
    otsuNotCombinedWithClaheOrSharpening:
      args.primaryTreatment.configuration.thresholdMethod === "otsu" &&
      args.primaryTreatment.configuration.localContrast === "none" &&
      args.primaryTreatment.configuration.sharpening === "none",
    sellerTruthNotPassedToOcr: !args.sellerTruthPassedToOcr,
    noProductionOrPr195PathChanges: !args.productionPathChanged && !args.pr195BaselineChanged,
    implementationVerified: args.implementationVerified,
    outputIsolationVerified: args.outputIsolationVerified,
  };
  const reasonByCriterion: Record<keyof typeof successCriteria, string> = {
    atLeastTwoRegionsImprove: "zero or one governed region improved",
    atLeastTwoChecksumFamiliesImprove: "improvement did not span two source checksum families",
    normalizedTop1AccuracyImproves: "normalized top-one accuracy did not improve in both runs",
    candidateListOrTop3RecallImproves:
      "candidate-list or top-three truth recall did not improve in both runs",
    noPreviouslyCorrectRegionRegresses: "a previously correct case regressed",
    falseReliableReadsRemainZero: "a false reliable read appeared",
    wrongReliableReadsRemainZero: "a wrong reliable read appeared",
    emptyOcrDoesNotIncrease: "empty OCR increased",
    noCleanHighContrastRegression: "a clean-background or high-contrast case materially regressed",
    latencyWithinCeilings: "median or p95 latency exceeded a preregistered ceiling",
    reproducible: "control or treatment behavior did not reproduce",
    controlBaselineReproduced: "the known control behavior hash did not reproduce",
    onlyThresholdMethodChanged: "treatment changed more than thresholding",
    otsuNotCombinedWithClaheOrSharpening: "Otsu was combined with CLAHE or sharpening",
    sellerTruthNotPassedToOcr: "seller truth entered OCR execution",
    noProductionOrPr195PathChanges: "production OCR or the PR #195 baseline changed",
    implementationVerified: "the preregistered Otsu implementation gate failed",
    outputIsolationVerified:
      "a control/treatment pair changed channel layout, alpha, dimensions, bit depth, color space, density, metadata, or non-threshold output behavior",
  };
  const killReasons = (Object.keys(successCriteria) as Array<keyof typeof successCriteria>).flatMap(
    (criterion) => (successCriteria[criterion] ? [] : [reasonByCriterion[criterion]]),
  );
  const incompleteEvidence: string[] = [];
  const expectedCaseCount = args.expectedCaseCount ?? 11;
  if (args.primaryControl.cases.length !== expectedCaseCount) {
    incompleteEvidence.push(
      `expected ${expectedCaseCount} governed regions; found ${args.primaryControl.cases.length}`,
    );
  }
  if (
    args.primaryControl.cases.some(
      (item) =>
        !item.imageSha256 ||
        !item.visualSlices.independenceFamily ||
        item.visualSlices.labels.length === 0,
    )
  ) {
    incompleteEvidence.push("checksum, independence-family, or visual-slice metadata is missing");
  }
  return {
    decision:
      killReasons.length > 0
        ? "KILL"
        : incompleteEvidence.length > 0
          ? "INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED"
          : "ADOPT_FOR_LARGER_EVALUATION",
    successCriteria,
    killReasons,
    incompleteEvidence,
    improvedCaseIds: improved.map((item) => item.caseId),
    regressedCaseIds: regressed.map((item) => item.caseId),
    improvementChecksumFamilies,
    improvementIndependenceFamilies,
    regressionChecksumFamilies,
    regressionIndependenceFamilies,
    primaryLatencyRatios,
    repeatLatencyRatios,
    reproducible,
  };
}
