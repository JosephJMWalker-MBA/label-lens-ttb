import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { z } from "zod";

import {
  evaluateGovernmentWarningPackage,
  normalizeGovernmentWarningForComparison,
} from "@/domain/rules/government-warning.rule";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import {
  selectAlcoholObservation,
  selectBrandObservation,
} from "@/pipeline/extractor/field-selection";
import { selectGovernmentWarningObservation } from "@/pipeline/extractor/government-warning";
import { mapBoxToOriginalGeometry } from "@/pipeline/extractor/geometry";
import { createLocalOcrEngine, type OcrEngine } from "@/pipeline/extractor/ocr-engine";
import type {
  OcrWord,
  RegionOcrResult,
  RegionTransform,
} from "@/pipeline/extractor/extractor.types";

import type { NormalizedResearchRegion, ResearchFixture, ResearchManifest } from "./fixture-corpus";

export const OCR_EXPERIMENT_SCHEMA_VERSION = "ocr-research-experiment.v1" as const;
export const OCR_REPORT_SCHEMA_VERSION = "ocr-research-report.v1" as const;

export const OCR_EXPERIMENT_VARIABLES = [
  "scale",
  "padding",
  "grayscaleMethod",
  "contrastMethod",
  "thresholdMethod",
  "sharpening",
  "inversion",
  "denoising",
  "psm",
  "rotation",
  "cropSource",
  "fieldType",
] as const;
export type ExperimentVariable = (typeof OCR_EXPERIMENT_VARIABLES)[number];

export const ocrConfigurationSchema = z
  .object({
    scale: z.number().finite().positive().max(8),
    padding: z
      .object({
        ratio: z.number().finite().min(0).max(0.5),
        minPx: z.number().int().min(0).max(512),
      })
      .strict(),
    grayscaleMethod: z.enum(["sharp-grayscale", "none"]),
    contrastMethod: z.enum(["normalise", "none"]),
    thresholdMethod: z.enum(["none", "global-128", "otsu", "adaptive"]),
    sharpening: z.enum(["none", "mild"]),
    inversion: z.boolean(),
    denoising: z.enum(["none", "median-3"]),
    psm: z.number().int().min(0).max(13),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    cropSource: z.enum(["governed-brand-region", "seller-region", "full-image"]),
    fieldType: z.enum(["brandName", "governmentWarning", "alcoholStatement"]),
  })
  .strict();

export type OcrConfiguration = z.infer<typeof ocrConfigurationSchema>;

export const experimentDefinitionSchema = z
  .object({
    schemaVersion: z.literal(OCR_EXPERIMENT_SCHEMA_VERSION),
    experimentId: z.string().regex(/^[a-z0-9][a-z0-9-]{4,100}$/),
    design: z.literal("one-variable-at-a-time"),
    declaredVariable: z.enum(["none", ...OCR_EXPERIMENT_VARIABLES]),
    control: ocrConfigurationSchema,
    treatment: ocrConfigurationSchema,
  })
  .strict();

export type ExperimentDefinition = z.infer<typeof experimentDefinitionSchema>;

export const PRODUCTION_BOUNDED_BRAND_CONTROL: OcrConfiguration = {
  scale: 3,
  padding: { ratio: 0.03, minPx: 4 },
  grayscaleMethod: "sharp-grayscale",
  contrastMethod: "normalise",
  thresholdMethod: "none",
  sharpening: "none",
  inversion: false,
  denoising: "none",
  psm: 11,
  rotation: 0,
  cropSource: "governed-brand-region",
  fieldType: "brandName",
};

export interface ConfigurationIsolation {
  changedVariables: ExperimentVariable[];
  valid: boolean;
  reason: string;
}

export function validateConfigurationIsolation(
  definitionValue: unknown,
): ExperimentDefinition & { isolation: ConfigurationIsolation } {
  const definition = experimentDefinitionSchema.parse(definitionValue);
  const changedVariables = OCR_EXPERIMENT_VARIABLES.filter(
    (key) =>
      canonicalStringify(definition.control[key]) !== canonicalStringify(definition.treatment[key]),
  );
  const valid =
    definition.declaredVariable === "none"
      ? changedVariables.length === 0
      : changedVariables.length === 1 && changedVariables[0] === definition.declaredVariable;
  if (!valid) {
    const expected =
      definition.declaredVariable === "none"
        ? "no changed variables"
        : `exactly ${definition.declaredVariable}`;
    throw new Error(
      `CONFIG_ISOLATION_VIOLATION: expected ${expected}; changed ${changedVariables.join(", ") || "none"}`,
    );
  }
  return {
    ...definition,
    isolation: {
      changedVariables,
      valid,
      reason:
        definition.declaredVariable === "none"
          ? "No-op treatment is byte-equivalent to control."
          : `Treatment differs from control only in ${definition.declaredVariable}.`,
    },
  };
}

export interface OcrExecutionInput {
  caseId: string;
  fixtureId: string;
  imagePath: string;
  expectedSha256: string;
  image: { width: number; height: number; mimeType: "image/png" | "image/jpeg" };
  region: NormalizedResearchRegion | null;
}

interface ExecutionArtifacts {
  cropPng: Buffer;
  preprocessedPng: Buffer;
}

export interface OcrExecutionResult {
  caseId: string;
  fixtureId: string;
  rawTranscript: string;
  rawWords: OcrWord[];
  rawWordCount: number;
  meanConfidence: number | null;
  crop: RegionTransform["crop"];
  transformedSize: { width: number; height: number };
  preprocessing: string[];
  selection: {
    state: string;
    value: string | null;
    ocrEvidenceScore: number;
    reliable: boolean;
    candidateTrace: unknown;
    warningAnchorTrace: unknown;
    warningResult: string | null;
  };
  latencyMs: { preprocess: number; ocr: number; selection: number; total: number };
  memory: { rssBefore: number; rssAfter: number; rssDelta: number };
  artifacts: ExecutionArtifacts;
}

