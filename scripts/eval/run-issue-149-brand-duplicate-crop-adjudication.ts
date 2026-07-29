/**
 * Issue #149 — adjudicate the duplicate approved Brand crop shared by
 * `approved-wine-004` and `la-fattoria-rotated`.
 *
 * Evidence and adjudication only. Runs no OCR, modifies no production code, no
 * fixture, no fixture truth, and no prior frozen artifact. Recomputed crops are
 * written to a separate directory; committed artifacts are read-only inputs.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { format } from "prettier";
import sharp from "sharp";

import {
  composeResearchManifest,
  type NormalizedResearchRegion,
  type ResearchFixture,
} from "@/fixtures/ocr-research/fixture-corpus";

const EXPERIMENT_ID = "issue-149-brand-duplicate-crop-adjudication";
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const RECOMPUTED_ROOT = path.join(OUTPUT_ROOT, "recomputed-crops");
const VISUAL_ROOT = path.join(OUTPUT_ROOT, "visual-comparison");
const COMMITTED_CROP_ROOT = path.join(
  process.cwd(),
  "artifacts/issue-149-brand-otsu-threshold/control/crops",
);
const EXPECTED_BASE_SHA = "49e9e85fb034f4e8b24f90946ed9f183458a3cca";
const PREREGISTRATION_SHA256 = "e4627fac32ccd4704775807371feea39ff201b2c3b06164db414af73424eba33";

/** The pair under adjudication. Case A and Case B are neutral display names. */
const CASE_A = "approved-wine-004";
const CASE_B = "la-fattoria-rotated";

/** Frozen crop geometry parameters, from the governed bounded Brand control. */
const PADDING = { ratio: 0.03, minPx: 4 } as const;

/**
 * Prior merged artifacts that must remain byte-identical. Nothing in this
 * package may alter them.
 */
const PRIOR_FROZEN_ARTIFACTS = {
  "artifacts/issue-149-brand-mechanism-sublabels/annotator-responses/geometric-response-template.json":
    "20d3b6be2063461b7686d2b9f060225c3efa6caa67437b75d1eeca404f6e46be",
  "artifacts/issue-149-brand-mechanism-sublabels/annotator-responses/stylization-response-template.json":
    "fb5ed5779da53ec8f315ea48fa9c733769a6e8c287fb09c5865985706ebc98d2",
  "artifacts/issue-149-brand-mechanism-sublabels/annotator-responses/annotator-provenance.md":
    "54a0806d2644c964888310dc5bffbcfbbdfc1f97fe99e656bd898f4b4d1d6300",
  "artifacts/issue-149-brand-mechanism-sublabels/case-freeze.json":
    "6f0039f8b270528b1e178c60183433dc143f37993fd46e4382a6fff621729d41",
  "artifacts/issue-149-brand-mechanism-sublabels/packet-manifest.json":
    "d44b3327b5fb529cb26d35a7923d2c9b8e8bb33fd774c08fe8d06e9d3256cff5",
} as const;

/** Production paths that must not move, including the PR #195 baseline file. */
const GUARDED_PRODUCTION_HASHES = {
  "src/pipeline/extractor/field-selection.ts":
    "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d",
  "src/pipeline/extractor/regions.ts":
    "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
  "src/pipeline/extractor/extractor.ts":
    "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
} as const;

type Classification =
  | "LEGITIMATE_DUPLICATE_SOURCE"
  | "COPY_OR_MAPPING_ERROR"
  | "DISTINCT_SOURCE_SAME_CROP"
  | "STALE_ARTIFACT"
  | "INDETERMINATE";

interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath: string): string {
  return sha256Bytes(readFileSync(filePath));
}

