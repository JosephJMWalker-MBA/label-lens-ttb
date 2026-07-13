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
  OcrWord,
  OcrPassKind,
  OcrPassTriggerReason,
  RegionOcrResult,
  RotationDegrees,
} from "@/pipeline/extractor/extractor.types";
import { runOcrPass } from "@/pipeline/extractor/regions";
import { ok } from "@/shared/result";

import { buildCaseReport, EVAL_ADAPTER } from "./eval-harness";
import { loadCaseImage, loadEvalManifest, type LoadedCaseImage } from "./eval-loader";
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
import type { CaseReport } from "./eval-report.types";
import {
  OCR_REGION_BENCHMARK_ANNOTATION_SCHEMA_VERSION,
  OCR_REGION_BENCHMARK_CASE_ANNOTATIONS,
  type OcrRegionBenchmarkCaseAnnotation,
  type OcrRegionBenchmarkFieldAnnotation,
  type OcrRegionBenchmarkFieldKey,
} from "./ocr-region-benchmark.annotations";

export const OCR_REGION_BENCHMARK_REPORT_SCHEMA_VERSION =
  "ocr-region-isolation-benchmark-report.v1" as const;

export const OCR_REGION_BENCHMARK_PROCESSED_AT = "2026-07-13T00:00:00Z";

export type OcrRegionBenchmarkScenarioKey =
  "production-baseline" | "human-targeted-crop" | "canonically-rotated-targeted-crop";

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

export interface BenchmarkPipelineSummary {
  matchingCandidateGenerated: boolean;
  matchingCandidateKept: boolean;
  rankingPosition: number | null;
  top3Presence: boolean;
  top5Presence: boolean;
  ambiguityState: boolean;
  parserOutcome: "not-applicable" | "correct" | "parser-failure" | "incorrect" | "not-observed";
}

