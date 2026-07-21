/**
 * READ-ONLY re-read evidence collection for the narrower-trigger study.
 *
 * The previous control parsed re-read text with an ad-hoc regex. That is not an
 * apples-to-apples comparison against a production value that was produced by the
 * real canonicalization + parser. Here the re-read OCR words are fed through the
 * REAL production selector (`selectAlcoholObservation`) so the re-read value is
 * derived exactly the way the selected value was.
 *
 * Production code is imported, never modified.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { createLocalOcrEngine } from "@/pipeline/extractor/ocr-engine";
import { selectAlcoholObservation } from "@/pipeline/extractor/field-selection";
import type { OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";

const OUT = process.argv[2];
// argv[3] is all-cases-slim.json, which is NOT committed with this record.
// Regenerate it with run-eval.ts first — see omitted-intermediate.md.
const SLIM = JSON.parse(readFileSync(process.argv[3], "utf8")) as any[];
const MANIFEST = JSON.parse(readFileSync("src/fixtures/eval/eval-manifest.json", "utf8")) as {
  records: { caseId: string; imagePath: string }[];
};

/** Wrap re-read words as a single synthetic primary pass for the real selector. */
function asRegionResult(words: OcrWord[], psm: number, regionName: string): RegionOcrResult {
  return {
    passId: `reread-${regionName}-psm${psm}`,
    regionName,
    passKind: "full-image-primary",
    triggerReasons: ["primary-pass"],
    preprocessing: ["grayscale", "normalise", "scale:3"],
    fieldEligibility: { brand: false, alcohol: true },
    transform: { scale: 1, offsetX: 0, offsetY: 0, rotationDegrees: 0 } as never,
    transformedSize: { width: 0, height: 0 },
    pageSegMode: psm,
    rawWordCount: words.length,
    discardedWordCount: 0,
    timings: { preprocessMs: 0, ocrMs: 0, inverseMappingMs: 0, totalMs: 0 },
    words,
  };
}

/** Map re-read boxes back to the original image frame the selector expects. */
function withOriginalGeometry(
  words: OcrWord[],
  region: { left: number; top: number },
  scale: number,
  imageWidth: number,
  imageHeight: number,
): OcrWord[] {
  return words.map((w) => ({
    ...w,
    originalGeometry: {
      imageIndex: 0,
      x: Math.round(region.left + w.bbox.x0 / scale),
      y: Math.round(region.top + w.bbox.y0 / scale),
      width: Math.max(1, Math.round((w.bbox.x1 - w.bbox.x0) / scale)),
      height: Math.max(1, Math.round((w.bbox.y1 - w.bbox.y0) / scale)),
      imageWidth,
      imageHeight,
    },
  }));
}

function productionRead(words: OcrWord[], psm: number, regionName: string) {
  const sel = selectAlcoholObservation([asRegionResult(words, psm, regionName)]);
  const kept = (sel.alcoholDiagnostics?.candidates ?? []).filter((c: any) => c.kept);
  const top: any = kept[0] ?? null;
  return {
    rawWords: words.map((w) => w.text).join(" "),
    words: words.map((w) => ({ text: w.text, conf: Math.round(w.rawConfidence) })),
    minTokenConfidence: words.length ? Math.min(...words.map((w) => w.rawConfidence)) : null,
    meanTokenConfidence: words.length
      ? Math.round(words.reduce((a, w) => a + w.rawConfidence, 0) / words.length)
      : null,
    state: sel.observation?.state ?? null,
    value: sel.observation?.value ?? null,
    parsedPercent: top?.parsedPercent ?? null,
    normalizedValue: top?.normalizedValue ?? null,
    acceptanceReason: top?.acceptanceReason ?? null,
    normalizationOperations: top?.normalizationOperations ?? [],
    candidateMinConfidence: top?.ocrConfidence?.rawMin ?? null,
    acceptedCandidateCount: kept.length,
  };
}

/** Union of the accepted candidate's token boxes, padded — geometry source A. */
function tokenUnionCrop(boxes: any[], w: number, h: number, padRatio = 0.6) {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.width));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  const pad = Math.round((y1 - y0) * padRatio);
  const left = Math.max(0, x0 - pad);
  const top = Math.max(0, y0 - pad);
  return {
    left,
    top,
    width: Math.min(w - left, x1 - x0 + pad * 2),
    height: Math.min(h - top, y1 - y0 + pad * 2),
  };
}

