import type { LabelRequirementFieldId } from "@/domain/requirements/requirement.types";
import { compareText } from "@/domain/compare/semantic";
import {
  CANONICAL_GOVERNMENT_WARNING,
  evaluateGovernmentWarningPackage,
  type GovernmentWarningObservation,
  type GovernmentWarningPackageFinding,
} from "@/domain/rules/government-warning.rule";
import {
  parseDeclaredAlcoholValue,
  parseWineAlcoholStatement,
} from "@/domain/rules/wine-alcohol-parse";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import type { SellerRegionMachineReading } from "@/pipeline/extractor/extractor.types";
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
export type BrandMachineEvidenceState =
  "SUPPORTED" | "CONFLICTING" | "NOT_LOCATED" | "INSUFFICIENT_EVIDENCE";
export type CategoryTwoStreamOutcome =
  | "AGREEMENT"
  | "CONFLICT"
  | "SELLER_REGION_INSUFFICIENT"
  | "MACHINE_DISCOVERY_NOT_FOUND"
  | "BOTH_INSUFFICIENT";

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
  | "agent_package_exported"
  | "revision_response_started";

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
  comparison?: CategoryTwoStreamComparison;
}

export interface PackagePanelMachineRun {
  panelId: string;
  machineResultId: string;
  exportJson: string;
  observations: PrecheckServiceResponse["observations"];
  governmentWarning?: GovernmentWarningObservation;
  sellerRegionReadings?: SellerRegionMachineReading[];
}

export interface MachineDiscoveredReading {
  panelId: string;
  observedValue: string | null;
  normalizedValue?: string | null;
  state: AnalyzerFieldObservation["state"];
  geometry?: AnalyzerFieldObservation["geometry"];
  ocrEvidenceScore: number;
  confidence: number;
  source: "machine-discovered-reading";
}

export interface CategoryTwoStreamComparison {
  categoryId: PackageCategoryId;
  sellerDeclaredValue: string;
  sellerRegionReadings: SellerRegionMachineReading[];
  sellerRegionReliability: {
    regionId: string;
    panelId: string;
    reliabilityState: "RELIABLE" | "UNRELIABLE";
    reason: string;
  }[];
  machineDiscoveredReading: MachineDiscoveredReading | null;
  outcome: CategoryTwoStreamOutcome;
  reason: string;
  supportingPanelIds: string[];
  supportingRegionIds: string[];
  conflictingPanelIds: string[];
  conflictingRegionIds: string[];
}

export interface PackageBrandIdentityEvidence {
  declaredBrandName: string;
  state: BrandMachineEvidenceState;
  observedValue: string | null;
  supportingPanelIds: string[];
  conflictingPanelIds: string[];
  rationale: string;
}

export interface PackageAnalysisRun {
  analysisRunId: string;
  sequence: number;
  /** Last seller history sequence included in this analysis input. */
  sellerChangeSequence: number;
  recordedAt: string;
  panelRuns: PackagePanelMachineRun[];
  categories: PackageCategoryAnalysis[];
  brandIdentity?: PackageBrandIdentityEvidence;
  governmentWarning?: GovernmentWarningPackageFinding;
  readiness: PackageReadiness;
}

