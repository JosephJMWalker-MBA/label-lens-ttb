import {
  latestAnalysisIsCurrent,
  packagePanelDecisions,
  packageReadyForAgentReview,
  validNormalizedRegion,
  type PackageCategoryDefinition,
  type PackageCategoryId,
  type SellerPackageChangeAction,
  type SellerPackageDraft,
} from "./package-model";
import type { PackageCategoryInstruction } from "./package-profile";

export type PackageWorkflowPhase = "upload" | "mark" | "save" | "fix" | "prepare";

export type PackageProgressStageId = "upload" | "mark" | "save" | "precheck" | "prepare";
export type PackageProgressStageStatus =
  "current" | "complete" | "needs_attention" | "not_started" | "blocked";

export interface PackageProgressStage {
  id: PackageProgressStageId;
  label: string;
  status: PackageProgressStageStatus;
}

export type PackageSaveState = "unsaved" | "saving" | "saved" | "error";

export interface GuidedCategoryStatus {
  categoryId: PackageCategoryId;
  complete: boolean;
  needsAttention: boolean;
}

export interface GuidedPackageWorkflow {
  phase: PackageWorkflowPhase;
  frontUploaded: boolean;
  backUploaded: boolean;
  backAbsent: boolean;
  backResolved: boolean;
  additionalResolved: boolean;
  panelDecisionsComplete: boolean;
  uploadedPanelCount: number;
  completedCategoryCount: number;
  totalCategoryCount: number;
  categoryStatuses: GuidedCategoryStatus[];
  incompleteCategoryIds: PackageCategoryId[];
  flaggedCategoryIds: PackageCategoryId[];
  correctionResolvedCategoryIds: PackageCategoryId[];
  correctionPendingCategoryIds: PackageCategoryId[];
  correctionCycleComplete: boolean;
  focusCategoryIds: PackageCategoryId[];
  analysisExists: boolean;
  analysisCurrent: boolean;
  readyForPrecheck: boolean;
  readyForAgentPackage: boolean;
  progressStages: PackageProgressStage[];
  recommendedAction: string;
}

const CORRECTION_DISPOSITION_ACTIONS: ReadonlySet<SellerPackageChangeAction> = new Set([
  "category_updated",
  "region_added",
  "region_moved",
  "region_resized",
  "region_removed",
] as const);

function categoryComplete(args: {
  draft: SellerPackageDraft;
  definition: PackageCategoryDefinition;
  instruction: PackageCategoryInstruction;
}): boolean {
  const category = args.draft.categories.find(
    (candidate) => candidate.categoryId === args.definition.categoryId,
  );
  if (!category || category.decision === "unresolved") return false;
  if (category.decision === "not_present") return args.instruction.notPresentAllowed;
  if (args.definition.requiresValue && category.expectedValue.trim() === "") return false;
  const panelIds = new Set(args.draft.panels.map((panel) => panel.panelId));
  return (
    category.regions.length > 0 &&
    category.regions.every(
      (region) =>
        region.categoryId === category.categoryId &&
        panelIds.has(region.panelId) &&
        validNormalizedRegion(region),
    )
  );
}

