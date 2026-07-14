import { err, ok, type Result } from "@/shared/result";

import {
  DEFAULT_GRID_SPEC,
  DEFAULT_REFINEMENT_GRID_SPEC,
  gridCellRange,
  refinementCellRange,
} from "./observer-grid";
import { validateNormalizedBox } from "./observer-grid.schema";
import type {
  GridCellRange,
  GridSpec,
  HaloPolicyRecord,
  LocalRefinementSelection,
  NormalizedBox,
  ObservationRotation,
  ObserverAdapterError,
  PaddingSpec,
  PixelBox,
  RefinementCellRange,
  RefinementGridSpec,
  RegionGeometry,
  TransformRecord,
} from "./observer-grid.types";
import { OBSERVER_GRID_SCHEMA_VERSION, OBSERVER_HALO_POLICY_ID } from "./observer-grid.types";

const DEFAULT_HALO_RATIO = 0.04;

interface EdgeBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function fail(
  code: ObserverAdapterError["code"],
  message: string,
  issues: string[],
): Result<never, ObserverAdapterError> {
  return err({ code, message, issues });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function edges(box: NormalizedBox | PixelBox): EdgeBox {
  return { x0: box.x, y0: box.y, x1: box.x + box.width, y1: box.y + box.height };
}

function pixelBoxFromEdges(box: EdgeBox, imageWidth: number, imageHeight: number): PixelBox {
  const x = clamp(Math.floor(box.x0), 0, Math.max(0, imageWidth - 1));
  const y = clamp(Math.floor(box.y0), 0, Math.max(0, imageHeight - 1));
  const x1 = clamp(Math.ceil(box.x1), x + 1, imageWidth);
  const y1 = clamp(Math.ceil(box.y1), y + 1, imageHeight);
  return { x, y, width: x1 - x, height: y1 - y, imageWidth, imageHeight };
}

function normalizeBox(box: NormalizedBox): Result<NormalizedBox, ObserverAdapterError> {
  const validated = validateNormalizedBox(box);
  return validated.ok
    ? ok(validated.value)
    : fail("INVALID_PROPOSAL", validated.error.message, validated.error.issues);
}

export function buildZeroPadding(): PaddingSpec {
  return { unit: "normalized", top: 0, right: 0, bottom: 0, left: 0, clampToImage: true };
}

export const ZERO_PADDING = Object.freeze(buildZeroPadding());

export function buildHaloPolicy(
  proposedRegion: NormalizedBox,
  paddingRatio = DEFAULT_HALO_RATIO,
): HaloPolicyRecord {
  const requested = {
    unit: "normalized" as const,
    top: proposedRegion.height * paddingRatio,
    right: proposedRegion.width * paddingRatio,
    bottom: proposedRegion.height * paddingRatio,
    left: proposedRegion.width * paddingRatio,
    clampToImage: true as const,
  };
  const actual = {
    unit: "normalized" as const,
    top: Math.min(requested.top, proposedRegion.y),
    right: Math.min(requested.right, 1 - (proposedRegion.x + proposedRegion.width)),
    bottom: Math.min(requested.bottom, 1 - (proposedRegion.y + proposedRegion.height)),
    left: Math.min(requested.left, proposedRegion.x),
    clampToImage: true as const,
  };
  return {
    paddingPolicyId: OBSERVER_HALO_POLICY_ID,
    paddingRatio,
    requestedPadding: requested,
    actualPadding: actual,
  };
}

export function unionNormalizedBoxes(boxes: readonly NormalizedBox[]): NormalizedBox {
  if (boxes.length === 0) throw new Error("cannot union zero normalized boxes");
  const x0 = Math.min(...boxes.map((box) => box.x));
  const y0 = Math.min(...boxes.map((box) => box.y));
  const x1 = Math.max(...boxes.map((box) => box.x + box.width));
  const y1 = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function observationFrameSize(
  sourceWidth: number,
  sourceHeight: number,
  rotation: ObservationRotation,
) {
  return rotation === 90 || rotation === 270
    ? { width: sourceHeight, height: sourceWidth }
    : { width: sourceWidth, height: sourceHeight };
}

export function gridCellRangeToNormalizedBox(
  range: GridCellRange,
  spec: GridSpec = DEFAULT_GRID_SPEC,
): NormalizedBox {
  const normalized = gridCellRange(range.start, range.end);
  return {
    x: normalized.start.columnIndex / spec.columns,
    y: normalized.start.rowIndex / spec.rows,
    width: (normalized.end.columnIndex + 1 - normalized.start.columnIndex) / spec.columns,
    height: (normalized.end.rowIndex + 1 - normalized.start.rowIndex) / spec.rows,
  };
}

export function normalizedBoxToGridCellRange(
  box: NormalizedBox,
  spec: GridSpec = DEFAULT_GRID_SPEC,
): Result<GridCellRange, ObserverAdapterError> {
  const valid = normalizeBox(box);
  if (!valid.ok) return valid;
  const startColumn = Math.floor(valid.value.x * spec.columns);
  const startRow = Math.floor(valid.value.y * spec.rows);
  const endColumn = Math.ceil((valid.value.x + valid.value.width) * spec.columns) - 1;
  const endRow = Math.ceil((valid.value.y + valid.value.height) * spec.rows) - 1;
  return ok(
    gridCellRange(
      {
        column: spec.columnLabels[startColumn]!,
        row: spec.rowLabels[startRow]!,
        columnIndex: startColumn,
        rowIndex: startRow,
        id: `${spec.columnLabels[startColumn]}${spec.rowLabels[startRow]}`,
      },
      {
        column: spec.columnLabels[endColumn]!,
        row: spec.rowLabels[endRow]!,
        columnIndex: endColumn,
        rowIndex: endRow,
        id: `${spec.columnLabels[endColumn]}${spec.rowLabels[endRow]}`,
      },
    ),
  );
}

export function refinementRangeToNormalizedBox(
  coarseRange: GridCellRange,
  refinementRange: RefinementCellRange,
  coarseSpec: GridSpec = DEFAULT_GRID_SPEC,
  refinementSpec: RefinementGridSpec = DEFAULT_REFINEMENT_GRID_SPEC,
): NormalizedBox {
  const coarseBox = gridCellRangeToNormalizedBox(coarseRange, coarseSpec);
  const cellWidth = coarseBox.width / refinementSpec.columns;
  const cellHeight = coarseBox.height / refinementSpec.rows;
  return {
    x: coarseBox.x + refinementRange.start.columnIndex * cellWidth,
    y: coarseBox.y + refinementRange.start.rowIndex * cellHeight,
    width: (refinementRange.end.columnIndex + 1 - refinementRange.start.columnIndex) * cellWidth,
    height: (refinementRange.end.rowIndex + 1 - refinementRange.start.rowIndex) * cellHeight,
  };
}

export function normalizedBoxToRefinementRange(args: {
  box: NormalizedBox;
  coarseRange: GridCellRange;
  coarseSpec?: GridSpec;
  refinementSpec?: RefinementGridSpec;
}): Result<RefinementCellRange, ObserverAdapterError> {
  const valid = normalizeBox(args.box);
  if (!valid.ok) return valid;
  const coarseSpec = args.coarseSpec ?? DEFAULT_GRID_SPEC;
  const refinementSpec = args.refinementSpec ?? DEFAULT_REFINEMENT_GRID_SPEC;
  const coarseBox = gridCellRangeToNormalizedBox(args.coarseRange, coarseSpec);
  const within =
    valid.value.x >= coarseBox.x - Number.EPSILON &&
    valid.value.y >= coarseBox.y - Number.EPSILON &&
    valid.value.x + valid.value.width <= coarseBox.x + coarseBox.width + Number.EPSILON &&
    valid.value.y + valid.value.height <= coarseBox.y + coarseBox.height + Number.EPSILON;
  if (!within) {
    return fail("INVALID_PROPOSAL", "Normalized box is outside the coarse proposal frame.", []);
  }
  const relativeX0 = (valid.value.x - coarseBox.x) / coarseBox.width;
  const relativeY0 = (valid.value.y - coarseBox.y) / coarseBox.height;
  const relativeX1 = (valid.value.x + valid.value.width - coarseBox.x) / coarseBox.width;
  const relativeY1 = (valid.value.y + valid.value.height - coarseBox.y) / coarseBox.height;
  const startColumn = Math.floor(relativeX0 * refinementSpec.columns);
  const startRow = Math.floor(relativeY0 * refinementSpec.rows);
  const endColumn = Math.ceil(relativeX1 * refinementSpec.columns) - 1;
  const endRow = Math.ceil(relativeY1 * refinementSpec.rows) - 1;
  return ok(
    refinementCellRange(
      {
        column: refinementSpec.columnLabels[startColumn]!,
        row: refinementSpec.rowLabels[startRow]!,
        columnIndex: startColumn,
        rowIndex: startRow,
        id: `${refinementSpec.columnLabels[startColumn]}${refinementSpec.rowLabels[startRow]}`,
      },
      {
        column: refinementSpec.columnLabels[endColumn]!,
        row: refinementSpec.rowLabels[endRow]!,
        columnIndex: endColumn,
        rowIndex: endRow,
        id: `${refinementSpec.columnLabels[endColumn]}${refinementSpec.rowLabels[endRow]}`,
      },
    ),
  );
}

export function normalizedToPixelBox(
  box: NormalizedBox,
  imageWidth: number,
  imageHeight: number,
): PixelBox {
  const x0 = box.x * imageWidth;
  const y0 = box.y * imageHeight;
  const x1 = (box.x + box.width) * imageWidth;
  const y1 = (box.y + box.height) * imageHeight;
  return pixelBoxFromEdges({ x0, y0, x1, y1 }, imageWidth, imageHeight);
}

function inverseRotatePoint(
  x: number,
  y: number,
  rotation: ObservationRotation,
  sourceWidth: number,
  sourceHeight: number,
) {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      return { x: y, y: sourceHeight - x };
    case 180:
      return { x: sourceWidth - x, y: sourceHeight - y };
    case 270:
      return { x: sourceWidth - y, y: x };
  }
}

function rotatePoint(
  x: number,
  y: number,
  rotation: ObservationRotation,
  sourceWidth: number,
  sourceHeight: number,
) {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      return { x: sourceHeight - y, y: x };
    case 180:
      return { x: sourceWidth - x, y: sourceHeight - y };
    case 270:
      return { x: y, y: sourceWidth - x };
  }
}

