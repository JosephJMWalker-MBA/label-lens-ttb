import { err, ok, type Result } from "@/shared/result";

import { gridCellRange } from "./observer-grid";
import {
  validateCanonicalRegionProposal,
  validateObserverDerivative,
  validateObserverRegionProposal,
  validateVisionObserverResult,
} from "./observer-grid.schema";
import { normalizedBoxContains } from "./observer-grid-transform";
import type {
  CanonicalRegionProposal,
  GridSpec,
  ObserverDerivative,
  ObserverGuardError,
  ObserverRegionProposal,
  OcrInspectionHandoff,
  PixelBox,
  VisionObserverResult,
} from "./observer-grid.types";

function fail(message: string, issues: string[]): Result<never, ObserverGuardError> {
  return err({ code: "INVALID_CONTRACT", message, issues });
}

function samePixelBox(left: PixelBox, right: PixelBox) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.imageWidth === right.imageWidth &&
    left.imageHeight === right.imageHeight
  );
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
  if (derivative.width !== derivative.transform.observationFrameWidth) {
    issues.push("overlay width must match transform.observationFrameWidth");
  }
  if (derivative.height !== derivative.transform.observationFrameHeight) {
    issues.push("overlay height must match transform.observationFrameHeight");
  }
  if (derivative.rotation !== 0) {
    issues.push("overlay derivative rotation must remain 0");
  }
  if (derivative.sourceArtifactPath === derivative.overlayArtifactPath) {
    issues.push("source and overlay artifact paths must be distinct");
  }
  if (derivative.sourceSha256 === derivative.overlaySha256) {
    issues.push("source and overlay digests must be distinct");
  }

  return issues.length === 0
    ? ok(derivative)
    : fail("Observer derivative violated the source-overlay contract.", issues);
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

export function guardVisionObserverResultContract(args: {
  result: VisionObserverResult;
  expectedObservationRunId: string;
}): Result<VisionObserverResult, ObserverGuardError> {
  const validated = validateVisionObserverResult(args.result);
  if (!validated.ok) return fail(validated.error.message, validated.error.issues);
  if (args.result.observationRunId !== args.expectedObservationRunId) {
    return fail("Observer result carried the wrong observationRunId.", [
      `expected ${args.expectedObservationRunId}, got ${args.result.observationRunId}`,
    ]);
  }
  return ok(args.result);
}

export function guardOcrInspectionHandoff(args: {
  handoff: OcrInspectionHandoff;
  derivative: ObserverDerivative;
  inspectionPixelBox: PixelBox;
}): Result<OcrInspectionHandoff, ObserverGuardError> {
  const issues: string[] = [];
  if (args.handoff.sourceArtifactRef !== args.derivative.sourceArtifactPath) {
    issues.push("OCR handoff must reference the original source artifact");
  }
  if (args.handoff.sourceImageSha256 !== args.derivative.sourceSha256) {
    issues.push("OCR handoff must reference the original source digest");
  }
  if (!samePixelBox(args.handoff.originalPixelRegion, args.inspectionPixelBox)) {
    issues.push("OCR handoff originalPixelRegion must equal the inspection pixel region");
  }
  if (args.handoff.overlayArtifactPathRejected !== args.derivative.overlayArtifactPath) {
    issues.push("OCR handoff must explicitly reject the overlay artifact path");
  }
  if (args.handoff.overlaySha256Rejected !== args.derivative.overlaySha256) {
    issues.push("OCR handoff must explicitly reject the overlay digest");
  }
  if (args.handoff.sourceArtifactRef === args.derivative.overlayArtifactPath) {
    issues.push("OCR handoff cannot hand off the overlay artifact");
  }
  if (args.handoff.sourceImageSha256 === args.derivative.overlaySha256) {
    issues.push("OCR handoff cannot hand off the overlay digest");
  }

  return issues.length === 0
    ? ok(args.handoff)
    : fail("OCR inspection handoff violated the original-source-only contract.", issues);
}

export function guardCanonicalProposal(args: {
  proposal: CanonicalRegionProposal;
  derivative: ObserverDerivative;
}): Result<CanonicalRegionProposal, ObserverGuardError> {
  const validated = validateCanonicalRegionProposal(args.proposal);
  if (!validated.ok) return fail(validated.error.message, validated.error.issues);

  const issues: string[] = [];
  if (args.proposal.transform.coarseGridRange !== args.proposal.gridRange.notation) {
    issues.push("transform coarseGridRange must match proposal.gridRange");
  }
  if (
    args.proposal.transform.refinementGridRange !==
    (args.proposal.localRefinement?.range.notation ?? null)
  ) {
    issues.push("transform refinementGridRange must match proposal.localRefinement");
  }
  if (
    !normalizedBoxContains(
      args.proposal.ocrInspectionRegion.normalizedBox,
      args.proposal.proposedRegion.normalizedBox,
    )
  ) {
    issues.push("inspection region must contain the proposed region");
  }
  if (
    args.proposal.haloPolicy.actualPadding.top >
      args.proposal.haloPolicy.requestedPadding.top + Number.EPSILON ||
    args.proposal.haloPolicy.actualPadding.right >
      args.proposal.haloPolicy.requestedPadding.right + Number.EPSILON ||
    args.proposal.haloPolicy.actualPadding.bottom >
      args.proposal.haloPolicy.requestedPadding.bottom + Number.EPSILON ||
    args.proposal.haloPolicy.actualPadding.left >
      args.proposal.haloPolicy.requestedPadding.left + Number.EPSILON
  ) {
    issues.push("actual halo padding cannot exceed requested halo padding");
  }

  const handoffGuard = guardOcrInspectionHandoff({
    handoff: args.proposal.ocrHandoff,
    derivative: args.derivative,
    inspectionPixelBox: args.proposal.ocrInspectionRegion.pixelBox,
  });
  if (!handoffGuard.ok) {
    issues.push(...handoffGuard.error.issues);
  }

  return issues.length === 0
    ? ok(args.proposal)
    : fail("Canonical observer proposal violated the evaluation contract.", issues);
}
