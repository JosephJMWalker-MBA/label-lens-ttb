import { describe, expect, it } from "vitest";

import { OFFICIAL_FILING_HANDOFF, sellerNextStepForStatus, statusLabel } from "./product-language";

const INTERNAL_STATUSES = [
  "waiting_for_agent_review",
  "in_agent_review",
  "changes_requested",
  "internally_accepted",
  "agent_review_complete",
  "withdrawn",
] as const;

// Language a seller could read as a government outcome. Internal statuses must
// never be described this way.
const APPROVAL_CLAIM =
  /\b(ttb|cola|government|regulatory)[- ]?(approved|approval granted|accepted)\b|\bapproved\b|\bcompliant\b|\bcertified\b/i;

describe("seller next step per internal-review status", () => {
  it("names exactly one plain next step for every recorded status", () => {
    for (const status of INTERNAL_STATUSES) {
      const step = sellerNextStepForStatus(status);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.detail.length).toBeGreaterThan(0);
      expect(`${step.title} ${step.detail}`).not.toMatch(APPROVAL_CLAIM);
    }
  });

  it("asks the seller to act only when the seller is the next actor", () => {
    expect(sellerNextStepForStatus("waiting_for_agent_review").sellerActionRequired).toBe(false);
    expect(sellerNextStepForStatus("in_agent_review").sellerActionRequired).toBe(false);
    expect(sellerNextStepForStatus("changes_requested").sellerActionRequired).toBe(true);
    expect(sellerNextStepForStatus("internally_accepted").sellerActionRequired).toBe(true);
  });

  it("hands internally accepted packages to official filing without implying approval", () => {
    const step = sellerNextStepForStatus("internally_accepted");
    expect(step.detail).toContain("not a TTB approval");
    expect(step.detail).toContain(OFFICIAL_FILING_HANDOFF.statement);
    expect(statusLabel("internally_accepted")).not.toMatch(APPROVAL_CLAIM);
  });

  it("falls back to a neutral instruction for an unknown status", () => {
    expect(sellerNextStepForStatus("something_new")).toMatchObject({
      sellerActionRequired: false,
    });
  });
});

describe("official filing handoff", () => {
  it("points only at the official TTB COLAs Online page over HTTPS", () => {
    const url = new URL(OFFICIAL_FILING_HANDOFF.url);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.ttb.gov");
    expect(url.pathname).toBe("/online-services/colas-online/");
  });

  it("states that Label Lens does not file with TTB", () => {
    expect(OFFICIAL_FILING_HANDOFF.statement).toMatch(/does not file anything with TTB/);
  });
});