function mapPixelEdges(
  box: EdgeBox,
  mapper: (x: number, y: number) => { x: number; y: number },
  width: number,
  height: number,
) {
  const corners = [
    mapper(box.x0, box.y0),
    mapper(box.x1, box.y0),
    mapper(box.x0, box.y1),
    mapper(box.x1, box.y1),
  ];
  return pixelBoxFromEdges(
    {
      x0: Math.min(...corners.map((corner) => corner.x)),
      y0: Math.min(...corners.map((corner) => corner.y)),
      x1: Math.max(...corners.map((corner) => corner.x)),
      y1: Math.max(...corners.map((corner) => corner.y)),
    },
    width,
    height,
  );
}

export function mapOriginalPixelBoxToObservationFrame(
  box: PixelBox,
  rotation: ObservationRotation,
): PixelBox {
  const frame = observationFrameSize(box.imageWidth, box.imageHeight, rotation);
  return mapPixelEdges(
    edges(box),
    (x, y) => rotatePoint(x, y, rotation, box.imageWidth, box.imageHeight),
    frame.width,
    frame.height,
  );
}

export function mapObservationPixelBoxToOriginalFrame(
  box: PixelBox,
  rotation: ObservationRotation,
  sourceWidth: number,
  sourceHeight: number,
): PixelBox {
  return mapPixelEdges(
    edges(box),
    (x, y) => inverseRotatePoint(x, y, rotation, sourceWidth, sourceHeight),
    sourceWidth,
    sourceHeight,
  );
}

