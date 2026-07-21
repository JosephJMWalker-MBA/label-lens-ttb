/**
 * READ-ONLY E1b simulation — prominence-gated recovery spans.
 *
 * Treatment: a source line is considered only when (a) its whole-line brand
 * candidate was rejected specifically as `too-many-words`, and (b) the line
 * satisfies production's OWN prominence-eligibility expression from
 * `brandRanking`:
 *
 *     prominence > maxProminence * BRAND_SCORE_PROMINENCE_FLOOR_RATIO
 *                                + BRAND_SCORE_PROMINENCE_BUFFER_PX
 *
 * No new threshold or constant is introduced: both constants are READ OUT OF THE
 * PRODUCTION SOURCE at runtime, so they cannot drift from production and cannot
 * be tuned here.
 *
 * Every generated span goes through the unchanged production normalization,
 * filtering, classification, scoring, ranking and authority assignment via the
 * real `selectBrandObservation`. Truth is read only after both arms exist.
 *
 * Modes:  --absent-only  (Phase 1 safety screen)   |   default: full corpus
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import { selectBrandObservation } from "@/pipeline/extractor/field-selection";
import { loadCaseImage, loadEvalManifest } from "@/fixtures/eval/eval-loader";
import { EVAL_ADAPTER } from "@/fixtures/eval/eval-harness";
import { brandExactMatch, brandNormalizedMatch } from "@/fixtures/eval/metrics";
import type { OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import type { FieldSelection } from "@/pipeline/extractor/field-selection";

const OUT = process.argv[2];
const ABSENT_ONLY = process.argv.includes("--absent-only");

/** Read the two prominence constants directly out of production source. */
function productionProminenceConstants(): { ratio: number; bufferPx: number } {
  const src = readFileSync("src/pipeline/extractor/field-selection.ts", "utf8");
  const ratio = src.match(/BRAND_SCORE_PROMINENCE_FLOOR_RATIO\s*=\s*([\d.]+)/);
  const buffer = src.match(/BRAND_SCORE_PROMINENCE_BUFFER_PX\s*=\s*([\d.]+)/);
  if (!ratio || !buffer) throw new Error("prominence constants not found in production source");
  return { ratio: Number(ratio[1]), bufferPx: Number(buffer[1]) };
}
const { ratio: FLOOR_RATIO, bufferPx: BUFFER_PX } = productionProminenceConstants();

const TRIGGER_REASON = "too-many-words";
/** Production's own brand-length cap; not a new constant. */
const MAX_SPAN_WORDS = 4;
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

function spanResult(source: RegionOcrResult, span: OcrWord[], index: number): RegionOcrResult {
  return {
    ...source,
    passId: `${source.passId}#e1b-span-${index}`,
    words: span,
    rawWordCount: span.length,
    discardedWordCount: 0,
  };
}

function chooseBrand(primary: FieldSelection, all: FieldSelection): FieldSelection {
  return primary.observation.state === "OBSERVED" ? primary : all;
}

