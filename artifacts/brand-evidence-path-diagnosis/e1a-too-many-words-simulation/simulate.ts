/**
 * READ-ONLY E1a simulation.
 *
 * Treatment under test: for whole lines whose brand candidate was rejected
 * SPECIFICALLY for `too-many-words`, also offer every contiguous 1-4 word
 * sub-span to the existing brand path. Nothing else changes.
 *
 * How the treatment is simulated without editing production code
 * --------------------------------------------------------------
 * `selectBrandObservation(results)` analyses each reconstructed line of each
 * RegionOcrResult with the real filters, classifier, scorer, ranker and
 * authority gate. A synthetic RegionOcrResult whose `words` are exactly one
 * sub-span therefore causes production to analyse that sub-span through the
 * identical code path. The treatment run is
 *
 *     selectBrandObservation([...realPasses, ...oneResultPerSubSpan])
 *
 * so every production rule applies unmodified. Divergences from a real
 * implementation are recorded in limitations.md.
 *
 * Truth is read only AFTER both selections exist, for evaluation.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import { selectBrandObservation } from "@/pipeline/extractor/field-selection";
import { loadCaseImage, loadEvalManifest } from "@/fixtures/eval/eval-loader";
import { EVAL_ADAPTER } from "@/fixtures/eval/eval-harness";
import { brandExactMatch, brandNormalizedMatch, normalizeKey } from "@/fixtures/eval/metrics";
import type { OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import type { FieldSelection } from "@/pipeline/extractor/field-selection";

const OUT = process.argv[2];

/**
 * Mirrors the harness's private `extractionInput` exactly (eval-harness.ts:85).
 * Copied rather than exported so no tracked file is modified for this study.
 */
const EVAL_PROCESSED_AT = "2026-07-12T00:00:00Z";
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
/** The treatment's only trigger. No other rejection reason opens sub-spans. */
const TRIGGER_REASON = "too-many-words";
/** Production's own brand-length cap; the sub-span width is not a new constant. */
const MAX_SPAN_WORDS = 4;

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

/** Every contiguous 1..MAX_SPAN_WORDS sub-span, excluding the whole line. */
function subSpans(line: OcrWord[]): OcrWord[][] {
  const out: OcrWord[][] = [];
  for (let start = 0; start < line.length; start++) {
    for (let end = start; end < Math.min(line.length, start + MAX_SPAN_WORDS); end++) {
      const span = line.slice(start, end + 1);
      if (span.length === line.length) continue;
      out.push(span);
    }
  }
  return out;
}

/** A synthetic single-line pass carrying one sub-span, inheriting pass identity. */
function spanResult(source: RegionOcrResult, span: OcrWord[], index: number): RegionOcrResult {
  return {
    ...source,
    passId: `${source.passId}#e1a-span-${index}`,
    words: span,
    rawWordCount: span.length,
    discardedWordCount: 0,
  };
}

const observed = (s: FieldSelection) => s.observation;

/** Extractor's own rule: primary-only unless the primary was NOT_OBSERVED. */
function chooseBrand(primary: FieldSelection, all: FieldSelection): FieldSelection {
  return primary.observation.state === "OBSERVED" ? primary : all;
}

