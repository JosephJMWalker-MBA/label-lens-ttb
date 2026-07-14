import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { loadCaseImage, loadEvalManifest } from "./eval-loader";
import type {
  EvalAnnotationConfidence,
  EvalNormalizedBox,
  EvalTextOrientation,
  LoadedEvalManifest,
} from "./eval-manifest.types";
import { loadBenchmarkCases, validateBenchmarkAnnotations } from "./ocr-region-benchmark";
import type { OcrRegionBenchmarkFieldKey } from "./ocr-region-benchmark.annotations";
import type {
  VisionRegionBenchmarkCaseRun,
  VisionRegionBenchmarkCoarseProposalRecord,
  VisionRegionBenchmarkGenerationInput,
  VisionRegionBenchmarkRefinementProposalRecord,
  VisionRegionBenchmarkStageRun,
} from "./vision-region-benchmark.generation";
import { runVisionRegionBenchmarkGeneration } from "./vision-region-benchmark.generation";
import { VISION_REGION_REFINEMENT_PADDING_RATIO } from "./vision-region-refinement-derivative";
import { normalizedIntersectionArea } from "./vision-observer/observer-grid-transform";
import {
  LOCAL_VLM_RUNTIME_KINDS,
  type LocalVlmConfigInput,
  type LocalVlmDecision,
  type LocalVlmExperimentReport,
  type LocalVlmResolvedConfig,
  type LocalVlmRuntimeKind,
} from "./vision-observer/local-vlm/local-vlm.types";
import { resolveLocalVlmConfig } from "./vision-observer/local-vlm/llama-server-config";
import {
  runLocalVlmContaminationSequence,
  runLocalVlmStress,
} from "./vision-observer/local-vlm/contamination-harness";
import {
  LOCAL_VLM_PROMPT_ID,
  LOCAL_VLM_PROMPT_SHA256,
  LOCAL_VLM_PROMPT_VERSION,
  LOCAL_VLM_REFINEMENT_PROMPT_ID,
  LOCAL_VLM_REFINEMENT_PROMPT_SHA256,
  LOCAL_VLM_REFINEMENT_PROMPT_VERSION,
} from "./vision-observer/local-vlm/observer-prompt";
import {
  LLAMA_SERVER_ADAPTER_ID,
  LLAMA_SERVER_ADAPTER_VERSION,
} from "./vision-observer/local-vlm/local-vlm.types";
import {
  OBSERVER_REASON_CODES,
  type ApparentOrientation,
  type ReasonCode,
} from "./vision-observer/observer-grid.types";

export const VISION_REGION_BENCHMARK_REPORT_SCHEMA_VERSION =
  "vision-region-benchmark-report.v2" as const;
export const VISION_REGION_BENCHMARK_EXPECTED_CASE_COUNT = 13 as const;
export const DEFAULT_VISION_REGION_CASE_REPETITIONS = 3 as const;
export const DEFAULT_VISION_REGION_RESOURCE_RUNS = 10 as const;

export const VISION_REGION_BENCHMARK_DECISIONS = [
  "VISION REGION SIGNAL SUPPORTED",
  "VISION REGION SIGNAL NOT SUPPORTED",
  "MIXED RESULT",
  "INSUFFICIENT EVIDENCE",
  "CONTEXT CONTAMINATION DETECTED",
  "RESOURCE LIFECYCLE NOT BOUNDED",
] as const;

export const VISION_REGION_ARM_KEYS = ["coarseOnly", "coarsePlusRefinement"] as const;

export const VISION_REGION_GATE_CONSTANTS = Object.freeze({
  IOT_MIN: 0.5,
  IOP_MIN: 0.2,
  AREA_CAP: 0.4,
  UNION_CAP: 0.6,
  COUNT_CAP: 6,
  RECALL_FLOOR: 0.7,
  REFINEMENT_PADDING_RATIO: VISION_REGION_REFINEMENT_PADDING_RATIO,
  REFINEMENT_IMPROVEMENT_MARGIN: 0.05,
});

export type VisionRegionBenchmarkDecision = (typeof VISION_REGION_BENCHMARK_DECISIONS)[number];
export type VisionRegionArmKey = (typeof VISION_REGION_ARM_KEYS)[number];
export type VisionRegionBenchmarkCase = ReturnType<typeof loadBenchmarkCases>[number];

export interface VisionRegionBenchmarkRuntimeSummary {
  runtimeKind: LocalVlmRuntimeKind | null;
  realRuntimeConfigured: boolean;
  configurationError: string | null;
  executableDigest: string | null;
  modelDigest: string | null;
  projectorDigest: string | null;
  modelDisplayId: string | null;
  quantization: string | null;
  host: string | null;
  contextSize: number | null;
  maxOutputTokens: number | null;
  threadCount: number | null;
  gpuLayers: number | null;
  seed: number | null;
  temperature: number | null;
  sanitizedRuntimeArguments: readonly string[];
  adapter: {
    adapterId: string;
    adapterVersion: string;
    adapterDigest: string;
    adapterProvenance: string;
  };
  prompts: {
    coarse: {
      promptId: string;
      promptVersion: string;
      promptDigest: string;
    };
    refinement: {
      promptId: string;
      promptVersion: string;
      promptDigest: string;
    };
  };
}

export interface VisionRegionBenchmarkEvidenceSummary {
  decision: LocalVlmDecision | null;
  runCount: number;
  validResponseCount: number;
  invalidResponseCount: number;
  cleanupFailureCount: number;
  forcedTerminationCount: number;
  prohibitedClaimCount: number;
  schemaFailureCount: number;
  contaminationCount: number;
  peakProcessRssBytes: number | null;
  peakProcessTreeRssBytes: number | null;
  maxWorkspaceBytes: number;
  maxWorkspaceFiles: number;
  maxStartupMs: number | null;
  maxRequestMs: number | null;
  maxTerminationMs: number | null;
}

export interface VisionRegionBenchmarkGate {
  id: string;
  requirement: string;
  passed: boolean;
  evidence: string;
}

export interface VisionRegionBenchmarkDistribution {
  min: number | null;
  median: number | null;
  max: number | null;
}

export interface VisionRegionBenchmarkUnsupportedMetric {
  value: null;
  rationale: string;
}

export interface VisionRegionBenchmarkClaimSemantics {
  regionRecall: {
    supported: true;
    denominator: number;
    note: string;
  };
  geometryOnGovernedHits: {
    supported: true;
    denominator: number;
    note: string;
  };
  textRegionPrecision: VisionRegionBenchmarkUnsupportedMetric;
  falseRegionRate: VisionRegionBenchmarkUnsupportedMetric;
  absentFieldObserverFalsePositiveRate: VisionRegionBenchmarkUnsupportedMetric;
}

export interface VisionRegionBenchmarkRunArmSummary {
  requestCount: number;
  proposalCount: number;
  usefulProposalCount: number;
  unionCoverage: number;
  peakProcessTreeRssBytes: number | null;
  peakWorkspaceBytes: number;
  totalWallMs: number | null;
  cleanupCompleted: boolean;
  cleanupFailureCount: number;
  forcedTerminationCount: number;
  malformedStageCount: number;
  processTreeReleaseFailureCount: number;
  portReleaseFailureCount: number;
  sampleFailureCount: number;
  stdoutTruncationCount: number;
  stderrTruncationCount: number;
  prohibitedClaimCount: number;
  unionCapPassed: boolean;
  countCapPassed: boolean;
}

export interface VisionRegionBenchmarkRunTargetMetrics {
  proposalId: string | null;
  hit: boolean;
  intersectionOverTruth: number;
  intersectionOverProposal: number;
  iou: number;
  proposalAreaRatio: number | null;
  apparentOrientation: ApparentOrientation | null;
  reasonCodes: readonly ReasonCode[];
  blockedByUnionCap: boolean;
  blockedByCountCap: boolean;
  outOfBounds: boolean;
}

export interface VisionRegionBenchmarkRunTargetMatch {
  targetId: string;
  field: OcrRegionBenchmarkFieldKey;
  annotationConfidence: EvalAnnotationConfidence;
  arms: Record<VisionRegionArmKey, VisionRegionBenchmarkRunTargetMetrics>;
}

export interface VisionRegionBenchmarkRun {
  caseId: string;
  repetition: number;
  coarseStage: VisionRegionBenchmarkStageRun;
  refinementStages: readonly {
    coarseProposalId: string;
    cropNormalizedBox: EvalNormalizedBox | null;
    stageRun: VisionRegionBenchmarkStageRun;
    proposal: VisionRegionBenchmarkRefinementProposalRecord | null;
  }[];
  armSummaries: Record<VisionRegionArmKey, VisionRegionBenchmarkRunArmSummary>;
  targetMatches: VisionRegionBenchmarkRunTargetMatch[];
}

export interface VisionRegionBenchmarkTargetArmSummary {
  hitByRep: boolean[];
  anyRunHit: boolean;
  consistentHit: boolean;
  perRunBestIoU: number[];
  perRunIntersectionOverTruth: number[];
  perRunIntersectionOverProposal: number[];
  iouDistribution: VisionRegionBenchmarkDistribution;
  intersectionOverTruthDistribution: VisionRegionBenchmarkDistribution;
  intersectionOverProposalDistribution: VisionRegionBenchmarkDistribution;
  proposalAreaDistribution: VisionRegionBenchmarkDistribution;
  bestProposalIds: (string | null)[];
  apparentOrientations: (ApparentOrientation | null)[];
  exactOrientationAgreement: boolean | null;
  reasonCodeSetsByRep: string[][];
  reasonCodeExactAgreement: boolean;
  reasonCodeMeanJaccard: number | null;
}

export interface VisionRegionBenchmarkTargetSummary {
  targetId: string;
  caseId: string;
  field: OcrRegionBenchmarkFieldKey;
  imagePath: string;
  challengeSlices: string[];
  expectedOrientation: Exclude<EvalTextOrientation, "not-applicable">;
  annotationConfidence: EvalAnnotationConfidence;
  humanReadable: boolean;
  adjudicationNotes: string;
  targetGeometry: EvalNormalizedBox;
  arms: Record<VisionRegionArmKey, VisionRegionBenchmarkTargetArmSummary>;
}

export interface VisionRegionBenchmarkOrientationBucket {
  denominator: number;
  exactAgreementRate: number | null;
  exactAgreementNumerator: number | null;
  rationale: string | null;
  nonHorizontalDetectionRate: number | null;
}

export interface VisionRegionBenchmarkOrientationSummary {
  horizontal: VisionRegionBenchmarkOrientationBucket;
  nonHorizontal: VisionRegionBenchmarkOrientationBucket;
  mixed: VisionRegionBenchmarkOrientationBucket;
}

export interface VisionRegionBenchmarkReasonCodeTargetSummary {
  targetId: string;
  arm: VisionRegionArmKey;
  perRunSets: string[][];
  exactAgreement: boolean;
  meanJaccard: number | null;
  challengeSlices: string[];
}

