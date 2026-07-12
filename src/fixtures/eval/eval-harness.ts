import type {
  AnalyzerFieldObservation,
  AnalyzerOcrEngine,
} from "@/pipeline/analyzer/analyzer.types";
import { extractLabelEvidence } from "@/pipeline/extractor/extractor";
import type { ExtractionInput, OcrWord } from "@/pipeline/extractor/extractor.types";
import { verifyAndDecode } from "@/pipeline/extractor/image-integrity";
import { createLocalOcrEngine } from "@/pipeline/extractor/ocr-engine";
import { runRegionOcr } from "@/pipeline/extractor/regions";

import { loadCaseImage } from "./eval-loader";
import type { EvalCase } from "./eval-manifest.types";
import {
  alcoholDetected,
  alcoholParsedAccurate,
  brandExactMatch,
  brandInTopK,
  brandNormalizedMatch,
  classifyAlcohol,
  classifyBrand,
  normalizedIncludes,
  parseObservedPercent,
  type AlcoholDiagnostics,
  type ObservedField,
} from "./metrics";
import type { CaseDiagnostics, CaseReport, DiagnosticWord } from "./eval-report.types";

/**
 * The evaluation harness runs the REAL extractor (`extractLabelEvidence`) on
 * each case for the authoritative measurement, then makes one additional bounded
 * region-OCR pass to capture inspectable diagnostics (region names, sampled
 * words + geometry, reconstructed brand lines, and alcohol token signals). It
 * emits no image bytes, secrets, absolute paths, or unbounded OCR logs.
 */

export const EVAL_ADAPTER = { id: "local-two-field-extractor", version: "1.0.0" } as const;
const EVAL_OCR_ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};
/** Fixed timestamp: extraction is deterministic in its inputs, never wall-clock. */
const EVAL_PROCESSED_AT = "2026-07-12T00:00:00Z";

/** Bounds on retained diagnostics so a report can never grow unbounded. */
const MAX_SAMPLE_WORDS_PER_REGION = 25;
const MAX_BRAND_LINES = 12;
const MAX_TEXT_LEN = 120;
/** Vertical proximity (processed space) grouping words into a line; matches selector. */
const LINE_Y_TOLERANCE = 20;

function extractionInput(evalCase: EvalCase, sha256: string): ExtractionInput {
  return {
    imageBytes: new Uint8Array(), // replaced per call; see runCase
    artifactRef: evalCase.caseId,
    derivativeSha256: sha256,
    processedAt: EVAL_PROCESSED_AT,
    extractionAdapterId: EVAL_ADAPTER.id,
    extractionAdapterVersion: EVAL_ADAPTER.version,
    ocrEngine: EVAL_OCR_ENGINE,
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  };
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_LEN ? `${text.slice(0, MAX_TEXT_LEN)}…` : text;
}

