"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";

import { AGENT_REVIEW_RECEIVER, AGENT_REVIEW_TRANSMISSION } from "./agent-submission-contract";
import {
  normalizeSubmissionReceipt,
  parseSubmissionErrorMessage,
  safeSubmissionErrorMessage,
  type AgentReviewSubmissionReceipt,
} from "./agent-review-submission-response";
import { loadPackageDraftLocally, type StoredPackageDraft } from "./package-draft-store";
import {
  buildSellerPackageExport,
  latestAnalysisIsCurrent,
  packageReadyForAgentReview,
} from "./package-model";
import type { RevisionResponseContext } from "./revision-context";

export type SubmissionPhase = "idle" | "submitting" | "submitted" | "error";

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

/**
 * Everything the review workspace needs to know about handing the active
 * browser-local draft to internal review. One owner (the workspace container)
 * holds this state so the guided footer action and the final-stage submission
 * panel can never disagree about whether, or how, the package was submitted.
 */
export interface InternalReviewSubmission {
  stored: StoredPackageDraft | null;
  loadError: boolean;
  phase: SubmissionPhase;
  errorMessage: string | null;
  receipt: AgentReviewSubmissionReceipt | null;
  /** The server holds a submission for this exact draft (this session or earlier). */
  alreadySubmitted: boolean;
  /** Draft is current, flags are dispositioned, and every panel file is present. */
  ready: boolean;
  sessionPending: boolean;
  sellerSignedIn: boolean;
  /** Signed in, but with a role that cannot submit packages. */
  signedInWithoutSellerRole: boolean;
  revisionContext: RevisionResponseContext | null;
  /** Plain-language readiness explanation for the stored draft. */
  summary: string;
  submit: () => Promise<void>;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function submissionReadinessMessage(stored: StoredPackageDraft | null): string {
  if (!stored) return "Start the package workspace below and save the required evidence.";
  const latestRun = stored.draft.analysisRuns.at(-1);
  if (!latestRun) return "Complete the package and run its pre-check before submitting.";
  if (!latestAnalysisIsCurrent(stored.draft)) {
    return "Seller evidence changed after the last pre-check. Save and run the pre-check again.";
  }
  if (!packageReadyForAgentReview(stored.draft)) {
    return "Review each category flagged by the pre-check. Correct the evidence or explicitly keep it for the human agent.";
  }
  if (stored.panelFiles.length !== stored.draft.panels.length) {
    return "One or more saved panel files are unavailable in this browser. Restore them before submitting.";
  }
  return "The package and its panel images are ready to enter the internal agent review queue.";
}

export function useInternalReviewSubmission({
  activePackageId,
  selectionToken,
  submitter,
}: {
  activePackageId?: string | null;
  selectionToken?: number;
  submitter: string;
}): InternalReviewSubmission {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [stored, setStored] = useState<StoredPackageDraft | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phase, setPhase] = useState<SubmissionPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<AgentReviewSubmissionReceipt | null>(null);
  const [knownServerStatus, setKnownServerStatus] = useState<string | null>(null);
  const attemptRef = useRef<SubmissionAttempt | null>(null);

  useEffect(() => {
    setPhase("idle");
    setErrorMessage(null);
    setReceipt(null);
    setKnownServerStatus(null);
    attemptRef.current = null;
  }, [activePackageId, selectionToken]);

