import { z } from "zod";

import {
  MILD_SHARPENING_PARAMETERS,
  PRODUCTION_BOUNDED_BRAND_CONTROL,
  wilson95,
  type ArmReport,
  type EvaluatedCase,
  type OcrConfiguration,
  type WilsonInterval,
} from "./experiment";

export { MILD_SHARPENING_PARAMETERS };

export const BRAND_MILD_SHARPENING_CONTROL: OcrConfiguration = Object.freeze({
  ...PRODUCTION_BOUNDED_BRAND_CONTROL,
  padding: Object.freeze({ ...PRODUCTION_BOUNDED_BRAND_CONTROL.padding }),
  sharpening: "none",
});

export const BRAND_MILD_SHARPENING_TREATMENT: OcrConfiguration = Object.freeze({
  ...PRODUCTION_BOUNDED_BRAND_CONTROL,
  padding: Object.freeze({ ...PRODUCTION_BOUNDED_BRAND_CONTROL.padding }),
  sharpening: "mild",
});

export const VISUAL_SLICE_VALUES = {
  binary: ["yes", "no", "unknown"],
  contrast: ["low", "high", "mixed", "unknown"],
  outlineShadow: ["present", "absent", "unknown"],
  background: ["textured", "clean", "unknown"],
  layout: ["single-line", "multi-line", "unknown"],
  orientation: ["horizontal", "rotated-or-unknown"],
} as const;

const visualAssignmentSchema = z
  .object({
    thinStroke: z.enum(VISUAL_SLICE_VALUES.binary),
    boldHeavy: z.enum(VISUAL_SLICE_VALUES.binary),
    contrast: z.enum(VISUAL_SLICE_VALUES.contrast),
    outlineShadow: z.enum(VISUAL_SLICE_VALUES.outlineShadow),
    background: z.enum(VISUAL_SLICE_VALUES.background),
    layout: z.enum(VISUAL_SLICE_VALUES.layout),
    orientation: z.enum(VISUAL_SLICE_VALUES.orientation),
    independenceFamily: z.string().min(1),
    visualBasis: z.string().min(1),
  })
  .strict();

export type PreregisteredVisualAssignment = z.infer<typeof visualAssignmentSchema>;

