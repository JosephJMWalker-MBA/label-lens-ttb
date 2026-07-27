import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { format, resolveConfig } from "prettier";
import sharp from "sharp";

import {
  parseDeclaredAlcoholValue,
  parseWineAlcoholStatement,
} from "@/domain/rules/wine-alcohol-parse";
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
  type SyntheticImage,
} from "@/fixtures/eval/issue-149-bounded-baseline";
import {
  selectAlcoholObservation,
  selectBrandObservation,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";
import type {
  RegionOcrResult,
  SellerRegionMachineReading,
  SellerRegionOcrTarget,
} from "@/pipeline/extractor/extractor.types";
import { sha256Hex } from "@/pipeline/extractor/image-integrity";
import { createLocalOcrEngine, PAGE_SEG, type OcrEngine } from "@/pipeline/extractor/ocr-engine";
import {
  planSellerRegionOcrPass,
  runOcrPass,
  type PlannedOcrPass,
} from "@/pipeline/extractor/regions";

const OUTPUT_DIR = path.join(process.cwd(), "artifacts/issue-149-alcohol-layout-segmentation");
const CONTROL_PSM = PAGE_SEG.SPARSE_TEXT;
const TREATMENT_PSM = PAGE_SEG.SINGLE_LINE;
const RELIABILITY_CONFIDENCE_FLOOR = 0.8;

export type AlcoholLayoutClass =
  "horizontal" | "bottom" | "side" | "rotated" | "vertical" | "unreadable";
type Arm = "control" | "treatment";

export interface AlcoholLayoutCaseDefinition extends BaselineCaseDefinition {
  source: SyntheticImage;
  layoutClass: AlcoholLayoutClass | "brand-control";
  treatmentEligible: boolean;
}

interface CaseRun {
  caseId: string;
  fieldType: FieldType;
  expectedSellerValue: string;
  panelId: string;
  fixtureName: string;
  arm: Arm;
  layoutClass: AlcoholLayoutCaseDefinition["layoutClass"];
  treatmentEligible: boolean;
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
  parsedBasisPoints: number | null;
  ocrConfidence: number;
  boundedReliabilityState: SellerRegionMachineReading["reliabilityState"];
  boundedReliabilityReason: string;
  exactBoundedRead: boolean;
  normalizedBoundedRead: boolean;
  parsedValueRead: boolean;
  readableRegionHit: boolean;
  correctInsufficientEvidenceRouting: boolean;
  falseReliableRead: boolean;
  primaryFailureTaxonomy: FailureTaxonomy;
  latencyMs: { boundedOcr: number };
  secondaryContributingFactors: string[];
  artifacts: {
    crop: string;
    finalOcrInput: string;
    transcript: string;
  };
}

interface LayoutMetrics {
  caseCount: number;
  normalizedAlcoholBoundedReadAccuracy: number | null;
  parsedValueAccuracy: number | null;
  readableRegionRecall: number | null;
  candidateGroupingMisses: number;
  ocrRecognitionMisses: number;
  selectorMissesWithOcrHit: number;
  correctInsufficientRouting: number | null;
  falseReliableReadRate: number | null;
  medianBoundedOcrLatencyMs: number | null;
  p95BoundedOcrLatencyMs: number | null;
}

interface CaseDiff {
  caseId: string;
  layoutClass: AlcoholLayoutCaseDefinition["layoutClass"];
  fieldType: FieldType;
  treatmentEligible: boolean;
  controlPsm: number;
  treatmentPsm: number;
  controlValue: string | null;
  treatmentValue: string | null;
  controlParsedBasisPoints: number | null;
  treatmentParsedBasisPoints: number | null;
  controlCategory: FailureTaxonomy;
  treatmentCategory: FailureTaxonomy;
  normalizedReadDelta: number;
  parsedValueDelta: number;
  falseReliableReadDelta: number;
  boundedLatencyDeltaMs: number;
  outcomeChange: string;
}

interface ExperimentReport {
  schemaVersion: "issue-149-alcohol-layout-segmentation.v1";
  arm: Arm;
  config: {
    controlSegmentationMode: number;
    treatmentSegmentationMode: number;
    treatmentPolicy: string;
    cropGeometryChanged: false;
    paddingChanged: false;
    clippingChanged: false;
    scaleChanged: false;
    preprocessingChanged: false;
    orientationChanged: false;
    reliabilityThresholdChanged: false;
    comparisonSemanticsChanged: false;
    fullPanelOcrChanged: false;
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
    recommendation: "adopt later" | "reject" | "run narrower follow-up";
    reason: string;
  };
}

function syntheticPanel(width: number, height: number, body: string): SyntheticImage {
  return {
    kind: "synthetic",
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f8f6ef"/>
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="#202020" stroke-width="3"/>
  ${body}
</svg>`,
  };
}

const baselineSynthetic = BASELINE_CASES.filter(
  (item): item is BaselineCaseDefinition & { source: SyntheticImage } =>
    item.source.kind === "synthetic" &&
    (item.caseId === "brand-minneapolis-synthetic" ||
      item.caseId === "brand-arandano-synthetic-lowres" ||
      item.caseId === "alcohol-clean-horizontal-synthetic" ||
      item.caseId === "alcohol-vertical-side-synthetic" ||
      item.caseId === "alcohol-unreadable-selected-region"),
);

export const ALCOHOL_LAYOUT_CASES: AlcoholLayoutCaseDefinition[] = [
  ...baselineSynthetic.map((item): AlcoholLayoutCaseDefinition => {
    if (item.fieldType === "brandName") {
      return { ...item, layoutClass: "brand-control", treatmentEligible: false };
    }
    if (item.caseId === "alcohol-vertical-side-synthetic") {
      return { ...item, layoutClass: "vertical", treatmentEligible: true };
    }
    if (item.caseId === "alcohol-unreadable-selected-region") {
      return { ...item, layoutClass: "unreadable", treatmentEligible: false };
    }
    return { ...item, layoutClass: "horizontal", treatmentEligible: false };
  }),
  {
    caseId: "alcohol-bottom-centered-synthetic",
    fieldType: "alcoholStatement",
    expectedSellerValue: "ALC. 12.8% BY VOL.",
    panelId: "front",
    fixtureName: "synthetic-no-private-alcohol-bottom-centered",
    source: syntheticPanel(
      920,
      600,
      `<text x="150" y="178" font-family="Arial, Helvetica, sans-serif" font-size="70" font-weight="700" fill="#111">RIDGE PLAIN</text>
  <text x="182" y="546" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#111">ALC. 12.8% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 166, top: 498, width: 500, height: 64 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    alcoholOrientation: "bottom",
    layoutClass: "bottom",
    treatmentEligible: false,
  },
  {
    caseId: "alcohol-side-right-horizontal-synthetic",
    fieldType: "alcoholStatement",
    expectedSellerValue: "ALC. 14.1% BY VOL.",
    panelId: "front",
    fixtureName: "synthetic-no-private-alcohol-side-right-horizontal",
    source: syntheticPanel(
      980,
      640,
      `<text x="104" y="202" font-family="Arial, Helvetica, sans-serif" font-size="70" font-weight="700" fill="#111">SIDE ROW</text>
  <text x="496" y="104" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#111">ALC. 14.1% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 480, top: 66, width: 410, height: 58 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    alcoholOrientation: "side",
    secondaryFactors: ["side"],
    layoutClass: "side",
    treatmentEligible: true,
  },
  {
    caseId: "alcohol-side-left-horizontal-synthetic",
    fieldType: "alcoholStatement",
    expectedSellerValue: "ALC. 11.9% BY VOL.",
    panelId: "front",
    fixtureName: "synthetic-no-private-alcohol-side-left-horizontal",
    source: syntheticPanel(
      980,
      640,
      `<text x="300" y="220" font-family="Arial, Helvetica, sans-serif" font-size="70" font-weight="700" fill="#111">SIDE FIELD</text>
  <text x="72" y="106" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#111">ALC. 11.9% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 58, top: 68, width: 410, height: 58 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    alcoholOrientation: "side",
    secondaryFactors: ["side"],
    layoutClass: "side",
    treatmentEligible: true,
  },
  {
    caseId: "alcohol-rotated-right-synthetic",
    fieldType: "alcoholStatement",
    expectedSellerValue: "ALC. 13.2% BY VOL.",
    panelId: "front",
    fixtureName: "synthetic-no-private-alcohol-rotated-right",
    source: syntheticPanel(
      760,
      960,
      `<text x="126" y="210" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#111">TURN ROW</text>
  <g transform="translate(666 356) rotate(90)">
    <text x="0" y="0" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#111">ALC. 13.2% BY VOL.</text>
  </g>`,
    ),
    selectedPixelRegion: { left: 612, top: 342, width: 64, height: 474 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    alcoholOrientation: "rotated",
    secondaryFactors: ["rotated"],
    layoutClass: "rotated",
    treatmentEligible: true,
  },
  {
    caseId: "alcohol-rotated-left-synthetic",
    fieldType: "alcoholStatement",
    expectedSellerValue: "ALC. 10.7% BY VOL.",
    panelId: "front",
    fixtureName: "synthetic-no-private-alcohol-rotated-left",
    source: syntheticPanel(
      760,
      960,
      `<text x="160" y="238" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#111">TURN LEFT</text>
  <g transform="translate(92 820) rotate(-90)">
    <text x="0" y="0" font-family="Arial, Helvetica, sans-serif" font-size="38" fill="#111">ALC. 10.7% BY VOL.</text>
  </g>`,
    ),
    selectedPixelRegion: { left: 56, top: 352, width: 64, height: 486 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    alcoholOrientation: "rotated",
    secondaryFactors: ["rotated"],
    layoutClass: "rotated",
    treatmentEligible: true,
  },
  {
    caseId: "alcohol-vertical-left-synthetic",
    fieldType: "alcoholStatement",
    expectedSellerValue: "ALC. 12.4% BY VOL.",
    panelId: "front",
    fixtureName: "synthetic-no-private-alcohol-vertical-left",
    source: syntheticPanel(
      760,
      960,
      `<text x="170" y="214" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#111">VERT FIELD</text>
  <g transform="translate(84 820) rotate(-90)">
    <text x="0" y="0" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#111">ALC. 12.4% BY VOL.</text>
  </g>`,
    ),
    selectedPixelRegion: { left: 38, top: 328, width: 76, height: 516 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    alcoholOrientation: "vertical",
    secondaryFactors: ["vertical"],
    layoutClass: "vertical",
    treatmentEligible: true,
  },
];

function ensureCleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  for (const arm of ["control", "treatment"] as const) {
    mkdirSync(path.join(dir, arm), { recursive: true });
    mkdirSync(path.join(dir, "representative-crops", arm), { recursive: true });
    mkdirSync(path.join(dir, "representative-ocr-inputs", arm), { recursive: true });
    mkdirSync(path.join(dir, "transcripts", arm), { recursive: true });
  }
  mkdirSync(path.join(dir, "diff"), { recursive: true });
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

export function treatmentEligibleForAlcoholLayout(
  definition: Pick<AlcoholLayoutCaseDefinition, "fieldType" | "layoutClass" | "treatmentEligible">,
): boolean {
  return (
    definition.fieldType === "alcoholStatement" &&
    definition.treatmentEligible &&
    (definition.layoutClass === "side" ||
      definition.layoutClass === "rotated" ||
      definition.layoutClass === "vertical")
  );
}

export function alcoholLayoutTreatmentPass(
  definition: AlcoholLayoutCaseDefinition,
  pass: PlannedOcrPass,
): PlannedOcrPass {
  if (!treatmentEligibleForAlcoholLayout(definition)) return pass;
  return { ...pass, pageSegMode: TREATMENT_PSM };
}

export function passInvariantProjection(pass: PlannedOcrPass): Omit<PlannedOcrPass, "pageSegMode"> {
  const projection: Partial<PlannedOcrPass> = { ...pass };
  delete projection.pageSegMode;
  return projection as Omit<PlannedOcrPass, "pageSegMode">;
}

export function stableCaseProjection<T extends { latencyMs?: unknown }>(
  record: T,
): Omit<T, "latencyMs"> {
  const projection: Partial<T> = { ...record };
  delete projection.latencyMs;
  return projection as Omit<T, "latencyMs">;
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

function parsedBasisPoints(value: string | null | undefined): number | null {
  if (!value) return null;
  const direct = parseDeclaredAlcoholValue(value);
  if (direct !== null) return direct;
  const parsed = parseWineAlcoholStatement(value);
  return parsed.kind === "direct" ? parsed.basisPoints : null;
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
  definition: AlcoholLayoutCaseDefinition;
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
  definition: AlcoholLayoutCaseDefinition;
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
  const pass =
    arm === "control" ? controlPass : alcoholLayoutTreatmentPass(definition, controlPass);
  const result = await runOcrPass(bytes, pass, engine);
  const selection = selectionFor(definition.fieldType, result);
  const transcript = rawTranscript(result);
  const reliability = reliabilityFor(selection);
  const cropPlan = cropPlanForCase(definition, image);
  if (!cropPlan) throw new Error(`crop plan missing for ${definition.caseId}`);
  const crop = await cropBytes(bytes, pass);
  const finalInput = await finalOcrInput(bytes, pass);
  const cropPath = path.join(OUTPUT_DIR, "representative-crops", arm, `${definition.caseId}.png`);
  const finalOcrInputPath = path.join(
    OUTPUT_DIR,
    "representative-ocr-inputs",
    arm,
    `${definition.caseId}.png`,
  );
  const transcriptPath = path.join(OUTPUT_DIR, "transcripts", arm, `${definition.caseId}.txt`);
  writeFileSync(cropPath, crop);
  writeFileSync(finalOcrInputPath, finalInput);
  writeFileSync(transcriptPath, `${transcript}\n`);
  const normalizedRead = boundedValueEquivalent(
    definition.fieldType,
    definition.expectedSellerValue,
    selection.observation.value,
  );
  const expectedParsed = parsedBasisPoints(definition.expectedSellerValue);
  const observedParsed = parsedBasisPoints(selection.observation.value);
  const parsedValueRead = expectedParsed !== null && observedParsed === expectedParsed;
  const falseReliableRead = reliability.state === "RELIABLE" && !normalizedRead;
  return {
    caseId: definition.caseId,
    fieldType: definition.fieldType,
    expectedSellerValue: definition.expectedSellerValue,
    panelId: definition.panelId,
    fixtureName: definition.fixtureName,
    arm,
    layoutClass: definition.layoutClass,
    treatmentEligible: treatmentEligibleForAlcoholLayout(definition),
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
    parsedBasisPoints: observedParsed,
    ocrConfidence: selection.observation.ocrEvidenceScore,
    boundedReliabilityState: reliability.state,
    boundedReliabilityReason: reliability.reason,
    exactBoundedRead: selection.observation.value === definition.expectedSellerValue,
    normalizedBoundedRead: normalizedRead,
    parsedValueRead,
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
    secondaryContributingFactors: definition.secondaryFactors ?? [],
    artifacts: {
      crop: posixRelative(cropPath),
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

function metricsFor(records: CaseRun[], layoutClass?: AlcoholLayoutClass): LayoutMetrics {
  const alcoholRecords = records.filter(
    (record) =>
      record.fieldType === "alcoholStatement" &&
      (layoutClass === undefined || record.layoutClass === layoutClass),
  );
  const readable = alcoholRecords.filter((record) => record.layoutClass !== "unreadable");
  const insufficientExpected = alcoholRecords.filter(
    (record) => record.layoutClass === "unreadable",
  );
  return {
    caseCount: alcoholRecords.length,
    normalizedAlcoholBoundedReadAccuracy: rate(
      alcoholRecords.filter((record) => record.normalizedBoundedRead).length,
      alcoholRecords.length,
    ),
    parsedValueAccuracy: rate(
      alcoholRecords.filter((record) => record.parsedValueRead).length,
      alcoholRecords.length,
    ),
    readableRegionRecall: rate(
      readable.filter((record) => record.readableRegionHit).length,
      readable.length,
    ),
    candidateGroupingMisses: alcoholRecords.filter(
      (record) => record.primaryFailureTaxonomy === "CANDIDATE_GROUPING_MISS",
    ).length,
    ocrRecognitionMisses: alcoholRecords.filter(
      (record) => record.primaryFailureTaxonomy === "OCR_RECOGNITION_MISS",
    ).length,
    selectorMissesWithOcrHit: alcoholRecords.filter(
      (record) => record.primaryFailureTaxonomy === "SELECTOR_MISS_WITH_OCR_HIT",
    ).length,
    correctInsufficientRouting: rate(
      insufficientExpected.filter((record) => record.correctInsufficientEvidenceRouting).length,
      insufficientExpected.length,
    ),
    falseReliableReadRate: rate(
      alcoholRecords.filter((record) => record.falseReliableRead).length,
      alcoholRecords.length,
    ),
    medianBoundedOcrLatencyMs: median(alcoholRecords.map((record) => record.latencyMs.boundedOcr)),
    p95BoundedOcrLatencyMs: p95(alcoholRecords.map((record) => record.latencyMs.boundedOcr)),
  };
}

function summarizeMetrics(records: CaseRun[]) {
  return {
    alcoholOverall: metricsFor(records),
    byLayout: Object.fromEntries(
      (["horizontal", "bottom", "side", "rotated", "vertical", "unreadable"] as const).map(
        (layout) => [layout, metricsFor(records, layout)],
      ),
    ),
    brandControl: {
      caseCount: records.filter((record) => record.fieldType === "brandName").length,
      changedFinalOcrInputs: records.filter(
        (record) => record.fieldType === "brandName" && !record.finalOcrInputMatchesControl,
      ).length,
      changedPsm: records.filter(
        (record) => record.fieldType === "brandName" && record.psm !== CONTROL_PSM,
      ).length,
    },
  };
}

function reportFor(arm: Arm, cases: CaseRun[]): ExperimentReport {
  return {
    schemaVersion: "issue-149-alcohol-layout-segmentation.v1",
    arm,
    config: {
      controlSegmentationMode: CONTROL_PSM,
      treatmentSegmentationMode: TREATMENT_PSM,
      treatmentPolicy:
        "Apply PSM 7 only to bounded Alcohol statement OCR for side, rotated, or vertical seller-selected regions. Brand, horizontal Alcohol, bottom Alcohol, unreadable, full-panel OCR, and production behavior remain on control.",
      cropGeometryChanged: false,
      paddingChanged: false,
      clippingChanged: false,
      scaleChanged: false,
      preprocessingChanged: false,
      orientationChanged: false,
      reliabilityThresholdChanged: false,
      comparisonSemanticsChanged: false,
      fullPanelOcrChanged: false,
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
      layoutClass: controlCase.layoutClass,
      fieldType: controlCase.fieldType,
      treatmentEligible: controlCase.treatmentEligible,
      controlPsm: controlCase.psm,
      treatmentPsm: treatmentCase.psm,
      controlValue: controlCase.boundedObservedValue,
      treatmentValue: treatmentCase.boundedObservedValue,
      controlParsedBasisPoints: controlCase.parsedBasisPoints,
      treatmentParsedBasisPoints: treatmentCase.parsedBasisPoints,
      controlCategory: controlCase.primaryFailureTaxonomy,
      treatmentCategory: treatmentCase.primaryFailureTaxonomy,
      normalizedReadDelta:
        Number(treatmentCase.normalizedBoundedRead) - Number(controlCase.normalizedBoundedRead),
      parsedValueDelta: Number(treatmentCase.parsedValueRead) - Number(controlCase.parsedValueRead),
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

function metricDelta(
  outputs: Pick<ExperimentOutputs, "control" | "treatment">,
  layout: AlcoholLayoutClass,
  metric: keyof LayoutMetrics,
): number {
  const control = outputs.control.metrics.byLayout[layout][metric];
  const treatment = outputs.treatment.metrics.byLayout[layout][metric];
  if (typeof control !== "number" || typeof treatment !== "number") return 0;
  return treatment - control;
}

function decide(
  outputs: Pick<ExperimentOutputs, "control" | "treatment" | "diffs">,
): ExperimentOutputs["decision"] {
  const targetLayouts: AlcoholLayoutClass[] = ["side", "rotated", "vertical"];
  const normalizedImproved = targetLayouts.some(
    (layout) => metricDelta(outputs, layout, "normalizedAlcoholBoundedReadAccuracy") > 0,
  );
  const parsedImproved = targetLayouts.some(
    (layout) => metricDelta(outputs, layout, "parsedValueAccuracy") > 0,
  );
  const improvementsAcrossMultipleFixtures =
    outputs.diffs.filter(
      (diff) =>
        targetLayouts.includes(diff.layoutClass as AlcoholLayoutClass) &&
        (diff.normalizedReadDelta > 0 || diff.parsedValueDelta > 0),
    ).length > 1;
  const horizontalOrBottomRegressed = outputs.diffs.some(
    (diff) =>
      (diff.layoutClass === "horizontal" || diff.layoutClass === "bottom") &&
      (diff.normalizedReadDelta < 0 || diff.parsedValueDelta < 0),
  );
  const falseReliableIncrease = outputs.diffs.some((diff) => diff.falseReliableReadDelta > 0);
  const unreadable = outputs.treatment.cases.find((record) => record.layoutClass === "unreadable");
  const unreadableStillInsufficient = unreadable?.correctInsufficientEvidenceRouting === true;
  const recognitionShiftOnly = outputs.diffs.some(
    (diff) =>
      diff.controlCategory === "CANDIDATE_GROUPING_MISS" &&
      diff.treatmentCategory === "OCR_RECOGNITION_MISS",
  );
  const passed =
    (normalizedImproved || parsedImproved) &&
    improvementsAcrossMultipleFixtures &&
    !horizontalOrBottomRegressed &&
    !falseReliableIncrease &&
    unreadableStillInsufficient &&
    !recognitionShiftOnly;

  if (passed) {
    return {
      hypothesis:
        "Alcohol-only PSM 7 on side, rotated, and vertical seller regions improves bounded alcohol parsing without altering control layouts.",
      passed: true,
      killCriterionHit: false,
      recommendation: "adopt later",
      reason:
        "Target layouts improved across more than one fixture without control-layout regression, false reliable reads, or unreadable routing loss.",
    };
  }
  return {
    hypothesis:
      "Alcohol-only PSM 7 on side, rotated, and vertical seller regions improves bounded alcohol parsing without altering control layouts.",
    passed: false,
    killCriterionHit: true,
    recommendation: "reject",
    reason:
      "The treatment did not produce reproducible parsed-value or normalized-read gains across more than one target-layout fixture under the fixed decision rules.",
  };
}

function renderConfig(): string {
  return `# Issue #149 alcohol layout segmentation experiment

Single variable under test: Apply PSM 7 only to bounded Alcohol statement OCR for side, rotated, or vertical seller-selected regions.

Control: ${psmLabel(CONTROL_PSM)}.

Treatment: ${psmLabel(TREATMENT_PSM)} only for Alcohol layout classes side, rotated, and vertical.

Brand, horizontal Alcohol, bottom Alcohol, unreadable regions, full-panel OCR, and production behavior remain on the control segmentation mode.

Held constant: seller geometry, padding, clipping, scale factor, preprocessing, orientation detection and rotation policy, OCR confidence thresholds, alcohol parsing, candidate ranking outside transcript grouping, reliability policy, comparison semantics, UI behavior, and full-panel OCR behavior.

Corpus policy: synthetic fixtures are governed, non-private, and typography-controlled. No private browser-local uploads are used.
`;
}

function renderMetrics(outputs: ExperimentOutputs): string {
  const rows = [
    [
      "Layout",
      "Cases",
      "Control normalized",
      "Treatment normalized",
      "Control parsed",
      "Treatment parsed",
      "Grouping misses delta",
      "Recognition misses delta",
      "Selector misses delta",
      "False reliable delta",
      "Median latency delta ms",
    ],
    ...(["horizontal", "bottom", "side", "rotated", "vertical", "unreadable"] as const).map(
      (layout) => {
        const c = outputs.control.metrics.byLayout[layout];
        const t = outputs.treatment.metrics.byLayout[layout];
        return [
          layout,
          c.caseCount,
          c.normalizedAlcoholBoundedReadAccuracy ?? "n/a",
          t.normalizedAlcoholBoundedReadAccuracy ?? "n/a",
          c.parsedValueAccuracy ?? "n/a",
          t.parsedValueAccuracy ?? "n/a",
          t.candidateGroupingMisses - c.candidateGroupingMisses,
          t.ocrRecognitionMisses - c.ocrRecognitionMisses,
          t.selectorMissesWithOcrHit - c.selectorMissesWithOcrHit,
          (t.falseReliableReadRate ?? 0) - (c.falseReliableReadRate ?? 0),
          ((t.medianBoundedOcrLatencyMs ?? 0) - (c.medianBoundedOcrLatencyMs ?? 0)).toFixed(1),
        ];
      },
    ),
  ];
  const table = rows
    .map((row, index) =>
      index === 0
        ? `| ${row.join(" | ")} |\n| ${row.map(() => "---").join(" | ")} |`
        : `| ${row.join(" | ")} |`,
    )
    .join("\n");
  const cases = outputs.diffs
    .filter((diff) => diff.fieldType === "alcoholStatement")
    .map(
      (diff) =>
        `| ${diff.caseId} | ${diff.layoutClass} | ${diff.controlPsm} | ${diff.treatmentPsm} | ${diff.controlValue ?? ""} | ${diff.treatmentValue ?? ""} | ${diff.outcomeChange} | ${diff.boundedLatencyDeltaMs.toFixed(1)} |`,
    )
    .join("\n");
  return `# Alcohol layout segmentation metric diff

${table}

## Per-case changes

| Case | Layout | Control PSM | Treatment PSM | Control value | Treatment value | Outcome change | Latency delta ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
${cases}

## Decision

${outputs.decision.recommendation.toUpperCase()}: ${outputs.decision.reason}
`;
}

export async function generateIssue149AlcoholLayoutSegmentationExperiment(): Promise<ExperimentOutputs> {
  ensureCleanDir(OUTPUT_DIR);
  const controlCases: CaseRun[] = [];
  const treatmentCases: CaseRun[] = [];
  const engine = await createLocalOcrEngine();
  try {
    for (const definition of ALCOHOL_LAYOUT_CASES) {
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
    "#!/usr/bin/env bash\nset -euo pipefail\nnpm run eval:issue-149-alcohol-layout-segmentation\n",
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
