"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listPackageDraftsLocally } from "./package-draft-store";
import {
  summarizeLocalDrafts,
  type SellerDraftSummary,
  type SellerSubmissionRef,
} from "./seller-draft-summary";

type LoadState =
  { kind: "loading" } | { kind: "error" } | { kind: "ready"; drafts: SellerDraftSummary[] };

const VISIBLE_DRAFT_LIMIT = 5;

/**
 * The returning seller's "continue where you left off" list, read from drafts
 * saved in this browser. Each unfinished package shows one next step and a
 * Continue link that opens that exact draft. With nothing started and nothing
 * submitted, it explains how to begin instead.
 */
export function SellerDraftsOverview({ submissions }: { submissions: SellerSubmissionRef[] }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const submissionsKey = JSON.stringify(submissions);
  const stableSubmissions = useMemo(
    () => JSON.parse(submissionsKey) as SellerSubmissionRef[],
    [submissionsKey],
  );

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const drafts = await listPackageDraftsLocally();
      setState({ kind: "ready", drafts: summarizeLocalDrafts(drafts, stableSubmissions) });
    } catch {
      setState({ kind: "error" });
    }
  }, [stableSubmissions]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <p role="status" className="mt-8 text-sm text-muted-foreground">
        Checking this browser for unfinished packages…
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        role="alert"
        data-testid="seller-drafts-error"
        className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <p className="min-w-0">
          Label Lens could not read the packages saved in this browser. Your submitted packages
          below are not affected.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-md border border-amber-600/60 px-3 py-1.5 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.drafts.length === 0) {
    return submissions.length === 0 ? <GettingStarted /> : null;
  }

  const visible = state.drafts.slice(0, VISIBLE_DRAFT_LIMIT);
  const hidden = state.drafts.length - visible.length;

  return (
    <section
      className="mt-10"
      aria-labelledby="seller-continue-heading"
      data-testid="seller-continue"
    >
      <h2 id="seller-continue-heading" className="text-lg font-semibold tracking-tight">
        Continue where you left off
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Unfinished packages are saved in this browser only, until you submit them.
      </p>
      <ul className="mt-3 divide-y divide-border/70 rounded-md border border-border/70">
        {visible.map((draft) => (
          <li
            key={draft.packageId}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            data-testid="seller-draft-row"
            data-package-id={draft.packageId}
          >
            <div className="min-w-0">
              <p className="font-medium">{draft.title}</p>
              {draft.revisionOf ? (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Responding to requested changes on{" "}
                  <span className="font-mono">{draft.revisionOf.submissionId}</span> (revision v
                  {draft.revisionOf.baseRevisionNumber})
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {draft.progress} · updated {new Date(draft.updatedAt).toLocaleString()}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-medium">Next:</span> {draft.nextStep}
              </p>
            </div>
            <Link
              href={draft.href}
              className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              aria-label={`Continue ${draft.title}`}
            >
              Continue
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {hidden} more unfinished package{hidden === 1 ? " is" : "s are"} saved in this browser.{" "}
          <Link className="underline underline-offset-4" href="/review">
            Open the package workspace
          </Link>{" "}
          to see every draft.
        </p>
      ) : null}
    </section>
  );
}

function GettingStarted() {
  return (
    <section
      className="mt-10 rounded-lg border border-border/70 bg-card p-5"
      aria-labelledby="seller-getting-started-heading"
      data-testid="seller-getting-started"
    >
      <h2 id="seller-getting-started-heading" className="text-lg font-semibold tracking-tight">
        Start your first label package
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Use <strong>Start new package</strong> above. Have these ready:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>
          A PNG or JPEG image of the front label, and of the back label if the bottle has one.
        </li>
        <li>The brand name and the alcohol statement exactly as they are printed.</li>
      </ul>
      <h3 className="mt-4 text-sm font-semibold">How it works</h3>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Upload your label panels.</li>
        <li>Mark where the brand name and alcohol statement appear, and type what they say.</li>
        <li>
          Save, then run the pre-check, which reads the label and compares it with your entries.
        </li>
        <li>
          Review anything the pre-check flags: correct it, or keep your evidence for the reviewer.
        </li>
        <li>Submit for internal review. A Label Lens reviewer accepts it or asks for changes.</li>
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        Label Lens prepares and reviews packages internally. It does not file with TTB, and nothing
        here is an approval.
      </p>
    </section>
  );
}