export interface EvaluatedCase {
  caseId: string;
  fixtureId: string;
  slices: string[];
  expectedValues: string[];
  rawTranscript: string;
  rawWords: OcrWord[];
  meanConfidence: number | null;
  selectedValue: string | null;
  selectedState: string;
  reliable: boolean;
  correct: boolean;
  falseCertainty: boolean;
  failureClass:
    | "CORRECT"
    | "OCR_EMPTY"
    | "OCR_RECOGNITION_MISS"
    | "SELECTOR_MISS_WITH_OCR_HIT"
    | "CONSERVATIVE_AUTHORITY"
    | "WRONG_RELIABLE_READ"
    | "WARNING_NOT_PRESENT_CORRECT"
    | "WARNING_FALSE_PASS";
  candidateTrace: unknown;
  warningAnchorTrace: unknown;
  warningResult: string | null;
  crop: RegionTransform["crop"];
  transformedSize: { width: number; height: number };
  preprocessing: string[];
  latencyMs: OcrExecutionResult["latencyMs"];
  memory: OcrExecutionResult["memory"];
  artifactPaths: { crop: string; preprocessed: string; transcript: string };
}

export interface WilsonInterval {
  confidenceLevel: 0.95;
  lower: number | null;
  upper: number | null;
}

export interface SliceMetrics {
  caseCount: number;
  correctCount: number;
  accuracy: number | null;
  accuracyWilson95: WilsonInterval;
  falseCertaintyCount: number;
  falseCertaintyRate: number | null;
  falseCertaintyWilson95: WilsonInterval;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  failureClassCounts: Record<string, number>;
}

export interface ArmReport {
  schemaVersion: typeof OCR_REPORT_SCHEMA_VERSION;
  experimentId: string;
  arm: "control" | "treatment";
  configuration: OcrConfiguration;
  configurationHash: string;
  behaviorHash: string;
  gitSha: string;
  environment: {
    node: string;
    platform: string;
    architecture: string;
    sharp: string;
    ocrEngine: string;
  };
  metrics: {
    governedFixtureCount: number;
    caseCount: number;
    correctCount: number;
    failureCount: number;
    accuracy: number | null;
    accuracyWilson95: WilsonInterval;
    falseCertaintyCount: number;
    falseCertaintyRate: number | null;
    falseCertaintyWilson95: WilsonInterval;
    medianLatencyMs: number | null;
    p95LatencyMs: number | null;
    medianRssDeltaBytes: number | null;
    failureClassCounts: Record<string, number>;
    sliceMetrics: Record<string, SliceMetrics>;
  };
  cases: EvaluatedCase[];
}

export interface TreatmentEligibility {
  allowed: boolean;
  governedEvaluableFixtureCount: number;
  knownControlFailureCount: number;
  reasons: string[];
}

export interface ExperimentDiff {
  experimentId: string;
  declaredVariable: ExperimentDefinition["declaredVariable"];
  changedVariables: ExperimentVariable[];
  noOp: boolean;
  behavioralDeltaCount: number;
  correctDelta: number;
  falseCertaintyDelta: number;
  medianLatencyDeltaMs: number | null;
  p95LatencyDeltaMs: number | null;
  caseDeltas: Array<{
    caseId: string;
    controlValue: string | null;
    treatmentValue: string | null;
    controlClass: string;
    treatmentClass: string;
    behavioralChange: boolean;
  }>;
  decision: "NO_OP_CONFIRMED" | "PASS" | "KILL" | "INCONCLUSIVE";
  decisionReason: string;
}

export interface ExperimentOutputs {
  definition: ExperimentDefinition;
  isolation: ConfigurationIsolation;
  eligibility: TreatmentEligibility;
  control: ArmReport;
  treatment: ArmReport;
  diff: ExperimentDiff;
}

function sha256Value(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function cropFor(
  input: OcrExecutionInput,
  configuration: OcrConfiguration,
): RegionTransform["crop"] {
  if (configuration.cropSource === "full-image") {
    return { left: 0, top: 0, width: input.image.width, height: input.image.height };
  }
  if (!input.region) throw new Error(`MISSING_GOVERNED_REGION: ${input.caseId}`);
  if (
    configuration.cropSource === "seller-region" &&
    input.region.provenance !== "seller-selected-region"
  ) {
    throw new Error(`SELLER_REGION_REQUIRED: ${input.caseId}`);
  }
  const left = Math.floor(input.region.x * input.image.width);
  const top = Math.floor(input.region.y * input.image.height);
  const right = Math.ceil((input.region.x + input.region.width) * input.image.width);
  const bottom = Math.ceil((input.region.y + input.region.height) * input.image.height);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) throw new Error(`INVALID_REGION_PIXELS: ${input.caseId}`);
  const padX = Math.max(
    configuration.padding.minPx,
    Math.round(width * configuration.padding.ratio),
  );
  const padY = Math.max(
    configuration.padding.minPx,
    Math.round(height * configuration.padding.ratio),
  );
  const paddedLeft = clamp(left - padX, 0, input.image.width - 1);
  const paddedTop = clamp(top - padY, 0, input.image.height - 1);
  const paddedRight = clamp(right + padX, paddedLeft + 1, input.image.width);
  const paddedBottom = clamp(bottom + padY, paddedTop + 1, input.image.height);
  return {
    left: paddedLeft,
    top: paddedTop,
    width: paddedRight - paddedLeft,
    height: paddedBottom - paddedTop,
  };
}

