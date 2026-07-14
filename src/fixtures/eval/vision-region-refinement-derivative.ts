import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp, { type Metadata } from "sharp";

import { err, ok, type Result } from "@/shared/result";

import { DEFAULT_REFINEMENT_GRID_SPEC } from "./vision-observer/observer-grid";
import { buildHaloPolicy, normalizedToPixelBox } from "./vision-observer/observer-grid-transform";
import { validateNormalizedBox } from "./vision-observer/observer-grid.schema";
import type {
  NormalizedBox,
  ObserverAdapterError,
  ObserverAdapterErrorCode,
  PixelBox,
  RefinementCellRange,
  RefinementGridSpec,
} from "./vision-observer/observer-grid.types";

export const VISION_REGION_REFINEMENT_PADDING_RATIO = 0.08;

export interface VisionRegionRefinementDerivative {
  gridSpec: RefinementGridSpec;
  mediaType: "image/png";
  width: number;
  height: number;
  sourceMediaType: "image/png";
  sourceSha256: string;
  overlaySha256: string;
  sourceArtifactPath: string;
  overlayArtifactPath: string;
  workspaceDir: string;
  cropNormalizedBox: NormalizedBox;
  cropPixelBox: PixelBox;
  paddingRatio: number;
}

function sha256Hex(bytes: Uint8Array | Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(
  code: ObserverAdapterErrorCode,
  message: string,
  issues: string[],
): Result<never, ObserverAdapterError> {
  return err({ code, message, issues });
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
}

function cellFontSize(width: number, height: number) {
  return Math.max(12, Math.round(Math.min(width / 16, height / 10)));
}

function buildOverlaySvg(width: number, height: number, gridSpec: RefinementGridSpec) {
  const cellWidth = width / gridSpec.columns;
  const cellHeight = height / gridSpec.rows;
  const fontSize = cellFontSize(width, height);

  const verticalLines = Array.from({ length: gridSpec.columns + 1 }, (_, index) => {
    const x = formatNumber(index * cellWidth);
    return `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#00E5FF" stroke-width="1.5" />`;
  }).join("");

  const horizontalLines = Array.from({ length: gridSpec.rows + 1 }, (_, index) => {
    const y = formatNumber(index * cellHeight);
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#00E5FF" stroke-width="1.5" />`;
  }).join("");

  const labels = gridSpec.rowLabels
    .flatMap((row, rowIndex) =>
      gridSpec.columnLabels.map((column, columnIndex) => {
        const x = formatNumber(columnIndex * cellWidth + 6);
        const y = formatNumber(rowIndex * cellHeight + fontSize + 4);
        return `<text x="${x}" y="${y}" fill="#FFFFFF" font-family="monospace" font-size="${fontSize}" stroke="#000000" stroke-width="0.8" paint-order="stroke">${column}${row}</text>`;
      }),
    )
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#00E5FF" stroke-width="2" />`,
    verticalLines,
    horizontalLines,
    labels,
    `</svg>`,
  ].join("");
}

function mediaTypeForSharpFormat(format: string | undefined) {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    default:
      return null;
  }
}

export function buildRefinementCropNormalizedBox(args: {
  coarseGeometry: NormalizedBox;
  paddingRatio?: number;
}): Result<NormalizedBox, ObserverAdapterError> {
  const validated = validateNormalizedBox(args.coarseGeometry);
  if (!validated.ok) {
    return fail("INVALID_PROPOSAL", validated.error.message, validated.error.issues);
  }
  const paddingRatio = args.paddingRatio ?? VISION_REGION_REFINEMENT_PADDING_RATIO;
  const halo = buildHaloPolicy(validated.value, paddingRatio);
  return ok({
    x: validated.value.x - halo.actualPadding.left,
    y: validated.value.y - halo.actualPadding.top,
    width: validated.value.width + halo.actualPadding.left + halo.actualPadding.right,
    height: validated.value.height + halo.actualPadding.top + halo.actualPadding.bottom,
  });
}

export function mapRefinementRangeToOriginalBox(args: {
  cropNormalizedBox: NormalizedBox;
  refinementRange: RefinementCellRange;
  gridSpec?: RefinementGridSpec;
}): Result<NormalizedBox, ObserverAdapterError> {
  const crop = validateNormalizedBox(args.cropNormalizedBox);
  if (!crop.ok) return fail("INVALID_PROPOSAL", crop.error.message, crop.error.issues);
  const gridSpec = args.gridSpec ?? DEFAULT_REFINEMENT_GRID_SPEC;
  const cellWidth = crop.value.width / gridSpec.columns;
  const cellHeight = crop.value.height / gridSpec.rows;
  const mapped: NormalizedBox = {
    x: crop.value.x + args.refinementRange.start.columnIndex * cellWidth,
    y: crop.value.y + args.refinementRange.start.rowIndex * cellHeight,
    width:
      (args.refinementRange.end.columnIndex + 1 - args.refinementRange.start.columnIndex) *
      cellWidth,
    height:
      (args.refinementRange.end.rowIndex + 1 - args.refinementRange.start.rowIndex) * cellHeight,
  };
  const validated = validateNormalizedBox(mapped);
  return validated.ok
    ? ok(validated.value)
    : fail("INVALID_PROPOSAL", validated.error.message, validated.error.issues);
}