export function mapProposalToOriginalRegion(args: {
  gridRange: GridCellRange;
  localRefinement: LocalRefinementSelection | null;
  observationRotation: ObservationRotation;
  sourceImageWidth: number;
  sourceImageHeight: number;
  gridSpec?: GridSpec;
}): Result<RegionGeometry, ObserverAdapterError> {
  const gridSpec = args.gridSpec ?? DEFAULT_GRID_SPEC;
  const observationFrame = observationFrameSize(
    args.sourceImageWidth,
    args.sourceImageHeight,
    args.observationRotation,
  );
  const observationNormalized = args.localRefinement
    ? refinementRangeToNormalizedBox(
        args.gridRange,
        args.localRefinement.range,
        gridSpec,
        args.localRefinement.gridSpec,
      )
    : gridCellRangeToNormalizedBox(args.gridRange, gridSpec);
  const observationPixel = normalizedToPixelBox(
    observationNormalized,
    observationFrame.width,
    observationFrame.height,
  );
  const originalPixel = mapObservationPixelBoxToOriginalFrame(
    observationPixel,
    args.observationRotation,
    args.sourceImageWidth,
    args.sourceImageHeight,
  );
  return ok({
    normalizedBox: {
      x: originalPixel.x / args.sourceImageWidth,
      y: originalPixel.y / args.sourceImageHeight,
      width: originalPixel.width / args.sourceImageWidth,
      height: originalPixel.height / args.sourceImageHeight,
    },
    pixelBox: originalPixel,
  });
}

