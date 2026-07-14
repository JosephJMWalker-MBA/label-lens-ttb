import { gridCellRange } from "./observer-grid";
import type {
  GridCellRange,
  GridSpec,
  NormalizedBox,
  PaddingSpec,
  PixelBox,
  TransformRecord,
} from "./observer-grid.types";
import { OBSERVER_GRID_SCHEMA_VERSION } from "./observer-grid.types";

export const ZERO_PADDING: PaddingSpec = Object.freeze({
  xCells: 0,
  yCells: 0,
  clampToImage: true,
});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function boxEnd(box: NormalizedBox) {
  return { x: box.x + box.width, y: box.y + box.height };
}

export function unionNormalizedBoxes(boxes: readonly NormalizedBox[]): NormalizedBox {
  if (boxes.length === 0) throw new Error("cannot union zero normalized boxes");
  const x0 = Math.min(...boxes.map((box) => box.x));
  const y0 = Math.min(...boxes.map((box) => box.y));
  const x1 = Math.max(...boxes.map((box) => box.x + box.width));
  const y1 = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function normalizedBoxToGridCellRange(box: NormalizedBox, spec: GridSpec): GridCellRange {
  const startColumn = clamp(Math.floor(box.x * spec.columns), 0, spec.columns - 1);
  const startRow = clamp(Math.floor(box.y * spec.rows), 0, spec.rows - 1);
  const endColumn = clamp(Math.ceil((box.x + box.width) * spec.columns) - 1, 0, spec.columns - 1);
  const endRow = clamp(Math.ceil((box.y + box.height) * spec.rows) - 1, 0, spec.rows - 1);
  return gridCellRange(
    {
      column: spec.columnLabels[startColumn],
      row: spec.rowLabels[startRow],
      columnIndex: startColumn,
      rowIndex: startRow,
      id: `${spec.columnLabels[startColumn]}${spec.rowLabels[startRow]}`,
    },
    {
      column: spec.columnLabels[endColumn],
      row: spec.rowLabels[endRow],
      columnIndex: endColumn,
      rowIndex: endRow,
      id: `${spec.columnLabels[endColumn]}${spec.rowLabels[endRow]}`,
    },
  );
}

export function gridCellRangeToNormalizedBox(
  range: GridCellRange,
  spec: GridSpec,
  padding: PaddingSpec = ZERO_PADDING,
): NormalizedBox {
  const normalized = gridCellRange(range.start, range.end);
  const x0 = (normalized.start.columnIndex - padding.xCells) / spec.columns;
  const y0 = (normalized.start.rowIndex - padding.yCells) / spec.rows;
  const x1 = (normalized.end.columnIndex + 1 + padding.xCells) / spec.columns;
  const y1 = (normalized.end.rowIndex + 1 + padding.yCells) / spec.rows;
  const left = padding.clampToImage ? clamp(x0, 0, 1) : x0;
  const top = padding.clampToImage ? clamp(y0, 0, 1) : y0;
  const right = padding.clampToImage ? clamp(x1, 0, 1) : x1;
  const bottom = padding.clampToImage ? clamp(y1, 0, 1) : y1;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function normalizedToPixelBox(
  box: NormalizedBox,
  imageWidth: number,
  imageHeight: number,
): PixelBox {
  const x = clamp(Math.floor(box.x * imageWidth), 0, Math.max(0, imageWidth - 1));
  const y = clamp(Math.floor(box.y * imageHeight), 0, Math.max(0, imageHeight - 1));
  const x1 = clamp(Math.ceil((box.x + box.width) * imageWidth), x + 1, imageWidth);
  const y1 = clamp(Math.ceil((box.y + box.height) * imageHeight), y + 1, imageHeight);
  return { x, y, width: x1 - x, height: y1 - y, imageWidth, imageHeight };
}

export function gridCellRangeToPixelBox(
  range: GridCellRange,
  imageWidth: number,
  imageHeight: number,
  spec: GridSpec,
  padding: PaddingSpec = ZERO_PADDING,
): PixelBox {
  return normalizedToPixelBox(
    gridCellRangeToNormalizedBox(range, spec, padding),
    imageWidth,
    imageHeight,
  );
}

export function buildTransformRecord(
  spec: GridSpec,
  imageWidth: number,
  imageHeight: number,
  padding: PaddingSpec = ZERO_PADDING,
): TransformRecord {
  return {
    schemaVersion: OBSERVER_GRID_SCHEMA_VERSION,
    mapping: "grid-cells-to-original-image",
    sourceImageWidth: imageWidth,
    sourceImageHeight: imageHeight,
    derivativeImageWidth: imageWidth,
    derivativeImageHeight: imageHeight,
    sourceCrop: spec.sourceCrop,
    overlayDeterministic: true,
    sourceAspectRatio: imageWidth / imageHeight,
    derivativeAspectRatio: imageWidth / imageHeight,
    padding,
  };
}

export function normalizedIntersectionArea(left: NormalizedBox, right: NormalizedBox) {
  const leftEnd = boxEnd(left);
  const rightEnd = boxEnd(right);
  const x0 = Math.max(left.x, right.x);
  const y0 = Math.max(left.y, right.y);
  const x1 = Math.min(leftEnd.x, rightEnd.x);
  const y1 = Math.min(leftEnd.y, rightEnd.y);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

export function normalizedBoxContains(outer: NormalizedBox, inner: NormalizedBox, epsilon = 1e-9) {
  const outerEnd = boxEnd(outer);
  const innerEnd = boxEnd(inner);
  return (
    outer.x <= inner.x + epsilon &&
    outer.y <= inner.y + epsilon &&
    outerEnd.x + epsilon >= innerEnd.x &&
    outerEnd.y + epsilon >= innerEnd.y
  );
}