export interface SellerPackageDraft {
  schemaVersion: typeof SELLER_PACKAGE_SCHEMA_VERSION;
  packageId: string;
  createdAt: string;
  updatedAt: string;
  profile: { id: string; version: string };
  submitter?: string;
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

function valuesEquivalent(categoryId: PackageCategoryId, left: string, right: string): boolean {
  const observation: AnalyzerFieldObservation = {
    state: "OBSERVED",
    value: right,
    normalizedValue: right,
    confidence: 1,
    ocrEvidenceScore: 1,
    alternates: [],
  };
  return valuesAgree(categoryId, left, observation);
}

const RELIABLE_STREAM_CONFIDENCE_FLOOR = 0.8;
const LIKELY_OCR_SUBSTITUTION_SIMILARITY = 0.8;
const MIN_RELIABLE_SELECTED_REGION_WIDTH_PX = 24;
const MIN_RELIABLE_SELECTED_REGION_HEIGHT_PX = 10;

function readableSellerRegionReading(reading: SellerRegionMachineReading): boolean {
  return (
    reading.observedValue !== null &&
    (reading.evidenceState === "OBSERVED" ||
      reading.evidenceState === "LOW_CONFIDENCE" ||
      reading.evidenceState === "AMBIGUOUS")
  );
}

function reliableMachineDiscoveredReading(reading: MachineDiscoveredReading | null): boolean {
  return (
    reading !== null &&
    reading.observedValue !== null &&
    reading.state === "OBSERVED" &&
    reading.ocrEvidenceScore >= RELIABLE_STREAM_CONFIDENCE_FLOOR
  );
}

function sellerRegionReliabilityReason(
  category: PackageCategoryDraft,
  reading: SellerRegionMachineReading,
): string | null {
  if (reading.observedValue === null) {
    return "No bounded OCR value was recovered inside the seller-selected region.";
  }
  if (reading.evidenceState !== "OBSERVED") {
    return `Bounded OCR state ${reading.evidenceState} is not reliable enough for deterministic comparison.`;
  }
  if (reading.ocrEvidenceScore < RELIABLE_STREAM_CONFIDENCE_FLOOR) {
    return `Bounded OCR confidence ${reading.ocrEvidenceScore.toFixed(2)} is below the ${RELIABLE_STREAM_CONFIDENCE_FLOOR.toFixed(2)} comparison floor.`;
  }
  const selected = reading.selectedRegionPixelGeometry;
  if (
    selected &&
    (selected.width < MIN_RELIABLE_SELECTED_REGION_WIDTH_PX ||
      selected.height < MIN_RELIABLE_SELECTED_REGION_HEIGHT_PX)
  ) {
    return `Selected crop ${selected.width}x${selected.height}px is too small for deterministic bounded comparison.`;
  }
  if (!valuesEquivalent(category.categoryId, category.expectedValue, reading.observedValue)) {
    if (category.categoryId === "brandName") {
      const comparison = compareText(category.expectedValue, reading.observedValue);
      if (comparison.similarity >= LIKELY_OCR_SUBSTITUTION_SIMILARITY) {
        return "Bounded OCR is a near-miss for the seller-entered text, so it is treated as a likely stylized-text OCR substitution.";
      }
    }
    return "Bounded OCR did not support the seller-entered text strongly enough to compare against independent discovery.";
  }
  return null;
}

function reliableSellerRegionReading(
  category: PackageCategoryDraft,
  reading: SellerRegionMachineReading,
): boolean {
  return sellerRegionReliabilityReason(category, reading) === null;
}

function firstReadableSellerRegionValue(readings: readonly SellerRegionMachineReading[]) {
  return readings.find(readableSellerRegionReading)?.observedValue ?? null;
}

function machineDiscoveredReadingFor(
  categoryId: PackageCategoryId,
  panelRuns: readonly PackagePanelMachineRun[],
): MachineDiscoveredReading | null {
  for (const panelRun of panelRuns) {
    const observation = panelRun.observations[categoryId];
    if (observation.state === "NOT_OBSERVED") continue;
    return {
      panelId: panelRun.panelId,
      observedValue: observation.value,
      normalizedValue: observation.normalizedValue,
      state: observation.state,
      geometry: observation.geometry,
      ocrEvidenceScore: observation.ocrEvidenceScore,
      confidence: observation.confidence,
      source: "machine-discovered-reading",
    };
  }
  return null;
}

function deriveTwoStreamComparison(
  category: PackageCategoryDraft,
  panelRuns: readonly PackagePanelMachineRun[],
): CategoryTwoStreamComparison | null {
  const sellerRegionReadings = panelRuns.flatMap((panelRun) =>
    (panelRun.sellerRegionReadings ?? []).filter(
      (reading) => reading.categoryId === category.categoryId,
    ),
  );
  if (sellerRegionReadings.length === 0) return null;
  const sellerRegionReliability = sellerRegionReadings.map((reading) => {
    const unreliableReason = sellerRegionReliabilityReason(category, reading);
    return {
      regionId: reading.regionId,
      panelId: reading.panelId,
      reliabilityState: unreliableReason === null ? ("RELIABLE" as const) : ("UNRELIABLE" as const),
      reason: unreliableReason ?? "Bounded OCR is reliable enough for deterministic comparison.",
    };
  });

  const machineDiscoveredReading = machineDiscoveredReadingFor(category.categoryId, panelRuns);
  const reliableRegionReadings = sellerRegionReadings.filter((reading) =>
    reliableSellerRegionReading(category, reading),
  );
  const bestSellerRegionReading = reliableRegionReadings[0] ?? null;
  const sellerValue = bestSellerRegionReading?.observedValue ?? null;
  const machineValue = machineDiscoveredReading?.observedValue ?? null;
  const machineReadable = reliableMachineDiscoveredReading(machineDiscoveredReading);

  let outcome: CategoryTwoStreamOutcome;
  let reason: string;
  let supportingPanelIds: string[] = [];
  let supportingRegionIds: string[] = [];
  let conflictingPanelIds: string[] = [];
  let conflictingRegionIds: string[] = [];

  if (sellerValue && machineValue && machineReadable && machineDiscoveredReading) {
    if (valuesEquivalent(category.categoryId, sellerValue, machineValue)) {
      outcome = "AGREEMENT";
      supportingPanelIds = [machineDiscoveredReading.panelId];
      supportingRegionIds = reliableRegionReadings.map((reading) => reading.regionId);
      reason =
        "The seller-region machine reading agrees with the independent machine-discovered reading.";
    } else {
      outcome = "CONFLICT";
      conflictingPanelIds = [machineDiscoveredReading.panelId];
      conflictingRegionIds = reliableRegionReadings.map((reading) => reading.regionId);
      reason =
        "The seller-region machine reading conflicts with the independent machine-discovered reading.";
    }
  } else if (!sellerValue && machineValue && machineDiscoveredReading) {
    outcome = "SELLER_REGION_INSUFFICIENT";
    conflictingPanelIds = [machineDiscoveredReading.panelId];
    reason =
      "Text was detected inside the selected location, but the bounded reading was not reliable enough to compare against the independent machine reading.";
  } else if (sellerValue && !machineValue) {
    outcome = "MACHINE_DISCOVERY_NOT_FOUND";
    supportingRegionIds = reliableRegionReadings.map((reading) => reading.regionId);
    reason =
      "The selected seller region produced a usable machine reading, but independent full-panel discovery did not find the field.";
  } else {
    outcome = "BOTH_INSUFFICIENT";
    reason =
      "Neither the selected seller region nor independent machine discovery established a usable value.";
  }

  return {
    categoryId: category.categoryId,
    sellerDeclaredValue: category.expectedValue,
    sellerRegionReadings,
    sellerRegionReliability,
    machineDiscoveredReading,
    outcome,
    reason,
    supportingPanelIds,
    supportingRegionIds,
    conflictingPanelIds,
    conflictingRegionIds,
  };
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
    const comparison = deriveTwoStreamComparison(category, panelRuns);
    if (comparison) {
      return {
        categoryId: category.categoryId,
        state: comparison.outcome === "AGREEMENT" ? "clearly_readable" : "needs_review",
        observedValue:
          comparison.machineDiscoveredReading?.observedValue ??
          firstReadableSellerRegionValue(comparison.sellerRegionReadings) ??
          null,
        supportingPanelIds: comparison.supportingPanelIds,
        supportingRegionIds: comparison.supportingRegionIds,
        reason: comparison.reason,
        comparison,
      };
    }
    return {
      categoryId: category.categoryId,
      state: "not_found",
      observedValue: null,
      supportingPanelIds: [],
      supportingRegionIds: [],
      reason: "No machine observation was recovered from any supplied panel.",
    };
  }

