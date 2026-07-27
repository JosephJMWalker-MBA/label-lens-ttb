import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { format, resolveConfig } from "prettier";
import sharp from "sharp";

import {
  BASELINE_CASES,
  boundedValueEquivalent,
  cropPlanForCase,
  normalizedRegion,
  normalizedTranscript,
  sourceBytes,
  type BaselineCaseDefinition,
  type FieldType,
  type FailureTaxonomy,
  type PixelBox,
} from "@/fixtures/eval/issue-149-bounded-baseline";
import {
  selectAlcoholObservation,
  selectBrandObservation,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";
import { sha256Hex } from "@/pipeline/extractor/image-integrity";
import { createLocalOcrEngine, PAGE_SEG, type OcrEngine } from "@/pipeline/extractor/ocr-engine";
import {
  planSellerRegionOcrPass,
  runOcrPass,
  type PlannedOcrPass,
} from "@/pipeline/extractor/regions";
import type {
  RegionOcrResult,
  SellerRegionMachineReading,
  SellerRegionOcrTarget,
} from "@/pipeline/extractor/extractor.types";

const OUTPUT_DIR = path.join(process.cwd(), "artifacts/issue-149-segmentation-experiment");
const CONTROL_PSM = PAGE_SEG.SPARSE_TEXT;
const TREATMENT_PSM = PAGE_SEG.SINGLE_LINE;
const RELIABILITY_CONFIDENCE_FLOOR = 0.8;

type Arm = "control" | "treatment";

interface CaseRun {
  caseId: string;
  fieldType: FieldType;
  expectedSellerValue: string;
  panelId: string;
  fixtureName: string;
  arm: Arm;
  psm: number;
  psmLabel: string;
  originalImage: { width: number; height: number; sha256: string };
  normalizedSellerGeometry: SellerRegionOcrTarget["region"];
  unpaddedPixelCrop: PixelBox;
  paddedPixelCrop: PixelBox;
  cropPixelsSha256: string;
  finalOcrInputSha256: string;
  cropGeometryMatchesControl: boolean;
  cropPixelsMatchControl: boolean;
  preprocessingMatchesControl: boolean;
  scalingMatchesControl: boolean;
  finalOcrInputMatchesControl: boolean;
  preprocessingSteps: string[];
  scaleFactor: number;
  finalOcrImageDimensions: { width: number; height: number };
  rawBoundedOcrTranscript: string;
  normalizedBoundedTranscript: string;
  boundedObservedValue: string | null;
  boundedNormalizedValue: string | null;
  ocrConfidence: number;
  boundedReliabilityState: SellerRegionMachineReading["reliabilityState"];
  boundedReliabilityReason: string;
  exactBoundedRead: boolean;
  normalizedBoundedRead: boolean;
  readableRegionHit: boolean;
  correctInsufficientEvidenceRouting: boolean;
  falseReliableRead: boolean;
  primaryFailureTaxonomy: FailureTaxonomy;
  latencyMs: { boundedOcr: number };
  brandTypography?: string;
  alcoholOrientation?: string;
  secondaryContributingFactors: string[];
  artifacts: {
    finalOcrInput: string;
    transcript: string;
  };
}

interface CaseDiff {
  caseId: string;
  fieldType: FieldType;
  controlValue: string | null;
  treatmentValue: string | null;
  controlTranscript: string;
  treatmentTranscript: string;
  controlCategory: FailureTaxonomy;
  treatmentCategory: FailureTaxonomy;
  normalizedReadDelta: number;
  falseReliableReadDelta: number;
  boundedLatencyDeltaMs: number;
  outcomeChange: string;
}

interface ExperimentReport {
  schemaVersion: "issue-149-segmentation-experiment.v1";
  arm: Arm;
  config: {
    segmentationMode: number;
    segmentationLabel: string;
    cropGeometryChanged: false;
    paddingChanged: false;
    clippingChanged: false;
    scaleChanged: false;
    preprocessingChanged: false;
    orientationChanged: false;
    reliabilityThresholdChanged: false;
    comparisonSemanticsChanged: false;
    productionReplacementEnabled: false;
  };
  metrics: ReturnType<typeof summarizeMetrics>;
  cases: CaseRun[];
}

interface ExperimentOutputs {
  control: ExperimentReport;
  treatment: ExperimentReport;
  diffs: CaseDiff[];
  decision: {
    hypothesis: string;
    passed: boolean;
    killCriterionHit: boolean;
    recommendation: "adopt" | "reject" | "run narrower follow-up";
    reason: string;
  };
}

function ensureCleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "control"), { recursive: true });
  mkdirSync(path.join(dir, "treatment"), { recursive: true });
  mkdirSync(path.join(dir, "diff"), { recursive: true });
  mkdirSync(path.join(dir, "representative-ocr-inputs", "control"), { recursive: true });
  mkdirSync(path.join(dir, "representative-ocr-inputs", "treatment"), { recursive: true });
  mkdirSync(path.join(dir, "transcripts", "control"), { recursive: true });
  mkdirSync(path.join(dir, "transcripts", "treatment"), { recursive: true });
}

