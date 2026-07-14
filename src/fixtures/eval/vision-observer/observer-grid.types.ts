export const OBSERVER_GRID_SCHEMA_VERSION = "observer-grid.v1" as const;
export const OBSERVER_DERIVATIVE_MEDIA_TYPE = "image/svg+xml" as const;

export const OBSERVER_GRID_COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
export const OBSERVER_GRID_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const OBSERVER_FIELDS = ["brand", "alcohol"] as const;

export type GridColumn = (typeof OBSERVER_GRID_COLUMNS)[number];
export type GridRow = (typeof OBSERVER_GRID_ROWS)[number];
export type ObserverFieldKey = (typeof OBSERVER_FIELDS)[number];

export interface GridSpec {
  schemaVersion: typeof OBSERVER_GRID_SCHEMA_VERSION;
  columns: 10;
  rows: 10;
  columnLabels: readonly GridColumn[];
  rowLabels: readonly GridRow[];
  origin: "top-left";
  cellRangeNotation: "inclusive";
  sourceCrop: "none";
  aspectRatioPolicy: "preserve-source";
}

export interface GridCell {
  column: GridColumn;
  row: GridRow;
  columnIndex: number;
  rowIndex: number;
  id: string;
}

export interface GridCellRange {
  start: GridCell;
  end: GridCell;
  notation: string;
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}

export interface PaddingSpec {
  xCells: number;
  yCells: number;
  clampToImage: boolean;
}

export interface TransformRecord {
  schemaVersion: typeof OBSERVER_GRID_SCHEMA_VERSION;
  mapping: "grid-cells-to-original-image";
  sourceImageWidth: number;
  sourceImageHeight: number;
  derivativeImageWidth: number;
  derivativeImageHeight: number;
  sourceCrop: "none";
  overlayDeterministic: true;
  sourceAspectRatio: number;
  derivativeAspectRatio: number;
  padding: PaddingSpec;
}

export interface ObserverDerivative {
  gridSpec: GridSpec;
  mediaType: typeof OBSERVER_DERIVATIVE_MEDIA_TYPE;
  width: number;
  height: number;
  sourceMediaType: string;
  sourceSha256: string;
  svg: string;
  transform: TransformRecord;
}

export interface ObserverRegionProposal {
  observerId: string;
  proposalId: string;
  field: ObserverFieldKey;
  gridRange: GridCellRange;
  rationale: string;
}

export interface CanonicalRegionProposal extends ObserverRegionProposal {
  normalizedBox: NormalizedBox;
  pixelBox: PixelBox;
  transform: TransformRecord;
}

export type ObserverGridValidationErrorCode = "INVALID_SHAPE";

export interface ObserverGridValidationError {
  code: ObserverGridValidationErrorCode;
  message: string;
  issues: string[];
}

export type ObserverGuardErrorCode = "INVALID_CONTRACT";

export interface ObserverGuardError {
  code: ObserverGuardErrorCode;
  message: string;
  issues: string[];
}

export type ObserverAdapterErrorCode =
  "INVALID_DERIVATIVE" | "INVALID_PROPOSAL" | "INVALID_CANONICAL_PROPOSAL";

export interface ObserverAdapterError {
  code: ObserverAdapterErrorCode;
  message: string;
  issues: string[];
}
