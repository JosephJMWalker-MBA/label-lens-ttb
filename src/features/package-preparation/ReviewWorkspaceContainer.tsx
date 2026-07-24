"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";

import { AgentReviewSubmissionDock } from "./AgentReviewSubmissionDock";
import { loadPackageDraftLocally, updatePackageSubmitterLocally } from "./package-draft-store";
import {
  PackagePreparationWorkspace,
  type PackagePreparationWorkspaceRef,
} from "./PackagePreparationWorkspace";

/**
 * Coordinates seller package preparation workspace components on the primary
 * `/review` route. Maintains package-scoped single-source-of-truth submitter identity
 * continuity between the workstation draft and final handoff submission dock.
 */
export function ReviewWorkspaceContainer() {
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

  return (
    <div className="flex flex-col gap-6" data-testid="review-workspace-container">
      <AgentReviewSubmissionDock
        activePackageId={activePackageId}
        selectionToken={selectionToken}
        onStartAnotherPackage={handleStartAnotherPackage}
        submitter={activeSubmitter}
        onSubmitterChange={handleSubmitterChange}
      />
      <PackagePreparationWorkspace
        ref={workspaceRef}
        onActivePackageChange={handleActivePackageChange}
        submitter={activeSubmitter}
        onSubmitterChange={handleSubmitterChange}
      />
    </div>
  );
}