function posixRelative(filePath: string): string {
  return path.relative(OUTPUT_DIR, filePath).split(path.sep).join("/");
}

function currentGitSha(): string {
  if (process.env.GIT_SHA_OVERRIDE) return process.env.GIT_SHA_OVERRIDE;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
  } catch {
    return "unavailable";
  }
}

async function writeFormattedJson(filePath: string, value: unknown): Promise<void> {
  const config = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(JSON.stringify(value), {
    ...config,
    filepath: filePath,
    parser: "json",
  });
  writeFileSync(filePath, formatted);
}

export function treatmentPassFromControl(pass: PlannedOcrPass): PlannedOcrPass {
  return { ...pass, pageSegMode: TREATMENT_PSM };
}

export function passInvariantProjection(pass: PlannedOcrPass): Omit<PlannedOcrPass, "pageSegMode"> {
  const projection: Partial<PlannedOcrPass> = { ...pass };
  delete projection.pageSegMode;
  return projection as Omit<PlannedOcrPass, "pageSegMode">;
}

function selectionFor(fieldType: FieldType, result: RegionOcrResult): FieldSelection {
  return fieldType === "brandName"
    ? selectBrandObservation([result])
    : selectAlcoholObservation([result]);
}

function wordsInOriginalOrder(result: RegionOcrResult) {
  return [...result.words].sort((a, b) => {
    const ay = a.originalGeometry
      ? a.originalGeometry.y + a.originalGeometry.height / 2
      : a.bbox.y0;
    const by = b.originalGeometry
      ? b.originalGeometry.y + b.originalGeometry.height / 2
      : b.bbox.y0;
    if (Math.abs(ay - by) > 20) return ay - by;
    const ax = a.originalGeometry ? a.originalGeometry.x : a.bbox.x0;
    const bx = b.originalGeometry ? b.originalGeometry.x : b.bbox.x0;
    return ax - bx;
  });
}

function rawTranscript(result: RegionOcrResult): string {
  return wordsInOriginalOrder(result)
    .map((word) => word.text)
    .join(" ")
    .trim();
}

function reliabilityFor(selection: FieldSelection): {
  state: SellerRegionMachineReading["reliabilityState"];
  reason: string;
} {
  const observation = selection.observation;
  if (
    observation.state === "OBSERVED" &&
    observation.ocrEvidenceScore >= RELIABILITY_CONFIDENCE_FLOOR
  ) {
    return {
      state: "RELIABLE",
      reason:
        "Bounded OCR produced an observed value above the unchanged machine confidence floor.",
    };
  }
  return {
    state: "UNRELIABLE",
    reason:
      "Bounded OCR did not produce a high-confidence observed value under the unchanged reliability floor.",
  };
}

function classify(args: {
  definition: BaselineCaseDefinition;
  transcript: string;
  selection: FieldSelection;
  reliabilityState: SellerRegionMachineReading["reliabilityState"];
}): FailureTaxonomy {
  if (!args.definition.expectedReadable) {
    return args.reliabilityState === "UNRELIABLE"
      ? "RELIABILITY_GATE_CORRECT"
      : "RELIABILITY_GATE_WRONG";
  }
  const normalizedRead = boundedValueEquivalent(
    args.definition.fieldType,
    args.definition.expectedSellerValue,
    args.selection.observation.value,
  );
  if (normalizedRead) return "CORRECT_READ";
  if (!args.transcript) return "OCR_RECOGNITION_MISS";
  if (!args.selection.observation.value) return "CANDIDATE_GROUPING_MISS";
  return "SELECTOR_MISS_WITH_OCR_HIT";
}

