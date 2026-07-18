"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { triggerDownload } from "@/features/precheck/download";

import { GuidedCategoryTask } from "./GuidedCategoryTask";
import { PackageAnnotationCanvas, type MachinePackageRegion } from "./PackageAnnotationCanvas";
import { PackageProgressFooter } from "./PackageProgressFooter";
import { PackageUploadDecisions } from "./PackageUploadDecisions";
import {
  PackageWorkstationControls,
  type WorkstationPrimaryAction,
} from "./PackageWorkstationControls";
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
  packagePanelDecisions,
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
    panelDecisions: { back: "unresolved", additional: "unresolved" },
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [editingPanels, setEditingPanels] = useState(false);
  const [reviewingEvidence, setReviewingEvidence] = useState(false);
  const [optionalRole, setOptionalRole] =
    useState<Extract<PanelRole, "neck" | "side" | "other">>("neck");
  const [saveState, setSaveState] = useState<PackageSaveState>("unsaved");
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [submitter, setSubmitter] = useState("");
  const [message, setMessage] = useState(
    "Resolve the panel choices, then prepare each supported category.",
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
    workflow?.panelDecisionsComplete,
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
      const priorDecisions = packagePanelDecisions(currentDraft);
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
      let categories = existing
        ? currentDraft.categories.map((category) => ({
            ...category,
            regions: category.regions.filter((region) => region.panelId !== existing.panelId),
          }))
        : currentDraft.categories;
      const addedAfterExplicitAbsence =
        !existing &&
        ((role === "back" && priorDecisions.back === "absent") ||
          (role !== "front" && role !== "back" && priorDecisions.additional === "none"));
      const categoriesToRevisit = addedAfterExplicitAbsence
        ? categories.filter(
            (category) =>
              category.decision === "provided" &&
              (category.expectedValue.trim() !== "" || category.regions.length > 0),
          )
        : [];
      if (categoriesToRevisit.length > 0) {
        const ids = new Set(categoriesToRevisit.map((category) => category.categoryId));
        categories = categories.map((category) =>
          ids.has(category.categoryId)
            ? { ...category, decision: "unresolved" as const }
            : category,
        );
      }
      let next: SellerPackageDraft = {
        ...currentDraft,
        panelDecisions: {
          back: role === "back" ? "upload" : priorDecisions.back,
          additional: role !== "front" && role !== "back" ? "add" : priorDecisions.additional,
        },
        panels,
        categories,
      };
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
      for (const category of categoriesToRevisit) {
        const unresolved = categories.find(
          (candidate) => candidate.categoryId === category.categoryId,
        );
        if (!unresolved) continue;
        next = appendSellerChange(
          next,
          changeFor({
            action: "category_updated",
            category: unresolved,
            detail: `${labelForCategory(category.categoryId)} requires explicit review because a previously absent panel choice now has an uploaded artifact.`,
          }),
        );
      }
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

  async function chooseBackPanel(decision: "upload" | "absent") {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    const decisions = packagePanelDecisions(currentDraft);
    if (decision === "upload") {
      updateDraft(
        { ...currentDraft, panelDecisions: { ...decisions, back: "upload" } },
        "Choose a PNG or JPEG back-label image, or select No back label.",
      );
      return;
    }
    const back = currentDraft.panels.find((panel) => panel.role === "back");
    const referenced = back
      ? currentDraft.categories.some((category) =>
          category.regions.some((region) => region.panelId === back.panelId),
        )
      : false;
    if (referenced) {
      setMessage(
        "No back label was not applied because accepted evidence still points to the back panel. Resolve or move that evidence first.",
      );
      return;
    }
    let next: SellerPackageDraft = {
      ...currentDraft,
      panelDecisions: { ...decisions, back: "absent" },
      panels: currentDraft.panels
        .filter((panel) => panel.role !== "back")
        .map((panel, order) => ({ ...panel, order })),
    };
    if (back) {
      next = appendSellerChange(
        next,
        changeFor({
          action: "panel_removed",
          panel: back,
          detail:
            "Back panel removed after the seller explicitly resolved that no back label exists.",
        }),
      );
    }
    const nextRuntime = back
      ? runtimePanelsRef.current.filter((panel) => panel.panelId !== back.panelId)
      : runtimePanelsRef.current;
    try {
      await savePackageDraftLocally({
        draft: next,
        panelFiles: orderedPanelFiles(next, nextRuntime),
      });
      if (back) {
        const runtime = runtimePanelsRef.current.find((panel) => panel.panelId === back.panelId);
        if (runtime) {
          URL.revokeObjectURL(runtime.imageUrl);
          objectUrlsRef.current.delete(runtime.imageUrl);
        }
      }
      runtimePanelsRef.current = nextRuntime;
      setRuntimePanels(nextRuntime);
      draftRef.current = next;
      setDraft(next);
      setSaveState("unsaved");
      if (activePanelId === back?.panelId) setActivePanelId(next.panels[0]?.panelId ?? null);
      setWorkingRegion(null);
      setActiveRegionId(null);
      setMessage(
        "Back-panel absence recovery-checkpointed. No panel, checksum, evidence, or coordinate frame was created.",
      );
    } catch {
      setSaveState("error");
      setMessage(
        "The no-back-label decision was not applied because the local recovery checkpoint failed.",
      );
    }
  }

  async function chooseAdditionalPanels(decision: "add" | "none") {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    const decisions = packagePanelDecisions(currentDraft);
    if (decision === "add") {
      updateDraft(
        { ...currentDraft, panelDecisions: { ...decisions, additional: "add" } },
        "Choose the additional panel role and image, or select No additional panels.",
      );
      return;
    }
    const optionalPanels = currentDraft.panels.filter(
      (panel) => panel.role !== "front" && panel.role !== "back",
    );
    const optionalIds = new Set(optionalPanels.map((panel) => panel.panelId));
    const referenced = currentDraft.categories.some((category) =>
      category.regions.some((region) => optionalIds.has(region.panelId)),
    );
    if (referenced) {
      setMessage(
        "No additional panels was not applied because accepted evidence still points to an additional panel. Resolve that evidence first.",
      );
      return;
    }
    let next: SellerPackageDraft = {
      ...currentDraft,
      panelDecisions: { ...decisions, additional: "none" },
      panels: currentDraft.panels
        .filter((panel) => !optionalIds.has(panel.panelId))
        .map((panel, order) => ({ ...panel, order })),
    };
    for (const panel of optionalPanels) {
      next = appendSellerChange(
        next,
        changeFor({
          action: "panel_removed",
          panel,
          detail: `${ROLE_LABEL[panel.role]} removed after the seller resolved that no additional panels remain.`,
        }),
      );
    }
    const nextRuntime = runtimePanelsRef.current.filter((panel) => !optionalIds.has(panel.panelId));
    try {
      await savePackageDraftLocally({
        draft: next,
        panelFiles: orderedPanelFiles(next, nextRuntime),
      });
      for (const runtime of runtimePanelsRef.current.filter((panel) =>
        optionalIds.has(panel.panelId),
      )) {
        URL.revokeObjectURL(runtime.imageUrl);
        objectUrlsRef.current.delete(runtime.imageUrl);
      }
      runtimePanelsRef.current = nextRuntime;
      setRuntimePanels(nextRuntime);
      draftRef.current = next;
      setDraft(next);
      setSaveState("unsaved");
      if (activePanelId && optionalIds.has(activePanelId)) {
        setActivePanelId(next.panels[0]?.panelId ?? null);
      }
      setMessage(
        "Additional-panel intent recovery-checkpointed as none. No placeholder artifact was created.",
      );
    } catch {
      setSaveState("error");
      setMessage(
        "The no-additional-panels decision was not applied because the local recovery checkpoint failed.",
      );
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
      setReviewingEvidence(Boolean(firstFlagged));
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

  const annotationActive =
    !editingPanels &&
    workflow.panelDecisionsComplete &&
    (workflow.phase === "mark" || workflow.phase === "fix" || reviewingEvidence);
  const allCategoriesComplete = workflow.completedCategoryCount === workflow.totalCategoryCount;
  const canSavePackage =
    workflow.panelDecisionsComplete && allCategoriesComplete && saveState !== "saving";
  let primaryAction: WorkstationPrimaryAction;
  if (reviewingEvidence && analysisCurrent && workflow.phase !== "fix") {
    primaryAction = {
      reason:
        "Review the accepted category in the task inspector. Any material edit will invalidate the current pre-check.",
    };
  } else if (workflow.phase === "upload") {
    primaryAction = {
      reason:
        "Use the active upload workspace to resolve front, back, and additional-panel intent.",
    };
  } else if (workflow.phase === "mark") {
    primaryAction = {
      reason:
        "Use Accept in the task inspector after seller text and a valid blue working box are ready.",
    };
  } else if (workflow.phase === "fix" && !analysisCurrent) {
    primaryAction =
      saveState === "saved"
        ? {
            label: analysisState === "analyzing" ? "Running pre-check…" : "Re-run pre-check",
            disabled: !canAnalyze,
            onClick: () => void analyzePackage(),
            reason: canAnalyze ? undefined : "The corrected package must be saved before re-check.",
          }
        : {
            label: "Save updated draft",
            disabled: !canSavePackage,
            onClick: () => void saveDraft(),
            reason: "Seller evidence changed after the latest analysis.",
          };
  } else if (workflow.phase === "fix") {
    primaryAction = {
      reason:
        "Use the task inspector to correct only the categories flagged by the latest pre-check.",
    };
  } else if (workflow.phase === "save") {
    primaryAction =
      saveState === "saved"
        ? {
            label: analysisState === "analyzing" ? "Running pre-check…" : "Run pre-check",
            disabled: !canAnalyze,
            onClick: () => void analyzePackage(),
            reason: canAnalyze
              ? undefined
              : "The current package is not yet eligible for analysis.",
          }
        : {
            label: "Save draft locally",
            disabled: !canSavePackage,
            onClick: () => void saveDraft(),
            reason: "The explicit save remains browser-local and is required before analysis.",
          };
  } else {
    primaryAction = {
      label: "Prepare agent package",
      disabled: !canExport,
      onClick: () => void exportAgentPackage(),
      reason:
        submitter.trim() === ""
          ? "Enter the seller or submitter name in the preparation workspace."
          : "Creates a local download only. Nothing is transmitted.",
    };
  }

  return (
    <section className="min-w-0 pb-32" data-testid="seller-workstation">
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <PackageWorkstationControls
          draft={draft}
          workflow={workflow}
          activePanelId={activePanelId}
          activeCategoryId={activeCategoryId}
          guideOpen={guideOpen}
          editingPanels={editingPanels}
          reviewingEvidence={reviewingEvidence}
          message={message}
          primaryAction={primaryAction}
          showCategoryControls={annotationActive}
          onSelectPanel={(panelId) => {
            setActivePanelId(panelId);
            setActiveRegionId(panelId === workingRegion?.panelId ? workingRegion.regionId : null);
          }}
          onSelectCategory={selectCategory}
          onToggleGuide={() => setGuideOpen((open) => !open)}
          onTogglePanels={() => {
            setGuideOpen(false);
            setReviewingEvidence(false);
            setEditingPanels((editing) => !editing);
          }}
          onToggleEvidence={() => {
            setGuideOpen(false);
            setReviewingEvidence((reviewing) => !reviewing);
          }}
        />

        <main className="min-w-0" data-testid="cycling-workspace">
          {workflow.phase === "upload" || editingPanels ? (
            <PackageUploadDecisions
              draft={draft}
              optionalRole={optionalRole}
              onOptionalRoleChange={setOptionalRole}
              onReceivePanel={(role, file, panelId) => void receivePanel(role, file, panelId)}
              onChooseBack={(decision) => void chooseBackPanel(decision)}
              onChooseAdditional={(decision) => void chooseAdditionalPanels(decision)}
              onRemoveOptionalPanel={removePanel}
            />
          ) : annotationActive &&
            activePanel &&
            activeRuntimePanel &&
            activeCategory &&
            activeDefinition &&
            activeInstruction ? (
            <section className="min-w-0" aria-labelledby="annotation-mode-heading">
              <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    {workflow.phase === "fix" ? "Correction" : "Annotation"}
                  </p>
                  <h2 id="annotation-mode-heading" className="text-xl font-semibold">
                    {workflow.phase === "fix"
                      ? "Review the flagged evidence"
                      : "Mark the seller evidence"}
                  </h2>
                </div>
                {latestCategoryResult ? (
                  <div className="flex items-center gap-2 text-sm">
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
                      Use machine box
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="relative min-h-[32rem] min-w-0">
                <div className={guideOpen ? "invisible" : "visible"} aria-hidden={guideOpen}>
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
                </div>
                {guideOpen ? (
                  <div
                    className="absolute inset-0 z-20 overflow-y-auto rounded-lg bg-background"
                    data-testid="contextual-guide"
                  >
                    <ProfileExampleLabelMap
                      instructions={WINE_PACKAGE_CATEGORY_INSTRUCTIONS}
                      emphasizedCategoryId={activeCategoryId}
                      onClose={() => setGuideOpen(false)}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ) : workflow.phase === "prepare" ? (
            <section
              className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-6"
              aria-labelledby="prepare-workspace-heading"
              data-testid="prepare-workspace"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Prepare
              </p>
              <h2 id="prepare-workspace-heading" className="text-2xl font-semibold">
                Prepare the local agent package
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The latest saved pre-check is current and eligible for a local package download.
                Nothing is transmitted to an agent, TTB, a government system, or an external queue.
              </p>
              <div className="mt-5">
                <Label htmlFor="package-submitter">Seller or submitter name</Label>
                <Input
                  id="package-submitter"
                  value={submitter}
                  onChange={(event) => setSubmitter(event.target.value)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Use the persistent “Prepare agent package” action after entering the name.
                </p>
              </div>
              <div className="mt-5 rounded-md border border-emerald-700/40 bg-emerald-50 p-4 text-sm text-emerald-950">
                {readinessLabel(latestRun?.readiness, analysisCurrent)} · local download only · not
                a TTB submission or approval.
              </div>
              {latestRun ? (
                <div className="mt-5" aria-label="Latest pre-check results">
                  <h3 className="font-semibold">Latest pre-check results</h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {latestRun.categories.map((category) => (
                      <div
                        key={category.categoryId}
                        className="rounded border border-border p-3 text-sm"
                      >
                        <p className="font-semibold">{labelForCategory(category.categoryId)}</p>
                        <p className="text-muted-foreground">
                          {ANALYSIS_LABEL[category.state]} ·{" "}
                          {category.observedValue ?? "No observed value"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <section
              className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-6"
              aria-labelledby="save-workspace-heading"
              data-testid="save-workspace"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Save and pre-check
              </p>
              <h2 id="save-workspace-heading" className="text-2xl font-semibold">
                {saveState === "saved"
                  ? "Run the saved package pre-check"
                  : "Save the accepted package"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Category acceptance created recovery checkpoints. The explicit package save remains
                local to this browser and is required before analysis.
              </p>
              <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded border border-border p-3">
                  <dt className="font-semibold">Panel decisions</dt>
                  <dd className="text-muted-foreground">
                    Front uploaded · back {workflow.backUploaded ? "uploaded" : "absent"} ·
                    additional resolved
                  </dd>
                </div>
                <div className="rounded border border-border p-3">
                  <dt className="font-semibold">Categories</dt>
                  <dd className="text-muted-foreground">
                    {workflow.completedCategoryCount}/{workflow.totalCategoryCount} accepted
                  </dd>
                </div>
                <div className="rounded border border-border p-3">
                  <dt className="font-semibold">Local draft</dt>
                  <dd className="text-muted-foreground">{saveState}</dd>
                </div>
                <div className="rounded border border-border p-3">
                  <dt className="font-semibold">Pre-check</dt>
                  <dd className="text-muted-foreground">
                    {latestRun
                      ? `${readinessLabel(latestRun.readiness, analysisCurrent)} · run ${latestRun.sequence}`
                      : "Not run"}
                  </dd>
                </div>
              </dl>
            </section>
          )}
        </main>

        {annotationActive && activeCategory && activeDefinition && activeInstruction ? (
          <GuidedCategoryTask
            definition={activeDefinition}
            instruction={activeInstruction}
            category={activeCategory}
            analysis={latestCategoryResult}
            taskPosition={activeTaskPosition + 1}
            taskCount={focusedDefinitions.length}
            workingValue={workingValue}
            pendingRegionAvailable={Boolean(workingRegion && validNormalizedRegion(workingRegion))}
            accepting={acceptingCategory}
            onWorkingValueChange={setWorkingValue}
            onAccept={() => void acceptActiveCategory()}
            onNeedsAttention={() => void markActiveCategoryNeedsAttention()}
            onBack={() => selectAdjacentCategory(-1)}
            onNext={() => selectAdjacentCategory(1)}
          />
        ) : (
          <aside className="rounded-lg border border-border bg-card p-4 lg:sticky lg:top-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Current task
            </p>
            <h2 className="mt-1 text-lg font-semibold">{workflow.recommendedAction}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Only the active workspace is expanded. Later actions appear when the canonical package
              state permits them.
            </p>
            <details className="mt-4 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                Technical details
              </summary>
              <p className="mt-2">Analysis runs: {draft.analysisRuns.length}</p>
              <p>Seller history entries: {draft.sellerChangeHistory.length}</p>
              <p>Panel artifacts: {draft.panels.length}</p>
            </details>
          </aside>
        )}
      </div>

      <PackageProgressFooter
        workflow={workflow}
        saveState={saveState}
        analysisRunCount={draft.analysisRuns.length}
      />
    </section>
  );
}