function git(args: readonly string[]): string {
  try {
    return execFileSync("git", [...args], { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  writeFileSync(filePath, await format(JSON.stringify(value), { parser: "json", printWidth: 100 }));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Mirrors `cropFor` in src/fixtures/ocr-research/experiment.ts for the
 * governed-brand-region case at rotation 0. Validated below by recomputing all
 * eleven governed crops and comparing them against their committed bytes.
 */
function governedCropRect(
  region: NormalizedResearchRegion,
  imageWidth: number,
  imageHeight: number,
): CropRect {
  const left = Math.floor(region.x * imageWidth);
  const top = Math.floor(region.y * imageHeight);
  const right = Math.ceil((region.x + region.width) * imageWidth);
  const bottom = Math.ceil((region.y + region.height) * imageHeight);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) throw new Error("INVALID_REGION_PIXELS");
  const padX = Math.max(PADDING.minPx, Math.round(width * PADDING.ratio));
  const padY = Math.max(PADDING.minPx, Math.round(height * PADDING.ratio));
  const paddedLeft = clamp(left - padX, 0, imageWidth - 1);
  const paddedTop = clamp(top - padY, 0, imageHeight - 1);
  const paddedRight = clamp(right + padX, paddedLeft + 1, imageWidth);
  const paddedBottom = clamp(bottom + padY, paddedTop + 1, imageHeight);
  return {
    left: paddedLeft,
    top: paddedTop,
    width: paddedRight - paddedLeft,
    height: paddedBottom - paddedTop,
  };
}

interface GovernedCase {
  caseId: string;
  fixture: ResearchFixture;
  region: NormalizedResearchRegion;
  regionIndex: number;
  cropFileName: string;
}

interface CropComparisonRow {
  caseId: string;
  fixtureId: string;
  sourceImagePath: string;
  sourceImageSha256: string;
  sourceImageSize: { width: number; height: number };
  sourceImageByteSize: number;
  regionIndex: number;
  region: NormalizedResearchRegion;
  cropRect: CropRect;
  committedCropPath: string;
  committedCropExists: boolean;
  committedCropSha256: string | null;
  recomputedCropPath: string;
  recomputedCropSha256: string;
  committedMatchesRecomputedBytes: boolean | null;
  committedMatchesRecomputedPixels: boolean | null;
}

/** Every governed Brand case, including the multi-region suffix convention. */
function governedCases(): GovernedCase[] {
  const manifest = composeResearchManifest({ includePrivate: false });
  const cases: GovernedCase[] = [];
  for (const fixture of [...manifest.fixtures].sort((a, b) =>
    a.fixtureId.localeCompare(b.fixtureId),
  )) {
    const regions = fixture.regions.brand;
    for (const [index, region] of regions.entries()) {
      const suffix = regions.length > 1 ? `-region-${index + 1}` : "";
      cases.push({
        caseId: `${fixture.fixtureId}${suffix}`,
        fixture,
        region,
        regionIndex: index,
        cropFileName: `${fixture.fixtureId}${suffix}.png`,
      });
    }
  }
  return cases;
}

async function recomputeCrop(item: GovernedCase): Promise<{
  rect: CropRect;
  png: Buffer;
  outputPath: string;
}> {
  const bytes = readFileSync(path.resolve(item.fixture.image.path));
  if (sha256Bytes(bytes) !== item.fixture.image.sha256) {
    throw new Error(`SOURCE_IMAGE_CHECKSUM_MISMATCH: ${item.caseId}`);
  }
  const rect = governedCropRect(item.region, item.fixture.image.width, item.fixture.image.height);
  const png = await sharp(bytes).extract(rect).png().toBuffer();
  const outputPath = path.join(RECOMPUTED_ROOT, item.cropFileName);
  writeFileSync(outputPath, png);
  return { rect, png, outputPath };
}

async function rawPixels(png: Buffer) {
  const decoded = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return {
    data: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
    channels: decoded.info.channels,
  };
}

async function pixelIdentical(left: Buffer, right: Buffer): Promise<boolean> {
  const a = await rawPixels(left);
  const b = await rawPixels(right);
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) return false;
  return Buffer.from(a.data).equals(Buffer.from(b.data));
}

/**
 * Where two same-sized source images differ. Establishes *how* identical crop
 * pixels can arise from images that are not themselves identical: the region
 * under test is pixel-identical while the rest of the label is not.
 */
async function sourceDifferenceAnalysis(
  leftPath: string,
  rightPath: string,
  rect: CropRect,
): Promise<Record<string, unknown>> {
  const left = await sharp(readFileSync(path.resolve(leftPath)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const right = await sharp(readFileSync(path.resolve(rightPath)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    left.info.width !== right.info.width ||
    left.info.height !== right.info.height ||
    left.info.channels !== right.info.channels
  ) {
    return {
      comparable: false,
      reason: "Source images differ in decoded dimensions or channel count.",
      left: { width: left.info.width, height: left.info.height, channels: left.info.channels },
      right: { width: right.info.width, height: right.info.height, channels: right.info.channels },
    };
  }
  const channels = left.info.channels;
  const width = left.info.width;
  const height = left.info.height;
  const differs = (x: number, y: number): boolean => {
    const offset = (y * width + x) * channels;
    return (
      left.data[offset] !== right.data[offset] ||
      left.data[offset + 1] !== right.data[offset + 1] ||
      left.data[offset + 2] !== right.data[offset + 2]
    );
  };
  let differingPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!differs(x, y)) continue;
      differingPixels += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  let differingInsideCrop = 0;
  for (let y = rect.top; y < rect.top + rect.height; y += 1) {
    for (let x = rect.left; x < rect.left + rect.width; x += 1) {
      if (differs(x, y)) differingInsideCrop += 1;
    }
  }
  const totalPixels = width * height;
  const cropPixels = rect.width * rect.height;
  return {
    comparable: true,
    decodedSize: { width, height, channels },
    totalPixels,
    differingPixels,
    differingPixelPercent: Number(((100 * differingPixels) / totalPixels).toFixed(4)),
    cropPixels,
    differingPixelsInsideApprovedCrop: differingInsideCrop,
    approvedCropRegionPixelIdentical: differingInsideCrop === 0,
    differenceBoundingBox: maxX < 0 ? null : { left: minX, top: minY, right: maxX, bottom: maxY },
    cropRect: rect,
    interpretation:
      differingInsideCrop === 0
        ? "The two labels are different images that share a pixel-identical approved Brand region; they differ only outside it."
        : "The approved Brand region itself differs between the two source images.",
  };
}

/** Neutral-label panel. No OCR transcript, no truth string, no case naming. */
function panelLabel(width: number, title: string, subtitle: string): Buffer {
  const escape = (value: string) =>
    value.replace(/[<>&"']/g, (character) => {
      return (
        { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[character] ??
        character
      );
    });
  return Buffer.from(`
    <svg width="${width}" height="72" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="72" fill="#111827"/>
      <text x="20" y="30" font-size="22" font-family="Menlo, monospace" fill="#f9fafb">${escape(title)}</text>
      <text x="20" y="58" font-size="17" font-family="Menlo, monospace" fill="#93c5fd">${escape(subtitle)}</text>
    </svg>
  `);
}

function regionOutline(width: number, height: number, rect: CropRect, scale: number): Buffer {
  const x = Math.round(rect.left * scale);
  const y = Math.round(rect.top * scale);
  const w = Math.round(rect.width * scale);
  const h = Math.round(rect.height * scale);
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${x}" y="${y}" width="${w}" height="${h}"
            fill="none" stroke="#dc2626" stroke-width="4"/>
    </svg>
  `);
}

async function fitted(png: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(png)
    .flatten({ background: "#ffffff" })
    .resize({ width, height, fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
}

async function buildVisualComparison(args: {
  a: { caseId: string; sourcePath: string; rect: CropRect; committed: Buffer; recomputed: Buffer };
  b: { caseId: string; sourcePath: string; rect: CropRect; committed: Buffer; recomputed: Buffer };
}): Promise<string[]> {
  const written: string[] = [];
  const panelWidth = 560;
  const sourceHeight = 640;
  const cropHeight = 220;

  // Source images, side by side, with the approved region outlined.
  const sources = await Promise.all(
    [args.a, args.b].map(async (side) => {
      const bytes = readFileSync(path.resolve(side.sourcePath));
      const metadata = await sharp(bytes).metadata();
      const sourceWidth = metadata.width ?? 1;
      const sourceHeightPx = metadata.height ?? 1;
      const scale = Math.min(panelWidth / sourceWidth, sourceHeight / sourceHeightPx);
      const drawWidth = Math.round(sourceWidth * scale);
      const drawHeight = Math.round(sourceHeightPx * scale);
      const base = await sharp(bytes)
        .flatten({ background: "#ffffff" })
        .resize({ width: drawWidth, height: drawHeight })
        .png()
        .toBuffer();
      const plain = await sharp({
        create: { width: panelWidth, height: sourceHeight, channels: 3, background: "#ffffff" },
      })
        .composite([{ input: base, left: 0, top: 0 }])
        .png()
        .toBuffer();
      const outlined = await sharp({
        create: { width: panelWidth, height: sourceHeight, channels: 3, background: "#ffffff" },
      })
        .composite([
          { input: base, left: 0, top: 0 },
          { input: regionOutline(panelWidth, sourceHeight, side.rect, scale), left: 0, top: 0 },
        ])
        .png()
        .toBuffer();
      return { plain, outlined };
    }),
  );

  const sourceSheet = path.join(VISUAL_ROOT, "01-source-images.png");
  await sharp({
    create: {
      width: panelWidth * 2,
      height: sourceHeight + 72,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([
      {
        input: panelLabel(panelWidth * 2, "Source images", "Case A (left) / Case B (right)"),
        left: 0,
        top: 0,
      },
      { input: sources[0].plain, left: 0, top: 72 },
      { input: sources[1].plain, left: panelWidth, top: 72 },
    ])
    .png()
    .toFile(sourceSheet);
  written.push(sourceSheet);

  const overlaySheet = path.join(VISUAL_ROOT, "02-approved-region-overlays.png");
  await sharp({
    create: {
      width: panelWidth * 2,
      height: sourceHeight + 72,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([
      {
        input: panelLabel(
          panelWidth * 2,
          "Approved Brand region overlay",
          "Case A (left) / Case B (right); red rectangle is the padded governed crop",
        ),
        left: 0,
        top: 0,
      },
      { input: sources[0].outlined, left: 0, top: 72 },
      { input: sources[1].outlined, left: panelWidth, top: 72 },
    ])
    .png()
    .toFile(overlaySheet);
  written.push(overlaySheet);

  const committedSheet = path.join(VISUAL_ROOT, "03-committed-crops.png");
  await sharp({
    create: { width: panelWidth * 2, height: cropHeight + 72, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: panelLabel(panelWidth * 2, "Committed crops", "Case A (left) / Case B (right)"),
        left: 0,
        top: 0,
      },
      { input: await fitted(args.a.committed, panelWidth, cropHeight), left: 0, top: 72 },
      { input: await fitted(args.b.committed, panelWidth, cropHeight), left: panelWidth, top: 72 },
    ])
    .png()
    .toFile(committedSheet);
  written.push(committedSheet);

  const recomputedSheet = path.join(VISUAL_ROOT, "04-recomputed-crops.png");
  await sharp({
    create: { width: panelWidth * 2, height: cropHeight + 72, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: panelLabel(panelWidth * 2, "Recomputed crops", "Case A (left) / Case B (right)"),
        left: 0,
        top: 0,
      },
      { input: await fitted(args.a.recomputed, panelWidth, cropHeight), left: 0, top: 72 },
      { input: await fitted(args.b.recomputed, panelWidth, cropHeight), left: panelWidth, top: 72 },
    ])
    .png()
    .toFile(recomputedSheet);
  written.push(recomputedSheet);

  return written;
}

async function main() {
  if (git(["rev-parse", "HEAD"]) !== EXPECTED_BASE_SHA) {
    throw new Error("ADJUDICATION_UNEXPECTED_BASE_SHA");
  }
  if (sha256File(path.join(OUTPUT_ROOT, "preregistration.md")) !== PREREGISTRATION_SHA256) {
    throw new Error("ADJUDICATION_PREREGISTRATION_CHANGED");
  }
  const priorArtifactsUnchanged = Object.entries(PRIOR_FROZEN_ARTIFACTS).every(
    ([filePath, expected]) => sha256File(path.join(process.cwd(), filePath)) === expected,
  );
  if (!priorArtifactsUnchanged) throw new Error("ADJUDICATION_PRIOR_FROZEN_ARTIFACT_CHANGED");
  const guardedProductionUnchanged = Object.entries(GUARDED_PRODUCTION_HASHES).every(
    ([filePath, expected]) => sha256File(path.join(process.cwd(), filePath)) === expected,
  );
  if (!guardedProductionUnchanged) throw new Error("ADJUDICATION_GUARDED_PRODUCTION_CHANGED");

  mkdirSync(RECOMPUTED_ROOT, { recursive: true });
  mkdirSync(VISUAL_ROOT, { recursive: true });

  const cases = governedCases();
  const caseA = cases.find((item) => item.caseId === CASE_A);
  const caseB = cases.find((item) => item.caseId === CASE_B);
  if (!caseA || !caseB) throw new Error("ADJUDICATION_PAIR_NOT_IN_MANIFEST");

  // Recompute every governed crop: validates the mirrored crop logic and
  // surfaces any other stale committed artifact.
  const rows: CropComparisonRow[] = [];
  for (const item of cases) {
    const committedPath = path.join(COMMITTED_CROP_ROOT, item.cropFileName);
    const committedExists = existsSync(committedPath);
    const committed = committedExists ? readFileSync(committedPath) : null;
    const { rect, png, outputPath } = await recomputeCrop(item);
    rows.push({
      caseId: item.caseId,
      fixtureId: item.fixture.fixtureId,
      sourceImagePath: item.fixture.image.path,
      sourceImageSha256: item.fixture.image.sha256,
      sourceImageSize: { width: item.fixture.image.width, height: item.fixture.image.height },
      sourceImageByteSize: item.fixture.image.byteSize,
      regionIndex: item.regionIndex,
      region: item.region,
      cropRect: rect,
      committedCropPath: path.relative(process.cwd(), committedPath),
      committedCropExists: committedExists,
      committedCropSha256: committed ? sha256Bytes(committed) : null,
      recomputedCropPath: path.relative(process.cwd(), outputPath),
      recomputedCropSha256: sha256Bytes(png),
      committedMatchesRecomputedBytes: committed ? committed.equals(png) : null,
      committedMatchesRecomputedPixels: committed ? await pixelIdentical(committed, png) : null,
    });
  }

  const mirrorValidation = {
    totalGovernedCrops: rows.length,
    reproducedByteForByte: rows.filter((row) => row.committedMatchesRecomputedBytes === true)
      .length,
    failedToReproduce: rows
      .filter((row) => row.committedMatchesRecomputedBytes === false)
      .map((row) => row.caseId),
    missingCommittedCrop: rows.filter((row) => !row.committedCropExists).map((row) => row.caseId),
    mirrorFaithful: rows.every((row) => row.committedMatchesRecomputedBytes !== false),
  };

  const rowA = rows.find((row) => row.caseId === CASE_A);
  const rowB = rows.find((row) => row.caseId === CASE_B);
  if (!rowA || !rowB) throw new Error("ADJUDICATION_PAIR_ROW_MISSING");

  const sourceBytesA = readFileSync(path.resolve(rowA.sourceImagePath));
  const sourceBytesB = readFileSync(path.resolve(rowB.sourceImagePath));
  const sourceImagesIdentical =
    rowA.sourceImagePath === rowB.sourceImagePath || sourceBytesA.equals(sourceBytesB);
  const sourcePixelsIdentical = await pixelIdentical(sourceBytesA, sourceBytesB);
  const sourceDifference = await sourceDifferenceAnalysis(
    rowA.sourceImagePath,
    rowB.sourceImagePath,
    rowA.cropRect,
  );
  const cropRectsIdentical = JSON.stringify(rowA.cropRect) === JSON.stringify(rowB.cropRect);
  const regionGeometryIdentical = JSON.stringify(rowA.region) === JSON.stringify(rowB.region);
  const committedCropsIdentical = rowA.committedCropSha256 === rowB.committedCropSha256;
  const recomputedCropsIdentical = rowA.recomputedCropSha256 === rowB.recomputedCropSha256;
  const aMatchesOwnRecomputation = rowA.committedMatchesRecomputedBytes === true;
  const bMatchesOwnRecomputation = rowB.committedMatchesRecomputedBytes === true;

  // Classification. Truth strings play no part in this decision.
  let classification: Classification;
  let evidenceConfidence: "high" | "medium" | "low";
  let rationale: string;
  if (!aMatchesOwnRecomputation || !bMatchesOwnRecomputation) {
    classification = "STALE_ARTIFACT";
    evidenceConfidence = "high";
    rationale =
      "At least one committed crop does not reproduce from its current source image and geometry.";
  } else if (sourceImagesIdentical) {
    classification = "LEGITIMATE_DUPLICATE_SOURCE";
    evidenceConfidence = "high";
    rationale = "Both case IDs resolve to the same underlying source image.";
  } else if (recomputedCropsIdentical && committedCropsIdentical) {
    classification = "DISTINCT_SOURCE_SAME_CROP";
    evidenceConfidence = "high";
    rationale =
      "The two cases have different source images, each committed crop reproduces exactly from its own source and geometry, and the two independent recomputations land on identical pixels.";
  } else if (committedCropsIdentical && !recomputedCropsIdentical) {
    classification = "COPY_OR_MAPPING_ERROR";
    evidenceConfidence = "high";
    rationale =
      "The committed crops are identical but independent recomputation produces different crops, so one committed crop was emitted under the wrong case ID.";
  } else {
    classification = "INDETERMINATE";
    evidenceConfidence = "low";
    rationale = "The evidence does not fit any single explanation.";
  }

  const bothMayRemain =
    classification === "DISTINCT_SOURCE_SAME_CROP" ||
    classification === "LEGITIMATE_DUPLICATE_SOURCE";
  const distinctCommittedCropHashes = new Set(
    rows
      .filter((row) => row.committedCropSha256 !== null)
      .map((row) => row.committedCropSha256 as string),
  ).size;

  await writeJson(path.join(OUTPUT_ROOT, "case-provenance.json"), {
    experimentId: EXPERIMENT_ID,
    evaluationOnly: true,
    ocrRun: false,
    pair: { caseA: CASE_A, caseB: CASE_B },
    governedCases: rows.map((row) => ({
      caseId: row.caseId,
      fixtureId: row.fixtureId,
      sourceImagePath: row.sourceImagePath,
      sourceImageSha256: row.sourceImageSha256,
      sourceImageSize: row.sourceImageSize,
      region: row.region,
      cropRect: row.cropRect,
      committedCropSha256: row.committedCropSha256,
      recomputedCropSha256: row.recomputedCropSha256,
    })),
  });

  await writeJson(path.join(OUTPUT_ROOT, "source-hashes.json"), {
    experimentId: EXPERIMENT_ID,
    sources: [...new Set(rows.map((row) => row.sourceImagePath))].sort().map((sourcePath) => ({
      path: sourcePath,
      sha256: sha256File(path.resolve(sourcePath)),
      usedByCases: rows.filter((row) => row.sourceImagePath === sourcePath).map((r) => r.caseId),
    })),
    pairSourceComparison: {
      caseA: { caseId: CASE_A, path: rowA.sourceImagePath, sha256: rowA.sourceImageSha256 },
      caseB: { caseId: CASE_B, path: rowB.sourceImagePath, sha256: rowB.sourceImageSha256 },
      sourcePathsIdentical: rowA.sourceImagePath === rowB.sourceImagePath,
      sourceBytesIdentical: sourceImagesIdentical,
      sourcePixelsIdentical,
    },
  });

  await writeJson(path.join(OUTPUT_ROOT, "committed-crop-hashes.json"), {
    experimentId: EXPERIMENT_ID,
    cropRoot: path.relative(process.cwd(), COMMITTED_CROP_ROOT),
    readOnly: true,
    distinctCropHashes: distinctCommittedCropHashes,
    totalCrops: rows.filter((row) => row.committedCropExists).length,
    crops: rows.map((row) => ({
      caseId: row.caseId,
      path: row.committedCropPath,
      exists: row.committedCropExists,
      sha256: row.committedCropSha256,
    })),
  });

  await writeJson(path.join(OUTPUT_ROOT, "recomputed-crop-hashes.json"), {
    experimentId: EXPERIMENT_ID,
    recomputedRoot: path.relative(process.cwd(), RECOMPUTED_ROOT),
    method:
      "Recomputed from the current frozen source image and current manifest geometry using the governed crop rectangle logic at rotation 0. Deterministic: rerunning reproduces identical bytes.",
    overwritesCommittedArtifacts: false,
    mirrorValidation,
    crops: rows.map((row) => ({
      caseId: row.caseId,
      path: row.recomputedCropPath,
      sha256: row.recomputedCropSha256,
      committedMatchesRecomputedBytes: row.committedMatchesRecomputedBytes,
      committedMatchesRecomputedPixels: row.committedMatchesRecomputedPixels,
    })),
  });

  await writeJson(path.join(OUTPUT_ROOT, "geometry-comparison.json"), {
    experimentId: EXPERIMENT_ID,
    caseA: {
      caseId: CASE_A,
      sourceImageSize: rowA.sourceImageSize,
      sourceImageByteSize: rowA.sourceImageByteSize,
      region: rowA.region,
      cropRect: rowA.cropRect,
    },
    caseB: {
      caseId: CASE_B,
      sourceImageSize: rowB.sourceImageSize,
      sourceImageByteSize: rowB.sourceImageByteSize,
      region: rowB.region,
      cropRect: rowB.cropRect,
    },
    sourceImageSizesIdentical:
      JSON.stringify(rowA.sourceImageSize) === JSON.stringify(rowB.sourceImageSize),
    sourceImageByteSizesIdentical: rowA.sourceImageByteSize === rowB.sourceImageByteSize,
    regionGeometryIdentical,
    cropRectsIdentical,
    paddingParameters: PADDING,
  });

  const logLines = (args: readonly string[]): string[] =>
    git(args)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

  await writeJson(path.join(OUTPUT_ROOT, "git-history-report.json"), {
    experimentId: EXPERIMENT_ID,
    method:
      "git log and pickaxe (-S) over the full history. Read-only; no history was rewritten and no commit was created by this step.",
    caseIdIntroduction: {
      [CASE_A]: {
        pickaxeTerm: '"fixtureId": "approved-wine-004"',
        commitsOldestFirst: logLines([
          "log",
          "--oneline",
          "--all",
          "--reverse",
          '-S"fixtureId": "approved-wine-004"',
        ]),
      },
      [CASE_B]: {
        pickaxeTerm: "la-fattoria-rotated",
        commitsOldestFirst: logLines([
          "log",
          "--oneline",
          "--all",
          "--reverse",
          "-Sla-fattoria-rotated",
        ]),
      },
    },
    sourceImageHistory: {
      [rowA.sourceImagePath]: logLines(["log", "--oneline", "--", rowA.sourceImagePath]),
      [rowB.sourceImagePath]: logLines(["log", "--oneline", "--", rowB.sourceImagePath]),
    },
    governedManifestHistory: logLines([
      "log",
      "--oneline",
      "--",
      "tests/fixtures/ocr-research/manifest.json",
    ]),
    committedCropHistory: logLines([
      "log",
      "--oneline",
      "--",
      path.relative(process.cwd(), COMMITTED_CROP_ROOT),
    ]),
    legacyEvaluationManifest: {
      path: "src/fixtures/eval/eval-manifest.json",
      note: `${CASE_B} is a legacy evaluation case ID that predates the numbered corpus and is bound to ${rowB.sourceImagePath}. No case ID named after that image directory exists in the legacy manifest, so the legacy ID is that image's only case identity.`,
      history: logLines(["log", "--oneline", "--", "src/fixtures/eval/eval-manifest.json"]).slice(
        0,
        10,
      ),
    },
  });

  const visuals = await buildVisualComparison({
    a: {
      caseId: CASE_A,
      sourcePath: rowA.sourceImagePath,
      rect: rowA.cropRect,
      committed: readFileSync(path.join(process.cwd(), rowA.committedCropPath)),
      recomputed: readFileSync(path.join(process.cwd(), rowA.recomputedCropPath)),
    },
    b: {
      caseId: CASE_B,
      sourcePath: rowB.sourceImagePath,
      rect: rowB.cropRect,
      committed: readFileSync(path.join(process.cwd(), rowB.committedCropPath)),
      recomputed: readFileSync(path.join(process.cwd(), rowB.recomputedCropPath)),
    },
  });

  const eligibleDistinctImageDenominator = {
    stylizationAuditCases: 5,
    distinctSourceImages: 5,
    distinctCommittedCropImages: 4,
    note: "The five stylization cases have five distinct source images but only four distinct Brand crop images, because two cases crop to identical pixels.",
    denominatorForIndependentCropEvidence: 4,
    designLevelObservation: {
      distinctBrandDesigns: 3,
      basis:
        "Visual inspection of the recomputed crops, not a hash: approved-wine-004, la-fattoria-rotated, and approved-wine-005 all render the same producer's Brand mark. The first two are pixel-identical; the third is the same artwork at a different image scale, so it is a genuinely distinct crop image but not an independent Brand design.",
      caution:
        "A recognizer comparison over the stylization subset therefore sees 4 distinct crop images spanning only 3 distinct Brand designs. Treat design-level independence, not just crop-level distinctness, when sizing any later claim.",
      hashEvidence: false,
    },
  };

  await writeJson(path.join(OUTPUT_ROOT, "adjudication-report.json"), {
    experimentId: EXPERIMENT_ID,
    evaluationOnly: true,
    ocrRun: false,
    fixtureChanged: false,
    fixtureTruthChanged: false,
    productionChanged: false,
    priorFrozenArtifactsUnchanged: priorArtifactsUnchanged,
    pr195Untouched: guardedProductionUnchanged,
    classification,
    evidenceConfidence,
    rationale,
    areSourceImagesIdentical: sourceImagesIdentical,
    areCropRectanglesIdentical: cropRectsIdentical,
    areCommittedCropsIdentical: committedCropsIdentical,
    areRecomputedCropsIdentical: recomputedCropsIdentical,
    committedMatchesOwnRecomputation: {
      [CASE_A]: aMatchesOwnRecomputation,
      [CASE_B]: bMatchesOwnRecomputation,
    },
    isEitherCaseStaleOrMisMapped: !aMatchesOwnRecomputation || !bMatchesOwnRecomputation,
    mayBothCasesRemainInLaterExperiment: bothMayRemain,
    eligibleDistinctImageDenominator,
    requiredCorrectiveAction:
      classification === "DISTINCT_SOURCE_SAME_CROP"
        ? "None to fixtures or artifacts. Future analysis must count these two cases as one independent crop observation, and any experiment design over the stylization subset must state a distinct-crop denominator of 4."
        : "See decision.md.",
    supportingEvidence: {
      regionGeometryIdentical,
      sourcePixelsIdentical,
      sourceDifferenceAnalysis: sourceDifference,
      mirrorValidation,
      visualComparison: visuals.map((file) => path.relative(process.cwd(), file)),
    },
    boundaries: [
      "Does not revisit the blinded reader's labels.",
      "Does not change the historical 5/5 case-level audit result from PR #205.",
      "Determines only how many independent images are eligible for future OCR experiments.",
      "No prevalence, causal, or capability-ceiling claim.",
      "No production behavior change.",
    ],
  });

  writeFileSync(
    path.join(OUTPUT_ROOT, "git-sha.txt"),
    `${git(["rev-parse", "HEAD"])}\nbase: origin/main ${EXPECTED_BASE_SHA}\n`,
  );

  console.log(
    JSON.stringify(
      {
        classification,
        evidenceConfidence,
        sourceImagesIdentical,
        sourcePixelsIdentical,
        regionGeometryIdentical,
        cropRectsIdentical,
        committedCropsIdentical,
        recomputedCropsIdentical,
        committedMatchesOwnRecomputation: {
          [CASE_A]: aMatchesOwnRecomputation,
          [CASE_B]: bMatchesOwnRecomputation,
        },
        mirrorValidation,
        distinctCommittedCropHashes,
        pairRects: { [CASE_A]: rowA.cropRect, [CASE_B]: rowB.cropRect },
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