function preprocessingLabels(configuration: OcrConfiguration): string[] {
  return [
    `crop:${configuration.cropSource}`,
    `rotate:${configuration.rotation}`,
    `scale:${configuration.scale}`,
    `grayscale:${configuration.grayscaleMethod}`,
    `contrast:${configuration.contrastMethod}`,
    `threshold:${configuration.thresholdMethod}`,
    `sharpening:${configuration.sharpening}`,
    `inversion:${String(configuration.inversion)}`,
    `denoising:${configuration.denoising}`,
    `psm:${configuration.psm}`,
  ];
}

function otsuThreshold(raw: Buffer): number {
  const histogram = new Array<number>(256).fill(0);
  for (const byte of raw) histogram[byte] += 1;
  const total = raw.length;
  let sum = 0;
  for (let index = 0; index < 256; index += 1) sum += index * histogram[index];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let bestThreshold = 128;
  for (let threshold = 0; threshold < 256; threshold += 1) {
    backgroundWeight += histogram[threshold];
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += threshold * histogram[threshold];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (sum - backgroundSum) / foregroundWeight;
    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) *
      (backgroundMean - foregroundMean);
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = threshold;
    }
  }
  return bestThreshold;
}

async function preprocess(
  bytes: Buffer,
  crop: RegionTransform["crop"],
  configuration: OcrConfiguration,
): Promise<{
  cropPng: Buffer;
  preprocessedPng: Buffer;
  transformedSize: { width: number; height: number };
}> {
  if (configuration.thresholdMethod === "adaptive") {
    throw new Error(
      "UNSUPPORTED_EVALUATION_CONFIGURATION: adaptive thresholding is represented but not enabled",
    );
  }
  const cropPng = await sharp(bytes).extract(crop).png().toBuffer();
  let pipeline = sharp(cropPng);
  if (configuration.rotation) {
    pipeline = sharp(await pipeline.rotate(configuration.rotation).toBuffer());
  }
  const metadata = await pipeline.metadata();
  const width = Math.max(1, Math.round((metadata.width ?? crop.width) * configuration.scale));
  const height = Math.max(1, Math.round((metadata.height ?? crop.height) * configuration.scale));
  pipeline = pipeline.resize({ width, height, kernel: "cubic" });
  if (configuration.grayscaleMethod === "sharp-grayscale") pipeline = pipeline.grayscale();
  if (configuration.contrastMethod === "normalise") pipeline = pipeline.normalise();
  if (configuration.denoising === "median-3") pipeline = pipeline.median(3);
  if (configuration.sharpening === "mild") pipeline = pipeline.sharpen({ sigma: 1 });
  if (configuration.inversion) pipeline = pipeline.negate();
  if (configuration.thresholdMethod === "global-128") pipeline = pipeline.threshold(128);
  if (configuration.thresholdMethod === "otsu") {
    const { data, info } = await pipeline.clone().grayscale().raw().toBuffer({
      resolveWithObject: true,
    });
    const threshold = otsuThreshold(data);
    pipeline = sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    }).threshold(threshold);
  }
  return {
    cropPng,
    preprocessedPng: await pipeline.png().toBuffer(),
    transformedSize: { width, height },
  };
}

function rawTranscript(words: readonly OcrWord[]): string {
  return [...words]
    .sort((left, right) => {
      const leftY = (left.bbox.y0 + left.bbox.y1) / 2;
      const rightY = (right.bbox.y0 + right.bbox.y1) / 2;
      if (Math.abs(leftY - rightY) > 20) return leftY - rightY;
      return left.bbox.x0 - right.bbox.x0;
    })
    .map((word) => word.text)
    .join(" ")
    .trim();
}

