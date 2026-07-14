import type {
  GridCell,
  GridCellRange,
  GridColumn,
  GridRow,
  GridSpec,
  RefinementCell,
  RefinementCellRange,
  RefinementColumn,
  RefinementGridSpec,
  RefinementRow,
} from "./observer-grid.types";
import {
  OBSERVER_GRID_COLUMNS,
  OBSERVER_GRID_ROWS,
  OBSERVER_GRID_SCHEMA_VERSION,
  OBSERVER_REFINEMENT_COLUMNS,
  OBSERVER_REFINEMENT_ROWS,
} from "./observer-grid.types";

const GRID_COLUMN_INDEX = new Map(OBSERVER_GRID_COLUMNS.map((label, index) => [label, index]));
const GRID_ROW_INDEX = new Map(OBSERVER_GRID_ROWS.map((label, index) => [label, index]));
const REFINEMENT_COLUMN_INDEX = new Map(
  OBSERVER_REFINEMENT_COLUMNS.map((label, index) => [label, index]),
);
const REFINEMENT_ROW_INDEX = new Map(
  OBSERVER_REFINEMENT_ROWS.map((label, index) => [label, index]),
);

export const DEFAULT_GRID_SPEC: GridSpec = Object.freeze({
  schemaVersion: OBSERVER_GRID_SCHEMA_VERSION,
  columns: 10,
  rows: 10,
  columnLabels: OBSERVER_GRID_COLUMNS,
  rowLabels: OBSERVER_GRID_ROWS,
  origin: "top-left",
  cellRangeNotation: "inclusive",
  sourceCrop: "none",
  aspectRatioPolicy: "preserve-source",
});

export const DEFAULT_REFINEMENT_GRID_SPEC: RefinementGridSpec = Object.freeze({
  schemaVersion: OBSERVER_GRID_SCHEMA_VERSION,
  columns: 5,
  rows: 5,
  columnLabels: OBSERVER_REFINEMENT_COLUMNS,
  rowLabels: OBSERVER_REFINEMENT_ROWS,
  origin: "top-left",
  cellRangeNotation: "inclusive",
  sourceCrop: "none",
  parentFrame: "coarse-proposal",
});

export function gridCellId(column: GridColumn, row: GridRow) {
  return `${column}${row}`;
}

export function refinementCellId(column: RefinementColumn, row: RefinementRow) {
  return `${column}${row}`;
}

export function gridColumnAtIndex(index: number): GridColumn {
  const label = OBSERVER_GRID_COLUMNS.at(index);
  if (!label) throw new Error(`grid column index ${index} is outside the coarse grid`);
  return label;
}

export function gridRowAtIndex(index: number): GridRow {
  const row = OBSERVER_GRID_ROWS.at(index);
  if (row === undefined) throw new Error(`grid row index ${index} is outside the coarse grid`);
  return row;
}

export function refinementColumnAtIndex(index: number): RefinementColumn {
  const label = OBSERVER_REFINEMENT_COLUMNS.at(index);
  if (!label) throw new Error(`refinement column index ${index} is outside the local grid`);
  return label;
}

export function refinementRowAtIndex(index: number): RefinementRow {
  const row = OBSERVER_REFINEMENT_ROWS.at(index);
  if (row === undefined) throw new Error(`refinement row index ${index} is outside the local grid`);
  return row;
}

export function gridCell(column: GridColumn, row: GridRow): GridCell {
  const columnIndex = GRID_COLUMN_INDEX.get(column);
  const rowIndex = GRID_ROW_INDEX.get(row);
  if (columnIndex === undefined || rowIndex === undefined) {
    throw new Error(`unknown coarse grid cell ${column}${row}`);
  }
  return { column, row, columnIndex, rowIndex, id: gridCellId(column, row) };
}

export function refinementCell(column: RefinementColumn, row: RefinementRow): RefinementCell {
  const columnIndex = REFINEMENT_COLUMN_INDEX.get(column);
  const rowIndex = REFINEMENT_ROW_INDEX.get(row);
  if (columnIndex === undefined || rowIndex === undefined) {
    throw new Error(`unknown refinement grid cell ${column}${row}`);
  }
  return { column, row, columnIndex, rowIndex, id: refinementCellId(column, row) };
}