const PREREGISTERED_VISUAL_ASSIGNMENTS = {
  "approved-wine-004": {
    thinStroke: "yes",
    boldHeavy: "no",
    contrast: "high",
    outlineShadow: "absent",
    background: "clean",
    layout: "multi-line",
    orientation: "horizontal",
    independenceFamily: "la-fattoria",
    visualBasis: "Fine script and thin sans lettering on flat tan/white.",
  },
  "approved-wine-005": {
    thinStroke: "yes",
    boldHeavy: "no",
    contrast: "high",
    outlineShadow: "absent",
    background: "clean",
    layout: "multi-line",
    orientation: "horizontal",
    independenceFamily: "la-fattoria",
    visualBasis: "Same Brand system on a separate governed source.",
  },
  "approved-wine-023": {
    thinStroke: "yes",
    boldHeavy: "no",
    contrast: "high",
    outlineShadow: "absent",
    background: "clean",
    layout: "multi-line",
    orientation: "horizontal",
    independenceFamily: "approved-wine-023",
    visualBasis: "Fine black script on white.",
  },
  "approved-wine-027": {
    thinStroke: "yes",
    boldHeavy: "yes",
    contrast: "mixed",
    outlineShadow: "present",
    background: "textured",
    layout: "multi-line",
    orientation: "horizontal",
    independenceFamily: "approved-wine-027",
    visualBasis: "Heavy serif plus fine script over layered decorative lines.",
  },
  "approved-wine-031": {
    thinStroke: "yes",
    boldHeavy: "yes",
    contrast: "high",
    outlineShadow: "absent",
    background: "clean",
    layout: "single-line",
    orientation: "horizontal",
    independenceFamily: "approved-wine-031",
    visualBasis: "High-contrast modern serif with hairlines and heavy stems.",
  },
  "approved-wine-035": {
    thinStroke: "yes",
    boldHeavy: "no",
    contrast: "high",
    outlineShadow: "absent",
    background: "textured",
    layout: "single-line",
    orientation: "horizontal",
    independenceFamily: "approved-wine-035",
    visualBasis: "Fine script on subtly mottled pale background.",
  },
  "approved-wine-085": {
    thinStroke: "yes",
    boldHeavy: "no",
    contrast: "low",
    outlineShadow: "absent",
    background: "textured",
    layout: "single-line",
    orientation: "horizontal",
    independenceFamily: "approved-wine-085",
    visualBasis: "Pale gold script on pale, visibly soft/tonal background.",
  },
  "approved-wine-091": {
    thinStroke: "yes",
    boldHeavy: "no",
    contrast: "high",
    outlineShadow: "absent",
    background: "clean",
    layout: "multi-line",
    orientation: "rotated-or-unknown",
    independenceFamily: "approved-wine-091",
    visualBasis: "Vertically stacked serif letters; orientation is not reliably horizontal.",
  },
  "la-fattoria-rotated": {
    thinStroke: "yes",
    boldHeavy: "no",
    contrast: "high",
    outlineShadow: "absent",
    background: "clean",
    layout: "multi-line",
    orientation: "rotated-or-unknown",
    independenceFamily: "la-fattoria",
    visualBasis: "Existing fixture metadata declares the rotated variant.",
  },
  "wine-multi-artifact-04-region-1": {
    thinStroke: "yes",
    boldHeavy: "yes",
    contrast: "high",
    outlineShadow: "absent",
    background: "clean",
    layout: "multi-line",
    orientation: "horizontal",
    independenceFamily: "dry-cellar",
    visualBasis: "Large red script with heavy bodies and fine flourishes.",
  },
  "wine-multi-artifact-04-region-2": {
    thinStroke: "yes",
    boldHeavy: "yes",
    contrast: "high",
    outlineShadow: "absent",
    background: "clean",
    layout: "single-line",
    orientation: "horizontal",
    independenceFamily: "dry-cellar",
    visualBasis: "Smaller repeated red script from the same source image.",
  },
} as const satisfies Record<string, PreregisteredVisualAssignment>;

export const PREREGISTERED_BRAND_CASE_IDS = Object.freeze(
  Object.keys(PREREGISTERED_VISUAL_ASSIGNMENTS).sort(),
);

export interface VisualSliceInput {
  caseId: string;
  crop: { width: number; height: number };
  imageSha256: string;
}

export interface BrandVisualSlices extends PreregisteredVisualAssignment {
  cropSize: "small" | "medium" | "large";
  sourceChecksumFamily: string;
  labels: string[];
}

export function assignBrandVisualSlices(input: VisualSliceInput): BrandVisualSlices {
  const assignment = (
    PREREGISTERED_VISUAL_ASSIGNMENTS as Record<string, PreregisteredVisualAssignment>
  )[input.caseId];
  if (!assignment) throw new Error(`UNREGISTERED_VISUAL_SLICE_CASE: ${input.caseId}`);
  const parsed = visualAssignmentSchema.parse(assignment);
  const minimumDimension = Math.min(input.crop.width, input.crop.height);
  const cropSize = minimumDimension < 64 ? "small" : minimumDimension < 192 ? "medium" : "large";
  return {
    ...parsed,
    cropSize,
    sourceChecksumFamily: `sha256:${input.imageSha256}`,
    labels: [
      `thin-stroke:${parsed.thinStroke}`,
      `bold-heavy:${parsed.boldHeavy}`,
      `contrast:${parsed.contrast}`,
      `outline-shadow:${parsed.outlineShadow}`,
      `background:${parsed.background}`,
      `crop-size:${cropSize}`,
      `layout:${parsed.layout}`,
      `orientation:${parsed.orientation}`,
      `independence-family:${parsed.independenceFamily}`,
      `source-checksum:${input.imageSha256}`,
    ].sort(),
  };
}

