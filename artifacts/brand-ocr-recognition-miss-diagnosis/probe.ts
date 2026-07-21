/**
 * E3 — READ-ONLY measurement of the OCR_RECOGNITION_MISS brand cases.
 *
 * Runs the real extractor over the governed corpus on unmodified production
 * code, reproduces the brand failure-class attribution from the preserved
 * evidence-path diagnosis, isolates the OCR_RECOGNITION_MISS cases, and then —
 * and only then — consults truth to classify each into exactly one of
 * BOUNDED_NEAR_MISS / PARTIAL_RECOGNITION / TRUE_NON_RECOGNITION.
 *
 * Truth never steers OCR, region choice, or span construction: spans come from
 * the reconstructed lines the pipeline already produced. OCR is not re-run and
 * no cross-line span is built. Nothing in production is modified.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import { selectBrandObservation } from "@/pipeline/extractor/field-selection";
import { loadCaseImage, loadEvalManifest } from "@/fixtures/eval/eval-loader";
import { EVAL_ADAPTER } from "@/fixtures/eval/eval-harness";
import { brandExactMatch, brandNormalizedMatch, normalizeKey } from "@/fixtures/eval/metrics";
import type { OcrWord } from "@/pipeline/extractor/extractor.types";
import type { FieldSelection } from "@/pipeline/extractor/field-selection";

const OUT = process.argv[2];
const EVAL_PROCESSED_AT = "2026-07-12T00:00:00Z";

/** Mirrors the harness's private `extractionInput` (eval-harness.ts:85). */
function extractionInput(caseId: string, sha256: string) {
  return {
    imageBytes: new Uint8Array(),
    artifactRef: caseId,
    derivativeSha256: sha256,
    processedAt: EVAL_PROCESSED_AT,
    extractionAdapterId: EVAL_ADAPTER.id,
    extractionAdapterVersion: EVAL_ADAPTER.version,
    ocrEngine: {
      kind: "ocr" as const,
      engineId: "tesseract.js",
      engineVersion: "7.0.0",
      modelId: "eng",
    },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  };
}

/** Generic wording that is not distinctive brand content (pre-registered). */
const GENERIC_TOKENS = new Set([
  "wine",
  "red",
  "white",
  "estate",
  "winery",
  "vineyard",
  "vineyards",
  "cellars",
]);

/** Optimal string alignment distance; identical to Damerau–Levenshtein at d<=1. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** Name the single operation separating two strings at distance 1. */
function describeSingleEdit(expected: string, got: string): string | null {
  if (editDistance(expected, got) !== 1) return null;
  if (got.length === expected.length + 1) {
    for (let i = 0; i < got.length; i++) {
      if (got.slice(0, i) + got.slice(i + 1) === expected)
        return `insertion of '${got[i]}' at index ${i}`;
    }
  }
  if (got.length === expected.length - 1) {
    for (let i = 0; i < expected.length; i++) {
      if (expected.slice(0, i) + expected.slice(i + 1) === got)
        return `deletion of '${expected[i]}' at index ${i}`;
    }
  }
  if (got.length === expected.length) {
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] !== got[i]) {
        const swapped =
          i + 1 < expected.length && expected[i] === got[i + 1] && expected[i + 1] === got[i];
        return swapped
          ? `transposition of '${expected[i]}${expected[i + 1]}' at index ${i}`
          : `substitution '${expected[i]}' -> '${got[i]}' at index ${i}`;
      }
    }
  }
  return "single edit (unclassified shape)";
}

/** Longest common contiguous substring. */
function longestCommonSubstring(a: string, b: string): string {
  let best = "";
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] !== b[j - 1]) continue;
      dp[i][j] = dp[i - 1][j - 1] + 1;
      if (dp[i][j] > best.length) best = a.slice(i - dp[i][j], i);
    }
  }
  return best;
}

/** Locate the contiguous word run whose joined text equals a reported line. */
function wordsForLineText(words: OcrWord[], rawText: string): OcrWord[] | null {
  for (let start = 0; start < words.length; start++) {
    let joined = "";
    for (let end = start; end < words.length; end++) {
      joined = end === start ? words[end].text : `${joined} ${words[end].text}`;
      if (joined === rawText) return words.slice(start, end + 1);
      if (joined.length > rawText.length) break;
    }
  }
  return null;
}