export interface BenchmarkScenarioFieldResult {
  scenario: OcrRegionBenchmarkScenarioKey;
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
  pipeline: BenchmarkPipelineSummary | null;
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

export interface BenchmarkFieldComparison {
  baseline: BenchmarkScenarioFieldResult;
  targetedCrop: BenchmarkScenarioFieldResult;
  canonicalRotatedCrop: BenchmarkScenarioFieldResult;
  bestScenario: OcrRegionBenchmarkScenarioKey;
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

export interface OcrRegionBenchmarkScenarioAggregate {
  scenario: OcrRegionBenchmarkScenarioKey;
  field: OcrRegionBenchmarkFieldKey;
  presentCaseCount: number;
  exactMatchCount: number;
  normalizedMatchCount: number;
  top3Count: number;
  top5Count: number;
  detectedCount: number;
  parsedAccurateCount: number;
  parserFailureCount: number;
  expectedPhrasePresentCount: number;
  meanNormalizedPhraseSimilarity: number;
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
  scenario: OcrRegionBenchmarkScenarioKey;
  baselineFailureClass: EvalFailureClass;
  scenarioFailureClass: EvalFailureClass;
  baselineValue: string | null;
  scenarioValue: string | null;
}

export interface OcrRegionBenchmarkLatencySummary {
  scenario: OcrRegionBenchmarkScenarioKey;
  executedFieldCount: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  medianOcrMs: number;
  medianPreprocessMs: number;
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

export interface OcrRegionBenchmarkRecommendation {
  verdict: "REGION BOTTLENECK SUPPORTED" | "RECOGNITION BOTTLENECK SUPPORTED" | "MIXED RESULT";
  rationale: string;
  cropCorrectedFieldCount: number;
  rotationOnlyCorrectedFieldCount: number;
  rawPhraseRecoveryCount: number;
}

export interface OcrRegionBenchmarkReport {
  schemaVersion: typeof OCR_REGION_BENCHMARK_REPORT_SCHEMA_VERSION;
  annotationSchemaVersion: typeof OCR_REGION_BENCHMARK_ANNOTATION_SCHEMA_VERSION;
  manifestSchemaVersion: string;
  benchmarkCaseCount: number;
  cases: OcrRegionBenchmarkCaseResult[];
  annotationCoverage: OcrRegionBenchmarkAnnotationCoverage;
  aggregateComparisons: OcrRegionBenchmarkScenarioAggregate[];
  challengeSliceComparisons: OcrRegionBenchmarkChallengeSliceSummary[];
  regressions: OcrRegionBenchmarkRegressionEntry[];
  latencyComparison: OcrRegionBenchmarkLatencySummary[];
  productionBoundaryProof: OcrRegionBenchmarkBoundaryProof;
  recommendation: OcrRegionBenchmarkRecommendation;
}

interface BenchmarkLoadedCase {
  evalCase: EvalCase;
  record: IncludedEvalRecord;
  annotation: OcrRegionBenchmarkCaseAnnotation;
}

const TARGETED_CROP_PASS_KIND = "benchmark-targeted-crop" as unknown as OcrPassKind;
const TARGETED_ROTATED_PASS_KIND =
  "benchmark-canonical-rotated-targeted-crop" as unknown as OcrPassKind;
const TARGETED_TRIGGER_REASON =
  "benchmark-human-targeted-region" as unknown as OcrPassTriggerReason;
const TARGETED_ROTATION_TRIGGER_REASON =
  "benchmark-canonical-rotation" as unknown as OcrPassTriggerReason;

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

function rawOcrSummary(
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
    top3Presence: report.alcohol.detected && report.alcohol.parsedAccurate,
    top5Presence: report.alcohol.detected && report.alcohol.parsedAccurate,
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
    case "ocr-recognition-failure":
      return 2;
    case "false-certainty":
      return 1;
  }
  return 0;
}

function betterScenario(
  left: BenchmarkScenarioFieldResult,
  right: BenchmarkScenarioFieldResult,
): BenchmarkScenarioFieldResult {
  const scoreDelta = outcomeScore(left) - outcomeScore(right);
  if (scoreDelta !== 0) return scoreDelta > 0 ? left : right;
  const leftSimilarity = left.rawOcr?.normalizedPhraseSimilarity ?? -1;
  const rightSimilarity = right.rawOcr?.normalizedPhraseSimilarity ?? -1;
  return leftSimilarity >= rightSimilarity ? left : right;
}

function bestApplicableCounterfactual(
  targetedCrop: BenchmarkScenarioFieldResult,
  canonicalRotatedCrop: BenchmarkScenarioFieldResult,
): BenchmarkScenarioFieldResult | null {
  if (targetedCrop.applicable && canonicalRotatedCrop.applicable) {
    return betterScenario(targetedCrop, canonicalRotatedCrop);
  }
  if (targetedCrop.applicable) return targetedCrop;
  if (canonicalRotatedCrop.applicable) return canonicalRotatedCrop;
  return null;
}

function classifyFieldComparison(
  field: OcrRegionBenchmarkFieldKey,
  annotation: OcrRegionBenchmarkFieldAnnotation | undefined,
  slices: string[],
  baseline: BenchmarkScenarioFieldResult,
  targetedCrop: BenchmarkScenarioFieldResult,
  canonicalRotatedCrop: BenchmarkScenarioFieldResult,
): BenchmarkFieldComparison {
  const bestCounterfactual = bestApplicableCounterfactual(targetedCrop, canonicalRotatedCrop);
  const best = bestCounterfactual ?? baseline;
  const bestScenario =
    bestCounterfactual && outcomeScore(bestCounterfactual) > outcomeScore(baseline)
      ? bestCounterfactual.scenario
      : "production-baseline";
  const changedSelectedValue =
    bestCounterfactual?.selectedValue !== undefined &&
    bestCounterfactual.selectedValue !== baseline.selectedValue;
  const correctedByCounterfactual =
    !!bestCounterfactual &&
    outcomeScore(bestCounterfactual) > outcomeScore(baseline) &&
    (bestCounterfactual.failureClass === "correct" ||
      bestCounterfactual.failureClass === "correct-uncertainty");
  const regressedByCounterfactual =
    !!bestCounterfactual &&
    (outcomeScore(bestCounterfactual) < outcomeScore(baseline) ||
      ((baseline.failureClass === "correct" || baseline.failureClass === "correct-uncertainty") &&
        bestCounterfactual.failureClass !== baseline.failureClass &&
        bestCounterfactual.failureClass !== "correct" &&
        bestCounterfactual.failureClass !== "correct-uncertainty"));

  const classifications: string[] = [];
  if (annotation && !annotation.humanReadable)
    classifications.push("human region itself unreadable");
  if (
    annotation &&
    (annotation.annotationConfidence === "medium" || slices.includes("genuinely-ambiguous"))
  ) {
    classifications.push("annotation uncertainty");
  }

  if (!bestCounterfactual) {
    classifications.push("no improvement");
  } else if (regressedByCounterfactual) {
    classifications.push("regression");
  } else if (!correctedByCounterfactual) {
    classifications.push("no improvement");
  } else {
    if (
      canonicalRotatedCrop.applicable &&
      betterScenario(canonicalRotatedCrop, targetedCrop).scenario ===
        "canonically-rotated-targeted-crop" &&
      outcomeScore(canonicalRotatedCrop) > outcomeScore(targetedCrop) &&
      outcomeScore(canonicalRotatedCrop) > outcomeScore(baseline)
    ) {
      classifications.push("orientation isolation");
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
      best.pipeline?.matchingCandidateKept
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
      baseline.rawOcr &&
      best.rawOcr &&
      best.rawOcr.expectedPhrasePresent &&
      best.crop &&
      best.crop.areaRatio <= 0.2
    ) {
      classifications.push("full-image scaling loss");
    }
    if (
      baseline.rawOcr &&
      best.rawOcr &&
      baseline.rawOcr.wordCount > best.rawOcr.wordCount * 1.5 &&
      best.rawOcr.expectedPhrasePresent
    ) {
      classifications.push("surrounding-text interference");
    }
    if (
      slices.some((slice) =>
        ["multi-artifact", "side-or-edge-alcohol", "vertical-mandatory-strip"].includes(slice),
      )
    ) {
      classifications.push("wrong-region coverage");
    }
  }

  return {
    baseline,
    targetedCrop,
    canonicalRotatedCrop,
    bestScenario,
    changedSelectedValue,
    correctedByCounterfactual,
    regressedByCounterfactual,
    classifications: [...new Set(classifications)],
  };
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

function scenarioFieldResult(
  field: OcrRegionBenchmarkFieldKey,
  scenario: OcrRegionBenchmarkScenarioKey,
  evalCase: EvalCase,
  report: CaseReport,
  words: OcrWord[],
  crop: BenchmarkCropGeometry | null,
  rotationApplied: RotationDegrees,
  annotation: OcrRegionBenchmarkFieldAnnotation | undefined,
  timings: BenchmarkScenarioFieldResult["timings"],
): BenchmarkScenarioFieldResult {
  const observation = fieldObservation(field, report);
  return {
    scenario,
    applicable: true,
    truthPresent: fieldTruthPresent(field, evalCase),
    selectedState: observation.state,
    selectedValue: observation.value,
    failureClass: observation.failureClass,
    exactMatch: field === "brand" ? report.brand.exactMatch : false,
    normalizedMatch: field === "brand" ? report.brand.normalizedMatch : false,
    parsedAccurate: field === "alcohol" ? report.alcohol.parsedAccurate : false,
    candidateFilteringSubtype: observation.candidateFilteringSubtype,
    rawOcr: rawOcrSummary(field, evalCase, words),
    pipeline: pipelineSummary(field, report, evalCase),
    crop,
    rotationApplied,
    annotationConfidence: annotation?.annotationConfidence ?? null,
    humanReadable: annotation?.humanReadable ?? null,
    latencyMs: report.latencyMs,
    timings,
    passCount: report.diagnostics.performance.passCount,
    extractionError: report.extractionError,
    notes: annotation ? [annotation.notes] : [],
  };
}

function notApplicableScenario(
  scenario: OcrRegionBenchmarkScenarioKey,
  evalCase: EvalCase,
  field: OcrRegionBenchmarkFieldKey,
  failureClass: EvalFailureClass,
  selectedState: AnalyzerFieldObservation["state"],
  selectedValue: string | null,
  notes: string[],
): BenchmarkScenarioFieldResult {
  return {
    scenario,
    applicable: false,
    truthPresent: fieldTruthPresent(field, evalCase),
    selectedState,
    selectedValue,
    failureClass,
    exactMatch: false,
    normalizedMatch: false,
    parsedAccurate: false,
    candidateFilteringSubtype: null,
    rawOcr: null,
    pipeline: null,
    crop: null,
    rotationApplied: 0,
    annotationConfidence: null,
    humanReadable: null,
    latencyMs: 0,
    timings: null,
    passCount: 0,
    extractionError: null,
    notes,
  };
}

function detailedResultForPass(
  evalCase: EvalCase,
  input: ExtractionInput,
  decoded: { width: number; height: number; format: string },
  pass: RegionOcrResult,
): DetailedExtractionResult {
  const brandSelection: FieldSelection = selectBrandObservation([pass]);
  const alcoholSelection: FieldSelection = selectAlcoholObservation([pass]);
  const response: AnalyzerEvidenceResponse = {
    schemaVersion: ANALYZER_EVIDENCE_SCHEMA_VERSION,
    provenance: {
      artifactRef: input.artifactRef,
      derivativeSha256: input.derivativeSha256,
      extractionAdapterId: input.extractionAdapterId,
      extractionAdapterVersion: input.extractionAdapterVersion,
      ocrEngine: input.ocrEngine,
      parserId: input.parserId,
      parserVersion: input.parserVersion,
      processedAt: input.processedAt,
    },
    fields: {
      brandName: brandSelection.observation,
      alcoholStatement: alcoholSelection.observation,
    },
    limitations: [],
  };
  return {
    response,
    debug: {
      decoded,
      passes: [pass],
      primarySelections: { brand: brandSelection, alcohol: alcoholSelection },
      finalSelections: { brand: brandSelection, alcohol: alcoholSelection },
    },
  };
}

async function runCounterfactualScenario(input: {
  evalCase: EvalCase;
  field: OcrRegionBenchmarkFieldKey;
  annotation: OcrRegionBenchmarkFieldAnnotation;
  scenario: OcrRegionBenchmarkScenarioKey;
  bytes: Uint8Array;
  image: LoadedCaseImage;
  rotationApplied: RotationDegrees;
  engine: Awaited<ReturnType<typeof createLocalOcrEngine>>;
}): Promise<BenchmarkScenarioFieldResult> {
  const { evalCase, field, annotation, scenario, bytes, image, rotationApplied, engine } = input;
  const decoded = await verifyAndDecode(bytes, image.sha256);
  if (!decoded.ok) {
    const emptyReport = buildCaseReport(evalCase, decoded, 0);
    return scenarioFieldResult(
      field,
      scenario,
      evalCase,
      emptyReport,
      [],
      null,
      rotationApplied,
      annotation,
      null,
    );
  }

  const cropPixels = normalizedToPixels(
    annotation.geometry,
    decoded.value.width,
    decoded.value.height,
  );
  const crop: BenchmarkCropGeometry = {
    normalized: annotation.geometry,
    pixels: cropPixels,
    areaRatio:
      (cropPixels.width * cropPixels.height) / (decoded.value.width * decoded.value.height),
  };

  const inputBase = extractionInput(evalCase, image.sha256, bytes);
  const passKind =
    scenario === "canonically-rotated-targeted-crop"
      ? TARGETED_ROTATED_PASS_KIND
      : TARGETED_CROP_PASS_KIND;
  const triggerReasons =
    scenario === "canonically-rotated-targeted-crop"
      ? [TARGETED_TRIGGER_REASON, TARGETED_ROTATION_TRIGGER_REASON]
      : [TARGETED_TRIGGER_REASON];
  const preprocessing =
    scenario === "canonically-rotated-targeted-crop"
      ? [`crop:${field}`, `rotate:${rotationApplied}`, "grayscale", "normalise", "scale:1.5"]
      : [`crop:${field}`, "grayscale", "normalise", "scale:1.5"];
  const passStartedAt = performance.now();
  const pass = await runOcrPass(
    bytes,
    {
      passId: `${field}-${scenario}`,
      regionName: `${field}-${scenario}`,
      passKind: passKind,
      triggerReasons: triggerReasons,
      preprocessing,
      fieldEligibility: { brand: field === "brand", alcohol: field === "alcohol" },
      pageSegMode: PAGE_SEG.SPARSE_TEXT,
      transform: {
        crop: cropPixels,
        rotate: rotationApplied,
        scale: 1.5,
        originalWidth: decoded.value.width,
        originalHeight: decoded.value.height,
      },
    },
    engine,
  );
  const latencyMs = performance.now() - passStartedAt;
  const detailed = detailedResultForPass(evalCase, inputBase, decoded.value, pass);
  const report = buildCaseReport(evalCase, ok(detailed), latencyMs);
  return scenarioFieldResult(
    field,
    scenario,
    evalCase,
    report,
    pass.words,
    crop,
    rotationApplied,
    annotation,
    {
      preprocessMs: pass.timings.preprocessMs,
      ocrMs: pass.timings.ocrMs,
      inverseMappingMs: pass.timings.inverseMappingMs,
      totalMs: pass.timings.totalMs,
    },
  );
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
  const timings = detailed.ok
    ? {
        preprocessMs: detailed.value.debug.passes.reduce(
          (sum, pass) => sum + pass.timings.preprocessMs,
          0,
        ),
        ocrMs: detailed.value.debug.passes.reduce((sum, pass) => sum + pass.timings.ocrMs, 0),
        inverseMappingMs: detailed.value.debug.passes.reduce(
          (sum, pass) => sum + pass.timings.inverseMappingMs,
          0,
        ),
        totalMs: report.latencyMs,
      }
    : null;
  const words = detailed.ok ? detailed.value.debug.passes.flatMap((pass) => pass.words) : [];
  return scenarioFieldResult(
    field,
    "production-baseline",
    evalCase,
    report,
    words,
    null,
    0,
    undefined,
    timings,
  );
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

function aggregateScenarioMetrics(
  cases: OcrRegionBenchmarkCaseResult[],
): OcrRegionBenchmarkScenarioAggregate[] {
  const rows: OcrRegionBenchmarkScenarioAggregate[] = [];
  for (const field of ["brand", "alcohol"] as const) {
    for (const scenario of [
      "production-baseline",
      "human-targeted-crop",
      "canonically-rotated-targeted-crop",
    ] as const) {
      const applicable = cases
        .map((caseResult) => caseResult.fields[field][scenarioNameToKey(scenario)])
        .filter((result) => result.applicable && result.truthPresent);
      const exactMatchCount = applicable.filter((result) => result.exactMatch).length;
      const normalizedMatchCount = applicable.filter((result) => result.normalizedMatch).length;
      const top3Count = applicable.filter((result) => result.pipeline?.top3Presence).length;
      const top5Count = applicable.filter((result) => result.pipeline?.top5Presence).length;
      const detectedCount = applicable.filter(
        (result) => result.selectedState !== "NOT_OBSERVED",
      ).length;
      const parsedAccurateCount = applicable.filter((result) => result.parsedAccurate).length;
      const parserFailureCount = applicable.filter(
        (result) => result.failureClass === "parser-failure",
      ).length;
      const expectedPhrasePresentCount = applicable.filter(
        (result) => result.rawOcr?.expectedPhrasePresent,
      ).length;
      const similarityValues = applicable
        .map((result) => result.rawOcr?.normalizedPhraseSimilarity ?? null)
        .filter((value): value is number => value !== null);
      const meanNormalizedPhraseSimilarity =
        similarityValues.length === 0
          ? 0
          : similarityValues.reduce((sum, value) => sum + value, 0) / similarityValues.length;
      rows.push({
        scenario,
        field,
        presentCaseCount: applicable.length,
        exactMatchCount,
        normalizedMatchCount,
        top3Count,
        top5Count,
        detectedCount,
        parsedAccurateCount,
        parserFailureCount,
        expectedPhrasePresentCount,
        meanNormalizedPhraseSimilarity,
      });
    }
  }
  return rows;
}

function scenarioNameToKey(
  scenario: OcrRegionBenchmarkScenarioKey,
): "baseline" | "targetedCrop" | "canonicalRotatedCrop" {
  switch (scenario) {
    case "production-baseline":
      return "baseline";
    case "human-targeted-crop":
      return "targetedCrop";
    case "canonically-rotated-targeted-crop":
      return "canonicalRotatedCrop";
  }
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
      ] as const) {
        const results = matching
          .map((caseResult) => caseResult.fields[field][scenarioNameToKey(scenario)])
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
      for (const scenario of [comparison.targetedCrop, comparison.canonicalRotatedCrop]) {
        if (!scenario.applicable) continue;
        if (outcomeScore(scenario) >= outcomeScore(comparison.baseline)) continue;
        rows.push({
          caseId: caseResult.caseId,
          field,
          scenario: scenario.scenario,
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

function latencyComparison(
  cases: OcrRegionBenchmarkCaseResult[],
): OcrRegionBenchmarkLatencySummary[] {
  const rows: OcrRegionBenchmarkLatencySummary[] = [];
  for (const scenario of [
    "production-baseline",
    "human-targeted-crop",
    "canonically-rotated-targeted-crop",
  ] as const) {
    const results = cases.flatMap((caseResult) =>
      ["brand", "alcohol"].map(
        (field) =>
          caseResult.fields[field as OcrRegionBenchmarkFieldKey][scenarioNameToKey(scenario)],
      ),
    );
    const executed = results.filter((result) => result.applicable);
    const latencies = executed.map((result) => result.latencyMs);
    const ocrMs = executed.map((result) => result.timings?.ocrMs ?? 0);
    const preprocessMs = executed.map((result) => result.timings?.preprocessMs ?? 0);
    rows.push({
      scenario,
      executedFieldCount: executed.length,
      medianLatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      medianOcrMs: percentile(ocrMs, 50),
      medianPreprocessMs: percentile(preprocessMs, 50),
    });
  }
  return rows;
}

function recommendation(cases: OcrRegionBenchmarkCaseResult[]): OcrRegionBenchmarkRecommendation {
  let cropCorrectedFieldCount = 0;
  let rotationOnlyCorrectedFieldCount = 0;
  let rawPhraseRecoveryCount = 0;

  for (const caseResult of cases) {
    for (const field of ["brand", "alcohol"] as const) {
      const comparison = caseResult.fields[field];
      const best = comparison[scenarioNameToKey(comparison.bestScenario)];
      if (comparison.correctedByCounterfactual) {
        cropCorrectedFieldCount += 1;
        if (
          comparison.bestScenario === "canonically-rotated-targeted-crop" &&
          outcomeScore(comparison.canonicalRotatedCrop) > outcomeScore(comparison.targetedCrop)
        ) {
          rotationOnlyCorrectedFieldCount += 1;
        }
      }
      if (
        comparison.baseline.rawOcr &&
        best.rawOcr &&
        !comparison.baseline.rawOcr.expectedPhrasePresent &&
        best.rawOcr.expectedPhrasePresent
      ) {
        rawPhraseRecoveryCount += 1;
      }
    }
  }

  if (cropCorrectedFieldCount === 0 && rawPhraseRecoveryCount === 0) {
    return {
      verdict: "RECOGNITION BOTTLENECK SUPPORTED",
      rationale:
        "Correct-region crops did not materially recover either phrase recognition or selected-field correctness on the benchmark set.",
      cropCorrectedFieldCount,
      rotationOnlyCorrectedFieldCount,
      rawPhraseRecoveryCount,
    };
  }

  if (cropCorrectedFieldCount >= Math.max(3, Math.ceil(cases.length / 3))) {
    return {
      verdict: "REGION BOTTLENECK SUPPORTED",
      rationale:
        "Correct-region crops recover a material share of missed fields before any OCR-engine, filter, or parser changes, so region isolation is a demonstrated bottleneck on this benchmark slice.",
      cropCorrectedFieldCount,
      rotationOnlyCorrectedFieldCount,
      rawPhraseRecoveryCount,
    };
  }

  return {
    verdict: "MIXED RESULT",
    rationale:
      "Some benchmark cases improve with region isolation, but the gains are not uniform enough to treat crop isolation alone as the dominant bottleneck.",
    cropCorrectedFieldCount,
    rotationOnlyCorrectedFieldCount,
    rawPhraseRecoveryCount,
  };
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
      const { detailed, report: baselineReport } = await runBaselineCase(
        benchmarkCase.evalCase,
        image,
      );
      const fieldComparisons = {} as OcrRegionBenchmarkCaseResult["fields"];

      for (const field of ["brand", "alcohol"] as const) {
        const annotation = benchmarkCase.annotation.fields[field];
        const baseline = baselineScenarioFieldResult(
          field,
          benchmarkCase.evalCase,
          baselineReport,
          detailed,
        );

        let targetedCrop = notApplicableScenario(
          "human-targeted-crop",
          benchmarkCase.evalCase,
          field,
          baseline.failureClass,
          baseline.selectedState,
          baseline.selectedValue,
          fieldTruthPresent(field, benchmarkCase.evalCase)
            ? ["no adjudicated benchmark geometry"]
            : ["field absent in evaluation truth"],
        );
        let canonicalRotatedCrop = notApplicableScenario(
          "canonically-rotated-targeted-crop",
          benchmarkCase.evalCase,
          field,
          baseline.failureClass,
          baseline.selectedState,
          baseline.selectedValue,
          ["canonical rotation not applicable"],
        );

        if (annotation) {
          targetedCrop = await runCounterfactualScenario({
            evalCase: benchmarkCase.evalCase,
            field,
            annotation,
            scenario: "human-targeted-crop",
            bytes: image.bytes,
            image,
            rotationApplied: 0,
            engine,
          });
          const canonicalRotation = rotationForOrientation(
            fieldOrientation(field, benchmarkCase.record),
          );
          if (canonicalRotation !== null) {
            canonicalRotatedCrop = await runCounterfactualScenario({
              evalCase: benchmarkCase.evalCase,
              field,
              annotation,
              scenario: "canonically-rotated-targeted-crop",
              bytes: image.bytes,
              image,
              rotationApplied: canonicalRotation,
              engine,
            });
          }
        }

        fieldComparisons[field] = classifyFieldComparison(
          field,
          annotation,
          benchmarkCase.annotation.challengeSlices,
          baseline,
          targetedCrop,
          canonicalRotatedCrop,
        );
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
      cases: results,
      annotationCoverage: annotationCoverage(cases),
      aggregateComparisons: aggregateScenarioMetrics(results),
      challengeSliceComparisons: challengeSliceComparisons(results),
      regressions: regressionLedger(results),
      latencyComparison: latencyComparison(results),
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
          "All benchmark annotations and report code live under src/fixtures/eval and remain covered by the existing evaluation-only import guards.",
      },
      recommendation: recommendation(results),
    };
  } finally {
    await engine.terminate();
  }
}

function pct(numerator: number, denominator: number): string {
  return denominator === 0 ? "0%" : `${Math.round((numerator / denominator) * 100)}%`;
}

function scenarioLabel(scenario: OcrRegionBenchmarkScenarioKey): string {
  switch (scenario) {
    case "production-baseline":
      return "A. Production baseline";
    case "human-targeted-crop":
      return "B. Human-targeted crop";
    case "canonically-rotated-targeted-crop":
      return "C. Canonically rotated crop";
  }
}

function scenarioOutcomeLabel(result: BenchmarkScenarioFieldResult): string {
  return result.applicable ? result.failureClass : "not-applicable";
}

export function renderOcrRegionBenchmarkMarkdown(report: OcrRegionBenchmarkReport): string {
  const lines: string[] = [];
  lines.push("# OCR Region-Isolation Benchmark");
  lines.push("");
  lines.push(
    `Bounded evaluation-only benchmark over ${report.benchmarkCaseCount} adjudicated cases using the committed OCR engine and existing deterministic downstream selector logic.`,
  );
  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  lines.push(`- Verdict: ${report.recommendation.verdict}`);
  lines.push(`- Rationale: ${report.recommendation.rationale}`);
  lines.push(
    `- Counterfactual-corrected fields: ${report.recommendation.cropCorrectedFieldCount}; rotation-only corrected fields: ${report.recommendation.rotationOnlyCorrectedFieldCount}; raw phrase recoveries: ${report.recommendation.rawPhraseRecoveryCount}`,
  );
  lines.push("");
  lines.push("## Annotation Coverage");
  lines.push("");
  lines.push(`- Benchmark cases: ${report.annotationCoverage.benchmarkCaseCount}`);
  lines.push(`- Brand-present cases: ${report.annotationCoverage.brandPresentCaseCount}`);
  lines.push(`- Alcohol-present cases: ${report.annotationCoverage.alcoholPresentCaseCount}`);
  lines.push(`- Brand annotations: ${report.annotationCoverage.brandAnnotatedCaseCount}`);
  lines.push(`- Alcohol annotations: ${report.annotationCoverage.alcoholAnnotatedCaseCount}`);
  lines.push(
    `- Human-readable field regions: ${report.annotationCoverage.humanReadableFieldCount}`,
  );
  lines.push("");
  lines.push("## Aggregate Comparison");
  lines.push("");
  lines.push(
    "| Scenario | Field | Present cases | Exact | Normalized | Top-3 | Top-5 | Detected | Parsed accurate | Parser failures | Phrase present | Mean similarity |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of report.aggregateComparisons) {
    lines.push(
      `| ${scenarioLabel(row.scenario)} | ${row.field} | ${row.presentCaseCount} | ${pct(row.exactMatchCount, row.presentCaseCount)} | ${pct(row.normalizedMatchCount, row.presentCaseCount)} | ${pct(row.top3Count, row.presentCaseCount)} | ${pct(row.top5Count, row.presentCaseCount)} | ${pct(row.detectedCount, row.presentCaseCount)} | ${pct(row.parsedAccurateCount, row.presentCaseCount)} | ${row.parserFailureCount} | ${pct(row.expectedPhrasePresentCount, row.presentCaseCount)} | ${row.meanNormalizedPhraseSimilarity.toFixed(2)} |`,
    );
  }
  lines.push("");
  lines.push("## Challenge Slices");
  lines.push("");
  lines.push("| Slice | Field | Scenario | Applicable | Corrected | Phrase present |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of report.challengeSliceComparisons) {
    lines.push(
      `| ${row.slice} | ${row.field} | ${scenarioLabel(row.scenario)} | ${row.applicableCaseCount} | ${row.correctedCount} | ${row.expectedPhrasePresentCount} |`,
    );
  }
  lines.push("");
  lines.push("## Case Ledger");
  lines.push("");
  lines.push("| Case | Field | Best scenario | Baseline | B crop | C rotated | Classifications |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const caseResult of report.cases) {
    for (const field of ["brand", "alcohol"] as const) {
      const comparison = caseResult.fields[field];
      lines.push(
        `| ${caseResult.caseId} | ${field} | ${scenarioLabel(comparison.bestScenario)} | ${scenarioOutcomeLabel(comparison.baseline)} | ${scenarioOutcomeLabel(comparison.targetedCrop)} | ${scenarioOutcomeLabel(comparison.canonicalRotatedCrop)} | ${comparison.classifications.join(", ")} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Regressions");
  lines.push("");
  if (report.regressions.length === 0) {
    lines.push(
      "No counterfactual scenario regressed below the production baseline on this benchmark set.",
    );
  } else {
    lines.push("| Case | Field | Scenario | Baseline | Counterfactual |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const regression of report.regressions) {
      lines.push(
        `| ${regression.caseId} | ${regression.field} | ${scenarioLabel(regression.scenario)} | ${regression.baselineFailureClass} | ${regression.scenarioFailureClass} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Latency");
  lines.push("");
  lines.push(
    "| Scenario | Executed fields | Median latency | p95 latency | Median OCR | Median preprocess |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of report.latencyComparison) {
    lines.push(
      `| ${scenarioLabel(row.scenario)} | ${row.executedFieldCount} | ${row.medianLatencyMs.toFixed(0)} ms | ${row.p95LatencyMs.toFixed(0)} ms | ${row.medianOcrMs.toFixed(0)} ms | ${row.medianPreprocessMs.toFixed(0)} ms |`,
    );
  }
  lines.push("");
  lines.push("## Production Boundary");
  lines.push("");
  lines.push(`- Benchmark modules: ${report.productionBoundaryProof.benchmarkModules.join(", ")}`);
  lines.push(`- Guard tests: ${report.productionBoundaryProof.guardTests.join(", ")}`);
  lines.push(`- Proof note: ${report.productionBoundaryProof.proofNote}`);
  lines.push("");
  return `${lines.join("\n").trimEnd()}\n`;
}
