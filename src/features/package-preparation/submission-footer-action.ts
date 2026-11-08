import type { PackageFooterAction } from "./PackageProgressFooter";
import type { InternalReviewSubmission } from "./use-internal-review-submission";

type SubmissionView = Pick<
  InternalReviewSubmission,
  | "alreadySubmitted"
  | "receipt"
  | "sessionPending"
  | "sellerSignedIn"
  | "signedInWithoutSellerRole"
  | "loadError"
  | "phase"
  | "ready"
  | "summary"
  | "revisionContext"
  | "submit"
>;

/**
 * The single guided action for the final stage of a ready package. It submits
 * to Label Lens internal review (never to TTB) and, once the server has
 * recorded the package, points the seller at its tracked status instead.
 */
export function submissionFooterAction({
  submission,
  submitter,
  packageId,
  navigate,
}: {
  submission: SubmissionView;
  submitter: string;
  packageId: string | null | undefined;
  navigate: (href: string) => void;
}): PackageFooterAction {
  const submitLabel = submission.revisionContext
    ? "Resubmit for internal review"
    : "Submit for internal review";

  if (submission.alreadySubmitted && submission.receipt) {
    const href = `/seller/submissions/${encodeURIComponent(submission.receipt.submissionId)}`;
    return {
      label: "Track this submission",
      onClick: () => navigate(href),
      reason:
        "Submitted for internal review. A Label Lens reviewer acts next. Nothing was filed with TTB.",
    };
  }
  if (submission.sessionPending) {
    return { label: "Checking seller access…", disabled: true, pending: true };
  }
  if (!submission.sellerSignedIn && !submission.signedInWithoutSellerRole) {
    const returnTo = packageId ? `/review?packageId=${encodeURIComponent(packageId)}` : "/review";
    return {
      label: "Sign in to submit",
      onClick: () => navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`),
      reason: "Submitting needs a seller account. Your draft stays saved in this browser.",
    };
  }
  if (submission.signedInWithoutSellerRole) {
    return {
      label: submitLabel,
      disabled: true,
      reason: "Only seller accounts can submit packages for internal review.",
    };
  }
  if (submission.loadError) {
    return {
      label: submitLabel,
      disabled: true,
      reason: "This browser could not read the saved draft. Reload the page to try again.",
    };
  }
  if (submission.phase === "submitting") {
    return {
      label: "Submitting…",
      disabled: true,
      pending: true,
      reason: "Sending the package to internal review. Duplicate requests are disabled.",
    };
  }
  if (!submission.ready) {
    return { label: submitLabel, disabled: true, reason: submission.summary };
  }
  if (submitter.trim() === "") {
    return {
      label: submitLabel,
      disabled: true,
      reason: "Enter the seller or submitter name above, then submit.",
    };
  }
  if (submission.phase === "error") {
    return {
      label: "Try submitting again",
      onClick: () => void submission.submit(),
      reason: "The last attempt did not complete. Your draft is unchanged.",
    };
  }
  return {
    label: submitLabel,
    onClick: () => void submission.submit(),
    reason: submission.revisionContext
      ? "Records this corrected draft as a new revision. Earlier revisions stay unchanged. Nothing is filed with TTB."
      : "Sends the package to a Label Lens reviewer. Nothing is filed with TTB.",
  };
}
