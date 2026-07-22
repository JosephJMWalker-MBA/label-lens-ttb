import Link from "next/link";

import { PortalHeader } from "@/components/layout/PortalHeader";
import { requireRolePage } from "@/server/auth/guards";
import { listOwnedSubmissions } from "@/server/submissions/queries";
import { PORTAL_DISCLAIMER, statusLabel } from "@/lib/product-language";

export const dynamic = "force-dynamic";

export default async function SellerPage() {
  const user = await requireRolePage(["seller"]);
  const submissions = await listOwnedSubmissions(user.id);

  return (
    <>
      <PortalHeader user={user} />
      <main id="main-content" className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Seller</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your submissions</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Signed in as {user.name?.trim() || user.email}.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/review"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Prepare a package in Review
          </Link>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Submission status</h2>
          {submissions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              You have not submitted a package for agent review yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border/70 rounded-md border border-border/70">
              {submissions.map((submission) => (
                <li
                  key={submission.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="font-mono text-sm">{submission.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {submission.latestRevisionNumber
                        ? `Package revision v${submission.latestRevisionNumber}`
                        : "Package revision not recorded"}
                      {submission.isDemo ? " · Demo submission" : ""}
                    </p>
                    {submission.changesRequestedFeedback ? (
                      <div className="mt-2 max-w-2xl rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                          Requested changes
                        </p>
                        <p className="mt-1 text-sm">
                          {submission.changesRequestedFeedback.rationale}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Revision v{submission.changesRequestedFeedback.revisionNumber} ·{" "}
                          {submission.changesRequestedFeedback.recordedAt.toLocaleString()}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                      {statusLabel(submission.currentStatus)}
                    </span>
                    <Link
                      className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
                      href={`/seller/submissions/${encodeURIComponent(submission.id)}`}
                    >
                      Details
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-12 border-t border-border/70 pt-4 text-xs text-muted-foreground">
          {PORTAL_DISCLAIMER}
        </p>
      </main>
    </>
  );
}