async function finalOcrInput(bytes: Uint8Array, pass: PlannedOcrPass): Promise<Buffer> {
  const { crop, rotate, scale } = pass.transform;
  let pipeline = sharp(Buffer.from(bytes)).extract(crop);
  if (rotate) pipeline = sharp(await pipeline.rotate(rotate).toBuffer());
  const meta = await pipeline.metadata();
  return await pipeline
    .resize({
      width: Math.max(1, Math.round((meta.width ?? crop.width) * scale)),
      kernel: "cubic",
    })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();
}

async function cropBytes(bytes: Uint8Array, pass: PlannedOcrPass): Promise<Buffer> {
  return await sharp(Buffer.from(bytes)).extract(pass.transform.crop).png().toBuffer();
}

function psmLabel(psm: number): string {
  if (psm === PAGE_SEG.SPARSE_TEXT) return "PSM 11 sparse text";
  if (psm === PAGE_SEG.SINGLE_LINE) return "PSM 7 single line";
  return `PSM ${psm}`;
}

async function runCaseArm(args: {
  definition: BaselineCaseDefinition;
  arm: Arm;
  bytes: Uint8Array;
  image: { width: number; height: number; sha256: string };
  engine: OcrEngine;
  control?: CaseRun;
}): Promise<CaseRun> {
  const { definition, arm, bytes, image, engine, control } = args;
  const region = normalizedRegion(definition.selectedPixelRegion, image.width, image.height);
  const target: SellerRegionOcrTarget = {
    categoryId: definition.fieldType,
    regionId: `${definition.caseId}-${definition.fieldType}`,
    panelId: definition.panelId,
    region,
  };
  const controlPass = planSellerRegionOcrPass(target, image.width, image.height, 1);
  if (!controlPass) throw new Error(`seller-region pass was not planned for ${definition.caseId}`);
  const pass = arm === "control" ? controlPass : treatmentPassFromControl(controlPass);
  const result = await runOcrPass(bytes, pass, engine);
  const selection = selectionFor(definition.fieldType, result);
  const transcript = rawTranscript(result);
  const reliability = reliabilityFor(selection);
  const cropPlan = cropPlanForCase(definition, image);
  if (!cropPlan) throw new Error(`crop plan missing for ${definition.caseId}`);
  const crop = await cropBytes(bytes, pass);
  const finalInput = await finalOcrInput(bytes, pass);
  const finalOcrInputPath = path.join(
    OUTPUT_DIR,
    "representative-ocr-inputs",
    arm,
    `${definition.caseId}.png`,
  );
  const transcriptPath = path.join(OUTPUT_DIR, "transcripts", arm, `${definition.caseId}.txt`);
  writeFileSync(finalOcrInputPath, finalInput);
  writeFileSync(transcriptPath, `${transcript}\n`);
  const normalizedRead = boundedValueEquivalent(
    definition.fieldType,
    definition.expectedSellerValue,
    selection.observation.value,
  );
  const falseReliableRead = reliability.state === "RELIABLE" && !normalizedRead;
  return {
    caseId: definition.caseId,
    fieldType: definition.fieldType,
    expectedSellerValue: definition.expectedSellerValue,
    panelId: definition.panelId,
    fixtureName: definition.fixtureName,
    arm,
    psm: pass.pageSegMode,
    psmLabel: psmLabel(pass.pageSegMode),
    originalImage: image,
    normalizedSellerGeometry: region,
    unpaddedPixelCrop: cropPlan.selectedRegionPixelGeometry,
    paddedPixelCrop: cropPlan.crop,
    cropPixelsSha256: sha256Hex(crop),
    finalOcrInputSha256: sha256Hex(finalInput),
    cropGeometryMatchesControl: control
      ? JSON.stringify(cropPlan.crop) === JSON.stringify(control.paddedPixelCrop)
      : true,
    cropPixelsMatchControl: control ? sha256Hex(crop) === control.cropPixelsSha256 : true,
    preprocessingMatchesControl: control
      ? JSON.stringify(pass.preprocessing) === JSON.stringify(control.preprocessingSteps)
      : true,
    scalingMatchesControl: control ? pass.transform.scale === control.scaleFactor : true,
    finalOcrInputMatchesControl: control
      ? sha256Hex(finalInput) === control.finalOcrInputSha256
      : true,
    preprocessingSteps: pass.preprocessing,
    scaleFactor: pass.transform.scale,
    finalOcrImageDimensions: result.transformedSize,
    rawBoundedOcrTranscript: transcript,
    normalizedBoundedTranscript: normalizedTranscript(transcript),
    boundedObservedValue: selection.observation.value,
    boundedNormalizedValue: selection.observation.normalizedValue ?? null,
    ocrConfidence: selection.observation.ocrEvidenceScore,
    boundedReliabilityState: reliability.state,
    boundedReliabilityReason: reliability.reason,
    exactBoundedRead: selection.observation.value === definition.expectedSellerValue,
    normalizedBoundedRead: normalizedRead,
    readableRegionHit: definition.expectedReadable && transcript.length > 0,
    correctInsufficientEvidenceRouting:
      !definition.expectedReadable && reliability.state === "UNRELIABLE",
    falseReliableRead,
    primaryFailureTaxonomy: classify({
      definition,
      transcript,
      selection,
      reliabilityState: reliability.state,
    }),
    latencyMs: { boundedOcr: result.timings.totalMs },
    brandTypography: definition.brandTypography,
    alcoholOrientation: definition.alcoholOrientation,
    secondaryContributingFactors: definition.secondaryFactors ?? [],
    artifacts: {
      finalOcrInput: posixRelative(finalOcrInputPath),
      transcript: posixRelative(transcriptPath),
    },
  };
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null;
}

