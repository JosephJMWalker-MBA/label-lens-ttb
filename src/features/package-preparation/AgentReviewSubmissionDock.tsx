"use client";

import Link from "next/link";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OFFICIAL_FILING_HANDOFF, statusLabel } from "@/lib/product-language";

import type { InternalReviewSubmission } from "./use-internal-review-submission";

export interface AgentReviewSubmissionDockProps {
  submission: InternalReviewSubmission;
  submitter: string;
  onSubmitterChange?: (value: string) => void;
  onStartAnotherPackage?: () => void;
}

/**
 * The final-stage submission panel. It explains what submitting does, collects
 * the submitter name, and shows the server receipt once the package is in the
 * internal review queue. It renders no submit button of its own: the guided
 * footer action is the single control that submits, so the seller is never
 * offered two competing "final" actions.
 */
export function AgentReviewSubmissionDock({
  submission,
  submitter,
  onSubmitterChange,
  onStartAnotherPackage,
}: AgentReviewSubmissionDockProps) {
  const { receipt, revisionContext } = submission;

  return (
    <section
      className="rounded-lg border border-emerald-700/40 bg-emerald-50/40 p-4 dark:bg-emerald-950/20"
      aria-labelledby="agent-submission-heading"
      data-testid="agent-review-submission-dock"
    >
      {submission.alreadySubmitted && receipt ? (
        <div className="text-sm" data-testid="submission-receipt">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Submitted for internal review
          </p>
          <h3 id="agent-submission-heading" className="mt-1 text-lg font-semibold">
            {statusLabel(receipt.status)}
          </h3>
          <p className="mt-1 font-mono text-xs">{receipt.submissionId}</p>
          <p className="mt-1 text-xs">Revision v{receipt.revisionNumber} is recorded.</p>

          <h4 className="mt-4 font-semibold">What happens next</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>A Label Lens reviewer checks your marked evidence and the pre-check findings.</li>
            <li>
              The outcome appears in My submissions: internally accepted, or changes requested with
              the reviewer&apos;s note. Submitted revisions are never edited.
            </li>
            <li>
              {OFFICIAL_FILING_HANDOFF.statement}{" "}
              <a
                className="font-medium text-foreground underline underline-offset-4"
                href={OFFICIAL_FILING_HANDOFF.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {OFFICIAL_FILING_HANDOFF.label}
                <span className="sr-only"> (opens the official TTB site in a new tab)</span>
              </a>
            </li>
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link className="font-medium underline underline-offset-4" href="/seller">
              Open my submissions
            </Link>
            {onStartAnotherPackage ? (
              <button
                type="button"
                data-testid="start-another-package-btn"
                onClick={onStartAnotherPackage}
                className="rounded-md border border-emerald-700/40 bg-background px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
              >
                Start another package
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="text-sm">
          <h3 id="agent-submission-heading" className="text-base font-semibold">
            {revisionContext ? "Send your corrected revision" : "Send to a Label Lens reviewer"}
          </h3>
          <p className="mt-1 text-muted-foreground">
            {revisionContext
              ? `Submitting records this corrected draft as a new revision of ${revisionContext.submissionId}. Revision v${revisionContext.baseRevisionNumber} and its review decision stay unchanged.`
              : "Submitting sends your marked evidence, the pre-check record, and your label images to a Label Lens reviewer."}{" "}
            It does not file anything with TTB and is not an approval.
          </p>

          {submission.loadError ? (
            <p role="alert" className="mt-3 text-destructive">
              This browser could not read the saved draft. Reload the page to try again.
            </p>
          ) : (
            // The name belongs to the package record (submission and optional
            // copy alike), so it is collected whatever the visitor's role.
            <div className="mt-3 grid max-w-md gap-2">
              <Label htmlFor="agent-submission-name">Seller or submitter name</Label>
              <Input
                id="agent-submission-name"
                value={submitter}
                onChange={(event) => onSubmitterChange?.(event.target.value)}
                disabled={submission.phase === "submitting"}
                aria-describedby="agent-submission-name-hint"
              />
              <p id="agent-submission-name-hint" className="text-xs text-muted-foreground">
                {submission.sellerSignedIn ? (
                  <>
                    The reviewer sees this name with your package. Then use{" "}
                    <strong>{revisionContext ? "Resubmit" : "Submit"} for internal review</strong>{" "}
                    at the bottom of the screen.
                  </>
                ) : submission.sessionPending ? (
                  "Checking seller access…"
                ) : submission.signedInWithoutSellerRole ? (
                  "Only seller accounts can submit packages for internal review."
                ) : (
                  "Sign in with a seller account to submit. Your draft stays saved in this browser while you sign in."
                )}
              </p>
              {submission.sellerSignedIn && !submission.ready ? (
                <p className="text-xs text-muted-foreground">{submission.summary}</p>
              ) : null}
              {submission.errorMessage ? (
                <p role="alert" className="text-destructive">
                  {submission.errorMessage}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