export async function createVisionRegionRefinementDerivative(args: {
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  expectedSourceWidth: number;
  expectedSourceHeight: number;
  coarseGeometry: NormalizedBox;
  workspaceDir: string;
  paddingRatio?: number;
}): Promise<Result<VisionRegionRefinementDerivative, ObserverAdapterError>> {
  const cropBox = buildRefinementCropNormalizedBox({
    coarseGeometry: args.coarseGeometry,
    paddingRatio: args.paddingRatio,
  });
  if (!cropBox.ok) return cropBox;

  let metadata: Metadata;
  try {
    metadata = await sharp(Buffer.from(args.sourceBytes)).metadata();
  } catch {
    return fail("INVALID_DERIVATIVE", "Refinement source bytes could not be decoded.", [
      "sharp failed to decode the provided source bytes",
    ]);
  }

  const actualMediaType = mediaTypeForSharpFormat(metadata.format);
  if (!actualMediaType || !metadata.width || !metadata.height) {
    return fail("INVALID_DERIVATIVE", "Refinement source metadata is incomplete.", [
      `format=${metadata.format ?? "unknown"} width=${metadata.width ?? "unknown"} height=${metadata.height ?? "unknown"}`,
    ]);
  }
  if (actualMediaType !== args.sourceMediaType) {
    return fail(
      "INVALID_DERIVATIVE",
      "Supplied refinement source media type does not match decoded bytes.",
      [`supplied=${args.sourceMediaType} actual=${actualMediaType}`],
    );
  }
  if (
    metadata.width !== args.expectedSourceWidth ||
    metadata.height !== args.expectedSourceHeight
  ) {
    return fail("INVALID_DERIVATIVE", "Supplied refinement source dimensions do not match.", [
      `supplied=${args.expectedSourceWidth}x${args.expectedSourceHeight} actual=${metadata.width}x${metadata.height}`,
    ]);
  }

  const cropPixelBox = normalizedToPixelBox(cropBox.value, metadata.width, metadata.height);
  let cropBytes: Buffer;
  try {
    cropBytes = await sharp(Buffer.from(args.sourceBytes))
      .extract({
        left: cropPixelBox.x,
        top: cropPixelBox.y,
        width: cropPixelBox.width,
        height: cropPixelBox.height,
      })
      .png({ compressionLevel: 9, adaptiveFiltering: false, progressive: false })
      .toBuffer();
  } catch (error) {
    return fail("INVALID_DERIVATIVE", "Failed to crop the refinement source image.", [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  const overlaySvg = buildOverlaySvg(
    cropPixelBox.width,
    cropPixelBox.height,
    DEFAULT_REFINEMENT_GRID_SPEC,
  );
  let overlayBytes: Buffer;
  try {
    overlayBytes = await sharp(Buffer.from(cropBytes))
      .composite([{ input: Buffer.from(overlaySvg), blend: "over" }])
      .png({ compressionLevel: 9, adaptiveFiltering: false, progressive: false })
      .toBuffer();
  } catch (error) {
    return fail("INVALID_DERIVATIVE", "Failed to render the refinement overlay raster.", [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  const sourceArtifactPath = join(args.workspaceDir, "refinement-source.png");
  const overlayArtifactPath = join(args.workspaceDir, "refinement-overlay.png");
  await writeFile(sourceArtifactPath, cropBytes);
  await writeFile(overlayArtifactPath, overlayBytes);

  return ok({
    gridSpec: DEFAULT_REFINEMENT_GRID_SPEC,
    mediaType: "image/png",
    width: cropPixelBox.width,
    height: cropPixelBox.height,
    sourceMediaType: "image/png",
    sourceSha256: sha256Hex(cropBytes),
    overlaySha256: sha256Hex(overlayBytes),
    sourceArtifactPath,
    overlayArtifactPath,
    workspaceDir: args.workspaceDir,
    cropNormalizedBox: cropBox.value,
    cropPixelBox,
    paddingRatio: args.paddingRatio ?? VISION_REGION_REFINEMENT_PADDING_RATIO,
  });
}
