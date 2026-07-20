import type { LabelRequirementFieldId } from "@/domain/requirements/requirement.types";
import { compareText } from "@/domain/compare/semantic";
import {
  parseDeclaredAlcoholValue,
  parseWineAlcoholStatement,
} from "@/domain/rules/wine-alcohol-parse";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import type { PrecheckServiceResponse } from "@/server/precheck-service.types";

export const SELLER_PACKAGE_SCHEMA_VERSION = "seller-package-draft.v1" as const;
export const SELLER_PACKAGE_EXPORT_VERSION = "seller-agent-package.v1" as const;

export type PackageCategoryId = LabelRequirementFieldId;
export type PanelRole = "front" | "back" | "neck" | "side" | "other";
export type PanelRotation = 0 | 90 | 180 | 270;
export type BackPanelDecision = "unresolved" | "upload" | "absent";
export type AdditionalPanelDecision = "unresolved" | "add" | "none";
export type CategoryPreparationDecision = "provided" | "unresolved" | "not_present";
export type CategoryAnalysisState =
  "clearly_readable" | "needs_review" | "not_found" | "not_applicable";
export type PackageReadiness = "needs_seller_review" | "ready_for_agent_submission";

export interface PackageCategoryDefinition {
  categoryId: PackageCategoryId;
  requirementId: string;
  requirementVersion: string;
  label: string;
  requiresValue: boolean;
  applicability: "always" | "conditional";
}

export interface PackagePanelMetadata {
  panelId: string;
  order: number;
  role: PanelRole;
  displayName: string;
  mediaType: string;
  byteSize: number;
  checksumSha256: string;
  width: number;
  height: number;
  rotation: PanelRotation;
}

