import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { format, resolveConfig } from "prettier";
import sharp from "sharp";

import { compareText } from "@/domain/compare/semantic";
import {
  parseDeclaredAlcoholValue,
  parseWineAlcoholStatement,
} from "@/domain/rules/wine-alcohol-parse";
import {
  createAnalysisRun,
  type PackagePanelMachineRun,
  type SellerPackageDraft,
} from "@/features/package-preparation/package-model";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import { sha256Hex } from "@/pipeline/extractor/image-integrity";
import {
  planSellerRegionOcrPass,
  sellerRegionCropPlan,
  type SellerRegionCropPlan,
} from "@/pipeline/extractor/regions";
import type {
  ExtractionInput,
  SellerRegionMachineReading,
  SellerRegionOcrTarget,
} from "@/pipeline/extractor/extractor.types";

const OUTPUT_DIR = path.join(process.cwd(), "artifacts/issue-149-bounded-baseline");
const FIXTURE_ROOT = path.join(process.cwd(), "tests/fixtures/precheck");
const PROCESSED_AT = "2026-07-26T00:00:00.000Z";
const EXTRACTION_ADAPTER = { id: "local-two-field-extractor", version: "1.0.0" };
const OCR_ENGINE = {
  kind: "ocr" as const,
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};

export const FAILURE_TAXONOMY = [
  "GEOMETRY_MISS",
  "CROP_TOO_TIGHT",
  "CROP_TOO_SMALL",
  "ORIENTATION_MISS",
  "OCR_RECOGNITION_MISS",
  "CANDIDATE_GROUPING_MISS",
  "SELECTOR_MISS_WITH_OCR_HIT",
  "RELIABILITY_GATE_CORRECT",
  "RELIABILITY_GATE_WRONG",
  "CORRECT_READ",
  "INSUFFICIENT_SOURCE_IMAGE",
] as const;

export type FailureTaxonomy = (typeof FAILURE_TAXONOMY)[number];

type FieldType = "brandName" | "alcoholStatement";
type NextVariable = "padding" | "upscaling" | "segmentation mode" | "preprocessing" | "orientation";

export interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SyntheticImage {
  kind: "synthetic";
  width: number;
  height: number;
  svg: string;
}

interface ExistingImage {
  kind: "existing";
  imagePath: string;
}

type ImageSource = SyntheticImage | ExistingImage;

interface BaselineCaseDefinition {
  caseId: string;
  fieldType: FieldType;
  expectedSellerValue: string;
  panelId: string;
  fixtureName: string;
  source: ImageSource;
  selectedPixelRegion: PixelBox;
  expectedReadable: boolean;
  expectedGeometryCorrect: boolean;
  expectedReliabilityCorrect: boolean;
  brandTypography?:
    | "clean typography"
    | "stylized typography"
    | "curved or decorative text"
    | "low-resolution text";
  alcoholOrientation?: "horizontal" | "bottom" | "side" | "rotated" | "vertical";
  secondaryFactors?: string[];
}

export interface BaselineCaseRecord {
  caseId: string;
  fieldType: FieldType;
  expectedSellerValue: string;
  panelId: string;
  fixtureName: string;
  originalImage: { width: number; height: number; sha256: string };
  normalizedSellerGeometry: SellerRegionOcrTarget["region"];
  unpaddedPixelCrop: PixelBox;
  paddedPixelCrop: PixelBox;
  clippingApplied: boolean;
  cropWidth: number;
  cropHeight: number;
  paddingInPixels: SellerRegionCropPlan["padding"] | null;
  scaleFactor: number | null;
  finalOcrImageDimensions: { width: number; height: number } | null;
  preprocessingSteps: string[];
  ocrEngine: typeof OCR_ENGINE;
  psmOrSegmentationMode: number | null;
  orientationOrPass: string | null;
  rawBoundedOcrTranscript: string;
  normalizedBoundedTranscript: string;
  boundedObservedValue: string | null;
  boundedNormalizedValue: string | null;
  ocrConfidence: number;
  boundedReliabilityState: SellerRegionMachineReading["reliabilityState"] | null;
  boundedReliabilityReason: string | null;
  independentFullPanelReading: string | null;
  fullPanelConfidence: number;
  fullPanelState: string;
  finalComparisonOutcome: string;
  latencyMs: { boundedOcr: number | null; totalAnalysis: number };
  visualEvidence: {
    overlay: string;
    unpaddedCrop: string;
    paddedCrop: string;
    finalOcrInput: string | null;
    transcript: string;
  };
  exactBoundedRead: boolean;
  normalizedBoundedRead: boolean;
  readableRegionHit: boolean;
  correctInsufficientEvidenceRouting: boolean;
  falseReliableRead: boolean;
  geometryMappingAccurate: boolean;
  primaryFailureTaxonomy: FailureTaxonomy;
  secondaryContributingFactors: string[];
  recommendedFirstVariable: NextVariable;
  alcoholOrientation?: string;
  brandTypography?: string;
}

