"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";

import {
  AGENT_REVIEW_RECEIVER,
  AGENT_REVIEW_TRANSMISSION,
} from "./agent-submission-contract";
import {
  loadPackageDraftLocally,
  type StoredPackageDraft,
} from "./package-draft-store";
import {
  buildSellerPackageExport,
  latestAnalysisIsCurrent,
} from "./package-model";

type SubmissionPhase = "idle" | "submitting" | "submitted" | "error";

interface SubmissionReceipt {
  submissionId: string;
  revisionId: string;
  revisionNumber: number;
  status: string;
  receivingAgent: string;
  signature: string;
  recordedAt: string;
}

interface SubmissionStatusResponse {
  submissionId: string;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    submittedBy: string;
    submittedAt: string;
  }>;
}

interface SubmissionAttempt {
  fingerprint: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readinessMessage(stored: StoredPackageDraft | null): string {
  if (!stored) return "Start the package workspace below and save the required evidence.";
  const latestRun = stored.draft.analysisRuns.at(-1);
  if (!latestRun) return "Complete the package and run its pre-check before submitting.";
  if (!latestAnalysisIsCurrent(stored.draft)) {
    return "Seller evidence changed after the last pre-check. Save and run the pre-check again.";
  }
  if (latestRun.readiness !== "ready_for_agent_submission") {
    return "Review the flagged evidence, save the corrections, and run the pre-check again.";
  }
  if (stored.panelFiles.length !== stored.draft.panels.length) {
    return "One or more saved panel files are unavailable in this browser. Restore them before submitting.";
  }
  return "The package and its panel images are ready to enter the internal agent review queue.";
}

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function AgentReviewSubmissionDock() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [stored, setStored] = useState<StoredPackageDraft | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [submitter, setSubmitter] = useState("");
  const [phase, setPhase] = useState<SubmissionPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const [knownServerStatus, setKnownServerStatus] = useState<string | null>(null);
  const attemptRef = useRef<SubmissionAttempt | null>(null);

