import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/layout/PortalHeader";
import { RevisionSeedHydrator } from "@/features/package-preparation/RevisionSeedHydrator";
import { PORTAL_DISCLAIMER } from "@/lib/product-language";
import { requireRolePage } from "@/server/auth/guards";
import { isValidSubmissionId } from "@/server/submissions/access";
import { getOwnedSubmissionDetail } from "@/server/submissions/queries";

export const dynamic = "force-dynamic";

export default async function SellerSubmissionRevisePage({
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
  if (!canRevise) notFound();

  return (
    <>
      <PortalHeader user={user} />
      <main id="main-content" className="mx-auto max-w-4xl px-6 py-12">
        <Link
          href={`/seller/submissions/${encodeURIComponent(submission.id)}`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Back to submission
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Respond to requested changes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Prepare a new internal review revision for {submission.id}. This is not a government
          submission or approval.
        </p>
        {submission.changesRequestedFeedback ? (
          <blockquote className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            {submission.changesRequestedFeedback.rationale}
          </blockquote>
        ) : null}
        <RevisionSeedHydrator submissionId={submission.id} />
        <p className="mt-12 border-t border-border/70 pt-4 text-xs text-muted-foreground">
          {PORTAL_DISCLAIMER}
        </p>
      </main>
    </>
  );
}
