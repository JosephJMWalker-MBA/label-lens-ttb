import { sha256Hex } from "@/pipeline/extractor/image-integrity";

import { DEFAULT_GRID_SPEC } from "./observer-grid";
import { buildTransformRecord, ZERO_PADDING } from "./observer-grid-transform";
import type { GridSpec, ObserverDerivative } from "./observer-grid.types";
import { OBSERVER_DERIVATIVE_MEDIA_TYPE } from "./observer-grid.types";

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
}

function cellFontSize(width: number, height: number) {
  return Math.max(10, Math.round(Math.min(width / 28, height / 18)));
}

function encodeSourceDataUrl(sourceBytes: Uint8Array, sourceMediaType: string) {
  return `data:${sourceMediaType};base64,${Buffer.from(sourceBytes).toString("base64")}`;
}

export function renderObserverGridSvg(args: {
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  gridSpec?: GridSpec;
}) {
  const gridSpec = args.gridSpec ?? DEFAULT_GRID_SPEC;
  const cellWidth = args.sourceWidth / gridSpec.columns;
  const cellHeight = args.sourceHeight / gridSpec.rows;
  const fontSize = cellFontSize(args.sourceWidth, args.sourceHeight);
  const dataUrl = encodeSourceDataUrl(args.sourceBytes, args.sourceMediaType);

  const verticalLines = Array.from({ length: gridSpec.columns + 1 }, (_, index) => {
    const x = formatNumber(index * cellWidth);
    return `<line x1="${x}" y1="0" x2="${x}" y2="${args.sourceHeight}" stroke="#00E5FF" stroke-width="1.5" />`;
  }).join("");

  const horizontalLines = Array.from({ length: gridSpec.rows + 1 }, (_, index) => {
    const y = formatNumber(index * cellHeight);
    return `<line x1="0" y1="${y}" x2="${args.sourceWidth}" y2="${y}" stroke="#00E5FF" stroke-width="1.5" />`;
  }).join("");

  const labels = gridSpec.rowLabels
    .flatMap((row, rowIndex) =>
      gridSpec.columnLabels.map((column, columnIndex) => {
        const x = formatNumber(columnIndex * cellWidth + 6);
        const y = formatNumber(rowIndex * cellHeight + fontSize + 4);
        return `<text x="${x}" y="${y}" fill="#FFFFFF" font-family="monospace" font-size="${fontSize}" stroke="#000000" stroke-width="0.75" paint-order="stroke">${column}${row}</text>`;
      }),
    )
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${args.sourceWidth}" height="${args.sourceHeight}" viewBox="0 0 ${args.sourceWidth} ${args.sourceHeight}">`,
    `<image href="${dataUrl}" x="0" y="0" width="${args.sourceWidth}" height="${args.sourceHeight}" preserveAspectRatio="none" />`,
    `<rect x="0" y="0" width="${args.sourceWidth}" height="${args.sourceHeight}" fill="none" stroke="#00E5FF" stroke-width="2" />`,
    verticalLines,
    horizontalLines,
    labels,
    `</svg>`,
  ].join("");
}

export function createObserverDerivative(args: {
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  gridSpec?: GridSpec;
}): ObserverDerivative {
  const gridSpec = args.gridSpec ?? DEFAULT_GRID_SPEC;
  return {
    gridSpec,
    mediaType: OBSERVER_DERIVATIVE_MEDIA_TYPE,
    width: args.sourceWidth,
    height: args.sourceHeight,
    sourceMediaType: args.sourceMediaType,
    sourceSha256: sha256Hex(args.sourceBytes),
    svg: renderObserverGridSvg(args),
    transform: buildTransformRecord(gridSpec, args.sourceWidth, args.sourceHeight, ZERO_PADDING),
  };
}