function metricsFor(records: CaseRun[], fieldType: FieldType) {
  const fieldRecords = records.filter((record) => record.fieldType === fieldType);
  const readable = fieldRecords.filter(
    (record) => BASELINE_CASES.find((item) => item.caseId === record.caseId)?.expectedReadable,
  );
  const insufficientExpected = fieldRecords.filter(
    (record) => !BASELINE_CASES.find((item) => item.caseId === record.caseId)?.expectedReadable,
  );
  return {
    caseCount: fieldRecords.length,
    exactBoundedReadAccuracy: rate(
      fieldRecords.filter((record) => record.exactBoundedRead).length,
      fieldRecords.length,
    ),
    normalizedBoundedReadAccuracy: rate(
      fieldRecords.filter((record) => record.normalizedBoundedRead).length,
      fieldRecords.length,
    ),
    readableRegionRecall: rate(
      readable.filter((record) => record.readableRegionHit).length,
      readable.length,
    ),
    candidateGroupingMisses: fieldRecords.filter(
      (record) => record.primaryFailureTaxonomy === "CANDIDATE_GROUPING_MISS",
    ).length,
    selectorMissesWithOcrHit: fieldRecords.filter(
      (record) => record.primaryFailureTaxonomy === "SELECTOR_MISS_WITH_OCR_HIT",
    ).length,
    correctInsufficientRouting: rate(
      insufficientExpected.filter((record) => record.correctInsufficientEvidenceRouting).length,
      insufficientExpected.length,
    ),
    falseReliableReadRate: rate(
      fieldRecords.filter((record) => record.falseReliableRead).length,
      fieldRecords.length,
    ),
    medianBoundedOcrLatencyMs: median(fieldRecords.map((record) => record.latencyMs.boundedOcr)),
    p95BoundedOcrLatencyMs: p95(fieldRecords.map((record) => record.latencyMs.boundedOcr)),
  };
}

function summarizeMetrics(records: CaseRun[]) {
  return {
    brand: {
      ...metricsFor(records, "brandName"),
      byTypography: Object.fromEntries(
        [
          "clean typography",
          "stylized typography",
          "curved or decorative text",
          "low-resolution text",
        ].map((slice) => [
          slice,
          metricsFor(
            records.filter((record) => record.brandTypography === slice),
            "brandName",
          ),
        ]),
      ),
    },
    alcohol: {
      ...metricsFor(records, "alcoholStatement"),
      byOrientation: Object.fromEntries(
        ["horizontal", "bottom", "side", "rotated", "vertical"].map((slice) => [
          slice,
          metricsFor(
            records.filter(
              (record) =>
                record.alcoholOrientation === slice ||
                record.secondaryContributingFactors.includes(slice),
            ),
            "alcoholStatement",
          ),
        ]),
      ),
    },
  };
}

