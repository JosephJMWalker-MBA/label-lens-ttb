/**
 * READ-ONLY corpus control for the "targeted re-read" family.
 *
 * The candidate treatment: for a case that already produced an accepted alcohol
 * candidate, re-OCR a tight crop derived from THAT CANDIDATE'S OWN recorded
 * geometry (sourceOriginalBoxes) and compare the re-read against the value the
 * pipeline selected. The trigger uses only evidence the pipeline already has —
 * never fixture identity and never the truth.
 *
 * This measures the danger directly: if re-reading currently-CORRECT cases yields
 * different values, the treatment cannot be trusted.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { createWorker } from "tesseract.js";

const LANG_PATH = path.join(process.cwd(), "src/pipeline/extractor/assets");
const OUT = process.argv[2];
// all-cases-slim.json from the baseline run. NOT committed with this record —
// regenerate it with run-eval.ts first (see omitted-intermediate.md).
const FORENSIC = process.argv[3];
const MANIFEST = JSON.parse(readFileSync("src/fixtures/eval/eval-manifest.json", "utf8"));

const cases = JSON.parse(readFileSync(FORENSIC, "utf8"));

function parsePercent(text) {
  const m =
    String(text).match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/) ??
    String(text).match(/(\d{1,2}(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Union of the accepted candidate's source boxes, padded, in source coords. */
function cropFor(boxes, imgW, imgH, padRatio = 0.6) {
  const xs0 = Math.min(...boxes.map((b) => b.x));
  const ys0 = Math.min(...boxes.map((b) => b.y));
  const xs1 = Math.max(...boxes.map((b) => b.x + b.width));
  const ys1 = Math.max(...boxes.map((b) => b.y + b.height));
  const h = ys1 - ys0;
  const padY = Math.round(h * padRatio);
  const padX = Math.round(h * padRatio);
  const left = Math.max(0, xs0 - padX);
  const top = Math.max(0, ys0 - padY);
  return {
    left,
    top,
    width: Math.min(imgW - left, xs1 - xs0 + padX * 2),
    height: Math.min(imgH - top, ys1 - ys0 + padY * 2),
  };
}

async function main() {
  const worker = await createWorker("eng", 1, { langPath: LANG_PATH, gzip: false });
  const results = [];
  let skipped = 0;

  for (const c of cases) {
    const kept = (c.candidateDecisions ?? []).filter((d) => d.kept);
    if (!kept.length) {
      skipped += 1;
      continue;
    }
    const sel = kept[0];
    const boxes = sel.sourceOriginalBoxes ?? [];
    if (!boxes.length) {
      skipped += 1;
      continue;
    }

    const rec = MANIFEST.records.find((r) => r.caseId === c.caseId);
    if (!rec) {
      skipped += 1;
      continue;
    }
    const img = rec.imagePath;
    const meta = await sharp(img).metadata();
    const region = cropFor(boxes, meta.width, meta.height);
    if (region.width < 8 || region.height < 8) {
      skipped += 1;
      continue;
    }

    const buf = await sharp(img)
      .extract(region)
      .resize({ width: Math.max(1, Math.round(region.width * 3)), kernel: "cubic" })
      .grayscale()
      .normalise()
      .png()
      .toBuffer();

    const readings = {};
    for (const [name, psm] of [
      ["singleWord", 8],
      ["sparse", 11],
    ]) {
      await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
      const { data } = await worker.recognize(buf);
      readings[name] = {
        text: data.text.replace(/\s+/g, " ").trim(),
        parsed: parsePercent(data.text),
        confidence: Math.round(data.confidence),
      };
    }

    const truth = c.alcohol.acceptablePercents ?? [];
    const selected = parsePercent(sel.rawText ?? "");
    const wasCorrect = c.alcohol.failureClass === "correct" && c.alcohol.present === true;
    const agreeSW =
      readings.singleWord.parsed !== null &&
      selected !== null &&
      Math.abs(readings.singleWord.parsed - selected) < 0.05;
    const rereadCorrectSW =
      readings.singleWord.parsed !== null &&
      truth.some((t) => Math.abs(t - readings.singleWord.parsed) < 0.05);

    results.push({
      caseId: c.caseId,
      strata: c.strata,
      present: c.alcohol.present,
      truth,
      failureClass: c.alcohol.failureClass,
      selectedValue: selected,
      wasCorrect,
      reread: readings,
      rereadAgreesWithSelected_singleWord: agreeSW,
      rereadMatchesTruth_singleWord: rereadCorrectSW,
      cropRegion: region,
    });
  }

  await worker.terminate();
  writeFileSync(
    path.join(OUT, "control-results.json"),
    JSON.stringify({ skipped, results }, null, 2) + "\n",
  );

  const correct = results.filter((r) => r.wasCorrect);
  const disagree = correct.filter((r) => !r.rereadAgreesWithSelected_singleWord);
  const wouldBreak = disagree.filter((r) => !r.rereadMatchesTruth_singleWord);
  const targets = results.filter((r) =>
    ["approved-wine-018", "approved-wine-037"].includes(r.caseId),
  );

  console.log(`cases with an accepted candidate: ${results.length} (skipped ${skipped})`);
  console.log(`currently-correct among them   : ${correct.length}`);
  console.log(`\nRE-READ (psm=singleWord, x3, production treatment, candidate-derived crop):`);
  console.log(
    `  correct cases where re-read DISAGREES with the selected value: ${disagree.length}`,
  );
  console.log(
    `  ...of those, re-read is WRONG against truth (would break)   : ${wouldBreak.length}`,
  );
  for (const r of wouldBreak.slice(0, 15))
    console.log(
      `     !! ${r.caseId} truth=${JSON.stringify(r.truth)} selected=${r.selectedValue} reread=${r.reread.singleWord.parsed} ${JSON.stringify(r.reread.singleWord.text)}`,
    );
  console.log(`\nTARGET CASES:`);
  for (const r of targets)
    console.log(
      `  ${r.caseId} truth=${JSON.stringify(r.truth)} selected=${r.selectedValue} rereadSW=${r.reread.singleWord.parsed} ${JSON.stringify(r.reread.singleWord.text)} conf=${r.reread.singleWord.confidence} | rereadSparse=${r.reread.sparse.parsed} ${JSON.stringify(r.reread.sparse.text)}`,
    );
  const fixed = targets.filter((r) => r.rereadMatchesTruth_singleWord);
  console.log(
    `\n  targets whose re-read matches truth: ${fixed.length}/2 -> ${JSON.stringify(fixed.map((r) => r.caseId))}`,
  );
}

await main();