export function normalizeGridCellRange(start: GridCell, end: GridCell): [GridCell, GridCell] {
  return [
    gridCell(
      gridColumnAtIndex(Math.min(start.columnIndex, end.columnIndex)),
      gridRowAtIndex(Math.min(start.rowIndex, end.rowIndex)),
    ),
    gridCell(
      gridColumnAtIndex(Math.max(start.columnIndex, end.columnIndex)),
      gridRowAtIndex(Math.max(start.rowIndex, end.rowIndex)),
    ),
  ];
}

export function normalizeRefinementCellRange(
  start: RefinementCell,
  end: RefinementCell,
): [RefinementCell, RefinementCell] {
  return [
    refinementCell(
      refinementColumnAtIndex(Math.min(start.columnIndex, end.columnIndex)),
      refinementRowAtIndex(Math.min(start.rowIndex, end.rowIndex)),
    ),
    refinementCell(
      refinementColumnAtIndex(Math.max(start.columnIndex, end.columnIndex)),
      refinementRowAtIndex(Math.max(start.rowIndex, end.rowIndex)),
    ),
  ];
}

export function gridCellRange(start: GridCell, end: GridCell): GridCellRange {
  const [normalizedStart, normalizedEnd] = normalizeGridCellRange(start, end);
  return {
    start: normalizedStart,
    end: normalizedEnd,
    notation:
      normalizedStart.id === normalizedEnd.id
        ? normalizedStart.id
        : `${normalizedStart.id}:${normalizedEnd.id}`,
  };
}

export function refinementCellRange(
  start: RefinementCell,
  end: RefinementCell,
): RefinementCellRange {
  const [normalizedStart, normalizedEnd] = normalizeRefinementCellRange(start, end);
  return {
    start: normalizedStart,
    end: normalizedEnd,
    notation:
      normalizedStart.id === normalizedEnd.id
        ? normalizedStart.id
        : `${normalizedStart.id}:${normalizedEnd.id}`,
  };
}

export function parseGridCell(value: string): GridCell {
  const match = /^([A-J])(10|[1-9])$/.exec(value.trim());
  if (!match) throw new Error(`invalid coarse grid cell "${value}"`);
  return gridCell(match[1] as GridColumn, Number(match[2]) as GridRow);
}

export function parseRefinementCell(value: string): RefinementCell {
  const match = /^([A-E])([1-5])$/.exec(value.trim());
  if (!match) throw new Error(`invalid refinement grid cell "${value}"`);
  return refinementCell(match[1] as RefinementColumn, Number(match[2]) as RefinementRow);
}

export function parseGridCellRange(value: string): GridCellRange {
  const [left, right] = value.trim().split(":");
  if (!left || !right) return gridCellRange(parseGridCell(value), parseGridCell(value));
  return gridCellRange(parseGridCell(left), parseGridCell(right));
}

export function parseRefinementCellRange(value: string): RefinementCellRange {
  const [left, right] = value.trim().split(":");
  if (!left || !right) {
    return refinementCellRange(parseRefinementCell(value), parseRefinementCell(value));
  }
  return refinementCellRange(parseRefinementCell(left), parseRefinementCell(right));
}

export function expandGridCellRange(range: GridCellRange): GridCell[] {
  const out: GridCell[] = [];
  for (let rowIndex = range.start.rowIndex; rowIndex <= range.end.rowIndex; rowIndex += 1) {
    for (
      let columnIndex = range.start.columnIndex;
      columnIndex <= range.end.columnIndex;
      columnIndex += 1
    ) {
      out.push(gridCell(gridColumnAtIndex(columnIndex), gridRowAtIndex(rowIndex)));
    }
  }
  return out;
}

export function expandRefinementCellRange(range: RefinementCellRange): RefinementCell[] {
  const out: RefinementCell[] = [];
  for (let rowIndex = range.start.rowIndex; rowIndex <= range.end.rowIndex; rowIndex += 1) {
    for (
      let columnIndex = range.start.columnIndex;
      columnIndex <= range.end.columnIndex;
      columnIndex += 1
    ) {
      out.push(
        refinementCell(refinementColumnAtIndex(columnIndex), refinementRowAtIndex(rowIndex)),
      );
    }
  }
  return out;
}