function reportFor(arm: Arm, cases: CaseRun[]): ExperimentReport {
  const psm = arm === "control" ? CONTROL_PSM : TREATMENT_PSM;
  return {
    schemaVersion: "issue-149-segmentation-experiment.v1",
    arm,
    config: {
      segmentationMode: psm,
      segmentationLabel: psmLabel(psm),
      cropGeometryChanged: false,
      paddingChanged: false,
      clippingChanged: false,
      scaleChanged: false,
      preprocessingChanged: false,
      orientationChanged: false,
      reliabilityThresholdChanged: false,
      comparisonSemanticsChanged: false,
      productionReplacementEnabled: false,
    },
    metrics: summarizeMetrics(cases),
    cases,
  };
}

function buildDiffs(control: CaseRun[], treatment: CaseRun[]): CaseDiff[] {
  return control.map((controlCase) => {
    const treatmentCase = treatment.find((item) => item.caseId === controlCase.caseId);
    if (!treatmentCase) throw new Error(`missing treatment case ${controlCase.caseId}`);
    return {
      caseId: controlCase.caseId,
      fieldType: controlCase.fieldType,
      controlValue: controlCase.boundedObservedValue,
      treatmentValue: treatmentCase.boundedObservedValue,
      controlTranscript: controlCase.rawBoundedOcrTranscript,
      treatmentTranscript: treatmentCase.rawBoundedOcrTranscript,
      controlCategory: controlCase.primaryFailureTaxonomy,
      treatmentCategory: treatmentCase.primaryFailureTaxonomy,
      normalizedReadDelta:
        Number(treatmentCase.normalizedBoundedRead) - Number(controlCase.normalizedBoundedRead),
      falseReliableReadDelta:
        Number(treatmentCase.falseReliableRead) - Number(controlCase.falseReliableRead),
      boundedLatencyDeltaMs: treatmentCase.latencyMs.boundedOcr - controlCase.latencyMs.boundedOcr,
      outcomeChange:
        controlCase.primaryFailureTaxonomy === treatmentCase.primaryFailureTaxonomy
          ? "unchanged"
          : `${controlCase.primaryFailureTaxonomy} -> ${treatmentCase.primaryFailureTaxonomy}`,
    };
  });
}

function decide(
  outputs: Pick<ExperimentOutputs, "control" | "treatment" | "diffs">,
): ExperimentOutputs["decision"] {
  const normalizedGain =
    (outputs.treatment.metrics.brand.normalizedBoundedReadAccuracy ?? 0) -
    (outputs.control.metrics.brand.normalizedBoundedReadAccuracy ?? 0) +
    ((outputs.treatment.metrics.alcohol.normalizedBoundedReadAccuracy ?? 0) -
      (outputs.control.metrics.alcohol.normalizedBoundedReadAccuracy ?? 0));
  const falseReliableIncrease = outputs.diffs.some((diff) => diff.falseReliableReadDelta > 0);
  const unreadable = outputs.treatment.cases.find(
    (record) => record.caseId === "alcohol-unreadable-selected-region",
  );
  const unreadableStillInsufficient = unreadable?.correctInsufficientEvidenceRouting === true;
  const groupingImprovement = outputs.diffs.some(
    (diff) =>
      diff.controlCategory === "CANDIDATE_GROUPING_MISS" &&
      diff.treatmentCategory !== "CANDIDATE_GROUPING_MISS",
  );
  const passed =
    (normalizedGain > 0 || groupingImprovement) &&
    !falseReliableIncrease &&
    unreadableStillInsufficient;
  if (passed) {
    return {
      hypothesis:
        "PSM 7 improves bounded seller-region transcript construction without changing crop or authority policy.",
      passed: true,
      killCriterionHit: false,
      recommendation: "run narrower follow-up",
      reason:
        "The treatment improved at least one target metric without increasing false reliable reads; run a narrower field/layout slice before adoption.",
    };
  }
  return {
    hypothesis:
      "PSM 7 improves bounded seller-region transcript construction without changing crop or authority policy.",
    passed: false,
    killCriterionHit: true,
    recommendation: "reject",
    reason:
      "The treatment did not produce a meaningful normalized-read or grouping improvement under the fixed corpus decision rules.",
  };
}

function renderConfig(): string {
  return `# Issue #149 segmentation experiment

Single variable under test: Segmentation mode for bounded seller-region OCR only.

Control: ${psmLabel(CONTROL_PSM)}.

Treatment: ${psmLabel(TREATMENT_PSM)}.

The treatment is evaluation-only. It does not alter production OCR behavior and does not replace the control result in package analysis.

Held constant: seller geometry, padding, clipping, scale factor, image preprocessing, orientation policy, OCR confidence thresholds, brand authority rules, alcohol parsing, candidate ranking outside transcript grouping, two-stream comparison semantics, and UI behavior.

Staging label policy: the latest staging upload is not added because no source image was identified as an already committed, non-private fixture.
`;
}

