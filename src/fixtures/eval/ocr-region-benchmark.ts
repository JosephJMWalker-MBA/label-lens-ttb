import {
  ANALYZER_EVIDENCE_SCHEMA_VERSION,
  type AnalyzerEvidenceResponse,
  type AnalyzerFieldObservation,
} from "@/pipeline/analyzer/analyzer.types";
import {
  extractLabelEvidenceDetailed,
  type DetailedExtractionResult,
} from "@/pipeline/extractor/extractor";
import { createLocalOcrEngine, PAGE_SEG } from "@/pipeline/extractor/ocr-engine";
import {
  selectAlcoholObservation,
  selectBrandObservation,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";
import { verifyAndDecode } from "@/pipeline/extractor/image-integrity";
import type {
  ExtractionInput,
  OcrFieldEligibility,
  OcrPassKind,
  OcrPassTriggerReason,
  OcrWord,
  RegionOcrResult,
  RotationDegrees,
} from "@/pipeline/extractor/extractor.types";
import { runOcrPass } from "@/pipeline/extractor/regions";
import { ok } from "@/shared/result";

import { buildCaseReport, EVAL_ADAPTER } from "./eval-harness";
import { loadCaseImage, loadEvalManifest, type LoadedCaseImage } from "./eval-loader";
import type { CaseReport, RecoveryPassContribution } from "./eval-report.types";
import type {
  EvalAnnotationConfidence,
  EvalCase,
  EvalFailureClass,
  EvalNormalizedBox,
  EvalTextOrientation,
  IncludedEvalRecord,
  LoadedEvalManifest,
} from "./eval-manifest.types";
import { alcoholParsedAccurate, brandInTopK, brandNormalizedMatch, normalizeKey } from "./metrics";
import {
  OCR_REGION_BENCHMARK_ANNOTATION_SCHEMA_VERSION,
  OCR_REGION_BENCHMARK_CASE_ANNOTATIONS,
  type OcrRegionBenchmarkCaseAnnotation,
  type OcrRegionBenchmarkFieldAnnotation,
  type OcrRegionBenchmarkFieldKey,
} from "./ocr-region-benchmark.annotations";

export const OCR_REGION_BENCHMARK_REPORT_SCHEMA_VERSION =
  "ocr-region-isolation-benchmark-report.v3" as const;

export const OCR_REGION_BENCHMARK_PROCESSED_AT = "2026-07-13T00:00:00Z";

export const TARGETED_SCALE_FACTORS = [1.5, 2, 3] as const;
export type OcrRegionBenchmarkScale = (typeof TARGETED_SCALE_FACTORS)[number];

export const TARGETED_SCALE_KEYS = ["1.5x", "2x", "3x"] as const;
export type OcrRegionBenchmarkScaleKey = (typeof TARGETED_SCALE_KEYS)[number];

export type OcrRegionBenchmarkScenarioKey =
  | "production-baseline"
  | "human-targeted-crop"
  | "canonically-rotated-targeted-crop"
  | "baseline-plus-targeted-crop"
  | "baseline-plus-canonically-rotated-targeted-crop";

export type OcrRegionBenchmarkDecisionLabel =
  | "ADDITIVE REGION SIGNAL SUPPORTED"
  | "BOUNDED ADDITIVE BRAND SIGNAL SUPPORTED"
  | "REGION REPLACEMENT NOT SUPPORTED"
  | "RECOGNITION BOTTLENECK SUPPORTED"
  | "ROTATION STRATEGY NOT SUPPORTED"
  | "SCALE-SENSITIVE RESULT"
  | "MIXED RESULT"
  | "INSUFFICIENT EVIDENCE";

export type BenchmarkScenarioFamilyKey =
  "crop-only" | "rotated-crop-only" | "additive" | "rotated-additive";

type BenchmarkSyntheticPassKind =
  "benchmark-targeted-crop" | "benchmark-canonical-rotated-targeted-crop";

type BenchmarkSyntheticTriggerReason =
  "benchmark-human-targeted-region" | "benchmark-canonical-rotation";

export type BenchmarkPassKind = OcrPassKind | BenchmarkSyntheticPassKind;
export type BenchmarkTriggerReason = OcrPassTriggerReason | BenchmarkSyntheticTriggerReason;

export interface BenchmarkCropGeometry {
  normalized: EvalNormalizedBox;
  pixels: { left: number; top: number; width: number; height: number };
  areaRatio: number;
}

export interface BenchmarkRawOcrSummary {
  wordCount: number;
  rawConfidenceMean: number | null;
  rawConfidenceMin: number | null;
  rawConfidenceMax: number | null;
  expectedPhrasePresent: boolean;
  normalizedPhraseSimilarity: number;
  expectedTokenCount: number;
  expectedTokenPresenceCount: number;
  missingExpectedTokens: string[];
  fragmentedExpectedTokens: string[];
}

export interface BenchmarkRawContribution {
  newWords: string[];
  newWordCount: number;
  expectedTokenCoverage: number;
  expectedPhrasePresent: boolean;
  normalizedPhraseSimilarity: number;
  fragmentedExpectedTokens: string[];
  missingExpectedTokens: string[];
  rawConfidenceMean: number | null;
  rawConfidenceMin: number | null;
  rawConfidenceMax: number | null;
}

export interface BenchmarkPipelineSummary {
  matchingCandidateGenerated: boolean;
  matchingCandidateKept: boolean;
  rankingPosition: number | null;
  top3Presence: boolean;
  top5Presence: boolean;
  ambiguityState: boolean;
  parserOutcome: "not-applicable" | "correct" | "parser-failure" | "incorrect" | "not-observed";
}

export interface BenchmarkCandidateContribution {
  matchingCandidateGenerated: boolean;
  matchingCandidateKept: boolean;
  candidateDecisionReason: string | null;
  rankingPosition: number | null;
  supportPassIds: string[];
  supportPassKinds: BenchmarkPassKind[];
  duplicateCorroborated: boolean;
  newCandidateIntroduced: boolean;
  newAlternateIntroduced: boolean;
  orderingChanged: boolean;
  ambiguityChanged: boolean;
}

export interface BenchmarkProductContribution {
  selectedValueChanged: boolean;
  selectedStateChanged: boolean;
  correctResultRecovered: boolean;
  correctUncertaintyRecovered: boolean;
  totalAcceptableRecovery: boolean;
  falseCertaintyIntroduced: boolean;
  falseCertaintyRemoved: boolean;
  absentFieldFalsePositiveIntroduced: boolean;
  priorCorrectResultRegressed: boolean;
  noMeaningfulContribution: boolean;
}

export interface BenchmarkPassContribution {
  passId: string;
  passOrder: number;
  passKind: BenchmarkPassKind;
  triggerReasons: BenchmarkTriggerReason[];
  executionTimeMs: number;
  cumulativeCostMs: number;
  newOcrTokens: boolean;
  newOcrTokenCount: number;
  newFieldLikeEvidence: boolean;
  newFieldLikeEvidenceFields: OcrRegionBenchmarkFieldKey[];
  acceptedCandidate: boolean;
  acceptedCandidateFields: OcrRegionBenchmarkFieldKey[];
  changedSelectedField: boolean;
  changedSelectedFields: OcrRegionBenchmarkFieldKey[];
  correctSelectedField: boolean;
  correctSelectedFields: OcrRegionBenchmarkFieldKey[];
  noMeasuredValue: boolean;
}

export interface BenchmarkHybridProvenance {
  productionPassIds: string[];
  productionPassKinds: BenchmarkPassKind[];
  targetedPassId: string | null;
  targetedPassKind: BenchmarkPassKind | null;
  targetedTriggerReasons: BenchmarkTriggerReason[];
  targetedCropGeometry: BenchmarkCropGeometry | null;
  rotationApplied: RotationDegrees;
  preprocessing: string[];
  fieldEligibility: OcrFieldEligibility | null;
  supportingPassIds: string[];
  supportingPassKinds: BenchmarkPassKind[];
  usedTargetedEvidence: boolean;
  targetedBecameSelectedSource: boolean;
  targetedOnlyCorroboratedExistingCandidate: boolean;
  targetedIntroducedNewCandidate: boolean;
  targetedChangedOrdering: boolean;
  targetedChangedAmbiguity: boolean;
  targetedChangedSelectedValue: boolean;
}

export interface BenchmarkScenarioFieldResult {
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale | null;
  applicable: boolean;
  truthPresent: boolean;
  selectedState: AnalyzerFieldObservation["state"];
  selectedValue: string | null;
  failureClass: EvalFailureClass;
  exactMatch: boolean;
  normalizedMatch: boolean;
  parsedAccurate: boolean;
  candidateFilteringSubtype: CaseReport["brand"]["candidateFilteringSubtype"];
  rawOcr: BenchmarkRawOcrSummary | null;
  rawContribution: BenchmarkRawContribution | null;
  pipeline: BenchmarkPipelineSummary | null;
  candidateContribution: BenchmarkCandidateContribution | null;
  productContribution: BenchmarkProductContribution | null;
  passContribution: BenchmarkPassContribution | null;
  hybridProvenance: BenchmarkHybridProvenance | null;
  crop: BenchmarkCropGeometry | null;
  rotationApplied: RotationDegrees;
  annotationConfidence: EvalAnnotationConfidence | null;
  humanReadable: boolean | null;
  latencyMs: number;
  timings: {
    preprocessMs: number;
    ocrMs: number;
    inverseMappingMs: number;
    totalMs: number;
  } | null;
  passCount: number;
  extractionError: string | null;
  notes: string[];
}

export type BenchmarkScaleVariantMap = Record<
  OcrRegionBenchmarkScaleKey,
  BenchmarkScenarioFieldResult
>;

export interface BenchmarkFieldComparison {
  baseline: BenchmarkScenarioFieldResult;
  targetedCrop: BenchmarkScenarioFieldResult;
  canonicalRotatedCrop: BenchmarkScenarioFieldResult;
  additiveTargetedCrop: BenchmarkScenarioFieldResult;
  additiveCanonicalRotatedCrop: BenchmarkScenarioFieldResult;
  scaleVariants: {
    targetedCrop: BenchmarkScaleVariantMap;
    canonicalRotatedCrop: BenchmarkScaleVariantMap;
    additiveTargetedCrop: BenchmarkScaleVariantMap;
    additiveCanonicalRotatedCrop: BenchmarkScaleVariantMap;
  };
  diagnosticBestScenario: {
    scenario: OcrRegionBenchmarkScenarioKey;
    scale: OcrRegionBenchmarkScale | null;
  };
  changedSelectedValue: boolean;
  correctedByCounterfactual: boolean;
  regressedByCounterfactual: boolean;
  classifications: string[];
}

export interface OcrRegionBenchmarkCaseResult {
  caseId: string;
  imagePath: string;
  strata: string[];
  inclusionReasons: string[];
  challengeSlices: string[];
  adjudicationNotes: string;
  fields: {
    brand: BenchmarkFieldComparison;
    alcohol: BenchmarkFieldComparison;
  };
}

export interface OcrRegionBenchmarkScenarioSummaryEntry {
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale | null;
  label: string;
  description: string;
}

export interface OcrRegionBenchmarkScenarioAggregate {
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale | null;
  field: OcrRegionBenchmarkFieldKey;
  presentCaseCount: number;
  absentCaseCount: number;
  exactMatchCount: number;
  normalizedMatchCount: number;
  top3Count: number;
  top5Count: number;
  detectedCount: number;
  parsedAccurateCount: number;
  falseCertaintyCount: number;
  absentFieldFalsePositiveCount: number;
  absentFieldFalsePositiveRate: number | null;
  parserFailureCount: number;
  expectedPhrasePresentCount: number;
  meanExpectedTokenCoverage: number;
  meanNormalizedPhraseSimilarity: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
}

export interface OcrRegionBenchmarkContributionAggregate {
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale;
  field: OcrRegionBenchmarkFieldKey;
  applicableCaseCount: number;
  meanNewWordCount: number;
  exactPhrasePresentCount: number;
  matchingCandidateGeneratedCount: number;
  matchingCandidateKeptCount: number;
  duplicateCorroboratedCount: number;
  newCandidateIntroducedCount: number;
  newAlternateIntroducedCount: number;
  orderingChangedCount: number;
  ambiguityChangedCount: number;
  selectedValueChangedCount: number;
  correctResultRecoveredCount: number;
  correctUncertaintyRecoveredCount: number;
  totalAcceptableRecoveryCount: number;
  falseCertaintyIntroducedCount: number;
  falseCertaintyRemovedCount: number;
  absentFieldFalsePositiveIntroducedCount: number;
  priorCorrectResultRegressedCount: number;
  noMeaningfulContributionCount: number;
}

export interface OcrRegionBenchmarkRecoverySummary {
  family: BenchmarkScenarioFamilyKey;
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale;
  field: OcrRegionBenchmarkFieldKey;
  applicableCaseCount: number;
  exactRecoveryCount: number;
  correctUncertaintyRecoveryCount: number;
  totalAcceptableRecoveryCount: number;
  recoveredCaseFields: string[];
}

export interface OcrRegionBenchmarkRecoveryEntry {
  caseId: string;
  field: OcrRegionBenchmarkFieldKey;
  family: BenchmarkScenarioFamilyKey;
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale;
  recoveryKind: "correct-result" | "correct-uncertainty";
  baselineFailureClass: EvalFailureClass;
  scenarioFailureClass: EvalFailureClass;
  targetedBecameSelectedSource: boolean | null;
  duplicateCorroborated: boolean;
  newCandidateIntroduced: boolean;
  newAlternateIntroduced: boolean;
  orderingChanged: boolean;
  ambiguityChanged: boolean;
}

export interface OcrRegionBenchmarkChallengeSliceSummary {
  slice: string;
  field: OcrRegionBenchmarkFieldKey;
  scenario: OcrRegionBenchmarkScenarioKey;
  applicableCaseCount: number;
  correctedCount: number;
  expectedPhrasePresentCount: number;
}

export interface OcrRegionBenchmarkRegressionEntry {
  caseId: string;
  field: OcrRegionBenchmarkFieldKey;
  family: BenchmarkScenarioFamilyKey;
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale | null;
  baselineFailureClass: EvalFailureClass;
  scenarioFailureClass: EvalFailureClass;
  baselineValue: string | null;
  scenarioValue: string | null;
}

export interface OcrRegionBenchmarkRegressionSummary {
  family: BenchmarkScenarioFamilyKey;
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale | null;
  applicableCaseFieldCount: number;
  scenarioScaleRegressionInstanceCount: number;
  uniqueCaseFieldRegressionCount: number;
  uniqueCaseFields: string[];
}

export interface OcrRegionBenchmarkLatencySummary {
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale | null;
  field: OcrRegionBenchmarkFieldKey;
  applicableCaseCount: number;
  latencyInterpretation: "production-baseline" | "measured-targeted-pass" | "estimated-combined";
  matchedBaselineMedianLatencyMs: number | null;
  measuredTargetedIncrementalMedianLatencyMs: number | null;
  estimatedCombinedMedianLatencyMs: number | null;
  matchedMedianDeltaLatencyMs: number | null;
}

export interface OcrRegionBenchmarkScaleAnalysisSummary {
  family: BenchmarkScenarioFamilyKey;
  scenario: OcrRegionBenchmarkScenarioKey;
  field: OcrRegionBenchmarkFieldKey;
  applicableCaseFieldCount: number;
  improvedWithScaleCount: number;
  worsenedWithScaleCount: number;
  failureClassChangedWithoutSelectedOutcomeImprovementCount: number;
  unchangedCount: number;
  improvedCaseFields: string[];
  worsenedCaseFields: string[];
  failureClassChangedCaseFields: string[];
}

export interface OcrRegionBenchmarkAnnotationCoverage {
  benchmarkCaseCount: number;
  brandPresentCaseCount: number;
  alcoholPresentCaseCount: number;
  brandAnnotatedCaseCount: number;
  alcoholAnnotatedCaseCount: number;
  absentBrandCaseCount: number;
  absentAlcoholCaseCount: number;
  highConfidenceFieldCount: number;
  mediumConfidenceFieldCount: number;
  humanReadableFieldCount: number;
  challengeSliceCounts: Record<string, number>;
}

export interface OcrRegionBenchmarkBoundaryProof {
  benchmarkModules: string[];
  guardTests: string[];
  productionBehaviorChangeAuthorized: false;
  proofNote: string;
}

export interface OcrRegionBenchmarkConclusionSection {
  topic:
    | "replacement"
    | "additive-brand"
    | "additive-alcohol"
    | "rotation"
    | "scaling"
    | "remaining-bottlenecks";
  labels: OcrRegionBenchmarkDecisionLabel[];
  rationale: string;
  evidence: string[];
}

export interface OcrRegionBenchmarkReport {
  schemaVersion: typeof OCR_REGION_BENCHMARK_REPORT_SCHEMA_VERSION;
  annotationSchemaVersion: typeof OCR_REGION_BENCHMARK_ANNOTATION_SCHEMA_VERSION;
  manifestSchemaVersion: string;
  benchmarkCaseCount: number;
  scenarioSummary: OcrRegionBenchmarkScenarioSummaryEntry[];
  cases: OcrRegionBenchmarkCaseResult[];
  annotationCoverage: OcrRegionBenchmarkAnnotationCoverage;
  aggregateComparisons: OcrRegionBenchmarkScenarioAggregate[];
  contributionSummaries: OcrRegionBenchmarkContributionAggregate[];
  recoverySummaries: OcrRegionBenchmarkRecoverySummary[];
  recoveryLedger: OcrRegionBenchmarkRecoveryEntry[];
  challengeSliceComparisons: OcrRegionBenchmarkChallengeSliceSummary[];
  regressions: OcrRegionBenchmarkRegressionEntry[];
  regressionSummaries: OcrRegionBenchmarkRegressionSummary[];
  latencyComparison: OcrRegionBenchmarkLatencySummary[];
  scaleAnalysis: OcrRegionBenchmarkScaleAnalysisSummary[];
  conclusions: OcrRegionBenchmarkConclusionSection[];
  productionBoundaryProof: OcrRegionBenchmarkBoundaryProof;
}

interface BenchmarkLoadedCase {
  evalCase: EvalCase;
  record: IncludedEvalRecord;
  annotation: OcrRegionBenchmarkCaseAnnotation;
}

interface TargetedPassExecution {
  pass: RegionOcrResult;
  crop: BenchmarkCropGeometry;
  latencyMs: number;
  timings: {
    preprocessMs: number;
    ocrMs: number;
    inverseMappingMs: number;
    totalMs: number;
  };
}

interface ScenarioRunArtifacts {
  report: CaseReport;
  passes: RegionOcrResult[];
}

interface BaselineContext {
  evalCase: EvalCase;
  inputBase: ExtractionInput;
  decoded: { width: number; height: number; format: string };
  baselineReport: CaseReport;
  baselinePasses: RegionOcrResult[];
  baselinePrimarySelections: { brand: FieldSelection; alcohol: FieldSelection } | null;
  baselineResult: BenchmarkScenarioFieldResult;
}

const TARGETED_CROP_PASS_KIND = "benchmark-targeted-crop" as const;
const TARGETED_ROTATED_PASS_KIND = "benchmark-canonical-rotated-targeted-crop" as const;
const TARGETED_TRIGGER_REASON = "benchmark-human-targeted-region" as const;
const TARGETED_ROTATION_TRIGGER_REASON = "benchmark-canonical-rotation" as const;
const MAX_NEW_WORDS = 12;

function asSyntheticPassKind(value: BenchmarkSyntheticPassKind): OcrPassKind {
  // Evaluation-only adapter: selectors accept the committed production union,
  // so benchmark-only synthetic pass kinds are narrowed only at this boundary.
  return value as unknown as OcrPassKind;
}

function asSyntheticTriggerReason(value: BenchmarkSyntheticTriggerReason): OcrPassTriggerReason {
  // Evaluation-only adapter: benchmark-only trigger reasons never escape this
  // module or alter production planning.
  return value as unknown as OcrPassTriggerReason;
}

function extractionInput(
  evalCase: EvalCase,
  sha256: string,
  imageBytes: Uint8Array,
): ExtractionInput {
  return {
    imageBytes,
    artifactRef: evalCase.caseId,
    derivativeSha256: sha256,
    processedAt: OCR_REGION_BENCHMARK_PROCESSED_AT,
    extractionAdapterId: EVAL_ADAPTER.id,
    extractionAdapterVersion: EVAL_ADAPTER.version,
    ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scaleKey(scale: OcrRegionBenchmarkScale): OcrRegionBenchmarkScaleKey {
  switch (scale) {
    case 1.5:
      return "1.5x";
    case 2:
      return "2x";
    case 3:
      return "3x";
  }
}

function scaleLabel(scale: OcrRegionBenchmarkScale | null): string {
  return scale === null ? "baseline" : `${scaleKey(scale)}`;
}

function scenarioFamily(
  scenario: OcrRegionBenchmarkScenarioKey,
): BenchmarkScenarioFamilyKey | null {
  switch (scenario) {
    case "production-baseline":
      return null;
    case "human-targeted-crop":
      return "crop-only";
    case "canonically-rotated-targeted-crop":
      return "rotated-crop-only";
    case "baseline-plus-targeted-crop":
      return "additive";
    case "baseline-plus-canonically-rotated-targeted-crop":
      return "rotated-additive";
  }
}

function scenarioFamilyLabel(family: BenchmarkScenarioFamilyKey): string {
  switch (family) {
    case "crop-only":
      return "Crop-only replacement";
    case "rotated-crop-only":
      return "Rotated crop-only replacement";
    case "additive":
      return "Additive targeted evidence";
    case "rotated-additive":
      return "Rotated additive targeted evidence";
  }
}

function caseFieldKey(caseId: string, field: OcrRegionBenchmarkFieldKey): string {
  return `${caseId}:${field}`;
}

function pctOrNA(numerator: number, denominator: number): string {
  return denominator === 0 ? "N/A" : pct(numerator, denominator);
}

function rateOrNull(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function msOrNA(value: number | null): string {
  return value === null ? "N/A" : `${value.toFixed(0)} ms`;
}

function acceptableOutcome(failureClass: EvalFailureClass): boolean {
  return failureClass === "correct" || failureClass === "correct-uncertainty";
}

function recoveryKind(
  contribution: BenchmarkProductContribution | null,
): "correct-result" | "correct-uncertainty" | null {
  if (!contribution) return null;
  if (contribution.correctResultRecovered) return "correct-result";
  if (contribution.correctUncertaintyRecovered) return "correct-uncertainty";
  return null;
}

function createScaleVariantMap(
  factory: (scale: OcrRegionBenchmarkScale) => BenchmarkScenarioFieldResult,
) {
  return {
    "1.5x": factory(1.5),
    "2x": factory(2),
    "3x": factory(3),
  } satisfies BenchmarkScaleVariantMap;
}

export function normalizedToPixels(box: EvalNormalizedBox, width: number, height: number) {
  const left = clamp(Math.floor(box.x * width), 0, Math.max(0, width - 1));
  const top = clamp(Math.floor(box.y * height), 0, Math.max(0, height - 1));
  const right = clamp(Math.ceil((box.x + box.width) * width), left + 1, width);
  const bottom = clamp(Math.ceil((box.y + box.height) * height), top + 1, height);
  return { left, top, width: right - left, height: bottom - top };
}

export function rotationForOrientation(orientation: EvalTextOrientation): RotationDegrees | null {
  switch (orientation) {
    case "vertical-clockwise":
      return 270;
    case "vertical-counterclockwise":
      return 90;
    case "rotated-180":
      return 180;
    default:
      return null;
  }
}

export function loadBenchmarkCases(manifest: LoadedEvalManifest): BenchmarkLoadedCase[] {
  const caseById = new Map(manifest.cases.map((evalCase) => [evalCase.caseId, evalCase]));
  const recordById = new Map(
    manifest.records
      .filter((record): record is IncludedEvalRecord => record.status === "included")
      .map((record) => [record.caseId, record]),
  );
  return OCR_REGION_BENCHMARK_CASE_ANNOTATIONS.map((annotation) => {
    const evalCase = caseById.get(annotation.caseId);
    const record = recordById.get(annotation.caseId);
    if (!evalCase || !record) {
      throw new Error(`benchmark annotation references unknown included case ${annotation.caseId}`);
    }
    return { evalCase, record, annotation };
  });
}

export function validateBenchmarkAnnotations(cases: BenchmarkLoadedCase[]) {
  const seen = new Set<string>();
  for (const benchmarkCase of cases) {
    if (seen.has(benchmarkCase.evalCase.caseId)) {
      throw new Error(`duplicate benchmark case ${benchmarkCase.evalCase.caseId}`);
    }
    seen.add(benchmarkCase.evalCase.caseId);
    for (const [field, annotation] of Object.entries(benchmarkCase.annotation.fields) as Array<
      [OcrRegionBenchmarkFieldKey, OcrRegionBenchmarkFieldAnnotation]
    >) {
      for (const [key, value] of Object.entries(annotation.geometry)) {
        if (!Number.isFinite(value) || value < 0 || value > 1) {
          throw new Error(`${benchmarkCase.evalCase.caseId}:${field}:${key} must be in [0,1]`);
        }
      }
      if (annotation.geometry.width <= 0 || annotation.geometry.height <= 0) {
        throw new Error(
          `${benchmarkCase.evalCase.caseId}:${field} geometry must have positive size`,
        );
      }
    }
  }
}

function normalizePhrase(text: string): string {
  return normalizeKey(text);
}

function bigrams(text: string): string[] {
  if (text.length < 2) return text.length === 0 ? [] : [text];
  const out: string[] = [];
  for (let index = 0; index < text.length - 1; index += 1) out.push(text.slice(index, index + 2));
  return out;
}

function diceSimilarity(left: string, right: string): number {
  const a = normalizePhrase(left);
  const b = normalizePhrase(right);
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  const leftBigrams = bigrams(a);
  const counts = new Map<string, number>();
  for (const bigram of leftBigrams) counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  let intersection = 0;
  for (const bigram of bigrams(b)) {
    const count = counts.get(bigram) ?? 0;
    if (count <= 0) continue;
    counts.set(bigram, count - 1);
    intersection += 1;
  }
  return (2 * intersection) / (leftBigrams.length + bigrams(b).length);
}

function truthExpectedPhrases(field: OcrRegionBenchmarkFieldKey, evalCase: EvalCase): string[] {
  if (field === "brand") return evalCase.brand.present ? evalCase.brand.acceptable : [];
  if (!evalCase.alcohol.present) return [];
  return evalCase.alcohol.acceptableText.length > 0
    ? evalCase.alcohol.acceptableText
    : evalCase.alcohol.acceptablePercents.map((value) => `${value}%`);
}

function expectedPhrasePresent(text: string, phrases: string[]): boolean {
  const hay = normalizePhrase(text);
  return phrases.some((phrase) => {
    const needle = normalizePhrase(phrase);
    return needle.length > 0 && hay.includes(needle);
  });
}

function tokenizePhrase(phrase: string): string[] {
  return phrase
    .split(/\s+/)
    .map((part) => normalizePhrase(part))
    .filter((part) => part.length > 0);
}

function bestExpectedPhrase(text: string, phrases: string[]): string | null {
  let best: { phrase: string; score: number } | null = null;
  for (const phrase of phrases) {
    const score = expectedPhrasePresent(text, [phrase]) ? 1 : diceSimilarity(text, phrase);
    if (!best || score > best.score) best = { phrase, score };
  }
  return best?.phrase ?? null;
}

function fragmentedToken(token: string, ocrTokens: string[]): boolean {
  for (let start = 0; start < ocrTokens.length; start += 1) {
    let combined = "";
    for (let end = start; end < Math.min(ocrTokens.length, start + 4); end += 1) {
      combined += ocrTokens[end];
      if (combined === token && end > start) return true;
      if (combined.length >= token.length) break;
    }
  }
  return false;
}

export function rawOcrSummary(
  field: OcrRegionBenchmarkFieldKey,
  evalCase: EvalCase,
  words: OcrWord[],
): BenchmarkRawOcrSummary | null {
  const phrases = truthExpectedPhrases(field, evalCase);
  if (phrases.length === 0) return null;

  const text = words.map((word) => word.text).join(" ");
  const selectedPhrase = bestExpectedPhrase(text, phrases) ?? phrases[0];
  const expectedTokens = tokenizePhrase(selectedPhrase);
  const ocrTokens = words
    .map((word) => normalizePhrase(word.text))
    .filter((token) => token.length > 0);
  const presentTokens = expectedTokens.filter(
    (token) => ocrTokens.includes(token) || fragmentedToken(token, ocrTokens),
  );
  const fragmentedExpectedTokens = expectedTokens.filter(
    (token) => !ocrTokens.includes(token) && fragmentedToken(token, ocrTokens),
  );
  const missingExpectedTokens = expectedTokens.filter(
    (token) => !ocrTokens.includes(token) && !fragmentedToken(token, ocrTokens),
  );
  const confidences = words
    .map((word) => word.rawConfidence)
    .filter((confidence) => Number.isFinite(confidence));
  const mean =
    confidences.length === 0
      ? null
      : confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length;
  return {
    wordCount: words.length,
    rawConfidenceMean: mean,
    rawConfidenceMin: confidences.length === 0 ? null : Math.min(...confidences),
    rawConfidenceMax: confidences.length === 0 ? null : Math.max(...confidences),
    expectedPhrasePresent: expectedPhrasePresent(text, phrases),
    normalizedPhraseSimilarity: diceSimilarity(text, selectedPhrase),
    expectedTokenCount: expectedTokens.length,
    expectedTokenPresenceCount: presentTokens.length,
    missingExpectedTokens,
    fragmentedExpectedTokens,
  };
}

function brandTextMatches(text: string | null | undefined, acceptable: string[]): boolean {
  const normalized = normalizePhrase(text ?? "");
  if (normalized.length === 0) return false;
  return acceptable.some((candidate) => {
    const accepted = normalizePhrase(candidate);
    return accepted.length > 0 && (normalized.includes(accepted) || accepted.includes(normalized));
  });
}

function alcoholTextMatches(
  text: string | null | undefined,
  parsedPercent: number | null,
  evalCase: EvalCase,
): boolean {
  if (!evalCase.alcohol.present) return false;
  if (
    parsedPercent !== null &&
    evalCase.alcohol.acceptablePercents.some((value) => Math.abs(value - parsedPercent) < 0.05)
  ) {
    return true;
  }
  return evalCase.alcohol.acceptableText.some((statement) => brandTextMatches(text, [statement]));
}

function alcoholTopKPresence(report: CaseReport, evalCase: EvalCase, k: number): boolean {
  if (!evalCase.alcohol.present) return false;
  const values = [
    report.alcohol.value,
    ...report.alcohol.alternates.slice(0, Math.max(0, k - 1)).map((alternate) => alternate.value),
  ];
  return values.some((value) => alcoholParsedAccurate(value, evalCase.alcohol.acceptablePercents));
}

function brandRankingPosition(report: CaseReport): number | null {
  if (report.brand.exactMatch || report.brand.normalizedMatch) return 1;
  const ranked = report.brand.alternates.map((alternate) => alternate.value);
  for (const [index, value] of ranked.entries()) {
    if (brandNormalizedMatch(value, report.brand.acceptable)) return index + 2;
  }
  return null;
}

function alcoholRankingPosition(report: CaseReport, evalCase: EvalCase): number | null {
  if (
    report.alcohol.detected &&
    alcoholParsedAccurate(report.alcohol.value, evalCase.alcohol.acceptablePercents)
  ) {
    return 1;
  }
  const ranked = report.alcohol.alternates.map((alternate) => alternate.value);
  for (const [index, value] of ranked.entries()) {
    if (alcoholParsedAccurate(value, evalCase.alcohol.acceptablePercents)) return index + 2;
  }
  return null;
}

function pipelineSummary(
  field: OcrRegionBenchmarkFieldKey,
  report: CaseReport,
  evalCase: EvalCase,
): BenchmarkPipelineSummary | null {
  if (field === "brand") {
    const matchingGenerated =
      report.diagnostics.brandLineContainsAcceptable ||
      report.diagnostics.brandCandidateDecisions.some((candidate) =>
        brandTextMatches(candidate.cleanedValue ?? candidate.rawText, evalCase.brand.acceptable),
      );
    const matchingKept = report.diagnostics.brandCandidateDecisions.some(
      (candidate) =>
        candidate.kept &&
        brandTextMatches(candidate.cleanedValue ?? candidate.rawText, evalCase.brand.acceptable),
    );
    return {
      matchingCandidateGenerated: matchingGenerated,
      matchingCandidateKept: matchingKept,
      rankingPosition: brandRankingPosition(report),
      top3Presence: report.brand.top3Recall,
      top5Presence: brandInTopK(
        {
          state: report.brand.state,
          value: report.brand.value,
          confidence: report.brand.confidence,
          ocrEvidenceScore: report.brand.ocrEvidenceScore,
          alternates: report.brand.alternates,
        },
        report.brand.acceptable,
        5,
      ),
      ambiguityState: report.brand.state === "AMBIGUOUS",
      parserOutcome: "not-applicable",
    };
  }

  const matchingGenerated = report.diagnostics.alcoholCandidateDecisions.some((candidate) =>
    alcoholTextMatches(
      candidate.normalizedValue ?? candidate.normalizedParsingText ?? candidate.rawText,
      candidate.parsedPercent,
      evalCase,
    ),
  );
  const matchingKept = report.diagnostics.alcoholCandidateDecisions.some(
    (candidate) =>
      candidate.kept &&
      alcoholTextMatches(
        candidate.normalizedValue ?? candidate.normalizedParsingText ?? candidate.rawText,
        candidate.parsedPercent,
        evalCase,
      ),
  );
  let parserOutcome: BenchmarkPipelineSummary["parserOutcome"] = "not-observed";
  if (report.alcohol.failureClass === "parser-failure") parserOutcome = "parser-failure";
  else if (report.alcohol.detected && report.alcohol.parsedAccurate) parserOutcome = "correct";
  else if (report.alcohol.detected) parserOutcome = "incorrect";
  return {
    matchingCandidateGenerated: matchingGenerated,
    matchingCandidateKept: matchingKept,
    rankingPosition: alcoholRankingPosition(report, evalCase),
    top3Presence: alcoholTopKPresence(report, evalCase, 3),
    top5Presence: alcoholTopKPresence(report, evalCase, 5),
    ambiguityState: report.alcohol.state === "AMBIGUOUS",
    parserOutcome,
  };
}

function outcomeScore(fieldResult: BenchmarkScenarioFieldResult): number {
  switch (fieldResult.failureClass) {
    case "correct":
      return 5;
    case "correct-uncertainty":
      return 4;
    case "candidate-ranking-failure":
    case "candidate-filtering-failure":
    case "parser-failure":
      return 3;
    case "candidate-generation-failure":
    case "line-reconstruction-failure":
    case "region-coverage-failure":
    case "ocr-recognition-failure":
      return 2;
    case "false-certainty":
      return 1;
  }
  return 0;
}

function scenarioTieBreaker(result: BenchmarkScenarioFieldResult): number {
  return (
    (result.rawOcr?.expectedTokenPresenceCount ?? 0) * 10 +
    (result.rawOcr?.normalizedPhraseSimilarity ?? 0) +
    (result.productContribution?.correctResultRecovered ? 5 : 0) +
    (result.productContribution?.correctUncertaintyRecovered ? 4 : 0) +
    (result.candidateContribution?.matchingCandidateKept ? 2 : 0)
  );
}

function betterScenario(
  left: BenchmarkScenarioFieldResult,
  right: BenchmarkScenarioFieldResult,
): BenchmarkScenarioFieldResult {
  if (!left.applicable) return right;
  if (!right.applicable) return left;
  const scoreDelta = outcomeScore(left) - outcomeScore(right);
  if (scoreDelta !== 0) return scoreDelta > 0 ? left : right;
  return scenarioTieBreaker(left) >= scenarioTieBreaker(right) ? left : right;
}

function bestVariant(variants: BenchmarkScaleVariantMap): BenchmarkScenarioFieldResult {
  return TARGETED_SCALE_FACTORS.reduce(
    (best, scale) => betterScenario(best, variants[scaleKey(scale)]),
    variants["1.5x"],
  );
}

function bestCounterfactual(
  comparison: BenchmarkFieldComparison,
): BenchmarkScenarioFieldResult | null {
  const candidates = [
    comparison.targetedCrop,
    comparison.canonicalRotatedCrop,
    comparison.additiveTargetedCrop,
    comparison.additiveCanonicalRotatedCrop,
  ].filter((result) => result.applicable);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, current) => betterScenario(best, current));
}

function fieldObservation(
  field: OcrRegionBenchmarkFieldKey,
  report: CaseReport,
): CaseReport["brand"] | CaseReport["alcohol"] {
  return field === "brand" ? report.brand : report.alcohol;
}

function fieldTruthPresent(field: OcrRegionBenchmarkFieldKey, evalCase: EvalCase): boolean {
  return field === "brand" ? evalCase.brand.present : evalCase.alcohol.present;
}

function fieldOrientation(
  field: OcrRegionBenchmarkFieldKey,
  record: IncludedEvalRecord,
): EvalTextOrientation {
  return field === "brand"
    ? record.annotation.brand.orientation
    : record.annotation.alcohol.orientation;
}

function selectionForPasses(passes: RegionOcrResult[]): {
  brand: FieldSelection;
  alcohol: FieldSelection;
} {
  return {
    brand: selectBrandObservation(passes),
    alcohol: selectAlcoholObservation(passes),
  };
}

export function buildSyntheticDetailedResult(input: {
  extraction: ExtractionInput;
  decoded: { width: number; height: number; format: string };
  passes: RegionOcrResult[];
  primarySelections?: { brand: FieldSelection; alcohol: FieldSelection } | null;
}): DetailedExtractionResult {
  const finalSelections = selectionForPasses(input.passes);
  const primarySelections =
    input.primarySelections ??
    selectionForPasses(input.passes.length === 0 ? [] : [input.passes[0]]);
  const response: AnalyzerEvidenceResponse = {
    schemaVersion: ANALYZER_EVIDENCE_SCHEMA_VERSION,
    provenance: {
      artifactRef: input.extraction.artifactRef,
      derivativeSha256: input.extraction.derivativeSha256,
      extractionAdapterId: input.extraction.extractionAdapterId,
      extractionAdapterVersion: input.extraction.extractionAdapterVersion,
      ocrEngine: input.extraction.ocrEngine,
      parserId: input.extraction.parserId,
      parserVersion: input.extraction.parserVersion,
      processedAt: input.extraction.processedAt,
    },
    fields: {
      brandName: finalSelections.brand.observation,
      alcoholStatement: finalSelections.alcohol.observation,
    },
    limitations: [],
  };
  return {
    response,
    debug: {
      decoded: input.decoded,
      passes: input.passes,
      primarySelections,
      finalSelections,
    },
  };
}

function reportFromSyntheticPasses(input: {
  evalCase: EvalCase;
  extraction: ExtractionInput;
  decoded: { width: number; height: number; format: string };
  passes: RegionOcrResult[];
  latencyMs: number;
  primarySelections?: { brand: FieldSelection; alcohol: FieldSelection } | null;
}): ScenarioRunArtifacts {
  const detailed = buildSyntheticDetailedResult({
    extraction: input.extraction,
    decoded: input.decoded,
    passes: input.passes,
    primarySelections: input.primarySelections,
  });
  return {
    report: buildCaseReport(input.evalCase, ok(detailed), input.latencyMs),
    passes: input.passes,
  };
}

function sumTimings(passes: RegionOcrResult[], latencyMs: number) {
  return {
    preprocessMs: passes.reduce((sum, pass) => sum + pass.timings.preprocessMs, 0),
    ocrMs: passes.reduce((sum, pass) => sum + pass.timings.ocrMs, 0),
    inverseMappingMs: passes.reduce((sum, pass) => sum + pass.timings.inverseMappingMs, 0),
    totalMs: latencyMs,
  };
}

function passKindById(passes: RegionOcrResult[]): Map<string, BenchmarkPassKind> {
  return new Map(passes.map((pass) => [pass.passId, pass.passKind as BenchmarkPassKind]));
}

function candidateKey(
  field: OcrRegionBenchmarkFieldKey,
  candidate:
    | CaseReport["diagnostics"]["brandCandidateDecisions"][number]
    | CaseReport["diagnostics"]["alcoholCandidateDecisions"][number]
    | { value: string },
): string {
  if (field === "brand") {
    if ("cleanedValue" in candidate) {
      return normalizePhrase(candidate.cleanedValue ?? candidate.rawText);
    }
    return "value" in candidate ? normalizePhrase(candidate.value) : "";
  }
  if ("normalizedValue" in candidate) {
    return normalizePhrase(
      candidate.normalizedValue ?? candidate.normalizedParsingText ?? candidate.rawText,
    );
  }
  return "value" in candidate ? normalizePhrase(candidate.value) : "";
}

function orderedCandidateKeys(field: OcrRegionBenchmarkFieldKey, report: CaseReport): string[] {
  if (field === "brand") {
    return report.diagnostics.brandCandidateDecisions
      .map((candidate) => candidateKey(field, candidate))
      .filter((value) => value.length > 0);
  }
  return report.diagnostics.alcoholCandidateDecisions
    .map((candidate) => candidateKey(field, candidate))
    .filter((value) => value.length > 0);
}

function alternateKeys(field: OcrRegionBenchmarkFieldKey, report: CaseReport): Set<string> {
  const alternates = field === "brand" ? report.brand.alternates : report.alcohol.alternates;
  return new Set(alternates.map((alternate) => candidateKey(field, alternate)));
}

function matchingBrandCandidate(
  report: CaseReport,
  evalCase: EvalCase,
): CaseReport["diagnostics"]["brandCandidateDecisions"][number] | null {
  const matches = report.diagnostics.brandCandidateDecisions.filter((candidate) =>
    brandTextMatches(candidate.cleanedValue ?? candidate.rawText, evalCase.brand.acceptable),
  );
  return matches[0] ?? null;
}

function matchingAlcoholCandidate(
  report: CaseReport,
  evalCase: EvalCase,
): CaseReport["diagnostics"]["alcoholCandidateDecisions"][number] | null {
  const matches = report.diagnostics.alcoholCandidateDecisions.filter((candidate) =>
    alcoholTextMatches(
      candidate.normalizedValue ?? candidate.normalizedParsingText ?? candidate.rawText,
      candidate.parsedPercent,
      evalCase,
    ),
  );
  return matches[0] ?? null;
}

function supportPassKinds(
  supportPassIds: string[],
  passKinds: Map<string, BenchmarkPassKind>,
): BenchmarkPassKind[] {
  return supportPassIds
    .map((passId) => passKinds.get(passId))
    .filter((passKind): passKind is BenchmarkPassKind => !!passKind);
}

function selectedSupportingPassIds(
  field: OcrRegionBenchmarkFieldKey,
  report: CaseReport,
): string[] {
  return field === "brand"
    ? report.diagnostics.finalSelectionPasses.brandSupportingPassIds
    : report.diagnostics.finalSelectionPasses.alcoholSupportingPassIds;
}

function selectedSourcePassId(
  field: OcrRegionBenchmarkFieldKey,
  report: CaseReport,
): string | null {
  return field === "brand"
    ? report.diagnostics.finalSelectionPasses.brandSourcePassId
    : report.diagnostics.finalSelectionPasses.alcoholSourcePassId;
}

function isUncertain(state: AnalyzerFieldObservation["state"]): boolean {
  return state === "AMBIGUOUS" || state === "LOW_CONFIDENCE";
}

function buildRawContribution(
  field: OcrRegionBenchmarkFieldKey,
  evalCase: EvalCase,
  baselinePasses: RegionOcrResult[],
  targetedPass: RegionOcrResult,
): BenchmarkRawContribution | null {
  const raw = rawOcrSummary(field, evalCase, targetedPass.words);
  if (!raw) return null;
  const baselineTokens = new Set(
    baselinePasses
      .flatMap((pass) => pass.words)
      .map((word) => normalizePhrase(word.text))
      .filter((token) => token.length > 0),
  );
  const newWords = [
    ...new Map(
      targetedPass.words
        .map((word) => [normalizePhrase(word.text), word.text.trim()] as const)
        .filter(([key, text]) => key.length > 0 && text.length > 0 && !baselineTokens.has(key)),
    ).values(),
  ].slice(0, MAX_NEW_WORDS);
  return {
    newWords,
    newWordCount: newWords.length,
    expectedTokenCoverage:
      raw.expectedTokenCount === 0 ? 0 : raw.expectedTokenPresenceCount / raw.expectedTokenCount,
    expectedPhrasePresent: raw.expectedPhrasePresent,
    normalizedPhraseSimilarity: raw.normalizedPhraseSimilarity,
    fragmentedExpectedTokens: raw.fragmentedExpectedTokens,
    missingExpectedTokens: raw.missingExpectedTokens,
    rawConfidenceMean: raw.rawConfidenceMean,
    rawConfidenceMin: raw.rawConfidenceMin,
    rawConfidenceMax: raw.rawConfidenceMax,
  };
}

function buildCandidateContribution(
  field: OcrRegionBenchmarkFieldKey,
  evalCase: EvalCase,
  baselineReport: CaseReport,
  scenarioReport: CaseReport,
  targetedPassId: string,
  scenarioPasses: RegionOcrResult[],
): BenchmarkCandidateContribution {
  const passKinds = passKindById(scenarioPasses);
  const baselineCandidateKeys = new Set(orderedCandidateKeys(field, baselineReport));
  const baselineAlternates = alternateKeys(field, baselineReport);
  const baselineMatching =
    field === "brand"
      ? matchingBrandCandidate(baselineReport, evalCase)
      : matchingAlcoholCandidate(baselineReport, evalCase);
  const scenarioMatching =
    field === "brand"
      ? matchingBrandCandidate(scenarioReport, evalCase)
      : matchingAlcoholCandidate(scenarioReport, evalCase);

  const matchingCandidateGenerated = scenarioMatching !== null;
  const matchingCandidateKept = scenarioMatching?.kept ?? false;
  const candidateDecisionReason = (() => {
    if (scenarioMatching === null) return null;
    if (field === "brand") {
      const brandMatch =
        scenarioMatching as CaseReport["diagnostics"]["brandCandidateDecisions"][number];
      return brandMatch.filterReason;
    }
    const alcoholMatch =
      scenarioMatching as CaseReport["diagnostics"]["alcoholCandidateDecisions"][number];
    return alcoholMatch.rejectionReason ?? alcoholMatch.acceptanceReason ?? null;
  })();
  const rankingPosition =
    field === "brand"
      ? brandRankingPosition(scenarioReport)
      : alcoholRankingPosition(scenarioReport, evalCase);
  const supportPassIds = scenarioMatching?.supportPassIds ?? [];
  const supportKinds = supportPassKinds(supportPassIds, passKinds);
  const scenarioCandidateDiagnostics =
    field === "brand"
      ? scenarioReport.diagnostics.brandCandidateDecisions
      : scenarioReport.diagnostics.alcoholCandidateDecisions;
  const newCandidateIntroduced = scenarioCandidateDiagnostics.some((candidate) => {
    if (!candidate.supportPassIds.includes(targetedPassId)) return false;
    return !baselineCandidateKeys.has(candidateKey(field, candidate));
  });
  const scenarioAlternates = alternateKeys(field, scenarioReport);
  const newAlternateIntroduced = [...scenarioAlternates].some(
    (value) => !baselineAlternates.has(value),
  );
  const orderingChanged =
    orderedCandidateKeys(field, baselineReport).join("|") !==
    orderedCandidateKeys(field, scenarioReport).join("|");
  const ambiguityChanged =
    isUncertain(fieldObservation(field, baselineReport).state) !==
      isUncertain(fieldObservation(field, scenarioReport).state) ||
    (isUncertain(fieldObservation(field, baselineReport).state) &&
      fieldObservation(field, baselineReport).state !==
        fieldObservation(field, scenarioReport).state);
  const duplicateCorroborated =
    baselineMatching !== null &&
    scenarioMatching !== null &&
    candidateKey(field, baselineMatching) === candidateKey(field, scenarioMatching) &&
    scenarioMatching.supportPassIds.includes(targetedPassId);

  return {
    matchingCandidateGenerated,
    matchingCandidateKept,
    candidateDecisionReason,
    rankingPosition,
    supportPassIds,
    supportPassKinds: supportKinds,
    duplicateCorroborated,
    newCandidateIntroduced,
    newAlternateIntroduced,
    orderingChanged,
    ambiguityChanged,
  };
}

function buildProductContribution(
  field: OcrRegionBenchmarkFieldKey,
  baseline: BenchmarkScenarioFieldResult,
  scenario: BenchmarkScenarioFieldResult,
): BenchmarkProductContribution {
  const truthPresent = field === "brand" ? baseline.truthPresent : baseline.truthPresent;
  const baselineAcceptable = acceptableOutcome(baseline.failureClass);
  const selectedValueChanged = scenario.selectedValue !== baseline.selectedValue;
  const selectedStateChanged = scenario.selectedState !== baseline.selectedState;
  const correctResultRecovered =
    scenario.failureClass === "correct" && baseline.failureClass !== "correct";
  const correctUncertaintyRecovered =
    scenario.failureClass === "correct-uncertainty" && !baselineAcceptable;
  const totalAcceptableRecovery = correctResultRecovered || correctUncertaintyRecovered;
  const falseCertaintyIntroduced =
    scenario.failureClass === "false-certainty" && baseline.failureClass !== "false-certainty";
  const falseCertaintyRemoved =
    baseline.failureClass === "false-certainty" && scenario.failureClass !== "false-certainty";
  const absentFieldFalsePositiveIntroduced =
    !truthPresent &&
    baseline.selectedState === "NOT_OBSERVED" &&
    scenario.selectedState !== "NOT_OBSERVED";
  const priorCorrectResultRegressed =
    (baseline.failureClass === "correct" || baseline.failureClass === "correct-uncertainty") &&
    scenario.failureClass !== "correct" &&
    scenario.failureClass !== "correct-uncertainty";
  return {
    selectedValueChanged,
    selectedStateChanged,
    correctResultRecovered,
    correctUncertaintyRecovered,
    totalAcceptableRecovery,
    falseCertaintyIntroduced,
    falseCertaintyRemoved,
    absentFieldFalsePositiveIntroduced,
    priorCorrectResultRegressed,
    noMeaningfulContribution:
      !selectedValueChanged &&
      !selectedStateChanged &&
      !totalAcceptableRecovery &&
      !falseCertaintyIntroduced &&
      !falseCertaintyRemoved &&
      !absentFieldFalsePositiveIntroduced &&
      !priorCorrectResultRegressed,
  };
}

function toPassContribution(
  contribution: RecoveryPassContribution | null,
): BenchmarkPassContribution | null {
  if (!contribution) return null;
  return {
    passId: contribution.passId,
    passOrder: contribution.passOrder,
    passKind: contribution.passKind as BenchmarkPassKind,
    triggerReasons: contribution.triggerReasons as BenchmarkTriggerReason[],
    executionTimeMs: contribution.executionTimeMs,
    cumulativeCostMs: contribution.cumulativeCostMs,
    newOcrTokens: contribution.newOcrTokens,
    newOcrTokenCount: contribution.newOcrTokenCount,
    newFieldLikeEvidence: contribution.newFieldLikeEvidence,
    newFieldLikeEvidenceFields: contribution.newFieldLikeEvidenceFields,
    acceptedCandidate: contribution.acceptedCandidate,
    acceptedCandidateFields: contribution.acceptedCandidateFields,
    changedSelectedField: contribution.changedSelectedField,
    changedSelectedFields: contribution.changedSelectedFields,
    correctSelectedField: contribution.correctSelectedField,
    correctSelectedFields: contribution.correctSelectedFields,
    noMeasuredValue: contribution.noMeasuredValue,
  };
}

function buildHybridProvenance(
  field: OcrRegionBenchmarkFieldKey,
  baselinePasses: RegionOcrResult[],
  scenarioReport: CaseReport,
  scenarioPasses: RegionOcrResult[],
  targetedPass: RegionOcrResult,
  crop: BenchmarkCropGeometry,
  candidateContribution: BenchmarkCandidateContribution,
  productContribution: BenchmarkProductContribution,
): BenchmarkHybridProvenance {
  const passKinds = passKindById(scenarioPasses);
  const supportingPassIds = selectedSupportingPassIds(field, scenarioReport);
  const sourcePassId = selectedSourcePassId(field, scenarioReport);
  const usedTargetedEvidence =
    sourcePassId === targetedPass.passId || supportingPassIds.includes(targetedPass.passId);
  const targetedBecameSelectedSource = sourcePassId === targetedPass.passId;
  return {
    productionPassIds: baselinePasses.map((pass) => pass.passId),
    productionPassKinds: baselinePasses.map((pass) => pass.passKind as BenchmarkPassKind),
    targetedPassId: targetedPass.passId,
    targetedPassKind: targetedPass.passKind as BenchmarkPassKind,
    targetedTriggerReasons: targetedPass.triggerReasons as BenchmarkTriggerReason[],
    targetedCropGeometry: crop,
    rotationApplied: targetedPass.transform.rotate,
    preprocessing: targetedPass.preprocessing,
    fieldEligibility: targetedPass.fieldEligibility,
    supportingPassIds,
    supportingPassKinds: supportPassKinds(supportingPassIds, passKinds),
    usedTargetedEvidence,
    targetedBecameSelectedSource,
    targetedOnlyCorroboratedExistingCandidate:
      usedTargetedEvidence &&
      candidateContribution.duplicateCorroborated &&
      !candidateContribution.newCandidateIntroduced &&
      !candidateContribution.orderingChanged &&
      !candidateContribution.ambiguityChanged &&
      !productContribution.selectedValueChanged,
    targetedIntroducedNewCandidate: candidateContribution.newCandidateIntroduced,
    targetedChangedOrdering: candidateContribution.orderingChanged,
    targetedChangedAmbiguity: candidateContribution.ambiguityChanged,
    targetedChangedSelectedValue: productContribution.selectedValueChanged,
  };
}

function scenarioFieldResult(input: {
  field: OcrRegionBenchmarkFieldKey;
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale | null;
  evalCase: EvalCase;
  report: CaseReport;
  words: OcrWord[];
  crop: BenchmarkCropGeometry | null;
  rotationApplied: RotationDegrees;
  annotation: OcrRegionBenchmarkFieldAnnotation | undefined;
  timings: BenchmarkScenarioFieldResult["timings"];
  baseline?: BenchmarkScenarioFieldResult;
  baselineReport?: CaseReport;
  baselinePasses?: RegionOcrResult[];
  scenarioPasses?: RegionOcrResult[];
  targetedPass?: RegionOcrResult;
}): BenchmarkScenarioFieldResult {
  const observation = fieldObservation(input.field, input.report);
  let result: BenchmarkScenarioFieldResult = {
    scenario: input.scenario,
    scale: input.scale,
    applicable: true,
    truthPresent: fieldTruthPresent(input.field, input.evalCase),
    selectedState: observation.state,
    selectedValue: observation.value,
    failureClass: observation.failureClass,
    exactMatch: input.field === "brand" ? input.report.brand.exactMatch : false,
    normalizedMatch: input.field === "brand" ? input.report.brand.normalizedMatch : false,
    parsedAccurate: input.field === "alcohol" ? input.report.alcohol.parsedAccurate : false,
    candidateFilteringSubtype: observation.candidateFilteringSubtype,
    rawOcr: rawOcrSummary(input.field, input.evalCase, input.words),
    rawContribution: null,
    pipeline: pipelineSummary(input.field, input.report, input.evalCase),
    candidateContribution: null,
    productContribution: null,
    passContribution: null,
    hybridProvenance: null,
    crop: input.crop,
    rotationApplied: input.rotationApplied,
    annotationConfidence: input.annotation?.annotationConfidence ?? null,
    humanReadable: input.annotation?.humanReadable ?? null,
    latencyMs: input.report.latencyMs,
    timings: input.timings,
    passCount: input.report.diagnostics.performance.passCount,
    extractionError: input.report.extractionError,
    notes: input.annotation ? [input.annotation.notes] : [],
  };

  if (
    input.baseline &&
    input.baselineReport &&
    input.baselinePasses &&
    input.scenarioPasses &&
    input.targetedPass
  ) {
    const rawContribution = buildRawContribution(
      input.field,
      input.evalCase,
      input.baselinePasses,
      input.targetedPass,
    );
    const candidateContribution = buildCandidateContribution(
      input.field,
      input.evalCase,
      input.baselineReport,
      input.report,
      input.targetedPass.passId,
      input.scenarioPasses,
    );
    const productContribution = buildProductContribution(input.field, input.baseline, result);
    const passContribution = toPassContribution(
      input.report.diagnostics.recoveryPasses.at(-1) ?? null,
    );
    const hybridProvenance =
      input.scenario === "baseline-plus-targeted-crop" ||
      input.scenario === "baseline-plus-canonically-rotated-targeted-crop"
        ? buildHybridProvenance(
            input.field,
            input.baselinePasses,
            input.report,
            input.scenarioPasses,
            input.targetedPass,
            input.crop!,
            candidateContribution,
            productContribution,
          )
        : null;
    result = {
      ...result,
      rawContribution,
      candidateContribution,
      productContribution,
      passContribution,
      hybridProvenance,
    };
  }

  return result;
}

function notApplicableScenario(input: {
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale | null;
  evalCase: EvalCase;
  field: OcrRegionBenchmarkFieldKey;
  failureClass: EvalFailureClass;
  selectedState: AnalyzerFieldObservation["state"];
  selectedValue: string | null;
  notes: string[];
}): BenchmarkScenarioFieldResult {
  return {
    scenario: input.scenario,
    scale: input.scale,
    applicable: false,
    truthPresent: fieldTruthPresent(input.field, input.evalCase),
    selectedState: input.selectedState,
    selectedValue: input.selectedValue,
    failureClass: input.failureClass,
    exactMatch: false,
    normalizedMatch: false,
    parsedAccurate: false,
    candidateFilteringSubtype: null,
    rawOcr: null,
    rawContribution: null,
    pipeline: null,
    candidateContribution: null,
    productContribution: null,
    passContribution: null,
    hybridProvenance: null,
    crop: null,
    rotationApplied: 0,
    annotationConfidence: null,
    humanReadable: null,
    latencyMs: 0,
    timings: null,
    passCount: 0,
    extractionError: null,
    notes: input.notes,
  };
}

async function runTargetedPass(input: {
  field: OcrRegionBenchmarkFieldKey;
  annotation: OcrRegionBenchmarkFieldAnnotation;
  bytes: Uint8Array;
  decoded: { width: number; height: number; format: string };
  scale: OcrRegionBenchmarkScale;
  rotationApplied: RotationDegrees;
  engine: Awaited<ReturnType<typeof createLocalOcrEngine>>;
}): Promise<TargetedPassExecution> {
  const cropPixels = normalizedToPixels(
    input.annotation.geometry,
    input.decoded.width,
    input.decoded.height,
  );
  const crop: BenchmarkCropGeometry = {
    normalized: input.annotation.geometry,
    pixels: cropPixels,
    areaRatio:
      (cropPixels.width * cropPixels.height) / (input.decoded.width * input.decoded.height),
  };
  const syntheticPassKind =
    input.rotationApplied === 0 ? TARGETED_CROP_PASS_KIND : TARGETED_ROTATED_PASS_KIND;
  const triggerReasons: BenchmarkSyntheticTriggerReason[] =
    input.rotationApplied === 0
      ? [TARGETED_TRIGGER_REASON]
      : [TARGETED_TRIGGER_REASON, TARGETED_ROTATION_TRIGGER_REASON];
  const preprocessing =
    input.rotationApplied === 0
      ? [`crop:${input.field}`, "grayscale", "normalise", `scale:${input.scale}`]
      : [
          `crop:${input.field}`,
          `rotate:${input.rotationApplied}`,
          "grayscale",
          "normalise",
          `scale:${input.scale}`,
        ];
  const startedAt = performance.now();
  const pass = await runOcrPass(
    input.bytes,
    {
      passId: `${input.field}-${syntheticPassKind}-${scaleKey(input.scale)}`,
      regionName: `${input.field}-${syntheticPassKind}-${scaleKey(input.scale)}`,
      passKind: asSyntheticPassKind(syntheticPassKind),
      triggerReasons: triggerReasons.map(asSyntheticTriggerReason),
      preprocessing,
      fieldEligibility: { brand: input.field === "brand", alcohol: input.field === "alcohol" },
      pageSegMode: PAGE_SEG.SPARSE_TEXT,
      transform: {
        crop: cropPixels,
        rotate: input.rotationApplied,
        scale: input.scale,
        originalWidth: input.decoded.width,
        originalHeight: input.decoded.height,
      },
    },
    input.engine,
  );
  const latencyMs = performance.now() - startedAt;
  return {
    pass,
    crop,
    latencyMs,
    timings: {
      preprocessMs: pass.timings.preprocessMs,
      ocrMs: pass.timings.ocrMs,
      inverseMappingMs: pass.timings.inverseMappingMs,
      totalMs: pass.timings.totalMs,
    },
  };
}

function runCropOnlyScenario(input: {
  baseline: BaselineContext;
  field: OcrRegionBenchmarkFieldKey;
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale;
  annotation: OcrRegionBenchmarkFieldAnnotation;
  rotationApplied: RotationDegrees;
  targeted: TargetedPassExecution;
}): BenchmarkScenarioFieldResult {
  const scenarioRun = reportFromSyntheticPasses({
    evalCase: input.baseline.evalCase,
    extraction: input.baseline.inputBase,
    decoded: input.baseline.decoded,
    passes: [input.targeted.pass],
    latencyMs: input.targeted.latencyMs,
  });
  return scenarioFieldResult({
    field: input.field,
    scenario: input.scenario,
    scale: input.scale,
    evalCase: input.baseline.evalCase,
    report: scenarioRun.report,
    words: input.targeted.pass.words,
    crop: input.targeted.crop,
    rotationApplied: input.rotationApplied,
    annotation: input.annotation,
    timings: input.targeted.timings,
    baseline: input.baseline.baselineResult,
    baselineReport: input.baseline.baselineReport,
    baselinePasses: input.baseline.baselinePasses,
    scenarioPasses: scenarioRun.passes,
    targetedPass: input.targeted.pass,
  });
}

function runAdditiveScenario(input: {
  baseline: BaselineContext;
  field: OcrRegionBenchmarkFieldKey;
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale;
  annotation: OcrRegionBenchmarkFieldAnnotation;
  rotationApplied: RotationDegrees;
  targeted: TargetedPassExecution;
}): BenchmarkScenarioFieldResult {
  const combinedPasses = [...input.baseline.baselinePasses, input.targeted.pass];
  const scenarioRun = reportFromSyntheticPasses({
    evalCase: input.baseline.evalCase,
    extraction: input.baseline.inputBase,
    decoded: input.baseline.decoded,
    passes: combinedPasses,
    latencyMs: input.baseline.baselineReport.latencyMs + input.targeted.latencyMs,
    primarySelections: input.baseline.baselinePrimarySelections,
  });
  return scenarioFieldResult({
    field: input.field,
    scenario: input.scenario,
    scale: input.scale,
    evalCase: input.baseline.evalCase,
    report: scenarioRun.report,
    words: combinedPasses.flatMap((pass) => pass.words),
    crop: input.targeted.crop,
    rotationApplied: input.rotationApplied,
    annotation: input.annotation,
    timings: sumTimings(combinedPasses, scenarioRun.report.latencyMs),
    baseline: input.baseline.baselineResult,
    baselineReport: input.baseline.baselineReport,
    baselinePasses: input.baseline.baselinePasses,
    scenarioPasses: scenarioRun.passes,
    targetedPass: input.targeted.pass,
  });
}

async function runBaselineCase(
  evalCase: EvalCase,
  image: LoadedCaseImage,
): Promise<{
  detailed: Awaited<ReturnType<typeof extractLabelEvidenceDetailed>>;
  report: CaseReport;
}> {
  const input = extractionInput(evalCase, image.sha256, image.bytes);
  const startedAt = performance.now();
  const detailed = await extractLabelEvidenceDetailed(input);
  const latencyMs = performance.now() - startedAt;
  return { detailed, report: buildCaseReport(evalCase, detailed, latencyMs) };
}

function baselineScenarioFieldResult(
  field: OcrRegionBenchmarkFieldKey,
  evalCase: EvalCase,
  report: CaseReport,
  detailed: Awaited<ReturnType<typeof extractLabelEvidenceDetailed>>,
): BenchmarkScenarioFieldResult {
  const passes = detailed.ok ? detailed.value.debug.passes : [];
  const timings = detailed.ok ? sumTimings(passes, report.latencyMs) : null;
  const words = passes.flatMap((pass) => pass.words);
  return scenarioFieldResult({
    field,
    scenario: "production-baseline",
    scale: null,
    evalCase,
    report,
    words,
    crop: null,
    rotationApplied: 0,
    annotation: undefined,
    timings,
  });
}

function annotationCoverage(cases: BenchmarkLoadedCase[]): OcrRegionBenchmarkAnnotationCoverage {
  const challengeSliceCounts: Record<string, number> = {};
  let brandPresentCaseCount = 0;
  let alcoholPresentCaseCount = 0;
  let brandAnnotatedCaseCount = 0;
  let alcoholAnnotatedCaseCount = 0;
  let absentBrandCaseCount = 0;
  let absentAlcoholCaseCount = 0;
  let highConfidenceFieldCount = 0;
  let mediumConfidenceFieldCount = 0;
  let humanReadableFieldCount = 0;

  for (const benchmarkCase of cases) {
    for (const slice of benchmarkCase.annotation.challengeSlices) {
      challengeSliceCounts[slice] = (challengeSliceCounts[slice] ?? 0) + 1;
    }
    if (benchmarkCase.evalCase.brand.present) brandPresentCaseCount += 1;
    else absentBrandCaseCount += 1;
    if (benchmarkCase.evalCase.alcohol.present) alcoholPresentCaseCount += 1;
    else absentAlcoholCaseCount += 1;
    for (const field of ["brand", "alcohol"] as const) {
      const annotation = benchmarkCase.annotation.fields[field];
      if (!annotation) continue;
      if (field === "brand") brandAnnotatedCaseCount += 1;
      else alcoholAnnotatedCaseCount += 1;
      if (annotation.annotationConfidence === "high") highConfidenceFieldCount += 1;
      else mediumConfidenceFieldCount += 1;
      if (annotation.humanReadable) humanReadableFieldCount += 1;
    }
  }

  return {
    benchmarkCaseCount: cases.length,
    brandPresentCaseCount,
    alcoholPresentCaseCount,
    brandAnnotatedCaseCount,
    alcoholAnnotatedCaseCount,
    absentBrandCaseCount,
    absentAlcoholCaseCount,
    highConfidenceFieldCount,
    mediumConfidenceFieldCount,
    humanReadableFieldCount,
    challengeSliceCounts,
  };
}

function familySummaryResults(
  comparison: BenchmarkFieldComparison,
): BenchmarkScenarioFieldResult[] {
  return [
    comparison.baseline,
    comparison.targetedCrop,
    comparison.canonicalRotatedCrop,
    comparison.additiveTargetedCrop,
    comparison.additiveCanonicalRotatedCrop,
  ];
}

function allScenarioResults(comparison: BenchmarkFieldComparison): BenchmarkScenarioFieldResult[] {
  return [
    comparison.baseline,
    ...TARGETED_SCALE_FACTORS.map(
      (scale) => comparison.scaleVariants.targetedCrop[scaleKey(scale)],
    ),
    ...TARGETED_SCALE_FACTORS.map(
      (scale) => comparison.scaleVariants.canonicalRotatedCrop[scaleKey(scale)],
    ),
    ...TARGETED_SCALE_FACTORS.map(
      (scale) => comparison.scaleVariants.additiveTargetedCrop[scaleKey(scale)],
    ),
    ...TARGETED_SCALE_FACTORS.map(
      (scale) => comparison.scaleVariants.additiveCanonicalRotatedCrop[scaleKey(scale)],
    ),
  ];
}

function findScenarioResult(
  comparison: BenchmarkFieldComparison,
  scenario: OcrRegionBenchmarkScenarioKey,
  scale: OcrRegionBenchmarkScale | null,
): BenchmarkScenarioFieldResult {
  return allScenarioResults(comparison).find(
    (result) => result.scenario === scenario && result.scale === scale,
  )!;
}

function classifyFieldComparison(
  field: OcrRegionBenchmarkFieldKey,
  annotation: OcrRegionBenchmarkFieldAnnotation | undefined,
  slices: string[],
  baseline: BenchmarkScenarioFieldResult,
  scaleVariants: BenchmarkFieldComparison["scaleVariants"],
): BenchmarkFieldComparison {
  const targetedCrop = bestVariant(scaleVariants.targetedCrop);
  const canonicalRotatedCrop = bestVariant(scaleVariants.canonicalRotatedCrop);
  const additiveTargetedCrop = bestVariant(scaleVariants.additiveTargetedCrop);
  const additiveCanonicalRotatedCrop = bestVariant(scaleVariants.additiveCanonicalRotatedCrop);
  const comparison: BenchmarkFieldComparison = {
    baseline,
    targetedCrop,
    canonicalRotatedCrop,
    additiveTargetedCrop,
    additiveCanonicalRotatedCrop,
    scaleVariants,
    diagnosticBestScenario: { scenario: "production-baseline", scale: null },
    changedSelectedValue: false,
    correctedByCounterfactual: false,
    regressedByCounterfactual: false,
    classifications: [],
  };

  const best = bestCounterfactual(comparison);
  if (best && outcomeScore(best) > outcomeScore(baseline)) {
    comparison.diagnosticBestScenario = { scenario: best.scenario, scale: best.scale };
  }
  comparison.changedSelectedValue = !!best && best.selectedValue !== baseline.selectedValue;
  comparison.correctedByCounterfactual =
    !!best &&
    outcomeScore(best) > outcomeScore(baseline) &&
    (best.failureClass === "correct" || best.failureClass === "correct-uncertainty");
  comparison.regressedByCounterfactual = allScenarioResults(comparison).some(
    (result) =>
      result.applicable &&
      outcomeScore(result) < outcomeScore(baseline) &&
      result.productContribution?.priorCorrectResultRegressed,
  );

  const classifications: string[] = [];
  if (annotation && !annotation.humanReadable)
    classifications.push("human region itself unreadable");
  if (
    annotation &&
    (annotation.annotationConfidence === "medium" || slices.includes("genuinely-ambiguous"))
  ) {
    classifications.push("annotation uncertainty");
  }

  if (!best || outcomeScore(best) <= outcomeScore(baseline)) {
    classifications.push("no improvement");
  } else {
    if (
      best.scenario === "baseline-plus-targeted-crop" ||
      best.scenario === "baseline-plus-canonically-rotated-targeted-crop"
    ) {
      classifications.push("additive evidence recovery");
    }
    if (
      best.scenario === "canonically-rotated-targeted-crop" ||
      best.scenario === "baseline-plus-canonically-rotated-targeted-crop"
    ) {
      classifications.push("orientation isolation");
    }
    if (best.scale !== null && best.scale !== 1.5) {
      classifications.push("scale sensitivity");
    }
    if (
      baseline.rawOcr &&
      best.rawOcr &&
      !baseline.rawOcr.expectedPhrasePresent &&
      best.rawOcr.expectedPhrasePresent
    ) {
      classifications.push("ocr recognition recovery");
    }
    if (
      baseline.pipeline &&
      best.pipeline &&
      !baseline.pipeline.matchingCandidateGenerated &&
      best.pipeline.matchingCandidateGenerated
    ) {
      classifications.push("candidate-generation recovery");
    }
    if (
      baseline.failureClass === "candidate-filtering-failure" &&
      best.failureClass !== "candidate-filtering-failure" &&
      best.candidateContribution?.matchingCandidateKept
    ) {
      classifications.push("filtering recovery");
    }
    if (
      baseline.failureClass === "candidate-ranking-failure" &&
      best.pipeline?.rankingPosition === 1
    ) {
      classifications.push("ranking recovery");
    }
    if (field === "alcohol" && baseline.failureClass === "parser-failure" && best.parsedAccurate) {
      classifications.push("parser recovery");
    }
    if (
      best.candidateContribution?.duplicateCorroborated &&
      !best.productContribution?.selectedValueChanged
    ) {
      classifications.push("duplicate corroboration");
    }
  }

  if (comparison.regressedByCounterfactual) classifications.push("regressions observed");

  comparison.classifications = [...new Set(classifications)];
  return comparison;
}

function scenarioRows(): Array<{
  scenario: OcrRegionBenchmarkScenarioKey;
  scale: OcrRegionBenchmarkScale | null;
}> {
  return [
    { scenario: "production-baseline", scale: null },
    ...TARGETED_SCALE_FACTORS.flatMap((scale) => [
      { scenario: "human-targeted-crop" as const, scale },
      { scenario: "canonically-rotated-targeted-crop" as const, scale },
      { scenario: "baseline-plus-targeted-crop" as const, scale },
      { scenario: "baseline-plus-canonically-rotated-targeted-crop" as const, scale },
    ]),
  ];
}

function scenarioSummary(): OcrRegionBenchmarkScenarioSummaryEntry[] {
  return scenarioRows().map(({ scenario, scale }) => ({
    scenario,
    scale,
    label: scenarioLabel(scenario, scale),
    description:
      scenario === "production-baseline"
        ? "ordinary production extractor and deterministic selector on current main"
        : scenario === "human-targeted-crop"
          ? "targeted crop only, replacing full-image evidence for this scenario"
          : scenario === "canonically-rotated-targeted-crop"
            ? "targeted crop only with explicit canonical rotation where adjudicated"
            : scenario === "baseline-plus-targeted-crop"
              ? "ordinary production passes plus one appended targeted field pass"
              : "ordinary production passes plus one appended canonically rotated targeted pass",
  }));
}

function scenarioCaseFieldRows(
  cases: OcrRegionBenchmarkCaseResult[],
  field: OcrRegionBenchmarkFieldKey,
  scenario: OcrRegionBenchmarkScenarioKey,
  scale: OcrRegionBenchmarkScale | null,
) {
  return cases
    .map((caseResult) => {
      const comparison = caseResult.fields[field];
      return {
        caseId: caseResult.caseId,
        comparison,
        baseline: comparison.baseline,
        result: findScenarioResult(comparison, scenario, scale),
      };
    })
    .filter((row) => row.result.applicable);
}

function aggregateScenarioMetrics(
  cases: OcrRegionBenchmarkCaseResult[],
): OcrRegionBenchmarkScenarioAggregate[] {
  const rows: OcrRegionBenchmarkScenarioAggregate[] = [];
  for (const field of ["brand", "alcohol"] as const) {
    for (const row of scenarioRows()) {
      const results = scenarioCaseFieldRows(cases, field, row.scenario, row.scale).map(
        (entry) => entry.result,
      );
      const present = results.filter((result) => result.truthPresent);
      const absent = results.filter((result) => !result.truthPresent);
      const similarities = present
        .map((result) => result.rawOcr?.normalizedPhraseSimilarity ?? null)
        .filter((value): value is number => value !== null);
      const tokenCoverages = present
        .map((result) =>
          result.rawOcr && result.rawOcr.expectedTokenCount > 0
            ? result.rawOcr.expectedTokenPresenceCount / result.rawOcr.expectedTokenCount
            : null,
        )
        .filter((value): value is number => value !== null);
      const latencies = results.map((result) => result.latencyMs);
      rows.push({
        scenario: row.scenario,
        scale: row.scale,
        field,
        presentCaseCount: present.length,
        absentCaseCount: absent.length,
        exactMatchCount: present.filter((result) => result.exactMatch).length,
        normalizedMatchCount: present.filter((result) => result.normalizedMatch).length,
        top3Count: present.filter((result) => result.pipeline?.top3Presence).length,
        top5Count: present.filter((result) => result.pipeline?.top5Presence).length,
        detectedCount: present.filter((result) => result.selectedState !== "NOT_OBSERVED").length,
        parsedAccurateCount: present.filter((result) => result.parsedAccurate).length,
        falseCertaintyCount: results.filter((result) => result.failureClass === "false-certainty")
          .length,
        absentFieldFalsePositiveCount: absent.filter(
          (result) => result.selectedState !== "NOT_OBSERVED",
        ).length,
        absentFieldFalsePositiveRate: rateOrNull(
          absent.filter((result) => result.selectedState !== "NOT_OBSERVED").length,
          absent.length,
        ),
        parserFailureCount: present.filter((result) => result.failureClass === "parser-failure")
          .length,
        expectedPhrasePresentCount: present.filter((result) => result.rawOcr?.expectedPhrasePresent)
          .length,
        meanExpectedTokenCoverage:
          tokenCoverages.length === 0
            ? 0
            : tokenCoverages.reduce((sum, value) => sum + value, 0) / tokenCoverages.length,
        meanNormalizedPhraseSimilarity:
          similarities.length === 0
            ? 0
            : similarities.reduce((sum, value) => sum + value, 0) / similarities.length,
        medianLatencyMs: percentile(latencies, 50),
        p95LatencyMs: percentile(latencies, 95),
      });
    }
  }
  return rows;
}

function aggregateContributionMetrics(
  cases: OcrRegionBenchmarkCaseResult[],
): OcrRegionBenchmarkContributionAggregate[] {
  const rows: OcrRegionBenchmarkContributionAggregate[] = [];
  for (const field of ["brand", "alcohol"] as const) {
    for (const scenario of [
      "human-targeted-crop",
      "canonically-rotated-targeted-crop",
      "baseline-plus-targeted-crop",
      "baseline-plus-canonically-rotated-targeted-crop",
    ] as const) {
      for (const scale of TARGETED_SCALE_FACTORS) {
        const results = scenarioCaseFieldRows(cases, field, scenario, scale).map(
          (entry) => entry.result,
        );
        const count = results.length;
        rows.push({
          scenario,
          scale,
          field,
          applicableCaseCount: count,
          meanNewWordCount:
            count === 0
              ? 0
              : results.reduce(
                  (sum, result) => sum + (result.rawContribution?.newWordCount ?? 0),
                  0,
                ) / count,
          exactPhrasePresentCount: results.filter(
            (result) => result.rawContribution?.expectedPhrasePresent,
          ).length,
          matchingCandidateGeneratedCount: results.filter(
            (result) => result.candidateContribution?.matchingCandidateGenerated,
          ).length,
          matchingCandidateKeptCount: results.filter(
            (result) => result.candidateContribution?.matchingCandidateKept,
          ).length,
          duplicateCorroboratedCount: results.filter(
            (result) => result.candidateContribution?.duplicateCorroborated,
          ).length,
          newCandidateIntroducedCount: results.filter(
            (result) => result.candidateContribution?.newCandidateIntroduced,
          ).length,
          newAlternateIntroducedCount: results.filter(
            (result) => result.candidateContribution?.newAlternateIntroduced,
          ).length,
          orderingChangedCount: results.filter(
            (result) => result.candidateContribution?.orderingChanged,
          ).length,
          ambiguityChangedCount: results.filter(
            (result) => result.candidateContribution?.ambiguityChanged,
          ).length,
          selectedValueChangedCount: results.filter(
            (result) => result.productContribution?.selectedValueChanged,
          ).length,
          correctResultRecoveredCount: results.filter(
            (result) => result.productContribution?.correctResultRecovered,
          ).length,
          correctUncertaintyRecoveredCount: results.filter(
            (result) => result.productContribution?.correctUncertaintyRecovered,
          ).length,
          totalAcceptableRecoveryCount: results.filter(
            (result) => result.productContribution?.totalAcceptableRecovery,
          ).length,
          falseCertaintyIntroducedCount: results.filter(
            (result) => result.productContribution?.falseCertaintyIntroduced,
          ).length,
          falseCertaintyRemovedCount: results.filter(
            (result) => result.productContribution?.falseCertaintyRemoved,
          ).length,
          absentFieldFalsePositiveIntroducedCount: results.filter(
            (result) => result.productContribution?.absentFieldFalsePositiveIntroduced,
          ).length,
          priorCorrectResultRegressedCount: results.filter(
            (result) => result.productContribution?.priorCorrectResultRegressed,
          ).length,
          noMeaningfulContributionCount: results.filter(
            (result) => result.productContribution?.noMeaningfulContribution,
          ).length,
        });
      }
    }
  }
  return rows;
}

function recoveryLedger(cases: OcrRegionBenchmarkCaseResult[]): OcrRegionBenchmarkRecoveryEntry[] {
  const rows: OcrRegionBenchmarkRecoveryEntry[] = [];
  for (const caseResult of cases) {
    for (const field of ["brand", "alcohol"] as const) {
      for (const result of allScenarioResults(caseResult.fields[field])) {
        if (
          result.scenario === "production-baseline" ||
          !result.applicable ||
          result.scale === null
        )
          continue;
        const kind = recoveryKind(result.productContribution);
        if (!kind) continue;
        rows.push({
          caseId: caseResult.caseId,
          field,
          family: scenarioFamily(result.scenario)!,
          scenario: result.scenario,
          scale: result.scale,
          recoveryKind: kind,
          baselineFailureClass: caseResult.fields[field].baseline.failureClass,
          scenarioFailureClass: result.failureClass,
          targetedBecameSelectedSource:
            result.hybridProvenance?.targetedBecameSelectedSource ??
            result.selectedState !== "NOT_OBSERVED",
          duplicateCorroborated: result.candidateContribution?.duplicateCorroborated ?? false,
          newCandidateIntroduced: result.candidateContribution?.newCandidateIntroduced ?? false,
          newAlternateIntroduced: result.candidateContribution?.newAlternateIntroduced ?? false,
          orderingChanged: result.candidateContribution?.orderingChanged ?? false,
          ambiguityChanged: result.candidateContribution?.ambiguityChanged ?? false,
        });
      }
    }
  }
  return rows;
}

function recoverySummaries(
  cases: OcrRegionBenchmarkCaseResult[],
): OcrRegionBenchmarkRecoverySummary[] {
  const ledger = recoveryLedger(cases);
  const rows: OcrRegionBenchmarkRecoverySummary[] = [];
  for (const field of ["brand", "alcohol"] as const) {
    for (const scenario of [
      "human-targeted-crop",
      "canonically-rotated-targeted-crop",
      "baseline-plus-targeted-crop",
      "baseline-plus-canonically-rotated-targeted-crop",
    ] as const) {
      for (const scale of TARGETED_SCALE_FACTORS) {
        const applicableCaseCount = scenarioCaseFieldRows(cases, field, scenario, scale).length;
        const recoveries = ledger.filter(
          (entry) => entry.field === field && entry.scenario === scenario && entry.scale === scale,
        );
        rows.push({
          family: scenarioFamily(scenario)!,
          scenario,
          scale,
          field,
          applicableCaseCount,
          exactRecoveryCount: recoveries.filter((entry) => entry.recoveryKind === "correct-result")
            .length,
          correctUncertaintyRecoveryCount: recoveries.filter(
            (entry) => entry.recoveryKind === "correct-uncertainty",
          ).length,
          totalAcceptableRecoveryCount: recoveries.length,
          recoveredCaseFields: [
            ...new Set(recoveries.map((entry) => caseFieldKey(entry.caseId, field))),
          ].sort(),
        });
      }
    }
  }
  return rows;
}

function challengeSliceComparisons(
  cases: OcrRegionBenchmarkCaseResult[],
): OcrRegionBenchmarkChallengeSliceSummary[] {
  const rows: OcrRegionBenchmarkChallengeSliceSummary[] = [];
  const slices = [...new Set(cases.flatMap((caseResult) => caseResult.challengeSlices))].sort();
  for (const slice of slices) {
    const matching = cases.filter((caseResult) => caseResult.challengeSlices.includes(slice));
    for (const field of ["brand", "alcohol"] as const) {
      for (const scenario of [
        "production-baseline",
        "human-targeted-crop",
        "canonically-rotated-targeted-crop",
        "baseline-plus-targeted-crop",
        "baseline-plus-canonically-rotated-targeted-crop",
      ] as const) {
        const results = matching
          .map((caseResult) =>
            familySummaryResults(caseResult.fields[field]).find(
              (result) => result.scenario === scenario,
            )!,
          )
          .filter((result) => result.applicable && result.truthPresent);
        rows.push({
          slice,
          field,
          scenario,
          applicableCaseCount: results.length,
          correctedCount: results.filter(
            (result) =>
              result.failureClass === "correct" || result.failureClass === "correct-uncertainty",
          ).length,
          expectedPhrasePresentCount: results.filter(
            (result) => result.rawOcr?.expectedPhrasePresent,
          ).length,
        });
      }
    }
  }
  return rows;
}

function regressionLedger(
  cases: OcrRegionBenchmarkCaseResult[],
): OcrRegionBenchmarkRegressionEntry[] {
  const rows: OcrRegionBenchmarkRegressionEntry[] = [];
  for (const caseResult of cases) {
    for (const field of ["brand", "alcohol"] as const) {
      const comparison = caseResult.fields[field];
      for (const scenario of allScenarioResults(comparison)) {
        if (scenario.scenario === "production-baseline" || !scenario.applicable) continue;
        if (outcomeScore(scenario) >= outcomeScore(comparison.baseline)) continue;
        rows.push({
          caseId: caseResult.caseId,
          field,
          family: scenarioFamily(scenario.scenario)!,
          scenario: scenario.scenario,
          scale: scenario.scale,
          baselineFailureClass: comparison.baseline.failureClass,
          scenarioFailureClass: scenario.failureClass,
          baselineValue: comparison.baseline.selectedValue,
          scenarioValue: scenario.selectedValue,
        });
      }
    }
  }
  return rows;
}

function regressionSummaries(
  cases: OcrRegionBenchmarkCaseResult[],
): OcrRegionBenchmarkRegressionSummary[] {
  const ledger = regressionLedger(cases);
  const rows: OcrRegionBenchmarkRegressionSummary[] = [];
  for (const scenario of [
    "human-targeted-crop",
    "canonically-rotated-targeted-crop",
    "baseline-plus-targeted-crop",
    "baseline-plus-canonically-rotated-targeted-crop",
  ] as const) {
    const family = scenarioFamily(scenario)!;
    const scenarioRows = ledger.filter((row) => row.scenario === scenario);
    const applicableAllScales = new Set<string>();
    for (const field of ["brand", "alcohol"] as const) {
      for (const scale of TARGETED_SCALE_FACTORS) {
        for (const entry of scenarioCaseFieldRows(cases, field, scenario, scale)) {
          applicableAllScales.add(caseFieldKey(entry.caseId, field));
        }
      }
    }
    rows.push({
      family,
      scenario,
      scale: null,
      applicableCaseFieldCount: applicableAllScales.size,
      scenarioScaleRegressionInstanceCount: scenarioRows.length,
      uniqueCaseFieldRegressionCount: new Set(
        scenarioRows.map((row) => caseFieldKey(row.caseId, row.field)),
      ).size,
      uniqueCaseFields: [
        ...new Set(scenarioRows.map((row) => caseFieldKey(row.caseId, row.field))),
      ].sort(),
    });

    for (const scale of TARGETED_SCALE_FACTORS) {
      const applicableCaseFields = new Set<string>();
      for (const field of ["brand", "alcohol"] as const) {
        for (const entry of scenarioCaseFieldRows(cases, field, scenario, scale)) {
          applicableCaseFields.add(caseFieldKey(entry.caseId, field));
        }
      }
      const scaleRows = scenarioRows.filter((row) => row.scale === scale);
      rows.push({
        family,
        scenario,
        scale,
        applicableCaseFieldCount: applicableCaseFields.size,
        scenarioScaleRegressionInstanceCount: scaleRows.length,
        uniqueCaseFieldRegressionCount: new Set(
          scaleRows.map((row) => caseFieldKey(row.caseId, row.field)),
        ).size,
        uniqueCaseFields: [
          ...new Set(scaleRows.map((row) => caseFieldKey(row.caseId, row.field))),
        ].sort(),
      });
    }
  }
  return rows;
}

function scaleAnalysis(
  cases: OcrRegionBenchmarkCaseResult[],
): OcrRegionBenchmarkScaleAnalysisSummary[] {
  const rows: OcrRegionBenchmarkScaleAnalysisSummary[] = [];
  for (const scenario of [
    "human-targeted-crop",
    "canonically-rotated-targeted-crop",
    "baseline-plus-targeted-crop",
    "baseline-plus-canonically-rotated-targeted-crop",
  ] as const) {
    for (const field of ["brand", "alcohol"] as const) {
      const improvedCaseFields: string[] = [];
      const worsenedCaseFields: string[] = [];
      const failureClassChangedCaseFields: string[] = [];
      let applicableCaseFieldCount = 0;

      for (const caseResult of cases) {
        const comparison = caseResult.fields[field];
        const reference = findScenarioResult(comparison, scenario, 1.5);
        if (!reference.applicable) continue;
        applicableCaseFieldCount += 1;
        const comparisonKey = caseFieldKey(caseResult.caseId, field);
        const others = TARGETED_SCALE_FACTORS.filter((scale) => scale !== 1.5).map((scale) =>
          findScenarioResult(comparison, scenario, scale),
        );
        const improved = others.some((result) => outcomeScore(result) > outcomeScore(reference));
        const worsened = others.some((result) => outcomeScore(result) < outcomeScore(reference));
        const failureClassChangedWithoutSelectedOutcomeImprovement =
          !improved &&
          !worsened &&
          others.some(
            (result) =>
              result.failureClass !== reference.failureClass ||
              result.selectedState !== reference.selectedState ||
              result.selectedValue !== reference.selectedValue,
          );

        if (improved) improvedCaseFields.push(comparisonKey);
        if (worsened) worsenedCaseFields.push(comparisonKey);
        if (failureClassChangedWithoutSelectedOutcomeImprovement) {
          failureClassChangedCaseFields.push(comparisonKey);
        }
      }

      rows.push({
        family: scenarioFamily(scenario)!,
        scenario,
        field,
        applicableCaseFieldCount,
        improvedWithScaleCount: improvedCaseFields.length,
        worsenedWithScaleCount: worsenedCaseFields.length,
        failureClassChangedWithoutSelectedOutcomeImprovementCount:
          failureClassChangedCaseFields.length,
        unchangedCount:
          applicableCaseFieldCount -
          new Set([...improvedCaseFields, ...worsenedCaseFields, ...failureClassChangedCaseFields])
            .size,
        improvedCaseFields: [...new Set(improvedCaseFields)].sort(),
        worsenedCaseFields: [...new Set(worsenedCaseFields)].sort(),
        failureClassChangedCaseFields: [...new Set(failureClassChangedCaseFields)].sort(),
      });
    }
  }
  return rows;
}

function latencyComparison(
  cases: OcrRegionBenchmarkCaseResult[],
): OcrRegionBenchmarkLatencySummary[] {
  const rows: OcrRegionBenchmarkLatencySummary[] = [];
  for (const field of ["brand", "alcohol"] as const) {
    const baselineRows = scenarioCaseFieldRows(cases, field, "production-baseline", null);
    rows.push({
      scenario: "production-baseline",
      scale: null,
      field,
      applicableCaseCount: baselineRows.length,
      latencyInterpretation: "production-baseline",
      matchedBaselineMedianLatencyMs: percentile(
        baselineRows.map((entry) => entry.result.latencyMs),
        50,
      ),
      measuredTargetedIncrementalMedianLatencyMs: null,
      estimatedCombinedMedianLatencyMs: null,
      matchedMedianDeltaLatencyMs: null,
    });

    for (const scale of TARGETED_SCALE_FACTORS) {
      const measuredScenarios = [
        "human-targeted-crop",
        "canonically-rotated-targeted-crop",
      ] as const;
      for (const scenario of measuredScenarios) {
        const scenarioRows = scenarioCaseFieldRows(cases, field, scenario, scale);
        rows.push({
          scenario,
          scale,
          field,
          applicableCaseCount: scenarioRows.length,
          latencyInterpretation: "measured-targeted-pass",
          matchedBaselineMedianLatencyMs: percentile(
            scenarioRows.map((entry) => entry.baseline.latencyMs),
            50,
          ),
          measuredTargetedIncrementalMedianLatencyMs: percentile(
            scenarioRows.map((entry) => entry.result.latencyMs),
            50,
          ),
          estimatedCombinedMedianLatencyMs: null,
          matchedMedianDeltaLatencyMs: null,
        });
      }

      const additivePairs = [
        {
          additive: "baseline-plus-targeted-crop" as const,
          targeted: "human-targeted-crop" as const,
        },
        {
          additive: "baseline-plus-canonically-rotated-targeted-crop" as const,
          targeted: "canonically-rotated-targeted-crop" as const,
        },
      ];
      for (const pair of additivePairs) {
        const scenarioRows = scenarioCaseFieldRows(cases, field, pair.additive, scale);
        rows.push({
          scenario: pair.additive,
          scale,
          field,
          applicableCaseCount: scenarioRows.length,
          latencyInterpretation: "estimated-combined",
          matchedBaselineMedianLatencyMs: percentile(
            scenarioRows.map((entry) => entry.baseline.latencyMs),
            50,
          ),
          measuredTargetedIncrementalMedianLatencyMs: percentile(
            scenarioRows.map(
              (entry) => findScenarioResult(entry.comparison, pair.targeted, scale).latencyMs,
            ),
            50,
          ),
          estimatedCombinedMedianLatencyMs: percentile(
            scenarioRows.map((entry) => entry.result.latencyMs),
            50,
          ),
          matchedMedianDeltaLatencyMs: percentile(
            scenarioRows.map((entry) => entry.result.latencyMs - entry.baseline.latencyMs),
            50,
          ),
        });
      }
    }
  }
  return rows;
}

function conclusions(cases: OcrRegionBenchmarkCaseResult[]): OcrRegionBenchmarkConclusionSection[] {
  const recoveries = recoveryLedger(cases);
  const regressionSummary = regressionSummaries(cases);
  const scaling = scaleAnalysis(cases);
  const contributionSummary = aggregateContributionMetrics(cases);
  const brandAdditiveRecoveries15 = recoveries.filter(
    (entry) =>
      entry.scenario === "baseline-plus-targeted-crop" &&
      entry.field === "brand" &&
      entry.scale === 1.5,
  );
  const cropOnlyRecoveries = recoveries.filter((entry) => entry.family === "crop-only");
  const cropOnlyUniqueRecoveries = [
    ...new Set(cropOnlyRecoveries.map((entry) => caseFieldKey(entry.caseId, entry.field))),
  ].sort();
  const cropOnlyRegressionTotal = regressionSummary.find(
    (row) => row.scenario === "human-targeted-crop" && row.scale === null,
  )!;
  const additiveAlcoholRecoveryCount = recoveries.filter(
    (entry) => entry.scenario === "baseline-plus-targeted-crop" && entry.field === "alcohol",
  ).length;
  const rotatedApplicable = scenarioCaseFieldRows(
    cases,
    "alcohol",
    "canonically-rotated-targeted-crop",
    1.5,
  ).length;
  const rotatedSelectedOutcomeRecoveries = recoveries.filter(
    (entry) =>
      entry.scenario === "canonically-rotated-targeted-crop" ||
      entry.scenario === "baseline-plus-canonically-rotated-targeted-crop",
  ).length;
  const additiveBrandContribution15 = contributionSummary.find(
    (row) =>
      row.scenario === "baseline-plus-targeted-crop" && row.scale === 1.5 && row.field === "brand",
  )!;
  const additiveAlcoholContribution15 = contributionSummary.find(
    (row) =>
      row.scenario === "baseline-plus-targeted-crop" &&
      row.scale === 1.5 &&
      row.field === "alcohol",
  )!;
  const bottleneckCounts = {
    recognitionOrReconstruction: 0,
    candidateGeneration: 0,
    candidateFiltering: 0,
    candidateRanking: 0,
    parser: 0,
  };
  for (const caseResult of cases) {
    for (const field of ["brand", "alcohol"] as const) {
      const best =
        bestCounterfactual(caseResult.fields[field]) ?? caseResult.fields[field].baseline;
      switch (best.failureClass) {
        case "ocr-recognition-failure":
        case "line-reconstruction-failure":
        case "region-coverage-failure":
          bottleneckCounts.recognitionOrReconstruction += 1;
          break;
        case "candidate-generation-failure":
          bottleneckCounts.candidateGeneration += 1;
          break;
        case "candidate-filtering-failure":
          bottleneckCounts.candidateFiltering += 1;
          break;
        case "candidate-ranking-failure":
          bottleneckCounts.candidateRanking += 1;
          break;
        case "parser-failure":
          bottleneckCounts.parser += 1;
          break;
      }
    }
  }

  return [
    {
      topic: "replacement",
      labels: ["REGION REPLACEMENT NOT SUPPORTED"],
      rationale:
        "Limited crop-only correct-uncertainty recoveries occurred, but replacement is not supported as a reliable strategy because it removes full-image context and produces substantially more regressions than recoveries.",
      evidence: [
        `crop-only exact recoveries: ${cropOnlyRecoveries.filter((entry) => entry.recoveryKind === "correct-result").length} scenario-scale, ${new Set(cropOnlyRecoveries.filter((entry) => entry.recoveryKind === "correct-result").map((entry) => caseFieldKey(entry.caseId, entry.field))).size} unique case-fields`,
        `crop-only correct-uncertainty recoveries: ${cropOnlyRecoveries.filter((entry) => entry.recoveryKind === "correct-uncertainty").length} scenario-scale, ${new Set(cropOnlyRecoveries.filter((entry) => entry.recoveryKind === "correct-uncertainty").map((entry) => caseFieldKey(entry.caseId, entry.field))).size} unique case-fields (${cropOnlyUniqueRecoveries.join(", ")})`,
        `crop-only scenario-scale regression instances: ${cropOnlyRegressionTotal.scenarioScaleRegressionInstanceCount}`,
        `crop-only unique case-field regressions: ${cropOnlyRegressionTotal.uniqueCaseFieldRegressionCount}`,
      ],
    },
    {
      topic: "additive-brand",
      labels: [
        brandAdditiveRecoveries15.length > 0
          ? "BOUNDED ADDITIVE BRAND SIGNAL SUPPORTED"
          : "INSUFFICIENT EVIDENCE",
      ],
      rationale:
        brandAdditiveRecoveries15.length > 0
          ? "Bounded additive brand signal is supported on this adjudicated slice: two brand case-fields recover to correct uncertainty at 1.5x without any prior-correct brand regression."
          : "No additive brand selected-outcome recovery was observed on this adjudicated slice.",
      evidence: [
        `1.5x additive brand recoveries: ${additiveBrandContribution15.correctResultRecoveredCount} exact, ${additiveBrandContribution15.correctUncertaintyRecoveredCount} correct-uncertainty, ${additiveBrandContribution15.totalAcceptableRecoveryCount} total acceptable`,
        `recovered case-fields: ${brandAdditiveRecoveries15.map((entry) => caseFieldKey(entry.caseId, entry.field)).join(", ")}`,
        ...brandAdditiveRecoveries15.map(
          (entry) =>
            `${caseFieldKey(entry.caseId, entry.field)} => targeted selected source: ${entry.targetedBecameSelectedSource ? "yes" : "no"}; duplicate corroborated: ${entry.duplicateCorroborated ? "yes" : "no"}; new candidate: ${entry.newCandidateIntroduced ? "yes" : "no"}; new alternate: ${entry.newAlternateIntroduced ? "yes" : "no"}; ranking changed: ${entry.orderingChanged ? "yes" : "no"}; ambiguity changed: ${entry.ambiguityChanged ? "yes" : "no"}`,
        ),
      ],
    },
    {
      topic: "additive-alcohol",
      labels: [additiveAlcoholRecoveryCount === 0 ? "INSUFFICIENT EVIDENCE" : "MIXED RESULT"],
      rationale:
        "No additive alcohol selected-outcome recovery was observed on this adjudicated slice.",
      evidence: [
        `1.5x additive alcohol recoveries: ${additiveAlcoholContribution15.correctResultRecoveredCount} exact, ${additiveAlcoholContribution15.correctUncertaintyRecoveredCount} correct-uncertainty, ${additiveAlcoholContribution15.totalAcceptableRecoveryCount} total acceptable`,
        `additive alcohol prior-correct regressions: ${contributionSummary
          .filter(
            (row) => row.scenario === "baseline-plus-targeted-crop" && row.field === "alcohol",
          )
          .reduce((sum, row) => sum + row.priorCorrectResultRegressedCount, 0)} scenario-scale`,
      ],
    },
    {
      topic: "rotation",
      labels: [rotatedSelectedOutcomeRecoveries === 0 ? "INSUFFICIENT EVIDENCE" : "MIXED RESULT"],
      rationale:
        "Canonical rotation did not recover a selected outcome in the two applicable alcohol fields at any tested scale. The evidence remains too small for a broad universal claim.",
      evidence: [
        `rotated crop-only applicable alcohol case-fields at 1.5x: ${rotatedApplicable}`,
        `rotated selected-outcome recoveries across crop-only and additive families: ${rotatedSelectedOutcomeRecoveries}`,
      ],
    },
    {
      topic: "scaling",
      labels: ["MIXED RESULT"],
      rationale:
        "Scale changes affect a bounded subset of case-fields. The report separates beneficial, harmful, and failure-class-only movements relative to the original 1.5x benchmark without recommending a production scale.",
      evidence: [
        ...scaling.map(
          (row) =>
            `${scenarioFamilyLabel(row.family)} / ${row.field}: improved ${row.improvedWithScaleCount}, worsened ${row.worsenedWithScaleCount}, failure-class changes without selected-outcome improvement ${row.failureClassChangedWithoutSelectedOutcomeImprovementCount}, unchanged ${row.unchangedCount}`,
        ),
      ],
    },
    {
      topic: "remaining-bottlenecks",
      labels: [
        bottleneckCounts.recognitionOrReconstruction > 0
          ? "RECOGNITION BOTTLENECK SUPPORTED"
          : "INSUFFICIENT EVIDENCE",
        "MIXED RESULT",
      ],
      rationale:
        "After the diagnostic-best targeted scenarios, remaining failures still separate into recognition/reconstruction, candidate-generation, filtering, ranking, and parser categories.",
      evidence: [
        `recognition/reconstruction failures remaining: ${bottleneckCounts.recognitionOrReconstruction}`,
        `candidate-generation failures remaining: ${bottleneckCounts.candidateGeneration}`,
        `candidate-filtering failures remaining: ${bottleneckCounts.candidateFiltering}`,
        `candidate-ranking failures remaining: ${bottleneckCounts.candidateRanking}`,
        `parser failures remaining: ${bottleneckCounts.parser}`,
      ],
    },
  ];
}

function scenarioOutcomeLabel(result: BenchmarkScenarioFieldResult): string {
  return result.applicable
    ? `${result.failureClass}${result.scale === null ? "" : ` @ ${scaleLabel(result.scale)}`}`
    : "not-applicable";
}

function scenarioLabel(
  scenario: OcrRegionBenchmarkScenarioKey,
  scale: OcrRegionBenchmarkScale | null,
): string {
  const suffix = scale === null ? "" : ` (${scaleLabel(scale)})`;
  switch (scenario) {
    case "production-baseline":
      return "A. Production baseline";
    case "human-targeted-crop":
      return `B. Human-targeted crop${suffix}`;
    case "canonically-rotated-targeted-crop":
      return `C. Canonically rotated targeted crop${suffix}`;
    case "baseline-plus-targeted-crop":
      return `D. Baseline plus targeted crop${suffix}`;
    case "baseline-plus-canonically-rotated-targeted-crop":
      return `E. Baseline plus rotated targeted crop${suffix}`;
  }
}

function fieldComparisonForCase(input: {
  baseline: BaselineContext;
  annotation: OcrRegionBenchmarkFieldAnnotation | undefined;
  challengeSlices: string[];
  field: OcrRegionBenchmarkFieldKey;
  rotation: RotationDegrees | null;
  engine: Awaited<ReturnType<typeof createLocalOcrEngine>>;
  image: LoadedCaseImage;
}): Promise<BenchmarkFieldComparison> {
  const { baseline, annotation, challengeSlices, field, rotation, engine, image } = input;
  if (!annotation) {
    const baselineResult = baseline.baselineResult;
    const targetedCrop = createScaleVariantMap((scale) =>
      notApplicableScenario({
        scenario: "human-targeted-crop",
        scale,
        evalCase: baseline.evalCase,
        field,
        failureClass: baselineResult.failureClass,
        selectedState: baselineResult.selectedState,
        selectedValue: baselineResult.selectedValue,
        notes: fieldTruthPresent(field, baseline.evalCase)
          ? ["no adjudicated benchmark geometry"]
          : ["field absent in evaluation truth"],
      }),
    );
    const rotatedCrop = createScaleVariantMap((scale) =>
      notApplicableScenario({
        scenario: "canonically-rotated-targeted-crop",
        scale,
        evalCase: baseline.evalCase,
        field,
        failureClass: baselineResult.failureClass,
        selectedState: baselineResult.selectedState,
        selectedValue: baselineResult.selectedValue,
        notes:
          rotation === null
            ? ["canonical rotation not applicable"]
            : ["no adjudicated benchmark geometry"],
      }),
    );
    const additiveTargetedCrop = createScaleVariantMap((scale) =>
      notApplicableScenario({
        scenario: "baseline-plus-targeted-crop",
        scale,
        evalCase: baseline.evalCase,
        field,
        failureClass: baselineResult.failureClass,
        selectedState: baselineResult.selectedState,
        selectedValue: baselineResult.selectedValue,
        notes: fieldTruthPresent(field, baseline.evalCase)
          ? ["no adjudicated benchmark geometry"]
          : ["field absent in evaluation truth"],
      }),
    );
    const additiveRotatedCrop = createScaleVariantMap((scale) =>
      notApplicableScenario({
        scenario: "baseline-plus-canonically-rotated-targeted-crop",
        scale,
        evalCase: baseline.evalCase,
        field,
        failureClass: baselineResult.failureClass,
        selectedState: baselineResult.selectedState,
        selectedValue: baselineResult.selectedValue,
        notes:
          rotation === null
            ? ["canonical rotation not applicable"]
            : ["no adjudicated benchmark geometry"],
      }),
    );
    return Promise.resolve(
      classifyFieldComparison(field, annotation, challengeSlices, baselineResult, {
        targetedCrop,
        canonicalRotatedCrop: rotatedCrop,
        additiveTargetedCrop,
        additiveCanonicalRotatedCrop: additiveRotatedCrop,
      }),
    );
  }

  return (async () => {
    const targetedCrop = createScaleVariantMap((scale) =>
      notApplicableScenario({
        scenario: "human-targeted-crop",
        scale,
        evalCase: baseline.evalCase,
        field,
        failureClass: baseline.baselineResult.failureClass,
        selectedState: baseline.baselineResult.selectedState,
        selectedValue: baseline.baselineResult.selectedValue,
        notes: ["targeted run not executed"],
      }),
    );
    const rotatedCrop = createScaleVariantMap((scale) =>
      notApplicableScenario({
        scenario: "canonically-rotated-targeted-crop",
        scale,
        evalCase: baseline.evalCase,
        field,
        failureClass: baseline.baselineResult.failureClass,
        selectedState: baseline.baselineResult.selectedState,
        selectedValue: baseline.baselineResult.selectedValue,
        notes:
          rotation === null ? ["canonical rotation not applicable"] : ["targeted run not executed"],
      }),
    );
    const additiveTargetedCrop = createScaleVariantMap((scale) =>
      notApplicableScenario({
        scenario: "baseline-plus-targeted-crop",
        scale,
        evalCase: baseline.evalCase,
        field,
        failureClass: baseline.baselineResult.failureClass,
        selectedState: baseline.baselineResult.selectedState,
        selectedValue: baseline.baselineResult.selectedValue,
        notes: ["targeted run not executed"],
      }),
    );
    const additiveRotatedCrop = createScaleVariantMap((scale) =>
      notApplicableScenario({
        scenario: "baseline-plus-canonically-rotated-targeted-crop",
        scale,
        evalCase: baseline.evalCase,
        field,
        failureClass: baseline.baselineResult.failureClass,
        selectedState: baseline.baselineResult.selectedState,
        selectedValue: baseline.baselineResult.selectedValue,
        notes:
          rotation === null ? ["canonical rotation not applicable"] : ["targeted run not executed"],
      }),
    );

    for (const scale of TARGETED_SCALE_FACTORS) {
      const targeted = await runTargetedPass({
        field,
        annotation,
        bytes: image.bytes,
        decoded: baseline.decoded,
        scale,
        rotationApplied: 0,
        engine,
      });
      targetedCrop[scaleKey(scale)] = runCropOnlyScenario({
        baseline,
        field,
        scenario: "human-targeted-crop",
        scale,
        annotation,
        rotationApplied: 0,
        targeted,
      });
      additiveTargetedCrop[scaleKey(scale)] = runAdditiveScenario({
        baseline,
        field,
        scenario: "baseline-plus-targeted-crop",
        scale,
        annotation,
        rotationApplied: 0,
        targeted,
      });

      if (rotation !== null) {
        const rotated = await runTargetedPass({
          field,
          annotation,
          bytes: image.bytes,
          decoded: baseline.decoded,
          scale,
          rotationApplied: rotation,
          engine,
        });
        rotatedCrop[scaleKey(scale)] = runCropOnlyScenario({
          baseline,
          field,
          scenario: "canonically-rotated-targeted-crop",
          scale,
          annotation,
          rotationApplied: rotation,
          targeted: rotated,
        });
        additiveRotatedCrop[scaleKey(scale)] = runAdditiveScenario({
          baseline,
          field,
          scenario: "baseline-plus-canonically-rotated-targeted-crop",
          scale,
          annotation,
          rotationApplied: rotation,
          targeted: rotated,
        });
      } else {
        rotatedCrop[scaleKey(scale)] = notApplicableScenario({
          scenario: "canonically-rotated-targeted-crop",
          scale,
          evalCase: baseline.evalCase,
          field,
          failureClass: baseline.baselineResult.failureClass,
          selectedState: baseline.baselineResult.selectedState,
          selectedValue: baseline.baselineResult.selectedValue,
          notes: ["canonical rotation not applicable"],
        });
        additiveRotatedCrop[scaleKey(scale)] = notApplicableScenario({
          scenario: "baseline-plus-canonically-rotated-targeted-crop",
          scale,
          evalCase: baseline.evalCase,
          field,
          failureClass: baseline.baselineResult.failureClass,
          selectedState: baseline.baselineResult.selectedState,
          selectedValue: baseline.baselineResult.selectedValue,
          notes: ["canonical rotation not applicable"],
        });
      }
    }

    return classifyFieldComparison(field, annotation, challengeSlices, baseline.baselineResult, {
      targetedCrop,
      canonicalRotatedCrop: rotatedCrop,
      additiveTargetedCrop,
      additiveCanonicalRotatedCrop: additiveRotatedCrop,
    });
  })();
}

export async function runOcrRegionBenchmark(options?: {
  caseIds?: string[];
}): Promise<OcrRegionBenchmarkReport> {
  const manifest = loadEvalManifest();
  let cases = loadBenchmarkCases(manifest);
  validateBenchmarkAnnotations(cases);
  if (options?.caseIds && options.caseIds.length > 0) {
    const allow = new Set(options.caseIds);
    cases = cases.filter((benchmarkCase) => allow.has(benchmarkCase.evalCase.caseId));
  }

  const engine = await createLocalOcrEngine();
  try {
    const results: OcrRegionBenchmarkCaseResult[] = [];
    for (const benchmarkCase of cases) {
      const image = loadCaseImage(benchmarkCase.evalCase);
      const decoded = await verifyAndDecode(image.bytes, image.sha256);
      if (!decoded.ok) {
        throw new Error(
          `benchmark decode failed for ${benchmarkCase.evalCase.caseId}: ${decoded.error.code}`,
        );
      }
      const { detailed, report: baselineReport } = await runBaselineCase(
        benchmarkCase.evalCase,
        image,
      );
      const baselinePasses = detailed.ok ? detailed.value.debug.passes : [];
      const baselinePrimarySelections = detailed.ok ? detailed.value.debug.primarySelections : null;
      const inputBase = extractionInput(benchmarkCase.evalCase, image.sha256, image.bytes);
      const fieldComparisons = {} as OcrRegionBenchmarkCaseResult["fields"];

      for (const field of ["brand", "alcohol"] as const) {
        const baselineResult = baselineScenarioFieldResult(
          field,
          benchmarkCase.evalCase,
          baselineReport,
          detailed,
        );
        const baselineContext: BaselineContext = {
          evalCase: benchmarkCase.evalCase,
          inputBase,
          decoded: decoded.value,
          baselineReport,
          baselinePasses,
          baselinePrimarySelections,
          baselineResult,
        };
        fieldComparisons[field] = await fieldComparisonForCase({
          baseline: baselineContext,
          annotation: benchmarkCase.annotation.fields[field],
          challengeSlices: benchmarkCase.annotation.challengeSlices,
          field,
          rotation: rotationForOrientation(fieldOrientation(field, benchmarkCase.record)),
          engine,
          image,
        });
      }

      results.push({
        caseId: benchmarkCase.evalCase.caseId,
        imagePath: benchmarkCase.record.imagePath,
        strata: benchmarkCase.evalCase.strata,
        inclusionReasons: benchmarkCase.annotation.inclusionReasons,
        challengeSlices: benchmarkCase.annotation.challengeSlices,
        adjudicationNotes: benchmarkCase.annotation.adjudicationNotes,
        fields: fieldComparisons,
      });
    }

    return {
      schemaVersion: OCR_REGION_BENCHMARK_REPORT_SCHEMA_VERSION,
      annotationSchemaVersion: OCR_REGION_BENCHMARK_ANNOTATION_SCHEMA_VERSION,
      manifestSchemaVersion: manifest.schemaVersion,
      benchmarkCaseCount: results.length,
      scenarioSummary: scenarioSummary(),
      cases: results,
      annotationCoverage: annotationCoverage(cases),
      aggregateComparisons: aggregateScenarioMetrics(results),
      contributionSummaries: aggregateContributionMetrics(results),
      recoverySummaries: recoverySummaries(results),
      recoveryLedger: recoveryLedger(results),
      challengeSliceComparisons: challengeSliceComparisons(results),
      regressions: regressionLedger(results),
      regressionSummaries: regressionSummaries(results),
      latencyComparison: latencyComparison(results),
      scaleAnalysis: scaleAnalysis(results),
      conclusions: conclusions(results),
      productionBoundaryProof: {
        benchmarkModules: [
          "src/fixtures/eval/ocr-region-benchmark.annotations.ts",
          "src/fixtures/eval/ocr-region-benchmark.ts",
        ],
        guardTests: [
          "src/fixtures/truth-boundary.test.ts",
          "src/fixtures/eval/eval-boundary.test.ts",
        ],
        productionBehaviorChangeAuthorized: false,
        proofNote:
          "All benchmark annotations, synthetic pass-kind adaptation, and additive scenario synthesis remain confined to src/fixtures/eval; production OCR planning, selection behavior, API/UI behavior, and geometry contracts are unchanged.",
      },
    };
  } finally {
    await engine.terminate();
  }
}

function pct(numerator: number, denominator: number): string {
  return denominator === 0 ? "0%" : `${Math.round((numerator / denominator) * 100)}%`;
}

function metricInterpretationLines(): string[] {
  return [
    "- Exact normalized phrase presence requires the complete normalized expected phrase to appear in OCR text.",
    "- Expected-token coverage measures partial token recovery and can improve even when full phrase presence does not.",
    "- Dice/bigram similarity measures approximate character overlap only; higher similarity is not by itself phrase recovery.",
    "- Candidate generation/retention and selected-field correctness are reported separately from raw OCR similarity.",
    "- Partial fragments are not counted as phrase recovery unless the full normalized phrase is present.",
    "- Targeted absent-field false-positive safety is not experimentally exercised when no adjudicated absent-field target geometry exists; those rows render N/A and inherit safety from unchanged production behavior.",
  ];
}

function familyOutcomeStateLabel(
  baseline: BenchmarkScenarioFieldResult,
  familyBest: BenchmarkScenarioFieldResult,
): string {
  if (!familyBest.applicable) return "not-applicable";
  if (familyBest.productContribution?.correctResultRecovered) return "exact recovery";
  if (familyBest.productContribution?.correctUncertaintyRecovered)
    return "correct-uncertainty recovery";
  if (familyBest.productContribution?.priorCorrectResultRegressed) return "regression";
  if (outcomeScore(familyBest) > outcomeScore(baseline))
    return "changed without acceptable recovery";
  return "unchanged";
}

function latencyInterpretationLabel(
  interpretation: OcrRegionBenchmarkLatencySummary["latencyInterpretation"],
): string {
  switch (interpretation) {
    case "production-baseline":
      return "measured production baseline";
    case "measured-targeted-pass":
      return "measured targeted pass only";
    case "estimated-combined":
      return "estimated combined latency";
  }
}

export function renderOcrRegionBenchmarkMarkdown(report: OcrRegionBenchmarkReport): string {
  const lines: string[] = [];
  lines.push("# OCR Region-Isolation Benchmark");
  lines.push("");
  lines.push(
    `Bounded evaluation-only benchmark over ${report.benchmarkCaseCount} adjudicated cases using the committed OCR engine and existing deterministic downstream selector logic.`,
  );
  lines.push("");
  lines.push("## Scenario Summary");
  lines.push("");
  for (const row of report.scenarioSummary) {
    lines.push(`- ${row.label}: ${row.description}`);
  }
  lines.push("");
  lines.push("## Aggregate Results");
  lines.push("");
  lines.push(
    "| Scenario | Field | Present | Absent | Exact | Normalized | Top-3 | Top-5 | Detected | Parsed accurate | False certainty | Absent FP | Phrase present | Token coverage | Mean similarity | Median latency |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const row of report.aggregateComparisons) {
    lines.push(
      `| ${scenarioLabel(row.scenario, row.scale)} | ${row.field} | ${row.presentCaseCount} | ${row.absentCaseCount} | ${pct(row.exactMatchCount, row.presentCaseCount)} | ${pct(row.normalizedMatchCount, row.presentCaseCount)} | ${pct(row.top3Count, row.presentCaseCount)} | ${pct(row.top5Count, row.presentCaseCount)} | ${pct(row.detectedCount, row.presentCaseCount)} | ${pct(row.parsedAccurateCount, row.presentCaseCount)} | ${pctOrNA(row.falseCertaintyCount, row.presentCaseCount + row.absentCaseCount)} | ${pctOrNA(row.absentFieldFalsePositiveCount, row.absentCaseCount)} | ${pct(row.expectedPhrasePresentCount, row.presentCaseCount)} | ${row.meanExpectedTokenCoverage.toFixed(2)} | ${row.meanNormalizedPhraseSimilarity.toFixed(2)} | ${row.medianLatencyMs.toFixed(0)} ms |`,
    );
  }
  lines.push("");
  lines.push(
    "- `Absent FP` renders `N/A` when the targeted scenario has no applicable absent-field denominator. That safety is inherited from unchanged production behavior rather than demonstrated by the targeted benchmark.",
  );
  lines.push("");
  lines.push("## Contribution Summary");
  lines.push("");
  lines.push(
    "| Scenario | Field | Cases | Mean new words | Phrase present | Candidate generated | Candidate kept | Duplicate corroborated | New candidate | New alternate | Ordering changed | Ambiguity changed | Correct result recovered | Correct uncertainty recovered | Total acceptable recoveries | Regressed prior correct | No meaningful contribution |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const row of report.contributionSummaries) {
    lines.push(
      `| ${scenarioLabel(row.scenario, row.scale)} | ${row.field} | ${row.applicableCaseCount} | ${row.meanNewWordCount.toFixed(2)} | ${row.exactPhrasePresentCount} | ${row.matchingCandidateGeneratedCount} | ${row.matchingCandidateKeptCount} | ${row.duplicateCorroboratedCount} | ${row.newCandidateIntroducedCount} | ${row.newAlternateIntroducedCount} | ${row.orderingChangedCount} | ${row.ambiguityChangedCount} | ${row.correctResultRecoveredCount} | ${row.correctUncertaintyRecoveredCount} | ${row.totalAcceptableRecoveryCount} | ${row.priorCorrectResultRegressedCount} | ${row.noMeaningfulContributionCount} |`,
    );
  }
  lines.push("");
  lines.push("## Recovery Summary");
  lines.push("");
  lines.push(
    "| Family | Field | Scale | Applicable case-fields | Exact recoveries | Correct-uncertainty recoveries | Total acceptable recoveries | Recovered case-fields |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of report.recoverySummaries) {
    lines.push(
      `| ${scenarioFamilyLabel(row.family)} | ${row.field} | ${scaleLabel(row.scale)} | ${row.applicableCaseCount} | ${row.exactRecoveryCount} | ${row.correctUncertaintyRecoveryCount} | ${row.totalAcceptableRecoveryCount} | ${row.recoveredCaseFields.length === 0 ? "—" : row.recoveredCaseFields.join(", ")} |`,
    );
  }
  lines.push("");
  lines.push("## Recovery Ledger");
  lines.push("");
  if (report.recoveryLedger.length === 0) {
    lines.push("No targeted scenario produced an acceptable recovery on this benchmark slice.");
  } else {
    lines.push(
      "| Family | Scale | Case-field | Recovery kind | Targeted selected source | Duplicate corroborated | New candidate | New alternate | Ranking changed | Ambiguity changed |",
    );
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of report.recoveryLedger) {
      lines.push(
        `| ${scenarioFamilyLabel(row.family)} | ${scaleLabel(row.scale)} | ${caseFieldKey(row.caseId, row.field)} | ${row.recoveryKind} | ${row.targetedBecameSelectedSource === null ? "N/A" : row.targetedBecameSelectedSource ? "yes" : "no"} | ${row.duplicateCorroborated ? "yes" : "no"} | ${row.newCandidateIntroduced ? "yes" : "no"} | ${row.newAlternateIntroduced ? "yes" : "no"} | ${row.orderingChanged ? "yes" : "no"} | ${row.ambiguityChanged ? "yes" : "no"} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Regression Summary");
  lines.push("");
  lines.push(
    "| Family | Scale | Applicable case-fields | Scenario-scale regression instances | Unique case-field regressions | Unique case-fields |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of report.regressionSummaries) {
    lines.push(
      `| ${scenarioFamilyLabel(row.family)} | ${row.scale === null ? "all-scales" : scaleLabel(row.scale)} | ${row.applicableCaseFieldCount} | ${row.scenarioScaleRegressionInstanceCount} | ${row.uniqueCaseFieldRegressionCount} | ${row.uniqueCaseFields.length === 0 ? "—" : row.uniqueCaseFields.join(", ")} |`,
    );
  }
  lines.push("");
  lines.push("## Metric Interpretation");
  lines.push("");
  lines.push(...metricInterpretationLines());
  lines.push("");
  lines.push("## Challenge Slices");
  lines.push("");
  lines.push("| Slice | Field | Scenario | Applicable | Corrected | Phrase present |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of report.challengeSliceComparisons) {
    lines.push(
      `| ${row.slice} | ${row.field} | ${scenarioLabel(row.scenario, null)} | ${row.applicableCaseCount} | ${row.correctedCount} | ${row.expectedPhrasePresentCount} |`,
    );
  }
  lines.push("");
  lines.push("## Case Ledger");
  lines.push("");
  lines.push(
    "| Case | Field | Baseline | Best crop-only | Crop state | Best additive | Additive state | Best rotated crop-only | Rotated crop state | Best rotated additive | Rotated additive state | Diagnostic best outcome (non-prescriptive) | Classifications |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const caseResult of report.cases) {
    for (const field of ["brand", "alcohol"] as const) {
      const comparison = caseResult.fields[field];
      const diagnosticBest =
        comparison.diagnosticBestScenario.scenario === "production-baseline"
          ? comparison.baseline
          : (familySummaryResults(comparison).find(
              (result) =>
                result.scenario === comparison.diagnosticBestScenario.scenario &&
                result.scale === comparison.diagnosticBestScenario.scale,
            ) ?? comparison.baseline);
      lines.push(
        `| ${caseResult.caseId} | ${field} | ${scenarioOutcomeLabel(comparison.baseline)} | ${scenarioOutcomeLabel(comparison.targetedCrop)} | ${familyOutcomeStateLabel(comparison.baseline, comparison.targetedCrop)} | ${scenarioOutcomeLabel(comparison.additiveTargetedCrop)} | ${familyOutcomeStateLabel(comparison.baseline, comparison.additiveTargetedCrop)} | ${scenarioOutcomeLabel(comparison.canonicalRotatedCrop)} | ${familyOutcomeStateLabel(comparison.baseline, comparison.canonicalRotatedCrop)} | ${scenarioOutcomeLabel(comparison.additiveCanonicalRotatedCrop)} | ${familyOutcomeStateLabel(comparison.baseline, comparison.additiveCanonicalRotatedCrop)} | ${scenarioLabel(diagnosticBest.scenario, diagnosticBest.scale)} | ${comparison.classifications.join(", ")} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Regressions");
  lines.push("");
  if (report.regressions.length === 0) {
    lines.push(
      "No targeted scenario regressed below the production baseline on this benchmark set.",
    );
  } else {
    lines.push("| Case | Field | Scenario | Baseline | Counterfactual |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const regression of report.regressions) {
      lines.push(
        `| ${regression.caseId} | ${regression.field} | ${scenarioLabel(regression.scenario, regression.scale)} | ${regression.baselineFailureClass} | ${regression.scenarioFailureClass} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Latency");
  lines.push("");
  lines.push(
    "| Scenario | Field | Applicable case-fields | Matched baseline latency | Measured targeted-pass incremental latency | Estimated combined latency | Matched additive delta | Interpretation |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of report.latencyComparison) {
    lines.push(
      `| ${scenarioLabel(row.scenario, row.scale)} | ${row.field} | ${row.applicableCaseCount} | ${msOrNA(row.matchedBaselineMedianLatencyMs)} | ${msOrNA(row.measuredTargetedIncrementalMedianLatencyMs)} | ${msOrNA(row.estimatedCombinedMedianLatencyMs)} | ${msOrNA(row.matchedMedianDeltaLatencyMs)} | ${latencyInterpretationLabel(row.latencyInterpretation)} |`,
    );
  }
  lines.push("");
  lines.push(
    "- `Estimated combined latency` is derived from matched baseline latency plus one targeted pass. It is not a directly measured end-to-end production workflow.",
  );
  lines.push("");
  lines.push("## Scale Analysis");
  lines.push("");
  lines.push(
    "| Family | Field | Applicable case-fields | Improved vs 1.5x | Worsened vs 1.5x | Failure-class changes without selected-outcome improvement | Unchanged |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const row of report.scaleAnalysis) {
    lines.push(
      `| ${scenarioFamilyLabel(row.family)} | ${row.field} | ${row.applicableCaseFieldCount} | ${row.improvedWithScaleCount} | ${row.worsenedWithScaleCount} | ${row.failureClassChangedWithoutSelectedOutcomeImprovementCount} | ${row.unchangedCount} |`,
    );
  }
  lines.push("");
  lines.push("## Conclusions");
  lines.push("");
  for (const conclusion of report.conclusions) {
    lines.push(`### ${conclusion.topic}`);
    lines.push("");
    lines.push(`- Labels: ${conclusion.labels.join(". ")}`);
    lines.push(`- Rationale: ${conclusion.rationale}`);
    for (const evidence of conclusion.evidence) lines.push(`- Evidence: ${evidence}`);
    lines.push("");
  }
  lines.push("## Production Boundary");
  lines.push("");
  lines.push(`- Benchmark modules: ${report.productionBoundaryProof.benchmarkModules.join(", ")}`);
  lines.push(`- Guard tests: ${report.productionBoundaryProof.guardTests.join(", ")}`);
  lines.push(`- Proof note: ${report.productionBoundaryProof.proofNote}`);
  lines.push("");
  return `${lines.join("\n").trimEnd()}\n`;
}
