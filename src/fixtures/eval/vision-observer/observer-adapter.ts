import { err, ok, type Result } from "@/shared/result";

import {
  buildTransformRecord,
  gridCellRangeToNormalizedBox,
  gridCellRangeToPixelBox,
  ZERO_PADDING,
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
  PaddingSpec,
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
  padding?: PaddingSpec;
}): Result<CanonicalRegionProposal, ObserverAdapterError> {
  const derivativeGuard = guardObserverDerivativeContract(args.derivative);
  if (!derivativeGuard.ok) {
    return fail("INVALID_DERIVATIVE", derivativeGuard.error.message, derivativeGuard.error.issues);
  }
  const proposalGuard = guardObserverProposalGrid(args.proposal, args.derivative.gridSpec);
  if (!proposalGuard.ok) {
    return fail("INVALID_PROPOSAL", proposalGuard.error.message, proposalGuard.error.issues);
  }

  const padding = args.padding ?? ZERO_PADDING;
  const transform = buildTransformRecord(
    args.derivative.gridSpec,
    args.derivative.transform.sourceImageWidth,
    args.derivative.transform.sourceImageHeight,
    padding,
  );
  const normalizedBox = gridCellRangeToNormalizedBox(
    args.proposal.gridRange,
    args.derivative.gridSpec,
    padding,
  );
  const pixelBox = gridCellRangeToPixelBox(
    args.proposal.gridRange,
    transform.sourceImageWidth,
    transform.sourceImageHeight,
    args.derivative.gridSpec,
    padding,
  );
  const canonical: CanonicalRegionProposal = {
    ...args.proposal,
    normalizedBox,
    pixelBox,
    transform,
  };
  const canonicalGuard = guardCanonicalProposal(canonical);
  if (!canonicalGuard.ok) {
    return fail(
      "INVALID_CANONICAL_PROPOSAL",
      canonicalGuard.error.message,
      canonicalGuard.error.issues,
    );
  }
  return ok(canonical);
}

export function adaptObserverProposals(args: {
  derivative: ObserverDerivative;
  proposals: readonly ObserverRegionProposal[];
  padding?: PaddingSpec;
}): Result<CanonicalRegionProposal[], ObserverAdapterError> {
  const out: CanonicalRegionProposal[] = [];
  for (const proposal of args.proposals) {
    const adapted = adaptObserverProposal({
      derivative: args.derivative,
      proposal,
      padding: args.padding,
    });
    if (!adapted.ok) return adapted;
    out.push(adapted.value);
  }
  return ok(out);
}