  const refreshLocalPackage = useCallback(async () => {
    try {
      const value = await loadPackageDraftLocally();
      setStored(value);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void refreshLocalPackage();
    const interval = window.setInterval(() => void refreshLocalPackage(), 1500);
    const handleFocus = () => void refreshLocalPackage();
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshLocalPackage]);

  const sessionRole = session?.user?.role;
  const sellerSignedIn = sessionRole === "seller";

  useEffect(() => {
    if (submitter.trim() !== "" || !session?.user) return;
    setSubmitter(session.user.name?.trim() || session.user.email);
  }, [session, submitter]);

  const draft = stored?.draft ?? null;
  const latestRun = draft?.analysisRuns.at(-1);
  const ready = Boolean(
    stored &&
      latestRun?.readiness === "ready_for_agent_submission" &&
      latestAnalysisIsCurrent(stored.draft) &&
      stored.panelFiles.length === stored.draft.panels.length,
  );

  useEffect(() => {
    attemptRef.current = null;
    setKnownServerStatus(null);
    setReceipt(null);
    setPhase("idle");
    setErrorMessage(null);
  }, [draft?.packageId, draft?.updatedAt, latestRun?.analysisRunId, submitter]);

  useEffect(() => {
    const packageId = draft?.packageId;
    if (!packageId || !sellerSignedIn || phase === "submitting" || receipt) return;

    let cancelled = false;
    void fetch(`/api/package/submit/status/${encodeURIComponent(packageId)}`, {
      method: "GET",
      cache: "no-store",
    })
      .then(async (response) => {
        if (cancelled || response.status === 404) return;
        if (!response.ok) return;
        const value = (await response.json()) as SubmissionStatusResponse;
        if (cancelled) return;
        const latestRevision = value.revisions.at(-1);
        setKnownServerStatus(value.currentStatus);
        setReceipt({
          submissionId: value.submissionId,
          revisionId: latestRevision?.id ?? "recorded",
          revisionNumber: latestRevision?.revisionNumber ?? 1,
          status: value.currentStatus,
          receivingAgent: AGENT_REVIEW_RECEIVER,
          signature: "verified-server-record",
          recordedAt: latestRevision?.submittedAt ?? value.createdAt,
        });
        setPhase("submitted");
      })
      .catch(() => {
        // The status lookup is an enhancement. Submission remains available if it fails.
      });

    return () => {
      cancelled = true;
    };
  }, [draft?.packageId, phase, receipt, sellerSignedIn]);

  const summary = useMemo(() => readinessMessage(stored), [stored]);

  async function submitForAgentReview() {
    if (!stored || !ready || !sellerSignedIn || submitter.trim() === "") return;

    setPhase("submitting");
    setErrorMessage(null);

    try {
      const currentDraft = stored.draft;
      const currentRun = currentDraft.analysisRuns.at(-1);
      if (!currentRun) throw new Error("The package has no completed pre-check.");

      const fingerprint = [
        currentDraft.packageId,
        currentDraft.updatedAt,
        currentRun.analysisRunId,
        submitter.trim(),
      ].join(":");

      let attempt = attemptRef.current;
      if (!attempt || attempt.fingerprint !== fingerprint) {
        const localExport = await buildSellerPackageExport({
          draft: currentDraft,
          submittedBy: submitter,
          submittedAt: new Date().toISOString(),
        });
        const { integrity: localIntegrity, ...localPayload } = localExport;
        void localIntegrity;
        const agentPayload = {
          ...localPayload,
          boundary: {
            transmission: AGENT_REVIEW_TRANSMISSION,
            governmentApproval: false,
            statement:
              "Seller-submitted package for internal human agent review. This is not a TTB submission, government approval, or legal determination.",
          },
          receivingAgent: AGENT_REVIEW_RECEIVER,
        };
        const integrityValue = await sha256Hex(canonicalStringify(agentPayload));
        attempt = {
          fingerprint,
          idempotencyKey: crypto.randomUUID(),
          payload: {
            ...agentPayload,
            integrity: {
              algorithm: "sha256",
              scope: "canonical-package-payload",
              value: integrityValue,
            },
          },
        };
        attemptRef.current = attempt;
      }

      const body = new FormData();
      body.set("packageExport", canonicalStringify(attempt.payload));
      for (const { panelId, file } of stored.panelFiles) {
        body.append(panelId, file, file.name);
      }

      const response = await fetch("/api/package/submit/finalize", {
        method: "POST",
        headers: { "X-Idempotency-Key": attempt.idempotencyKey },
        body,
      });
      const result = (await response.json().catch(() => ({}))) as
        | SubmissionReceipt
        | { error?: string };

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Sign in with a seller account before submitting this package.");
        }
        throw new Error(
          "error" in result && result.error
            ? result.error
            : "The package could not be placed in the agent review queue.",
        );
      }

      const submitted = result as SubmissionReceipt;
      setReceipt(submitted);
      setKnownServerStatus(submitted.status);
      setPhase("submitted");
    } catch (error) {
      setPhase("error");
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "The package could not be placed in the agent review queue.",
      );
    }
  }

  const alreadySubmitted = phase === "submitted" || knownServerStatus !== null;

  return (
    <section
      className="sticky top-2 z-30 mb-6 rounded-lg border border-emerald-700/40 bg-background/95 p-4 shadow-lg backdrop-blur"
      aria-labelledby="agent-submission-heading"
      data-testid="agent-review-submission-dock"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Final handoff
          </p>
          <h2 id="agent-submission-heading" className="text-xl font-semibold">
            Submit the package for agent review
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {alreadySubmitted
              ? "The package documents and panel images are stored in the internal queue for agent review."
              : loadError
                ? "The browser-local package could not be read. Restore the draft before submission."
                : summary}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This sends records to Label Lens internal review only. It does not submit anything to TTB.
          </p>
        </div>

        <div className="w-full shrink-0 lg:w-[26rem]">
          {alreadySubmitted && receipt ? (
            <div className="rounded-md border border-emerald-700/40 bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
              <p className="font-semibold">{statusLabel(receipt.status)}</p>
              <p className="mt-1 font-mono text-xs">{receipt.submissionId}</p>
              <p className="mt-1 text-xs">Revision v{receipt.revisionNumber} is recorded.</p>
              <Link className="mt-2 inline-block font-medium underline underline-offset-4" href="/seller">
                Open my submissions
              </Link>
            </div>
          ) : sellerSignedIn ? (
            <div className="grid gap-2">
              <Label htmlFor="agent-submission-name">Seller or submitter name</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="agent-submission-name"
                  value={submitter}
                  onChange={(event) => setSubmitter(event.target.value)}
                  disabled={phase === "submitting"}
                />
                <button
                  type="button"
                  onClick={() => void submitForAgentReview()}
                  disabled={!ready || submitter.trim() === "" || phase === "submitting"}
                  className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {phase === "submitting" ? "Submitting…" : "Submit for agent review"}
                </button>
              </div>
              {errorMessage ? (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessage}
                </p>
              ) : null}
            </div>
          ) : sessionPending ? (
            <p className="text-sm text-muted-foreground">Checking seller access…</p>
          ) : session?.user ? (
            <p className="text-sm text-muted-foreground">
              A seller account is required to submit a package to the review queue.
            </p>
          ) : (
            <Link
              href="/login"
              className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Sign in to submit
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