export type SharpeningMechanism =
  | "SHARPENING_RECOVERED_CHARACTER"
  | "SHARPENING_RECOVERED_WORD"
  | "SHARPENING_CHANGED_GROUPING"
  | "SHARPENING_CHANGED_CONFIDENCE_ONLY"
  | "SHARPENING_CREATED_ARTIFACT"
  | "SHARPENING_CAUSED_EMPTY_OCR"
  | "SHARPENING_NO_MEANINGFUL_EFFECT"
  | "UNDETERMINED";

export interface BrandCandidate {
  value: string;
  rawText: string;
  evidenceScore: number | null;
  kept: boolean;
}

export interface BrandCaseReport extends EvaluatedCase {
  regionId: string;
  expectedBrandTruth: string[];
  imageSha256: string;
  visualSlices: BrandVisualSlices;
  normalizedSelectedCandidate: string | null;
  selectedEvidenceScore: number | null;
  candidateValues: string[];
  candidateTop3: string[];
  exactCorrect: boolean;
  normalizedCorrect: boolean;
  rawTruthRecall: boolean;
  candidateListTruthRecall: boolean;
  top3TruthRecall: boolean;
  wrongReliableRead: boolean;
  correctButConservative: boolean;
  emptyOcr: boolean;
}

export interface BrandMetric {
  count: number;
  rate: number | null;
  wilson95: WilsonInterval;
}

export interface BrandAggregateMetrics {
  caseCount: number;
  exactAccuracy: BrandMetric;
  normalizedAccuracy: BrandMetric;
  rawOcrTruthRecall: BrandMetric;
  candidateListTruthRecall: BrandMetric;
  top3TruthRecall: BrandMetric;
  falseReliableReads: BrandMetric;
  emptyOcr: BrandMetric;
  wrongReliableReads: BrandMetric;
  correctButConservative: BrandMetric;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  medianRssDeltaBytes: number | null;
}

export interface BrandSliceMetrics extends BrandAggregateMetrics {
  slice: string;
}

export type BrandArmReport = Omit<ArmReport, "cases"> & {
  cases: BrandCaseReport[];
  brandMetrics: BrandAggregateMetrics;
  brandSliceMetrics: Record<string, BrandSliceMetrics>;
};

export interface BrandCaseDelta {
  caseId: string;
  fixtureId: string;
  regionId: string;
  expectedBrandTruth: string[];
  imageSha256: string;
  independenceFamily: string;
  visualSlices: BrandVisualSlices;
  control: {
    rawTranscript: string;
    selectedCandidate: string | null;
    normalizedSelectedCandidate: string | null;
    meanConfidence: number | null;
    selectedEvidenceScore: number | null;
    authorityState: string;
    reliable: boolean;
    failureClassification: string;
    exactCorrect: boolean;
    normalizedCorrect: boolean;
    rawTruthRecall: boolean;
    candidateListTruthRecall: boolean;
    top3TruthRecall: boolean;
    emptyOcr: boolean;
    latencyMs: number;
  };
  treatment: BrandCaseDelta["control"];
  outputChanged: boolean;
  accuracyImproved: boolean;
  accuracyRegressed: boolean;
  becameEmpty: boolean;
  mechanism: SharpeningMechanism;
  mechanismEvidence: string;
}

export type SharpeningDecision =
  "ADOPT_FOR_LARGER_EVALUATION" | "KILL" | "INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED";

export interface SharpeningDecisionReport {
  decision: SharpeningDecision;
  successCriteria: Record<string, boolean>;
  killReasons: string[];
  improvedCaseIds: string[];
  regressedCaseIds: string[];
  improvementFamilies: string[];
  primaryLatencyRatios: { median: number | null; p95: number | null };
  repeatLatencyRatios: { median: number | null; p95: number | null };
  reproducible: boolean;
  nextExperiment: "local contrast enhancement";
}

interface CandidateLike {
  rawText?: unknown;
  cleanedValue?: unknown;
  ocrEvidenceScore?: unknown;
  kept?: unknown;
}