function summarize(sel: FieldSelection, acceptable: string[]) {
  const o = sel.observation;
  const ranked = [o.value, ...o.alternates.map((a) => a.value)].filter(
    (v): v is string => typeof v === "string",
  );
  const rank = ranked.findIndex((v) => brandNormalizedMatch(v, acceptable));
  return {
    value: o.value,
    state: o.state,
    alternates: o.alternates.slice(0, 6).map((a) => a.value),
    alternateCount: o.alternates.length,
    exactMatch: brandExactMatch(o.value, acceptable),
    normalizedMatch: brandNormalizedMatch(o.value, acceptable),
    truthRank: rank === -1 ? null : rank + 1,
    truthInTop3: rank !== -1 && rank < 3,
    candidateCount: sel.brandDiagnostics?.candidates.length ?? 0,
    truthAmongKept:
      sel.brandDiagnostics?.candidates.some(
        (c) => c.kept && brandNormalizedMatch(c.cleanedValue, acceptable),
      ) ?? false,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = loadEvalManifest();
  const cases = ABSENT_ONLY ? manifest.cases.filter((c) => !c.brand.present) : manifest.cases;
  const rows: any[] = [];
  const prominenceRows: any[] = [];
  const filterCounts: Record<string, number> = {};

  for (const [i, evalCase] of cases.entries()) {
    const { bytes, sha256 } = loadCaseImage(evalCase);
    const result = await extractLabelEvidenceDetailed({
      ...extractionInput(evalCase.caseId, sha256),
      imageBytes: bytes,
    });
    if (!result.ok) continue;
    const passes = result.value.debug.passes;
    const brandPasses = passes.filter((p) => p.fieldEligibility.brand);

    const basePrimary = selectBrandObservation([passes[0]]);
    const baseAll = selectBrandObservation(passes);
    const baseline = chooseBrand(basePrimary, baseAll);

    const spanResults: RegionOcrResult[] = [];
    let spanIndex = 0;
    for (const pass of brandPasses) {
      const sel = selectBrandObservation([pass]);
      const cands = sel.brandDiagnostics?.candidates ?? [];
      // Production computes maxProminence over the candidates it ranks.
      const maxProminence = Math.max(0, ...cands.filter((c) => c.kept).map((c) => c.prominence));
      const floor = maxProminence * FLOOR_RATIO + BUFFER_PX;
      for (const line of sel.brandDiagnostics?.lines ?? []) {
        if (line.kept || line.reason !== TRIGGER_REASON) continue;
        const eligible = line.prominence > floor;
        const words = wordsForLineText(pass.words, line.rawText);
        const spans = eligible && words ? subSpans(words) : [];
        for (const span of spans) spanResults.push(spanResult(pass, span, spanIndex++));
        prominenceRows.push({
          caseId: evalCase.caseId,
          brandPresent: evalCase.brand.present,
          passId: pass.passId,
          lineText: line.rawText,
          lineProminence: line.prominence,
          maxLabelProminence: maxProminence,
          ratio: maxProminence > 0 ? Number((line.prominence / maxProminence).toFixed(4)) : null,
          eligibilityFloor: Number(floor.toFixed(4)),
          eligible,
          wholeLineRejectionReason: line.reason,
          wordsResolved: words !== null,
          generatedSpanCount: spans.length,
        });
      }
    }

    const treatPrimary = selectBrandObservation([
      passes[0],
      ...spanResults.filter((s) => s.passId.startsWith(passes[0].passId)),
    ]);
    const treatAll = selectBrandObservation([...passes, ...spanResults]);
    const treatment = chooseBrand(treatPrimary, treatAll);

    const generatedCandidates: any[] = [];
    for (const c of treatment.brandDiagnostics?.candidates ?? []) {
      if (!c.candidateProvenance.passId.includes("#e1b-span-")) continue;
      const k = c.kept ? `KEPT:${c.filterReason}` : c.filterReason;
      filterCounts[k] = (filterCounts[k] ?? 0) + 1;
      generatedCandidates.push({
        cleanedValue: c.cleanedValue,
        rawText: c.rawText,
        kept: c.kept,
        filterReason: c.filterReason,
        decision: c.decision ?? null,
        prominence: c.prominence,
      });
    }

    // --- truth consulted only from here on ---
    const acceptable = evalCase.brand.acceptable;
    rows.push({
      caseId: evalCase.caseId,
      present: evalCase.brand.present,
      knownAmbiguous: evalCase.brand.knownAmbiguous,
      acceptable,
      eligibleLines: prominenceRows.filter((p) => p.caseId === evalCase.caseId && p.eligible)
        .length,
      rejectedLines: prominenceRows.filter((p) => p.caseId === evalCase.caseId && !p.eligible)
        .length,
      generatedSpans: spanResults.length,
      generatedCandidates,
      baseline: summarize(baseline, acceptable),
      treatment: summarize(treatment, acceptable),
    });
    if ((i + 1) % 25 === 0 || i + 1 === cases.length)
      process.stdout.write(`  ${i + 1}/${cases.length}\n`);
  }

  const suffix = ABSENT_ONLY ? "-absent" : "";
  writeFileSync(path.join(OUT, `cases${suffix}.json`), JSON.stringify(rows, null, 2) + "\n");
  writeFileSync(
    path.join(OUT, `prominence-analysis${suffix}.json`),
    JSON.stringify(
      { constantsReadFromProduction: { FLOOR_RATIO, BUFFER_PX }, lines: prominenceRows },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    path.join(OUT, `filter-results${suffix}.json`),
    JSON.stringify({ byFilterReason: filterCounts }, null, 2) + "\n",
  );
  console.log(
    `constants from production: ratio=${FLOOR_RATIO} buffer=${BUFFER_PX}px | cases=${rows.length} | spans=${rows.reduce((s, r) => s + r.generatedSpans, 0)}`,
  );
}

void main();
