import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { compareText } from "@/domain/compare/semantic";
import { format, resolveConfig } from "prettier";
import sharp from "sharp";

import {
  BASELINE_CASES,
  boundedValueEquivalent,
  normalizedRegion,
  normalizedTranscript,
  sourceBytes,
  type BaselineCaseDefinition,
  type SyntheticImage,
} from "@/fixtures/eval/issue-149-bounded-baseline";
import {
  selectBrandObservation,
  selectBrandObservationWithCoherentLineMergeTreatment,
  type BrandCandidateDiagnostic,
  type BrandLineDiagnostic,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";
import type {
  OcrWord,
  RegionOcrResult,
  SellerRegionOcrTarget,
} from "@/pipeline/extractor/extractor.types";
import { sha256Hex } from "@/pipeline/extractor/image-integrity";
import { createLocalOcrEngine, PAGE_SEG } from "@/pipeline/extractor/ocr-engine";
import {
  planSellerRegionOcrPass,
  runOcrPass,
  type PlannedOcrPass,
} from "@/pipeline/extractor/regions";

const OUTPUT_DIR = path.join(process.cwd(), "artifacts/issue-149-brand-grouping-ranking");
const RELIABILITY_CONFIDENCE_FLOOR = 0.8;

type Arm = "control" | "treatment";
type BrandSlice =
  | "cleanTypography"
  | "stylizedTypography"
  | "multiLineBrand"
  | "lowResolutionBrand"
  | "adjacentProductText"
  | "adjacentLocationText"
  | "unreadableSelectedRegion";

export const BRAND_GROUPING_FAILURE_CLASSES = [
  "OCR_MISS",
  "TOKEN_GROUPING_MISS",
  "LINE_GROUPING_MISS",
  "CANDIDATE_GENERATION_MISS",
  "FILTERING_MISS",
  "RANKING_MISS",
  "CORRECT_TOP1_CONSERVATIVE_STATE",
  "WRONG_ACCEPTED_CANDIDATE",
  "CORRECT_READ",
  "INSUFFICIENT_SOURCE_IMAGE",
] as const;
export type BrandGroupingFailureClass = (typeof BRAND_GROUPING_FAILURE_CLASSES)[number];

interface BrandGroupingCaseDefinition extends BaselineCaseDefinition {
  fieldType: "brandName";
  slices: BrandSlice[];
  expectedReadable: boolean;
}

interface RawWordRecord {
  caseId: string;
  words: Array<{
    text: string;
    rawConfidence: number;
    bbox: OcrWord["bbox"];
    originalGeometry: OcrWord["originalGeometry"];
  }>;
}

interface CandidateTraceRecord {
  caseId: string;
  arm: Arm;
  expectedBrand: string;
  rawBoundedOcrTranscript: string;
  normalizedTranscript: string;
  generatedTokenGroups: string[][];
  generatedLineGroups: string[];
  allCandidatesBeforeFiltering: Array<
    Pick<
      BrandCandidateDiagnostic,
      "rawText" | "cleanedValue" | "assembly" | "lineIndexes" | "kept" | "filterReason"
    >
  >;
  allCandidatesAfterFiltering: Array<
    Pick<
      BrandCandidateDiagnostic,
      | "rawText"
      | "cleanedValue"
      | "assembly"
      | "lineIndexes"
      | "kept"
      | "filterReason"
      | "score"
      | "ranking"
      | "decision"
    >
  >;
  selectedLikelyBrand: string | null;
  authorityState: FieldSelection["observation"]["state"];
  reliabilityReason: string;
  top3: Array<{
    value: string;
    decision: BrandCandidateDiagnostic["decision"];
    score: BrandCandidateDiagnostic["score"];
    ranking: BrandCandidateDiagnostic["ranking"];
  }>;
}

interface CaseRun {
  caseId: string;
  arm: Arm;
  expectedBrand: string;
  slices: BrandSlice[];
  rawBoundedOcrWords: string[];
  rawBoundedOcrTranscript: string;
  normalizedTranscript: string;
  generatedTokenGroups: string[][];
  generatedLineGroups: string[];
  allCandidatesBeforeFiltering: CandidateTraceRecord["allCandidatesBeforeFiltering"];
  allCandidatesAfterFiltering: CandidateTraceRecord["allCandidatesAfterFiltering"];
  candidateScores: Array<{
    value: string | null;
    rawText: string;
    score: BrandCandidateDiagnostic["score"];
    ranking: BrandCandidateDiagnostic["ranking"];
    decision: BrandCandidateDiagnostic["decision"];
  }>;
  top3: CandidateTraceRecord["top3"];
  selectedLikelyBrand: string | null;
  authorityState: FieldSelection["observation"]["state"];
  reliabilityState: "RELIABLE" | "UNRELIABLE";
  reliabilityReason: string;
  expectedTruthInRawOcr: boolean;
  expectedTruthInAnyCandidate: boolean;
  expectedTruthInTop3: boolean;
  expectedTruthRankedFirst: boolean;
  authorityGateAlonePreventedObserved: boolean;
  primaryFailureClass: BrandGroupingFailureClass;
  falseReliableRead: boolean;
  exactTop1Correct: boolean;
  normalizedTop1Correct: boolean;
  cropGeometrySha256: string;
  finalOcrInputSha256: string;
  rawOcrWordsSha256: string;
  cropGeometryMatchesControl: boolean;
  finalOcrInputMatchesControl: boolean;
  rawOcrOutputMatchesControl: boolean;
  preprocessingMatchesControl: boolean;
  pageSegMode: number;
  preprocessingSteps: string[];
  latencyMs: {
    boundedOcr: number;
    selection: number;
  };
  artifacts: {
    boundedCrop: string;
    finalOcrInput: string;
    transcript: string;
  };
}

interface ExperimentReport {
  schemaVersion: "issue-149-brand-grouping-ranking.v1";
  arm: Arm;
  config: {
    singleVariableChanged: string;
    treatmentEnabledInProduction: false;
    ocrEngineChanged: false;
    cropGeometryChanged: false;
    paddingChanged: false;
    clippingChanged: false;
    scaleFactorChanged: false;
    preprocessingChanged: false;
    psmChanged: false;
    orientationPolicyChanged: false;
    confidenceThresholdsChanged: false;
    authorityGateChanged: false;
    sellerDeclarationUsedForRanking: false;
    alcoholBehaviorChanged: false;
    governmentWarningBehaviorChanged: false;
    twoStreamComparisonChanged: false;
  };
  metrics: ReturnType<typeof summarizeMetrics>;
  cases: CaseRun[];
}

interface ExperimentOutputs {
  control: ExperimentReport;
  treatment: ExperimentReport;
  diffs: Array<{
    caseId: string;
    controlSelected: string | null;
    treatmentSelected: string | null;
    controlClass: BrandGroupingFailureClass;
    treatmentClass: BrandGroupingFailureClass;
    top1NormalizedDelta: number;
    top3RecallDelta: number;
    falseReliableReadDelta: number;
    selectionLatencyDeltaMs: number;
    outcomeChange: string;
  }>;
  decision: {
    passed: boolean;
    killCriterionHit: boolean;
    recommendation: "adopt later" | "reject" | "run one narrower follow-up";
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

const baselineBrandCases = BASELINE_CASES.filter(
  (item): item is BrandGroupingCaseDefinition => item.fieldType === "brandName",
).map((item) => ({
  ...item,
  slices:
    item.caseId === "brand-garden-city-beach-synthetic"
      ? (["cleanTypography", "multiLineBrand"] as BrandSlice[])
      : item.caseId === "brand-golden-girls-approved-region"
        ? (["stylizedTypography"] as BrandSlice[])
        : item.caseId === "brand-arandano-synthetic-lowres"
          ? (["lowResolutionBrand"] as BrandSlice[])
          : (["cleanTypography"] as BrandSlice[]),
}));

export const BRAND_GROUPING_CASES: BrandGroupingCaseDefinition[] = [
  ...baselineBrandCases,
  {
    caseId: "brand-m-cellars-clean-designator",
    fieldType: "brandName",
    expectedSellerValue: "M Cellars",
    panelId: "front",
    fixtureName: "synthetic-no-private-brand-m-cellars-clean",
    source: syntheticPanel(
      900,
      560,
      `<text x="112" y="206" font-family="Arial, Helvetica, sans-serif" font-size="74" font-weight="700" fill="#111">M CELLARS</text>
  <text x="116" y="476" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#111">ALC. 13.0% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 96, top: 136, width: 430, height: 104 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    brandTypography: "clean typography",
    slices: ["cleanTypography"],
  },
  {
    caseId: "brand-north-star-multiline-synthetic",
    fieldType: "brandName",
    expectedSellerValue: "North Star",
    panelId: "front",
    fixtureName: "synthetic-no-private-brand-north-star-multiline",
    source: syntheticPanel(
      860,
      620,
      `<text x="112" y="194" font-family="Georgia, Times New Roman, serif" font-size="70" font-weight="700" fill="#111">NORTH</text>
  <text x="124" y="276" font-family="Georgia, Times New Roman, serif" font-size="70" font-weight="700" fill="#111">STAR</text>
  <text x="118" y="536" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#111">ALC. 12.4% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 88, top: 122, width: 390, height: 188 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    brandTypography: "clean typography",
    slices: ["cleanTypography", "multiLineBrand"],
  },
  {
    caseId: "brand-ridge-cellars-adjacent-product",
    fieldType: "brandName",
    expectedSellerValue: "Ridge Cellars",
    panelId: "front",
    fixtureName: "synthetic-no-private-brand-adjacent-product",
    source: syntheticPanel(
      940,
      620,
      `<text x="108" y="198" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="700" fill="#111">RIDGE CELLARS</text>
  <text x="116" y="278" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#111">CABERNET SAUVIGNON</text>
  <text x="122" y="542" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#111">ALC. 14.2% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 88, top: 130, width: 650, height: 190 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    brandTypography: "clean typography",
    slices: ["cleanTypography", "adjacentProductText"],
  },
  {
    caseId: "brand-harbor-cellars-adjacent-location",
    fieldType: "brandName",
    expectedSellerValue: "Harbor Cellars",
    panelId: "front",
    fixtureName: "synthetic-no-private-brand-adjacent-location",
    source: syntheticPanel(
      940,
      620,
      `<text x="108" y="196" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="700" fill="#111">HARBOR CELLARS</text>
  <text x="118" y="276" font-family="Arial, Helvetica, sans-serif" font-size="42" fill="#111">NAPA VALLEY</text>
  <text x="122" y="542" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#111">ALC. 13.7% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 88, top: 130, width: 620, height: 190 },
    expectedReadable: true,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    brandTypography: "clean typography",
    slices: ["cleanTypography", "adjacentLocationText"],
  },
  {
    caseId: "brand-unreadable-selected-region",
    fieldType: "brandName",
    expectedSellerValue: "Hidden Brand",
    panelId: "front",
    fixtureName: "synthetic-no-private-brand-unreadable-region",
    source: syntheticPanel(
      820,
      540,
      `<text x="92" y="184" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="700" fill="#111">CLEAR RIDGE</text>
  <text x="96" y="456" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#111">ALC. 12.0% BY VOL.</text>`,
    ),
    selectedPixelRegion: { left: 350, top: 250, width: 90, height: 42 },
    expectedReadable: false,
    expectedGeometryCorrect: true,
    expectedReliabilityCorrect: true,
    brandTypography: "clean typography",
    slices: ["unreadableSelectedRegion"],
  },
];

function ensureCleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  for (const arm of ["control", "treatment"] as const) {
    mkdirSync(path.join(dir, arm), { recursive: true });
    mkdirSync(path.join(dir, "representative-bounded-crops", arm), { recursive: true });
    mkdirSync(path.join(dir, "representative-ocr-inputs", arm), { recursive: true });
    mkdirSync(path.join(dir, "transcripts", arm), { recursive: true });
  }
  mkdirSync(path.join(dir, "diff"), { recursive: true });
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

function posixRelative(filePath: string): string {
  return path.relative(OUTPUT_DIR, filePath).split(path.sep).join("/");
}

function expectedMatches(expected: string, observed: string | null | undefined): boolean {
  if (!observed) return false;
  return compareText(expected, observed).equivalence !== "different";
}

function textIncludesExpected(text: string, expected: string): boolean {
  const haystack = normalizedTranscript(text).replace(/[^a-z0-9]/g, "");
  const needle = normalizedTranscript(expected).replace(/[^a-z0-9]/g, "");
  return needle.length > 0 && haystack.includes(needle);
}

function rawTranscript(result: RegionOcrResult): string {
  return [...result.words]
    .sort((a, b) => {
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
    })
    .map((word) => word.text)
    .join(" ")
    .trim();
}

function tokenGroups(result: RegionOcrResult): string[][] {
  return result.words.map((word) => [word.text]);
}

function lineGroups(lines: BrandLineDiagnostic[]): string[] {
  return lines.map((line) => line.rawText);
}

function reliabilityFor(selection: FieldSelection): {
  state: "RELIABLE" | "UNRELIABLE";
  reason: string;
} {
  if (
    selection.observation.state === "OBSERVED" &&
    selection.observation.ocrEvidenceScore >= RELIABILITY_CONFIDENCE_FLOOR
  ) {
    return {
      state: "RELIABLE",
      reason: "Bounded Brand OCR produced an OBSERVED value above the unchanged reliability floor.",
    };
  }
  return {
    state: "UNRELIABLE",
    reason:
      "Bounded Brand OCR did not produce a high-confidence OBSERVED value under the unchanged authority and reliability gates.",
  };
}

function selectedCandidates(selection: FieldSelection): BrandCandidateDiagnostic[] {
  return [...(selection.brandDiagnostics?.candidates ?? [])].filter((candidate) => candidate.kept);
}

function rankedTop3(selection: FieldSelection): CandidateTraceRecord["top3"] {
  return selectedCandidates(selection)
    .filter((candidate) => candidate.decision !== undefined)
    .sort((a, b) => {
      const rank = { selected: 0, "ambiguous-rival": 1, alternate: 2 } as const;
      return rank[a.decision!] - rank[b.decision!];
    })
    .slice(0, 3)
    .map((candidate) => ({
      value: candidate.cleanedValue ?? candidate.rawText,
      decision: candidate.decision,
      score: candidate.score,
      ranking: candidate.ranking,
    }));
}

function classifyFailure(args: {
  definition: BrandGroupingCaseDefinition;
  selection: FieldSelection;
  rawText: string;
  before: CandidateTraceRecord["allCandidatesBeforeFiltering"];
  after: CandidateTraceRecord["allCandidatesAfterFiltering"];
  top3: CandidateTraceRecord["top3"];
  reliabilityState: "RELIABLE" | "UNRELIABLE";
}): BrandGroupingFailureClass {
  if (!args.definition.expectedReadable) return "INSUFFICIENT_SOURCE_IMAGE";
  const top1Correct = expectedMatches(
    args.definition.expectedSellerValue,
    args.selection.observation.value,
  );
  if (top1Correct && args.selection.observation.state === "OBSERVED") return "CORRECT_READ";
  if (top1Correct) return "CORRECT_TOP1_CONSERVATIVE_STATE";
  if (args.reliabilityState === "RELIABLE") return "WRONG_ACCEPTED_CANDIDATE";
  if (!textIncludesExpected(args.rawText, args.definition.expectedSellerValue)) return "OCR_MISS";
  const beforeTruth = args.before.some((candidate) =>
    textIncludesExpected(
      candidate.cleanedValue ?? candidate.rawText,
      args.definition.expectedSellerValue,
    ),
  );
  if (!beforeTruth) return "CANDIDATE_GENERATION_MISS";
  const afterTruth = args.after.some((candidate) =>
    textIncludesExpected(
      candidate.cleanedValue ?? candidate.rawText,
      args.definition.expectedSellerValue,
    ),
  );
  if (!afterTruth) return "FILTERING_MISS";
  const top3Truth = args.top3.some((candidate) =>
    expectedMatches(args.definition.expectedSellerValue, candidate.value),
  );
  if (!top3Truth) return "RANKING_MISS";
  return "RANKING_MISS";
}

async function finalOcrInput(bytes: Uint8Array, pass: PlannedOcrPass): Promise<Buffer> {
  const { crop, rotate, scale } = pass.transform;
  let pipeline = sharp(Buffer.from(bytes)).extract(crop);
  if (rotate) pipeline = sharp(await pipeline.rotate(rotate).toBuffer());
  const meta = await pipeline.metadata();
  return await pipeline
    .resize({ width: Math.max(1, Math.round((meta.width ?? crop.width) * scale)), kernel: "cubic" })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();
}

async function cropBytes(bytes: Uint8Array, pass: PlannedOcrPass): Promise<Buffer> {
  return await sharp(Buffer.from(bytes)).extract(pass.transform.crop).png().toBuffer();
}

function runSelector(
  arm: Arm,
  result: RegionOcrResult,
): { selection: FieldSelection; latencyMs: number } {
  const started = performance.now();
  const selection =
    arm === "control"
      ? selectBrandObservation([result])
      : selectBrandObservationWithCoherentLineMergeTreatment([result]);
  return { selection, latencyMs: performance.now() - started };
}

async function runCaseArm(args: {
  definition: BrandGroupingCaseDefinition;
  arm: Arm;
  result: RegionOcrResult;
  pass: PlannedOcrPass;
  bytes: Uint8Array;
  control?: CaseRun;
}): Promise<{ run: CaseRun; rawWords: RawWordRecord; trace: CandidateTraceRecord }> {
  const { definition, arm, result, pass, bytes, control } = args;
  const { selection, latencyMs } = runSelector(arm, result);
  const reliability = reliabilityFor(selection);
  const transcript = rawTranscript(result);
  const crop = await cropBytes(bytes, pass);
  const finalInput = await finalOcrInput(bytes, pass);
  const cropPath = path.join(
    OUTPUT_DIR,
    "representative-bounded-crops",
    arm,
    `${definition.caseId}.png`,
  );
  const inputPath = path.join(
    OUTPUT_DIR,
    "representative-ocr-inputs",
    arm,
    `${definition.caseId}.png`,
  );
  const transcriptPath = path.join(OUTPUT_DIR, "transcripts", arm, `${definition.caseId}.txt`);
  writeFileSync(cropPath, crop);
  writeFileSync(inputPath, finalInput);
  writeFileSync(transcriptPath, `${transcript}\n`);

  const before = (selection.brandDiagnostics?.candidates ?? []).map((candidate) => ({
    rawText: candidate.rawText,
    cleanedValue: candidate.cleanedValue,
    assembly: candidate.assembly,
    lineIndexes: candidate.lineIndexes,
    kept: candidate.kept,
    filterReason: candidate.filterReason,
  }));
  const after = (selection.brandDiagnostics?.candidates ?? [])
    .filter((candidate) => candidate.kept)
    .map((candidate) => ({
      rawText: candidate.rawText,
      cleanedValue: candidate.cleanedValue,
      assembly: candidate.assembly,
      lineIndexes: candidate.lineIndexes,
      kept: candidate.kept,
      filterReason: candidate.filterReason,
      score: candidate.score,
      ranking: candidate.ranking,
      decision: candidate.decision,
    }));
  const top3 = rankedTop3(selection);
  const rawWordsSha256 = sha256Hex(Buffer.from(JSON.stringify(result.words)));
  const cropGeometrySha256 = sha256Hex(Buffer.from(JSON.stringify(pass.transform)));
  const finalOcrInputSha256 = sha256Hex(finalInput);
  const expectedTruthInRawOcr = textIncludesExpected(transcript, definition.expectedSellerValue);
  const expectedTruthInAnyCandidate = after.some((candidate) =>
    textIncludesExpected(
      candidate.cleanedValue ?? candidate.rawText,
      definition.expectedSellerValue,
    ),
  );
  const expectedTruthInTop3 = top3.some((candidate) =>
    expectedMatches(definition.expectedSellerValue, candidate.value),
  );
  const expectedTruthRankedFirst = expectedMatches(
    definition.expectedSellerValue,
    selection.observation.value,
  );
  const falseReliableRead = reliability.state === "RELIABLE" && !expectedTruthRankedFirst;
  const generatedLineGroups = lineGroups(selection.brandDiagnostics?.lines ?? []);
  const generatedTokenGroups = tokenGroups(result);
  const run: CaseRun = {
    caseId: definition.caseId,
    arm,
    expectedBrand: definition.expectedSellerValue,
    slices: definition.slices,
    rawBoundedOcrWords: result.words.map((word) => word.text),
    rawBoundedOcrTranscript: transcript,
    normalizedTranscript: normalizedTranscript(transcript),
    generatedTokenGroups,
    generatedLineGroups,
    allCandidatesBeforeFiltering: before,
    allCandidatesAfterFiltering: after,
    candidateScores: after.map((candidate) => ({
      value: candidate.cleanedValue,
      rawText: candidate.rawText,
      score: candidate.score,
      ranking: candidate.ranking,
      decision: candidate.decision,
    })),
    top3,
    selectedLikelyBrand: selection.observation.value,
    authorityState: selection.observation.state,
    reliabilityState: reliability.state,
    reliabilityReason: reliability.reason,
    expectedTruthInRawOcr,
    expectedTruthInAnyCandidate,
    expectedTruthInTop3,
    expectedTruthRankedFirst,
    authorityGateAlonePreventedObserved:
      expectedTruthRankedFirst && selection.observation.state !== "OBSERVED",
    primaryFailureClass: classifyFailure({
      definition,
      selection,
      rawText: transcript,
      before,
      after,
      top3,
      reliabilityState: reliability.state,
    }),
    falseReliableRead,
    exactTop1Correct: selection.observation.value === definition.expectedSellerValue,
    normalizedTop1Correct: boundedValueEquivalent(
      "brandName",
      definition.expectedSellerValue,
      selection.observation.value,
    ),
    cropGeometrySha256,
    finalOcrInputSha256,
    rawOcrWordsSha256: rawWordsSha256,
    cropGeometryMatchesControl: control ? cropGeometrySha256 === control.cropGeometrySha256 : true,
    finalOcrInputMatchesControl: control
      ? finalOcrInputSha256 === control.finalOcrInputSha256
      : true,
    rawOcrOutputMatchesControl: control ? rawWordsSha256 === control.rawOcrWordsSha256 : true,
    preprocessingMatchesControl: control
      ? JSON.stringify(pass.preprocessing) === JSON.stringify(control.preprocessingSteps)
      : true,
    pageSegMode: pass.pageSegMode,
    preprocessingSteps: pass.preprocessing,
    latencyMs: { boundedOcr: result.timings.totalMs, selection: latencyMs },
    artifacts: {
      boundedCrop: posixRelative(cropPath),
      finalOcrInput: posixRelative(inputPath),
      transcript: posixRelative(transcriptPath),
    },
  };
  const rawWords: RawWordRecord = {
    caseId: definition.caseId,
    words: result.words.map((word) => ({
      text: word.text,
      rawConfidence: word.rawConfidence,
      bbox: word.bbox,
      originalGeometry: word.originalGeometry,
    })),
  };
  const trace: CandidateTraceRecord = {
    caseId: definition.caseId,
    arm,
    expectedBrand: definition.expectedSellerValue,
    rawBoundedOcrTranscript: transcript,
    normalizedTranscript: normalizedTranscript(transcript),
    generatedTokenGroups,
    generatedLineGroups,
    allCandidatesBeforeFiltering: before,
    allCandidatesAfterFiltering: after,
    selectedLikelyBrand: selection.observation.value,
    authorityState: selection.observation.state,
    reliabilityReason: reliability.reason,
    top3,
  };
  return { run, rawWords, trace };
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

function counts<T extends string>(values: T[]): Record<T, number> {
  return values.reduce(
    (out, value) => ({ ...out, [value]: (out[value] ?? 0) + 1 }),
    {} as Record<T, number>,
  );
}

function metricsFor(cases: CaseRun[]) {
  const readable = cases.filter((item) => !item.slices.includes("unreadableSelectedRegion"));
  return {
    caseCount: cases.length,
    rawOcrTruthRecall: rate(
      cases.filter((item) => item.expectedTruthInRawOcr).length,
      cases.length,
    ),
    candidateListTruthRecall: rate(
      cases.filter((item) => item.expectedTruthInAnyCandidate).length,
      cases.length,
    ),
    top3TruthRecall: rate(cases.filter((item) => item.expectedTruthInTop3).length, cases.length),
    top1NormalizedAccuracy: rate(
      cases.filter((item) => item.normalizedTop1Correct).length,
      cases.length,
    ),
    exactTop1Accuracy: rate(cases.filter((item) => item.exactTop1Correct).length, cases.length),
    authorityStateHistogram: counts(cases.map((item) => item.authorityState)),
    correctTop1ButConservativeCount: cases.filter(
      (item) => item.authorityGateAlonePreventedObserved,
    ).length,
    rankingMisses: cases.filter((item) => item.primaryFailureClass === "RANKING_MISS").length,
    groupingMisses: cases.filter(
      (item) =>
        item.primaryFailureClass === "TOKEN_GROUPING_MISS" ||
        item.primaryFailureClass === "LINE_GROUPING_MISS" ||
        item.primaryFailureClass === "CANDIDATE_GENERATION_MISS",
    ).length,
    filteringMisses: cases.filter((item) => item.primaryFailureClass === "FILTERING_MISS").length,
    wrongAcceptedCandidates: cases.filter(
      (item) => item.primaryFailureClass === "WRONG_ACCEPTED_CANDIDATE",
    ).length,
    falseReliableReadRate: rate(
      cases.filter((item) => item.falseReliableRead).length,
      cases.length,
    ),
    readableRawOcrTruthRecall: rate(
      readable.filter((item) => item.expectedTruthInRawOcr).length,
      readable.length,
    ),
    medianBoundedOcrLatencyMs: median(cases.map((item) => item.latencyMs.boundedOcr)),
    p95BoundedOcrLatencyMs: p95(cases.map((item) => item.latencyMs.boundedOcr)),
    medianSelectionLatencyMs: median(cases.map((item) => item.latencyMs.selection)),
    p95SelectionLatencyMs: p95(cases.map((item) => item.latencyMs.selection)),
    failureClassHistogram: counts(cases.map((item) => item.primaryFailureClass)),
  };
}

function summarizeMetrics(cases: CaseRun[]) {
  return {
    overall: metricsFor(cases),
    bySlice: Object.fromEntries(
      (
        [
          "cleanTypography",
          "stylizedTypography",
          "multiLineBrand",
          "lowResolutionBrand",
          "adjacentProductText",
          "adjacentLocationText",
        ] as const
      ).map((slice) => [slice, metricsFor(cases.filter((item) => item.slices.includes(slice)))]),
    ),
  };
}

function reportFor(arm: Arm, cases: CaseRun[]): ExperimentReport {
  return {
    schemaVersion: "issue-149-brand-grouping-ranking.v1",
    arm,
    config: {
      singleVariableChanged:
        arm === "control"
          ? "Control uses current production Brand grouping/ranking."
          : "Treatment allows coherent adjacent plausible Brand lines to form a multi-line candidate; authority gates are unchanged.",
      treatmentEnabledInProduction: false,
      ocrEngineChanged: false,
      cropGeometryChanged: false,
      paddingChanged: false,
      clippingChanged: false,
      scaleFactorChanged: false,
      preprocessingChanged: false,
      psmChanged: false,
      orientationPolicyChanged: false,
      confidenceThresholdsChanged: false,
      authorityGateChanged: false,
      sellerDeclarationUsedForRanking: false,
      alcoholBehaviorChanged: false,
      governmentWarningBehaviorChanged: false,
      twoStreamComparisonChanged: false,
    },
    metrics: summarizeMetrics(cases),
    cases,
  };
}

function buildDiffs(control: CaseRun[], treatment: CaseRun[]): ExperimentOutputs["diffs"] {
  return control.map((base) => {
    const next = treatment.find((item) => item.caseId === base.caseId);
    if (!next) throw new Error(`missing treatment case ${base.caseId}`);
    return {
      caseId: base.caseId,
      controlSelected: base.selectedLikelyBrand,
      treatmentSelected: next.selectedLikelyBrand,
      controlClass: base.primaryFailureClass,
      treatmentClass: next.primaryFailureClass,
      top1NormalizedDelta: Number(next.normalizedTop1Correct) - Number(base.normalizedTop1Correct),
      top3RecallDelta: Number(next.expectedTruthInTop3) - Number(base.expectedTruthInTop3),
      falseReliableReadDelta: Number(next.falseReliableRead) - Number(base.falseReliableRead),
      selectionLatencyDeltaMs: next.latencyMs.selection - base.latencyMs.selection,
      outcomeChange:
        base.selectedLikelyBrand === next.selectedLikelyBrand &&
        base.primaryFailureClass === next.primaryFailureClass
          ? "unchanged"
          : `${base.primaryFailureClass} -> ${next.primaryFailureClass}`,
    };
  });
}

function decide(
  outputs: Pick<ExperimentOutputs, "control" | "treatment" | "diffs">,
): ExperimentOutputs["decision"] {
  const control = outputs.control.metrics.overall;
  const treatment = outputs.treatment.metrics.overall;
  const improvedCases = outputs.diffs.filter(
    (diff) => diff.top1NormalizedDelta > 0 || diff.top3RecallDelta > 0,
  );
  const wrongAcceptedDelta = treatment.wrongAcceptedCandidates - control.wrongAcceptedCandidates;
  const falseReliableDelta =
    (treatment.falseReliableReadRate ?? 0) - (control.falseReliableReadRate ?? 0);
  const top3Delta = (treatment.top3TruthRecall ?? 0) - (control.top3TruthRecall ?? 0);
  const top1Delta = (treatment.top1NormalizedAccuracy ?? 0) - (control.top1NormalizedAccuracy ?? 0);
  const passed =
    (top1Delta > 0 || top3Delta > 0) &&
    improvedCases.length > 1 &&
    wrongAcceptedDelta <= 0 &&
    falseReliableDelta <= 0;
  if (passed) {
    return {
      passed: true,
      killCriterionHit: false,
      recommendation: "adopt later",
      reason:
        "Treatment improved Brand ranking across more than one fixture without increasing false reliable reads or wrong accepted candidates.",
    };
  }
  return {
    passed: false,
    killCriterionHit:
      improvedCases.length <= 1 ||
      wrongAcceptedDelta > 0 ||
      falseReliableDelta > 0 ||
      top3Delta < 0,
    recommendation: improvedCases.length > 0 ? "run one narrower follow-up" : "reject",
    reason:
      improvedCases.length > 0
        ? "Treatment produced limited evidence but did not satisfy all adoption criteria."
        : "Treatment did not measurably improve Brand top-1 or top-3 accuracy.",
  };
}

function renderConfig(): string {
  return `# Issue #149 Brand grouping and ranking config

Single variable under test: allow coherent adjacent plausible Brand lines to form a multi-line candidate in the treatment selector.

Unchanged: OCR engine, crop geometry, padding, clipping, scale factor, preprocessing, PSM mode, orientation policy, confidence thresholds, authority requirements, seller declaration authority, Alcohol behavior, Government Warning behavior, two-stream comparison semantics, package-analysis serialization, and production UI behavior.

The seller-entered Brand value is used only by the evaluation harness as truth for measurement. It is not passed into OCR, candidate generation, candidate ranking, or selection.

Control: current production \`selectBrandObservation\`.

Treatment: \`selectBrandObservationWithCoherentLineMergeTreatment\`, called only from this evaluation harness and focused tests. Production continues to call the control selector.

Current Brand path summary:

1. Bounded seller-region OCR emits raw words with processed and original-frame geometry.
2. The selector normalizes transcript text only for candidate cleaning and comparison keys.
3. Words are ordered top-to-bottom, left-to-right.
4. Words are grouped into lines by vertical proximity.
5. Whole-line candidates are analyzed first.
6. Existing line-window candidates are generated only for trimmable positive lines.
7. Existing multi-line candidates are generated for adjacent lines when at least one line has a positive Brand signal.
8. Candidates are filtered by producer, non-brand, product/designation, location/appellation, low-information, and sentence-fragment rules.
9. Kept candidates are scored by positive signal, meaningful characters, structure, OCR score, prominence, area, centrality, alignment, proximity, and penalties.
10. Ranking selects a likely candidate and top alternates.
11. Authority remains separate: a likely candidate becomes OBSERVED only when it is positive and clears the confidence floor; otherwise it remains AMBIGUOUS or LOW/NOT observed downstream.
12. Package analysis serializes OCR-derived observations and seller-region readings separately for review UI presentation.
`;
}

function renderMetrics(outputs: ExperimentOutputs): string {
  const c = outputs.control.metrics.overall;
  const t = outputs.treatment.metrics.overall;
  const rows = [
    ["Metric", "Control", "Treatment", "Delta"],
    ["Raw OCR truth recall", c.rawOcrTruthRecall ?? "n/a", t.rawOcrTruthRecall ?? "n/a", "0"],
    [
      "Candidate-list truth recall",
      c.candidateListTruthRecall ?? "n/a",
      t.candidateListTruthRecall ?? "n/a",
      ((t.candidateListTruthRecall ?? 0) - (c.candidateListTruthRecall ?? 0)).toFixed(4),
    ],
    [
      "Top-3 truth recall",
      c.top3TruthRecall ?? "n/a",
      t.top3TruthRecall ?? "n/a",
      ((t.top3TruthRecall ?? 0) - (c.top3TruthRecall ?? 0)).toFixed(4),
    ],
    [
      "Top-1 normalized accuracy",
      c.top1NormalizedAccuracy ?? "n/a",
      t.top1NormalizedAccuracy ?? "n/a",
      ((t.top1NormalizedAccuracy ?? 0) - (c.top1NormalizedAccuracy ?? 0)).toFixed(4),
    ],
    [
      "False reliable read rate",
      c.falseReliableReadRate ?? "n/a",
      t.falseReliableReadRate ?? "n/a",
      "0",
    ],
    [
      "Median selection latency ms",
      c.medianSelectionLatencyMs ?? "n/a",
      t.medianSelectionLatencyMs ?? "n/a",
      ((t.medianSelectionLatencyMs ?? 0) - (c.medianSelectionLatencyMs ?? 0)).toFixed(4),
    ],
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
        `| ${diff.caseId} | ${diff.controlSelected ?? ""} | ${diff.treatmentSelected ?? ""} | ${diff.controlClass} | ${diff.treatmentClass} | ${diff.outcomeChange} |`,
    )
    .join("\n");
  return `# Brand grouping and ranking metric diff

${table}

## Per-case changes

| Case | Control selected | Treatment selected | Control class | Treatment class | Outcome change |
| --- | --- | --- | --- | --- | --- |
${cases}

## Decision

${outputs.decision.recommendation.toUpperCase()}: ${outputs.decision.reason}
`;
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

export async function generateIssue149BrandGroupingRankingExperiment(): Promise<ExperimentOutputs> {
  ensureCleanDir(OUTPUT_DIR);
  const controlCases: CaseRun[] = [];
  const treatmentCases: CaseRun[] = [];
  const rawWords: RawWordRecord[] = [];
  const traces: CandidateTraceRecord[] = [];
  const engine = await createLocalOcrEngine();
  try {
    for (const definition of BRAND_GROUPING_CASES) {
      const bytes = await sourceBytes(definition.source);
      const meta = await sharp(Buffer.from(bytes)).metadata();
      const image = { width: meta.width ?? 0, height: meta.height ?? 0 };
      const target: SellerRegionOcrTarget = {
        categoryId: "brandName",
        regionId: `${definition.caseId}-brandName`,
        panelId: definition.panelId,
        region: normalizedRegion(definition.selectedPixelRegion, image.width, image.height),
      };
      const pass = planSellerRegionOcrPass(target, image.width, image.height, 1);
      if (!pass) throw new Error(`seller-region pass missing for ${definition.caseId}`);
      if (pass.pageSegMode !== PAGE_SEG.SPARSE_TEXT) {
        throw new Error(
          `unexpected Brand bounded PSM for ${definition.caseId}: ${pass.pageSegMode}`,
        );
      }
      const result = await runOcrPass(bytes, pass, engine);
      const control = await runCaseArm({ definition, arm: "control", result, pass, bytes });
      const treatment = await runCaseArm({
        definition,
        arm: "treatment",
        result,
        pass,
        bytes,
        control: control.run,
      });
      controlCases.push(control.run);
      treatmentCases.push(treatment.run);
      rawWords.push(control.rawWords);
      traces.push(control.trace, treatment.trace);
    }
  } finally {
    await engine.terminate();
  }
  const control = reportFor("control", controlCases);
  const treatment = reportFor("treatment", treatmentCases);
  const outputs: ExperimentOutputs = {
    control,
    treatment,
    diffs: buildDiffs(controlCases, treatmentCases),
    decision: { passed: false, killCriterionHit: false, recommendation: "reject", reason: "" },
  };
  outputs.decision = decide(outputs);
  writeFileSync(path.join(OUTPUT_DIR, "config.md"), renderConfig());
  writeFileSync(
    path.join(OUTPUT_DIR, "commands.sh"),
    "#!/usr/bin/env bash\nset -euo pipefail\nnpm run eval:issue-149-brand-grouping-ranking\n",
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
  writeFileSync(
    path.join(OUTPUT_DIR, "raw-words.jsonl"),
    rawWords.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  writeFileSync(
    path.join(OUTPUT_DIR, "candidate-traces.jsonl"),
    traces.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  return outputs;
}

export function stableBrandCaseProjection<T extends { latencyMs?: unknown }>(
  record: T,
): Omit<T, "latencyMs"> {
  const projection: Partial<T> = { ...record };
  delete projection.latencyMs;
  return projection as Omit<T, "latencyMs">;
}