export function normalizeBrand(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function truthMatch(value: string | null, expectedValues: readonly string[]): boolean {
  if (!value) return false;
  const normalized = normalizeBrand(value);
  return expectedValues.some((expected) => normalizeBrand(expected) === normalized);
}

function exactTruthMatch(value: string | null, expectedValues: readonly string[]): boolean {
  if (!value) return false;
  const exact = value.trim();
  return expectedValues.some((expected) => expected.trim() === exact);
}

function truthIncluded(value: string, expectedValues: readonly string[]): boolean {
  const haystack = normalizeBrand(value);
  return expectedValues.some((expected) => {
    const needle = normalizeBrand(expected);
    return needle.length > 0 && haystack.includes(needle);
  });
}

function candidatesFromTrace(trace: unknown): BrandCandidate[] {
  if (!trace || typeof trace !== "object" || !("candidates" in trace)) return [];
  const candidates = (trace as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate: CandidateLike) => {
    if (typeof candidate.cleanedValue !== "string") return [];
    return [
      {
        value: candidate.cleanedValue,
        rawText: typeof candidate.rawText === "string" ? candidate.rawText : candidate.cleanedValue,
        evidenceScore:
          typeof candidate.ocrEvidenceScore === "number" ? candidate.ocrEvidenceScore : null,
        kept: candidate.kept === true,
      },
    ];
  });
}

