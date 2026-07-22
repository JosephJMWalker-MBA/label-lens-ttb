import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/layout/PortalHeader";
import { requireRolePage, type SessionUser } from "@/server/auth/guards";
import { isValidSubmissionId } from "@/server/submissions/access";
import { buildSubmissionDetail, type SubmissionDetailView } from "@/server/submissions/detail";
import { INTERNAL_REVIEW_RECORD_NOTICE, statusLabel } from "@/lib/product-language";
import { AgentReviewActions } from "./AgentReviewActions";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function shortChecksum(value: string): string {
  return value.slice(0, 12);
}

function panelCountList(
  entries: Array<{ role: string; checksumSha256: string; count: number }>,
): string {
  return (
    entries
      .map((entry) => `${entry.role} ${shortChecksum(entry.checksumSha256)} x${entry.count}`)
      .join(", ") || "None"
  );
}

function replacedPanelList(
  entries: Array<{
    role: string;
    priorChecksumSha256: string;
    resultingChecksumSha256: string;
    count: number;
  }>,
): string {
  return (
    entries
      .map(
        (entry) =>
          `${entry.role} ${shortChecksum(entry.priorChecksumSha256)} -> ${shortChecksum(entry.resultingChecksumSha256)} x${entry.count}`,
      )
      .join(", ") || "None"
  );
}

export default async function AgentSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRolePage(["agent", "admin"]);
  const { id } = await params;
  if (!isValidSubmissionId(id)) notFound();

  const result = await buildSubmissionDetail(id);

  if (!result.ok && result.reason === "not_found") notFound();

  return (
    <>
      <PortalHeader user={user} />
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-12">
        <Link
          href="/agent"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Back to queue
        </Link>

        {!result.ok ? (
          <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-6">
            <h1 className="text-lg font-semibold">This record could not be displayed.</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Its stored integrity check did not pass, so it is not shown.
            </p>
          </div>
        ) : (
          <Detail view={result.view} user={user} />
        )}
      </main>
    </>
  );
}

