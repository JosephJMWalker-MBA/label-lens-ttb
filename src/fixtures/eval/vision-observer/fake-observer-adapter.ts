import type { IncludedEvalRecord } from "../eval-manifest.types";

import { DEFAULT_GRID_SPEC } from "./observer-grid";
import { normalizedBoxToGridCellRange, unionNormalizedBoxes } from "./observer-grid-transform";
import type {
  GridSpec,
  NormalizedBox,
  ObserverFieldKey,
  ObserverRegionProposal,
} from "./observer-grid.types";

export const FAKE_OBSERVER_ID = "fake-deterministic-observer.v1";

function cloneNormalizedBoxes(boxes: readonly NormalizedBox[]) {
  return boxes.map((box) => ({ ...box }));
}

export function fakeObserveField(args: {
  caseId: string;
  field: ObserverFieldKey;
  truthGeometry: readonly NormalizedBox[];
  gridSpec?: GridSpec;
}): ObserverRegionProposal | null {
  if (args.truthGeometry.length === 0) return null;
  const gridSpec = args.gridSpec ?? DEFAULT_GRID_SPEC;
  const union = unionNormalizedBoxes(args.truthGeometry);
  const gridRange = normalizedBoxToGridCellRange(union, gridSpec);
  return {
    observerId: FAKE_OBSERVER_ID,
    proposalId: `${args.caseId}:${args.field}:${gridRange.notation}`,
    field: args.field,
    gridRange,
    rationale: `deterministic evaluation-only bridge from ${args.truthGeometry.length} annotated box(es)`,
  };
}

export function fakeObserveIncludedRecord(
  record: IncludedEvalRecord,
  field: ObserverFieldKey,
  gridSpec: GridSpec = DEFAULT_GRID_SPEC,
): ObserverRegionProposal | null {
  if (field === "brand") {
    if (record.annotation.brand.presence !== "present") return null;
    return fakeObserveField({
      caseId: record.caseId,
      field,
      truthGeometry: cloneNormalizedBoxes(record.annotation.brand.approxGeometry),
      gridSpec,
    });
  }
  if (record.annotation.alcohol.presence !== "present") return null;
  return fakeObserveField({
    caseId: record.caseId,
    field,
    truthGeometry: cloneNormalizedBoxes(record.annotation.alcohol.approxGeometry),
    gridSpec,
  });
}
