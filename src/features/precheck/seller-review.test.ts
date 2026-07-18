import { describe, expect, it } from "vitest";

import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";
import { resolveFieldReview } from "@/pipeline/result/field-confirmation";

import {
  SELLER_DECISION_STATES,
  sellerReviewProgress,
  sellerStateFromReview,
  sellerStateMatchesFilter,
  type SellerAddedFindingDraft,
} from "./seller-review";

describe("seller review contract", () => {
  it("keeps the nine seller states explicit and separate", () => {
    expect(SELLER_DECISION_STATES).toEqual([
      "unreviewed",
      "accepted_as_observed",
      "value_revised",
      "region_revised",
      "value_and_region_revised",
      "not_this_field",
      "not_present",
      "unable_to_confirm",
      "seller_added",
    ]);
  });

  it("does not count an unsaved, unreviewed field as progress", () => {
    expect(sellerReviewProgress(["accepted_as_observed", "unreviewed"])).toEqual({
      reviewed: 1,
      total: 2,
      remaining: 1,
      complete: false,
    });
  });

  it("groups decisions into deterministic review filters", () => {
    expect(sellerStateMatchesFilter("value_and_region_revised", "revised")).toBe(true);
    expect(sellerStateMatchesFilter("unable_to_confirm", "uncertain")).toBe(true);
    expect(sellerStateMatchesFilter("accepted_as_observed", "uncertain")).toBe(false);
  });

  it("derives unreviewed from an immutable machine result with no human append", () => {
    const assembled = assemblePrecheckResult(buildAssembleInput());
    if (!assembled.ok) throw new Error("assembly failed");
    const review = resolveFieldReview(assembled.value, "brandName");
    expect(sellerStateFromReview(review)).toBe("unreviewed");
  });

  it("defines the future seller-added multi-region handoff without adding it to exports", () => {
    const draft: SellerAddedFindingDraft = {
      temporaryId: "seller-draft-1",
      state: "seller_added",
      fieldKind: "other",
      observedValue: "Estate bottled",
      evidenceRegions: [
        {
          unit: "normalized-image-relative",
          imageIndex: 0,
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.1,
        },
      ],
    };
    expect(draft.state).toBe("seller_added");
    expect(draft.evidenceRegions).toHaveLength(1);
  });

  it("keeps an incomplete seller-added draft outside review progress", () => {
    const incompleteDraft: SellerAddedFindingDraft = {
      temporaryId: "seller-draft-incomplete",
      state: "seller_added",
      fieldKind: "other",
      observedValue: "",
      evidenceRegions: [],
    };

    expect(incompleteDraft.state).toBe("seller_added");
    expect(incompleteDraft.evidenceRegions).toHaveLength(0);
    expect(sellerReviewProgress(["unreviewed", "unreviewed"])).toEqual({
      reviewed: 0,
      total: 2,
      remaining: 2,
      complete: false,
    });
  });
});
