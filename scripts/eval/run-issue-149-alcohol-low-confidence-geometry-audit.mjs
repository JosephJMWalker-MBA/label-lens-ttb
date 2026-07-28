// Evaluation-only geometry audit. Does not import or execute any part of the
// production extractor, OCR pipeline, or parser. Computes crop rectangles by
// re-implementing the exact, already-reviewed constants and formulas from
// src/pipeline/extractor/regions.ts (FULL_SIDE_STRIP_WIDTH_FRACTION,
// MIN_EDGE_STRIP_WIDTH_PX, edgeStripCrop) so the rendered geometry matches
// what the real recovery planner would compute, without running OCR at all.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const FULL_SIDE_STRIP_WIDTH_FRACTION = 0.44;
const MIN_EDGE_STRIP_WIDTH_PX = 72;

const OUTPUT_ROOT = path.join(
  process.cwd(),
  "artifacts/issue-149-alcohol-low-confidence-geometry-audit",
);

const CASES = [
  {
    caseId: "patricia-green-cellars",
    imagePath: "tests/fixtures/precheck/approved-wine-015/label.jpeg",
  },
  { caseId: "approved-wine-020", imagePath: "tests/fixtures/precheck/approved-wine-020/label.png" },
  { caseId: "approved-wine-023", imagePath: "tests/fixtures/precheck/approved-wine-023/label.png" },
  {
    caseId: "approved-wine-034",
    imagePath: "tests/fixtures/precheck/approved-wine-034/label.jpeg",
  },
  {
    caseId: "approved-wine-079",
    imagePath: "tests/fixtures/precheck/approved-wine-079/label.jpeg",
  },
  {
    caseId: "approved-wine-097",
    imagePath: "tests/fixtures/precheck/approved-wine-097/label.jpeg",
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizedEdgeWidth(baseWidth, widthFraction) {
  return clamp(
    Math.round(baseWidth * widthFraction),
    Math.min(MIN_EDGE_STRIP_WIDTH_PX, baseWidth),
    baseWidth,
  );
}

function edgeStripCrop(baseWidth, baseHeight, side) {
  const width = normalizedEdgeWidth(baseWidth, FULL_SIDE_STRIP_WIDTH_FRACTION);
  const left = side === "left" ? 0 : Math.max(0, baseWidth - width);
  return { left, top: 0, width, height: baseHeight };
}

async function main() {
  for (const dir of ["originals", "primary", "left-crop", "right-crop", "overlay"]) {
    mkdirSync(path.join(OUTPUT_ROOT, dir), { recursive: true });
  }

  const geometryReport = [];

  for (const { caseId, imagePath } of CASES) {
    const bytes = readFileSync(imagePath);
    const image = sharp(bytes);
    const meta = await image.metadata();
    const width = meta.width;
    const height = meta.height;

    const primaryCrop = { left: 0, top: 0, width, height };
    const leftCrop = edgeStripCrop(width, height, "left");
    const rightCrop = edgeStripCrop(width, height, "right");

    // Persist original, unmodified.
    writeFileSync(
      path.join(OUTPUT_ROOT, "originals", `${caseId}.png`),
      await sharp(bytes).png().toBuffer(),
    );

    // Primary region == full image; persisted for completeness/parity, identical to original.
    writeFileSync(
      path.join(OUTPUT_ROOT, "primary", `${caseId}.png`),
      await sharp(bytes)
        .extract({
          left: primaryCrop.left,
          top: primaryCrop.top,
          width: primaryCrop.width,
          height: primaryCrop.height,
        })
        .png()
        .toBuffer(),
    );

    // Left/right recovery crops, unrotated (rotation is an OCR-input transform,
    // not a geometry-overlap variable; overlap is computed in original pixel space).
    writeFileSync(
      path.join(OUTPUT_ROOT, "left-crop", `${caseId}.png`),
      await sharp(bytes).extract(leftCrop).png().toBuffer(),
    );
    writeFileSync(
      path.join(OUTPUT_ROOT, "right-crop", `${caseId}.png`),
      await sharp(bytes).extract(rightCrop).png().toBuffer(),
    );

    // Overlay: original image with left/right crop rectangles drawn (SVG composite).
    const strokeWidth = Math.max(2, Math.round(Math.min(width, height) * 0.006));
    const svgOverlay = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${leftCrop.left}" y="${leftCrop.top}" width="${leftCrop.width}" height="${leftCrop.height}"
              fill="none" stroke="red" stroke-width="${strokeWidth}" />
        <rect x="${rightCrop.left}" y="${rightCrop.top}" width="${rightCrop.width}" height="${rightCrop.height}"
              fill="none" stroke="blue" stroke-width="${strokeWidth}" />
      </svg>`;
    writeFileSync(
      path.join(OUTPUT_ROOT, "overlay", `${caseId}.png`),
      await sharp(bytes)
        .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
        .png()
        .toBuffer(),
    );

    geometryReport.push({
      caseId,
      imageWidth: width,
      imageHeight: height,
      primaryCrop,
      leftCrop,
      rightCrop,
    });

    console.log(
      `${caseId}: ${width}x${height} | left=${JSON.stringify(leftCrop)} right=${JSON.stringify(rightCrop)}`,
    );
  }

  writeFileSync(
    path.join(OUTPUT_ROOT, "crop-geometry.json"),
    JSON.stringify(geometryReport, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