export interface VisionRegionBenchmarkReasonCodeSummary {
  emittedCounts: Record<ReasonCode, number>;
  perTarget: VisionRegionBenchmarkReasonCodeTargetSummary[];
  precision: VisionRegionBenchmarkUnsupportedMetric;
  recall: VisionRegionBenchmarkUnsupportedMetric;
  unsupportedCorrectnessClaims: readonly ReasonCode[];
  challengeSliceCrossReference: Partial<Record<ReasonCode, string[]>>;
}

export interface VisionRegionBenchmarkConfidenceBreakdown {
  denominator: number;
  consistentHitRecall: number;
  anyRunRecall: number;
  iouOnHits: VisionRegionBenchmarkDistribution;
}

export interface VisionRegionBenchmarkArmAggregate {
  arm: VisionRegionArmKey;
  decision: VisionRegionBenchmarkDecision;
  decisionRationale: string[];
  consistentHitRecall: number;
  anyRunRecall: number;
  geometryOnHits: {
    iou: VisionRegionBenchmarkDistribution;
    intersectionOverTruth: VisionRegionBenchmarkDistribution;
    proposalAreaRatio: VisionRegionBenchmarkDistribution;
  };
  proposalCount: VisionRegionBenchmarkDistribution;
  unionCoverage: VisionRegionBenchmarkDistribution;
  requestCount: number;
  wallTimeMs: number | null;
  peakProcessTreeRssBytes: number | null;
  peakWorkspaceBytes: number;
  cleanupFailureCount: number;
  forcedTerminationCount: number;
  malformedStageCount: number;
  confidence: {
    high: VisionRegionBenchmarkConfidenceBreakdown;
    medium: VisionRegionBenchmarkConfidenceBreakdown;
  };
}

export interface VisionRegionBenchmarkRefinementBenefit {
  decision: VisionRegionBenchmarkDecision;
  improvementMargin: number;
  incrementalRequestCount: number;
  incrementalPeakProcessTreeRssBytes: number | null;
  incrementalPeakWorkspaceBytes: number;
  rationale: string[];
}

export interface VisionRegionBenchmarkCaseAccounting {
  expectedCaseCount: number;
  completedCaseCount: number;
  caseRepetitions: number;
  expectedCoarseRunCount: number;
  completedCoarseRunCount: number;
  missingCoarseRuns: string[];
  malformedStageRunCount: number;
}

export interface VisionRegionBenchmarkCorpusSummary {
  targetCount: number;
  fieldDenominators: {
    brand: number;
    alcohol: number;
  };
  orientationDenominators: {
    horizontal: number;
    verticalClockwise: number;
    verticalCounterclockwise: number;
    mixed: number;
  };
  annotationConfidenceDenominators: {
    high: number;
    medium: number;
  };
}

export interface VisionRegionBenchmarkBoundaryProof {
  benchmarkModules: string[];
  guardTests: string[];
  productionBehaviorChangeAuthorized: false;
  proofNote: string;
}

export interface VisionRegionBenchmarkReport {
  schemaVersion: typeof VISION_REGION_BENCHMARK_REPORT_SCHEMA_VERSION;
  generatedAt: string;
  gitCommit: string;
  gateConstants: typeof VISION_REGION_GATE_CONSTANTS;
  runtime: VisionRegionBenchmarkRuntimeSummary;
  claimSemantics: VisionRegionBenchmarkClaimSemantics;
  stabilitySemantics: string;
  statelessObserverBoundary: VisionRegionBenchmarkEvidenceSummary;
  resourceLifecycle: VisionRegionBenchmarkEvidenceSummary;
  supportGates: VisionRegionBenchmarkGate[];
  caseAccounting: VisionRegionBenchmarkCaseAccounting;
  corpus: VisionRegionBenchmarkCorpusSummary;
  unsupportedMetrics: {
    mixedOrientationExactAgreement: VisionRegionBenchmarkUnsupportedMetric;
  };
  runs: VisionRegionBenchmarkRun[];
  targets: VisionRegionBenchmarkTargetSummary[];
  orientation: Record<VisionRegionArmKey, VisionRegionBenchmarkOrientationSummary>;
  reasonCodes: VisionRegionBenchmarkReasonCodeSummary;
  arms: {
    coarseOnly: VisionRegionBenchmarkArmAggregate;
    coarsePlusRefinement: VisionRegionBenchmarkArmAggregate;
    refinementBenefit: VisionRegionBenchmarkRefinementBenefit;
  };
  humanAdjudicatedUpperBound: {
    consistentHitRecall: 1;
    anyRunRecall: 1;
    note: string;
  };
  decision: VisionRegionBenchmarkDecision;
  decisionRationale: string[];
  limitations: string[];
  productionBoundaryProof: VisionRegionBenchmarkBoundaryProof;
}

interface BuildVisionRegionBenchmarkReportArgs {
  benchmarkCases: readonly VisionRegionBenchmarkCase[];
  caseRepetitions: number;
  caseRuns: readonly VisionRegionBenchmarkCaseRun[];
  runtime: VisionRegionBenchmarkRuntimeSummary;
  statelessObserverBoundary: LocalVlmExperimentReport | null;
  resourceLifecycle: LocalVlmExperimentReport | null;
  generatedAt?: string;
  gitCommit?: string;
}

interface RunVisionRegionBenchmarkOptions {
  manifest?: LoadedEvalManifest;
  benchmarkCases?: readonly VisionRegionBenchmarkCase[];
  caseIds?: readonly string[];
  caseRepetitions?: number;
  resourceRunCount?: number;
  configInput?: LocalVlmConfigInput;
}

interface TargetSpec {
  targetId: string;
  caseId: string;
  imagePath: string;
  field: OcrRegionBenchmarkFieldKey;
  challengeSlices: string[];
  expectedOrientation: Exclude<EvalTextOrientation, "not-applicable">;
  annotationConfidence: EvalAnnotationConfidence;
  humanReadable: boolean;
  adjudicationNotes: string;
  targetGeometry: EvalNormalizedBox;
}

interface ArmProposalCandidate {
  proposalId: string;
  geometry: EvalNormalizedBox;
  apparentOrientation: ApparentOrientation;
  reasonCodes: readonly ReasonCode[];
}

const normalizedBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict();

const unsupportedMetricSchema = z
  .object({
    value: z.null(),
    rationale: z.string().min(1),
  })
  .strict();

