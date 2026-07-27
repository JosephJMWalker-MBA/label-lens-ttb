import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { compareText } from "@/domain/compare/semantic";
import { format, resolveConfig } from "prettier";

import {
  selectBrandObservation,
  selectBrandObservationLegacyGroupingControl,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";
import type { OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import { PAGE_SEG } from "@/pipeline/extractor/ocr-engine";

const OUTPUT_DIR = path.join(process.cwd(), "artifacts/issue-149-enable-brand-grouping");
const RELIABILITY_CONFIDENCE_FLOOR = 0.8;

type Arm = "control" | "production";

interface EvalCase {
  caseId: string;
  expectedBrand: string;
  expectedReadable: boolean;
  slices: string[];
  words: OcrWord[];
}

interface CaseRun {
  caseId: string;
  arm: Arm;
  expectedBrand: string;
  slices: string[];
  rawBoundedOcrTranscript: string;
  selectedLikelyBrand: string | null;
  authorityState: FieldSelection["observation"]["state"];
  reliabilityState: "RELIABLE" | "UNRELIABLE";
  expectedTruthInRawOcr: boolean;
  expectedTruthInAnyCandidate: boolean;
  expectedTruthInTop3: boolean;
  normalizedTop1Correct: boolean;
  exactTop1Correct: boolean;
  wrongAcceptedCandidate: boolean;
  falseReliableRead: boolean;
  designatorOnlyWinner: boolean;
  latencyMs: number;
  top3: string[];
}

interface ExperimentReport {
  schemaVersion: "issue-149-enable-brand-grouping.v1";
  arm: Arm;
  config: {
    productionBrandGroupingEnabled: boolean;
    ocrEngineChanged: false;
    cropGeometryChanged: false;
    paddingChanged: false;
    clippingChanged: false;
    scaleFactorChanged: false;
    preprocessingChanged: false;
    psmChanged: false;
    orientationPolicyChanged: false;
    confidenceThresholdsChanged: false;
    brandAuthorityThresholdsChanged: false;
    sellerDeclarationUsedForRanking: false;
    alcoholBehaviorChanged: false;
    governmentWarningBehaviorChanged: false;
    twoStreamComparisonChanged: false;
    persistenceSchemasChanged: false;
    reportFormatsChanged: false;
    uiStructureChanged: false;
  };
  metrics: ReturnType<typeof metricsFor>;
  cases: CaseRun[];
}

interface ExperimentOutputs {
  control: ExperimentReport;
  production: ExperimentReport;
  diffs: Array<{
    caseId: string;
    controlSelected: string | null;
    productionSelected: string | null;
    normalizedTop1Delta: number;
    exactTop1Delta: number;
    top3RecallDelta: number;
    falseReliableReadDelta: number;
    designatorOnlyWinnerDelta: number;
    authorityStateChange: string;
    latencyDeltaMs: number;
  }>;
  decision: {
    passed: boolean;
    killCriterionHit: boolean;
    recommendation: "enable" | "reject";
    reason: string;
  };
}

const image = { width: 900, height: 620 };

function word(text: string, rawConfidence: number, x: number, y: number, width = 80): OcrWord {
  return {
    text,
    rawConfidence,
    bbox: { x0: x, y0: y, x1: x + width, y1: y + 42 },
    originalGeometry: {
      imageIndex: 0,
      x,
      y,
      width,
      height: 42,
      imageWidth: image.width,
      imageHeight: image.height,
    },
  };
}

const CASES: EvalCase[] = [
  {
    caseId: "brand-garden-city-beach-synthetic",
    expectedBrand: "GARDEN CITY BEACH",
    expectedReadable: true,
    slices: ["multiLineBrand"],
    words: [
      word("GARDEN", 91, 110, 140, 170),
      word("CITY", 90, 118, 204, 110),
      word("BEACH", 92, 250, 204, 150),
    ],
  },
  {
    caseId: "brand-north-star-multiline-synthetic",
    expectedBrand: "NORTH STAR",
    expectedReadable: true,
    slices: ["multiLineBrand"],
    words: [word("NORTH", 91, 110, 140, 150), word("STAR", 90, 118, 204, 120)],
  },
  {
    caseId: "brand-m-cellars-clean-designator",
    expectedBrand: "M CELLARS",
    expectedReadable: true,
    slices: ["designatorGuard"],
    words: [word("M", 74, 110, 140, 44), word("CELLARS", 96, 176, 140, 180)],
  },
  {
    caseId: "brand-minneapolis-single-line",
    expectedBrand: "MINNEAPOLIS",
    expectedReadable: true,
    slices: ["singleLineBrand"],
    words: [word("MINNEAPOLIS", 94, 110, 140, 260)],
  },
  {
    caseId: "brand-arandano-single-line",
    expectedBrand: "ARANDANO",
    expectedReadable: true,
    slices: ["singleLineBrand"],
    words: [word("ARANDANO", 89, 110, 140, 210)],
  },
  {
    caseId: "brand-golden-girls-single-line",
    expectedBrand: "GOLDEN GIRLS",
    expectedReadable: true,
    slices: ["singleLineBrand"],
    words: [word("GOLDEN", 88, 110, 140, 170), word("GIRLS", 88, 300, 140, 130)],
  },
  {
    caseId: "brand-ridge-cellars-adjacent-product",
    expectedBrand: "RIDGE CELLARS",
    expectedReadable: true,
    slices: ["adjacentProductText"],
    words: [
      word("RIDGE", 93, 110, 140, 150),
      word("CELLARS", 94, 278, 140, 180),
      word("CABERNET", 95, 116, 210, 200),
      word("SAUVIGNON", 95, 338, 210, 220),
    ],
  },
  {
    caseId: "brand-harbor-cellars-adjacent-location",
    expectedBrand: "HARBOR CELLARS",
    expectedReadable: true,
    slices: ["adjacentLocationText"],
    words: [
      word("HARBOR", 93, 110, 140, 180),
      word("CELLARS", 94, 310, 140, 190),
      word("NAPA", 95, 116, 210, 120),
      word("VALLEY", 95, 258, 210, 150),
    ],
  },
  {
    caseId: "brand-unreadable-selected-region",
    expectedBrand: "HIDDEN BRAND",
    expectedReadable: false,
    slices: ["unreadableSelectedRegion"],
    words: [],
  },
];

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

function result(words: OcrWord[]): RegionOcrResult {
  return {
    passId: "seller-region-1",
    regionName: "seller-region",
    passKind: "seller-region",
    triggerReasons: ["seller-region-target"],
    preprocessing: ["crop:seller-region", "grayscale", "normalise", "scale:3"],
    fieldEligibility: { brand: true, alcohol: false },
    transform: {
      crop: { left: 90, top: 100, width: 500, height: 240 },
      rotate: 0,
      scale: 3,
      originalWidth: image.width,
      originalHeight: image.height,
    },
    transformedSize: { width: 1500, height: 720 },
    pageSegMode: PAGE_SEG.SPARSE_TEXT,
    rawWordCount: words.length,
    discardedWordCount: 0,
    timings: { preprocessMs: 1, ocrMs: 2, inverseMappingMs: 1, totalMs: 4 },
    words,
  };
}

function rawTranscript(words: OcrWord[]): string {
  return words
    .map((item) => item.text)
    .join(" ")
    .trim();
}

function expectedMatches(expected: string, observed: string | null): boolean {
  if (!observed) return false;
  return compareText(expected, observed).equivalence !== "different";
}

function textIncludesExpected(text: string, expected: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = normalize(expected);
  return needle.length > 0 && normalize(text).includes(needle);
}

function top3(selection: FieldSelection): string[] {
  const ranked = (selection.brandDiagnostics?.candidates ?? [])
    .filter((candidate) => candidate.kept && candidate.decision !== undefined)
    .sort((a, b) => {
      const rank = { selected: 0, "ambiguous-rival": 1, alternate: 2 } as const;
      return rank[a.decision!] - rank[b.decision!];
    });
  return ranked.slice(0, 3).map((candidate) => candidate.cleanedValue ?? candidate.rawText);
}

function isDesignatorOnly(value: string | null): boolean {
  if (!value) return false;
  return /^(?:CELLARS?|ESTATES?|VINEYARDS?|WINER(?:Y|IES))$/i.test(value.trim());
}

function runCase(definition: EvalCase, arm: Arm): CaseRun {
  const ocr = result(definition.words);
  const started = performance.now();
  const selection =
    arm === "control"
      ? selectBrandObservationLegacyGroupingControl([ocr])
      : selectBrandObservation([ocr]);
  const latencyMs = performance.now() - started;
  const transcript = rawTranscript(definition.words);
  const selected = selection.observation.value;
  const top = top3(selection);
  const normalizedTop1Correct = expectedMatches(definition.expectedBrand, selected);
  const reliable =
    selection.observation.state === "OBSERVED" &&
    selection.observation.ocrEvidenceScore >= RELIABILITY_CONFIDENCE_FLOOR;
  return {
    caseId: definition.caseId,
    arm,
    expectedBrand: definition.expectedBrand,
    slices: definition.slices,
    rawBoundedOcrTranscript: transcript,
    selectedLikelyBrand: selected,
    authorityState: selection.observation.state,
    reliabilityState: reliable ? "RELIABLE" : "UNRELIABLE",
    expectedTruthInRawOcr: definition.expectedReadable
      ? textIncludesExpected(transcript, definition.expectedBrand)
      : false,
    expectedTruthInAnyCandidate: definition.expectedReadable
      ? (selection.brandDiagnostics?.candidates ?? []).some((candidate) =>
          textIncludesExpected(
            candidate.cleanedValue ?? candidate.rawText,
            definition.expectedBrand,
          ),
        )
      : false,
    expectedTruthInTop3: definition.expectedReadable
      ? top.some((value) => expectedMatches(definition.expectedBrand, value))
      : false,
    normalizedTop1Correct,
    exactTop1Correct: selected === definition.expectedBrand,
    wrongAcceptedCandidate:
      definition.expectedReadable &&
      selection.observation.state === "OBSERVED" &&
      !normalizedTop1Correct,
    falseReliableRead: reliable && !normalizedTop1Correct,
    designatorOnlyWinner: isDesignatorOnly(selected),
    latencyMs,
    top3: top,
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

function metricsFor(cases: CaseRun[]) {
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
    authorityStateHistogram: cases.reduce<Record<string, number>>((out, item) => {
      out[item.authorityState] = (out[item.authorityState] ?? 0) + 1;
      return out;
    }, {}),
    wrongAcceptedCandidates: cases.filter((item) => item.wrongAcceptedCandidate).length,
    falseReliableReadRate: rate(
      cases.filter((item) => item.falseReliableRead).length,
      cases.length,
    ),
    designatorOnlyWinnerCount: cases.filter((item) => item.designatorOnlyWinner).length,
    medianSelectionLatencyMs: median(cases.map((item) => item.latencyMs)),
  };
}

function reportFor(arm: Arm, cases: CaseRun[]): ExperimentReport {
  return {
    schemaVersion: "issue-149-enable-brand-grouping.v1",
    arm,
    config: {
      productionBrandGroupingEnabled: arm === "production",
      ocrEngineChanged: false,
      cropGeometryChanged: false,
      paddingChanged: false,
      clippingChanged: false,
      scaleFactorChanged: false,
      preprocessingChanged: false,
      psmChanged: false,
      orientationPolicyChanged: false,
      confidenceThresholdsChanged: false,
      brandAuthorityThresholdsChanged: false,
      sellerDeclarationUsedForRanking: false,
      alcoholBehaviorChanged: false,
      governmentWarningBehaviorChanged: false,
      twoStreamComparisonChanged: false,
      persistenceSchemasChanged: false,
      reportFormatsChanged: false,
      uiStructureChanged: false,
    },
    metrics: metricsFor(cases),
    cases,
  };
}

function buildDiffs(control: CaseRun[], production: CaseRun[]): ExperimentOutputs["diffs"] {
  return control.map((base) => {
    const next = production.find((item) => item.caseId === base.caseId);
    if (!next) throw new Error(`missing production case ${base.caseId}`);
    return {
      caseId: base.caseId,
      controlSelected: base.selectedLikelyBrand,
      productionSelected: next.selectedLikelyBrand,
      normalizedTop1Delta: Number(next.normalizedTop1Correct) - Number(base.normalizedTop1Correct),
      exactTop1Delta: Number(next.exactTop1Correct) - Number(base.exactTop1Correct),
      top3RecallDelta: Number(next.expectedTruthInTop3) - Number(base.expectedTruthInTop3),
      falseReliableReadDelta: Number(next.falseReliableRead) - Number(base.falseReliableRead),
      designatorOnlyWinnerDelta:
        Number(next.designatorOnlyWinner) - Number(base.designatorOnlyWinner),
      authorityStateChange:
        base.authorityState === next.authorityState
          ? "unchanged"
          : `${base.authorityState} -> ${next.authorityState}`,
      latencyDeltaMs: next.latencyMs - base.latencyMs,
    };
  });
}

function decide(outputs: Pick<ExperimentOutputs, "control" | "production" | "diffs">) {
  const garden = outputs.diffs.find((item) => item.caseId === "brand-garden-city-beach-synthetic");
  const north = outputs.diffs.find(
    (item) => item.caseId === "brand-north-star-multiline-synthetic",
  );
  const mCellars = outputs.production.cases.find(
    (item) => item.caseId === "brand-m-cellars-clean-designator",
  );
  const productSafe = outputs.production.cases.find((item) =>
    item.slices.includes("adjacentProductText"),
  )?.normalizedTop1Correct;
  const locationSafe = outputs.production.cases.find((item) =>
    item.slices.includes("adjacentLocationText"),
  )?.normalizedTop1Correct;
  const unreadable = outputs.production.cases.find((item) =>
    item.slices.includes("unreadableSelectedRegion"),
  );
  const controlMetrics = outputs.control.metrics;
  const productionMetrics = outputs.production.metrics;
  const passed =
    (garden?.normalizedTop1Delta ?? 0) > 0 &&
    (north?.normalizedTop1Delta ?? 0) > 0 &&
    mCellars?.selectedLikelyBrand === "M CELLARS" &&
    productionMetrics.designatorOnlyWinnerCount < controlMetrics.designatorOnlyWinnerCount &&
    productionMetrics.wrongAcceptedCandidates <= controlMetrics.wrongAcceptedCandidates &&
    (productionMetrics.falseReliableReadRate ?? 0) <= (controlMetrics.falseReliableReadRate ?? 0) &&
    productSafe === true &&
    locationSafe === true &&
    unreadable?.authorityState === "NOT_OBSERVED";
  return {
    passed,
    killCriterionHit: !passed,
    recommendation: passed ? "enable" : "reject",
    reason: passed
      ? "Production Brand grouping improves the staged multi-line cases and M Cellars without increasing false certainty or promoting product/location text."
      : "One or more production-enablement criteria failed.",
  } as const;
}

function renderConfig(): string {
  return `# Issue #149 production Brand grouping enablement

Control: legacy production behavior before PR #194 treatment promotion.

Production: current \`selectBrandObservation\`, with coherent adjacent plausible Brand line merging enabled and a deterministic designator-only family guard.

Unchanged: OCR engine, bounded crop geometry, padding, clipping, scale factor, preprocessing, PSM mode, orientation policy, OCR confidence thresholds, Brand authority thresholds, seller declaration authority, Alcohol behavior, Government Warning behavior, two-stream comparison semantics, persistence schemas, report formats, and UI structure.

Seller-entered Brand text is used only as evaluation truth here. It is not passed into OCR, grouping, filtering, scoring, or ranking.
`;
}

function renderMetrics(outputs: ExperimentOutputs): string {
  const c = outputs.control.metrics;
  const p = outputs.production.metrics;
  const rows = [
    ["Metric", "Control", "Production", "Delta"],
    ["Raw OCR truth recall", c.rawOcrTruthRecall ?? "n/a", p.rawOcrTruthRecall ?? "n/a", "0"],
    [
      "Candidate-list truth recall",
      c.candidateListTruthRecall ?? "n/a",
      p.candidateListTruthRecall ?? "n/a",
      ((p.candidateListTruthRecall ?? 0) - (c.candidateListTruthRecall ?? 0)).toFixed(4),
    ],
    [
      "Top-3 truth recall",
      c.top3TruthRecall ?? "n/a",
      p.top3TruthRecall ?? "n/a",
      ((p.top3TruthRecall ?? 0) - (c.top3TruthRecall ?? 0)).toFixed(4),
    ],
    [
      "Top-1 normalized accuracy",
      c.top1NormalizedAccuracy ?? "n/a",
      p.top1NormalizedAccuracy ?? "n/a",
      ((p.top1NormalizedAccuracy ?? 0) - (c.top1NormalizedAccuracy ?? 0)).toFixed(4),
    ],
    [
      "Exact top-1 accuracy",
      c.exactTop1Accuracy ?? "n/a",
      p.exactTop1Accuracy ?? "n/a",
      ((p.exactTop1Accuracy ?? 0) - (c.exactTop1Accuracy ?? 0)).toFixed(4),
    ],
    [
      "Wrong accepted candidates",
      c.wrongAcceptedCandidates,
      p.wrongAcceptedCandidates,
      p.wrongAcceptedCandidates - c.wrongAcceptedCandidates,
    ],
    [
      "False reliable-read rate",
      c.falseReliableReadRate ?? "n/a",
      p.falseReliableReadRate ?? "n/a",
      ((p.falseReliableReadRate ?? 0) - (c.falseReliableReadRate ?? 0)).toFixed(4),
    ],
    [
      "Designator-only winner count",
      c.designatorOnlyWinnerCount,
      p.designatorOnlyWinnerCount,
      p.designatorOnlyWinnerCount - c.designatorOnlyWinnerCount,
    ],
    [
      "Median selection latency ms",
      c.medianSelectionLatencyMs ?? "n/a",
      p.medianSelectionLatencyMs ?? "n/a",
      ((p.medianSelectionLatencyMs ?? 0) - (c.medianSelectionLatencyMs ?? 0)).toFixed(4),
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
        `| ${diff.caseId} | ${diff.controlSelected ?? ""} | ${diff.productionSelected ?? ""} | ${diff.normalizedTop1Delta} | ${diff.authorityStateChange} | ${diff.falseReliableReadDelta} | ${diff.designatorOnlyWinnerDelta} | ${diff.latencyDeltaMs.toFixed(4)} |`,
    )
    .join("\n");
  return `# Brand production grouping metric diff

${table}

Control authority histogram: \`${JSON.stringify(c.authorityStateHistogram)}\`

Production authority histogram: \`${JSON.stringify(p.authorityStateHistogram)}\`

## Per-case changes

| Case | Control selected | Production selected | Normalized top-1 delta | Authority state | False reliable delta | Designator-only delta | Latency delta ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
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

export async function generateIssue149EnableBrandGroupingExperiment(): Promise<ExperimentOutputs> {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(path.join(OUTPUT_DIR, "control"), { recursive: true });
  mkdirSync(path.join(OUTPUT_DIR, "production"), { recursive: true });
  mkdirSync(path.join(OUTPUT_DIR, "diff"), { recursive: true });

  const controlCases = CASES.map((definition) => runCase(definition, "control"));
  const productionCases = CASES.map((definition) => runCase(definition, "production"));
  const outputs: ExperimentOutputs = {
    control: reportFor("control", controlCases),
    production: reportFor("production", productionCases),
    diffs: buildDiffs(controlCases, productionCases),
    decision: { passed: false, killCriterionHit: false, recommendation: "reject", reason: "" },
  };
  outputs.decision = decide(outputs);

  writeFileSync(path.join(OUTPUT_DIR, "config.md"), renderConfig());
  writeFileSync(
    path.join(OUTPUT_DIR, "commands.sh"),
    "#!/usr/bin/env bash\nset -euo pipefail\nnpm run eval:issue-149-enable-brand-grouping\n",
    { mode: 0o755 },
  );
  writeFileSync(path.join(OUTPUT_DIR, "git-sha.txt"), `${currentGitSha()}\n`);
  await writeFormattedJson(path.join(OUTPUT_DIR, "control", "report.json"), outputs.control);
  await writeFormattedJson(path.join(OUTPUT_DIR, "production", "report.json"), outputs.production);
  writeFileSync(path.join(OUTPUT_DIR, "diff", "metrics.md"), renderMetrics(outputs));
  writeFileSync(
    path.join(OUTPUT_DIR, "cases.jsonl"),
    outputs.diffs.map((diff) => JSON.stringify(diff)).join("\n") + "\n",
  );
  return outputs;
}
