import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/layout/PortalHeader";
import { PORTAL_DISCLAIMER, statusLabel } from "@/lib/product-language";
import { requireRolePage } from "@/server/auth/guards";
import { isValidSubmissionId } from "@/server/submissions/access";
import { getOwnedSubmissionDetail } from "@/server/submissions/queries";

export const dynamic = "force-dynamic";

export default async function SellerSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRolePage(["seller"]);
  const { id } = await params;
  if (!isValidSubmissionId(id)) notFound();

  const submission = await getOwnedSubmissionDetail(user.id, id);
  if (!submission) notFound();
  const canRevise =
    submission.currentStatus === "changes_requested" &&
    submission.changesRequestedFeedback !== null &&
    !submission.changesRequestedFeedback.alreadyAnswered;

  return (
    <>
      <PortalHeader user={user} />
      <main id="main-content" className="mx-auto max-w-4xl px-6 py-12">
        <Link
          href="/seller"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Back to submissions
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold tracking-tight">{submission.id}</h1>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {statusLabel(submission.currentStatus)}
          </span>
        </div>

        {submission.changesRequestedFeedback ? (
          <section className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
              Requested changes
            </p>
            <p className="mt-2 text-sm">{submission.changesRequestedFeedback.rationale}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Revision v{submission.changesRequestedFeedback.revisionNumber} ·{" "}
              {submission.changesRequestedFeedback.recordedAt.toLocaleString()}
            </p>
            {canRevise ? (
              <Link
                className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                href={`/seller/submissions/${encodeURIComponent(submission.id)}/revise`}
              >
                Respond with a revised package
              </Link>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                This requested-change decision already has a seller response.
              </p>
            )}
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Revision history</h2>
          <ol className="mt-3 divide-y divide-border/70 rounded-md border border-border/70">
            {submission.revisions.map((revision) => (
              <li key={revision.id} className="px-4 py-3">
                <p className="font-medium">Revision v{revision.revisionNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {revision.profileId} v{revision.profileVersion} · submitted{" "}
                  {revision.submittedAt.toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Status history</h2>
          <ol className="mt-3 flex flex-col gap-2">
            {submission.events.map((event, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {statusLabel(event.status)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {event.recordedAt.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-12 border-t border-border/70 pt-4 text-xs text-muted-foreground">
          {PORTAL_DISCLAIMER}
        </p>
      </main>
    </>
  );
}