const stageRunSchema = z
  .object({
    stage: z.enum(["coarse", "refinement"]),
    scenarioId: z.string().min(1),
    observationRunId: z.string().uuid(),
    workspaceRef: z.string().min(1),
    runtimeKind: z.enum(LOCAL_VLM_RUNTIME_KINDS),
    sourceArtifactRef: z.string().min(1),
    sourceImageSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable(),
    overlaySha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable(),
    promptId: z.string().min(1),
    promptVersion: z.string().min(1),
    promptDigest: z.string().regex(/^[a-f0-9]{64}$/i),
    adapterId: z.string().min(1),
    adapterVersion: z.string().min(1),
    runtimeVersion: z.string().nullable(),
    rawResponseDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable(),
    structuredResponseDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable(),
    schemaValid: z.boolean(),
    prohibitedClaimDetected: z.boolean(),
    transportSuccess: z.boolean(),
    jsonExtractionSuccess: z.boolean(),
    schemaSuccess: z.boolean(),
    prohibitedLanguageSuccess: z.boolean(),
    geometrySuccess: z.boolean(),
    cleanupCompleted: z.boolean(),
    forcedTermination: z.boolean(),
    errorCode: z.string().nullable(),
    errorStage: z.string().nullable(),
    process: z
      .object({
        pid: z.number().int().nullable(),
        processGroupId: z.number().int().nullable(),
        port: z.number().int().nullable(),
        spawnedAt: z.string().nullable(),
        readyAt: z.string().nullable(),
        requestStartedAt: z.string().nullable(),
        requestCompletedAt: z.string().nullable(),
        terminationRequestedAt: z.string().nullable(),
        exitedAt: z.string().nullable(),
        portReleased: z.boolean().nullable(),
        processTreeReleasedAfterTermination: z.boolean().nullable(),
        stdoutTruncated: z.boolean(),
        stderrTruncated: z.boolean(),
      })
      .strict(),
    resources: z
      .object({
        workspacePeakBytes: z.number().int().nonnegative(),
        workspaceBytesAfterCleanup: z.number().int().nonnegative().nullable(),
        fileCountPeak: z.number().int().nonnegative(),
        sampleCount: z.number().int().nonnegative(),
        sampleFailureCount: z.number().int().nonnegative(),
        peakProcessRssBytes: z.number().int().nonnegative().nullable(),
        peakProcessTreeRssBytes: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    timing: z
      .object({
        startupMs: z.number().nonnegative().nullable(),
        requestMs: z.number().nonnegative().nullable(),
        parseMs: z.number().nonnegative().nullable(),
        terminationMs: z.number().nonnegative().nullable(),
        totalWallMs: z.number().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();

const runTargetMetricsSchema = z
  .object({
    proposalId: z.string().min(1).nullable(),
    hit: z.boolean(),
    intersectionOverTruth: z.number().min(0).max(1),
    intersectionOverProposal: z.number().min(0).max(1),
    iou: z.number().min(0).max(1),
    proposalAreaRatio: z.number().min(0).max(1).nullable(),
    apparentOrientation: z
      .enum([
        "horizontal",
        "vertical-clockwise",
        "vertical-counterclockwise",
        "rotated-180",
        "uncertain",
      ])
      .nullable(),
    reasonCodes: z.array(z.enum(OBSERVER_REASON_CODES)),
    blockedByUnionCap: z.boolean(),
    blockedByCountCap: z.boolean(),
    outOfBounds: z.boolean(),
  })
  .strict();

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function workspaceToken(workspaceRef: string) {
  return hashText(workspaceRef).slice(0, 16);
}

function currentGitCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function area(box: EvalNormalizedBox) {
  return box.width * box.height;
}

function mean(values: readonly number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function distribution(values: readonly number[]): VisionRegionBenchmarkDistribution {
  if (values.length === 0) return { min: null, median: null, max: null };
  return {
    min: roundMetric(Math.min(...values)),
    median: roundMetric(median(values)!),
    max: roundMetric(Math.max(...values)),
  };
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : roundMetric(numerator / denominator);
}

function sanitizeRuntimeArguments(config: LocalVlmResolvedConfig) {
  const parts = [
    "--host",
    config.host,
    "--model",
    config.modelDisplayId,
    "--ctx-size",
    String(config.contextSize),
    "--predict",
    String(config.maxOutputTokens),
  ];
  if (config.threadCount !== null) parts.push("--threads", String(config.threadCount));
  if (config.gpuLayers !== null) parts.push("--gpu-layers", String(config.gpuLayers));
  if (config.mmprojSha256 !== null) parts.push("--mmproj", "[configured]");
  return parts;
}

function adapterDigest() {
  const path = join(
    process.cwd(),
    "src/fixtures/eval/vision-observer/local-vlm/llama-server-adapter.ts",
  );
  return hashText(readFileSync(path, "utf8"));
}

function summarizeEvidence(
  report: LocalVlmExperimentReport | null,
): VisionRegionBenchmarkEvidenceSummary {
  if (!report) {
    return {
      decision: null,
      runCount: 0,
      validResponseCount: 0,
      invalidResponseCount: 0,
      cleanupFailureCount: 0,
      forcedTerminationCount: 0,
      prohibitedClaimCount: 0,
      schemaFailureCount: 0,
      contaminationCount: 0,
      peakProcessRssBytes: null,
      peakProcessTreeRssBytes: null,
      maxWorkspaceBytes: 0,
      maxWorkspaceFiles: 0,
      maxStartupMs: null,
      maxRequestMs: null,
      maxTerminationMs: null,
    };
  }
  return {
    decision: report.decision,
    runCount: report.aggregate.runCount,
    validResponseCount: report.aggregate.validResponseCount,
    invalidResponseCount: report.aggregate.invalidResponseCount,
    cleanupFailureCount: report.aggregate.cleanupFailureCount,
    forcedTerminationCount: report.aggregate.forcedTerminationCount,
    prohibitedClaimCount: report.aggregate.prohibitedClaimCount,
    schemaFailureCount: report.aggregate.schemaFailureCount,
    contaminationCount: report.aggregate.contaminationCount,
    peakProcessRssBytes: report.aggregate.peakRssSummary.peakProcessRssBytes,
    peakProcessTreeRssBytes: report.aggregate.peakRssSummary.peakProcessTreeRssBytes,
    maxWorkspaceBytes: report.aggregate.workspaceSummary.maxWorkspaceBytes,
    maxWorkspaceFiles: report.aggregate.workspaceSummary.maxWorkspaceFiles,
    maxStartupMs: report.aggregate.latencySummary.maxStartupMs,
    maxRequestMs: report.aggregate.latencySummary.maxRequestMs,
    maxTerminationMs: report.aggregate.latencySummary.maxTerminationMs,
  };
}

function buildRuntimeSummary(
  config: LocalVlmResolvedConfig | null,
  configurationError: string | null,
): VisionRegionBenchmarkRuntimeSummary {
  return {
    runtimeKind: config?.runtimeKind ?? null,
    realRuntimeConfigured: config !== null,
    configurationError,
    executableDigest: config?.llamaExecutableSha256 ?? null,
    modelDigest: config?.modelSha256 ?? null,
    projectorDigest: config?.mmprojSha256 ?? null,
    modelDisplayId: config?.modelDisplayId ?? null,
    quantization: config?.modelQuantization ?? null,
    host: config?.host ?? null,
    contextSize: config?.contextSize ?? null,
    maxOutputTokens: config?.maxOutputTokens ?? null,
    threadCount: config?.threadCount ?? null,
    gpuLayers: config?.gpuLayers ?? null,
    seed: config?.seed ?? null,
    temperature: config?.temperature ?? null,
    sanitizedRuntimeArguments: config ? sanitizeRuntimeArguments(config) : [],
    adapter: {
      adapterId: LLAMA_SERVER_ADAPTER_ID,
      adapterVersion: LLAMA_SERVER_ADAPTER_VERSION,
      adapterDigest: adapterDigest(),
      adapterProvenance: "src/fixtures/eval/vision-observer/local-vlm/llama-server-adapter.ts",
    },
    prompts: {
      coarse: {
        promptId: LOCAL_VLM_PROMPT_ID,
        promptVersion: LOCAL_VLM_PROMPT_VERSION,
        promptDigest: LOCAL_VLM_PROMPT_SHA256,
      },
      refinement: {
        promptId: LOCAL_VLM_REFINEMENT_PROMPT_ID,
        promptVersion: LOCAL_VLM_REFINEMENT_PROMPT_VERSION,
        promptDigest: LOCAL_VLM_REFINEMENT_PROMPT_SHA256,
      },
    },
  };
}

function expectedOrientationForField(
  benchmarkCase: VisionRegionBenchmarkCase,
  field: OcrRegionBenchmarkFieldKey,
): Exclude<EvalTextOrientation, "not-applicable"> {
  return benchmarkCase.record.annotation[field].orientation as Exclude<
    EvalTextOrientation,
    "not-applicable"
  >;
}

function buildTargetSpecs(cases: readonly VisionRegionBenchmarkCase[]): TargetSpec[] {
  return cases.flatMap((benchmarkCase) =>
    (["brand", "alcohol"] as const).flatMap((field) => {
      const annotation = benchmarkCase.annotation.fields[field];
      if (!annotation) return [];
      return [
        {
          targetId: `${benchmarkCase.evalCase.caseId}:${field}`,
          caseId: benchmarkCase.evalCase.caseId,
          imagePath: benchmarkCase.record.imagePath,
          field,
          challengeSlices: [...benchmarkCase.annotation.challengeSlices],
          expectedOrientation: expectedOrientationForField(benchmarkCase, field),
          annotationConfidence: annotation.annotationConfidence,
          humanReadable: annotation.humanReadable,
          adjudicationNotes: benchmarkCase.annotation.adjudicationNotes,
          targetGeometry: annotation.geometry,
        },
      ];
    }),
  );
}

function boxWithinBounds(box: EvalNormalizedBox) {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x + box.width <= 1 + Number.EPSILON &&
    box.y + box.height <= 1 + Number.EPSILON
  );
}

function unionCoverage(boxes: readonly EvalNormalizedBox[]) {
  if (boxes.length === 0) return 0;
  const xs = [...new Set(boxes.flatMap((box) => [box.x, box.x + box.width]))].sort(
    (left, right) => left - right,
  );
  let total = 0;
  for (let index = 0; index < xs.length - 1; index += 1) {
    const left = xs[index]!;
    const right = xs[index + 1]!;
    if (right <= left) continue;
    const intervals = boxes
      .filter((box) => box.x < right && box.x + box.width > left)
      .map((box) => [box.y, box.y + box.height] as const)
      .sort((a, b) => a[0] - b[0]);
    if (intervals.length === 0) continue;
    let covered = 0;
    let currentStart = intervals[0]![0];
    let currentEnd = intervals[0]![1];
    for (const interval of intervals.slice(1)) {
      if (interval[0] > currentEnd) {
        covered += currentEnd - currentStart;
        currentStart = interval[0];
        currentEnd = interval[1];
      } else {
        currentEnd = Math.max(currentEnd, interval[1]);
      }
    }
    covered += currentEnd - currentStart;
    total += (right - left) * covered;
  }
  return roundMetric(total);
}

function jaccardIndex(left: readonly string[], right: readonly string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) intersection += 1;
  }
  return roundMetric(intersection / union.size);
}

function armProposals(
  run: VisionRegionBenchmarkCaseRun,
  arm: VisionRegionArmKey,
): ArmProposalCandidate[] {
  const refinementByProposalId = new Map(
    run.refinementStages.map((stage) => [stage.coarseProposalId, stage.proposal] as const),
  );
  return run.coarseProposals.map((coarse) => {
    const refinement = refinementByProposalId.get(coarse.proposalId) ?? null;
    if (arm === "coarsePlusRefinement" && refinement) {
      return {
        proposalId: coarse.proposalId,
        geometry: refinement.refinedGeometry,
        apparentOrientation: refinement.apparentOrientation,
        reasonCodes: refinement.reasonCodes,
      };
    }
    return {
      proposalId: coarse.proposalId,
      geometry: coarse.coarseGeometry,
      apparentOrientation: coarse.apparentOrientation,
      reasonCodes: coarse.reasonCodes,
    };
  });
}

function stageRunsForArm(
  run: VisionRegionBenchmarkCaseRun,
  arm: VisionRegionArmKey,
): VisionRegionBenchmarkStageRun[] {
  return arm === "coarseOnly"
    ? [run.coarseStage]
    : [run.coarseStage, ...run.refinementStages.map((stage) => stage.stageRun)];
}

function runArmSummary(
  run: VisionRegionBenchmarkCaseRun,
  arm: VisionRegionArmKey,
): VisionRegionBenchmarkRunArmSummary {
  const proposals = armProposals(run, arm);
  const stageRuns = stageRunsForArm(run, arm);
  const proposalGeometries = proposals.map((proposal) => proposal.geometry);
  const totalWall = stageRuns
    .map((stage) => stage.timing.totalWallMs)
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);
  return {
    requestCount: stageRuns.length,
    proposalCount: proposals.length,
    usefulProposalCount: proposals.filter((proposal) => boxWithinBounds(proposal.geometry)).length,
    unionCoverage: unionCoverage(proposalGeometries),
    peakProcessTreeRssBytes:
      stageRuns.reduce<number | null>(
        (peak, stage) => Math.max(peak ?? 0, stage.resources.peakProcessTreeRssBytes ?? 0) || null,
        null,
      ) ?? null,
    peakWorkspaceBytes: Math.max(
      0,
      ...stageRuns.map((stage) => stage.resources.workspacePeakBytes),
    ),
    totalWallMs: stageRuns.every((stage) => stage.timing.totalWallMs !== null) ? totalWall : null,
    cleanupCompleted: stageRuns.every((stage) => stage.cleanupCompleted),
    cleanupFailureCount: stageRuns.filter((stage) => !stage.cleanupCompleted).length,
    forcedTerminationCount: stageRuns.filter((stage) => stage.forcedTermination).length,
    malformedStageCount: stageRuns.filter(
      (stage) =>
        !stage.schemaValid ||
        !stage.schemaSuccess ||
        !stage.geometrySuccess ||
        stage.prohibitedClaimDetected,
    ).length,
    processTreeReleaseFailureCount: stageRuns.filter(
      (stage) => stage.process.processTreeReleasedAfterTermination !== true,
    ).length,
    portReleaseFailureCount: stageRuns.filter((stage) => stage.process.portReleased !== true)
      .length,
    sampleFailureCount: stageRuns.reduce(
      (sum, stage) => sum + stage.resources.sampleFailureCount,
      0,
    ),
    stdoutTruncationCount: stageRuns.filter((stage) => stage.process.stdoutTruncated).length,
    stderrTruncationCount: stageRuns.filter((stage) => stage.process.stderrTruncated).length,
    prohibitedClaimCount: stageRuns.filter((stage) => stage.prohibitedClaimDetected).length,
    unionCapPassed: unionCoverage(proposalGeometries) <= VISION_REGION_GATE_CONSTANTS.UNION_CAP,
    countCapPassed: proposals.length <= VISION_REGION_GATE_CONSTANTS.COUNT_CAP,
  };
}

function proposalScore(args: { geometry: EvalNormalizedBox; targetGeometry: EvalNormalizedBox }) {
  const intersection = normalizedIntersectionArea(args.geometry, args.targetGeometry);
  if (intersection <= 0) return -1;
  const proposalArea = area(args.geometry);
  const targetArea = area(args.targetGeometry);
  const iot = intersection / targetArea;
  const iop = intersection / proposalArea;
  const union = proposalArea + targetArea - intersection;
  const iou = union <= 0 ? 0 : intersection / union;
  return iot * 10 + iop * 5 + iou * 3 - proposalArea * 0.25;
}

function bestTargetMetrics(args: {
  target: TargetSpec;
  proposals: readonly ArmProposalCandidate[];
  armSummary: VisionRegionBenchmarkRunArmSummary;
}): VisionRegionBenchmarkRunTargetMetrics {
  let best: ArmProposalCandidate | null = null;
  let bestScore = -1;
  for (const proposal of args.proposals) {
    const score = proposalScore({
      geometry: proposal.geometry,
      targetGeometry: args.target.targetGeometry,
    });
    if (score > bestScore) {
      best = proposal;
      bestScore = score;
    }
  }

  if (!best) {
    return {
      proposalId: null,
      hit: false,
      intersectionOverTruth: 0,
      intersectionOverProposal: 0,
      iou: 0,
      proposalAreaRatio: null,
      apparentOrientation: null,
      reasonCodes: [],
      blockedByUnionCap: !args.armSummary.unionCapPassed,
      blockedByCountCap: !args.armSummary.countCapPassed,
      outOfBounds: false,
    };
  }

  const proposalArea = area(best.geometry);
  const targetArea = area(args.target.targetGeometry);
  const intersection = normalizedIntersectionArea(best.geometry, args.target.targetGeometry);
  const iot = targetArea === 0 ? 0 : intersection / targetArea;
  const iop = proposalArea === 0 ? 0 : intersection / proposalArea;
  const union = proposalArea + targetArea - intersection;
  const iou = union <= 0 ? 0 : intersection / union;
  const outOfBounds = !boxWithinBounds(best.geometry);
  const hit =
    !outOfBounds &&
    args.armSummary.unionCapPassed &&
    args.armSummary.countCapPassed &&
    iot >= VISION_REGION_GATE_CONSTANTS.IOT_MIN &&
    iop >= VISION_REGION_GATE_CONSTANTS.IOP_MIN &&
    proposalArea <= VISION_REGION_GATE_CONSTANTS.AREA_CAP;

  return {
    proposalId: best.proposalId,
    hit,
    intersectionOverTruth: roundMetric(iot),
    intersectionOverProposal: roundMetric(iop),
    iou: roundMetric(iou),
    proposalAreaRatio: roundMetric(proposalArea),
    apparentOrientation: best.apparentOrientation,
    reasonCodes: [...best.reasonCodes],
    blockedByUnionCap: !args.armSummary.unionCapPassed,
    blockedByCountCap: !args.armSummary.countCapPassed,
    outOfBounds,
  };
}

function exactOrientationMatch(
  expected: Exclude<EvalTextOrientation, "not-applicable">,
  actual: ApparentOrientation | null,
) {
  if (actual === null) return false;
  switch (expected) {
    case "horizontal":
      return actual === "horizontal";
    case "vertical-clockwise":
      return actual === "vertical-clockwise";
    case "vertical-counterclockwise":
      return actual === "vertical-counterclockwise";
    case "rotated-180":
      return actual === "rotated-180";
    case "mixed":
      return null;
    case "unknown":
    case "vertical-stacked":
      return false;
  }
}

function buildRunReport(
  caseRun: VisionRegionBenchmarkCaseRun,
  targets: readonly TargetSpec[],
): VisionRegionBenchmarkRun {
  const armSummaries = {
    coarseOnly: runArmSummary(caseRun, "coarseOnly"),
    coarsePlusRefinement: runArmSummary(caseRun, "coarsePlusRefinement"),
  } satisfies Record<VisionRegionArmKey, VisionRegionBenchmarkRunArmSummary>;

  const targetMatches = targets
    .filter((target) => target.caseId === caseRun.caseId)
    .map((target) => ({
      targetId: target.targetId,
      field: target.field,
      annotationConfidence: target.annotationConfidence,
      arms: {
        coarseOnly: bestTargetMetrics({
          target,
          proposals: armProposals(caseRun, "coarseOnly"),
          armSummary: armSummaries.coarseOnly,
        }),
        coarsePlusRefinement: bestTargetMetrics({
          target,
          proposals: armProposals(caseRun, "coarsePlusRefinement"),
          armSummary: armSummaries.coarsePlusRefinement,
        }),
      },
    }));

  return {
    caseId: caseRun.caseId,
    repetition: caseRun.repetition,
    coarseStage: {
      ...caseRun.coarseStage,
      workspaceRef: workspaceToken(caseRun.coarseStage.workspaceRef),
    },
    refinementStages: caseRun.refinementStages.map((stage) => ({
      coarseProposalId: stage.coarseProposalId,
      cropNormalizedBox: stage.cropNormalizedBox,
      stageRun: {
        ...stage.stageRun,
        workspaceRef: workspaceToken(stage.stageRun.workspaceRef),
      },
      proposal: stage.proposal,
    })),
    armSummaries,
    targetMatches,
  };
}

function summarizeTargetArm(
  target: TargetSpec,
  arm: VisionRegionArmKey,
  caseRepetitions: number,
  runs: readonly VisionRegionBenchmarkRun[],
): VisionRegionBenchmarkTargetArmSummary {
  const byRep = new Map<number, VisionRegionBenchmarkRunTargetMetrics>();
  for (const run of runs) {
    const match = run.targetMatches.find((entry) => entry.targetId === target.targetId);
    if (match) byRep.set(run.repetition, match.arms[arm]);
  }
  const metrics = Array.from(
    { length: caseRepetitions },
    (_, index) => byRep.get(index + 1) ?? null,
  );
  const hitByRep = metrics.map((metric) => metric?.hit ?? false);
  const reasonCodeSetsByRep = metrics.map((metric) =>
    [...new Set(metric?.reasonCodes ?? [])].sort(),
  );
  const pairwiseJaccard: number[] = [];
  for (let index = 0; index < reasonCodeSetsByRep.length; index += 1) {
    for (let inner = index + 1; inner < reasonCodeSetsByRep.length; inner += 1) {
      pairwiseJaccard.push(jaccardIndex(reasonCodeSetsByRep[index]!, reasonCodeSetsByRep[inner]!));
    }
  }
  const exactOrientationAgreement =
    target.expectedOrientation === "mixed"
      ? null
      : metrics.every((metric) => {
          if (!metric?.hit) return false;
          return (
            exactOrientationMatch(target.expectedOrientation, metric.apparentOrientation) === true
          );
        });

  return {
    hitByRep,
    anyRunHit: hitByRep.some(Boolean),
    consistentHit: hitByRep.length === caseRepetitions && hitByRep.every(Boolean),
    perRunBestIoU: metrics.map((metric) => metric?.iou ?? 0),
    perRunIntersectionOverTruth: metrics.map((metric) => metric?.intersectionOverTruth ?? 0),
    perRunIntersectionOverProposal: metrics.map((metric) => metric?.intersectionOverProposal ?? 0),
    iouDistribution: distribution(metrics.map((metric) => metric?.iou ?? 0)),
    intersectionOverTruthDistribution: distribution(
      metrics.map((metric) => metric?.intersectionOverTruth ?? 0),
    ),
    intersectionOverProposalDistribution: distribution(
      metrics.map((metric) => metric?.intersectionOverProposal ?? 0),
    ),
    proposalAreaDistribution: distribution(
      metrics.flatMap((metric) =>
        metric && metric.proposalAreaRatio !== null ? [metric.proposalAreaRatio] : [],
      ),
    ),
    bestProposalIds: metrics.map((metric) => metric?.proposalId ?? null),
    apparentOrientations: metrics.map((metric) => metric?.apparentOrientation ?? null),
    exactOrientationAgreement,
    reasonCodeSetsByRep,
    reasonCodeExactAgreement:
      reasonCodeSetsByRep.length <= 1 ||
      reasonCodeSetsByRep.every(
        (entry) => JSON.stringify(entry) === JSON.stringify(reasonCodeSetsByRep[0]),
      ),
    reasonCodeMeanJaccard:
      pairwiseJaccard.length === 0 ? null : roundMetric(mean(pairwiseJaccard)!),
  };
}

function buildTargetSummaries(
  targets: readonly TargetSpec[],
  runs: readonly VisionRegionBenchmarkRun[],
  caseRepetitions: number,
): VisionRegionBenchmarkTargetSummary[] {
  return targets.map((target) => ({
    targetId: target.targetId,
    caseId: target.caseId,
    field: target.field,
    imagePath: target.imagePath,
    challengeSlices: [...target.challengeSlices],
    expectedOrientation: target.expectedOrientation,
    annotationConfidence: target.annotationConfidence,
    humanReadable: target.humanReadable,
    adjudicationNotes: target.adjudicationNotes,
    targetGeometry: target.targetGeometry,
    arms: {
      coarseOnly: summarizeTargetArm(
        target,
        "coarseOnly",
        caseRepetitions,
        runs.filter((run) => run.caseId === target.caseId),
      ),
      coarsePlusRefinement: summarizeTargetArm(
        target,
        "coarsePlusRefinement",
        caseRepetitions,
        runs.filter((run) => run.caseId === target.caseId),
      ),
    },
  }));
}

function confidenceBreakdown(
  targets: readonly VisionRegionBenchmarkTargetSummary[],
  arm: VisionRegionArmKey,
  confidence: EvalAnnotationConfidence,
): VisionRegionBenchmarkConfidenceBreakdown {
  const scoped = targets.filter((target) => target.annotationConfidence === confidence);
  const hitIous = scoped
    .flatMap((target) =>
      target.arms[arm].hitByRep.map((hit, index) =>
        hit ? target.arms[arm].perRunBestIoU[index]! : null,
      ),
    )
    .filter((value): value is number => value !== null);
  return {
    denominator: scoped.length,
    consistentHitRecall: rate(
      scoped.filter((target) => target.arms[arm].consistentHit).length,
      scoped.length,
    ),
    anyRunRecall: rate(scoped.filter((target) => target.arms[arm].anyRunHit).length, scoped.length),
    iouOnHits: distribution(hitIous),
  };
}

function buildArmAggregate(
  arm: VisionRegionArmKey,
  targets: readonly VisionRegionBenchmarkTargetSummary[],
  runs: readonly VisionRegionBenchmarkRun[],
): VisionRegionBenchmarkArmAggregate {
  const targetArmSummaries = targets.map((target) => target.arms[arm]);
  const hitMetrics = runs.flatMap((run) =>
    run.targetMatches.map((match) => match.arms[arm]).filter((metric) => metric.hit),
  );
  const runArmSummaries = runs.map((run) => run.armSummaries[arm]);
  const consistentHitRecall = rate(
    targetArmSummaries.filter((summary) => summary.consistentHit).length,
    targetArmSummaries.length,
  );
  const anyRunRecall = rate(
    targetArmSummaries.filter((summary) => summary.anyRunHit).length,
    targetArmSummaries.length,
  );

  const lifecycleFailures =
    runArmSummaries.some((summary) => summary.cleanupFailureCount > 0) ||
    runArmSummaries.some((summary) => summary.forcedTerminationCount > 0) ||
    runArmSummaries.some((summary) => summary.processTreeReleaseFailureCount > 0) ||
    runArmSummaries.some((summary) => summary.portReleaseFailureCount > 0) ||
    runArmSummaries.some((summary) => summary.sampleFailureCount > 0) ||
    runArmSummaries.some((summary) => summary.stdoutTruncationCount > 0) ||
    runArmSummaries.some((summary) => summary.stderrTruncationCount > 0);
  const malformed = runArmSummaries.some((summary) => summary.malformedStageCount > 0);

  let decision: VisionRegionBenchmarkDecision;
  const decisionRationale: string[] = [];
  if (lifecycleFailures) {
    decision = "RESOURCE LIFECYCLE NOT BOUNDED";
    decisionRationale.push(
      "At least one arm stage failed cleanup, release, sampling, or log bounds.",
    );
  } else if (malformed) {
    decision = "MIXED RESULT";
    decisionRationale.push(
      "At least one arm stage failed schema or prohibited-language validation.",
    );
  } else if (consistentHitRecall >= VISION_REGION_GATE_CONSTANTS.RECALL_FLOOR) {
    decision = "VISION REGION SIGNAL SUPPORTED";
    decisionRationale.push(
      `consistentHitRecall=${consistentHitRecall} meets RECALL_FLOOR=${VISION_REGION_GATE_CONSTANTS.RECALL_FLOOR}.`,
    );
  } else if (anyRunRecall < VISION_REGION_GATE_CONSTANTS.RECALL_FLOOR / 2) {
    decision = "VISION REGION SIGNAL NOT SUPPORTED";
    decisionRationale.push(
      `anyRunRecall=${anyRunRecall} stayed below ${(VISION_REGION_GATE_CONSTANTS.RECALL_FLOOR / 2).toFixed(2)}.`,
    );
  } else {
    decision = "MIXED RESULT";
    decisionRationale.push(
      "Localized signal was partial or inconsistent across the required repetitions.",
    );
  }

  return {
    arm,
    decision,
    decisionRationale,
    consistentHitRecall,
    anyRunRecall,
    geometryOnHits: {
      iou: distribution(hitMetrics.map((metric) => metric.iou)),
      intersectionOverTruth: distribution(hitMetrics.map((metric) => metric.intersectionOverTruth)),
      proposalAreaRatio: distribution(
        hitMetrics.flatMap((metric) =>
          metric.proposalAreaRatio === null ? [] : [metric.proposalAreaRatio],
        ),
      ),
    },
    proposalCount: distribution(runArmSummaries.map((summary) => summary.proposalCount / 12)),
    unionCoverage: distribution(runArmSummaries.map((summary) => summary.unionCoverage)),
    requestCount: runArmSummaries.reduce((sum, summary) => sum + summary.requestCount, 0),
    wallTimeMs: roundMetric(
      runArmSummaries
        .map((summary) => summary.totalWallMs ?? 0)
        .reduce((sum, value) => sum + value, 0),
    ),
    peakProcessTreeRssBytes:
      runArmSummaries.reduce<number | null>(
        (peak, summary) => Math.max(peak ?? 0, summary.peakProcessTreeRssBytes ?? 0) || null,
        null,
      ) ?? null,
    peakWorkspaceBytes: Math.max(
      0,
      ...runArmSummaries.map((summary) => summary.peakWorkspaceBytes),
    ),
    cleanupFailureCount: runArmSummaries.reduce(
      (sum, summary) => sum + summary.cleanupFailureCount,
      0,
    ),
    forcedTerminationCount: runArmSummaries.reduce(
      (sum, summary) => sum + summary.forcedTerminationCount,
      0,
    ),
    malformedStageCount: runArmSummaries.reduce(
      (sum, summary) => sum + summary.malformedStageCount,
      0,
    ),
    confidence: {
      high: confidenceBreakdown(targets, arm, "high"),
      medium: confidenceBreakdown(targets, arm, "medium"),
    },
  };
}

function buildOrientationSummary(
  targets: readonly VisionRegionBenchmarkTargetSummary[],
  arm: VisionRegionArmKey,
): VisionRegionBenchmarkOrientationSummary {
  const horizontal = targets.filter((target) => target.expectedOrientation === "horizontal");
  const nonHorizontal = targets.filter((target) =>
    ["vertical-clockwise", "vertical-counterclockwise"].includes(target.expectedOrientation),
  );
  const mixed = targets.filter((target) => target.expectedOrientation === "mixed");
  return {
    horizontal: {
      denominator: horizontal.length,
      exactAgreementRate: rate(
        horizontal.filter((target) => target.arms[arm].exactOrientationAgreement === true).length,
        horizontal.length,
      ),
      exactAgreementNumerator: horizontal.filter(
        (target) => target.arms[arm].exactOrientationAgreement === true,
      ).length,
      rationale: null,
      nonHorizontalDetectionRate: null,
    },
    nonHorizontal: {
      denominator: nonHorizontal.length,
      exactAgreementRate: rate(
        nonHorizontal.filter((target) => target.arms[arm].exactOrientationAgreement === true)
          .length,
        nonHorizontal.length,
      ),
      exactAgreementNumerator: nonHorizontal.filter(
        (target) => target.arms[arm].exactOrientationAgreement === true,
      ).length,
      rationale: null,
      nonHorizontalDetectionRate: null,
    },
    mixed: {
      denominator: mixed.length,
      exactAgreementRate: null,
      exactAgreementNumerator: null,
      rationale:
        "The observer vocabulary cannot emit mixed, so exact mixed agreement is unsupported.",
      nonHorizontalDetectionRate:
        mixed.length === 0
          ? null
          : rate(
              mixed.filter((target) =>
                target.arms[arm].apparentOrientations.every(
                  (orientation) => orientation !== null && orientation !== "horizontal",
                ),
              ).length,
              mixed.length,
            ),
    },
  };
}

function buildReasonCodeSummary(
  targets: readonly VisionRegionBenchmarkTargetSummary[],
): VisionRegionBenchmarkReasonCodeSummary {
  const emittedCounts = Object.fromEntries(
    OBSERVER_REASON_CODES.map((code) => [code, 0]),
  ) as Record<ReasonCode, number>;
  const perTarget: VisionRegionBenchmarkReasonCodeTargetSummary[] = [];
  const challengeSliceCrossReference: Partial<Record<ReasonCode, string[]>> = {};

  for (const arm of VISION_REGION_ARM_KEYS) {
    for (const target of targets) {
      const summary = target.arms[arm];
      perTarget.push({
        targetId: target.targetId,
        arm,
        perRunSets: summary.reasonCodeSetsByRep,
        exactAgreement: summary.reasonCodeExactAgreement,
        meanJaccard: summary.reasonCodeMeanJaccard,
        challengeSlices: [...target.challengeSlices],
      });
      for (const codes of summary.reasonCodeSetsByRep) {
        for (const code of codes as ReasonCode[]) {
          emittedCounts[code] += 1;
          challengeSliceCrossReference[code] = [
            ...new Set([...(challengeSliceCrossReference[code] ?? []), ...target.challengeSlices]),
          ].sort();
        }
      }
    }
  }

  return {
    emittedCounts,
    perTarget,
    precision: {
      value: null,
      rationale: "No governed per-region reason-code truth exists for this corpus.",
    },
    recall: {
      value: null,
      rationale: "No governed per-region reason-code truth exists for this corpus.",
    },
    unsupportedCorrectnessClaims: OBSERVER_REASON_CODES,
    challengeSliceCrossReference,
  };
}

function buildClaimSemantics(targetCount: number): VisionRegionBenchmarkClaimSemantics {
  return {
    regionRecall: {
      supported: true,
      denominator: targetCount,
      note: "Recall is computed over the 23 governed present-field regions only, using consistent-hit evidence.",
    },
    geometryOnGovernedHits: {
      supported: true,
      denominator: targetCount,
      note: "Geometry summaries are descriptive over governed hits only; they do not score unannotated text proposals as errors.",
    },
    textRegionPrecision: {
      value: null,
      rationale:
        "The field-agnostic observer may legitimately propose unannotated text, so text-region precision is unsupported.",
    },
    falseRegionRate: {
      value: null,
      rationale:
        "Unannotated text proposals are not governed errors in this corpus, so false-region rate is unsupported.",
    },
    absentFieldObserverFalsePositiveRate: {
      value: null,
      rationale:
        "The field-agnostic observer is not truth-labeled for absent-field false positives, so the metric is unsupported.",
    },
  };
}

function buildSupportGates(args: {
  benchmarkCases: readonly VisionRegionBenchmarkCase[];
  caseRepetitions: number;
  runs: readonly VisionRegionBenchmarkRun[];
  runtime: VisionRegionBenchmarkRuntimeSummary;
  statelessObserverBoundary: VisionRegionBenchmarkEvidenceSummary;
  resourceLifecycle: VisionRegionBenchmarkEvidenceSummary;
}): VisionRegionBenchmarkGate[] {
  const expectedRunCount = args.benchmarkCases.length * args.caseRepetitions;
  const cleanupFailures = args.runs.flatMap((run) =>
    VISION_REGION_ARM_KEYS.map((arm) => run.armSummaries[arm].cleanupFailureCount),
  );
  const processTreeFailures = args.runs.flatMap((run) =>
    VISION_REGION_ARM_KEYS.map((arm) => run.armSummaries[arm].processTreeReleaseFailureCount),
  );
  const forcedTerminations = args.runs.flatMap((run) =>
    VISION_REGION_ARM_KEYS.map((arm) => run.armSummaries[arm].forcedTerminationCount),
  );
  return [
    {
      id: "governed-corpus",
      requirement: "Exactly the governed 13-case PR #89 corpus must be scored.",
      passed: args.benchmarkCases.length === VISION_REGION_BENCHMARK_EXPECTED_CASE_COUNT,
      evidence: `benchmarkCaseCount=${args.benchmarkCases.length}`,
    },
    {
      id: "full-coarse-run-coverage",
      requirement:
        "All 13 cases and all required repetitions must complete before support is allowed.",
      passed: args.runs.length === expectedRunCount,
      evidence: `completedCoarseRunCount=${args.runs.length}/${expectedRunCount}`,
    },
    {
      id: "real-runtime-only",
      requirement: "Only validated real-local-vlm provenance may unlock a support conclusion.",
      passed: args.runtime.runtimeKind === "real-local-vlm" && args.runtime.realRuntimeConfigured,
      evidence: `runtimeKind=${args.runtime.runtimeKind ?? "null"}; realRuntimeConfigured=${String(args.runtime.realRuntimeConfigured)}`,
    },
    {
      id: "stateless-boundary",
      requirement:
        "STATELESS OBSERVER BOUNDARY SUPPORTED must be established on real-local-vlm evidence.",
      passed: args.statelessObserverBoundary.decision === "STATELESS OBSERVER BOUNDARY SUPPORTED",
      evidence: `decision=${args.statelessObserverBoundary.decision ?? "null"}; contaminationCount=${args.statelessObserverBoundary.contaminationCount}`,
    },
    {
      id: "resource-boundary",
      requirement: "RESOURCE LIFECYCLE BOUNDED must be established without forced termination.",
      passed: args.resourceLifecycle.decision === "RESOURCE LIFECYCLE BOUNDED",
      evidence: `decision=${args.resourceLifecycle.decision ?? "null"}; forcedTerminationCount=${args.resourceLifecycle.forcedTerminationCount}`,
    },
    {
      id: "clean-stage-lifecycle",
      requirement:
        "Every scored stage must confirm cleanup, process-tree release, port release, bounded logs, and no forced termination.",
      passed:
        cleanupFailures.every((count) => count === 0) &&
        processTreeFailures.every((count) => count === 0) &&
        forcedTerminations.every((count) => count === 0),
      evidence: `cleanupFailureCount=${cleanupFailures.reduce((sum, value) => sum + value, 0)}; processTreeReleaseFailureCount=${processTreeFailures.reduce((sum, value) => sum + value, 0)}; forcedTerminationCount=${forcedTerminations.reduce((sum, value) => sum + value, 0)}`,
    },
  ];
}

function buildCaseAccounting(
  benchmarkCases: readonly VisionRegionBenchmarkCase[],
  caseRepetitions: number,
  runs: readonly VisionRegionBenchmarkRun[],
): VisionRegionBenchmarkCaseAccounting {
  const completedRunRefs = new Set(runs.map((run) => `${run.caseId}:r${run.repetition}`));
  const missingCoarseRuns = benchmarkCases.flatMap((benchmarkCase) =>
    Array.from(
      { length: caseRepetitions },
      (_, index) => `${benchmarkCase.evalCase.caseId}:r${index + 1}`,
    ).filter((ref) => !completedRunRefs.has(ref)),
  );
  const malformedStageRunCount = runs.reduce(
    (sum, run) =>
      sum +
      Number(
        !run.coarseStage.schemaValid ||
          !run.coarseStage.schemaSuccess ||
          !run.coarseStage.geometrySuccess,
      ) +
      run.refinementStages.filter(
        (stage) =>
          !stage.stageRun.schemaValid ||
          !stage.stageRun.schemaSuccess ||
          !stage.stageRun.geometrySuccess,
      ).length,
    0,
  );
  return {
    expectedCaseCount: VISION_REGION_BENCHMARK_EXPECTED_CASE_COUNT,
    completedCaseCount: new Set(runs.map((run) => run.caseId)).size,
    caseRepetitions,
    expectedCoarseRunCount: benchmarkCases.length * caseRepetitions,
    completedCoarseRunCount: runs.length,
    missingCoarseRuns,
    malformedStageRunCount,
  };
}

function buildCorpusSummary(
  targets: readonly VisionRegionBenchmarkTargetSummary[],
): VisionRegionBenchmarkCorpusSummary {
  return {
    targetCount: targets.length,
    fieldDenominators: {
      brand: targets.filter((target) => target.field === "brand").length,
      alcohol: targets.filter((target) => target.field === "alcohol").length,
    },
    orientationDenominators: {
      horizontal: targets.filter((target) => target.expectedOrientation === "horizontal").length,
      verticalClockwise: targets.filter(
        (target) => target.expectedOrientation === "vertical-clockwise",
      ).length,
      verticalCounterclockwise: targets.filter(
        (target) => target.expectedOrientation === "vertical-counterclockwise",
      ).length,
      mixed: targets.filter((target) => target.expectedOrientation === "mixed").length,
    },
    annotationConfidenceDenominators: {
      high: targets.filter((target) => target.annotationConfidence === "high").length,
      medium: targets.filter((target) => target.annotationConfidence === "medium").length,
    },
  };
}

function buildRefinementBenefit(args: {
  coarseOnly: VisionRegionBenchmarkArmAggregate;
  coarsePlusRefinement: VisionRegionBenchmarkArmAggregate;
}): VisionRegionBenchmarkRefinementBenefit {
  const improvementMargin = roundMetric(
    args.coarsePlusRefinement.consistentHitRecall - args.coarseOnly.consistentHitRecall,
  );
  const incrementalRequestCount =
    args.coarsePlusRefinement.requestCount - args.coarseOnly.requestCount;
  const incrementalPeakProcessTreeRssBytes =
    args.coarsePlusRefinement.peakProcessTreeRssBytes === null ||
    args.coarseOnly.peakProcessTreeRssBytes === null
      ? null
      : Math.max(
          0,
          args.coarsePlusRefinement.peakProcessTreeRssBytes -
            args.coarseOnly.peakProcessTreeRssBytes,
        );
  const incrementalPeakWorkspaceBytes = Math.max(
    0,
    args.coarsePlusRefinement.peakWorkspaceBytes - args.coarseOnly.peakWorkspaceBytes,
  );
  let decision: VisionRegionBenchmarkDecision;
  const rationale = [
    `improvementMargin=${improvementMargin}`,
    `incrementalRequestCount=${incrementalRequestCount}`,
  ];
  if (
    args.coarsePlusRefinement.decision === "VISION REGION SIGNAL SUPPORTED" &&
    improvementMargin >= VISION_REGION_GATE_CONSTANTS.REFINEMENT_IMPROVEMENT_MARGIN
  ) {
    decision = "VISION REGION SIGNAL SUPPORTED";
    rationale.push(
      `improvementMargin met the pre-registered threshold ${VISION_REGION_GATE_CONSTANTS.REFINEMENT_IMPROVEMENT_MARGIN}.`,
    );
  } else if (improvementMargin <= 0) {
    decision = "VISION REGION SIGNAL NOT SUPPORTED";
    rationale.push("Refinement did not improve consistent-hit recall over coarse-only.");
  } else {
    decision = "MIXED RESULT";
    rationale.push(
      "Refinement improved signal but did not meet the pre-registered support margin.",
    );
  }
  return {
    decision,
    improvementMargin,
    incrementalRequestCount,
    incrementalPeakProcessTreeRssBytes,
    incrementalPeakWorkspaceBytes,
    rationale,
  };
}

function decideVisionRegionBenchmark(args: {
  runtime: VisionRegionBenchmarkRuntimeSummary;
  supportGates: readonly VisionRegionBenchmarkGate[];
  statelessObserverBoundary: VisionRegionBenchmarkEvidenceSummary;
  resourceLifecycle: VisionRegionBenchmarkEvidenceSummary;
  coarseOnly: VisionRegionBenchmarkArmAggregate;
  coarsePlusRefinement: VisionRegionBenchmarkArmAggregate;
}): { decision: VisionRegionBenchmarkDecision; rationale: string[] } {
  const rationale: string[] = [];
  if (args.statelessObserverBoundary.decision === "CONTEXT CONTAMINATION DETECTED") {
    rationale.push("The prerequisite contamination harness reported prior-run leakage.");
    return { decision: "CONTEXT CONTAMINATION DETECTED", rationale };
  }
  if (
    args.resourceLifecycle.decision === "RESOURCE LIFECYCLE NOT BOUNDED" ||
    args.coarseOnly.decision === "RESOURCE LIFECYCLE NOT BOUNDED" ||
    args.coarsePlusRefinement.decision === "RESOURCE LIFECYCLE NOT BOUNDED"
  ) {
    rationale.push("Lifecycle or process-tree evidence was not bounded for every scored stage.");
    return { decision: "RESOURCE LIFECYCLE NOT BOUNDED", rationale };
  }
  if (!args.runtime.realRuntimeConfigured || args.runtime.runtimeKind !== "real-local-vlm") {
    rationale.push("Validated real-local-vlm runtime provenance is unavailable.");
    return { decision: "INSUFFICIENT EVIDENCE", rationale };
  }
  if (args.supportGates.some((gate) => !gate.passed)) {
    rationale.push("At least one prerequisite support gate failed closed.");
    return { decision: "INSUFFICIENT EVIDENCE", rationale };
  }
  if (
    args.coarseOnly.decision === "VISION REGION SIGNAL SUPPORTED" ||
    args.coarsePlusRefinement.decision === "VISION REGION SIGNAL SUPPORTED"
  ) {
    rationale.push(
      `coarseOnly=${args.coarseOnly.decision}; coarsePlusRefinement=${args.coarsePlusRefinement.decision}.`,
    );
    return { decision: "VISION REGION SIGNAL SUPPORTED", rationale };
  }
  if (
    args.coarseOnly.decision === "VISION REGION SIGNAL NOT SUPPORTED" &&
    args.coarsePlusRefinement.decision === "VISION REGION SIGNAL NOT SUPPORTED"
  ) {
    rationale.push("Neither arm achieved the pre-registered consistent-hit recall floor.");
    return { decision: "VISION REGION SIGNAL NOT SUPPORTED", rationale };
  }
  rationale.push("The available bounded evidence was partial or internally mixed.");
  return { decision: "MIXED RESULT", rationale };
}

function buildBoundaryProof(): VisionRegionBenchmarkBoundaryProof {
  return {
    benchmarkModules: [
      "src/fixtures/eval/vision-region-benchmark.ts",
      "src/fixtures/eval/vision-region-benchmark.generation.ts",
      "src/fixtures/eval/vision-region-refinement-derivative.ts",
      "scripts/eval/run-vision-region-benchmark.ts",
    ],
    guardTests: [
      "src/fixtures/eval/vision-region-benchmark.test.ts",
      "src/fixtures/eval/vision-region-benchmark.integration.test.ts",
      "src/fixtures/truth-boundary.test.ts",
      "src/fixtures/eval/vision-observer/local-vlm/local-vlm-boundary.test.ts",
    ],
    productionBehaviorChangeAuthorized: false,
    proofNote:
      "The governed benchmark is confined to src/fixtures/eval and scripts/eval. No production OCR routing, APIs, UI, persistence, onboarding, parser behavior, or PR #89 benchmark authority is modified by this Slice 3 evaluation.",
  };
}

export function validateVisionRegionBenchmarkReport(
  input: unknown,
):
  | { ok: true; value: VisionRegionBenchmarkReport }
  | { ok: false; error: { message: string; issues: readonly string[] } } {
  const schema = z
    .object({
      schemaVersion: z.literal(VISION_REGION_BENCHMARK_REPORT_SCHEMA_VERSION),
      generatedAt: z.string().min(1),
      gitCommit: z.string().min(1),
      gateConstants: z.object({}).passthrough(),
      runtime: z.object({}).passthrough(),
      claimSemantics: z.object({}).passthrough(),
      stabilitySemantics: z.string().min(1),
      statelessObserverBoundary: z.object({}).passthrough(),
      resourceLifecycle: z.object({}).passthrough(),
      supportGates: z.array(
        z
          .object({
            id: z.string().min(1),
            requirement: z.string().min(1),
            passed: z.boolean(),
            evidence: z.string().min(1),
          })
          .strict(),
      ),
      caseAccounting: z.object({}).passthrough(),
      corpus: z.object({}).passthrough(),
      unsupportedMetrics: z.object({
        mixedOrientationExactAgreement: unsupportedMetricSchema,
      }),
      runs: z.array(
        z
          .object({
            caseId: z.string().min(1),
            repetition: z.number().int().positive(),
            coarseStage: stageRunSchema,
            refinementStages: z.array(
              z
                .object({
                  coarseProposalId: z.string().min(1),
                  cropNormalizedBox: normalizedBoxSchema.nullable(),
                  stageRun: stageRunSchema,
                  proposal: z
                    .object({
                      proposalId: z.string().min(1),
                      observationId: z.string().min(1),
                      refinementGridRange: z.string().min(1),
                      apparentOrientation: z.enum([
                        "horizontal",
                        "vertical-clockwise",
                        "vertical-counterclockwise",
                        "rotated-180",
                        "uncertain",
                      ]),
                      visibility: z.enum(["full", "partial", "obscured"]),
                      reasonCodes: z.array(z.enum(OBSERVER_REASON_CODES)),
                      refinedGeometry: normalizedBoxSchema,
                    })
                    .strict()
                    .nullable(),
                })
                .strict(),
            ),
            armSummaries: z.object({}).passthrough(),
            targetMatches: z.array(
              z
                .object({
                  targetId: z.string().min(1),
                  field: z.enum(["brand", "alcohol"]),
                  annotationConfidence: z.enum(["high", "medium"]),
                  arms: z
                    .object({
                      coarseOnly: runTargetMetricsSchema,
                      coarsePlusRefinement: runTargetMetricsSchema,
                    })
                    .strict(),
                })
                .strict(),
            ),
          })
          .strict(),
      ),
      targets: z.array(
        z
          .object({
            targetId: z.string().min(1),
            caseId: z.string().min(1),
            field: z.enum(["brand", "alcohol"]),
            imagePath: z.string().min(1),
            challengeSlices: z.array(z.string().min(1)),
            expectedOrientation: z.string().min(1),
            annotationConfidence: z.enum(["high", "medium"]),
            humanReadable: z.boolean(),
            adjudicationNotes: z.string().min(1),
            targetGeometry: normalizedBoxSchema,
            arms: z.object({}).passthrough(),
          })
          .strict(),
      ),
      orientation: z.object({}).passthrough(),
      reasonCodes: z.object({}).passthrough(),
      arms: z.object({}).passthrough(),
      humanAdjudicatedUpperBound: z.object({}).passthrough(),
      decision: z.enum(VISION_REGION_BENCHMARK_DECISIONS),
      decisionRationale: z.array(z.string().min(1)),
      limitations: z.array(z.string().min(1)),
      productionBoundaryProof: z.object({}).passthrough(),
    })
    .strict();

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        message: "Vision region benchmark report is invalid.",
        issues: parsed.error.issues.map((issue) => {
          const path = issue.path.length === 0 ? "" : `${issue.path.join(".")}: `;
          return `${path}${issue.message}`;
        }),
      },
    };
  }
  return { ok: true, value: parsed.data as unknown as VisionRegionBenchmarkReport };
}

