"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";

import { AgentReviewSubmissionDock } from "./AgentReviewSubmissionDock";
import { loadPackageDraftLocally, updatePackageSubmitterLocally } from "./package-draft-store";
import {
  PackagePreparationWorkspace,
  type PackagePreparationWorkspaceRef,
} from "./PackagePreparationWorkspace";
import { submissionFooterAction } from "./submission-footer-action";
import { useInternalReviewSubmission } from "./use-internal-review-submission";

/**
 * Coordinates seller package preparation on the primary `/review` route. It is
 * the single owner of internal-review submission state, so the guided footer's
 * final action and the final-stage submission panel always agree, and it keeps
 * package-scoped submitter identity continuous between the draft and the
 * submission.
 */
export function ReviewWorkspaceContainer() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [selectionToken, setSelectionToken] = useState<number>(0);
  const [submitterByPackageId, setSubmitterByPackageId] = useState<Record<string, string>>({});
  const workspaceRef = useRef<PackagePreparationWorkspaceRef | null>(null);

  // Serialized atomic persistence promise chain per package ID to prevent race conditions on rapid typing
  const submitterSavePromisesRef = useRef<Record<string, Promise<void>>>({});

  const handleActivePackageChange = useCallback((packageId: string | null) => {
    setActivePackageId(packageId);
    setSelectionToken((token) => token + 1);
  }, []);

  const handleStartAnotherPackage = useCallback(() => {
    workspaceRef.current?.startAnotherPackage();
  }, []);

  const handleSubmitterChange = useCallback(
    (value: string) => {
      if (!activePackageId) return;
      setSubmitterByPackageId((prev) => ({
        ...prev,
        [activePackageId]: value,
      }));
      workspaceRef.current?.applySubmitter(activePackageId, value);

      const prevPromise = submitterSavePromisesRef.current[activePackageId] ?? Promise.resolve();
      const nextPromise = prevPromise
        .then(() => updatePackageSubmitterLocally(activePackageId, value))
        .then(() => {})
        .catch(() => {});
      submitterSavePromisesRef.current[activePackageId] = nextPromise;
    },
    [activePackageId],
  );

  useEffect(() => {
    if (!activePackageId) return;
    const targetPackageId = activePackageId;
    let cancelled = false;

    async function hydratePackageSubmitter() {
      if (submitterByPackageId[targetPackageId] !== undefined) return;
      try {
        const stored = await loadPackageDraftLocally(targetPackageId);
        if (cancelled) return;
        if (stored?.draft.submitter !== undefined) {
          setSubmitterByPackageId((prev) => {
            if (prev[targetPackageId] !== undefined) return prev;
            return { ...prev, [targetPackageId]: stored.draft.submitter! };
          });
        } else if (session?.user) {
          const profileSeed = session.user.name?.trim() || session.user.email || "";
          setSubmitterByPackageId((prev) => {
            if (prev[targetPackageId] !== undefined) return prev;
            return { ...prev, [targetPackageId]: profileSeed };
          });
        }
      } catch {
        if (cancelled) return;
        if (session?.user) {
          const profileSeed = session.user.name?.trim() || session.user.email || "";
          setSubmitterByPackageId((prev) => {
            if (prev[targetPackageId] !== undefined) return prev;
            return { ...prev, [targetPackageId]: profileSeed };
          });
        }
      }
    }

    void hydratePackageSubmitter();
    return () => {
      cancelled = true;
    };
  }, [activePackageId, selectionToken, session, submitterByPackageId]);

  const activeSubmitter = activePackageId ? submitterByPackageId[activePackageId] : undefined;
  const submission = useInternalReviewSubmission({
    activePackageId,
    selectionToken,
    submitter: activeSubmitter ?? "",
  });
  const navigate = useCallback((href: string) => router.push(href), [router]);

  return (
    <div className="flex flex-col gap-6" data-testid="review-workspace-container">
      <PackagePreparationWorkspace
        ref={workspaceRef}
        onActivePackageChange={handleActivePackageChange}
        submitter={activeSubmitter}
        onSubmitterChange={handleSubmitterChange}
        submitted={submission.alreadySubmitted}
        submissionAction={submissionFooterAction({
          submission,
          submitter: activeSubmitter ?? "",
          packageId: activePackageId,
          navigate,
        })}
        submissionPanel={
          <AgentReviewSubmissionDock
            submission={submission}
            submitter={activeSubmitter ?? ""}
            onSubmitterChange={handleSubmitterChange}
            onStartAnotherPackage={handleStartAnotherPackage}
          />
        }
      />
    </div>
  );
}