/**
 * Geometry source B: the full-width horizontal band containing the candidate's
 * line. Derived from the line's vertical extent only — independent of the token
 * union in x, so agreement across A and B is not agreement about one crop.
 */
function lineBandCrop(boxes: any[], w: number, h: number, padRatio = 0.5) {
  const y0 = Math.min(...boxes.map((b) => b.y));
  const y1 = Math.max(...boxes.map((b) => b.y + b.height));
  const pad = Math.round((y1 - y0) * padRatio);
  const top = Math.max(0, y0 - pad);
  return { left: 0, top, width: w, height: Math.min(h - top, y1 - y0 + pad * 2) };
}

async function renderAndStats(image: string, region: any, scale: number) {
  const png = await sharp(image)
    .extract(region)
    .resize({ width: Math.max(1, Math.round(region.width * scale)), kernel: "cubic" })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();
  const raw = await sharp(image).extract(region).grayscale().stats();
  const ch = raw.channels[0];
  return {
    png,
    stats: {
      mean: Math.round(ch.mean),
      stdev: Math.round(ch.stdev),
      min: ch.min,
      max: ch.max,
      contrastRange: ch.max - ch.min,
      // Light-on-dark when the crop's bulk (background) is dark.
      invertedPolarity: ch.mean < 110,
    },
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const engine = await createLocalOcrEngine();
  const rows: any[] = [];

  for (const c of SLIM) {
    const kept = (c.candidateDecisions ?? []).filter((d: any) => d.kept);
    const sel = kept[0];
    const boxes = sel?.sourceOriginalBoxes ?? [];
    const rec = MANIFEST.records.find((r) => r.caseId === c.caseId);
    if (!sel || !boxes.length || !rec) {
      rows.push({ caseId: c.caseId, strata: c.strata, alcohol: c.alcohol, eligible: false });
      continue;
    }
    const meta = await sharp(rec.imagePath).metadata();
    const W = meta.width!,
      H = meta.height!;
    const cropA = tokenUnionCrop(boxes, W, H);
    const cropB = lineBandCrop(boxes, W, H);
    if (cropA.width < 8 || cropA.height < 8 || cropB.width < 8 || cropB.height < 8) {
      rows.push({ caseId: c.caseId, strata: c.strata, alcohol: c.alcohol, eligible: false });
      continue;
    }

    const A = await renderAndStats(rec.imagePath, cropA, 3);
    const B = await renderAndStats(rec.imagePath, cropB, 3);

    const geoA = (w: OcrWord[]) => withOriginalGeometry(w, cropA, 3, W, H);
    const geoB = (w: OcrWord[]) => withOriginalGeometry(w, cropB, 3, W, H);
    const a8 = productionRead(geoA(await engine.recognizeWords(A.png, 8)), 8, "tokenUnion");
    const a11 = productionRead(geoA(await engine.recognizeWords(A.png, 11)), 11, "tokenUnion");
    const b7 = productionRead(geoB(await engine.recognizeWords(B.png, 7)), 7, "lineBand");

    rows.push({
      caseId: c.caseId,
      strata: c.strata,
      alcohol: c.alcohol,
      eligible: true,
      selected: {
        rawText: sel.rawText,
        normalizedValue: sel.normalizedValue,
        parsedPercent: sel.parsedPercent,
        acceptanceReason: sel.acceptanceReason,
        normalizationOperations: sel.normalizationOperations ?? [],
        minTokenConfidence: sel.ocrConfidence?.rawMin ?? null,
        meanTokenConfidence: sel.ocrConfidence?.rawMean ?? null,
        tokenCount: (sel.sourceTokens ?? []).length,
        boxWidth:
          Math.max(...boxes.map((b: any) => b.x + b.width)) -
          Math.min(...boxes.map((b: any) => b.x)),
        boxHeight:
          Math.max(...boxes.map((b: any) => b.y + b.height)) -
          Math.min(...boxes.map((b: any) => b.y)),
      },
      cropA: { region: cropA, stats: A.stats },
      cropB: { region: cropB, stats: B.stats },
      reread: { a8, a11, b7 },
    });
    process.stdout.write(`  ${rows.length}/${SLIM.length} ${c.caseId}\n`);
  }

  await engine.terminate();
  writeFileSync(path.join(OUT, "reread-evidence.json"), JSON.stringify(rows, null, 2) + "\n");
  console.log(`eligible: ${rows.filter((r) => r.eligible).length}/${rows.length}`);
}

void main();