export function loadVisionRegionBenchmarkCases(
  manifest: LoadedEvalManifest = loadEvalManifest(),
): VisionRegionBenchmarkCase[] {
  const cases = loadBenchmarkCases(manifest);
  validateBenchmarkAnnotations(cases);
  return cases;
}

export function buildVisionRegionBenchmarkReport(
  args: BuildVisionRegionBenchmarkReportArgs,
): VisionRegionBenchmarkReport {
  const benchmarkCases = [...args.benchmarkCases];
  const targets = buildTargetSpecs(benchmarkCases);
  const runs = args.caseRuns.map((run) => buildRunReport(run, targets));
  const targetSummaries = buildTargetSummaries(targets, runs, args.caseRepetitions);
  const statelessObserverBoundary = summarizeEvidence(args.statelessObserverBoundary);
  const resourceLifecycle = summarizeEvidence(args.resourceLifecycle);
  const coarseOnly = buildArmAggregate("coarseOnly", targetSummaries, runs);
  const coarsePlusRefinement = buildArmAggregate("coarsePlusRefinement", targetSummaries, runs);
  const supportGates = buildSupportGates({
    benchmarkCases,
    caseRepetitions: args.caseRepetitions,
    runs,
    runtime: args.runtime,
    statelessObserverBoundary,
    resourceLifecycle,
  });
  const decisionResult = decideVisionRegionBenchmark({
    runtime: args.runtime,
    supportGates,
    statelessObserverBoundary,
    resourceLifecycle,
    coarseOnly,
    coarsePlusRefinement,
  });
  const report: VisionRegionBenchmarkReport = {
    schemaVersion: VISION_REGION_BENCHMARK_REPORT_SCHEMA_VERSION,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    gitCommit: args.gitCommit ?? currentGitCommit(),
    gateConstants: VISION_REGION_GATE_CONSTANTS,
    runtime: args.runtime,
    claimSemantics: buildClaimSemantics(targetSummaries.length),
    stabilitySemantics:
      "Fixed seed and temperature 0 measure runtime and decode determinism only. They do not establish broad observational robustness.",
    statelessObserverBoundary,
    resourceLifecycle,
    supportGates,
    caseAccounting: buildCaseAccounting(benchmarkCases, args.caseRepetitions, runs),
    corpus: buildCorpusSummary(targetSummaries),
    unsupportedMetrics: {
      mixedOrientationExactAgreement: {
        value: null,
        rationale:
          "The observer vocabulary cannot emit mixed, so mixed exact-agreement is unsupported.",
      },
    },
    runs,
    targets: targetSummaries,
    orientation: {
      coarseOnly: buildOrientationSummary(targetSummaries, "coarseOnly"),
      coarsePlusRefinement: buildOrientationSummary(targetSummaries, "coarsePlusRefinement"),
    },
    reasonCodes: buildReasonCodeSummary(targetSummaries),
    arms: {
      coarseOnly,
      coarsePlusRefinement,
      refinementBenefit: buildRefinementBenefit({
        coarseOnly,
        coarsePlusRefinement,
      }),
    },
    humanAdjudicatedUpperBound: {
      consistentHitRecall: 1,
      anyRunRecall: 1,
      note: "Evaluation-only upper bound: the adjudicated benchmark geometry defines the perfect governed denominator.",
    },
    decision: decisionResult.decision,
    decisionRationale: decisionResult.rationale,
    limitations: [
      "The observer is field-agnostic and may legitimately propose unannotated text regions.",
      "Precision-like region metrics are unsupported because the corpus does not govern every visible text instance.",
      "Medium-confidence geometry is reported separately and does not alone determine the global support gate.",
      "No raw model response text is retained in this governed report.",
    ],
    productionBoundaryProof: buildBoundaryProof(),
  };
  const validated = validateVisionRegionBenchmarkReport(report);
  if (!validated.ok) throw new Error(validated.error.issues.join("; "));
  return validated.value;
}

