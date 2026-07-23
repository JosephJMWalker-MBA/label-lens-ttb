"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createAndActivateNewDraftLocally, DraftStoreError } from "./package-draft-store";

export function StartNewPackageButton() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStartNewPackage = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setErrorMessage(null);
    try {
      await createAndActivateNewDraftLocally();
      router.push("/review");
    } catch (err: unknown) {
      setIsCreating(false);
      if (err instanceof DraftStoreError && err.reason === "LOCAL_DRAFT_LIMIT_REACHED") {
        setErrorMessage(
          "Local draft limit reached (maximum 20 drafts). Please delete an existing draft in Review before starting a new package.",
        );
      } else {
        setErrorMessage("Could not create a new package draft. Please try again.");
      }
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        data-testid="start-new-package-btn"
        disabled={isCreating}
        onClick={() => void handleStartNewPackage()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isCreating ? "Creating package…" : "Start new package"}
      </button>
      {errorMessage ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
