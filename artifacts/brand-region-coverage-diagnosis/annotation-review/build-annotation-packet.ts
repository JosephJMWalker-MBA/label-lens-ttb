/**
 * READ-ONLY: renders the Phase-1 annotation packet.
 *
 * For each of the 13 primary cases it emits the full canonical label image and a
 * copy with the PROPOSED brand-region outline drawn on it. **No OCR word boxes
 * and no machine-selected regions are drawn** — the first annotation view must
 * not anchor the reader to machine output.
 *
 * Regions were proposed by visual inspection of the artwork. Expected fixture
 * text was used only to know which mark is the brand; it never steered OCR,
 * recovery planning, crops, or extraction — none of which are run here.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = process.argv[2];
const PROPOSED = JSON.parse(readFileSync(path.join(OUT, "proposed-regions.json"), "utf8")) as {
  regions: {
    caseId: string;
    imagePath: string;
    imageWidth: number;
    imageHeight: number;
    occurrences: {
      label: string;
      region: { x: number; y: number; width: number; height: number };
    }[];
  }[];
};

async function main() {
  mkdirSync(path.join(OUT, "images"), { recursive: true });
  for (const r of PROPOSED.regions) {
    const meta = await sharp(r.imagePath).metadata();
    if (meta.width !== r.imageWidth || meta.height !== r.imageHeight) {
      throw new Error(`dimension mismatch for ${r.caseId}`);
    }
    for (const o of r.occurrences) {
      const g = o.region;
      if (g.x < 0 || g.y < 0 || g.x + g.width > meta.width! || g.y + g.height > meta.height!) {
        throw new Error(`proposed region out of bounds for ${r.caseId} (${o.label})`);
      }
    }
    // Plain reference.
    await sharp(r.imagePath)
      .resize({ width: Math.min(760, meta.width!), kernel: "cubic" })
      .jpeg({ quality: 86 })
      .toFile(path.join(OUT, `images/${r.caseId}-label.jpg`));
    // Outlined proposal. The label is resized first and the rectangle drawn in
    // display space, so the overlay always matches the raster exactly.
    const displayWidth = Math.min(760, meta.width!);
    const k = displayWidth / meta.width!;
    const base = await sharp(r.imagePath)
      .resize({ width: displayWidth, kernel: "cubic" })
      .png()
      .toBuffer();
    const baseMeta = await sharp(base).metadata();
    const rects = r.occurrences
      .map((o, i) => {
        const g = o.region;
        const x = (g.x * k).toFixed(1);
        const y = (g.y * k).toFixed(1);
        const w = (g.width * k).toFixed(1);
        const h = (g.height * k).toFixed(1);
        const tag = r.occurrences.length > 1 ? String.fromCharCode(65 + i) : "";
        const labelY = Math.max(12, g.y * k - 5).toFixed(1);
        return (
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#e11d48" stroke-width="3"/>` +
          (tag
            ? `<text x="${x}" y="${labelY}" font-family="sans-serif" font-size="18" font-weight="bold" fill="#e11d48">${tag}</text>`
            : "")
        );
      })
      .join("");
    const svg = Buffer.from(
      `<svg width="${baseMeta.width}" height="${baseMeta.height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`,
    );
    await sharp(base)
      .composite([{ input: svg, top: 0, left: 0 }])
      .jpeg({ quality: 86 })
      .toFile(path.join(OUT, `images/${r.caseId}-proposed-region.jpg`));
    process.stdout.write(`  ${r.caseId}\n`);
  }
  writeFileSync(
    path.join(OUT, "bounds-check.json"),
    JSON.stringify(
      {
        checked: PROPOSED.regions.length,
        allWithinCanonicalBounds: true,
        note: "build fails loudly if any proposed region leaves the canonical image frame",
      },
      null,
      2,
    ) + "\n",
  );
}

void main();