export async function runVisionRegionBenchmark(
  options: RunVisionRegionBenchmarkOptions = {},
): Promise<VisionRegionBenchmarkReport> {
  const manifest = options.manifest ?? loadEvalManifest();
  let benchmarkCases = options.benchmarkCases
    ? [...options.benchmarkCases]
    : loadVisionRegionBenchmarkCases(manifest);
  if (options.caseIds && options.caseIds.length > 0) {
    const allow = new Set(options.caseIds);
    benchmarkCases = benchmarkCases.filter((benchmarkCase) =>
      allow.has(benchmarkCase.evalCase.caseId),
    );
  }
  const caseRepetitions = options.caseRepetitions ?? DEFAULT_VISION_REGION_CASE_REPETITIONS;
  const configResult = await resolveLocalVlmConfig(
    (options.configInput ?? (process.env as LocalVlmConfigInput)) as LocalVlmConfigInput,
  );
  if (!configResult.ok) {
    return buildVisionRegionBenchmarkReport({
      benchmarkCases,
      caseRepetitions,
      caseRuns: [],
      runtime: buildRuntimeSummary(null, configResult.error.message),
      statelessObserverBoundary: null,
      resourceLifecycle: null,
    });
  }

  const config = configResult.value;
  const outputDir = join(process.cwd(), ".local-vlm", "vision-region-benchmark");
  await mkdir(outputDir, { recursive: true });
  const statelessObserverBoundary = await runLocalVlmContaminationSequence({
    config,
    outputDir: join(outputDir, "contamination"),
  });
  const resourceLifecycle = await runLocalVlmStress({
    config,
    outputDir: join(outputDir, "resource"),
    runCount: options.resourceRunCount ?? DEFAULT_VISION_REGION_RESOURCE_RUNS,
  });

  const generationInputs: VisionRegionBenchmarkGenerationInput[] = [];
  for (const benchmarkCase of benchmarkCases) {
    const image = loadCaseImage(benchmarkCase.evalCase);
    generationInputs.push({
      caseId: benchmarkCase.evalCase.caseId,
      sourceArtifactRef: `eval-case:${benchmarkCase.evalCase.caseId}`,
      sourceBytes: image.bytes,
      sourceMediaType: benchmarkCase.record.image.mediaType,
      sourceWidth: benchmarkCase.record.image.width,
      sourceHeight: benchmarkCase.record.image.height,
    });
  }

  const caseRuns = await runVisionRegionBenchmarkGeneration({
    config,
    inputs: generationInputs,
    caseRepetitions,
  });

  return buildVisionRegionBenchmarkReport({
    benchmarkCases,
    caseRepetitions,
    caseRuns,
    runtime: buildRuntimeSummary(config, null),
    statelessObserverBoundary,
    resourceLifecycle,
  });
}