function summarize(sel: FieldSelection, acceptable: string[]) {
  const o = observed(sel);
  const ranked = [o.value, ...o.alternates.map((a) => a.value)].filter(
    (v): v is string => typeof v === "string",
  );
  const rank = ranked.findIndex((v) => brandNormalizedMatch(v, acceptable));
  return {
    value: o.value,
    state: o.state,
    ocrEvidenceScore: Number(o.ocrEvidenceScore.toFixed(4)),
    alternates: o.alternates.slice(0, 4).map((a) => a.value),
    exactMatch: brandExactMatch(o.value, acceptable),
    normalizedMatch: brandNormalizedMatch(o.value, acceptable),
    truthRank: rank === -1 ? null : rank + 1,
    truthInTop3: rank !== -1 && rank < 3,
    candidateCount: sel.brandDiagnostics?.candidates.length ?? 0,
    keptCandidateCount: sel.brandDiagnostics?.candidates.filter((c) => c.kept).length ?? 0,
    truthAmongKept:
      sel.brandDiagnostics?.candidates.some(
        (c) => c.kept && brandNormalizedMatch(c.cleanedValue, acceptable),
      ) ?? false,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = loadEvalManifest();
  const rows: any[] = [];
  const filterCounts: Record<string, number> = {};
  let generatedTotal = 0;

  for (const [i, evalCase] of manifest.cases.entries()) {
    const { bytes, sha256 } = loadCaseImage(evalCase);
    const result = await extractLabelEvidenceDetailed({
      ...extractionInput(evalCase.caseId, sha256),
      imageBytes: bytes,
    });
    if (!result.ok) {
      rows.push({ caseId: evalCase.caseId, extractionError: result.error.code });
      continue;
    }
    const passes = result.value.debug.passes;
    const brandPasses = passes.filter((p) => p.fieldEligibility.brand);

    // BASELINE — recomputed from the same passes with unmodified production code.
    const basePrimary = selectBrandObservation([passes[0]]);
    const baseAll = selectBrandObservation(passes);
    const baseline = chooseBrand(basePrimary, baseAll);

    // TREATMENT — add sub-spans of lines rejected exactly for `too-many-words`.
    const spanResults: RegionOcrResult[] = [];
    let spanIndex = 0;
    let triggeredLines = 0;
    for (const pass of brandPasses) {
      const sel = selectBrandObservation([pass]);
      const rejected = (sel.brandDiagnostics?.lines ?? []).filter(
        (l) => !l.kept && l.reason === TRIGGER_REASON,
      );
      for (const line of rejected) {
        const words = wordsForLineText(pass.words, line.rawText);
        if (!words) continue;
        triggeredLines += 1;
        for (const span of subSpans(words)) {
          spanResults.push(spanResult(pass, span, spanIndex++));
        }
      }
    }
    generatedTotal += spanResults.length;

    const treatPrimary = selectBrandObservation([
      passes[0],
      ...spanResults.filter((s) => s.passId.startsWith(passes[0].passId)),
    ]);
    const treatAll = selectBrandObservation([...passes, ...spanResults]);
    const treatment = chooseBrand(treatPrimary, treatAll);

    // Which filter rejected each generated sub-span (production's own reasons).
    const baseIds = new Set((baseline.brandDiagnostics?.candidates ?? []).map((c) => c.rawText));
    for (const c of treatment.brandDiagnostics?.candidates ?? []) {
      if (!c.candidateProvenance.passId.includes("#e1a-span-")) continue;
      const k = c.kept ? `KEPT:${c.filterReason}` : c.filterReason;
      filterCounts[k] = (filterCounts[k] ?? 0) + 1;
    }
    void baseIds;

    // --- truth is consulted only from here on ---
    const truth = evalCase.brand;
    const acceptable = truth.acceptable;
    const present = truth.present;
    const knownAmbiguous = truth.knownAmbiguous;

    rows.push({
      caseId: evalCase.caseId,
      present,
      knownAmbiguous,
      acceptable,
      triggeredLines,
      generatedSpans: spanResults.length,
      baseline: summarize(baseline, acceptable),
      treatment: summarize(treatment, acceptable),
    });

    if ((i + 1) % 25 === 0 || i + 1 === manifest.cases.length)
      process.stdout.write(`  ${i + 1}/${manifest.cases.length}\n`);
  }

  writeFileSync(path.join(OUT, "cases.json"), JSON.stringify(rows, null, 2) + "\n");
  writeFileSync(
    path.join(OUT, "filter-results.json"),
    JSON.stringify({ generatedSubSpans: generatedTotal, byFilterReason: filterCounts }, null, 2) +
      "\n",
  );
  console.log(`generated sub-spans: ${generatedTotal}`);
}

void main();