interface BaselineOutputs {
  schemaVersion: "issue-149-bounded-ocr-baseline.v1";
  config: {
    artifactDir: string;
    singleVariableUnderTest: "No OCR treatment variable. Baseline instrumentation only.";
    productionBehaviorChanged: false;
    caseCount: number;
  };
  metrics: ReturnType<typeof summarizeMetrics>;
  cases: BaselineCaseRecord[];
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

export const BASELINE_CASES: BaselineCaseDefinition[] = [
  {
    caseId: "brand-minneapolis-synthetic",
    fieldType: "brandName",
    expectedSellerValue: "Minneapolis",
    panelId: "front",
    fixtureName: "synthetic-no-private-brand-minneapolis",
    source: syntheticPanel(
      900,
      600,
      `<text x="96" y="214" font-family="Arial, Helvetica, sans-serif" font-size="84" font-weight="700" fill="#111">MINNEAPOLIS</text>
  <text x="122" y="298" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#333">DRY WHITE WINE</text>
  <text x="112" y="526" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#111">ALC. 12.5% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 86, top: 140, width: 660, height: 104 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    brandTypography: "clean typography",
  },
  {
    caseId: "brand-garden-city-beach-synthetic",
    fieldType: "brandName",
    expectedSellerValue: "Garden City Beach",
    panelId: "front",
    fixtureName: "synthetic-no-private-brand-garden-city-beach",
    source: syntheticPanel(
      960,
      640,
      `<text x="100" y="178" font-family="Georgia, Times New Roman, serif" font-size="72" font-weight="700" fill="#111">GARDEN CITY</text>
  <text x="168" y="258" font-family="Georgia, Times New Roman, serif" font-size="70" font-weight="700" fill="#111">BEACH</text>
  <text x="118" y="548" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#111">ALC. 13.0% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 82, top: 106, width: 640, height: 188 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    brandTypography: "clean typography",
  },
  {
    caseId: "brand-golden-girls-approved-region",
    fieldType: "brandName",
    expectedSellerValue: "The Golden Girls",
    panelId: "front",
    fixtureName: "approved-wine-027",
    source: {
      kind: "existing",
      imagePath: path.join(FIXTURE_ROOT, "approved-wine-027/label.jpeg"),
    },
    selectedPixelRegion: { left: 77, top: 71, width: 822, height: 340 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    brandTypography: "curved or decorative text",
    secondaryFactors: ["approved brand-region annotation"],
  },
  {
    caseId: "brand-arandano-synthetic-lowres",
    fieldType: "brandName",
    expectedSellerValue: "Arandano",
    panelId: "front",
    fixtureName: "synthetic-no-private-brand-arandano-lowres",
    source: syntheticPanel(
      420,
      300,
      `<text x="46" y="112" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="#222">ARANDANO</text>
  <text x="50" y="248" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#222">ALC. 12.0% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 38, top: 70, width: 236, height: 62 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    brandTypography: "low-resolution text",
  },
  {
    caseId: "alcohol-clean-horizontal-synthetic",
    fieldType: "alcoholStatement",
    expectedSellerValue: "ALC. 13.0% BY VOL.",
    panelId: "front",
    fixtureName: "synthetic-no-private-alcohol-horizontal",
    source: syntheticPanel(
      920,
      560,
      `<text x="112" y="180" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" fill="#111">STONEHILL</text>
  <text x="136" y="472" font-family="Arial, Helvetica, sans-serif" font-size="42" fill="#111">ALC. 13.0% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 126, top: 424, width: 520, height: 70 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    alcoholOrientation: "horizontal",
  },
  {
    caseId: "alcohol-vertical-side-synthetic",
    fieldType: "alcoholStatement",
    expectedSellerValue: "ALC. 13.5% BY VOL.",
    panelId: "front",
    fixtureName: "synthetic-no-private-alcohol-vertical-side",
    source: syntheticPanel(
      760,
      960,
      `<text x="136" y="210" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#111">SIDE TRACE</text>
  <g transform="translate(690 842) rotate(-90)">
    <text x="0" y="0" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#111">ALC. 13.5% BY VOL.</text>
  </g>`,
    ),
    selectedPixelRegion: { left: 642, top: 338, width: 70, height: 526 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    alcoholOrientation: "vertical",
    secondaryFactors: ["side", "rotated"],
  },
  {
    caseId: "alcohol-unreadable-selected-region",
    fieldType: "alcoholStatement",
    expectedSellerValue: "ALC. 12.0% BY VOL.",
    panelId: "front",
    fixtureName: "synthetic-no-private-unreadable-region",
    source: syntheticPanel(
      800,
      520,
      `<text x="90" y="176" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="700" fill="#111">QUIET HARBOR</text>
  <text x="96" y="444" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#111">ALC. 12.0% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 350, top: 238, width: 78, height: 34 },
    expectedReadable: false,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    alcoholOrientation: "bottom",
    secondaryFactors: ["seller-selected blank area"],
  },
];

function outputDir(): string {
  return OUTPUT_DIR;
}

function posixRelative(filePath: string): string {
  return path.relative(outputDir(), filePath).split(path.sep).join("/");
}

function ensureCleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "crops"), { recursive: true });
  mkdirSync(path.join(dir, "transcripts"), { recursive: true });
}

function normalizedTranscript(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.%]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedRegion(
  box: PixelBox,
  width: number,
  height: number,
): SellerRegionOcrTarget["region"] {
  return {
    unit: "normalized-panel-relative",
    provenance: "seller-selected-region",
    x: box.left / width,
    y: box.top / height,
    width: box.width / width,
    height: box.height / height,
  };
}

export function cropPlanForCase(
  definition: Pick<
    BaselineCaseDefinition,
    "fieldType" | "panelId" | "caseId" | "selectedPixelRegion"
  >,
  image: { width: number; height: number },
): SellerRegionCropPlan | null {
  return sellerRegionCropPlan(
    {
      categoryId: definition.fieldType,
      regionId: `${definition.caseId}-${definition.fieldType}`,
      panelId: definition.panelId,
      region: normalizedRegion(definition.selectedPixelRegion, image.width, image.height),
    },
    image.width,
    image.height,
  );
}

function equivalent(
  fieldType: FieldType,
  expected: string,
  observed: string | null | undefined,
): boolean {
  if (!observed) return false;
  if (fieldType === "brandName") return compareText(expected, observed).equivalence !== "different";
  const expectedBasisPoints =
    parseDeclaredAlcoholValue(expected) ??
    (() => {
      const parsed = parseWineAlcoholStatement(expected);
      return parsed.kind === "direct" ? parsed.basisPoints : null;
    })();
  if (expectedBasisPoints === null) return false;
  const observedDeclared = parseDeclaredAlcoholValue(observed);
  if (observedDeclared !== null) return observedDeclared === expectedBasisPoints;
  const parsed = parseWineAlcoholStatement(observed);
  return parsed.kind === "direct" && parsed.basisPoints === expectedBasisPoints;
}

function classifyFailure(args: {
  expectedReadable: boolean;
  geometryMappingAccurate: boolean;
  exactBoundedRead: boolean;
  normalizedBoundedRead: boolean;
  rawTranscript: string;
  reading: SellerRegionMachineReading;
  comparisonOutcome: string;
  expectedReliabilityCorrect: boolean;
}): FailureTaxonomy {
  if (!args.geometryMappingAccurate) return "GEOMETRY_MISS";
  if (!args.expectedReadable) {
    return args.reading.reliabilityState === "UNRELIABLE"
      ? "RELIABILITY_GATE_CORRECT"
      : "RELIABILITY_GATE_WRONG";
  }
  const crop = args.reading.selectedRegionPixelGeometry;
  if (crop && (crop.width < 24 || crop.height < 10)) return "CROP_TOO_SMALL";
  if (args.normalizedBoundedRead) return "CORRECT_READ";
  if (!args.rawTranscript) return "OCR_RECOGNITION_MISS";
  if (args.reading.passProvenance?.transform.rotate) {
    return "ORIENTATION_MISS";
  }
  if (args.reading.observedValue === null) return "CANDIDATE_GROUPING_MISS";
  if (args.reading.reliabilityState === "RELIABLE" && !args.expectedReliabilityCorrect) {
    return "RELIABILITY_GATE_WRONG";
  }
  if (args.rawTranscript && !args.normalizedBoundedRead) return "SELECTOR_MISS_WITH_OCR_HIT";
  return args.exactBoundedRead ? "CORRECT_READ" : "OCR_RECOGNITION_MISS";
}

function recommendedVariable(primary: FailureTaxonomy): NextVariable {
  switch (primary) {
    case "CROP_TOO_TIGHT":
      return "padding";
    case "CROP_TOO_SMALL":
      return "upscaling";
    case "ORIENTATION_MISS":
      return "orientation";
    case "CANDIDATE_GROUPING_MISS":
    case "SELECTOR_MISS_WITH_OCR_HIT":
      return "segmentation mode";
    case "OCR_RECOGNITION_MISS":
    case "INSUFFICIENT_SOURCE_IMAGE":
      return "preprocessing";
    default:
      return "padding";
  }
}

function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

function counts<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (out, value) => ({ ...out, [value]: (out[value] ?? 0) + 1 }),
    {} as Record<T, number>,
  );
}

function metricsFor(records: BaselineCaseRecord[], fieldType: FieldType) {
  const fieldRecords = records.filter((record) => record.fieldType === fieldType);
  const readable = fieldRecords.filter(
    (record) => BASELINE_CASES.find((c) => c.caseId === record.caseId)?.expectedReadable,
  );
  const insufficientExpected = fieldRecords.filter(
    (record) => !BASELINE_CASES.find((c) => c.caseId === record.caseId)?.expectedReadable,
  );
  const boundedLatencies = fieldRecords
    .map((record) => record.latencyMs.boundedOcr)
    .filter((value): value is number => typeof value === "number");
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
    correctInsufficientEvidenceRouting: rate(
      insufficientExpected.filter((record) => record.correctInsufficientEvidenceRouting).length,
      insufficientExpected.length,
    ),
    falseReliableReadRate: rate(
      fieldRecords.filter((record) => record.falseReliableRead).length,
      fieldRecords.length,
    ),
    geometryMappingAccuracy: rate(
      fieldRecords.filter((record) => record.geometryMappingAccurate).length,
      fieldRecords.length,
    ),
    medianBoundedOcrLatencyMs: median(boundedLatencies),
    p95BoundedOcrLatencyMs: p95(boundedLatencies),
    medianTotalAnalysisLatencyMs: median(
      fieldRecords.map((record) => record.latencyMs.totalAnalysis),
    ),
    p95TotalAnalysisLatencyMs: p95(fieldRecords.map((record) => record.latencyMs.totalAnalysis)),
    failureTaxonomyCounts: counts(fieldRecords.map((record) => record.primaryFailureTaxonomy)),
    outcomeCounts: counts(fieldRecords.map((record) => record.finalComparisonOutcome)),
  };
}

function summarizeMetrics(records: BaselineCaseRecord[]) {
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

async function sourceBytes(source: ImageSource): Promise<Uint8Array> {
  if (source.kind === "existing") return new Uint8Array(readFileSync(source.imagePath));
  const buffer = await sharp(Buffer.from(source.svg)).png().toBuffer();
  return new Uint8Array(buffer);
}

async function writeEvidenceImages(args: {
  definition: BaselineCaseDefinition;
  bytes: Uint8Array;
  image: { width: number; height: number };
  cropPlan: SellerRegionCropPlan | null;
  reading: SellerRegionMachineReading;
}): Promise<BaselineCaseRecord["visualEvidence"]> {
  const { definition, bytes, image, cropPlan, reading } = args;
  const cropDir = path.join(OUTPUT_DIR, "crops");
  const transcriptDir = path.join(OUTPUT_DIR, "transcripts");
  const stem = definition.caseId;
  const overlay = path.join(cropDir, `${stem}-overlay.png`);
  const unpaddedCrop = path.join(cropDir, `${stem}-unpadded.png`);
  const paddedCrop = path.join(cropDir, `${stem}-padded.png`);
  const finalOcrInput = reading.passProvenance
    ? path.join(cropDir, `${stem}-final-ocr-input.png`)
    : null;
  const transcript = path.join(transcriptDir, `${stem}.txt`);

  const box = definition.selectedPixelRegion;
  const svg = `<svg width="${image.width}" height="${image.height}" viewBox="0 0 ${image.width} ${image.height}">
    <rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="none" stroke="#ff2d20" stroke-width="6"/>
  </svg>`;
  await sharp(Buffer.from(bytes))
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(overlay);
  await sharp(Buffer.from(bytes)).extract(box).png().toFile(unpaddedCrop);
  if (cropPlan) {
    await sharp(Buffer.from(bytes)).extract(cropPlan.crop).png().toFile(paddedCrop);
  } else {
    await sharp({ create: { width: 1, height: 1, channels: 4, background: "#00000000" } })
      .png()
      .toFile(paddedCrop);
  }
  if (finalOcrInput && reading.passProvenance) {
    const { crop, rotate, scale } = reading.passProvenance.transform;
    let pipeline = sharp(Buffer.from(bytes)).extract(crop);
    if (rotate) {
      pipeline = sharp(await pipeline.rotate(rotate).toBuffer());
    }
    const meta = await pipeline.metadata();
    await pipeline
      .resize({
        width: Math.max(1, Math.round((meta.width ?? crop.width) * scale)),
        kernel: "cubic",
      })
      .grayscale()
      .normalise()
      .png()
      .toFile(finalOcrInput);
  }
  writeFileSync(transcript, `${reading.rawTranscript}\n`);
  return {
    overlay: posixRelative(overlay),
    unpaddedCrop: posixRelative(unpaddedCrop),
    paddedCrop: posixRelative(paddedCrop),
    finalOcrInput: finalOcrInput ? posixRelative(finalOcrInput) : null,
    transcript: posixRelative(transcript),
  };
}

function packageDraftFor(
  definition: BaselineCaseDefinition,
  image: { width: number; height: number; sha256: string },
): SellerPackageDraft {
  const region = normalizedRegion(definition.selectedPixelRegion, image.width, image.height);
  return {
    schemaVersion: "seller-package-draft.v1",
    packageId: `issue-149-${definition.caseId}`,
    createdAt: PROCESSED_AT,
    updatedAt: PROCESSED_AT,
    profile: { id: "ttb-domestic-wine-label", version: "1.0.0" },
    panelDecisions: { back: "absent", additional: "none" },
    panels: [
      {
        panelId: definition.panelId,
        order: 0,
        role: "front",
        displayName: definition.fixtureName,
        mediaType: "image/png",
        byteSize: 1,
        checksumSha256: image.sha256,
        width: image.width,
        height: image.height,
        rotation: 0,
      },
    ],
    categories: [
      {
        categoryId: definition.fieldType,
        decision: "provided",
        expectedValue: definition.expectedSellerValue,
        regions: [
          {
            categoryId: definition.fieldType,
            regionId: `${definition.caseId}-${definition.fieldType}`,
            panelId: definition.panelId,
            ...region,
          },
        ],
      },
    ],
    sellerChangeHistory: [],
    analysisRuns: [],
  };
}

async function runOne(definition: BaselineCaseDefinition): Promise<BaselineCaseRecord> {
  const bytes = await sourceBytes(definition.source);
  const sha256 = sha256Hex(bytes);
  const meta = await sharp(Buffer.from(bytes)).metadata();
  const image = { width: meta.width ?? 0, height: meta.height ?? 0, sha256 };
  const region = normalizedRegion(definition.selectedPixelRegion, image.width, image.height);
  const target: SellerRegionOcrTarget = {
    categoryId: definition.fieldType,
    regionId: `${definition.caseId}-${definition.fieldType}`,
    panelId: definition.panelId,
    region,
  };
  const cropPlan = sellerRegionCropPlan(target, image.width, image.height);
  const passPlan = planSellerRegionOcrPass(target, image.width, image.height, 1);
  const input: ExtractionInput = {
    imageBytes: bytes,
    artifactRef: definition.caseId,
    derivativeSha256: sha256,
    processedAt: PROCESSED_AT,
    extractionAdapterId: EXTRACTION_ADAPTER.id,
    extractionAdapterVersion: EXTRACTION_ADAPTER.version,
    ocrEngine: OCR_ENGINE,
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
    sellerRegionTargets: [target],
  };
  const startedAt = performance.now();
  const extraction = await extractLabelEvidenceDetailed(input);
  const totalAnalysis = performance.now() - startedAt;
  if (!extraction.ok) {
    throw new Error(`extraction failed for ${definition.caseId}: ${extraction.error.message}`);
  }
  const reading = extraction.value.sellerRegionReadings[0];
  if (!reading) throw new Error(`missing seller-region reading for ${definition.caseId}`);
  const draft = packageDraftFor(definition, image);
  const panelRun: PackagePanelMachineRun = {
    panelId: definition.panelId,
    machineResultId: createHash("sha256")
      .update(canonicalStringify(extraction.value.response))
      .digest("hex"),
    exportJson: canonicalStringify({ response: extraction.value.response }),
    observations: {
      provenance: extraction.value.response.provenance,
      brandName: extraction.value.response.fields.brandName,
      alcoholStatement: extraction.value.response.fields.alcoholStatement,
    },
    sellerRegionReadings: [reading],
  };
  const analysisRun = createAnalysisRun({
    draft,
    panelRuns: [panelRun],
    analysisRunId: `analysis-${definition.caseId}`,
    recordedAt: PROCESSED_AT,
  });
  const category = analysisRun.categories[0];
  const fullPanel = extraction.value.response.fields[definition.fieldType];
  const exactBoundedRead = reading.observedValue === definition.expectedSellerValue;
  const normalizedBoundedRead = equivalent(
    definition.fieldType,
    definition.expectedSellerValue,
    reading.observedValue,
  );
  const readableRegionHit = definition.expectedReadable && reading.rawTranscript.trim().length > 0;
  const correctInsufficientEvidenceRouting =
    !definition.expectedReadable && reading.reliabilityState === "UNRELIABLE";
  const falseReliableRead = reading.reliabilityState === "RELIABLE" && !normalizedBoundedRead;
  const geometryMappingAccurate =
    !!cropPlan &&
    cropPlan.selectedRegionPixelGeometry.width > 0 &&
    cropPlan.selectedRegionPixelGeometry.height > 0 &&
    cropPlan.crop.width > 0 &&
    cropPlan.crop.height > 0 &&
    definition.expectedGeometryCorrect;
  const primaryFailureTaxonomy = classifyFailure({
    expectedReadable: definition.expectedReadable,
    geometryMappingAccurate,
    exactBoundedRead,
    normalizedBoundedRead,
    rawTranscript: reading.rawTranscript,
    reading,
    comparisonOutcome: category?.comparison?.outcome ?? "NO_COMPARISON",
    expectedReliabilityCorrect: definition.expectedReliabilityCorrect,
  });
  const visualEvidence = await writeEvidenceImages({
    definition,
    bytes,
    image,
    cropPlan,
    reading,
  });
  return {
    caseId: definition.caseId,
    fieldType: definition.fieldType,
    expectedSellerValue: definition.expectedSellerValue,
    panelId: definition.panelId,
    fixtureName: definition.fixtureName,
    originalImage: image,
    normalizedSellerGeometry: region,
    unpaddedPixelCrop: cropPlan?.selectedRegionPixelGeometry ?? definition.selectedPixelRegion,
    paddedPixelCrop: cropPlan?.crop ?? { left: 0, top: 0, width: 0, height: 0 },
    clippingApplied: cropPlan
      ? cropPlan.padding.left !==
          Math.max(4, Math.round(definition.selectedPixelRegion.width * 0.03)) ||
        cropPlan.padding.top !==
          Math.max(4, Math.round(definition.selectedPixelRegion.height * 0.03))
      : true,
    cropWidth: cropPlan?.crop.width ?? 0,
    cropHeight: cropPlan?.crop.height ?? 0,
    paddingInPixels: cropPlan?.padding ?? null,
    scaleFactor: reading.scaleFactor ?? null,
    finalOcrImageDimensions:
      reading.passProvenance?.transformedSize ??
      (passPlan && cropPlan
        ? {
            width: Math.round(cropPlan.crop.width * cropPlan.scale),
            height: Math.round(cropPlan.crop.height * cropPlan.scale),
          }
        : null),
    preprocessingSteps: reading.passProvenance?.preprocessing ?? passPlan?.preprocessing ?? [],
    ocrEngine: OCR_ENGINE,
    psmOrSegmentationMode: reading.passProvenance?.pageSegMode ?? passPlan?.pageSegMode ?? null,
    orientationOrPass: reading.passProvenance
      ? `${reading.passProvenance.passKind}:rotate-${reading.passProvenance.transform.rotate}`
      : null,
    rawBoundedOcrTranscript: reading.rawTranscript,
    normalizedBoundedTranscript: normalizedTranscript(reading.rawTranscript),
    boundedObservedValue: reading.observedValue,
    boundedNormalizedValue: reading.normalizedValue ?? null,
    ocrConfidence: reading.ocrEvidenceScore,
    boundedReliabilityState: reading.reliabilityState ?? null,
    boundedReliabilityReason: reading.reliabilityReason ?? null,
    independentFullPanelReading: fullPanel.value,
    fullPanelConfidence: fullPanel.ocrEvidenceScore,
    fullPanelState: fullPanel.state,
    finalComparisonOutcome: category?.comparison?.outcome ?? "NO_COMPARISON",
    latencyMs: {
      boundedOcr: reading.passProvenance?.timings.totalMs ?? null,
      totalAnalysis,
    },
    visualEvidence,
    exactBoundedRead,
    normalizedBoundedRead,
    readableRegionHit,
    correctInsufficientEvidenceRouting,
    falseReliableRead,
    geometryMappingAccurate,
    primaryFailureTaxonomy,
    secondaryContributingFactors: definition.secondaryFactors ?? [],
    recommendedFirstVariable: recommendedVariable(primaryFailureTaxonomy),
    alcoholOrientation: definition.alcoholOrientation,
    brandTypography: definition.brandTypography,
  };
}

export function stableCaseProjection(
  record: BaselineCaseRecord,
): Omit<BaselineCaseRecord, "latencyMs" | "originalImage"> {
  const stable: Partial<BaselineCaseRecord> = { ...record };
  delete stable.latencyMs;
  delete stable.originalImage;
  return stable as Omit<BaselineCaseRecord, "latencyMs" | "originalImage">;
}

export function deterministicArtifactPayload(records: BaselineCaseRecord[]): BaselineOutputs {
  return {
    schemaVersion: "issue-149-bounded-ocr-baseline.v1",
    config: {
      artifactDir: "artifacts/issue-149-bounded-baseline",
      singleVariableUnderTest: "No OCR treatment variable. Baseline instrumentation only.",
      productionBehaviorChanged: false,
      caseCount: records.length,
    },
    metrics: summarizeMetrics(records),
    cases: records,
  };
}

function renderMetrics(outputs: BaselineOutputs): string {
  const rows = [
    [
      "Field",
      "Cases",
      "Exact",
      "Normalized",
      "Readable recall",
      "Insufficient routing",
      "False reliable",
      "Geometry",
      "Median bounded ms",
      "P95 bounded ms",
    ],
    ...(["brand", "alcohol"] as const).map((field) => {
      const metric = outputs.metrics[field];
      return [
        field,
        metric.caseCount,
        metric.exactBoundedReadAccuracy ?? "n/a",
        metric.normalizedBoundedReadAccuracy ?? "n/a",
        metric.readableRegionRecall ?? "n/a",
        metric.correctInsufficientEvidenceRouting ?? "n/a",
        metric.falseReliableReadRate ?? "n/a",
        metric.geometryMappingAccuracy ?? "n/a",
        metric.medianBoundedOcrLatencyMs?.toFixed(1) ?? "n/a",
        metric.p95BoundedOcrLatencyMs?.toFixed(1) ?? "n/a",
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
  const classifications = outputs.cases
    .map(
      (record) =>
        `| ${record.caseId} | ${record.fieldType} | ${record.primaryFailureTaxonomy} | ${record.recommendedFirstVariable} | ${record.finalComparisonOutcome} |`,
    )
    .join("\n");
  return `# Issue #149 bounded OCR baseline metrics\n\n${table}\n\n## Per-case classification\n\n| Case | Field | Primary category | First variable | Outcome |\n| --- | --- | --- | --- | --- |\n${classifications}\n`;
}

function renderConfig(): string {
  return `# Issue #149 bounded OCR baseline config

Single variable under test: No OCR treatment variable. Baseline instrumentation only.

This artifact runs the current production extractor as-is and records bounded seller-region diagnostics. It does not change OCR padding, scale factors, preprocessing, Tesseract PSM, orientation policy, confidence thresholds, candidate ranking, comparison outcomes, or UI behavior.

## Current pipeline

1. The package analysis route validates the seller package draft, panel files, media types, byte sizes, checksums, panel identities, and seller-selected normalized regions.
2. For each panel, the route assembles an extractor input with immutable provenance, image bytes, the derivative SHA-256, and seller-region OCR targets for the categories selected on that panel.
3. The extractor verifies and decodes the image, initializes the local Tesseract.js OCR worker, then runs the primary full-image OCR pass.
4. Brand and alcohol selectors evaluate the primary pass. If unresolved, the extractor plans bounded recovery passes without using seller truth values.
5. Seller-region targets are converted from normalized panel-relative geometry to original-image pixel crops, padded by the existing seller-region padding policy, clipped to image bounds, scaled by the existing seller-region scale factor, preprocessed, and OCRed with the existing PSM.
6. Bounded seller-region transcripts are built from OCR words in original-frame reading order, then the existing field selectors produce observed values, confidence, evidence state, reliability state, and pass provenance.
7. Package analysis stores the independent full-panel readings and seller-region readings separately, then derives the two-stream comparison and readiness without changing uncertainty semantics.

Corpus policy: committed non-private fixtures are used where they cover the requested slice. Exact labels not present in committed fixtures (Minneapolis, Garden City Beach, Arandano) are generated as deterministic synthetic, private-free panels inside the baseline runner.
`;
}

function renderStagingObservation(): string {
  return `# Staging observation

Environment: pr143.ttb-test.com

Observation date: 2026-07-26

This is a real-world observation recorded after the baseline branch was tested in staging. It is not a treatment result and does not change the OCR baseline.

- The full package workflow completed successfully.
- Government Warning returned FAIL because no warning evidence was located.
- The seller-marked Brand region did not yield the intended brand.
- Machine evidence remained INSUFFICIENT_EVIDENCE.

Interpretation: PR #190 behaved as intended for an instrumentation-only baseline. These reading failures are not fixed in this branch; they remain evidence for follow-up experiments.

OCR behavior confirmation: no OCR padding, scale factor, preprocessing, Tesseract PSM, orientation policy, confidence threshold, candidate ranking, comparison outcome, or UI behavior was changed for this observation.
`;
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

export async function generateIssue149BoundedBaseline(): Promise<BaselineOutputs> {
  const dir = outputDir();
  ensureCleanDir(dir);
  const records: BaselineCaseRecord[] = [];
  for (const definition of BASELINE_CASES) {
    records.push(await runOne(definition));
  }
  const outputs = deterministicArtifactPayload(records);
  writeFileSync(path.join(dir, "config.md"), renderConfig());
  writeFileSync(path.join(dir, "staging-observation.md"), renderStagingObservation());
  writeFileSync(
    path.join(dir, "commands.sh"),
    "#!/usr/bin/env bash\nset -euo pipefail\nnpm run eval:issue-149-bounded-baseline\n",
    { mode: 0o755 },
  );
  writeFileSync(path.join(dir, "git-sha.txt"), `${currentGitSha()}\n`);
  await writeFormattedJson(path.join(dir, "summary.json"), outputs);
  writeFileSync(
    path.join(dir, "cases.jsonl"),
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  writeFileSync(path.join(dir, "metrics.md"), renderMetrics(outputs));
  return outputs;
}
