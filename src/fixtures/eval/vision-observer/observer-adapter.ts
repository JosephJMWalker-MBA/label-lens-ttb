import { err, ok, type Result } from "@/shared/result";

import {
  applyHaloToRegion,
  buildTransformRecord,
  mapProposalToOriginalRegion,
} from "./observer-grid-transform";
import {
  guardCanonicalProposal,
  guardObserverDerivativeContract,
  guardObserverProposalGrid,
} from "./observer-guards";
import type {
  CanonicalRegionProposal,
  ObserverAdapterError,
  ObserverDerivative,
  ObserverRegionProposal,
} from "./observer-grid.types";

function fail(
  code: ObserverAdapterError["code"],
  message: string,
  issues: string[],
): Result<never, ObserverAdapterError> {
  return err({ code, message, issues });
}

export function adaptObserverProposal(args: {
  derivative: ObserverDerivative;
  proposal: ObserverRegionProposal;
}): Result<CanonicalRegionProposal, ObserverAdapterError> {
  const derivativeGuard = guardObserverDerivativeContract(args.derivative);
  if (!derivativeGuard.ok) {
    return fail("INVALID_DERIVATIVE", derivativeGuard.error.message, derivativeGuard.error.issues);
  }

  const proposalGuard = guardObserverProposalGrid(args.proposal, args.derivative.gridSpec);
  if (!proposalGuard.ok) {
    return fail("INVALID_PROPOSAL", proposalGuard.error.message, proposalGuard.error.issues);
  }

  const proposedRegion = mapProposalToOriginalRegion({
    gridRange: args.proposal.gridRange,
    localRefinement: args.proposal.localRefinement,
    observationRotation: args.proposal.observationRotation,
    sourceImageWidth: args.derivative.transform.sourceImageWidth,
    sourceImageHeight: args.derivative.transform.sourceImageHeight,
    gridSpec: args.derivative.gridSpec,
  });
  if (!proposedRegion.ok) {
    return fail("INVALID_PROPOSAL", proposedRegion.error.message, proposedRegion.error.issues);
  }

  const { haloPolicy, inspectionRegion } = applyHaloToRegion(proposedRegion.value);
  const canonical: CanonicalRegionProposal = {
    ...args.proposal,
    proposedRegion: proposedRegion.value,
    ocrInspectionRegion: inspectionRegion,
    haloPolicy,
    transform: buildTransformRecord({
      gridRange: args.proposal.gridRange,
      localRefinement: args.proposal.localRefinement,
      observationRotation: args.proposal.observationRotation,
      sourceImageWidth: args.derivative.transform.sourceImageWidth,
      sourceImageHeight: args.derivative.transform.sourceImageHeight,
    }),
    ocrHandoff: {
      sourceArtifactKind: "original-source",
      sourceArtifactRef: args.derivative.sourceArtifactPath,
      sourceImageSha256: args.derivative.sourceSha256,
      originalPixelRegion: inspectionRegion.pixelBox,
      overlayArtifactKindRejected: "observer-overlay",
      overlayArtifactPathRejected: args.derivative.overlayArtifactPath,
      overlaySha256Rejected: args.derivative.overlaySha256,
    },
  };

  const canonicalGuard = guardCanonicalProposal({
    proposal: canonical,
    derivative: args.derivative,
  });
  if (!canonicalGuard.ok) {
    const code =
      canonicalGuard.error.message.includes("OCR inspection handoff") ||
      canonicalGuard.error.issues.some((issue) => issue.includes("OCR handoff"))
        ? "INVALID_OCR_HANDOFF"
        : "INVALID_CANONICAL_PROPOSAL";
    return fail(code, canonicalGuard.error.message, canonicalGuard.error.issues);
  }

  return ok(canonical);
}

export function adaptObserverProposals(args: {
  derivative: ObserverDerivative;
  proposals: readonly ObserverRegionProposal[];
}): Result<CanonicalRegionProposal[], ObserverAdapterError> {
  const out: CanonicalRegionProposal[] = [];
  for (const proposal of args.proposals) {
    const adapted = adaptObserverProposal({
      derivative: args.derivative,
      proposal,
    });
    if (!adapted.ok) return adapted;
    out.push(adapted.value);
  }
  return ok(out);
}
