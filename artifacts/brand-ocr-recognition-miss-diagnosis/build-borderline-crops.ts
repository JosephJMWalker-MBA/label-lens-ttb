/** READ-ONLY: renders a full-label reference and a brand-area crop for the
 *  three genuinely borderline classifications. No fixture is modified. */
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = process.argv[2];
const IDS = ["approved-wine-044", "approved-wine-083", "approved-wine-091"];
const M = JSON.parse(readFileSync("src/fixtures/eval/eval-manifest.json", "utf8")) as {
  records: { caseId: string; imagePath: string }[];
};
const CASES = JSON.parse(readFileSync(path.join(OUT, "cases.json"), "utf8")) as any[];

async function main() {
  for (const id of IDS) {
    const img = M.records.find((r) => r.caseId === id)!.imagePath;
    const meta = await sharp(img).metadata();
    await sharp(img)
      .resize({ width: Math.min(640, meta.width!), kernel: "cubic" })
      .jpeg({ quality: 82 })
      .toFile(path.join(OUT, `borderline-crops/${id}-full.jpg`));
    // Crop around the BEST DIAGNOSTIC SPAN, which is the closest-matching OCR text
    // and is NOT necessarily the brand area — on a true non-recognition it may sit
    // anywhere on the label. The full-label reference is what shows the brand.
    const g = CASES.find((c) => c.caseId === id)?.bestSpanGeometry;
    if (g && g.frame === "original-image") {
      const h = g.height;
      const padY = Math.round(h * 1.6);
      const padX = Math.round(h * 1.2);
      const left = Math.max(0, g.x - padX);
      const top = Math.max(0, g.y - padY);
      const region = {
        left,
        top,
        width: Math.min(meta.width! - left, g.width + padX * 2),
        height: Math.min(meta.height! - top, h + padY * 2),
      };
      await sharp(img)
        .extract(region)
        .resize({ width: Math.min(1200, Math.max(600, region.width * 3)), kernel: "cubic" })
        .jpeg({ quality: 90 })
        .toFile(path.join(OUT, `borderline-crops/${id}-best-span-area.jpg`));
    }
    console.log(`  built ${id}`);
  }
}

void main();
