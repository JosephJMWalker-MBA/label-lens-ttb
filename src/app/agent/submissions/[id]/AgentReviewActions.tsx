"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { statusLabel } from "@/lib/product-language";

type UserRole = "agent" | "admin";

interface ActiveClaim {
  id: string;
  reviewerId: string;
  reviewerRole: string;
  revisionId: string;
  revisionNumber: number;
  claimedAt: string;
}

interface LatestDecision {
  id: string;
  decisionType: string;
  revisionId: string;
  revisionNumber: number;
  reviewerRole: string;
  rationale: string;
  recordedAt: string;
}

interface AgentReviewActionsProps {
  submissionId: string;
  currentStatus: string;
  submissionVersion: number;
  revisionId: string;
  revisionNumber: number;
  currentUserId: string;
  currentUserRole: UserRole;
  activeClaim: ActiveClaim | null;
  latestDecision: LatestDecision | null;
}

function errorMessage(value: unknown): string {
  const error = (value as { error?: unknown })?.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "The review action could not be completed.";
}

export function AgentReviewActions({
  submissionId,
  currentStatus,
  submissionVersion,
  revisionId,
  revisionNumber,
  currentUserId,
  currentUserRole,
  activeClaim,
  latestDecision,
}: AgentReviewActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [changesRationale, setChangesRationale] = useState("");
  const [acceptRationale, setAcceptRationale] = useState("");
  const [releaseReason, setReleaseReason] = useState("");
  const [forceReleaseReason, setForceReleaseReason] = useState("");

  const post = async (endpoint: string, action: string, body: Record<string, unknown>) => {
    setPending(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(errorMessage(payload));
      }
      setNotice("Review action recorded.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The review action could not be completed.");
    } finally {
      setPending(null);
    }
  };

  const basePath = `/api/agent/submissions/${encodeURIComponent(submissionId)}`;
  const claimedByCurrentUser = activeClaim?.reviewerId === currentUserId;
  const disabled = pending !== null;

  return (
    <section className="mt-8 rounded-md border border-border/70 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Agent review controls</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Internal workflow only. These actions do not issue TTB, COLA, government, legal, or
            regulatory approval.
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
          {statusLabel(currentStatus)}
        </span>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded border border-destructive/40 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 rounded border border-emerald-700/30 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      ) : null}

      {latestDecision ? (
        <div className="mt-4 rounded-md border border-border/60 px-3 py-2 text-sm">
          <p className="font-medium">Immutable decision recorded</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {statusLabel(latestDecision.decisionType)} · revision v{latestDecision.revisionNumber} ·{" "}
            {new Date(latestDecision.recordedAt).toLocaleString()}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{latestDecision.rationale}</p>
        </div>
      ) : null}

      {currentStatus === "waiting_for_agent_review" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            void post(`${basePath}/claim`, "claim", {
              expectedSubmissionVersion: submissionVersion,
            })
          }
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "claim" ? "Claiming…" : "Claim review"}
        </button>
      ) : null}

      {currentStatus === "in_agent_review" && activeClaim ? (
        <div className="mt-4 grid gap-4">
          <div className="rounded-md border border-border/60 px-3 py-2 text-sm">
            <p className="font-medium">
              {claimedByCurrentUser
                ? "You hold the active claim"
                : "Another reviewer holds the active claim"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Revision v{activeClaim.revisionNumber} · claimed{" "}
              {new Date(activeClaim.claimedAt).toLocaleString()}
            </p>
          </div>

          {claimedByCurrentUser ? (
            <>
              <div className="grid gap-2">
                <label htmlFor="release-reason" className="text-sm font-medium">
                  Release note (optional)
                </label>
                <textarea
                  id="release-reason"
                  value={releaseReason}
                  onChange={(event) => setReleaseReason(event.target.value)}
                  maxLength={1000}
                  rows={2}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    void post(`${basePath}/release`, "release", {
                      expectedSubmissionVersion: submissionVersion,
                      claimId: activeClaim.id,
                      reason: releaseReason,
                    })
                  }
                  className="w-fit rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending === "release" ? "Releasing…" : "Release claim"}
                </button>
              </div>

              <div className="grid gap-2">
                <label htmlFor="changes-rationale" className="text-sm font-medium">
                  Seller-visible change-request rationale
                </label>
                <textarea
                  id="changes-rationale"
                  value={changesRationale}
                  onChange={(event) => setChangesRationale(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={disabled || changesRationale.trim() === ""}
                  onClick={() =>
                    void post(`${basePath}/request-changes`, "request-changes", {
                      expectedSubmissionVersion: submissionVersion,
                      claimId: activeClaim.id,
                      reviewedRevisionId: revisionId,
                      reviewedRevisionNumber: revisionNumber,
                      rationale: changesRationale,
                    })
                  }
                  className="w-fit rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending === "request-changes" ? "Recording…" : "Request changes"}
                </button>
              </div>

              <div className="grid gap-2">
                <label htmlFor="accept-rationale" className="text-sm font-medium">
                  Internal acceptance rationale
                </label>
                <textarea
                  id="accept-rationale"
                  value={acceptRationale}
                  onChange={(event) => setAcceptRationale(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Required and stored internally. It is not shown to sellers as approval language.
                </p>
                <button
                  type="button"
                  disabled={disabled || acceptRationale.trim() === ""}
                  onClick={() =>
                    void post(`${basePath}/internal-accept`, "internal-accept", {
                      expectedSubmissionVersion: submissionVersion,
                      claimId: activeClaim.id,
                      reviewedRevisionId: revisionId,
                      reviewedRevisionNumber: revisionNumber,
                      rationale: acceptRationale,
                    })
                  }
                  className="w-fit rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending === "internal-accept" ? "Recording…" : "Internally accept"}
                </button>
              </div>
            </>
          ) : currentUserRole === "admin" ? (
            <div className="grid gap-2">
              <label htmlFor="force-release-reason" className="text-sm font-medium">
                Admin force-release reason
              </label>
              <textarea
                id="force-release-reason"
                value={forceReleaseReason}
                onChange={(event) => setForceReleaseReason(event.target.value)}
                maxLength={1000}
                rows={3}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={disabled || forceReleaseReason.trim() === ""}
                onClick={() =>
                  void post(`${basePath}/release`, "force-release", {
                    expectedSubmissionVersion: submissionVersion,
                    claimId: activeClaim.id,
                    force: true,
                    reason: forceReleaseReason,
                  })
                }
                className="w-fit rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === "force-release" ? "Force-releasing…" : "Force-release claim"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {currentStatus === "in_agent_review" && !activeClaim ? (
        <p className="mt-4 rounded border border-amber-500/40 px-3 py-2 text-sm text-muted-foreground">
          This submission is marked in review but has no active claim. Reload before acting.
        </p>
      ) : null}
    </section>
  );
}