function pct(value: number | null) {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

function metricOrNA(value: number | null) {
  return value === null ? "N/A" : value.toFixed(3);
}

function bytesOrNA(value: number | null) {
  return value === null ? "N/A" : `${value.toLocaleString()} B`;
}

export function renderVisionRegionBenchmarkMarkdown(report: VisionRegionBenchmarkReport): string {
  const lines: string[] = [];
  lines.push("# Vision Region Benchmark");
  lines.push("");
  lines.push(`- Decision: ${report.decision}`);
  for (const rationale of report.decisionRationale) lines.push(`- ${rationale}`);
  lines.push("");
  lines.push("## Runtime Provenance");
  lines.push("");
  lines.push(`- Runtime kind: \`${report.runtime.runtimeKind ?? "null"}\``);
  lines.push(`- Real runtime configured: ${String(report.runtime.realRuntimeConfigured)}`);
  lines.push(
    `- Adapter: \`${report.runtime.adapter.adapterId}\` v${report.runtime.adapter.adapterVersion}`,
  );
  lines.push(`- Adapter digest: \`${report.runtime.adapter.adapterDigest}\``);
  lines.push(
    `- Coarse prompt: \`${report.runtime.prompts.coarse.promptId}\` v${report.runtime.prompts.coarse.promptVersion} (\`${report.runtime.prompts.coarse.promptDigest}\`)`,
  );
  lines.push(
    `- Refinement prompt: \`${report.runtime.prompts.refinement.promptId}\` v${report.runtime.prompts.refinement.promptVersion} (\`${report.runtime.prompts.refinement.promptDigest}\`)`,
  );
  lines.push(`- Executable digest: \`${report.runtime.executableDigest ?? "null"}\``);
  lines.push(`- Model digest: \`${report.runtime.modelDigest ?? "null"}\``);
  lines.push(`- Projector digest: \`${report.runtime.projectorDigest ?? "null"}\``);
  if (report.runtime.configurationError) {
    lines.push(`- Configuration error: ${report.runtime.configurationError}`);
  }
  lines.push("");
  lines.push("## Gate Constants");
  lines.push("");
  for (const [key, value] of Object.entries(report.gateConstants)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push("## Claim Semantics");
  lines.push("");
  lines.push(
    `- Governed region recall denominator: ${report.claimSemantics.regionRecall.denominator}`,
  );
  lines.push(
    `- Text-region precision: N/A (${report.claimSemantics.textRegionPrecision.rationale})`,
  );
  lines.push(`- False-region rate: N/A (${report.claimSemantics.falseRegionRate.rationale})`);
  lines.push("");
  lines.push("## Support Gates");
  lines.push("");
  for (const gate of report.supportGates) {
    lines.push(`- ${gate.id}: ${gate.passed ? "PASS" : "FAIL"} (${gate.evidence})`);
  }
  lines.push("");
  lines.push("## Arms");
  lines.push("");
  lines.push(
    `- Coarse-only: ${report.arms.coarseOnly.decision}; consistent-hit recall ${pct(report.arms.coarseOnly.consistentHitRecall)}; any-run recall ${pct(report.arms.coarseOnly.anyRunRecall)}`,
  );
  lines.push(
    `- Coarse-plus-refinement: ${report.arms.coarsePlusRefinement.decision}; consistent-hit recall ${pct(report.arms.coarsePlusRefinement.consistentHitRecall)}; any-run recall ${pct(report.arms.coarsePlusRefinement.anyRunRecall)}`,
  );
  lines.push(
    `- Refinement benefit: ${report.arms.refinementBenefit.decision}; improvement margin ${metricOrNA(report.arms.refinementBenefit.improvementMargin)}`,
  );
  lines.push("");
  lines.push("## Orientation");
  lines.push("");
  lines.push(
    `- Coarse horizontal exact agreement: ${pct(report.orientation.coarseOnly.horizontal.exactAgreementRate)}`,
  );
  lines.push(
    `- Coarse non-horizontal exact agreement: ${pct(report.orientation.coarseOnly.nonHorizontal.exactAgreementRate)}`,
  );
  lines.push(
    `- Refinement horizontal exact agreement: ${pct(report.orientation.coarsePlusRefinement.horizontal.exactAgreementRate)}`,
  );
  lines.push(
    `- Mixed exact agreement: N/A (${report.unsupportedMetrics.mixedOrientationExactAgreement.rationale})`,
  );
  lines.push("");
  lines.push("## Resources");
  lines.push("");
  lines.push(
    `- Coarse peak process-tree RSS: ${bytesOrNA(report.arms.coarseOnly.peakProcessTreeRssBytes)}`,
  );
  lines.push(
    `- Refinement peak process-tree RSS: ${bytesOrNA(report.arms.coarsePlusRefinement.peakProcessTreeRssBytes)}`,
  );
  lines.push(
    `- Coarse cleanup failures: ${report.arms.coarseOnly.cleanupFailureCount}; refinement cleanup failures: ${report.arms.coarsePlusRefinement.cleanupFailureCount}`,
  );
  lines.push("");
  lines.push("## Stability Semantics");
  lines.push("");
  lines.push(`- ${report.stabilitySemantics}`);
  lines.push("");
  lines.push("## Boundary Proof");
  lines.push("");
  lines.push(`- Benchmark modules: ${report.productionBoundaryProof.benchmarkModules.join(", ")}`);
  lines.push(`- Guard tests: ${report.productionBoundaryProof.guardTests.join(", ")}`);
  lines.push(`- Proof note: ${report.productionBoundaryProof.proofNote}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function writeVisionRegionBenchmarkReportFiles(args: {
  report: VisionRegionBenchmarkReport;
  outputDir: string;
  stem?: string;
}): Promise<{ jsonPath: string; markdownPath: string }> {
  const validated = validateVisionRegionBenchmarkReport(args.report);
  if (!validated.ok) throw new Error(validated.error.issues.join("; "));
  const stem = args.stem ?? "vision-region-report";
  await mkdir(args.outputDir, { recursive: true });
  const jsonPath = join(args.outputDir, `${stem}.json`);
  const markdownPath = join(args.outputDir, `${stem}.md`);
  await writeFile(jsonPath, `${JSON.stringify(validated.value, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderVisionRegionBenchmarkMarkdown(validated.value), "utf8");
  return { jsonPath, markdownPath };
}

export function shouldWritePublicVisionRegionReport(report: VisionRegionBenchmarkReport) {
  return report.runtime.realRuntimeConfigured && report.runtime.runtimeKind === "real-local-vlm";
}

export function buildSyntheticVisionRegionStageRun(
  overrides: Partial<VisionRegionBenchmarkStageRun> = {},
): VisionRegionBenchmarkStageRun {
  return {
    stage: "coarse",
    scenarioId: "synthetic",
    observationRunId: "00000000-0000-4000-8000-000000000001",
    workspaceRef: "/tmp/synthetic",
    runtimeKind: "real-local-vlm",
    sourceArtifactRef: "eval-case:synthetic",
    sourceImageSha256: "1".repeat(64),
    overlaySha256: "2".repeat(64),
    promptId: LOCAL_VLM_PROMPT_ID,
    promptVersion: LOCAL_VLM_PROMPT_VERSION,
    promptDigest: LOCAL_VLM_PROMPT_SHA256,
    adapterId: LLAMA_SERVER_ADAPTER_ID,
    adapterVersion: LLAMA_SERVER_ADAPTER_VERSION,
    runtimeVersion: "llama-server test",
    rawResponseDigest: "3".repeat(64),
    structuredResponseDigest: "4".repeat(64),
    schemaValid: true,
    prohibitedClaimDetected: false,
    transportSuccess: true,
    jsonExtractionSuccess: true,
    schemaSuccess: true,
    prohibitedLanguageSuccess: true,
    geometrySuccess: true,
    cleanupCompleted: true,
    forcedTermination: false,
    errorCode: null,
    errorStage: null,
    process: {
      pid: 1001,
      processGroupId: 1001,
      port: 41001,
      spawnedAt: new Date("2026-07-14T00:00:00Z").toISOString(),
      readyAt: new Date("2026-07-14T00:00:01Z").toISOString(),
      requestStartedAt: new Date("2026-07-14T00:00:02Z").toISOString(),
      requestCompletedAt: new Date("2026-07-14T00:00:03Z").toISOString(),
      terminationRequestedAt: new Date("2026-07-14T00:00:04Z").toISOString(),
      exitedAt: new Date("2026-07-14T00:00:05Z").toISOString(),
      portReleased: true,
      processTreeReleasedAfterTermination: true,
      stdoutTruncated: false,
      stderrTruncated: false,
    },
    resources: {
      workspacePeakBytes: 10,
      workspaceBytesAfterCleanup: 0,
      fileCountPeak: 2,
      sampleCount: 2,
      sampleFailureCount: 0,
      peakProcessRssBytes: 100,
      peakProcessTreeRssBytes: 100,
    },
    timing: {
      startupMs: 100,
      requestMs: 120,
      parseMs: 10,
      terminationMs: 20,
      totalWallMs: 250,
    },
    ...overrides,
  };
}

export function buildSyntheticVisionRegionCoarseProposal(args: {
  proposalId: string;
  observationId: string;
  geometry: EvalNormalizedBox;
  apparentOrientation?: ApparentOrientation;
  reasonCodes?: readonly ReasonCode[];
}): VisionRegionBenchmarkCoarseProposalRecord {
  return {
    proposalId: args.proposalId,
    observationId: args.observationId,
    coarseGridRange: "B2:D4",
    apparentOrientation: args.apparentOrientation ?? "horizontal",
    visibility: "full",
    reasonCodes: args.reasonCodes ?? ["high_salience"],
    coarseGeometry: args.geometry,
  };
}

export function buildSyntheticVisionRegionRefinementProposal(args: {
  proposalId: string;
  observationId: string;
  geometry: EvalNormalizedBox;
  apparentOrientation?: ApparentOrientation;
  reasonCodes?: readonly ReasonCode[];
}): VisionRegionBenchmarkRefinementProposalRecord {
  return {
    proposalId: args.proposalId,
    observationId: args.observationId,
    refinementGridRange: "B2:D4",
    apparentOrientation: args.apparentOrientation ?? "horizontal",
    visibility: "full",
    reasonCodes: args.reasonCodes ?? ["high_salience"],
    refinedGeometry: args.geometry,
  };
}

export function buildSyntheticVisionRegionCaseRun(args: {
  caseId: string;
  repetition: number;
  coarseStage?: Partial<VisionRegionBenchmarkStageRun>;
  coarseProposals?: readonly VisionRegionBenchmarkCoarseProposalRecord[];
  refinementStages?: VisionRegionBenchmarkRun["refinementStages"];
}): VisionRegionBenchmarkCaseRun {
  return {
    caseId: args.caseId,
    repetition: args.repetition,
    coarseStage: buildSyntheticVisionRegionStageRun({
      scenarioId: `vision-region:${args.caseId}:r${args.repetition}:coarse`,
      observationRunId: `00000000-0000-4000-8000-${String(args.repetition).padStart(12, "0")}`,
      workspaceRef: `/tmp/${args.caseId}/r${args.repetition}/coarse`,
      ...args.coarseStage,
    }),
    coarseProposals: args.coarseProposals ?? [],
    refinementStages:
      args.refinementStages?.map((stage, index) => ({
        coarseProposalId: stage.coarseProposalId,
        cropNormalizedBox: stage.cropNormalizedBox,
        stageRun: buildSyntheticVisionRegionStageRun({
          ...stage.stageRun,
          stage: "refinement",
          promptId: LOCAL_VLM_REFINEMENT_PROMPT_ID,
          promptVersion: LOCAL_VLM_REFINEMENT_PROMPT_VERSION,
          promptDigest: LOCAL_VLM_REFINEMENT_PROMPT_SHA256,
          scenarioId: `vision-region:${args.caseId}:r${args.repetition}:refine:${index + 1}`,
          observationRunId: `00000000-0000-4000-8000-${String(
            args.repetition * 100 + index + 1,
          ).padStart(12, "0")}`,
          workspaceRef: `/tmp/${args.caseId}/r${args.repetition}/refine-${index + 1}`,
        }),
        proposal: stage.proposal,
      })) ?? [],
  };
}