export function deriveGuidedPackageWorkflow(args: {
  draft: SellerPackageDraft;
  definitions: readonly PackageCategoryDefinition[];
  instructions: readonly PackageCategoryInstruction[];
  saveState: PackageSaveState;
}): GuidedPackageWorkflow {
  const { draft, definitions, instructions } = args;
  const roles = new Set(draft.panels.map((panel) => panel.role));
  const frontUploaded = roles.has("front");
  const backUploaded = roles.has("back");
  const additionalUploaded = [...roles].some((role) => role !== "front" && role !== "back");
  const panelDecisions = packagePanelDecisions(draft);
  const backAbsent = !backUploaded && panelDecisions.back === "absent";
  const backResolved = backUploaded || backAbsent;
  const additionalResolved = additionalUploaded || panelDecisions.additional === "none";
  const panelDecisionsComplete = frontUploaded && backResolved && additionalResolved;
  const instructionByCategory = new Map(
    instructions.map((instruction) => [instruction.categoryId, instruction]),
  );
  const latestRun = draft.analysisRuns.at(-1);
  const analysisCurrent = latestAnalysisIsCurrent(draft);
  const categoryStatuses = definitions.map((definition) => {
    const instruction = instructionByCategory.get(definition.categoryId);
    if (!instruction) {
      throw new Error(`PACKAGE_INSTRUCTION_MISSING:${definition.categoryId}`);
    }
    const complete = categoryComplete({ draft, definition, instruction });
    return {
      categoryId: definition.categoryId,
      complete,
      needsAttention:
        draft.categories.find((category) => category.categoryId === definition.categoryId)
          ?.decision === "unresolved",
    };
  });
  const incompleteCategoryIds = categoryStatuses
    .filter((status) => !status.complete)
    .map((status) => status.categoryId);
  const flaggedCategoryIds = latestRun
    ? definitions
        .filter((definition) => {
          const result = latestRun.categories.find(
            (category) => category.categoryId === definition.categoryId,
          );
          return result && result.state !== "clearly_readable" && result.state !== "not_applicable";
        })
        .map((definition) => definition.categoryId)
    : [];
  const completeCategoryIds = new Set(
    categoryStatuses.filter((status) => status.complete).map((status) => status.categoryId),
  );
  const correctionResolvedCategoryIds = latestRun
    ? flaggedCategoryIds.filter(
        (categoryId) =>
          completeCategoryIds.has(categoryId) &&
          draft.sellerChangeHistory.some(
            (change) =>
              change.sequence > latestRun.sellerChangeSequence &&
              change.categoryId === categoryId &&
              CORRECTION_DISPOSITION_ACTIONS.has(change.action),
          ),
      )
    : [];
  const correctionResolved = new Set(correctionResolvedCategoryIds);
  const correctionPendingCategoryIds = flaggedCategoryIds.filter(
    (categoryId) => !correctionResolved.has(categoryId),
  );
  const correctionCycleComplete =
    latestRun?.readiness === "needs_seller_review" &&
    flaggedCategoryIds.length > 0 &&
    correctionPendingCategoryIds.length === 0;
  const allCategoriesComplete = incompleteCategoryIds.length === 0;
  const readyForPrecheck =
    panelDecisionsComplete && allCategoriesComplete && args.saveState === "saved";
  const readyForAgentPackage = packageReadyForAgentReview(draft) && args.saveState === "saved";

  let phase: PackageWorkflowPhase;
  let recommendedAction: string;
  if (!panelDecisionsComplete) {
    phase = "upload";
    recommendedAction = "Resolve the required panel decisions";
  } else if (!allCategoriesComplete && !latestRun) {
    phase = "mark";
    recommendedAction = "Complete the next required category";
  } else if (
    latestRun?.readiness === "needs_seller_review" &&
    correctionPendingCategoryIds.length > 0
  ) {
    phase = "fix";
    recommendedAction = "Review only the categories flagged by the pre-check";
  } else if (readyForAgentPackage) {
    phase = "prepare";
    recommendedAction = "Prepare the local-only agent package";
  } else if (!allCategoriesComplete) {
    phase = "mark";
    recommendedAction = "Complete the next required category";
  } else {
    phase = "save";
    recommendedAction =
      args.saveState === "saved"
        ? latestRun && !analysisCurrent
          ? "Run the package pre-check again"
          : "Run the saved package pre-check"
        : correctionCycleComplete || (latestRun && !analysisCurrent)
          ? "Save the updated draft"
          : "Save the prepared package in this browser";
  }

  const exportedAfterLatestAnalysis = Boolean(
    latestRun &&
    draft.sellerChangeHistory.some(
      (change) =>
        change.action === "agent_package_exported" &&
        change.sequence > latestRun.sellerChangeSequence,
    ),
  );
  const progressStages: PackageProgressStage[] = [
    {
      id: "upload",
      label: "Upload",
      status: panelDecisionsComplete
        ? "complete"
        : args.saveState === "error"
          ? "blocked"
          : "current",
    },
    {
      id: "mark",
      label: "Mark",
      status: allCategoriesComplete
        ? phase === "fix"
          ? "needs_attention"
          : "complete"
        : phase === "fix"
          ? "needs_attention"
          : panelDecisionsComplete
            ? "current"
            : "not_started",
    },
    {
      id: "save",
      label: "Save",
      status:
        args.saveState === "saved"
          ? "complete"
          : args.saveState === "error" && allCategoriesComplete
            ? "blocked"
            : allCategoriesComplete
              ? "current"
              : "not_started",
    },
    {
      id: "precheck",
      label: "Pre-check",
      status:
        latestRun && analysisCurrent && latestRun.readiness === "ready_for_agent_submission"
          ? "complete"
          : latestRun && (latestRun.readiness === "needs_seller_review" || !analysisCurrent)
            ? "needs_attention"
            : readyForPrecheck
              ? "current"
              : "not_started",
    },
    {
      id: "prepare",
      label: "Prepare",
      status: exportedAfterLatestAnalysis
        ? "complete"
        : readyForAgentPackage
          ? "current"
          : "not_started",
    },
  ];

  return {
    phase,
    frontUploaded,
    backUploaded,
    backAbsent,
    backResolved,
    additionalResolved,
    panelDecisionsComplete,
    uploadedPanelCount: draft.panels.length,
    completedCategoryCount: categoryStatuses.filter((status) => status.complete).length,
    totalCategoryCount: categoryStatuses.length,
    categoryStatuses,
    incompleteCategoryIds,
    flaggedCategoryIds,
    correctionResolvedCategoryIds,
    correctionPendingCategoryIds,
    correctionCycleComplete,
    focusCategoryIds:
      latestRun?.readiness === "needs_seller_review"
        ? correctionPendingCategoryIds
        : incompleteCategoryIds,
    analysisExists: Boolean(latestRun),
    analysisCurrent,
    readyForPrecheck,
    readyForAgentPackage,
    progressStages,
    recommendedAction,
  };
}
