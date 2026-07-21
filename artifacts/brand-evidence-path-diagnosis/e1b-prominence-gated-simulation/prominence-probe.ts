/**
 * READ-ONLY prominence diagnostic — NO TREATMENT ARM.
 *
 * Phase 1 killed E1b, so no brand-present treatment metric may be computed. This
 * probe therefore records ONLY the prominence-eligibility decision that the gate
 * would have made for each `too-many-words` line, plus the span counts it would
 * have generated. It never runs a treatment selection and never compares a
 * treated value to truth, so it produces no gain metric of any kind.
 *
 * The two constants are read out of the production source at runtime.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import { selectBrandObservation } from "@/pipeline/extractor/field-selection";
import { loadCaseImage, loadEvalManifest } from "@/fixtures/eval/eval-loader";
import { EVAL_ADAPTER } from "@/fixtures/eval/eval-harness";
import { normalizeKey } from "@/fixtures/eval/metrics";

const OUT = process.argv[2];
const MAX_SPAN_WORDS = 4;
const TRIGGER_REASON = "too-many-words";
const EVAL_PROCESSED_AT = "2026-07-12T00:00:00Z";

function productionProminenceConstants(): { ratio: number; bufferPx: number } {
  const src = readFileSync("src/pipeline/extractor/field-selection.ts", "utf8");
  const ratio = src.match(/BRAND_SCORE_PROMINENCE_FLOOR_RATIO\s*=\s*([\d.]+)/);
  const buffer = src.match(/BRAND_SCORE_PROMINENCE_BUFFER_PX\s*=\s*([\d.]+)/);
  if (!ratio || !buffer) throw new Error("prominence constants not found in production source");
  return { ratio: Number(ratio[1]), bufferPx: Number(buffer[1]) };
}
const { ratio: FLOOR_RATIO, bufferPx: BUFFER_PX } = productionProminenceConstants();

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

/** Spans a line WOULD yield. Counted only; never analysed or selected. */
function spanCount(wordCount: number): number {
  let n = 0;
  for (let s = 0; s < wordCount; s++)
    for (let e = s; e < Math.min(wordCount, s + MAX_SPAN_WORDS); e++)
      if (e - s + 1 !== wordCount) n += 1;
  return n;
}

/** Regression source lines observed under E1a, for labelling only. */
const E1A_REGRESSION_VALUES = new Set(
  (
    JSON.parse(
      readFileSync(
        "artifacts/brand-evidence-path-diagnosis/e1a-too-many-words-simulation/changed-cases.json",
        "utf8",
      ),
    ).regressions as { treatment: { value: string | null } }[]
  )
    .map((r) => normalizeKey(r.treatment.value ?? ""))
    .filter((v) => v.length > 0),
);

const PRODUCER =
  /\b(?:produced|bottled|made|vinted|cellared|grown|packed|blended|imported|distributed)\b/i;
const DESIGNATION =
  /\b(?:reserva|riserva|reserve|denominazione|origine|controllata|appellation|controlee|indicazione|geografica|protetta|doc|docg|igp|igt|aoc|ava|estate|grand|cru|classico|superiore)\b/i;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = loadEvalManifest();
  const lines: any[] = [];

  for (const [i, evalCase] of manifest.cases.entries()) {
    const { bytes, sha256 } = loadCaseImage(evalCase);
    const result = await extractLabelEvidenceDetailed({
      ...extractionInput(evalCase.caseId, sha256),
      imageBytes: bytes,
    });
    if (!result.ok) continue;
    const acceptable = evalCase.brand.acceptable.map(normalizeKey).filter((v) => v.length > 0);

    for (const pass of result.value.debug.passes.filter((p) => p.fieldEligibility.brand)) {
      const sel = selectBrandObservation([pass]);
      const cands = sel.brandDiagnostics?.candidates ?? [];
      const maxProminence = Math.max(0, ...cands.filter((c) => c.kept).map((c) => c.prominence));
      const floor = maxProminence * FLOOR_RATIO + BUFFER_PX;
      for (const line of sel.brandDiagnostics?.lines ?? []) {
        if (line.kept || line.reason !== TRIGGER_REASON) continue;
        const words = line.rawText.split(/\s+/).filter(Boolean);
        const hay = normalizeKey(line.rawText);
        lines.push({
          caseId: evalCase.caseId,
          brandPresent: evalCase.brand.present,
          passId: pass.passId,
          lineText: line.rawText,
          lineProminence: line.prominence,
          maxLabelProminence: maxProminence,
          ratio: maxProminence > 0 ? Number((line.prominence / maxProminence).toFixed(4)) : null,
          eligibilityFloor: Number(floor.toFixed(4)),
          eligible: line.prominence > floor,
          wholeLineRejectionReason: line.reason,
          wouldGenerateSpans: spanCount(words.length),
          // labels for the required distributions
          containsFixtureTruth: acceptable.some((a) => hay.includes(a)),
          containsE1aRegressionValue: [...E1A_REGRESSION_VALUES].some(
            (v) => v.length > 3 && hay.includes(v),
          ),
          producerOrBottlerProse: PRODUCER.test(line.rawText),
          designationOrAppellation: DESIGNATION.test(line.rawText),
        });
      }
    }
    if ((i + 1) % 25 === 0 || i + 1 === manifest.cases.length)
      process.stdout.write(`  ${i + 1}/${manifest.cases.length}\n`);
  }

  writeFileSync(
    path.join(OUT, "prominence-analysis.json"),
    JSON.stringify(
      {
        note:
          "Diagnostic only. No treatment selection was run over brand-present cases: Phase 1 " +
          "killed E1b, so no present-case gain metric exists or may be derived from this file. " +
          "No threshold may be chosen from these distributions.",
        constantsReadFromProduction: { FLOOR_RATIO, BUFFER_PX },
        lines,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`too-many-words lines examined: ${lines.length}`);
}

void main();
