import { ok, type Result } from "@/shared/result";

import { adaptObserverProposals } from "./observer-adapter";
import { fakeObserveField } from "./fake-observer-adapter";
import { createObserverDerivative } from "./observer-grid-renderer";
import type {
  CanonicalRegionProposal,
  GridSpec,
  NormalizedBox,
  ObserverAdapterError,
  ObserverDerivative,
  ObserverFieldKey,
  ObserverRegionProposal,
  PaddingSpec,
} from "./observer-grid.types";

export interface FakeObserverLifecycleFieldInput {
  field: ObserverFieldKey;
  truthGeometry: readonly NormalizedBox[];
}

export interface FakeObserverLifecycleResult {
  derivative: ObserverDerivative;
  observerProposals: ObserverRegionProposal[];
  canonicalProposals: CanonicalRegionProposal[];
}

export function runFakeObserverLifecycle(args: {
  caseId: string;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  fields: readonly FakeObserverLifecycleFieldInput[];
  gridSpec?: GridSpec;
  padding?: PaddingSpec;
}): Result<FakeObserverLifecycleResult, ObserverAdapterError> {
  const derivative = createObserverDerivative({
    sourceBytes: args.sourceBytes,
    sourceMediaType: args.sourceMediaType,
    sourceWidth: args.sourceWidth,
    sourceHeight: args.sourceHeight,
    gridSpec: args.gridSpec,
  });
  const observerProposals = args.fields
    .map((fieldInput) =>
      fakeObserveField({
        caseId: args.caseId,
        field: fieldInput.field,
        truthGeometry: fieldInput.truthGeometry,
        gridSpec: derivative.gridSpec,
      }),
    )
    .filter((proposal): proposal is ObserverRegionProposal => proposal !== null);
  const canonical = adaptObserverProposals({
    derivative,
    proposals: observerProposals,
    padding: args.padding,
  });
  if (!canonical.ok) return canonical;
  return ok({
    derivative,
    observerProposals,
    canonicalProposals: canonical.value,
  });
}