function regionId(item: EvaluatedCase): string {
  const suffix = item.caseId.match(/-region-(\d+)$/)?.[1];
  return `brand-region-${suffix ?? "1"}`;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

function p95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function metric(count: number, total: number): BrandMetric {
  return {
    count,
    rate: total === 0 ? null : count / total,
    wilson95: wilson95(count, total),
  };
}

export function aggregateBrandCases(cases: readonly BrandCaseReport[]): BrandAggregateMetrics {
  const total = cases.length;
  return {
    caseCount: total,
    exactAccuracy: metric(cases.filter((item) => item.exactCorrect).length, total),
    normalizedAccuracy: metric(cases.filter((item) => item.normalizedCorrect).length, total),
    rawOcrTruthRecall: metric(cases.filter((item) => item.rawTruthRecall).length, total),
    candidateListTruthRecall: metric(
      cases.filter((item) => item.candidateListTruthRecall).length,
      total,
    ),
    top3TruthRecall: metric(cases.filter((item) => item.top3TruthRecall).length, total),
    falseReliableReads: metric(cases.filter((item) => item.falseCertainty).length, total),
    emptyOcr: metric(cases.filter((item) => item.emptyOcr).length, total),
    wrongReliableReads: metric(cases.filter((item) => item.wrongReliableRead).length, total),
    correctButConservative: metric(
      cases.filter((item) => item.correctButConservative).length,
      total,
    ),
    medianLatencyMs: median(cases.map((item) => item.latencyMs.total)),
    p95LatencyMs: p95(cases.map((item) => item.latencyMs.total)),
    medianRssDeltaBytes: median(cases.map((item) => item.memory.rssDelta)),
  };
}

export function enrichBrandArm(
  report: ArmReport,
  imageShaByFixture: Readonly<Record<string, string>>,
): BrandArmReport {
  const cases = report.cases.map((item): BrandCaseReport => {
    const imageSha256 = imageShaByFixture[item.fixtureId];
    if (!imageSha256) throw new Error(`MISSING_FIXTURE_CHECKSUM: ${item.fixtureId}`);
    const visualSlices = assignBrandVisualSlices({
      caseId: item.caseId,
      crop: item.crop,
      imageSha256,
    });
    const allCandidates = candidatesFromTrace(item.candidateTrace);
    const keptCandidates = allCandidates.filter((candidate) => candidate.kept);
    const candidateValues = keptCandidates.map((candidate) => candidate.value);
    const selectedCandidate = allCandidates.find(
      (candidate) =>
        item.selectedValue !== null &&
        normalizeBrand(candidate.value) === normalizeBrand(item.selectedValue),
    );
    const normalizedCorrect = truthMatch(item.selectedValue, item.expectedValues);
    return {
      ...item,
      slices: [...new Set([...item.slices, ...visualSlices.labels])].sort(),
      regionId: regionId(item),
      expectedBrandTruth: item.expectedValues,
      imageSha256,
      visualSlices,
      normalizedSelectedCandidate:
        item.selectedValue === null ? null : normalizeBrand(item.selectedValue),
      selectedEvidenceScore: selectedCandidate?.evidenceScore ?? null,
      candidateValues,
      candidateTop3: candidateValues.slice(0, 3),
      exactCorrect: exactTruthMatch(item.selectedValue, item.expectedValues),
      normalizedCorrect,
      rawTruthRecall: truthIncluded(item.rawTranscript, item.expectedValues),
      candidateListTruthRecall: candidateValues.some((value) =>
        truthMatch(value, item.expectedValues),
      ),
      top3TruthRecall: candidateValues
        .slice(0, 3)
        .some((value) => truthMatch(value, item.expectedValues)),
      wrongReliableRead: item.reliable && !normalizedCorrect,
      correctButConservative: normalizedCorrect && !item.reliable,
      emptyOcr: item.rawWords.length === 0 || item.rawTranscript.trim().length === 0,
    };
  });
  const labels = [...new Set(cases.flatMap((item) => item.visualSlices.labels))].sort();
  return {
    ...report,
    cases,
    brandMetrics: aggregateBrandCases(cases),
    brandSliceMetrics: Object.fromEntries(
      labels.map((slice) => {
        const members = cases.filter((item) => item.visualSlices.labels.includes(slice));
        return [slice, { slice, ...aggregateBrandCases(members) }];
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

function caseProjection(item: BrandCaseReport) {
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

export function classifySharpeningMechanism(
  control: BrandCaseReport,
  treatment: BrandCaseReport,
): { mechanism: SharpeningMechanism; evidence: string } {
  if (treatment.emptyOcr && !control.emptyOcr) {
    return {
      mechanism: "SHARPENING_CAUSED_EMPTY_OCR",
      evidence: "Treatment changed a non-empty control transcript into empty OCR.",
    };
  }
  if (treatment.rawTruthRecall && !control.rawTruthRecall) {
    return {
      mechanism: "SHARPENING_RECOVERED_WORD",
      evidence: "Fixed truth became present in the normalized raw transcript.",
    };
  }
  const controlDistance = closestTruthDistance(control);
  const treatmentDistance = closestTruthDistance(treatment);
  if (treatmentDistance < controlDistance) {
    return {
      mechanism: "SHARPENING_RECOVERED_CHARACTER",
      evidence: `Closest normalized edit distance improved ${controlDistance} -> ${treatmentDistance}.`,
    };
  }
  const sameTranscript =
    normalizeBrand(control.rawTranscript) === normalizeBrand(treatment.rawTranscript);
  if (
    sameTranscript &&
    (control.normalizedSelectedCandidate !== treatment.normalizedSelectedCandidate ||
      !sameProjection(control.candidateValues, treatment.candidateValues))
  ) {
    return {
      mechanism: "SHARPENING_CHANGED_GROUPING",
      evidence: "Normalized raw transcript held while candidate grouping or selection changed.",
    };
  }
  if (
    sameTranscript &&
    control.normalizedSelectedCandidate === treatment.normalizedSelectedCandidate &&
    (control.meanConfidence !== treatment.meanConfidence ||
      control.selectedEvidenceScore !== treatment.selectedEvidenceScore ||
      control.reliable !== treatment.reliable)
  ) {
    return {
      mechanism: "SHARPENING_CHANGED_CONFIDENCE_ONLY",
      evidence: "Transcript and selection held while confidence or reliability changed.",
    };
  }
  if (
    treatmentDistance > controlDistance ||
    (treatment.wrongReliableRead && !control.wrongReliableRead)
  ) {
    return {
      mechanism: "SHARPENING_CREATED_ARTIFACT",
      evidence: `Closest normalized edit distance worsened ${controlDistance} -> ${treatmentDistance}.`,
    };
  }
  if (sameProjection(caseProjection(control), caseProjection(treatment))) {
    return {
      mechanism: "SHARPENING_NO_MEANINGFUL_EFFECT",
      evidence: "OCR words, transcript, candidate selection, authority, and failure class held.",
    };
  }
  if (
    normalizeBrand(control.rawTranscript) === normalizeBrand(treatment.rawTranscript) &&
    control.normalizedSelectedCandidate === treatment.normalizedSelectedCandidate
  ) {
    return {
      mechanism: "SHARPENING_NO_MEANINGFUL_EFFECT",
      evidence: "Only punctuation, spacing, or non-semantic OCR details changed.",
    };
  }
  return {
    mechanism: "UNDETERMINED",
    evidence: "The deterministic metrics do not isolate a supported mechanism.",
  };
}

function deltaCaseProjection(item: BrandCaseReport): BrandCaseDelta["control"] {
  return {
    rawTranscript: item.rawTranscript,
    selectedCandidate: item.selectedValue,
    normalizedSelectedCandidate: item.normalizedSelectedCandidate,
    meanConfidence: item.meanConfidence,
    selectedEvidenceScore: item.selectedEvidenceScore,
    authorityState: item.selectedState,
    reliable: item.reliable,
    failureClassification: item.failureClass,
    exactCorrect: item.exactCorrect,
    normalizedCorrect: item.normalizedCorrect,
    rawTruthRecall: item.rawTruthRecall,
    candidateListTruthRecall: item.candidateListTruthRecall,
    top3TruthRecall: item.top3TruthRecall,
    emptyOcr: item.emptyOcr,
    latencyMs: item.latencyMs.total,
  };
}

export function compareBrandArms(
  control: BrandArmReport,
  treatment: BrandArmReport,
): BrandCaseDelta[] {
  const treatmentByCase = new Map(treatment.cases.map((item) => [item.caseId, item]));
  return control.cases.map((base) => {
    const next = treatmentByCase.get(base.caseId);
    if (!next) throw new Error(`MISSING_TREATMENT_CASE: ${base.caseId}`);
    const classification = classifySharpeningMechanism(base, next);
    return {
      caseId: base.caseId,
      fixtureId: base.fixtureId,
      regionId: base.regionId,
      expectedBrandTruth: base.expectedBrandTruth,
      imageSha256: base.imageSha256,
      independenceFamily: base.visualSlices.independenceFamily,
      visualSlices: base.visualSlices,
      control: deltaCaseProjection(base),
      treatment: deltaCaseProjection(next),
      outputChanged: !sameProjection(caseProjection(base), caseProjection(next)),
      accuracyImproved: !base.normalizedCorrect && next.normalizedCorrect,
      accuracyRegressed: base.normalizedCorrect && !next.normalizedCorrect,
      becameEmpty: !base.emptyOcr && next.emptyOcr,
      mechanism: classification.mechanism,
      mechanismEvidence: classification.evidence,
    };
  });
}

function ratio(treatment: number | null, control: number | null): number | null {
  if (treatment === null || control === null || control <= 0) return null;
  return treatment / control;
}

export function decideSharpeningExperiment(args: {
  primaryControl: BrandArmReport;
  primaryTreatment: BrandArmReport;
  repeatControl: BrandArmReport;
  repeatTreatment: BrandArmReport;
  changedVariables: readonly string[];
  productionPathChanged: boolean;
  sellerTruthPassedToOcr: boolean;
}): SharpeningDecisionReport {
  const deltas = compareBrandArms(args.primaryControl, args.primaryTreatment);
  const improved = deltas.filter((item) => item.accuracyImproved);
  const regressed = deltas.filter((item) => item.accuracyRegressed);
  const improvementFamilies = [...new Set(improved.map((item) => item.independenceFamily))].sort();
  const primaryLatencyRatios = {
    median: ratio(
      args.primaryTreatment.brandMetrics.medianLatencyMs,
      args.primaryControl.brandMetrics.medianLatencyMs,
    ),
    p95: ratio(
      args.primaryTreatment.brandMetrics.p95LatencyMs,
      args.primaryControl.brandMetrics.p95LatencyMs,
    ),
  };
  const repeatLatencyRatios = {
    median: ratio(
      args.repeatTreatment.brandMetrics.medianLatencyMs,
      args.repeatControl.brandMetrics.medianLatencyMs,
    ),
    p95: ratio(
      args.repeatTreatment.brandMetrics.p95LatencyMs,
      args.repeatControl.brandMetrics.p95LatencyMs,
    ),
  };
  const reproducible =
    args.primaryControl.behaviorHash === args.repeatControl.behaviorHash &&
    args.primaryTreatment.behaviorHash === args.repeatTreatment.behaviorHash;
  const cleanRegressed = deltas.some(
    (item) => item.visualSlices.background === "clean" && item.accuracyRegressed,
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
    atLeastTwoRegionsImprove: improved.length >= 2,
    noPreviouslyCorrectRegionRegresses: regressed.length === 0,
    falseReliableReadsRemainZero:
      args.primaryTreatment.brandMetrics.falseReliableReads.count === 0 &&
      args.repeatTreatment.brandMetrics.falseReliableReads.count === 0,
    wrongReliableReadsRemainZero:
      args.primaryTreatment.brandMetrics.wrongReliableReads.count === 0 &&
      args.repeatTreatment.brandMetrics.wrongReliableReads.count === 0,
    emptyOcrDoesNotIncrease:
      args.primaryTreatment.brandMetrics.emptyOcr.count <=
        args.primaryControl.brandMetrics.emptyOcr.count &&
      args.repeatTreatment.brandMetrics.emptyOcr.count <=
        args.repeatControl.brandMetrics.emptyOcr.count,
    normalizedTop1AccuracyImproves:
      args.primaryTreatment.brandMetrics.normalizedAccuracy.count >
        args.primaryControl.brandMetrics.normalizedAccuracy.count &&
      args.repeatTreatment.brandMetrics.normalizedAccuracy.count >
        args.repeatControl.brandMetrics.normalizedAccuracy.count,
    improvementsCrossIndependentFamilies: improvementFamilies.length >= 2,
    latencyWithinCeilings,
    noProductionCodePathChanges: !args.productionPathChanged,
    onlySharpeningChanged:
      args.changedVariables.length === 1 && args.changedVariables[0] === "sharpening",
    sellerTruthNotPassedToOcr: !args.sellerTruthPassedToOcr,
    noCleanSliceDegradation: !cleanRegressed,
    reproducible,
  };
  const reasonByCriterion: Record<keyof typeof successCriteria, string> = {
    atLeastTwoRegionsImprove: "zero or one governed region improved",
    noPreviouslyCorrectRegionRegresses: "a previously correct region regressed",
    falseReliableReadsRemainZero: "a false reliable read appeared",
    wrongReliableReadsRemainZero: "a wrong reliable read appeared",
    emptyOcrDoesNotIncrease: "empty OCR increased",
    normalizedTop1AccuracyImproves: "normalized top-1 accuracy did not improve",
    improvementsCrossIndependentFamilies:
      "improvements did not span at least two duplicate/checksum families",
    latencyWithinCeilings: "median or p95 latency exceeded its preregistered ceiling",
    noProductionCodePathChanges: "a production code path changed",
    onlySharpeningChanged: "the treatment changed more than sharpening",
    sellerTruthNotPassedToOcr: "seller truth was passed into OCR",
    noCleanSliceDegradation: "a visually clean slice regressed",
    reproducible: "control or treatment behavior was not reproducible",
  };
  const killReasons = (Object.keys(successCriteria) as Array<keyof typeof successCriteria>).flatMap(
    (criterion) => (successCriteria[criterion] ? [] : [reasonByCriterion[criterion]]),
  );
  return {
    decision: killReasons.length === 0 ? "ADOPT_FOR_LARGER_EVALUATION" : "KILL",
    successCriteria,
    killReasons,
    improvedCaseIds: improved.map((item) => item.caseId),
    regressedCaseIds: regressed.map((item) => item.caseId),
    improvementFamilies,
    primaryLatencyRatios,
    repeatLatencyRatios,
    reproducible,
    nextExperiment: "local contrast enhancement",
  };
}
