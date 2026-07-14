import { err, ok, type Result } from "@/shared/result";

import { gridCellRange } from "./observer-grid";
import {
  validateCanonicalRegionProposal,
  validateObserverDerivative,
  validateObserverRegionProposal,
} from "./observer-grid.schema";
import type {
  CanonicalRegionProposal,
  GridSpec,
  ObserverDerivative,
  ObserverGuardError,
  ObserverRegionProposal,
} from "./observer-grid.types";

function fail(message: string, issues: string[]): Result<never, ObserverGuardError> {
  return err({ code: "INVALID_CONTRACT", message, issues });
}

export function guardObserverDerivativeContract(
  derivative: ObserverDerivative,
): Result<ObserverDerivative, ObserverGuardError> {
  const validated = validateObserverDerivative(derivative);
  if (!validated.ok) return fail(validated.error.message, validated.error.issues);
  const issues: string[] = [];
  if (derivative.gridSpec.sourceCrop !== "none") {
    issues.push("grid spec sourceCrop must remain none");
  }
  if (derivative.transform.sourceCrop !== "none") {
    issues.push("transform sourceCrop must remain none");
  }
  if (derivative.width !== derivative.transform.derivativeImageWidth) {
    issues.push("derivative width must match transform.derivativeImageWidth");
  }
  if (derivative.height !== derivative.transform.derivativeImageHeight) {
    issues.push("derivative height must match transform.derivativeImageHeight");
  }
  if (derivative.transform.sourceImageWidth !== derivative.transform.derivativeImageWidth) {
    issues.push("derivative width must equal source width");
  }
  if (derivative.transform.sourceImageHeight !== derivative.transform.derivativeImageHeight) {
    issues.push("derivative height must equal source height");
  }
  if (
    Math.abs(derivative.transform.sourceAspectRatio - derivative.transform.derivativeAspectRatio) >
    1e-12
  ) {
    issues.push("source and derivative aspect ratios must remain identical");
  }
  return issues.length === 0
    ? ok(derivative)
    : fail("Observer derivative violated grid contract.", issues);
}

export function guardObserverProposalGrid(
  proposal: ObserverRegionProposal,
  spec: GridSpec,
): Result<ObserverRegionProposal, ObserverGuardError> {
  const validated = validateObserverRegionProposal(proposal);
  if (!validated.ok) return fail(validated.error.message, validated.error.issues);
  const normalizedRange = gridCellRange(proposal.gridRange.start, proposal.gridRange.end);
  if (normalizedRange.notation !== proposal.gridRange.notation) {
    return fail("Observer proposal grid range is not normalized.", [
      `expected ${normalizedRange.notation}, got ${proposal.gridRange.notation}`,
    ]);
  }
  if (
    proposal.gridRange.end.columnIndex >= spec.columns ||
    proposal.gridRange.end.rowIndex >= spec.rows
  ) {
    return fail("Observer proposal grid range exceeds the configured grid.", [
      `proposal ${proposal.gridRange.notation} exceeds ${spec.columns}x${spec.rows}`,
    ]);
  }
  return ok(proposal);
}

export function guardCanonicalProposal(
  proposal: CanonicalRegionProposal,
): Result<CanonicalRegionProposal, ObserverGuardError> {
  const validated = validateCanonicalRegionProposal(proposal);
  if (!validated.ok) return fail(validated.error.message, validated.error.issues);
  return ok(proposal);
}