export function applyHaloToRegion(
  proposedRegion: RegionGeometry,
  paddingRatio = DEFAULT_HALO_RATIO,
): { haloPolicy: HaloPolicyRecord; inspectionRegion: RegionGeometry } {
  const haloPolicy = buildHaloPolicy(proposedRegion.normalizedBox, paddingRatio);
  const inspectedNormalized = {
    x: proposedRegion.normalizedBox.x - haloPolicy.actualPadding.left,
    y: proposedRegion.normalizedBox.y - haloPolicy.actualPadding.top,
    width:
      proposedRegion.normalizedBox.width +
      haloPolicy.actualPadding.left +
      haloPolicy.actualPadding.right,
    height:
      proposedRegion.normalizedBox.height +
      haloPolicy.actualPadding.top +
      haloPolicy.actualPadding.bottom,
  };
  return {
    haloPolicy,
    inspectionRegion: {
      normalizedBox: inspectedNormalized,
      pixelBox: normalizedToPixelBox(
        inspectedNormalized,
        proposedRegion.pixelBox.imageWidth,
        proposedRegion.pixelBox.imageHeight,
      ),
    },
  };
}

export function buildTransformRecord(args: {
  gridRange: GridCellRange;
  localRefinement: LocalRefinementSelection | null;
  observationRotation: ObservationRotation;
  sourceImageWidth: number;
  sourceImageHeight: number;
}): TransformRecord {
  const observationFrame = observationFrameSize(
    args.sourceImageWidth,
    args.sourceImageHeight,
    args.observationRotation,
  );
  return {
    schemaVersion: OBSERVER_GRID_SCHEMA_VERSION,
    mapping: "observer-grid-to-original-image",
    coarseGridRange: args.gridRange.notation,
    refinementGridRange: args.localRefinement?.range.notation ?? null,
    observationRotation: args.observationRotation,
    sourceImageWidth: args.sourceImageWidth,
    sourceImageHeight: args.sourceImageHeight,
    observationFrameWidth: observationFrame.width,
    observationFrameHeight: observationFrame.height,
    sourceCrop: "none",
    overlayDeterministic: true,
  };
}

export function normalizedIntersectionArea(left: NormalizedBox, right: NormalizedBox) {
  const leftEdges = edges(left);
  const rightEdges = edges(right);
  const x0 = Math.max(leftEdges.x0, rightEdges.x0);
  const y0 = Math.max(leftEdges.y0, rightEdges.y0);
  const x1 = Math.min(leftEdges.x1, rightEdges.x1);
  const y1 = Math.min(leftEdges.y1, rightEdges.y1);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

export function normalizedBoxContains(outer: NormalizedBox, inner: NormalizedBox, epsilon = 1e-9) {
  const outerEdges = edges(outer);
  const innerEdges = edges(inner);
  return (
    outerEdges.x0 <= innerEdges.x0 + epsilon &&
    outerEdges.y0 <= innerEdges.y0 + epsilon &&
    outerEdges.x1 + epsilon >= innerEdges.x1 &&
    outerEdges.y1 + epsilon >= innerEdges.y1
  );
}

export function paddedBoxContains(outer: RegionGeometry, inner: RegionGeometry, epsilon = 1e-9) {
  return normalizedBoxContains(outer.normalizedBox, inner.normalizedBox, epsilon);
}