  const refreshLocalPackage = useCallback(async () => {
    try {
      const value = await loadPackageDraftLocally(activePackageId ?? undefined);
      setStored(value);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [activePackageId]);

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

  const draft = stored?.draft ?? null;
  const latestRun = draft?.analysisRuns.at(-1);
  const revisionContext = stored?.revisionContext ?? null;
  const revisionContextFingerprint = revisionContext ? canonicalStringify(revisionContext) : null;

  const draftFingerprint = useMemo(() => {
    if (!draft) return "";
    const panelSig = draft.panels
      .map(
        (p) =>
          `${p.panelId}:${p.role}:${p.order}:${p.checksumSha256}:${p.byteSize}:${p.width}x${p.height}:${p.rotation}`,
      )
      .join("|");
    const categorySig = draft.categories
      .map(
        (c) =>
          `${c.categoryId}:${c.decision}:${c.expectedValue}:${c.regions
            .map((r) => `${r.regionId}@${r.panelId}:${r.x},${r.y},${r.width},${r.height}`)
            .join(",")}`,
      )
      .join("|");

    return [
      draft.packageId,
      draft.updatedAt,
      latestRun?.analysisRunId ?? "no-run",
      panelSig,
      categorySig,
      revisionContextFingerprint ?? "initial-finalize",
      submitter.trim(),
    ].join("::");
  }, [draft, latestRun?.analysisRunId, revisionContextFingerprint, submitter]);

  const panelFilesCoherent = useMemo(() => {
    if (!stored) return false;
    if (stored.panelFiles.length !== stored.draft.panels.length) return false;
    const fileMap = new Map(stored.panelFiles.map((pf) => [pf.panelId, pf.file]));
    return stored.draft.panels.every((panel) => {
      const file = fileMap.get(panel.panelId);
      return Boolean(file && file.size === panel.byteSize);
    });
  }, [stored]);

  const ready = Boolean(stored && packageReadyForAgentReview(stored.draft) && panelFilesCoherent);

  useEffect(() => {
    attemptRef.current = null;
    setKnownServerStatus(null);
    setReceipt(null);
    setPhase("idle");
    setErrorMessage(null);
  }, [draftFingerprint]);

  useEffect(() => {
    const packageId = draft?.packageId;
    if (!packageId || revisionContext || !sellerSignedIn || phase === "submitting" || receipt) {
      return;
    }

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
  }, [
    draft?.packageId,
    phase,
    receipt,
    revisionContext,
    revisionContextFingerprint,
    sellerSignedIn,
  ]);

  const summary = useMemo(() => submissionReadinessMessage(stored), [stored]);

  const submit = useCallback(async () => {
    if (!stored || !ready || !sellerSignedIn || submitter.trim() === "") return;

    setPhase("submitting");
    setErrorMessage(null);

    try {
      const currentDraft = stored.draft;
      const currentRun = currentDraft.analysisRuns.at(-1);
      if (!currentRun) throw new Error("The package has no completed pre-check.");

      if (stored.panelFiles.length !== currentDraft.panels.length) {
        throw new Error(
          "PACKAGE_PANEL_FILE_COUNT_MISMATCH: Saved panel files do not match draft panel count.",
        );
      }

      const storedFileMap = new Map(stored.panelFiles.map((pf) => [pf.panelId, pf.file]));
      for (const panel of currentDraft.panels) {
        const file = storedFileMap.get(panel.panelId);
        if (!file) {
          throw new Error(
            `PACKAGE_PANEL_FILE_MISSING: Saved file for panel ${panel.panelId} is unavailable.`,
          );
        }
        if (file.size !== panel.byteSize) {
          throw new Error(
            `PACKAGE_PANEL_FILE_SIZE_MISMATCH: Saved file size for panel ${panel.panelId} (${file.size}) does not match draft byte size (${panel.byteSize}).`,
          );
        }
      }

      const fingerprint = draftFingerprint;

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
      if (revisionContext) {
        body.set("revisionContext", canonicalStringify(revisionContext));
      }
      for (const panel of currentDraft.panels) {
        const file = storedFileMap.get(panel.panelId)!;
        body.append(panel.panelId, file, file.name);
      }

      const response = await fetch(
        revisionContext
          ? `/api/package/submit/resubmit/${encodeURIComponent(revisionContext.submissionId)}`
          : "/api/package/submit/finalize",
        {
          method: "POST",
          headers: { "X-Idempotency-Key": attempt.idempotencyKey },
          body,
        },
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Sign in with a seller account before submitting this package.");
        }
        throw new Error(parseSubmissionErrorMessage(result));
      }

      const submitted = normalizeSubmissionReceipt(result);
      if (!submitted) {
        throw new Error(safeSubmissionErrorMessage());
      }
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
  }, [draftFingerprint, ready, revisionContext, sellerSignedIn, stored, submitter]);

  return {
    stored,
    loadError,
    phase,
    errorMessage,
    receipt,
    alreadySubmitted: phase === "submitted" || knownServerStatus !== null,
    ready,
    sessionPending,
    sellerSignedIn,
    signedInWithoutSellerRole: Boolean(session?.user) && !sellerSignedIn,
    revisionContext,
    summary,
    submit,
  };
}