  const comparison = deriveTwoStreamComparison(category, panelRuns);
  if (comparison) {
    const machineObservedValue = comparison.machineDiscoveredReading?.observedValue ?? null;
    const sellerDeclaredSupported =
      comparison.outcome === "AGREEMENT" &&
      comparison.sellerRegionReadings
        .filter((reading) => reliableSellerRegionReading(category, reading))
        .some(
          (reading) =>
            reading.observedValue !== null &&
            valuesEquivalent(category.categoryId, category.expectedValue, reading.observedValue),
        ) &&
      machineObservedValue !== null &&
      comparison.machineDiscoveredReading?.state === "OBSERVED";
    return {
      categoryId: category.categoryId,
      state: sellerDeclaredSupported ? "clearly_readable" : "needs_review",
      observedValue:
        comparison.machineDiscoveredReading?.observedValue ??
        firstReadableSellerRegionValue(comparison.sellerRegionReadings) ??
        null,
      supportingPanelIds: comparison.supportingPanelIds,
      supportingRegionIds: comparison.supportingRegionIds,
      reason: comparison.reason,
      comparison,
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
  governmentWarning?: GovernmentWarningPackageFinding,
): PackageReadiness {
  const categoriesReady =
    categoryResults.length > 0 &&
    categoryResults.every(
      (category) => category.state === "clearly_readable" || category.state === "not_applicable",
    );
  const warningReady = governmentWarning ? governmentWarning.result === "PASS" : true;
  return categoriesReady && warningReady ? "ready_for_agent_submission" : "needs_seller_review";
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
  if (flaggedCategoryIds.length === 0) {
    return (
      latestRun.governmentWarning?.result === "FAIL" ||
      latestRun.governmentWarning?.result === "NEEDS_REVIEW"
    );
  }

  return flaggedCategoryIds.every((categoryId) =>
    draft.sellerChangeHistory.some(
      (change) =>
        change.sequence > latestRun.sellerChangeSequence &&
        change.categoryId === categoryId &&
        isSellerDiscrepancyAcknowledgement(change),
    ),
  );
}

export function deriveBrandIdentityEvidence(
  draft: SellerPackageDraft,
  panelRuns: readonly PackagePanelMachineRun[],
): PackageBrandIdentityEvidence {
  const declaredBrandName =
    draft.categories
      .find((category) => category.categoryId === "brandName")
      ?.expectedValue.trim() ?? "";
  const brandObservations = panelRuns
    .map((run) => ({ panelId: run.panelId, observation: run.observations.brandName }))
    .filter(({ observation }) => observation.state !== "NOT_OBSERVED");

  if (brandObservations.length === 0) {
    return {
      declaredBrandName,
      state: "NOT_LOCATED",
      observedValue: null,
      supportingPanelIds: [],
      conflictingPanelIds: [],
      rationale:
        "Seller-declared brand is package identity; OCR brand text was not located and remains non-authoritative.",
    };
  }

  const supportingPanelIds: string[] = [];
  const conflictingPanelIds: string[] = [];
  for (const { panelId, observation } of brandObservations) {
    if (!observation.value || observation.state !== "OBSERVED") {
      continue;
    }
    if (compareText(declaredBrandName, observation.value).equivalence === "different") {
      conflictingPanelIds.push(panelId);
    } else {
      supportingPanelIds.push(panelId);
    }
  }

  const first = brandObservations[0]?.observation.value ?? null;
  if (conflictingPanelIds.length > 0) {
    return {
      declaredBrandName,
      state: "CONFLICTING",
      observedValue: first,
      supportingPanelIds,
      conflictingPanelIds,
      rationale:
        "Seller-declared brand remains package identity; OCR brand text conflicts on at least one panel and is supporting evidence only.",
    };
  }
  if (supportingPanelIds.length > 0) {
    return {
      declaredBrandName,
      state: "SUPPORTED",
      observedValue: first,
      supportingPanelIds,
      conflictingPanelIds,
      rationale:
        "Seller-declared brand remains package identity; OCR brand text supports it but does not define package identity.",
    };
  }
  return {
    declaredBrandName,
    state: "INSUFFICIENT_EVIDENCE",
    observedValue: first,
    supportingPanelIds,
    conflictingPanelIds,
    rationale:
      "Seller-declared brand remains package identity; OCR brand evidence exists but is not clear enough to support or conflict.",
  };
}

export function deriveGovernmentWarningFinding(
  panelRuns: readonly PackagePanelMachineRun[],
): GovernmentWarningPackageFinding {
  return evaluateGovernmentWarningPackage(
    panelRuns
      .map((run) => run.governmentWarning)
      .filter((warning): warning is GovernmentWarningObservation => warning !== undefined),
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
  const governmentWarning = deriveGovernmentWarningFinding(args.panelRuns);
  return {
    analysisRunId: args.analysisRunId,
    sequence: args.draft.analysisRuns.length + 1,
    sellerChangeSequence: args.draft.sellerChangeHistory.length,
    recordedAt: args.recordedAt,
    panelRuns: args.panelRuns,
    categories,
    brandIdentity: deriveBrandIdentityEvidence(args.draft, args.panelRuns),
    governmentWarning,
    readiness: derivePackageReadiness(categories, governmentWarning),
  };
}

export { CANONICAL_GOVERNMENT_WARNING };

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
