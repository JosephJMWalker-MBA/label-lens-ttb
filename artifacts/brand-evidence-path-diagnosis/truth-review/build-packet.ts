/**
 * READ-ONLY: builds the human truth-review packet for five brand-boundary
 * referrals. Renders one readable crop of the apparent brand area per case and
 * records the surrounding label text so a reviewer can judge the boundary.
 *
 * No recommendation is produced and no fixture is modified.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { runCaseArtifacts } from "@/fixtures/eval/eval-harness";
import { loadEvalManifest } from "@/fixtures/eval/eval-loader";

const OUT = process.argv[2];
const IDS = [
  "approved-wine-088",
  "approved-wine-089",
  "approved-wine-051",
  "approved-wine-048",
  "approved-wine-046",
];
const MANIFEST_RAW = JSON.parse(readFileSync("src/fixtures/eval/eval-manifest.json", "utf8")) as {
  records: { caseId: string; imagePath: string }[];
};

async function main() {
  mkdirSync(path.join(OUT, "crops"), { recursive: true });
  const manifest = loadEvalManifest();
  const rows: unknown[] = [];

  for (const id of IDS) {
    const evalCase = manifest.cases.find((c) => c.caseId === id);
    if (!evalCase) throw new Error(`case not in manifest: ${id}`);
    const { report, productionResponseBytes } = await runCaseArtifacts(evalCase);
    const response = productionResponseBytes ? JSON.parse(productionResponseBytes) : null;
    const b = report.brand;
    const imagePath = MANIFEST_RAW.records.find((r) => r.caseId === id)!.imagePath;
    const meta = await sharp(imagePath).metadata();

    // Crop the apparent brand area from the selected observation's own geometry,
    // padded generously so surrounding label text is visible for context.
    const geom = response?.fields?.brandName?.geometry ?? null;
    let cropFile: string | null = null;
    if (geom && geom.width > 0) {
      const padY = Math.round(geom.height * 1.6);
      const padX = Math.round(geom.height * 1.2);
      const left = Math.max(0, geom.x - padX);
      const top = Math.max(0, geom.y - padY);
      const region = {
        left,
        top,
        width: Math.min(meta.width! - left, geom.width + padX * 2),
        height: Math.min(meta.height! - top, geom.height + padY * 2),
      };
      cropFile = `crops/${id}-brand-area.png`;
      await sharp(imagePath)
        .extract(region)
        .resize({ width: Math.min(1400, Math.max(700, region.width * 3)), kernel: "cubic" })
        .png()
        .toFile(path.join(OUT, cropFile));
    }

    // A readable full-label reference, downscaled.
    const fullFile = `crops/${id}-full.png`;
    await sharp(imagePath)
      .resize({ width: Math.min(900, meta.width!), kernel: "cubic" })
      .png()
      .toFile(path.join(OUT, fullFile));

    rows.push({
      caseId: id,
      expectedBrandTruth: b.acceptable,
      knownAmbiguous: b.knownAmbiguous,
      selectedMachineCandidate: b.value,
      machineState: b.state,
      relevantAlternates: b.alternates.slice(0, 5).map((a) => a.value),
      sourceImage: imagePath,
      imageSize: { width: meta.width, height: meta.height },
      fullLabelReference: fullFile,
      brandAreaCrop: cropFile,
      nearbyLabelText: report.diagnostics.brandLineTexts.slice(0, 14),
      reviewQuestion:
        "Reading only the artwork: what text constitutes the brand as presented on this label, " +
        "and where does the brand mark end and designation, varietal, appellation, label-series, " +
        "or descriptive wording begin?",
    });
    process.stdout.write(`  built ${id}\n`);
  }

  writeFileSync(path.join(OUT, "review-cases.json"), JSON.stringify(rows, null, 2) + "\n");
}

void main();
