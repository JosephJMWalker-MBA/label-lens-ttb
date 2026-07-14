import type { GridCell, GridCellRange, GridColumn, GridRow, GridSpec } from "./observer-grid.types";
import {
  OBSERVER_GRID_COLUMNS,
  OBSERVER_GRID_ROWS,
  OBSERVER_GRID_SCHEMA_VERSION,
} from "./observer-grid.types";

const COLUMN_INDEX_BY_LABEL = new Map(OBSERVER_GRID_COLUMNS.map((label, index) => [label, index]));
const ROW_INDEX_BY_LABEL = new Map(OBSERVER_GRID_ROWS.map((label, index) => [label, index]));

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

export function gridColumnAtIndex(index: number): GridColumn {
  const label = OBSERVER_GRID_COLUMNS.at(index);
  if (!label) throw new Error(`column index ${index} is outside the observer grid`);
  return label;
}

export function gridRowAtIndex(index: number): GridRow {
  const row = OBSERVER_GRID_ROWS.at(index);
  if (row === undefined) throw new Error(`row index ${index} is outside the observer grid`);
  return row;
}

export function gridCellId(column: GridColumn, row: GridRow) {
  return `${column}${row}`;
}

export function gridCell(column: GridColumn, row: GridRow): GridCell {
  const columnIndex = COLUMN_INDEX_BY_LABEL.get(column);
  const rowIndex = ROW_INDEX_BY_LABEL.get(row);
  if (columnIndex === undefined || rowIndex === undefined) {
    throw new Error(`unknown grid cell ${column}${row}`);
  }
  return { column, row, columnIndex, rowIndex, id: gridCellId(column, row) };
}

export function normalizeGridCellRange(start: GridCell, end: GridCell): [GridCell, GridCell] {
  const minColumn = Math.min(start.columnIndex, end.columnIndex);
  const maxColumn = Math.max(start.columnIndex, end.columnIndex);
  const minRow = Math.min(start.rowIndex, end.rowIndex);
  const maxRow = Math.max(start.rowIndex, end.rowIndex);
  return [
    gridCell(gridColumnAtIndex(minColumn), gridRowAtIndex(minRow)),
    gridCell(gridColumnAtIndex(maxColumn), gridRowAtIndex(maxRow)),
  ];
}

export function gridCellRange(start: GridCell, end: GridCell): GridCellRange {
  const [normalizedStart, normalizedEnd] = normalizeGridCellRange(start, end);
  const notation =
    normalizedStart.id === normalizedEnd.id
      ? normalizedStart.id
      : `${normalizedStart.id}:${normalizedEnd.id}`;
  return { start: normalizedStart, end: normalizedEnd, notation };
}

export function parseGridCell(value: string): GridCell {
  const match = /^([A-J])(10|[1-9])$/.exec(value.trim());
  if (!match) throw new Error(`invalid grid cell "${value}"`);
  return gridCell(match[1] as GridColumn, Number(match[2]) as GridRow);
}

export function parseGridCellRange(value: string): GridCellRange {
  const [left, right] = value.trim().split(":");
  if (!left || !right) return gridCellRange(parseGridCell(value), parseGridCell(value));
  return gridCellRange(parseGridCell(left), parseGridCell(right));
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