function Detail({ view, user }: { view: SubmissionDetailView; user: SessionUser }) {
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-xl font-semibold tracking-tight">{view.submission.id}</h1>
        {view.submission.isDemo ? (
          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            Demo submission
          </span>
        ) : null}
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
          {statusLabel(view.submission.status)}
        </span>
      </div>
      <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        {INTERNAL_REVIEW_RECORD_NOTICE}
      </p>

      <AgentReviewActions
        submissionId={view.submission.id}
        currentStatus={view.submission.status}
        submissionVersion={view.submission.version}
        revisionId={view.revision.id}
        revisionNumber={view.revision.revisionNumber}
        currentUserId={user.id}
        currentUserRole={user.role === "admin" ? "admin" : "agent"}
        activeClaim={view.activeClaim}
        latestDecision={view.latestDecision}
      />

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Immutable revision</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 rounded-md border border-border/70 p-4 sm:grid-cols-3">
          <Field label="Revision" value={`v${view.revision.revisionNumber}`} />
          <Field
            label="Revision ID"
            value={<span className="font-mono text-xs">{view.revision.id}</span>}
          />
          <Field
            label="Profile"
            value={`${view.revision.profileId} v${view.revision.profileVersion}`}
          />
          <Field label="Submitted by" value={view.revision.submittedBy} />
          <Field
            label="Submitted at"
            value={new Date(view.revision.submittedAt).toLocaleString()}
          />
          <Field
            label="Integrity"
            value={<span className="text-emerald-700 dark:text-emerald-400">Verified</span>}
          />
        </dl>
      </section>

      {view.revisionComparison ? (
        <section className="mt-8 rounded-md border border-blue-500/30 bg-blue-500/5 p-4">
          <h2 className="text-lg font-semibold tracking-tight">Revision response summary</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Revision v{view.revisionComparison.childRevision.revisionNumber} responds to requested
            changes on revision v{view.revisionComparison.parentRevision.revisionNumber}.
          </p>
          <blockquote className="mt-3 rounded border-l-4 border-blue-500/50 bg-background px-3 py-2 text-sm">
            {view.revisionComparison.respondedToDecision.rationale}
          </blockquote>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <Field
              label="Panels unchanged"
              value={panelCountList(view.revisionComparison.panelChanges.unchanged)}
            />
            <Field
              label="Panels replaced"
              value={replacedPanelList(view.revisionComparison.panelChanges.replaced)}
            />
            <Field
              label="Panels added"
              value={panelCountList(view.revisionComparison.panelChanges.added)}
            />
            <Field
              label="Panels removed"
              value={panelCountList(view.revisionComparison.panelChanges.removed)}
            />
            <Field
              label="Prior analysis"
              value={
                view.revisionComparison.machineAnalysis.priorAnalysisRunId
                  ? `${view.revisionComparison.machineAnalysis.priorAnalysisRunId} · ${view.revisionComparison.machineAnalysis.priorReadiness}`
                  : "None"
              }
            />
            <Field
              label="Revision analysis"
              value={
                view.revisionComparison.machineAnalysis.resultingAnalysisRunId
                  ? `${view.revisionComparison.machineAnalysis.resultingAnalysisRunId} · ${view.revisionComparison.machineAnalysis.resultingReadiness}`
                  : "None"
              }
            />
          </dl>
          <ul className="mt-3 grid gap-2">
            {view.revisionComparison.sellerEvidenceChanges.map((change) => (
              <li
                key={change.categoryId}
                className="rounded border border-border/50 px-3 py-2 text-xs"
              >
                <p className="font-medium">{change.categoryId}</p>
                <p className="text-muted-foreground">
                  {change.priorDecision ?? "none"} → {change.resultingDecision ?? "none"} ·{" "}
                  {change.priorRegionCount} → {change.resultingRegionCount} seller region
                  {change.resultingRegionCount === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Panels</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {view.panels.map((panel) => (
            <div key={panel.panelId} className="rounded-md border border-border/70 p-4">
              <p className="text-sm font-medium capitalize">{panel.role}</p>
              <p className="text-xs text-muted-foreground">{panel.displayName}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={panel.assetUrl}
                alt={`${panel.role} panel`}
                className="mt-3 max-h-64 w-full rounded border border-border/40 object-contain"
              />
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Field label="Type" value={panel.mediaType} />
                <Field label="Dimensions" value={`${panel.width}×${panel.height}`} />
                <Field label="Size" value={`${panel.byteSize} bytes`} />
                <Field label="Rotation" value={`${panel.rotation}°`} />
                <div className="col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Checksum
                  </dt>
                  <dd className="mt-0.5 break-all font-mono text-[11px]">{panel.checksumSha256}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-border/70 p-4">
          <h2 className="text-lg font-semibold tracking-tight">Seller evidence</h2>
          <p className="text-xs text-muted-foreground">What the seller confirmed.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {view.sellerEvidence.map((evidence) => (
              <li
                key={evidence.categoryId}
                className="rounded border border-border/50 px-3 py-2 text-sm"
              >
                <p className="font-medium">{evidence.categoryId}</p>
                <p className="text-xs text-muted-foreground">
                  {evidence.decision}
                  {evidence.expectedValue ? ` · “${evidence.expectedValue}”` : ""} ·{" "}
                  {evidence.regions.length} region{evidence.regions.length === 1 ? "" : "s"}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-md border border-border/70 p-4">
          <h2 className="text-lg font-semibold tracking-tight">Machine observations</h2>
          <p className="text-xs text-muted-foreground">
            What the machine detected (separate record).
          </p>
          {view.machineAnalysis ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Run {view.machineAnalysis.analysisRunId} · readiness{" "}
                {view.machineAnalysis.readiness}
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {view.machineAnalysis.panelRuns.map((run) => (
                  <li
                    key={run.panelId + run.machineResultId}
                    className="rounded border border-border/50 px-3 py-2 text-xs"
                  >
                    <p className="font-medium">{run.panelId}</p>
                    <p className="break-all font-mono text-[11px] text-muted-foreground">
                      {run.machineResultId}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No machine analysis recorded.</p>
          )}
          {view.provenance ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Build / analysis provenance
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-muted px-3 py-2 text-[11px]">
                {JSON.stringify(view.provenance.applicationBuild, null, 2)}
              </pre>
            </details>
          ) : null}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Status history</h2>
        <ol className="mt-3 flex flex-col gap-2">
          {view.statusHistory.map((event, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {statusLabel(event.status)}
              </span>
              <span className="text-xs text-muted-foreground">
                {event.actorRole} · {new Date(event.recordedAt).toLocaleString()}
                {event.reasonComment ? ` · ${event.reasonComment}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
