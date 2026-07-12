import type { EvalLiveBaselineRecord } from "./eval-manifest.types";

/**
 * The known live production result for the Luigi & Giovanni label, recorded
 * verbatim as a datum. This PR establishes measurement only and deliberately
 * does NOT tune the extractor to correct this outcome.
 */
export const LIVE_BASELINE: EvalLiveBaselineRecord = {
  caseId: "luigi-giovanni-live",
  expectedBrand: "Luigi & Giovanni",
  enteredAlcohol: "14",
  selectedBrand: "Pir",
  selectedBrandConfidence: 0.31,
  alternates: [
    { value: "VANNI", confidence: 0.91 },
    { value: "TASTE OF ITALY", confidence: 0.95 },
  ],
  alcoholObservation: "NOT_OBSERVED",
};
