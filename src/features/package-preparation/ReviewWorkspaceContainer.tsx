"use client";

import { useCallback, useRef, useState } from "react";

import { AgentReviewSubmissionDock } from "./AgentReviewSubmissionDock";
import {
  PackagePreparationWorkspace,
  type PackagePreparationWorkspaceRef,
} from "./PackagePreparationWorkspace";

export function ReviewWorkspaceContainer() {
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [selectionToken, setSelectionToken] = useState<number>(0);
  const workspaceRef = useRef<PackagePreparationWorkspaceRef | null>(null);

  const handleActivePackageChange = useCallback((packageId: string | null) => {
    setActivePackageId(packageId);
    setSelectionToken((token) => token + 1);
  }, []);

  const handleStartAnotherPackage = useCallback(() => {
    workspaceRef.current?.startAnotherPackage();
  }, []);

  return (
    <>
      <AgentReviewSubmissionDock
        activePackageId={activePackageId}
        selectionToken={selectionToken}
        onStartAnotherPackage={handleStartAnotherPackage}
      />
      <PackagePreparationWorkspace
        ref={workspaceRef}
        onActivePackageChange={handleActivePackageChange}
      />
    </>
  );
}
