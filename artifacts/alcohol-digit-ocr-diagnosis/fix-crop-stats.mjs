/**
 * sharp's .stats() reports statistics of the INPUT image and ignores pipeline
 * operations such as .extract(), so the crop statistics collected alongside the
 * re-reads were whole-image values. Recompute them from actual cropped pixels.
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const P = "artifacts/alcohol-digit-ocr-diagnosis/reread-evidence.json";
const MANIFEST = JSON.parse(readFileSync("src/fixtures/eval/eval-manifest.json", "utf8"));
const rows = JSON.parse(readFileSync(P, "utf8"));

async function statsOf(image, region) {
  const { data } = await sharp(image)
    .extract(region)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0,
    min = 255,
    max = 0;
  for (const v of data) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / data.length;
  let sq = 0;
  for (const v of data) sq += (v - mean) ** 2;
  const stdev = Math.sqrt(sq / data.length);
  // Foreground/background polarity: the modal bulk of a text crop is background.
  // Compare the mean against the midpoint of the observed range.
  const mid = (min + max) / 2;
  return {
    mean: Math.round(mean),
    stdev: Math.round(stdev),
    min,
    max,
    contrastRange: max - min,
    invertedPolarity: mean < mid,
  };
}

for (const r of rows) {
  if (!r.eligible) continue;
  const img = MANIFEST.records.find((m) => m.caseId === r.caseId).imagePath;
  r.cropA.stats = await statsOf(img, r.cropA.region);
  r.cropB.stats = await statsOf(img, r.cropB.region);
}
writeFileSync(P, JSON.stringify(rows, null, 2) + "\n");
const inv = rows.filter((r) => r.eligible && r.cropA.stats.invertedPolarity);
console.log("inverted-polarity crops:", inv.length, inv.map((r) => r.caseId).slice(0, 20));
