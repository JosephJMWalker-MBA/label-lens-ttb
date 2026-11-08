import { describe, expect, it, vi } from "vitest";

import { submissionFooterAction } from "./submission-footer-action";
import type { InternalReviewSubmission } from "./use-internal-review-submission";

type View = Parameters<typeof submissionFooterAction>[0]["submission"];

function view(overrides: Partial<View> = {}): View {
  return {
    alreadySubmitted: false,
    receipt: null,
    sessionPending: false,
    sellerSignedIn: true,
    signedInWithoutSellerRole: false,
    loadError: false,
    phase: "idle",
    ready: true,
    summary: "The package and its panel images are ready to enter the internal agent review queue.",
    revisionContext: null,
    submit: vi.fn(async () => {}),
    ...overrides,
  };
}

function action(submission: View, submitter = "Cedar Ridge Cellars", packageId = "pkg-123") {
  const navigate = vi.fn();
  return {
    navigate,
    result: submissionFooterAction({ submission, submitter, packageId, navigate }),
  };
}

describe("final-stage footer action", () => {
  it("submits a ready package to internal review, never to TTB", () => {
    const submission = view();
    const { result } = action(submission);
    expect(result).toMatchObject({ label: "Submit for internal review" });
    expect(result.disabled).toBeFalsy();
    expect(result.reason).toMatch(/Nothing is filed with TTB/);
    result.onClick?.();
    expect(submission.submit).toHaveBeenCalledTimes(1);
  });

  it("labels a requested-changes response as a resubmission of a new revision", () => {
    const revisionContext: NonNullable<InternalReviewSubmission["revisionContext"]> = {
      kind: "requested_changes_response",
      submissionId: "pkg-123",
      baseRevisionId: "rev-1",
      baseRevisionNumber: 1,
      respondedToDecisionId: "decision-1",
      expectedSubmissionVersion: 2,
    };
    const { result } = action(view({ revisionContext }));
    expect(result.label).toBe("Resubmit for internal review");
    expect(result.reason).toMatch(/new revision/);
    expect(result.reason).toMatch(/Earlier revisions stay unchanged/);
  });

  it("sends a signed-out visitor to sign in and back to the same draft", () => {
    const { result, navigate } = action(view({ sellerSignedIn: false }), "", "pkg-abc/1");
    expect(result.label).toBe("Sign in to submit");
    expect(result.disabled).toBeFalsy();
    result.onClick?.();
    const href = navigate.mock.calls[0]?.[0] as string;
    const returnTo = new URL(href, "https://label-lens.test").searchParams.get("returnTo");
    expect(returnTo).toBe("/review?packageId=pkg-abc%2F1");
  });

  it("explains, without a dead end, why an agent or admin cannot submit", () => {
    const { result } = action(view({ sellerSignedIn: false, signedInWithoutSellerRole: true }));
    expect(result).toMatchObject({
      label: "Submit for internal review",
      disabled: true,
      reason: "Only seller accounts can submit packages for internal review.",
    });
  });

  it("is disabled with the readiness explanation while the package cannot be submitted", () => {
    const summary =
      "One or more saved panel files are unavailable in this browser. Restore them before submitting.";
    const { result } = action(view({ ready: false, summary }));
    expect(result).toMatchObject({ disabled: true, reason: summary });
  });

  it("requires the submitter name before submitting", () => {
    const { result } = action(view(), "   ");
    expect(result).toMatchObject({
      label: "Submit for internal review",
      disabled: true,
      reason: "Enter the seller or submitter name above, then submit.",
    });
  });

  it("blocks duplicate requests while a submission is in flight", () => {
    const { result } = action(view({ phase: "submitting" }));
    expect(result).toMatchObject({ label: "Submitting…", disabled: true, pending: true });
  });

  it("offers a retry after a failed attempt", () => {
    const submission = view({ phase: "error" });
    const { result } = action(submission);
    expect(result.label).toBe("Try submitting again");
    result.onClick?.();
    expect(submission.submit).toHaveBeenCalledTimes(1);
  });

  it("points at the tracked submission once the server has recorded it", () => {
    const submission = view({
      alreadySubmitted: true,
      phase: "submitted",
      receipt: {
        submissionId: "pkg-123",
        revisionId: "rev-1",
        revisionNumber: 1,
        status: "waiting_for_agent_review",
        recordedAt: "2026-11-08T00:00:00.000Z",
      },
    });
    const { result, navigate } = action(submission);
    expect(result.label).toBe("Track this submission");
    expect(result.reason).toMatch(/Nothing was filed with TTB/);
    result.onClick?.();
    expect(navigate).toHaveBeenCalledWith("/seller/submissions/pkg-123");
    expect(submission.submit).not.toHaveBeenCalled();
  });

  it("waits for the session before offering any submit or sign-in action", () => {
    const { result } = action(view({ sessionPending: true, sellerSignedIn: false }));
    expect(result).toMatchObject({ disabled: true, pending: true });
  });
});
