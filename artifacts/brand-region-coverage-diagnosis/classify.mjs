/**
 * Phase 2 classification. Reads cases.json only; runs no OCR.
 *
 * Precedence (pre-registered): REGION_NOT_COVERED > REGION_COVERED_NO_TEXT_RECOGNIZED
 * > ORIENTATION_OR_SEGMENTATION_FAILURE > REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION
 * > UNATTRIBUTED. Exactly one first-failure category per primary case.
 *
 * For a multi-occurrence case the classification uses the occurrence that gives
 * the pipeline the BEST chance (most overlapping words carrying brand-like
 * evidence); the other occurrence is recorded as a secondary mechanism.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
const C = JSON.parse(readFileSync(path.join(OUT, "cases.json"), "utf8"));
const norm = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function classifyOccurrence(occ, truthTokenCount) {
  const covering = occ.passes.filter((p) => p.geometricallyCovers);
  const bestCoverage = Math.max(0, ...occ.passes.map((p) => p.coverageRatio));
  if (covering.length === 0) {
    return { category: "REGION_NOT_COVERED", signals: { bestCoverage }, words: [] };
  }
  const words = covering.flatMap((p) => p.overlappingWords);
  if (words.length === 0) {
    return {
      category: "REGION_COVERED_NO_TEXT_RECOGNIZED",
      signals: { bestCoverage, overlappingWords: 0 },
      words,
    };
  }
  // Geometry-based segmentation / orientation signals.
  const lineIdx = words.map((w) => w.lineIndex);
  const distinctLines = new Set(lineIdx.filter((i) => i !== null)).size;
  const unlinked = lineIdx.filter((i) => i === null).length;
  const rotatedPass = covering.some((p) => p.rotate !== 0);
  const splitIntoMoreWords = words.length > truthTokenCount;
  const fusedIntoFewerWords = words.length < truthTokenCount;
  const signals = {
    bestCoverage,
    overlappingWords: words.length,
    distinctLinesSpanned: distinctLines,
    wordsNotGroupedIntoAnyLine: unlinked,
    coveringPassRotated: rotatedPass,
    truthTokenCount,
    splitIntoMoreWordsThanTruth: splitIntoMoreWords,
    fusedIntoFewerWordsThanTruth: fusedIntoFewerWords,
  };
  const segmentationEvidence =
    distinctLines > 1 || unlinked > 0 || rotatedPass || splitIntoMoreWords || fusedIntoFewerWords;
  return {
    category: segmentationEvidence
      ? "ORIENTATION_OR_SEGMENTATION_FAILURE"
      : "REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION",
    signals,
    words,
  };
}

const RANK = {
  REGION_NOT_COVERED: 0,
  REGION_COVERED_NO_TEXT_RECOGNIZED: 1,
  ORIENTATION_OR_SEGMENTATION_FAILURE: 2,
  REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION: 3,
  UNATTRIBUTED: 4,
};

const out = [];
for (const c of C) {
  const truthTokenCount = (c.fixtureBrand[0] ?? "").split(/\s+/).filter(Boolean).length;
  const perOcc = c.occurrences.map((o) => ({
    label: o.label,
    ...classifyOccurrence(o, truthTokenCount),
  }));
  // Best chance = the occurrence furthest down the precedence chain (most evidence).
  const best = perOcc.reduce((a, b) => (RANK[b.category] > RANK[a.category] ? b : a));
  out.push({
    caseId: c.caseId,
    population: c.population,
    strata: c.strata,
    fixtureBrand: c.fixtureBrand[0],
    machineSelectedBrand: c.machineSelectedBrand,
    machineState: c.machineState,
    executedPassCount: c.executedPassCount,
    occurrenceCount: c.occurrences.length,
    primaryCategory: best.category,
    classifiedOnOccurrence: best.label,
    signals: best.signals,
    overlappingWordSample: best.words
      .slice(0, 8)
      .map((w) => ({ text: w.text, confidence: w.confidence, lineIndex: w.lineIndex })),
    secondaryMechanisms: perOcc
      .filter((o) => o.label !== best.label)
      .map((o) => ({ occurrence: o.label, category: o.category, signals: o.signals })),
  });
}

const primary = out.filter((c) => c.population === "primary");
const control = out.filter((c) => c.population === "control");
const tally = (rows) =>
  rows.reduce((m, r) => ((m[r.primaryCategory] = (m[r.primaryCategory] ?? 0) + 1), m), {});

const summary = {
  coverageThreshold: 0.9,
  primaryCaseCount: primary.length,
  controlCaseCount: control.length,
  primaryCategoryCounts: tally(primary),
  controlCategoryCounts: tally(control),
  primaryCategorySum: Object.values(tally(primary)).reduce((a, b) => a + b, 0),
  coveredByPrimaryFullImagePass: primary.filter((c) => c.signals.bestCoverage >= 0.9).length,
  coveredByAnyRecoveryPass: primary.filter((c) => c.executedPassCount > 1).length,
  recoveryRan: primary.filter((c) => c.executedPassCount > 1).length,
  zeroOcrBoxesOverRegion: primary.filter((c) => (c.signals.overlappingWords ?? 0) === 0).length,
  overlappingButNoRecognizableBrandText: primary.filter(
    (c) =>
      (c.signals.overlappingWords ?? 0) > 0 &&
      norm(c.overlappingWordSample.map((w) => w.text).join("")) !== norm(c.fixtureBrand),
  ).length,
  showingOrientationOrSegmentationEvidence: primary.filter(
    (c) => c.primaryCategory === "ORIENTATION_OR_SEGMENTATION_FAILURE",
  ).length,
  cases: out,
};
writeFileSync(path.join(OUT, "classifications.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(
  "primary:",
  JSON.stringify(summary.primaryCategoryCounts),
  "sum =",
  summary.primaryCategorySum,
);
console.log("control:", JSON.stringify(summary.controlCategoryCounts));
for (const c of primary)
  console.log(
    "  " + c.caseId.padEnd(24),
    c.primaryCategory.padEnd(45),
    "words:" + (c.signals.overlappingWords ?? 0),
    "lines:" + (c.signals.distinctLinesSpanned ?? "-"),
    "unlinked:" + (c.signals.wordsNotGroupedIntoAnyLine ?? "-"),
  );
