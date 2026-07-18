"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { triggerDownload } from "@/features/precheck/download";

import { GuidedCategoryTask } from "./GuidedCategoryTask";
import { PackageAnnotationCanvas, type MachinePackageRegion } from "./PackageAnnotationCanvas";
import { PackageProgressHeader } from "./PackageProgressHeader";
import { ProfileExampleLabelMap } from "./ProfileExampleLabelMap";
import {
  loadPackageDraftLocally,
  savePackageDraftLocally,
  type StoredPackagePanelFile,
} from "./package-draft-store";
import {
  appendSellerChange,
  buildSellerPackageExport,
  labelForCategory,
  latestAnalysisIsCurrent,
  normalizedRegionFromObservation,
  serializeSellerPackageExport,
  validNormalizedRegion,
  type CategoryAnalysisState,
  type PackageCategoryDraft,
  type PackageCategoryId,
  type PackagePanelMetadata,
  type PackageReadiness,
  type PanelRole,
  type SellerEvidenceRegion,
  type SellerPackageChange,
  type SellerPackageChangeAction,
  type SellerPackageDraft,
} from "./package-model";
import {
  WINE_PACKAGE_CATEGORY_DEFINITIONS,
  WINE_PACKAGE_CATEGORY_INSTRUCTIONS,
  WINE_PACKAGE_PROFILE,
} from "./package-profile";
import { deriveGuidedPackageWorkflow, type PackageSaveState } from "./package-workflow";

const ACCEPTED_IMAGES = "image/png,image/jpeg";
const MAX_PACKAGE_PANELS = 6;

type AnalysisState = "idle" | "analyzing" | "complete" | "error";

interface RuntimePanel {
  panelId: string;
  file: File;
  imageUrl: string;
}

interface PackageApiSuccess {
  ok: true;
  data: { analysisRun: SellerPackageDraft["analysisRuns"][number] };
}

interface PackageApiFailure {
  ok: false;
  error: { code: string; message: string };
}

const ROLE_LABEL: Record<PanelRole, string> = {
  front: "Front panel",
  back: "Back panel",
  neck: "Neck panel",
  side: "Side panel",
  other: "Other panel",
};

const ANALYSIS_LABEL: Record<CategoryAnalysisState, string> = {
  clearly_readable: "Clearly readable",
  needs_review: "Needs review",
  not_found: "Not found",
  not_applicable: "Not applicable",
};

function now(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function newDraft(): SellerPackageDraft {
  const recordedAt = now();
  return {
    schemaVersion: "seller-package-draft.v1",
    packageId: makeId("seller-package"),
    createdAt: recordedAt,
    updatedAt: recordedAt,
    profile: WINE_PACKAGE_PROFILE,
    panels: [],
    categories: WINE_PACKAGE_CATEGORY_DEFINITIONS.map((definition) => ({
      categoryId: definition.categoryId,
      decision: "provided",
      expectedValue: "",
      regions: [],
    })),
    sellerChangeHistory: [],
    analysisRuns: [],
  };
}

async function checksumSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }
  return await new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("PACKAGE_IMAGE_DIMENSIONS_UNAVAILABLE"));
    };
    image.src = url;
  });
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function orderedPanelFiles(
  draft: SellerPackageDraft,
  runtimePanels: readonly RuntimePanel[],
): StoredPackagePanelFile[] {
  const byId = new Map(runtimePanels.map((panel) => [panel.panelId, panel.file]));
  return [...draft.panels]
    .sort((left, right) => left.order - right.order)
    .map((panel) => {
      const file = byId.get(panel.panelId);
      if (!file) throw new Error("PACKAGE_PANEL_FILE_MISSING");
      return { panelId: panel.panelId, file };
    });
}

function changeFor(args: {
  action: SellerPackageChangeAction;
  detail: string;
  category?: PackageCategoryDraft;
  panel?: PackagePanelMetadata;
  region?: SellerEvidenceRegion;
}): Omit<SellerPackageChange, "sequence"> {
  return {
    changeId: makeId("seller-change"),
    recordedAt: now(),
    action: args.action,
    categoryId: args.category?.categoryId ?? args.region?.categoryId,
    panelId: args.panel?.panelId ?? args.region?.panelId,
    regionId: args.region?.regionId,
    categorySnapshot: args.category
      ? {
          categoryId: args.category.categoryId,
          decision: args.category.decision,
          expectedValue: args.category.expectedValue,
        }
      : undefined,
    panelSnapshot: args.panel,
    regionSnapshot: args.region,
    detail: args.detail,
  };
}

function readinessLabel(readiness: PackageReadiness | undefined, analysisCurrent = true): string {
  if (readiness === "ready_for_agent_submission" && !analysisCurrent) {
    return "Reanalysis required after seller changes";
  }
  return readiness === "ready_for_agent_submission"
    ? "Ready for local agent-package export"
    : "Seller review required";
}

function restoredSaveState(draft: SellerPackageDraft): PackageSaveState {
  const lastAction = draft.sellerChangeHistory.at(-1)?.action;
  return lastAction === "draft_saved" ||
    lastAction === "analysis_completed" ||
    lastAction === "agent_package_exported"
    ? "saved"
    : "unsaved";
}