/** Group a region's words into reading lines by vertical proximity. */
function groupLines(words: OcrWord[]): OcrWord[][] {
  const ordered = [...words].sort(
    (a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2,
  );
  const out: OcrWord[][] = [];
  for (const w of ordered) {
    const wy = (w.bbox.y0 + w.bbox.y1) / 2;
    const line = out.find((l) => {
      const ly = (l[0].bbox.y0 + l[0].bbox.y1) / 2;
      return Math.abs(ly - wy) <= LINE_Y_TOLERANCE;
    });
    if (line) line.push(w);
    else out.push([w]);
  }
  return out.map((l) => [...l].sort((a, b) => a.bbox.x0 - b.bbox.x0));
}

/** Digit-boundary forms of an acceptable percent (dot, comma, and bare integer). */
function numberForms(percents: number[]): string[] {
  const forms = new Set<string>();
  for (const p of percents) {
    forms.add(String(p));
    forms.add(String(p).replace(".", ","));
    forms.add(String(Math.trunc(p)));
  }
  return [...forms];
}

/** A token carries the alcohol number as a bounded numeric run (not a substring of a year). */
function tokenHasNumber(text: string, forms: string[]): boolean {
  const compact = text.replace(/\s+/g, "");
  return forms.some((f) => {
    const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^0-9])${escaped}([^0-9]|$)`).test(compact);
  });
}

function diagnosticsFor(
  regions: { regionName: string; words: OcrWord[] }[],
  numberFormList: string[],
  acceptableBrands: string[],
): CaseDiagnostics {
  const sampleRegions = regions.map((r) => ({
    regionName: r.regionName,
    wordCount: r.words.length,
    sampleWords: r.words.slice(0, MAX_SAMPLE_WORDS_PER_REGION).map((w): DiagnosticWord => ({
      text: truncate(w.text),
      confidence: w.rawConfidence,
      bbox: w.bbox,
    })),
  }));

  const brandRegion = regions.find((r) => r.regionName === "full-image");
  const brandRegionText = brandRegion ? brandRegion.words.map((w) => w.text).join(" ") : "";
  const brandLines = brandRegion
    ? groupLines(brandRegion.words)
        .map((l) => truncate(l.map((w) => w.text).join(" ")))
        .filter((t) => t.trim().length > 0)
        .slice(0, MAX_BRAND_LINES)
    : [];

  let numberInOcr = false;
  let percentInOcr = false;
  let numberAndPercentSameLine = false;
  for (const r of regions) {
    for (const w of r.words) {
      if (tokenHasNumber(w.text, numberFormList)) numberInOcr = true;
      if (w.text.includes("%")) percentInOcr = true;
    }
    for (const line of groupLines(r.words)) {
      const hasNumber = line.some((w) => tokenHasNumber(w.text, numberFormList));
      const hasPercent = line.some((w) => w.text.includes("%"));
      if (hasNumber && hasPercent) numberAndPercentSameLine = true;
    }
  }

  return {
    regions: sampleRegions,
    brandLineTexts: brandLines,
    // Did OCR read an acceptable brand anywhere in the brand region (even merged
    // into a longer, later-filtered line)? Substring containment on the full,
    // uncapped region text distinguishes a filtering loss from an OCR miss.
    brandOcrContainsAcceptable: normalizedIncludes(brandRegionText, acceptableBrands),
    alcoholNumberInOcr: numberInOcr,
    alcoholPercentInOcr: percentInOcr,
    alcoholNumberAndPercentSameLine: numberAndPercentSameLine,
  };
}

function toObserved(field: AnalyzerFieldObservation): ObservedField {
  return {
    state: field.state,
    value: field.value,
    confidence: field.confidence,
    alternates: field.alternates.map((a) => ({ value: a.value, confidence: a.confidence })),
  };
}

/** Run one case end-to-end: real extraction + bounded diagnostics + verdicts. */
export async function runCase(evalCase: EvalCase): Promise<CaseReport> {
  const { bytes, sha256 } = loadCaseImage(evalCase);
  const input: ExtractionInput = { ...extractionInput(evalCase, sha256), imageBytes: bytes };

  const start = performance.now();
  const result = await extractLabelEvidence(input);
  const latencyMs = performance.now() - start;

  // Diagnostics pass (same deterministic primitives the extractor uses).
  const numberFormList = numberForms(evalCase.alcohol.acceptablePercents);
  let diagnostics: CaseDiagnostics = {
    regions: [],
    brandLineTexts: [],
    brandOcrContainsAcceptable: false,
    alcoholNumberInOcr: false,
    alcoholPercentInOcr: false,
    alcoholNumberAndPercentSameLine: false,
  };
  const decoded = await verifyAndDecode(bytes, sha256);
  if (decoded.ok) {
    const engine = await createLocalOcrEngine();
    try {
      const regions = await runRegionOcr(bytes, decoded.value.width, decoded.value.height, engine);
      diagnostics = diagnosticsFor(regions, numberFormList, evalCase.brand.acceptable);
    } finally {
      try {
        await engine.terminate();
      } catch {
        // discard: the diagnostics worker is being torn down regardless
      }
    }
  }

  const alcoholDiag: AlcoholDiagnostics = {
    numberInOcr: diagnostics.alcoholNumberInOcr,
    percentInOcr: diagnostics.alcoholPercentInOcr,
    numberAndPercentSameLine: diagnostics.alcoholNumberAndPercentSameLine,
  };

  if (!result.ok) {
    // A typed extraction error: NOT_OBSERVED-equivalent for both fields.
    const empty: ObservedField = {
      state: "NOT_OBSERVED",
      value: null,
      confidence: 0,
      alternates: [],
    };
    return {
      caseId: evalCase.caseId,
      fixtureDir: evalCase.fixtureDir,
      strata: evalCase.strata,
      extractionError: result.error.code,
      brand: {
        ...emptyFieldReport(empty),
        acceptable: evalCase.brand.acceptable,
        knownAmbiguous: evalCase.brand.knownAmbiguous,
        exactMatch: false,
        normalizedMatch: false,
        top3Recall: false,
        failureClass: classifyBrand(evalCase.brand, empty, {
          ocrContainsAcceptable: diagnostics.brandOcrContainsAcceptable,
        }),
      },
      alcohol: {
        ...emptyFieldReport(empty),
        present: evalCase.alcohol.present,
        acceptablePercents: evalCase.alcohol.acceptablePercents,
        detected: false,
        parsedValue: null,
        parsedAccurate: false,
        failureClass: classifyAlcohol(evalCase.alcohol, empty, alcoholDiag),
      },
      diagnostics,
      latencyMs,
    };
  }

  const brandObs = toObserved(result.value.fields.brandName);
  const alcoholObs = toObserved(result.value.fields.alcoholStatement);

  return {
    caseId: evalCase.caseId,
    fixtureDir: evalCase.fixtureDir,
    strata: evalCase.strata,
    extractionError: null,
    brand: {
      state: brandObs.state,
      value: brandObs.value,
      confidence: brandObs.confidence,
      alternates: brandObs.alternates,
      acceptable: evalCase.brand.acceptable,
      knownAmbiguous: evalCase.brand.knownAmbiguous,
      exactMatch: brandExactMatch(brandObs.value, evalCase.brand.acceptable),
      normalizedMatch: brandNormalizedMatch(brandObs.value, evalCase.brand.acceptable),
      top3Recall: brandInTopK(brandObs, evalCase.brand.acceptable, 3),
      failureClass: classifyBrand(evalCase.brand, brandObs, {
        ocrContainsAcceptable: diagnostics.brandOcrContainsAcceptable,
      }),
    },
    alcohol: {
      state: alcoholObs.state,
      value: alcoholObs.value,
      confidence: alcoholObs.confidence,
      alternates: alcoholObs.alternates,
      present: evalCase.alcohol.present,
      acceptablePercents: evalCase.alcohol.acceptablePercents,
      detected: alcoholDetected(alcoholObs),
      parsedValue: parseObservedPercent(alcoholObs.value),
      parsedAccurate: alcoholParsedAccurate(alcoholObs.value, evalCase.alcohol.acceptablePercents),
      failureClass: classifyAlcohol(evalCase.alcohol, alcoholObs, alcoholDiag),
    },
    diagnostics,
    latencyMs,
  };
}

function emptyFieldReport(empty: ObservedField) {
  return {
    state: empty.state,
    value: empty.value,
    confidence: empty.confidence,
    alternates: empty.alternates,
  };
}