export interface SellerEvidenceRegion {
  regionId: string;
  categoryId: PackageCategoryId;
  panelId: string;
  unit: "normalized-panel-relative";
  provenance: "seller-selected-region";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackageCategoryDraft {
  categoryId: PackageCategoryId;
  decision: CategoryPreparationDecision;
  expectedValue: string;
  regions: SellerEvidenceRegion[];
}

/**
 * Seller upload intent is package workflow metadata, not evidence. It records
 * an explicit absence without manufacturing a panel, checksum, or geometry.
 * Optional for backward compatibility with seller-package-draft.v1 records
 * created before the workstation introduced explicit panel decisions.
 */
export interface PackagePanelDecisions {
  back: BackPanelDecision;
  additional: AdditionalPanelDecision;
}

export type SellerPackageChangeAction =
  | "panel_added"
  | "panel_replaced"
  | "panel_removed"
  | "panel_rotated"
  | "category_updated"
  | "region_added"
  | "region_moved"
  | "region_resized"
  | "region_removed"
  | "draft_saved"
  | "analysis_completed"
  | "agent_package_exported";

export interface SellerPackageChange {
  changeId: string;
  sequence: number;
  recordedAt: string;
  action: SellerPackageChangeAction;
  categoryId?: PackageCategoryId;
  panelId?: string;
  regionId?: string;
  panelSnapshot?: PackagePanelMetadata;
  categorySnapshot?: Pick<PackageCategoryDraft, "categoryId" | "decision" | "expectedValue">;
  regionSnapshot?: SellerEvidenceRegion;
  detail: string;
}

export interface PackageCategoryAnalysis {
  categoryId: PackageCategoryId;
  state: CategoryAnalysisState;
  observedValue: string | null;
  supportingPanelIds: string[];
  supportingRegionIds: string[];
  reason: string;
}

export interface PackagePanelMachineRun {
  panelId: string;
  machineResultId: string;
  exportJson: string;
  observations: PrecheckServiceResponse["observations"];
}

export interface PackageAnalysisRun {
  analysisRunId: string;
  sequence: number;
  /** Last seller history sequence included in this analysis input. */
  sellerChangeSequence: number;
  recordedAt: string;
  panelRuns: PackagePanelMachineRun[];
  categories: PackageCategoryAnalysis[];
  readiness: PackageReadiness;
}

export interface SellerPackageDraft {
  schemaVersion: typeof SELLER_PACKAGE_SCHEMA_VERSION;
  packageId: string;
  createdAt: string;
  updatedAt: string;
  profile: { id: string; version: string };
  panelDecisions?: PackagePanelDecisions;
  panels: PackagePanelMetadata[];
  categories: PackageCategoryDraft[];
  sellerChangeHistory: SellerPackageChange[];
  analysisRuns: PackageAnalysisRun[];
}

export function packagePanelDecisions(draft: SellerPackageDraft): PackagePanelDecisions {
  const backUploaded = draft.panels.some((panel) => panel.role === "back");
  const additionalUploaded = draft.panels.some(
    (panel) => panel.role !== "front" && panel.role !== "back",
  );
  return {
    back: draft.panelDecisions?.back ?? (backUploaded ? "upload" : "unresolved"),
    // Older v1 drafts treated an empty optional-panel list as complete. Keep
    // those records usable while every newly created workstation draft starts
    // with an explicit unresolved decision.
    additional: draft.panelDecisions?.additional ?? (additionalUploaded ? "add" : "none"),
  };
}

export interface PackageExportPayload {
  exportSchemaVersion: typeof SELLER_PACKAGE_EXPORT_VERSION;
  exportType: "seller-prepared-agent-package";
  boundary: {
    transmission: "local-download-only";
    governmentApproval: false;
    statement: string;
  };
  submittedBy: string;
  submittedAt: string;
  receivingAgent: "not-configured-local-export";
  package: SellerPackageDraft;
  readiness: PackageReadiness;
  applicationBuild: unknown;
}

export interface SellerPackageExport extends PackageExportPayload {
  integrity: {
    algorithm: "sha256";
    scope: "canonical-package-payload";
    value: string;
  };
}

const CATEGORY_LABEL: Record<PackageCategoryId, string> = {
  brandName: "Brand name",
  alcoholStatement: "Alcohol statement",
};

export function labelForCategory(categoryId: PackageCategoryId): string {
  return CATEGORY_LABEL[categoryId];
}

export function validNormalizedRegion(region: SellerEvidenceRegion): boolean {
  const values = [region.x, region.y, region.width, region.height];
  return (
    values.every(Number.isFinite) &&
    region.x >= 0 &&
    region.y >= 0 &&
    region.width > 0 &&
    region.height > 0 &&
    region.x + region.width <= 1 &&
    region.y + region.height <= 1
  );
}

export function normalizedRegionFromObservation(args: {
  observation: AnalyzerFieldObservation;
  panel: PackagePanelMetadata;
  categoryId: PackageCategoryId;
  regionId: string;
}): SellerEvidenceRegion | null {
  const geometry = args.observation.geometry;
  if (!geometry || geometry.imageWidth <= 0 || geometry.imageHeight <= 0) return null;
  const region: SellerEvidenceRegion = {
    regionId: args.regionId,
    categoryId: args.categoryId,
    panelId: args.panel.panelId,
    unit: "normalized-panel-relative",
    provenance: "seller-selected-region",
    x: geometry.x / geometry.imageWidth,
    y: geometry.y / geometry.imageHeight,
    width: geometry.width / geometry.imageWidth,
    height: geometry.height / geometry.imageHeight,
  };
  return validNormalizedRegion(region) ? region : null;
}

export function categoryPreparationComplete(
  category: PackageCategoryDraft,
  definition: PackageCategoryDefinition,
): boolean {
  if (category.decision === "unresolved" || category.decision === "not_present") return true;
  if (definition.requiresValue && category.expectedValue.trim() === "") return false;
  return category.regions.length > 0 && category.regions.every(validNormalizedRegion);
}

export function packagePreparationComplete(
  draft: SellerPackageDraft,
  definitions: readonly PackageCategoryDefinition[],
): boolean {
  const roles = new Set(draft.panels.map((panel) => panel.role));
  const panelDecisions = packagePanelDecisions(draft);
  const backResolved = roles.has("back") || panelDecisions.back === "absent";
  const additionalResolved =
    [...roles].some((role) => role !== "front" && role !== "back") ||
    panelDecisions.additional === "none";
  if (!roles.has("front") || !backResolved || !additionalResolved) return false;
  const panelIds = new Set(draft.panels.map((panel) => panel.panelId));
  return definitions.every((definition) => {
    const category = draft.categories.find((item) => item.categoryId === definition.categoryId);
    return category
      ? categoryPreparationComplete(category, definition) &&
          category.regions.every((region) => panelIds.has(region.panelId))
      : false;
  });
}

export function appendSellerChange(
  draft: SellerPackageDraft,
  change: Omit<SellerPackageChange, "sequence">,
): SellerPackageDraft {
  return {
    ...draft,
    updatedAt: change.recordedAt,
    sellerChangeHistory: [
      ...draft.sellerChangeHistory,
      { ...change, sequence: draft.sellerChangeHistory.length + 1 },
    ],
  };
}

function normalizedMachineGeometry(observation: AnalyzerFieldObservation) {
  const geometry = observation.geometry;
  if (!geometry || geometry.imageWidth <= 0 || geometry.imageHeight <= 0) return null;
  return {
    x: geometry.x / geometry.imageWidth,
    y: geometry.y / geometry.imageHeight,
    width: geometry.width / geometry.imageWidth,
    height: geometry.height / geometry.imageHeight,
  };
}

function machineCoveredByRegion(
  observation: AnalyzerFieldObservation,
  region: SellerEvidenceRegion,
): boolean {
  const machine = normalizedMachineGeometry(observation);
  if (!machine) return false;
  const left = Math.max(machine.x, region.x);
  const top = Math.max(machine.y, region.y);
  const right = Math.min(machine.x + machine.width, region.x + region.width);
  const bottom = Math.min(machine.y + machine.height, region.y + region.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const machineArea = machine.width * machine.height;
  return machineArea > 0 && intersection / machineArea >= 0.5;
}

function alcoholValuesAgree(expected: string, observation: AnalyzerFieldObservation): boolean {
  const expectedBasisPoints = parseDeclaredAlcoholValue(expected);
  if (expectedBasisPoints === null) return false;
  const candidates = [observation.normalizedValue, observation.value].filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
  return candidates.some((candidate) => {
    const declared = parseDeclaredAlcoholValue(candidate);
    if (declared !== null) return declared === expectedBasisPoints;
    const parsed = parseWineAlcoholStatement(candidate);
    return parsed.kind === "direct" && parsed.basisPoints === expectedBasisPoints;
  });
}

function valuesAgree(
  categoryId: PackageCategoryId,
  expected: string,
  observation: AnalyzerFieldObservation,
): boolean {
  if (!observation.value) return false;
  if (categoryId === "alcoholStatement") return alcoholValuesAgree(expected, observation);
  return compareText(expected, observation.value).equivalence !== "different";
}

export function deriveCategoryAnalysis(
  category: PackageCategoryDraft,
  panelRuns: readonly PackagePanelMachineRun[],
): PackageCategoryAnalysis {
  if (category.decision === "unresolved") {
    return {
      categoryId: category.categoryId,
      state: "needs_review",
      observedValue: null,
      supportingPanelIds: [],
      supportingRegionIds: [],
      reason: "The seller explicitly preserved this category as unresolved.",
    };
  }

  const observations = panelRuns.map((panelRun) => ({
    panelRun,
    observation: panelRun.observations[category.categoryId],
  }));
  const observed = observations.filter(({ observation }) => observation.state !== "NOT_OBSERVED");

  if (category.decision === "not_present") {
    return {
      categoryId: category.categoryId,
      state: observed.length === 0 ? "not_found" : "needs_review",
      observedValue: observed[0]?.observation.value ?? null,
      supportingPanelIds: [],
      supportingRegionIds: [],
      reason:
        observed.length === 0
          ? "The seller marked the category not present and no machine observation contradicted it."
          : "The seller marked the category not present, but the machine observed possible evidence.",
    };
  }

  if (observed.length === 0) {
    return {
      categoryId: category.categoryId,
      state: "not_found",
      observedValue: null,
      supportingPanelIds: [],
      supportingRegionIds: [],
      reason: "No machine observation was recovered from any supplied panel.",
    };
  }

  for (const { panelRun, observation } of observed) {
    const matchingRegions = category.regions.filter(
      (region) =>
        region.panelId === panelRun.panelId && machineCoveredByRegion(observation, region),
    );
    if (
      observation.state === "OBSERVED" &&
      matchingRegions.length > 0 &&
      valuesAgree(category.categoryId, category.expectedValue, observation)
    ) {
      return {
        categoryId: category.categoryId,
        state: "clearly_readable",
        observedValue: observation.value,
        supportingPanelIds: [panelRun.panelId],
        supportingRegionIds: matchingRegions.map((region) => region.regionId),
        reason: "Observed text agrees with the seller value and is supported by a seller region.",
      };
    }
  }

  return {
    categoryId: category.categoryId,
    state: "needs_review",
    observedValue: observed[0]?.observation.value ?? null,
    supportingPanelIds: [],
    supportingRegionIds: [],
    reason:
      "Machine evidence was recovered, but its state, value, or overlap with seller regions was insufficient for a clear reading.",
  };
}

export function derivePackageReadiness(
  categoryResults: readonly PackageCategoryAnalysis[],
): PackageReadiness {
  return categoryResults.length > 0 &&
    categoryResults.every(
      (category) => category.state === "clearly_readable" || category.state === "not_applicable",
    )
    ? "ready_for_agent_submission"
    : "needs_seller_review";
}

const NON_MATERIAL_POST_ANALYSIS_ACTIONS: ReadonlySet<SellerPackageChangeAction> = new Set([
  "draft_saved",
  "analysis_completed",
  "agent_package_exported",
]);

const LEGACY_SELLER_DISCREPANCY_ACKNOWLEDGEMENT =
  "machine discrepancy reviewed; seller evidence deliberately kept unchanged";

/**
 * The original workstation recorded a deliberate keep-evidence decision as a
 * generic category_updated entry. Preserve those existing browser drafts while
 * treating only this exact, non-mutating disposition as post-analysis metadata.
 */
export function isSellerDiscrepancyAcknowledgement(change: SellerPackageChange): boolean {
  return (
    change.action === "category_updated" &&
    change.detail.toLowerCase().includes(LEGACY_SELLER_DISCREPANCY_ACKNOWLEDGEMENT)
  );
}

/**
 * A ready machine run is not a timeless approval. Any later panel, category, or
 * region edit makes it stale until the seller saves and runs analysis again.
 */
export function latestAnalysisIsCurrent(draft: SellerPackageDraft): boolean {
  const latestRun = draft.analysisRuns.at(-1);
  if (!latestRun) return false;
  return draft.sellerChangeHistory
    .filter((change) => change.sequence > latestRun.sellerChangeSequence)
    .every(
      (change) =>
        NON_MATERIAL_POST_ANALYSIS_ACTIONS.has(change.action) ||
        isSellerDiscrepancyAcknowledgement(change),
    );
}

/**
 * Agent review is the destination for unresolved machine disagreement, not a
 * reward reserved for machine-perfect packages. A package may be handed off
 * when its latest analysis is still current and either the machine found no
 * issues or the seller explicitly reviewed every flagged category and kept the
 * underlying evidence unchanged.
 */
export function packageReadyForAgentReview(draft: SellerPackageDraft): boolean {
  const latestRun = draft.analysisRuns.at(-1);
  if (!latestRun || !latestAnalysisIsCurrent(draft)) return false;
  if (latestRun.readiness === "ready_for_agent_submission") return true;

  const flaggedCategoryIds = latestRun.categories
    .filter(
      (category) => category.state !== "clearly_readable" && category.state !== "not_applicable",
    )
    .map((category) => category.categoryId);
  if (flaggedCategoryIds.length === 0) return false;

  return flaggedCategoryIds.every((categoryId) =>
    draft.sellerChangeHistory.some(
      (change) =>
        change.sequence > latestRun.sellerChangeSequence &&
        change.categoryId === categoryId &&
        isSellerDiscrepancyAcknowledgement(change),
    ),
  );
}

export function createAnalysisRun(args: {
  draft: SellerPackageDraft;
  panelRuns: PackagePanelMachineRun[];
  analysisRunId: string;
  recordedAt: string;
}): PackageAnalysisRun {
  const categories = args.draft.categories.map((category) =>
    deriveCategoryAnalysis(category, args.panelRuns),
  );
  return {
    analysisRunId: args.analysisRunId,
    sequence: args.draft.analysisRuns.length + 1,
    sellerChangeSequence: args.draft.sellerChangeHistory.length,
    recordedAt: args.recordedAt,
    panelRuns: args.panelRuns,
    categories,
    readiness: derivePackageReadiness(categories),
  };
}

function applicationBuildFromRun(run: PackageAnalysisRun | undefined): unknown {
  const firstExport = run?.panelRuns[0]?.exportJson;
  if (!firstExport) return { commitProvenance: "unavailable-no-analysis-run" };
  try {
    const parsed = JSON.parse(firstExport) as {
      versionManifest?: { applicationBuild?: unknown };
    };
    return (
      parsed.versionManifest?.applicationBuild ?? {
        commitProvenance: "unavailable-in-machine-export",
      }
    );
  } catch {
    return { commitProvenance: "unavailable-invalid-machine-export" };
  }
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildSellerPackageExport(args: {
  draft: SellerPackageDraft;
  submittedBy: string;
  submittedAt: string;
}): Promise<SellerPackageExport> {
  const latestRun = args.draft.analysisRuns.at(-1);
  const readiness = latestRun?.readiness ?? "needs_seller_review";
  if (!packageReadyForAgentReview(args.draft)) {
    throw new Error("PACKAGE_NOT_READY_FOR_AGENT_SUBMISSION");
  }
  if (args.submittedBy.trim() === "") throw new Error("SUBMITTER_REQUIRED");

  const payload: PackageExportPayload = {
    exportSchemaVersion: SELLER_PACKAGE_EXPORT_VERSION,
    exportType: "seller-prepared-agent-package",
    boundary: {
      transmission: "local-download-only",
      governmentApproval: false,
      statement:
        "Seller-prepared package for a downstream human agent. This local export was not transmitted to an agent or to TTB and is not an approval.",
    },
    submittedBy: args.submittedBy.trim(),
    submittedAt: args.submittedAt,
    receivingAgent: "not-configured-local-export",
    package: args.draft,
    readiness,
    applicationBuild: applicationBuildFromRun(latestRun),
  };
  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      scope: "canonical-package-payload",
      value: await sha256Hex(canonicalStringify(payload)),
    },
  };
}

export function serializeSellerPackageExport(value: SellerPackageExport): string {
  return canonicalStringify(value);
}
