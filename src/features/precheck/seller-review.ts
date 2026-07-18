import type { ResolvedFieldReview, ReviewableFieldId } from "@/pipeline/result/result.types";

/**
 * Seller adjudication is a presentation/workflow layer. These states must never
 * be substituted for machine observation states, rule outcomes, or internal
 * dispositions.
 */
export const SELLER_DECISION_STATES = [
  "unreviewed",
  "accepted_as_observed",
  "value_revised",
  "region_revised",
  "value_and_region_revised",
  "not_this_field",
  "not_present",
  "unable_to_confirm",
  "seller_added",
] as const;
export type SellerDecisionState = (typeof SELLER_DECISION_STATES)[number];

export const SELLER_REVIEW_FILTERS = [
  "all",
  "unreviewed",
  "accepted",
  "revised",
  "uncertain",
] as const;
export type SellerReviewFilter = (typeof SELLER_REVIEW_FILTERS)[number];

export const SELLER_DECISION_LABEL: Record<SellerDecisionState, string> = {
  unreviewed: "Unreviewed",
  accepted_as_observed: "Accepted as observed",
  value_revised: "Value revised",
  region_revised: "Evidence region revised",
  value_and_region_revised: "Value and evidence region revised",
  not_this_field: "Not this field",
  not_present: "Not present",
  unable_to_confirm: "Unable to confirm",
  seller_added: "Seller added",
};

export const SELLER_REVIEW_ACTIONS = [
  { state: "accepted_as_observed", label: "Accept finding" },
  { state: "value_revised", label: "Revise value" },
  { state: "region_revised", label: "Fix evidence region" },
  { state: "value_and_region_revised", label: "Revise value and region" },
  { state: "not_this_field", label: "Not this field" },
  { state: "not_present", label: "Not present" },
  { state: "unable_to_confirm", label: "Unable to confirm" },
] as const satisfies ReadonlyArray<{
  state: Exclude<SellerDecisionState, "unreviewed" | "seller_added">;
  label: string;
}>;

export type SellerReviewActionState = (typeof SELLER_REVIEW_ACTIONS)[number]["state"];

export const WORKSPACE_ONLY_SELLER_STATES = ["not_this_field", "unable_to_confirm"] as const;

export function isWorkspaceOnlySellerState(state: SellerDecisionState): boolean {
  return (WORKSPACE_ONLY_SELLER_STATES as readonly string[]).includes(state);
}

/**
 * Contract reserved for Slice 2. Slice 1 exposes the action as unavailable and
 * does not add these drafts to progress or current downloads.
 */
export interface SellerAddedFindingDraft {
  temporaryId: string;
  state: "seller_added";
  fieldKind: ReviewableFieldId | "other";
  observedValue: string;
  normalizedValue?: string;
  evidenceRegions: Array<{
    unit: "normalized-image-relative";
    imageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  note?: string;
}

/** Translate only already-supported append records into the seller vocabulary. */
export function sellerStateFromReview(review: ResolvedFieldReview): SellerDecisionState {
  const confirmation = review.activeConfirmation;
  if (!confirmation) return "unreviewed";

  switch (confirmation.decisionType) {
    case "accepted-machine-reading":
      return confirmation.humanGeometry?.provenance === "human-selected-region"
        ? "region_revised"
        : "accepted_as_observed";
    case "selected-alternate":
      return confirmation.humanGeometry?.provenance === "human-selected-region"
        ? "value_and_region_revised"
        : "value_revised";
    case "corrected-value":
      return confirmation.humanGeometry?.provenance === "human-selected-region"
        ? "value_and_region_revised"
        : "value_revised";
    case "field-not-visible":
      return "not_present";
    case "field-unreadable":
      return "unable_to_confirm";
  }
}

export function sellerStateMatchesFilter(
  state: SellerDecisionState,
  filter: SellerReviewFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "unreviewed") return state === "unreviewed";
  if (filter === "accepted") return state === "accepted_as_observed";
  if (filter === "revised") {
    return ["value_revised", "region_revised", "value_and_region_revised", "seller_added"].includes(
      state,
    );
  }
  return ["not_this_field", "not_present", "unable_to_confirm"].includes(state);
}

export interface SellerReviewProgress {
  reviewed: number;
  total: number;
  remaining: number;
  complete: boolean;
}

export function sellerReviewProgress(states: readonly SellerDecisionState[]): SellerReviewProgress {
  const reviewed = states.filter((state) => state !== "unreviewed").length;
  return {
    reviewed,
    total: states.length,
    remaining: states.length - reviewed,
    complete: states.length > 0 && reviewed === states.length,
  };
}