/** Reproduces the preserved diagnosis's first-stage-of-loss attribution. */
function brandFailureClass(
  present: boolean,
  acceptable: string[],
  value: string | null,
  state: string,
  ocrHasTruth: boolean,
  lineHasTruth: boolean,
  keptCandidateHasTruth: boolean,
  truthRank: number | null,
): string {
  if (!present) return value !== null ? "WRONG_ACCEPTED_CANDIDATE" : "CORRECT";
  const matched = brandExactMatch(value, acceptable) || brandNormalizedMatch(value, acceptable);
  if (matched)
    return state === "OBSERVED" ? "CORRECT" : "CORRECT_TOP_CANDIDATE_AUTHORITY_ABSTENTION";
  if (!ocrHasTruth) return "OCR_RECOGNITION_MISS";
  if (!lineHasTruth) return "RECONSTRUCTION_MISS";
  if (!keptCandidateHasTruth) return "CANDIDATE_GENERATION_MISS";
  if (truthRank === null) return "RANKING_MISS";
  return state === "OBSERVED" ? "WRONG_ACCEPTED_CANDIDATE" : "WRONG_SELECTED_CANDIDATE";
}

const normalizedIncludes = (text: string, acceptable: string[]) => {
  const hay = normalizeKey(text);
  return acceptable.some((a) => {
    const n = normalizeKey(a);
    return n.length > 0 && hay.includes(n);
  });
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = loadEvalManifest();
  const classified: any[] = [];
  let examined = 0;

  for (const [i, evalCase] of manifest.cases.entries()) {
    const { bytes, sha256 } = loadCaseImage(evalCase);
    const result = await extractLabelEvidenceDetailed({
      ...extractionInput(evalCase.caseId, sha256),
      imageBytes: bytes,
    });
    if (!result.ok) continue;
    examined += 1;
    const passes = result.value.debug.passes;
    const brandPasses = passes.filter((p) => p.fieldEligibility.brand);

    const primary: FieldSelection = selectBrandObservation([passes[0]]);
    const all: FieldSelection = selectBrandObservation(passes);
    const sel = primary.observation.state === "OBSERVED" ? primary : all;
    const obs = sel.observation;

    const acceptable = evalCase.brand.acceptable;
    const ocrText = brandPasses.flatMap((p) => p.words.map((w) => w.text)).join(" ");
    const lineTexts = (sel.brandDiagnostics?.lines ?? []).map((l) => l.rawText);
    const ranked = [obs.value, ...obs.alternates.map((a) => a.value)].filter(
      (v): v is string => typeof v === "string",
    );
    const rankIdx = ranked.findIndex((v) => brandNormalizedMatch(v, acceptable));

    const cls = brandFailureClass(
      evalCase.brand.present,
      acceptable,
      obs.value,
      obs.state,
      normalizedIncludes(ocrText, acceptable),
      lineTexts.some((t) => normalizedIncludes(t, acceptable)),
      (sel.brandDiagnostics?.candidates ?? []).some(
        (c) => c.kept && brandNormalizedMatch(c.cleanedValue, acceptable),
      ),
      rankIdx === -1 ? null : rankIdx + 1,
    );
    if (cls !== "OCR_RECOGNITION_MISS") continue;

    // ---------------- truth is consulted only from here on ----------------
    const truth = acceptable[0] ?? "";
    const normTruth = normalizeKey(truth);
    const truthTokenCount = truth.split(/\s+/).filter(Boolean).length;
    const minTok = Math.max(1, truthTokenCount - 1);
    const maxTok = truthTokenCount + 1;

    // Candidate spans: contiguous word runs of ALREADY reconstructed lines only.
    type Span = {
      text: string;
      norm: string;
      tokens: number;
      distance: number;
      words: OcrWord[];
      passId: string;
      lineText: string;
    };
    const spans: Span[] = [];
    /**
     * Sensitivity diagnostic ONLY — never used for classification. The
     * pre-registered span window is anchored on the EXPECTED token count, so
     * when OCR merges or drops word boundaries the true best evidence can fall
     * outside it. This records the best distance with the window widened to
     * 1..6 tokens so the rule's sensitivity is visible rather than hidden.
     */
    const unconstrained: Span[] = [];
    for (const pass of brandPasses) {
      const passSel = selectBrandObservation([pass]);
      for (const line of passSel.brandDiagnostics?.lines ?? []) {
        const words = wordsForLineText(pass.words, line.rawText);
        if (!words) continue;
        for (let s = 0; s < words.length; s++) {
          for (let e = s; e < words.length; e++) {
            const n = e - s + 1;
            if (n > 6) continue;
            const run = words.slice(s, e + 1);
            const text = run.map((w) => w.text).join(" ");
            const norm = normalizeKey(text);
            if (norm.length === 0) continue;
            const entry = {
              text,
              norm,
              tokens: n,
              distance: editDistance(normTruth, norm),
              words: run,
              passId: pass.passId,
              lineText: line.rawText,
            };
            unconstrained.push(entry);
            if (n < minTok || n > maxTok) continue;
            spans.push({
              text,
              norm,
              tokens: n,
              distance: editDistance(normTruth, norm),
              words: run,
              passId: pass.passId,
              lineText: line.rawText,
            });
          }
        }
      }
    }
    spans.sort((a, b) => a.distance - b.distance || a.norm.length - b.norm.length);
    unconstrained.sort((a, b) => a.distance - b.distance || a.norm.length - b.norm.length);
    const best = spans[0] ?? null;
    const bestUnconstrained = unconstrained[0] ?? null;
    const nearest = best ? best.distance : null;

    // Rule A: a complete substantive truth token of length >= 4 present in OCR.
    const normOcr = normalizeKey(ocrText);
    const truthTokens = truth
      .split(/\s+/)
      .map((t) => normalizeKey(t))
      .filter((t) => t.length > 0);
    const substantive = truthTokens.filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t));
    const genericOnly = truthTokens.filter((t) => t.length >= 4 && GENERIC_TOKENS.has(t));
    const matchedSubstantive = substantive.filter((t) => normOcr.includes(t));
    const matchedGeneric = genericOnly.filter((t) => normOcr.includes(t));

    // Rule B: longest shared substring coverage of the normalized truth.
    const lcs = longestCommonSubstring(normTruth, normOcr);
    const coverage = normTruth.length > 0 ? lcs.length / normTruth.length : 0;

    let category: string;
    let categoryRule: string;
    if (normTruth.length >= 4 && nearest === 1) {
      category = "BOUNDED_NEAR_MISS";
      categoryRule = "damerau-levenshtein distance exactly 1 on a qualifying span";
    } else if (matchedSubstantive.length > 0) {
      category = "PARTIAL_RECOGNITION";
      categoryRule = "A: complete substantive truth token (len>=4) present in OCR";
    } else if (lcs.length >= 4 && coverage >= 0.5) {
      category = "PARTIAL_RECOGNITION";
      categoryRule = "B: longest shared substring >=4 chars and >=50% of normalized truth";
    } else {
      category = "TRUE_NON_RECOGNITION";
      categoryRule = "neither bounded near miss nor partial recognition";
    }

    // Partial-recognition sub-shape.
    let partialShape: string | null = null;
    if (category === "PARTIAL_RECOGNITION") {
      if (matchedSubstantive.length > 1) partialShape = "multiple partial tokens";
      else if (matchedSubstantive.length === 1) partialShape = "complete distinctive token found";
      else if (normTruth.startsWith(lcs)) partialShape = "prefix fragment";
      else if (normTruth.endsWith(lcs)) partialShape = "suffix fragment";
      else partialShape = "internal fragment";
      if (
        partialShape !== "complete distinctive token found" &&
        partialShape !== "multiple partial tokens" &&
        coverage >= 0.5 &&
        coverage < 1
      ) {
        partialShape = `${partialShape} (apparent truncation)`;
      }
    }

    // Borderline flags — genuine judgment calls only.
    const borderline: string[] = [];
    if (nearest === 2) borderline.push("nearest span is distance 2 — just outside the bound");
    if (category === "PARTIAL_RECOGNITION" && categoryRule.startsWith("B") && coverage < 0.6)
      borderline.push(`coverage ${(coverage * 100).toFixed(0)}% is close to the 50% floor`);
    if (category === "PARTIAL_RECOGNITION" && categoryRule.startsWith("B") && lcs.length === 4)
      borderline.push("longest shared substring is exactly the 4-character floor");
    if (category === "TRUE_NON_RECOGNITION" && matchedGeneric.length > 0)
      borderline.push(
        `only generic truth token(s) present in OCR: ${matchedGeneric.join(", ")} — excluded by the pre-registered rule`,
      );
    if (normTruth.length < 4)
      borderline.push("normalized truth is shorter than the 4-character near-miss floor");

    // Failure shape, from the evidence rather than from truth.
    const shape =
      category === "TRUE_NON_RECOGNITION" && lcs.length <= 2
        ? "complete omission"
        : category === "BOUNDED_NEAR_MISS"
          ? "recognition"
          : coverage >= 0.5 && coverage < 1
            ? "truncation"
            : matchedSubstantive.length > 0 && (nearest ?? 99) > 1
              ? "segmentation"
              : "recognition";

    const relevantWords = best?.words ?? [];
    const confs = relevantWords.map((w) => w.rawConfidence);
    const lineHits = lineTexts.filter(
      (t) => longestCommonSubstring(normalizeKey(t), normTruth).length >= 4,
    );

    classified.push({
      caseId: evalCase.caseId,
      strata: evalCase.strata,
      truth: acceptable,
      normalizedTruth: normTruth,
      truthTokenCount,
      machineSelectedBrand: obs.value,
      machineState: obs.state,
      relevantOcrLines: lineHits.slice(0, 6),
      allOcrLineCount: lineTexts.length,
      bestSpan: best?.text ?? null,
      bestSpanNormalized: best?.norm ?? null,
      bestSpanTokens: best?.tokens ?? null,
      editDistance: nearest,
      editOperation: best && nearest === 1 ? describeSingleEdit(normTruth, best.norm) : null,
      longestSharedSubstring: lcs,
      sharedSubstringCoverage: Number(coverage.toFixed(4)),
      matchingSubstantiveTruthTokens: matchedSubstantive,
      genericTruthTokensPresent: matchedGeneric,
      primaryCategory: category,
      categoryRule,
      partialShape,
      classificationConfidence: borderline.length === 0 ? "high" : "medium",
      borderlineReasons: borderline,
      ocrConfidenceOfBestSpan: confs.length
        ? {
            min: Math.min(...confs),
            mean: Math.round(confs.reduce((a, b) => a + b, 0) / confs.length),
          }
        : null,
      // Geometry in the ORIGINAL image frame when the pass mapped it back;
      // the raw bbox is in the preprocessed frame and is not comparable.
      bestSpanGeometry: (() => {
        const og = relevantWords.map((w) => w.originalGeometry).filter((g) => g !== undefined);
        if (og.length === relevantWords.length && og.length > 0) {
          return {
            frame: "original-image",
            x: Math.min(...og.map((g) => g!.x)),
            y: Math.min(...og.map((g) => g!.y)),
            width: Math.max(...og.map((g) => g!.x + g!.width)) - Math.min(...og.map((g) => g!.x)),
            height: Math.max(...og.map((g) => g!.y + g!.height)) - Math.min(...og.map((g) => g!.y)),
            imageWidth: og[0]!.imageWidth,
            imageHeight: og[0]!.imageHeight,
          };
        }
        return relevantWords.length
          ? {
              frame: "preprocessed-pass",
              x0: Math.min(...relevantWords.map((w) => w.bbox.x0)),
              y0: Math.min(...relevantWords.map((w) => w.bbox.y0)),
              x1: Math.max(...relevantWords.map((w) => w.bbox.x1)),
              y1: Math.max(...relevantWords.map((w) => w.bbox.y1)),
            }
          : null;
      })(),
      sourcePassId: best?.passId ?? null,
      sourcePassKind: best ? (best.passId === passes[0].passId ? "primary" : "recovery") : null,
      truthOnSingleLine: lineHits.length === 1,
      truthVisuallySplitAcrossLines: lineHits.length > 1,
      failureShape: shape,
      spanCandidatesConsidered: spans.length,
      sensitivity: {
        note: "diagnostic only — not used for classification",
        unconstrainedBestSpan: bestUnconstrained?.text ?? null,
        unconstrainedBestSpanTokens: bestUnconstrained?.tokens ?? null,
        unconstrainedEditDistance: bestUnconstrained?.distance ?? null,
        windowExcludedACloserSpan:
          bestUnconstrained !== null && best !== null && bestUnconstrained.distance < best.distance,
      },
      notes: [] as string[],
    });

    if ((i + 1) % 25 === 0 || i + 1 === manifest.cases.length)
      process.stdout.write(`  ${i + 1}/${manifest.cases.length}\n`);
  }

  writeFileSync(path.join(OUT, "cases.json"), JSON.stringify(classified, null, 2) + "\n");
  console.log(`corpus examined: ${examined} | OCR_RECOGNITION_MISS cases: ${classified.length}`);
}

void main();
