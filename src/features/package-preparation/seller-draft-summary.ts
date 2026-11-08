import { labelForCategory } from "./package-model";
import type { StoredPackageDraft } from "./package-draft-store";
import {
  WINE_PACKAGE_CATEGORY_DEFINITIONS,
  WINE_PACKAGE_CATEGORY_INSTRUCTIONS,
} from "./package-profile";
import { deriveGuidedPackageWorkflow, storedDraftSaveState } from "./package-workflow";

/** The server-recorded facts the dashboard has about one of the seller's submissions. */
export interface SellerSubmissionRef {
  id: string;
  currentStatus: string;
}

export interface SellerDraftSummary {
  packageId: string;
  /** The seller-declared brand name, or a neutral placeholder. */
  title: string;
  updatedAt: string;
  kind: "in_progress" | "revision_response";
  /** The single next step, in the seller's language. */
  nextStep: string;
  /** e.g. "2 of 5 steps done" — counted from the same stages the workspace shows. */
  progress: string;
  /** Opens this exact draft in the review workspace. */
  href: string;
  revisionOf?: { submissionId: string; baseRevisionNumber: number };
}

function nextStepFor(stored: StoredPackageDraft): { nextStep: string; progress: string } {
  const workflow = deriveGuidedPackageWorkflow({
    draft: stored.draft,
    definitions: WINE_PACKAGE_CATEGORY_DEFINITIONS,
    instructions: WINE_PACKAGE_CATEGORY_INSTRUCTIONS,
    saveState: storedDraftSaveState(stored.draft),
  });
  const done = workflow.progressStages.filter(
    (stage) => stage.status === "complete" || stage.status === "findings_noted",
  ).length;
  const progress = `${done} of ${workflow.progressStages.length} steps done`;

  switch (workflow.phase) {
    case "upload":
      return {
        nextStep: workflow.frontUploaded
          ? "Answer the back-label and extra-panel questions"
          : "Add the front label image",
        progress,
      };
    case "mark": {
      const next = workflow.incompleteCategoryIds[0];
      return {
        nextStep: next
          ? `Mark the ${labelForCategory(next).toLowerCase()} on your label`
          : "Finish marking your label",
        progress,
      };
    }
    case "fix": {
      const count = workflow.correctionPendingCategoryIds.length;
      return {
        nextStep: `Review ${count} item${count === 1 ? "" : "s"} the pre-check flagged`,
        progress,
      };
    }
    case "save": {
      const saved = storedDraftSaveState(stored.draft) === "saved";
      return {
        nextStep: !saved
          ? "Save your package"
          : workflow.analysisExists
            ? "Run the pre-check again"
            : "Run the pre-check",
        progress,
      };
    }
    case "prepare":
      return {
        nextStep: stored.revisionContext
          ? "Resubmit for internal review"
          : "Submit for internal review",
        progress,
      };
  }
}

/**
 * Which browser-local drafts still need the seller, and what each needs next.
 *
 * Drafts live in this browser, not on the server, so the server's record of the
 * seller's submissions decides what is finished: a draft already submitted is
 * not shown as pending, and a requested-changes response is shown only while
 * that submission is still waiting for the seller's changes.
 */
export function summarizeLocalDrafts(
  drafts: readonly StoredPackageDraft[],
  submissions: readonly SellerSubmissionRef[],
): SellerDraftSummary[] {
  const statusById = new Map(submissions.map((submission) => [submission.id, submission]));
  const summaries: SellerDraftSummary[] = [];

  for (const stored of drafts) {
    const { draft, revisionContext } = stored;
    if (revisionContext) {
      if (statusById.get(revisionContext.submissionId)?.currentStatus !== "changes_requested") {
        continue;
      }
    } else if (statusById.has(draft.packageId)) {
      continue;
    }

    const brand = draft.categories
      .find((category) => category.categoryId === "brandName")
      ?.expectedValue.trim();
    summaries.push({
      packageId: draft.packageId,
      title: brand || "Untitled package",
      updatedAt: draft.updatedAt,
      kind: revisionContext ? "revision_response" : "in_progress",
      ...nextStepFor(stored),
      href: `/review?packageId=${encodeURIComponent(draft.packageId)}`,
      ...(revisionContext
        ? {
            revisionOf: {
              submissionId: revisionContext.submissionId,
              baseRevisionNumber: revisionContext.baseRevisionNumber,
            },
          }
        : {}),
    });
  }

  return summaries.sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}
