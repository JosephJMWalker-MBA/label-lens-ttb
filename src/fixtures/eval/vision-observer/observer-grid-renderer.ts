import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp, { type Metadata } from "sharp";

import { sha256Hex } from "@/pipeline/extractor/image-integrity";
import { err, ok, type Result } from "@/shared/result";

import { DEFAULT_GRID_SPEC, parseGridCellRange } from "./observer-grid";
import { buildTransformRecord } from "./observer-grid-transform";
import type { GridSpec, ObserverDerivative, ObserverAdapterError } from "./observer-grid.types";
import { OBSERVER_OVERLAY_MEDIA_TYPE } from "./observer-grid.types";

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
}

function cellFontSize(width: number, height: number) {
  return Math.max(12, Math.round(Math.min(width / 26, height / 16)));
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

function extensionForMediaType(mediaType: string) {
  switch (mediaType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    default:
      return null;
  }
}

function fail(
  code: ObserverAdapterError["code"],
  message: string,
  issues: string[],
): Result<never, ObserverAdapterError> {
  return err({ code, message, issues });
}

function buildOverlaySvg(width: number, height: number, gridSpec: GridSpec) {
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

export async function createObserverDerivative(args: {
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  expectedSourceWidth: number;
  expectedSourceHeight: number;
  workspaceDir: string;
  gridSpec?: GridSpec;
}): Promise<Result<ObserverDerivative, ObserverAdapterError>> {
  const gridSpec = args.gridSpec ?? DEFAULT_GRID_SPEC;
  const sourceBytes = Uint8Array.from(args.sourceBytes);
  const sourceSha256 = sha256Hex(sourceBytes);
  const sourceExtension = extensionForMediaType(args.sourceMediaType);
  if (!sourceExtension) {
    return fail("INVALID_DERIVATIVE", "Observer source media type is unsupported.", [
      `sourceMediaType=${args.sourceMediaType}`,
    ]);
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(Buffer.from(sourceBytes)).metadata();
  } catch {
    return fail("INVALID_DERIVATIVE", "Observer source bytes could not be decoded.", [
      "sharp failed to decode the provided source bytes",
    ]);
  }

  const actualMediaType = mediaTypeForSharpFormat(metadata.format);
  if (!actualMediaType || !metadata.width || !metadata.height) {
    return fail("INVALID_DERIVATIVE", "Observer source metadata is incomplete or unsupported.", [
      `format=${metadata.format ?? "unknown"} width=${metadata.width ?? "unknown"} height=${metadata.height ?? "unknown"}`,
    ]);
  }

  if (actualMediaType !== args.sourceMediaType) {
    return fail("INVALID_DERIVATIVE", "Supplied source media type does not match decoded bytes.", [
      `supplied=${args.sourceMediaType} actual=${actualMediaType}`,
    ]);
  }

  if (
    metadata.width !== args.expectedSourceWidth ||
    metadata.height !== args.expectedSourceHeight
  ) {
    return fail("INVALID_DERIVATIVE", "Supplied source dimensions do not match decoded bytes.", [
      `supplied=${args.expectedSourceWidth}x${args.expectedSourceHeight} actual=${metadata.width}x${metadata.height}`,
    ]);
  }

  const overlaySvg = buildOverlaySvg(metadata.width, metadata.height, gridSpec);
  let overlayBytes: Buffer;
  try {
    overlayBytes = await sharp(Buffer.from(sourceBytes))
      .composite([{ input: Buffer.from(overlaySvg), blend: "over" }])
      .png({ compressionLevel: 9, adaptiveFiltering: false, progressive: false })
      .toBuffer();
  } catch (error) {
    return fail("INVALID_DERIVATIVE", "Failed to render the observer overlay raster.", [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  try {
    const overlayMetadata = await sharp(overlayBytes).metadata();
    if (overlayMetadata.width !== metadata.width || overlayMetadata.height !== metadata.height) {
      return fail(
        "INVALID_DERIVATIVE",
        "Rendered overlay dimensions do not match the source image.",
        [
          `overlay=${overlayMetadata.width ?? "unknown"}x${overlayMetadata.height ?? "unknown"} source=${metadata.width}x${metadata.height}`,
        ],
      );
    }
  } catch {
    return fail("INVALID_DERIVATIVE", "Rendered observer overlay could not be decoded.", [
      "sharp failed to decode the generated overlay PNG",
    ]);
  }

  const sourceArtifactPath = join(args.workspaceDir, `source-image${sourceExtension}`);
  const overlayArtifactPath = join(args.workspaceDir, "observer-overlay.png");
  await writeFile(sourceArtifactPath, sourceBytes);
  await writeFile(overlayArtifactPath, overlayBytes);

  return ok({
    gridSpec,
    rotation: 0,
    mediaType: OBSERVER_OVERLAY_MEDIA_TYPE,
    width: metadata.width,
    height: metadata.height,
    sourceMediaType: actualMediaType,
    sourceSha256,
    overlaySha256: sha256Hex(overlayBytes),
    bytes: new Uint8Array(overlayBytes),
    sourceArtifactPath,
    overlayArtifactPath,
    workspaceDir: args.workspaceDir,
    transform: buildTransformRecord({
      gridRange: parseGridCellRange("A1:J10"),
      localRefinement: null,
      observationRotation: 0,
      sourceImageWidth: metadata.width,
      sourceImageHeight: metadata.height,
    }),
  });
}