function sameRegion(left: SellerEvidenceRegion, right: SellerEvidenceRegion): boolean {
  return (
    left.regionId === right.regionId &&
    left.categoryId === right.categoryId &&
    left.panelId === right.panelId &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

export function PackagePreparationWorkspace() {
  const [draft, setDraft] = useState<SellerPackageDraft | null>(null);
  const [runtimePanels, setRuntimePanels] = useState<RuntimePanel[]>([]);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<PackageCategoryId>("brandName");
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [workingRegion, setWorkingRegion] = useState<SellerEvidenceRegion | null>(null);
  const [workingValue, setWorkingValue] = useState("");
  const [acceptingCategory, setAcceptingCategory] = useState(false);
  const [learnComplete, setLearnComplete] = useState(false);
  const [optionalRole, setOptionalRole] =
    useState<Extract<PanelRole, "neck" | "side" | "other">>("neck");
  const [saveState, setSaveState] = useState<PackageSaveState>("unsaved");
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [submitter, setSubmitter] = useState("");
  const [message, setMessage] = useState(
    "Upload the front and back panels, then prepare each category before analysis.",
  );
  const [restoring, setRestoring] = useState(true);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const draftRef = useRef<SellerPackageDraft | null>(null);
  const runtimePanelsRef = useRef<RuntimePanel[]>([]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls = objectUrlsRef.current;
    void loadPackageDraftLocally()
      .then((stored) => {
        if (cancelled) return;
        if (!stored) {
          const initial = newDraft();
          draftRef.current = initial;
          setDraft(initial);
          return;
        }
        const runtime = stored.panelFiles.map(({ panelId, file }) => {
          const imageUrl = URL.createObjectURL(file);
          objectUrls.add(imageUrl);
          return { panelId, file, imageUrl };
        });
        draftRef.current = stored.draft;
        runtimePanelsRef.current = runtime;
        setDraft(stored.draft);
        setRuntimePanels(runtime);
        setActivePanelId(stored.draft.panels[0]?.panelId ?? null);
        setLearnComplete(stored.draft.panels.length > 0);
        setSaveState(restoredSaveState(stored.draft));
        setAnalysisState(stored.draft.analysisRuns.length > 0 ? "complete" : "idle");
        setMessage("Restored the last locally saved seller package draft in this browser.");
      })
      .catch(() => {
        if (!cancelled) {
          const initial = newDraft();
          draftRef.current = initial;
          setDraft(initial);
          setSaveState("error");
          setMessage(
            "Local draft storage is unavailable. You may continue, but reload recovery cannot be promised.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
      objectUrls.clear();
    };
  }, []);

  const activePanel = draft?.panels.find((panel) => panel.panelId === activePanelId) ?? null;
  const activeRuntimePanel = runtimePanels.find((panel) => panel.panelId === activePanelId) ?? null;
  const activeCategory =
    draft?.categories.find((category) => category.categoryId === activeCategoryId) ?? null;
  const activeDefinition = WINE_PACKAGE_CATEGORY_DEFINITIONS.find(
    (definition) => definition.categoryId === activeCategoryId,
  );
  const activeInstruction = WINE_PACKAGE_CATEGORY_INSTRUCTIONS.find(
    (instruction) => instruction.categoryId === activeCategoryId,
  );
  const activePanelForWorkingId = activePanel?.panelId ?? null;
  const activeCategoryExpectedValue = activeCategory?.expectedValue ?? "";
  const activeCategoryRegions = activeCategory?.regions;
  const latestRun = draft?.analysisRuns.at(-1);
  const analysisCurrent = draft ? latestAnalysisIsCurrent(draft) : false;
  const latestCategoryResult = latestRun?.categories.find(
    (category) => category.categoryId === activeCategoryId,
  );
  const workflow = draft
    ? deriveGuidedPackageWorkflow({
        draft,
        definitions: WINE_PACKAGE_CATEGORY_DEFINITIONS,
        instructions: WINE_PACKAGE_CATEGORY_INSTRUCTIONS,
        saveState,
        learnComplete,
      })
    : null;
  const canAnalyze =
    workflow?.readyForPrecheck === true &&
    analysisState !== "analyzing" &&
    draft?.panels.length === runtimePanels.length;
  const canExport =
    latestRun?.readiness === "ready_for_agent_submission" &&
    analysisCurrent &&
    saveState === "saved" &&
    submitter.trim() !== "";

  useEffect(() => {
    if (!activePanelForWorkingId || !activeCategoryRegions || !activeInstruction) {
      setWorkingRegion(null);
      setWorkingValue(activeCategoryExpectedValue);
      setActiveRegionId(null);
      return;
    }
    const existing = activeCategoryRegions.find(
      (region) => region.panelId === activePanelForWorkingId,
    );
    const nextRegion: SellerEvidenceRegion = existing ?? {
      regionId: makeId("working-region"),
      categoryId: activeCategoryId,
      panelId: activePanelForWorkingId,
      unit: "normalized-panel-relative",
      provenance: "seller-selected-region",
      ...activeInstruction.starterRegion,
    };
    setWorkingValue(activeCategoryExpectedValue);
    setWorkingRegion(nextRegion);
    setActiveRegionId(nextRegion.regionId);
  }, [
    activeCategoryExpectedValue,
    activeCategoryRegions,
    activeCategoryId,
    activeInstruction,
    activePanelForWorkingId,
  ]);

  const machineRegions = useMemo<MachinePackageRegion[]>(() => {
    if (!activePanel || !latestRun) return [];
    const panelRun = latestRun.panelRuns.find((run) => run.panelId === activePanel.panelId);
    if (!panelRun) return [];
    return WINE_PACKAGE_CATEGORY_DEFINITIONS.flatMap((definition) => {
      const observation = panelRun.observations[definition.categoryId];
      const geometry = observation.geometry;
      if (!geometry || geometry.imageWidth <= 0 || geometry.imageHeight <= 0) return [];
      return [
        {
          categoryId: definition.categoryId,
          panelId: activePanel.panelId,
          state: observation.state,
          x: geometry.x / geometry.imageWidth,
          y: geometry.y / geometry.imageHeight,
          width: geometry.width / geometry.imageWidth,
          height: geometry.height / geometry.imageHeight,
        },
      ];
    });
  }, [activePanel, latestRun]);

  function updateDraft(next: SellerPackageDraft, nextMessage?: string) {
    draftRef.current = next;
    setDraft(next);
    setSaveState("unsaved");
    if (nextMessage) setMessage(nextMessage);
  }

  function selectCategory(categoryId: PackageCategoryId, sourceDraft = draftRef.current) {
    setActiveCategoryId(categoryId);
    setActiveRegionId(null);
    if (!sourceDraft) return;
    const category = sourceDraft.categories.find(
      (candidate) => candidate.categoryId === categoryId,
    );
    const instruction = WINE_PACKAGE_CATEGORY_INSTRUCTIONS.find(
      (candidate) => candidate.categoryId === categoryId,
    );
    const preferredPanelId =
      category?.regions[0]?.panelId ??
      sourceDraft.panels.find((panel) => panel.role === instruction?.examplePanelRole)?.panelId ??
      sourceDraft.panels[0]?.panelId ??
      null;
    setActivePanelId(preferredPanelId);
  }

  function selectAdjacentCategory(direction: -1 | 1, sourceDraft = draftRef.current) {
    if (!sourceDraft) return;
    const sourceRun = sourceDraft.analysisRuns.at(-1);
    const definitions =
      sourceRun?.readiness === "needs_seller_review"
        ? WINE_PACKAGE_CATEGORY_DEFINITIONS.filter((definition) => {
            const result = sourceRun.categories.find(
              (category) => category.categoryId === definition.categoryId,
            );
            return (
              result && result.state !== "clearly_readable" && result.state !== "not_applicable"
            );
          })
        : WINE_PACKAGE_CATEGORY_DEFINITIONS;
    if (definitions.length === 0) return;
    const currentIndex = Math.max(
      0,
      definitions.findIndex((definition) => definition.categoryId === activeCategoryId),
    );
    const nextIndex = (currentIndex + direction + definitions.length) % definitions.length;
    selectCategory(definitions[nextIndex].categoryId, sourceDraft);
  }

  function selectNextFocusedCategory(sourceDraft: SellerPackageDraft) {
    const nextWorkflow = deriveGuidedPackageWorkflow({
      draft: sourceDraft,
      definitions: WINE_PACKAGE_CATEGORY_DEFINITIONS,
      instructions: WINE_PACKAGE_CATEGORY_INSTRUCTIONS,
      saveState: "unsaved",
      learnComplete: true,
    });
    const nextCategoryId = nextWorkflow.focusCategoryIds.find(
      (categoryId) => categoryId !== activeCategoryId,
    );
    if (nextCategoryId) selectCategory(nextCategoryId, sourceDraft);
  }

  async function receivePanel(role: PanelRole, file: File | undefined, panelId?: string) {
    if (!draftRef.current || !file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setMessage("That panel was not added. Choose a PNG or JPEG image.");
      return;
    }
    if (!panelId && draftRef.current.panels.length >= MAX_PACKAGE_PANELS) {
      setMessage(`This slice supports at most ${MAX_PACKAGE_PANELS} panels in one package.`);
      return;
    }
    setMessage(`Reading ${ROLE_LABEL[role].toLowerCase()} metadata locally…`);
    try {
      const [checksum, dimensions] = await Promise.all([
        checksumSha256(file),
        imageDimensions(file),
      ]);
      const currentDraft = draftRef.current;
      if (!currentDraft) return;
      const existing = panelId
        ? currentDraft.panels.find((panel) => panel.panelId === panelId)
        : currentDraft.panels.find(
            (panel) => panel.role === role && (role === "front" || role === "back"),
          );
      // Replacing image bytes creates a new artifact identity. Current seller
      // regions are not silently carried onto different pixels; their prior
      // snapshots remain in append-only history.
      const identity = makeId("package-panel");
      const panel: PackagePanelMetadata = {
        panelId: identity,
        order: existing?.order ?? currentDraft.panels.length,
        role,
        displayName: file.name,
        mediaType: file.type,
        byteSize: file.size,
        checksumSha256: checksum,
        width: dimensions.width,
        height: dimensions.height,
        rotation: 0,
      };
      const panels = existing
        ? currentDraft.panels.map((candidate) =>
            candidate.panelId === existing.panelId ? panel : candidate,
          )
        : [...currentDraft.panels, panel];
      const categories = existing
        ? currentDraft.categories.map((category) => ({
            ...category,
            regions: category.regions.filter((region) => region.panelId !== existing.panelId),
          }))
        : currentDraft.categories;
      let next = { ...currentDraft, panels, categories };
      next = appendSellerChange(
        next,
        changeFor({
          action: existing ? "panel_replaced" : "panel_added",
          panel,
          detail: existing
            ? `${ROLE_LABEL[role]} artifact ${existing.panelId} replaced by ${identity}; prior current regions were removed and remain in history.`
            : `${ROLE_LABEL[role]} added; checksum and dimensions recorded.`,
        }),
      );
      const oldRuntime = runtimePanelsRef.current.find(
        (candidate) => candidate.panelId === existing?.panelId,
      );
      if (oldRuntime) {
        URL.revokeObjectURL(oldRuntime.imageUrl);
        objectUrlsRef.current.delete(oldRuntime.imageUrl);
      }
      const imageUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(imageUrl);
      const nextRuntime = [
        ...runtimePanelsRef.current.filter((candidate) => candidate.panelId !== existing?.panelId),
        { panelId: identity, file, imageUrl },
      ];
      runtimePanelsRef.current = nextRuntime;
      setRuntimePanels(nextRuntime);
      setLearnComplete(true);
      const activeCategoryInstruction = WINE_PACKAGE_CATEGORY_INSTRUCTIONS.find(
        (instruction) => instruction.categoryId === activeCategoryId,
      );
      setActivePanelId(
        panels.find((candidate) => candidate.role === activeCategoryInstruction?.examplePanelRole)
          ?.panelId ?? identity,
      );
      updateDraft(
        next,
        `${ROLE_LABEL[role]} saved in the working draft. Save the draft to persist it.`,
      );
    } catch {
      setMessage("That image could not be prepared. The existing panel was preserved.");
    }
  }

  function removePanel(panelId: string) {
    if (!draft) return;
    const panel = draft.panels.find((candidate) => candidate.panelId === panelId);
    if (!panel || panel.role === "front" || panel.role === "back") return;
    const categories = draft.categories.map((category) => ({
      ...category,
      regions: category.regions.filter((region) => region.panelId !== panelId),
    }));
    let next = {
      ...draft,
      panels: draft.panels
        .filter((candidate) => candidate.panelId !== panelId)
        .map((candidate, order) => ({ ...candidate, order })),
      categories,
    };
    next = appendSellerChange(
      next,
      changeFor({ action: "panel_removed", panel, detail: `${ROLE_LABEL[panel.role]} removed.` }),
    );
    const runtime = runtimePanels.find((candidate) => candidate.panelId === panelId);
    if (runtime) {
      URL.revokeObjectURL(runtime.imageUrl);
      objectUrlsRef.current.delete(runtime.imageUrl);
    }
    const nextRuntime = runtimePanelsRef.current.filter(
      (candidate) => candidate.panelId !== panelId,
    );
    runtimePanelsRef.current = nextRuntime;
    setRuntimePanels(nextRuntime);
    setActivePanelId(next.panels[0]?.panelId ?? null);
    setActiveRegionId(null);
    updateDraft(next, "Optional panel removed. Historical machine runs remain unchanged.");
  }

  function commitRegion(
    region: SellerEvidenceRegion,
    action: Extract<SellerPackageChangeAction, "region_added" | "region_moved" | "region_resized">,
  ) {
    if (!draft) return;
    const category = draft.categories.find((item) => item.categoryId === region.categoryId);
    if (!category) return;
    const exists = category.regions.some((item) => item.regionId === region.regionId);
    const updatedCategory = {
      ...category,
      decision: "provided" as const,
      regions: exists
        ? category.regions.map((item) => (item.regionId === region.regionId ? region : item))
        : [...category.regions, region],
    };
    const categories = draft.categories.map((item) =>
      item.categoryId === region.categoryId ? updatedCategory : item,
    );
    const next = appendSellerChange(
      { ...draft, categories },
      changeFor({
        action,
        region,
        detail: `${labelForCategory(region.categoryId)} seller region ${exists ? "updated" : "added"} on panel ${region.panelId}.`,
      }),
    );
    setActiveRegionId(region.regionId);
    updateDraft(next);
  }

  function removeRegion(regionId: string) {
    if (!draft) return;
    const region = draft.categories
      .flatMap((category) => category.regions)
      .find((candidate) => candidate.regionId === regionId);
    if (!region) return;
    const categories = draft.categories.map((category) => ({
      ...category,
      regions: category.regions.filter((candidate) => candidate.regionId !== regionId),
    }));
    const next = appendSellerChange(
      { ...draft, categories },
      changeFor({ action: "region_removed", region, detail: "Seller evidence region removed." }),
    );
    setActiveRegionId(null);
    updateDraft(next, "Seller region removed. The change is preserved in append-only history.");
  }

  function rotatePanel(rotation: PackagePanelMetadata["rotation"]) {
    if (!draft || !activePanel) return;
    const panel = { ...activePanel, rotation };
    const next = appendSellerChange(
      {
        ...draft,
        panels: draft.panels.map((candidate) =>
          candidate.panelId === panel.panelId ? panel : candidate,
        ),
      },
      changeFor({
        action: "panel_rotated",
        panel,
        detail: `${ROLE_LABEL[panel.role]} view rotated to ${rotation} degrees.`,
      }),
    );
    updateDraft(next);
  }

  function useMachineRegion() {
    if (!draft || !activePanel || !latestRun) return;
    const observation = latestRun.panelRuns.find((run) => run.panelId === activePanel.panelId)
      ?.observations[activeCategoryId];
    if (!observation) return;
    const region = normalizedRegionFromObservation({
      observation,
      panel: activePanel,
      categoryId: activeCategoryId,
      regionId: makeId("region"),
    });
    if (!region) {
      setMessage("No contained machine region is available for this category on the active panel.");
      return;
    }
    setWorkingRegion(region);
    setActiveRegionId(region.regionId);
    setMessage(
      "Machine geometry was copied into the uncommitted working box. Accept the category to save seller evidence; the machine observation remains unchanged.",
    );
  }

  async function checkpointCategory(next: SellerPackageDraft, successMessage: string) {
    setAcceptingCategory(true);
    try {
      await savePackageDraftLocally({
        draft: next,
        panelFiles: orderedPanelFiles(next, runtimePanelsRef.current),
      });
      draftRef.current = next;
      setDraft(next);
      setSaveState("unsaved");
      setMessage(successMessage);
      selectNextFocusedCategory(next);
      return true;
    } catch {
      setSaveState("error");
      setMessage(
        "This category was not accepted because the local recovery checkpoint failed. Nothing was added to seller history, and the workflow did not advance.",
      );
      return false;
    } finally {
      setAcceptingCategory(false);
    }
  }

  async function acceptActiveCategory() {
    if (!draft || !activeCategory || !activeDefinition) return;
    if (activeDefinition.requiresValue && workingValue.trim() === "") {
      setMessage(`Enter the ${activeDefinition.label.toLowerCase()} exactly as it appears.`);
      return;
    }
    const acceptedRegion =
      workingRegion && validNormalizedRegion(workingRegion) ? workingRegion : null;
    if (!acceptedRegion && activeCategory.regions.length === 0) {
      setMessage("Move, resize, or draw a non-empty evidence box before accepting this category.");
      return;
    }

    const existingRegion = acceptedRegion
      ? activeCategory.regions.find((region) => region.regionId === acceptedRegion.regionId)
      : undefined;
    const regions = acceptedRegion
      ? existingRegion
        ? activeCategory.regions.map((region) =>
            region.regionId === acceptedRegion.regionId ? acceptedRegion : region,
          )
        : [...activeCategory.regions, acceptedRegion]
      : activeCategory.regions;
    const updatedCategory: PackageCategoryDraft = {
      ...activeCategory,
      decision: "provided",
      expectedValue: workingValue.trim(),
      regions,
    };
    let next: SellerPackageDraft = {
      ...draft,
      categories: draft.categories.map((category) =>
        category.categoryId === activeCategoryId ? updatedCategory : category,
      ),
    };
    const categoryChanged =
      activeCategory.decision !== updatedCategory.decision ||
      activeCategory.expectedValue !== updatedCategory.expectedValue;
    if (categoryChanged) {
      next = appendSellerChange(
        next,
        changeFor({
          action: "category_updated",
          category: updatedCategory,
          detail: `${activeDefinition.label} seller value and decision explicitly accepted.`,
        }),
      );
    }
    if (acceptedRegion && (!existingRegion || !sameRegion(existingRegion, acceptedRegion))) {
      const action: Extract<
        SellerPackageChangeAction,
        "region_added" | "region_moved" | "region_resized"
      > = !existingRegion
        ? "region_added"
        : existingRegion.width !== acceptedRegion.width ||
            existingRegion.height !== acceptedRegion.height
          ? "region_resized"
          : "region_moved";
      next = appendSellerChange(
        next,
        changeFor({
          action,
          region: acceptedRegion,
          detail: `${activeDefinition.label} working box explicitly accepted on panel ${acceptedRegion.panelId}.`,
        }),
      );
    }

    if (
      !categoryChanged &&
      (!acceptedRegion || (existingRegion && sameRegion(existingRegion, acceptedRegion)))
    ) {
      setMessage(
        `${activeDefinition.label} was already accepted; seller history was not duplicated.`,
      );
      selectNextFocusedCategory(draft);
      return;
    }
    await checkpointCategory(
      next,
      `${activeDefinition.label} accepted and recovery-checkpointed in this browser. Save the whole package before pre-check.`,
    );
  }

  async function markActiveCategoryNeedsAttention() {
    if (!draft || !activeCategory || !activeDefinition) return;
    const updatedCategory: PackageCategoryDraft = {
      ...activeCategory,
      decision: "unresolved",
      expectedValue: workingValue.trim(),
    };
    const next = appendSellerChange(
      {
        ...draft,
        categories: draft.categories.map((category) =>
          category.categoryId === activeCategoryId ? updatedCategory : category,
        ),
      },
      changeFor({
        action: "category_updated",
        category: updatedCategory,
        detail: `${activeDefinition.label} explicitly marked as needing seller attention.`,
      }),
    );
    await checkpointCategory(
      next,
      `${activeDefinition.label} remains incomplete and was recovery-checkpointed without guessing.`,
    );
  }

  async function saveDraft() {
    if (!draft) return;
    setSaveState("saving");
    try {
      const saved = appendSellerChange(
        draft,
        changeFor({ action: "draft_saved", detail: "Seller package draft saved locally." }),
      );
      await savePackageDraftLocally({
        draft: saved,
        panelFiles: orderedPanelFiles(saved, runtimePanels),
      });
      draftRef.current = saved;
      setDraft(saved);
      setSaveState("saved");
      setMessage(
        "Draft saved in this browser. This is local browser storage, not server persistence or transmission.",
      );
    } catch {
      setSaveState("error");
      setMessage(
        "The draft could not be saved locally. Analysis remains disabled until save succeeds.",
      );
    }
  }

  async function analyzePackage() {
    if (!draft || !canAnalyze) return;
    setAnalysisState("analyzing");
    setMessage(
      "Analyzing the saved panels. Existing machine runs and seller changes are preserved.",
    );
    const body = new FormData();
    body.set("packageDraft", JSON.stringify(draft));
    for (const { file } of orderedPanelFiles(draft, runtimePanels)) body.append("file", file);
    try {
      const response = await fetch("/api/package/analyze", { method: "POST", body });
      const result = (await response.json()) as PackageApiSuccess | PackageApiFailure;
      if (!result.ok) throw new Error(result.error.message);
      let analyzed = { ...draft, analysisRuns: [...draft.analysisRuns, result.data.analysisRun] };
      analyzed = appendSellerChange(
        analyzed,
        changeFor({
          action: "analysis_completed",
          detail: `Package analysis run ${result.data.analysisRun.sequence} completed.`,
        }),
      );
      setSaveState("saving");
      await savePackageDraftLocally({
        draft: analyzed,
        panelFiles: orderedPanelFiles(analyzed, runtimePanels),
      });
      draftRef.current = analyzed;
      setDraft(analyzed);
      setSaveState("saved");
      setAnalysisState("complete");
      const firstFlagged = result.data.analysisRun.categories.find(
        (category) => category.state !== "clearly_readable" && category.state !== "not_applicable",
      );
      if (firstFlagged) selectCategory(firstFlagged.categoryId, analyzed);
      setMessage(
        `${readinessLabel(result.data.analysisRun.readiness)}. Correct evidence in this workspace and save before reanalysis.`,
      );
    } catch (error) {
      setAnalysisState("error");
      setMessage(
        error instanceof Error && error.message
          ? `Analysis did not complete: ${error.message}`
          : "Analysis did not complete. The saved draft and prior runs were preserved.",
      );
    }
  }

  async function exportAgentPackage() {
    if (!draft || !canExport) return;
    try {
      const exportedAt = now();
      const recorded = appendSellerChange(
        draft,
        changeFor({
          action: "agent_package_exported",
          detail: "Seller-prepared package downloaded locally; no transmission occurred.",
        }),
      );
      const value = await buildSellerPackageExport({
        draft: recorded,
        submittedBy: submitter,
        submittedAt: exportedAt,
      });
      await savePackageDraftLocally({
        draft: recorded,
        panelFiles: orderedPanelFiles(recorded, runtimePanels),
      });
      draftRef.current = recorded;
      setDraft(recorded);
      triggerDownload({
        content: serializeSellerPackageExport(value),
        filename: `${draft.packageId}.seller-agent-package.json`,
        mimeType: "application/json;charset=utf-8",
      });
      setMessage(
        "Seller-prepared agent package downloaded locally. Nothing was sent to an agent or to TTB.",
      );
    } catch {
      setMessage("The local agent-package download could not be created. Nothing was transmitted.");
    }
  }

  if (restoring || !draft || !workflow) {
    return <p role="status">Restoring the locally saved package draft…</p>;
  }

  const focusedDefinitions =
    latestRun?.readiness === "needs_seller_review"
      ? WINE_PACKAGE_CATEGORY_DEFINITIONS.filter((definition) =>
          workflow.flaggedCategoryIds.includes(definition.categoryId),
        )
      : WINE_PACKAGE_CATEGORY_DEFINITIONS;
  const activeTaskPosition = Math.max(
    0,
    focusedDefinitions.findIndex((definition) => definition.categoryId === activeCategoryId),
  );

  return (
    <section className="flex min-w-0 flex-col gap-8">
      <PackageProgressHeader
        packageId={draft.packageId}
        workflow={workflow}
        saveState={saveState}
        analysisRunCount={draft.analysisRuns.length}
        message={message}
      />

      {!learnComplete ? (
        <ProfileExampleLabelMap
          instructions={WINE_PACKAGE_CATEGORY_INSTRUCTIONS}
          onContinue={() => {
            setLearnComplete(true);
            setMessage("Example reviewed. Upload the required front and back label panels.");
          }}
        />
      ) : (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Reopen the synthetic example label map
          </summary>
          <div className="mt-3">
            <ProfileExampleLabelMap
              instructions={WINE_PACKAGE_CATEGORY_INSTRUCTIONS}
              onContinue={() => setLearnComplete(true)}
            />
          </div>
        </details>
      )}

      <section className="flex min-w-0 flex-col gap-4" aria-labelledby="package-panels-heading">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Phase B · Upload
          </p>
          <h2 id="package-panels-heading" className="text-2xl font-semibold">
            Upload the front and back label panels
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Front and back are required and remain independent artifacts. Each panel keeps its own
            identity, checksum, dimensions, orientation, and coordinate frame.
          </p>
        </div>

        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {(["front", "back"] as const).map((role) => {
            const panel = draft.panels.find((candidate) => candidate.role === role);
            return (
              <div key={role} className="min-w-0 rounded-md border border-border p-4">
                <Label htmlFor={`package-panel-${role}`}>{ROLE_LABEL[role]} image</Label>
                <p className="mb-2 text-xs text-muted-foreground">Required · PNG or JPEG</p>
                <Input
                  id={`package-panel-${role}`}
                  type="file"
                  accept={ACCEPTED_IMAGES}
                  onChange={(event) => void receivePanel(role, event.target.files?.[0])}
                />
                {panel ? (
                  <p className="mt-2 break-words text-xs">
                    {panel.displayName} · {panel.width}×{panel.height} ·{" "}
                    {formatBytes(panel.byteSize)}
                    <br />
                    <span className="font-mono">SHA-256 {panel.checksumSha256.slice(0, 16)}…</span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Not uploaded</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="min-w-0 rounded-md border border-dashed border-border p-4">
          <h3 className="font-semibold">Optional additional panels</h3>
          <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div>
              <Label htmlFor="optional-panel-role">Panel role</Label>
              <select
                id="optional-panel-role"
                className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={optionalRole}
                onChange={(event) =>
                  setOptionalRole(
                    event.target.value as Extract<PanelRole, "neck" | "side" | "other">,
                  )
                }
              >
                <option value="neck">Neck</option>
                <option value="side">Side</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label htmlFor="optional-panel-image">Add panel image</Label>
              <Input
                id="optional-panel-image"
                type="file"
                accept={ACCEPTED_IMAGES}
                onChange={(event) => void receivePanel(optionalRole, event.target.files?.[0])}
              />
            </div>
          </div>
          {draft.panels.some((panel) => panel.role !== "front" && panel.role !== "back") ? (
            <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
              {draft.panels
                .filter((panel) => panel.role !== "front" && panel.role !== "back")
                .map((panel) => (
                  <div key={panel.panelId} className="min-w-0 rounded border border-border p-3">
                    <p className="break-words text-sm font-semibold">
                      {ROLE_LABEL[panel.role]} · {panel.displayName}
                    </p>
                    <Label htmlFor={`replace-${panel.panelId}`} className="mt-2 block text-xs">
                      Replace this panel image
                    </Label>
                    <Input
                      id={`replace-${panel.panelId}`}
                      type="file"
                      accept={ACCEPTED_IMAGES}
                      onChange={(event) =>
                        void receivePanel(panel.role, event.target.files?.[0], panel.panelId)
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => removePanel(panel.panelId)}
                    >
                      Remove optional panel
                    </Button>
                  </div>
                ))}
            </div>
          ) : null}
        </div>

        {draft.panels.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-2" aria-label="Package panels">
            {[...draft.panels]
              .sort((left, right) => left.order - right.order)
              .map((panel) => (
                <div key={panel.panelId} className="flex min-w-0 max-w-full items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={panel.panelId === activePanelId ? "default" : "outline"}
                    aria-pressed={panel.panelId === activePanelId}
                    onClick={() => {
                      setActivePanelId(panel.panelId);
                      setActiveRegionId(
                        panel.panelId === workingRegion?.panelId ? workingRegion.regionId : null,
                      );
                    }}
                  >
                    {ROLE_LABEL[panel.role]}
                  </Button>
                  {panel.role !== "front" && panel.role !== "back" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Remove ${ROLE_LABEL[panel.role]}`}
                      onClick={() => removePanel(panel.panelId)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
          </div>
        ) : null}
      </section>

      {workflow.frontUploaded && workflow.backUploaded ? (
        <section
          className="flex min-w-0 flex-col gap-4"
          aria-labelledby="category-checklist-heading"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {latestRun?.readiness === "needs_seller_review"
                ? "Phase E · Fix flagged categories"
                : "Phase C · Mark one category at a time"}
            </p>
            <h2 id="category-checklist-heading" className="text-2xl font-semibold">
              {latestRun?.readiness === "needs_seller_review"
                ? "Correct only what the pre-check flagged"
                : "Prepare the reviewed profile evidence"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {latestRun?.readiness === "needs_seller_review"
                ? "Passing categories stay out of the correction queue. Seller edits make the prior run stale until save and re-check."
                : "The active reviewed profile currently contains brand name and alcohol statement only. Accept each task explicitly; uncertainty never counts as ready."}
            </p>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2" aria-label="Category progress">
            {focusedDefinitions.map((definition) => {
              const status = workflow.categoryStatuses.find(
                (candidate) => candidate.categoryId === definition.categoryId,
              );
              const result = latestRun?.categories.find(
                (candidate) => candidate.categoryId === definition.categoryId,
              );
              return (
                <button
                  key={definition.categoryId}
                  type="button"
                  className={`min-w-0 rounded-md border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    activeCategoryId === definition.categoryId
                      ? "border-primary bg-muted/40"
                      : "border-border"
                  }`}
                  aria-pressed={activeCategoryId === definition.categoryId}
                  onClick={() => selectCategory(definition.categoryId)}
                >
                  <span className="block font-semibold">{definition.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {status?.complete
                      ? "Accepted"
                      : status?.needsAttention
                        ? "Needs attention — readiness blocked"
                        : "Incomplete"}
                    {result ? ` · ${ANALYSIS_LABEL[result.state]}` : " · Pre-check not run"}
                  </span>
                </button>
              );
            })}
          </div>

          {activePanel &&
          activeRuntimePanel &&
          activeCategory &&
          activeDefinition &&
          activeInstruction ? (
            <>
              {latestCategoryResult ? (
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 p-3 text-sm">
                  <span>
                    Pre-check: <strong>{ANALYSIS_LABEL[latestCategoryResult.state]}</strong>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      !machineRegions.some((region) => region.categoryId === activeCategoryId)
                    }
                    onClick={useMachineRegion}
                  >
                    Use machine box as working suggestion
                  </Button>
                </div>
              ) : null}
              <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
                <PackageAnnotationCanvas
                  panel={activePanel}
                  imageUrl={activeRuntimePanel.imageUrl}
                  activeCategoryId={activeCategoryId}
                  regions={activeCategory.regions.filter(
                    (region) => region.panelId === activePanelId,
                  )}
                  workingRegion={workingRegion?.panelId === activePanelId ? workingRegion : null}
                  machineRegions={machineRegions}
                  activeRegionId={activeRegionId}
                  onActiveRegionChange={setActiveRegionId}
                  onRegionCommit={commitRegion}
                  onRegionRemove={removeRegion}
                  onWorkingRegionChange={(region) => {
                    setWorkingRegion(region);
                    setActiveRegionId(region.regionId);
                  }}
                  onWorkingRegionDiscard={() => {
                    setWorkingRegion(null);
                    setActiveRegionId(null);
                    setMessage("Working box discarded. Accepted seller evidence was unchanged.");
                  }}
                  onPanelRotationChange={rotatePanel}
                />

                <GuidedCategoryTask
                  definition={activeDefinition}
                  instruction={activeInstruction}
                  category={activeCategory}
                  analysis={latestCategoryResult}
                  taskPosition={activeTaskPosition + 1}
                  taskCount={focusedDefinitions.length}
                  workingValue={workingValue}
                  pendingRegionAvailable={Boolean(
                    workingRegion && validNormalizedRegion(workingRegion),
                  )}
                  accepting={acceptingCategory}
                  onWorkingValueChange={setWorkingValue}
                  onAccept={() => void acceptActiveCategory()}
                  onNeedsAttention={() => void markActiveCategoryNeedsAttention()}
                  onBack={() => selectAdjacentCategory(-1)}
                  onNext={() => selectAdjacentCategory(1)}
                />
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              Select a package panel to open the focused evidence task.
            </p>
          )}
        </section>
      ) : (
        <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          Upload both required panels to begin category marking. No starter box is saved before
          explicit category acceptance.
        </p>
      )}

      <section
        className="flex min-w-0 flex-col gap-4 rounded-md border border-border p-5"
        aria-labelledby="package-actions-heading"
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Phase D · Save and pre-check
          </p>
          <h2 id="package-actions-heading" className="text-2xl font-semibold">
            Save the package, then run the pre-check
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Category acceptance creates a local recovery checkpoint. This explicit package save is
            still required before analysis and remains local to this browser.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void saveDraft()}
            disabled={saveState === "saving"}
          >
            Save draft locally
          </Button>
          <Button type="button" onClick={() => void analyzePackage()} disabled={!canAnalyze}>
            {analysisState === "analyzing" ? "Analyzing package…" : "Analyze saved package"}
          </Button>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Front panel uploaded:{" "}
            {draft.panels.some((panel) => panel.role === "front") ? "yes" : "no"}
          </li>
          <li>
            Back panel uploaded:{" "}
            {draft.panels.some((panel) => panel.role === "back") ? "yes" : "no"}
          </li>
          <li>
            All required categories accepted: {workflow.completedCategoryCount}/
            {workflow.totalCategoryCount}
          </li>
          <li>Saved before analysis: {saveState === "saved" ? "yes" : "no"}</li>
        </ul>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Phase F · Prepare for agent
          </p>
          <h3 className="font-semibold">Prepare a local-only agent package</h3>
          <p className="text-sm text-muted-foreground">
            In this slice, “Submit to agent” creates a local, auditable download only. No receiver
            is configured; nothing is transmitted to an agent, TTB, or any government system.
          </p>
          <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <Label htmlFor="package-submitter">Seller or submitter name</Label>
              <Input
                id="package-submitter"
                value={submitter}
                onChange={(event) => setSubmitter(event.target.value)}
              />
            </div>
            <Button
              type="button"
              className="self-end"
              disabled={!canExport}
              onClick={() => void exportAgentPackage()}
            >
              Submit to agent — download locally
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Export gate: {readinessLabel(latestRun?.readiness, analysisCurrent)} · local download
            only · not a TTB submission or approval.
          </p>
        </div>
      </section>
    </section>
  );
}