function meanConfidence(words: readonly OcrWord[]): number | null {
  const values = words.map((word) => word.rawConfidence).filter((value) => Number.isFinite(value));
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function executeOcrCase(
  input: OcrExecutionInput,
  configuration: OcrConfiguration,
  engine: OcrEngine,
): Promise<OcrExecutionResult> {
  const totalStart = performance.now();
  const rssBefore = process.memoryUsage().rss;
  const bytes = readFileSync(path.resolve(input.imagePath));
  if (sha256Bytes(bytes) !== input.expectedSha256) {
    throw new Error(`FIXTURE_CHECKSUM_MISMATCH: ${input.caseId}`);
  }
  const crop = cropFor(input, configuration);
  const preprocessStart = performance.now();
  const processed = await preprocess(bytes, crop, configuration);
  const preprocessMs = performance.now() - preprocessStart;
  const ocrStart = performance.now();
  const rawWords = await engine.recognizeWords(processed.preprocessedPng, configuration.psm);
  const ocrMs = performance.now() - ocrStart;
  const transform: RegionTransform = {
    crop,
    rotate: configuration.rotation,
    scale: configuration.scale,
    originalWidth: input.image.width,
    originalHeight: input.image.height,
  };
  const words = rawWords
    .map((word) => {
      const originalGeometry = mapBoxToOriginalGeometry(word.bbox, transform);
      return originalGeometry ? { ...word, originalGeometry } : null;
    })
    .filter(
      (word): word is OcrWord & { originalGeometry: NonNullable<OcrWord["originalGeometry"]> } =>
        Boolean(word),
    );
  const pass: RegionOcrResult = {
    passId: `research-${input.caseId}`,
    regionName: configuration.cropSource,
    passKind:
      configuration.cropSource === "full-image"
        ? configuration.rotation === 180
          ? "full-image-rot180"
          : "full-image-primary"
        : "seller-region",
    triggerReasons:
      configuration.cropSource === "full-image"
        ? [configuration.rotation === 0 ? "primary-pass" : "orientation-fallback"]
        : ["seller-region-target"],
    preprocessing: preprocessingLabels(configuration),
    fieldEligibility: {
      brand: configuration.fieldType === "brandName",
      alcohol: configuration.fieldType === "alcoholStatement",
    },
    transform,
    transformedSize: processed.transformedSize,
    pageSegMode: configuration.psm,
    rawWordCount: rawWords.length,
    discardedWordCount: rawWords.length - words.length,
    timings: {
      preprocessMs,
      ocrMs,
      inverseMappingMs: 0,
      totalMs: performance.now() - totalStart,
    },
    words,
  };
  const selectionStart = performance.now();
  let selection: OcrExecutionResult["selection"];
  if (configuration.fieldType === "brandName") {
    const selected = selectBrandObservation([pass]);
    selection = {
      state: selected.observation.state,
      value: selected.observation.value,
      ocrEvidenceScore: selected.observation.ocrEvidenceScore,
      reliable:
        selected.observation.state === "OBSERVED" && selected.observation.ocrEvidenceScore >= 0.8,
      candidateTrace: selected.brandDiagnostics ?? null,
      warningAnchorTrace: null,
      warningResult: null,
    };
  } else if (configuration.fieldType === "alcoholStatement") {
    const selected = selectAlcoholObservation([pass]);
    selection = {
      state: selected.observation.state,
      value: selected.observation.value,
      ocrEvidenceScore: selected.observation.ocrEvidenceScore,
      reliable:
        selected.observation.state === "OBSERVED" && selected.observation.ocrEvidenceScore >= 0.8,
      candidateTrace: selected.alcoholDiagnostics ?? null,
      warningAnchorTrace: null,
      warningResult: null,
    };
  } else {
    const observation = selectGovernmentWarningObservation(input.fixtureId, [pass]);
    const finding = evaluateGovernmentWarningPackage([observation]);
    selection = {
      state: observation.evidenceState,
      value: observation.anchoredTranscript ?? observation.rawTranscript,
      ocrEvidenceScore: observation.ocrEvidenceScore,
      reliable: finding.result === "PASS",
      candidateTrace: null,
      warningAnchorTrace: {
        match: observation.match,
        contamination: observation.contamination ?? null,
        extractionProvenance: observation.extractionProvenance,
      },
      warningResult: finding.result,
    };
  }
  const selectionMs = performance.now() - selectionStart;
  const rssAfter = process.memoryUsage().rss;
  return {
    caseId: input.caseId,
    fixtureId: input.fixtureId,
    rawTranscript: rawTranscript(words),
    rawWords: words,
    rawWordCount: words.length,
    meanConfidence: meanConfidence(words),
    crop,
    transformedSize: processed.transformedSize,
    preprocessing: pass.preprocessing,
    selection,
    latencyMs: {
      preprocess: preprocessMs,
      ocr: ocrMs,
      selection: selectionMs,
      total: performance.now() - totalStart,
    },
    memory: { rssBefore, rssAfter, rssDelta: rssAfter - rssBefore },
    artifacts: { cropPng: processed.cropPng, preprocessedPng: processed.preprocessedPng },
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function includesExpected(transcript: string, expected: readonly string[]): boolean {
  const haystack = normalize(transcript);
  return expected.some((value) => {
    const needle = normalize(value);
    return needle.length > 0 && haystack.includes(needle);
  });
}

function selectedMatches(value: string | null, expected: readonly string[]): boolean {
  if (!value) return false;
  const selected = normalize(value);
  return expected.some((item) => normalize(item) === selected);
}

function truthFor(fixture: ResearchFixture, fieldType: OcrConfiguration["fieldType"]): string[] {
  if (fieldType === "brandName") return fixture.truth.brand?.acceptableValues ?? [];
  if (fieldType === "alcoholStatement") return fixture.truth.alcohol?.acceptableValues ?? [];
  const warning = fixture.truth.warning;
  if (!warning) return [];
  if (warning.presence === "absent") return ["__ABSENT__"];
  return warning.expectedText ? [warning.expectedText] : ["__PRESENT__"];
}

function evaluateCase(
  fixture: ResearchFixture,
  result: OcrExecutionResult,
  configuration: OcrConfiguration,
  region: NormalizedResearchRegion | null,
  artifactPaths: EvaluatedCase["artifactPaths"],
): EvaluatedCase {
  const expectedValues = truthFor(fixture, configuration.fieldType);
  let correct = false;
  let falseCertainty = false;
  let failureClass: EvaluatedCase["failureClass"];
  if (configuration.fieldType === "governmentWarning") {
    const warning = fixture.truth.warning;
    if (!warning) throw new Error(`MISSING_WARNING_TRUTH: ${fixture.fixtureId}`);
    correct =
      warning.presence === "absent"
        ? result.selection.warningResult !== "PASS"
        : result.selection.warningResult === "PASS" ||
          (warning.expectedText === null && result.selection.state !== "not_observed");
    falseCertainty = warning.presence === "absent" && result.selection.warningResult === "PASS";
    failureClass = correct
      ? warning.presence === "absent"
        ? "WARNING_NOT_PRESENT_CORRECT"
        : "CORRECT"
      : falseCertainty
        ? "WARNING_FALSE_PASS"
        : result.rawWordCount === 0
          ? "OCR_EMPTY"
          : "OCR_RECOGNITION_MISS";
  } else {
    correct = selectedMatches(result.selection.value, expectedValues);
    falseCertainty = result.selection.reliable && !correct;
    failureClass = correct
      ? result.selection.reliable
        ? "CORRECT"
        : "CONSERVATIVE_AUTHORITY"
      : falseCertainty
        ? "WRONG_RELIABLE_READ"
        : result.rawWordCount === 0
          ? "OCR_EMPTY"
          : includesExpected(result.rawTranscript, expectedValues)
            ? "SELECTOR_MISS_WITH_OCR_HIT"
            : "OCR_RECOGNITION_MISS";
  }
  return {
    caseId: result.caseId,
    fixtureId: result.fixtureId,
    slices: caseSlices(fixture, result, configuration, region),
    expectedValues,
    rawTranscript: result.rawTranscript,
    rawWords: result.rawWords,
    meanConfidence: result.meanConfidence,
    selectedValue: result.selection.value,
    selectedState: result.selection.state,
    reliable: result.selection.reliable,
    correct,
    falseCertainty,
    failureClass,
    candidateTrace: result.selection.candidateTrace,
    warningAnchorTrace: result.selection.warningAnchorTrace,
    warningResult: result.selection.warningResult,
    crop: result.crop,
    transformedSize: result.transformedSize,
    preprocessing: result.preprocessing,
    latencyMs: result.latencyMs,
    memory: result.memory,
    artifactPaths,
  };
}

function caseSlices(
  fixture: ResearchFixture,
  result: OcrExecutionResult,
  configuration: OcrConfiguration,
  region: NormalizedResearchRegion | null,
): string[] {
  const aspectRatio = fixture.image.width / fixture.image.height;
  const orientation = aspectRatio > 1.1 ? "landscape" : aspectRatio < 0.9 ? "portrait" : "square";
  const cropMinDimension = Math.min(result.crop.width, result.crop.height);
  const cropResolution =
    cropMinDimension < 64 ? "small" : cropMinDimension < 192 ? "medium" : "large";
  return [
    `field:${configuration.fieldType}`,
    `fixture-mode:${fixture.mode}`,
    `image-orientation:${orientation}`,
    `crop-min-dimension:${cropResolution}`,
    `region-provenance:${region?.provenance ?? "full-image"}`,
    `truth-source:${truthSourceKind(fixture, configuration.fieldType)}`,
  ].sort();
}

function truthSourceKind(
  fixture: ResearchFixture,
  fieldType: OcrConfiguration["fieldType"],
): string {
  if (fieldType === "brandName") return fixture.truth.brand?.evidenceSource.kind ?? "missing";
  if (fieldType === "alcoholStatement") {
    return fixture.truth.alcohol?.evidenceSource.kind ?? "missing";
  }
  return fixture.truth.warning?.evidenceSource.kind ?? "missing";
}

function casesFromManifest(
  manifest: ResearchManifest,
  configuration: OcrConfiguration,
): Array<{ fixture: ResearchFixture; input: OcrExecutionInput }> {
  const cases: Array<{ fixture: ResearchFixture; input: OcrExecutionInput }> = [];
  for (const fixture of [...manifest.fixtures].sort((a, b) =>
    a.fixtureId.localeCompare(b.fixtureId),
  )) {
    const expected = truthFor(fixture, configuration.fieldType);
    if (expected.length === 0) continue;
    const regions =
      configuration.cropSource === "full-image"
        ? [null]
        : configuration.fieldType === "brandName"
          ? fixture.regions.brand
          : [];
    for (const [index, region] of regions.entries()) {
      const suffix = regions.length > 1 ? `-region-${index + 1}` : "";
      cases.push({
        fixture,
        input: {
          caseId: `${fixture.fixtureId}${suffix}`,
          fixtureId: fixture.fixtureId,
          imagePath: fixture.image.path,
          expectedSha256: fixture.image.sha256,
          image: {
            width: fixture.image.width,
            height: fixture.image.height,
            mimeType: fixture.image.mimeType,
          },
          region,
        },
      });
    }
  }
  return cases;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

function p95(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function failureClassCounts(cases: readonly EvaluatedCase[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(cases.map((item) => item.failureClass))]
      .sort()
      .map((failureClass) => [
        failureClass,
        cases.filter((item) => item.failureClass === failureClass).length,
      ]),
  );
}

function buildSliceMetrics(cases: readonly EvaluatedCase[]): Record<string, SliceMetrics> {
  const labels = [...new Set(cases.flatMap((item) => item.slices))].sort();
  return Object.fromEntries(
    labels.map((label) => {
      const members = cases.filter((item) => item.slices.includes(label));
      const correctCount = members.filter((item) => item.correct).length;
      const falseCertaintyCount = members.filter((item) => item.falseCertainty).length;
      return [
        label,
        {
          caseCount: members.length,
          correctCount,
          accuracy: rate(correctCount, members.length),
          accuracyWilson95: wilson95(correctCount, members.length),
          falseCertaintyCount,
          falseCertaintyRate: rate(falseCertaintyCount, members.length),
          falseCertaintyWilson95: wilson95(falseCertaintyCount, members.length),
          medianLatencyMs: median(members.map((item) => item.latencyMs.total)),
          p95LatencyMs: p95(members.map((item) => item.latencyMs.total)),
          failureClassCounts: failureClassCounts(members),
        },
      ];
    }),
  );
}

export function wilson95(successes: number, total: number): WilsonInterval {
  if (total === 0) return { confidenceLevel: 0.95, lower: null, upper: null };
  const zScore = 1.959963984540054;
  const proportion = successes / total;
  const denominator = 1 + (zScore * zScore) / total;
  const center = (proportion + (zScore * zScore) / (2 * total)) / denominator;
  const margin =
    (zScore / denominator) *
    Math.sqrt((proportion * (1 - proportion)) / total + (zScore * zScore) / (4 * total * total));
  return {
    confidenceLevel: 0.95,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
  } catch {
    return "unavailable";
  }
}

function behaviorProjection(cases: readonly EvaluatedCase[]) {
  return cases.map((item) => ({
    caseId: item.caseId,
    rawTranscript: item.rawTranscript,
    rawWords: item.rawWords.map((word) => ({
      text: word.text,
      rawConfidence: word.rawConfidence,
      bbox: word.bbox,
      originalGeometry: word.originalGeometry,
    })),
    selectedValue: item.selectedValue,
    selectedState: item.selectedState,
    reliable: item.reliable,
    correct: item.correct,
    falseCertainty: item.falseCertainty,
    failureClass: item.failureClass,
    candidateTrace: item.candidateTrace,
    warningAnchorTrace: item.warningAnchorTrace,
    warningResult: item.warningResult,
  }));
}

async function runArm(args: {
  definition: ExperimentDefinition;
  manifest: ResearchManifest;
  arm: "control" | "treatment";
  configuration: OcrConfiguration;
  outputRoot: string;
  executor?: typeof executeOcrCase;
  engineFactory?: () => Promise<OcrEngine>;
}): Promise<ArmReport> {
  const armRoot = path.join(args.outputRoot, args.arm);
  mkdirSync(path.join(armRoot, "crops"), { recursive: true });
  mkdirSync(path.join(armRoot, "preprocessed"), { recursive: true });
  mkdirSync(path.join(armRoot, "transcripts"), { recursive: true });
  const engine = await (args.engineFactory ?? createLocalOcrEngine)();
  const cases: EvaluatedCase[] = [];
  try {
    for (const { fixture, input } of casesFromManifest(args.manifest, args.configuration)) {
      const result = await (args.executor ?? executeOcrCase)(input, args.configuration, engine);
      const cropPath = path.join(armRoot, "crops", `${input.caseId}.png`);
      const preprocessedPath = path.join(armRoot, "preprocessed", `${input.caseId}.png`);
      const transcriptPath = path.join(armRoot, "transcripts", `${input.caseId}.txt`);
      writeFileSync(cropPath, result.artifacts.cropPng);
      writeFileSync(preprocessedPath, result.artifacts.preprocessedPng);
      writeFileSync(transcriptPath, `${result.rawTranscript}\n`);
      cases.push(
        evaluateCase(fixture, result, args.configuration, input.region, {
          crop: path.relative(args.outputRoot, cropPath).split(path.sep).join("/"),
          preprocessed: path.relative(args.outputRoot, preprocessedPath).split(path.sep).join("/"),
          transcript: path.relative(args.outputRoot, transcriptPath).split(path.sep).join("/"),
        }),
      );
    }
  } finally {
    await engine.terminate();
  }

  const correctCount = cases.filter((item) => item.correct).length;
  const falseCertaintyCount = cases.filter((item) => item.falseCertainty).length;
  const report: ArmReport = {
    schemaVersion: OCR_REPORT_SCHEMA_VERSION,
    experimentId: args.definition.experimentId,
    arm: args.arm,
    configuration: args.configuration,
    configurationHash: sha256Value(args.configuration),
    behaviorHash: sha256Value(behaviorProjection(cases)),
    gitSha: gitSha(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      sharp: sharp.versions.sharp,
      ocrEngine: "tesseract.js@7.0.0/eng/OEM1",
    },
    metrics: {
      governedFixtureCount: new Set(cases.map((item) => item.fixtureId)).size,
      caseCount: cases.length,
      correctCount,
      failureCount: cases.length - correctCount,
      accuracy: rate(correctCount, cases.length),
      accuracyWilson95: wilson95(correctCount, cases.length),
      falseCertaintyCount,
      falseCertaintyRate: rate(falseCertaintyCount, cases.length),
      falseCertaintyWilson95: wilson95(falseCertaintyCount, cases.length),
      medianLatencyMs: median(cases.map((item) => item.latencyMs.total)),
      p95LatencyMs: p95(cases.map((item) => item.latencyMs.total)),
      medianRssDeltaBytes: median(cases.map((item) => item.memory.rssDelta)),
      failureClassCounts: failureClassCounts(cases),
      sliceMetrics: buildSliceMetrics(cases),
    },
    cases,
  };
  writeFileSync(path.join(armRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    path.join(armRoot, "raw-words.jsonl"),
    `${cases.map((item) => JSON.stringify({ caseId: item.caseId, words: item.rawWords })).join("\n")}\n`,
  );
  writeFileSync(
    path.join(armRoot, "candidate-traces.jsonl"),
    `${cases
      .map((item) =>
        JSON.stringify({
          caseId: item.caseId,
          candidateTrace: item.candidateTrace,
          warningAnchorTrace: item.warningAnchorTrace,
        }),
      )
      .join("\n")}\n`,
  );
  return report;
}

export function treatmentEligibility(control: ArmReport): TreatmentEligibility {
  const reasons: string[] = [];
  if (control.metrics.governedFixtureCount < 6) {
    reasons.push("fewer than 6 governed evaluable real-label fixtures");
  }
  if (control.metrics.failureCount < 3) {
    reasons.push("fewer than 3 known failures under the fixed control");
  }
  if (control.cases.some((item) => item.expectedValues.length === 0)) {
    reasons.push("fixed truth is missing");
  }
  return {
    allowed: reasons.length === 0,
    governedEvaluableFixtureCount: control.metrics.governedFixtureCount,
    knownControlFailureCount: control.metrics.failureCount,
    reasons,
  };
}

function subtractNullable(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function buildDiff(
  definition: ExperimentDefinition,
  isolation: ConfigurationIsolation,
  control: ArmReport,
  treatment: ArmReport,
): ExperimentDiff {
  const treatmentByCase = new Map(treatment.cases.map((item) => [item.caseId, item]));
  const caseDeltas = control.cases.map((base) => {
    const next = treatmentByCase.get(base.caseId);
    if (!next) throw new Error(`MISSING_TREATMENT_CASE: ${base.caseId}`);
    const controlBehavior = {
      transcript: base.rawTranscript,
      selectedValue: base.selectedValue,
      selectedState: base.selectedState,
      reliable: base.reliable,
      correct: base.correct,
      falseCertainty: base.falseCertainty,
      failureClass: base.failureClass,
    };
    const treatmentBehavior = {
      transcript: next.rawTranscript,
      selectedValue: next.selectedValue,
      selectedState: next.selectedState,
      reliable: next.reliable,
      correct: next.correct,
      falseCertainty: next.falseCertainty,
      failureClass: next.failureClass,
    };
    return {
      caseId: base.caseId,
      controlValue: base.selectedValue,
      treatmentValue: next.selectedValue,
      controlClass: base.failureClass,
      treatmentClass: next.failureClass,
      behavioralChange:
        canonicalStringify(controlBehavior) !== canonicalStringify(treatmentBehavior),
    };
  });
  const behavioralDeltaCount = caseDeltas.filter((item) => item.behavioralChange).length;
  const correctDelta = treatment.metrics.correctCount - control.metrics.correctCount;
  const falseCertaintyDelta =
    treatment.metrics.falseCertaintyCount - control.metrics.falseCertaintyCount;
  const noOp = definition.declaredVariable === "none";
  const decision =
    noOp && behavioralDeltaCount === 0
      ? "NO_OP_CONFIRMED"
      : falseCertaintyDelta > 0
        ? "KILL"
        : correctDelta > 0
          ? "PASS"
          : "KILL";
  const decisionReason =
    decision === "NO_OP_CONFIRMED"
      ? "Identical configurations produced zero behavioral deltas."
      : decision === "PASS"
        ? "The treatment improved at least one fixed-truth case without increasing false certainty."
        : falseCertaintyDelta > 0
          ? "Kill criterion hit: false certainty increased."
          : "Kill criterion hit: no fixed-truth improvement.";
  return {
    experimentId: definition.experimentId,
    declaredVariable: definition.declaredVariable,
    changedVariables: isolation.changedVariables,
    noOp,
    behavioralDeltaCount,
    correctDelta,
    falseCertaintyDelta,
    medianLatencyDeltaMs: subtractNullable(
      treatment.metrics.medianLatencyMs,
      control.metrics.medianLatencyMs,
    ),
    p95LatencyDeltaMs: subtractNullable(
      treatment.metrics.p95LatencyMs,
      control.metrics.p95LatencyMs,
    ),
    caseDeltas,
    decision,
    decisionReason,
  };
}

function renderDiff(diff: ExperimentDiff): string {
  const cases = diff.caseDeltas
    .map(
      (item) =>
        `| ${item.caseId} | ${item.controlValue ?? ""} | ${item.treatmentValue ?? ""} | ${item.controlClass} | ${item.treatmentClass} | ${String(item.behavioralChange)} |`,
    )
    .join("\n");
  return `# Deterministic experiment diff

- Declared variable: \`${diff.declaredVariable}\`
- Behavioral delta count: ${diff.behavioralDeltaCount}
- Correct delta: ${diff.correctDelta}
- False-certainty delta: ${diff.falseCertaintyDelta}
- Median latency delta ms: ${diff.medianLatencyDeltaMs ?? "not available"}
- P95 latency delta ms: ${diff.p95LatencyDeltaMs ?? "not available"}
- Decision: \`${diff.decision}\` — ${diff.decisionReason}

| Case | Control selected | Treatment selected | Control class | Treatment class | Behavior changed |
| --- | --- | --- | --- | --- | --- |
${cases}
`;
}

export async function runOcrExperiment(options: {
  definition: unknown;
  manifest: ResearchManifest;
  outputRoot: string;
  executor?: typeof executeOcrCase;
  engineFactory?: () => Promise<OcrEngine>;
}): Promise<ExperimentOutputs> {
  const validated = validateConfigurationIsolation(options.definition);
  const { isolation, ...definition } = validated;
  rmSync(options.outputRoot, { recursive: true, force: true });
  mkdirSync(options.outputRoot, { recursive: true });
  const control = await runArm({
    definition,
    manifest: options.manifest,
    arm: "control",
    configuration: definition.control,
    outputRoot: options.outputRoot,
    executor: options.executor,
    engineFactory: options.engineFactory,
  });
  const eligibility = treatmentEligibility(control);
  if (definition.declaredVariable !== "none" && !eligibility.allowed) {
    throw new Error(`TREATMENT_INELIGIBLE: ${eligibility.reasons.join("; ")}`);
  }
  const treatment = await runArm({
    definition,
    manifest: options.manifest,
    arm: "treatment",
    configuration: definition.treatment,
    outputRoot: options.outputRoot,
    executor: options.executor,
    engineFactory: options.engineFactory,
  });
  const diff = buildDiff(definition, isolation, control, treatment);
  mkdirSync(path.join(options.outputRoot, "diff"), { recursive: true });
  writeFileSync(
    path.join(options.outputRoot, "definition.json"),
    `${JSON.stringify(definition, null, 2)}\n`,
  );
  writeFileSync(
    path.join(options.outputRoot, "eligibility.json"),
    `${JSON.stringify(eligibility, null, 2)}\n`,
  );
  writeFileSync(
    path.join(options.outputRoot, "diff/report.json"),
    `${JSON.stringify(diff, null, 2)}\n`,
  );
  writeFileSync(path.join(options.outputRoot, "diff/metrics.md"), renderDiff(diff));
  return { definition, isolation, eligibility, control, treatment, diff };
}

export function experimentSchemaJson(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Label Lens OCR one-variable experiment",
    type: "object",
    required: [
      "schemaVersion",
      "experimentId",
      "design",
      "declaredVariable",
      "control",
      "treatment",
    ],
    properties: {
      schemaVersion: { const: OCR_EXPERIMENT_SCHEMA_VERSION },
      experimentId: { type: "string" },
      design: { const: "one-variable-at-a-time" },
      declaredVariable: { enum: ["none", ...OCR_EXPERIMENT_VARIABLES] },
      control: { $ref: "#/$defs/configuration" },
      treatment: { $ref: "#/$defs/configuration" },
    },
    additionalProperties: false,
    $defs: {
      configuration: {
        type: "object",
        required: [...OCR_EXPERIMENT_VARIABLES],
        properties: {
          scale: { type: "number", exclusiveMinimum: 0, maximum: 8 },
          padding: {
            type: "object",
            required: ["ratio", "minPx"],
            properties: {
              ratio: { type: "number", minimum: 0, maximum: 0.5 },
              minPx: { type: "integer", minimum: 0, maximum: 512 },
            },
            additionalProperties: false,
          },
          grayscaleMethod: { enum: ["sharp-grayscale", "none"] },
          contrastMethod: { enum: ["normalise", "none"] },
          thresholdMethod: { enum: ["none", "global-128", "otsu", "adaptive"] },
          sharpening: { enum: ["none", "mild"] },
          inversion: { type: "boolean" },
          denoising: { enum: ["none", "median-3"] },
          psm: { type: "integer", minimum: 0, maximum: 13 },
          rotation: { enum: [0, 90, 180, 270] },
          cropSource: {
            enum: ["governed-brand-region", "seller-region", "full-image"],
          },
          fieldType: {
            enum: ["brandName", "governmentWarning", "alcoholStatement"],
          },
        },
        additionalProperties: false,
      },
    },
  };
}

export function reportSchemaJson(): Record<string, unknown> {
  const wilsonInterval = {
    type: "object",
    required: ["confidenceLevel", "lower", "upper"],
    properties: {
      confidenceLevel: { const: 0.95 },
      lower: { type: ["number", "null"], minimum: 0, maximum: 1 },
      upper: { type: ["number", "null"], minimum: 0, maximum: 1 },
    },
    additionalProperties: false,
  };
  const metricProperties = {
    caseCount: { type: "integer", minimum: 0 },
    correctCount: { type: "integer", minimum: 0 },
    accuracy: { type: ["number", "null"], minimum: 0, maximum: 1 },
    accuracyWilson95: wilsonInterval,
    falseCertaintyCount: { type: "integer", minimum: 0 },
    falseCertaintyRate: { type: ["number", "null"], minimum: 0, maximum: 1 },
    falseCertaintyWilson95: wilsonInterval,
    medianLatencyMs: { type: ["number", "null"], minimum: 0 },
    p95LatencyMs: { type: ["number", "null"], minimum: 0 },
    failureClassCounts: {
      type: "object",
      additionalProperties: { type: "integer", minimum: 0 },
    },
  };
  const metricRequired = Object.keys(metricProperties);
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Label Lens OCR experiment report",
    type: "object",
    required: [
      "schemaVersion",
      "experimentId",
      "arm",
      "configuration",
      "configurationHash",
      "behaviorHash",
      "gitSha",
      "environment",
      "metrics",
      "cases",
    ],
    properties: {
      schemaVersion: { const: OCR_REPORT_SCHEMA_VERSION },
      experimentId: { type: "string" },
      arm: { enum: ["control", "treatment"] },
      configuration: { type: "object" },
      configurationHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      behaviorHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      gitSha: { type: "string" },
      environment: {
        type: "object",
        required: ["node", "platform", "architecture", "sharp", "ocrEngine"],
        properties: {
          node: { type: "string" },
          platform: { type: "string" },
          architecture: { type: "string" },
          sharp: { type: "string" },
          ocrEngine: { type: "string" },
        },
        additionalProperties: false,
      },
      metrics: {
        type: "object",
        required: [
          "governedFixtureCount",
          ...metricRequired,
          "failureCount",
          "medianRssDeltaBytes",
          "sliceMetrics",
        ],
        properties: {
          governedFixtureCount: { type: "integer", minimum: 0 },
          failureCount: { type: "integer", minimum: 0 },
          medianRssDeltaBytes: { type: ["number", "null"] },
          ...metricProperties,
          sliceMetrics: {
            type: "object",
            additionalProperties: {
              type: "object",
              required: metricRequired,
              properties: metricProperties,
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
      cases: {
        type: "array",
        items: {
          type: "object",
          required: [
            "caseId",
            "fixtureId",
            "slices",
            "expectedValues",
            "rawTranscript",
            "rawWords",
            "selectedValue",
            "selectedState",
            "reliable",
            "correct",
            "falseCertainty",
            "failureClass",
            "latencyMs",
            "memory",
            "artifactPaths",
          ],
        },
      },
    },
    additionalProperties: false,
  };
}

export function warningTruthMatches(expected: string, observed: string): boolean {
  return (
    normalizeGovernmentWarningForComparison(expected) ===
    normalizeGovernmentWarningForComparison(observed)
  );
}