function renderMetrics(outputs: ExperimentOutputs): string {
  const rows = [
    [
      "Field",
      "Control normalized",
      "Treatment normalized",
      "Grouping misses delta",
      "Selector misses delta",
      "False reliable delta",
      "Median latency delta ms",
    ],
    ...(["brand", "alcohol"] as const).map((field) => {
      const c = outputs.control.metrics[field];
      const t = outputs.treatment.metrics[field];
      return [
        field,
        c.normalizedBoundedReadAccuracy ?? "n/a",
        t.normalizedBoundedReadAccuracy ?? "n/a",
        t.candidateGroupingMisses - c.candidateGroupingMisses,
        t.selectorMissesWithOcrHit - c.selectorMissesWithOcrHit,
        (t.falseReliableReadRate ?? 0) - (c.falseReliableReadRate ?? 0),
        ((t.medianBoundedOcrLatencyMs ?? 0) - (c.medianBoundedOcrLatencyMs ?? 0)).toFixed(1),
      ];
    }),
  ];
  const table = rows
    .map((row, index) =>
      index === 0
        ? `| ${row.join(" | ")} |\n| ${row.map(() => "---").join(" | ")} |`
        : `| ${row.join(" | ")} |`,
    )
    .join("\n");
  const cases = outputs.diffs
    .map(
      (diff) =>
        `| ${diff.caseId} | ${diff.fieldType} | ${diff.controlValue ?? ""} | ${diff.treatmentValue ?? ""} | ${diff.outcomeChange} | ${diff.boundedLatencyDeltaMs.toFixed(1)} |`,
    )
    .join("\n");
  return `# Segmentation experiment metric diff

${table}

## Per-case changes

| Case | Field | Control value | Treatment value | Outcome change | Latency delta ms |
| --- | --- | --- | --- | --- | --- |
${cases}

## Decision

${outputs.decision.recommendation.toUpperCase()}: ${outputs.decision.reason}
`;
}

export async function generateIssue149SegmentationExperiment(): Promise<ExperimentOutputs> {
  ensureCleanDir(OUTPUT_DIR);
  const controlCases: CaseRun[] = [];
  const treatmentCases: CaseRun[] = [];
  const engine = await createLocalOcrEngine();
  try {
    for (const definition of BASELINE_CASES) {
      const bytes = await sourceBytes(definition.source);
      const sha = sha256Hex(bytes);
      const meta = await sharp(Buffer.from(bytes)).metadata();
      const image = { width: meta.width ?? 0, height: meta.height ?? 0, sha256: sha };
      const control = await runCaseArm({ definition, arm: "control", bytes, image, engine });
      controlCases.push(control);
      treatmentCases.push(
        await runCaseArm({ definition, arm: "treatment", bytes, image, engine, control }),
      );
    }
  } finally {
    await engine.terminate();
  }
  const control = reportFor("control", controlCases);
  const treatment = reportFor("treatment", treatmentCases);
  const diffs = buildDiffs(controlCases, treatmentCases);
  const outputs: ExperimentOutputs = {
    control,
    treatment,
    diffs,
    decision: decide({ control, treatment, diffs }),
  };
  writeFileSync(path.join(OUTPUT_DIR, "config.md"), renderConfig());
  writeFileSync(
    path.join(OUTPUT_DIR, "commands.sh"),
    "#!/usr/bin/env bash\nset -euo pipefail\nnpm run eval:issue-149-segmentation-experiment\n",
    { mode: 0o755 },
  );
  writeFileSync(path.join(OUTPUT_DIR, "git-sha.txt"), `${currentGitSha()}\n`);
  await writeFormattedJson(path.join(OUTPUT_DIR, "control", "report.json"), control);
  await writeFormattedJson(path.join(OUTPUT_DIR, "treatment", "report.json"), treatment);
  writeFileSync(path.join(OUTPUT_DIR, "diff", "metrics.md"), renderMetrics(outputs));
  writeFileSync(
    path.join(OUTPUT_DIR, "cases.jsonl"),
    outputs.diffs.map((diff) => JSON.stringify(diff)).join("\n") + "\n",
  );
  return outputs;
}
