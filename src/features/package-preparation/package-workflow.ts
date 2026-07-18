import {
  latestAnalysisIsCurrent,
  validNormalizedRegion,
  type PackageCategoryDefinition,
  type PackageCategoryId,
  type SellerPackageDraft,
} from "./package-model";
import type { PackageCategoryInstruction } from "./package-profile";

export type PackageWorkflowPhase = "learn" | "upload" | "mark" | "save" | "fix" | "prepare";

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
  uploadedPanelCount: number;
  completedCategoryCount: number;
  totalCategoryCount: number;
  categoryStatuses: GuidedCategoryStatus[];
  incompleteCategoryIds: PackageCategoryId[];
  flaggedCategoryIds: PackageCategoryId[];
  focusCategoryIds: PackageCategoryId[];
  analysisExists: boolean;
  analysisCurrent: boolean;
  readyForPrecheck: boolean;
  readyForAgentPackage: boolean;
  recommendedAction: string;
}

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
  learnComplete: boolean;
}): GuidedPackageWorkflow {
  const { draft, definitions, instructions } = args;
  const roles = new Set(draft.panels.map((panel) => panel.role));
  const frontUploaded = roles.has("front");
  const backUploaded = roles.has("back");
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
  const allPanelsUploaded = frontUploaded && backUploaded;
  const allCategoriesComplete = incompleteCategoryIds.length === 0;
  const readyForPrecheck = allPanelsUploaded && allCategoriesComplete && args.saveState === "saved";
  const readyForAgentPackage =
    latestRun?.readiness === "ready_for_agent_submission" &&
    analysisCurrent &&
    args.saveState === "saved";

  let phase: PackageWorkflowPhase;
  let recommendedAction: string;
  if (!args.learnComplete) {
    phase = "learn";
    recommendedAction = "Review the example label map";
  } else if (!allPanelsUploaded) {
    phase = "upload";
    recommendedAction = "Upload the required front and back panels";
  } else if (!allCategoriesComplete && !latestRun) {
    phase = "mark";
    recommendedAction = "Complete the next required category";
  } else if (latestRun?.readiness === "needs_seller_review") {
    phase = "fix";
    recommendedAction = analysisCurrent
      ? "Review only the categories flagged by the pre-check"
      : "Save corrections and run the pre-check again";
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
        ? "Run the saved package pre-check"
        : "Save the prepared package in this browser";
  }

  return {
    phase,
    frontUploaded,
    backUploaded,
    uploadedPanelCount: draft.panels.length,
    completedCategoryCount: categoryStatuses.filter((status) => status.complete).length,
    totalCategoryCount: categoryStatuses.length,
    categoryStatuses,
    incompleteCategoryIds,
    flaggedCategoryIds,
    focusCategoryIds:
      latestRun?.readiness === "needs_seller_review" ? flaggedCategoryIds : incompleteCategoryIds,
    analysisExists: Boolean(latestRun),
    analysisCurrent,
    readyForPrecheck,
    readyForAgentPackage,
    recommendedAction,
  };
}
