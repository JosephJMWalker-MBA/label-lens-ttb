"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Run layout effects synchronously in the browser/jsdom, but fall back to a
// passive effect during server prerender (where `useLayoutEffect` is a no-op and
// warns). Used for state that must settle before the user can interact.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { triggerDownload } from "@/features/precheck/download";

import { GuidedCategoryTask } from "./GuidedCategoryTask";
import { PackageAnnotationCanvas, type MachinePackageRegion } from "./PackageAnnotationCanvas";
import { PackageProgressFooter, type PackageFooterAction } from "./PackageProgressFooter";
import { PackageUploadDecisions } from "./PackageUploadDecisions";
import { PackageWorkstationControls } from "./PackageWorkstationControls";
import { ProfileExampleLabelMap } from "./ProfileExampleLabelMap";
import {
  DraftStoreError,
  loadPackageDraftLocally,
  savePackageDraftLocally,
  type StoredPackageDraft,
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

function formatElapsedTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

/**
 * Local draft recovery is best-effort. If IndexedDB never settles within this
 * deadline (blocked, stuck, or missing events), the workstation falls back to a
 * fresh in-memory draft rather than staying on the loading screen forever.
 */
const RESTORE_DEADLINE_MS = 5000;

const RESTORATION_WARNING =
  "We could not restore the locally saved draft. A new unsaved package has been opened. Your previous browser draft was not deleted.";

// Shown when a valid saved draft exists but the seller already started new work in
// the fresh draft, so it was not loaded automatically (active work is never
// overwritten). The seller can choose to load it explicitly.
const RESTORED_AVAILABLE_NOTICE =
  "A previously saved local draft is available. You have already started a new package, so it was not loaded automatically. Loading it will replace your current unsaved work.";

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
  const [editingCategory, setEditingCategory] = useState(false);
  const [acceptingCategory, setAcceptingCategory] = useState(false);
  const [showMachineObservation, setShowMachineObservation] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [editingPanels, setEditingPanels] = useState(false);
  const [reviewingEvidence, setReviewingEvidence] = useState(false);
  const [optionalRole, setOptionalRole] =
    useState<Extract<PanelRole, "neck" | "side" | "other">>("neck");
  const [saveState, setSaveState] = useState<PackageSaveState>("unsaved");
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0);
  const [submitter, setSubmitter] = useState("");
  const [message, setMessage] = useState(
    "Resolve the panel choices, then prepare each supported category.",
  );
  // Non-gating: true only while a background restoration attempt is in flight.
  // The workspace is usable regardless; this drives a subtle inline indicator.
  const [restorationPending, setRestorationPending] = useState(false);
  const [restorationWarning, setRestorationWarning] = useState<string | null>(null);
  const [restorationDiagnostic, setRestorationDiagnostic] = useState<string | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const draftRef = useRef<SellerPackageDraft | null>(null);
  const runtimePanelsRef = useRef<RuntimePanel[]>([]);
  // The pristine fallback draft, used to detect whether the seller has since
  // materially edited it before allowing a retry to replace it.
  const fallbackBaselineRef = useRef<SellerPackageDraft | null>(null);
  const restoreAttemptRef = useRef(0);
  const restoreDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreCancelledRef = useRef(false);

  const revokeAllObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  }, []);

  // Safe, browser-visible diagnostic only: a failure category, never any cookie,
  // token, email, secret, or URL.
  const diagnose = useCallback((category: string) => {
    setRestorationDiagnostic(category);
    if (typeof console !== "undefined") {
      console.warn("[review] local draft restoration fell back", { category });
    }
  }, []);

  // Open a fresh, immediately usable draft. Called at mount so the workspace
  // renders and is interactive right away — its availability never depends on
  // IndexedDB. `warning`/`diagnostic` are surfaced only as a non-blocking banner.
  const openNewDraft = useCallback((warning: string | null, diagnostic: string | null) => {
    const initial = newDraft();
    draftRef.current = initial;
    fallbackBaselineRef.current = initial;
    runtimePanelsRef.current = [];
    setDraft(initial);
    setRuntimePanels([]);
    setActivePanelId(null);
    setSaveState("unsaved");
    setAnalysisState("idle");
    setRestorationWarning(warning);
    setRestorationDiagnostic(diagnostic);
    if (!warning) {
      setMessage("Resolve the panel choices, then prepare each supported category.");
    }
  }, []);

  const applyRestoredDraft = useCallback((stored: StoredPackageDraft) => {
    const runtime = stored.panelFiles.map(({ panelId, file }) => {
      const imageUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(imageUrl);
      return { panelId, file, imageUrl };
    });
    draftRef.current = stored.draft;
    fallbackBaselineRef.current = null;
    runtimePanelsRef.current = runtime;
    setDraft(stored.draft);
    setRuntimePanels(runtime);
    setActivePanelId(stored.draft.panels[0]?.panelId ?? null);
    setSaveState(restoredSaveState(stored.draft));
    setAnalysisState(stored.draft.analysisRuns.length > 0 ? "complete" : "idle");
    setMessage("Restored the last locally saved seller package draft in this browser.");
    setRestorationWarning(null);
    setRestorationDiagnostic(null);
  }, []);

  // A local-draft failure must never block preparation or discard in-progress
  // work: the fresh draft opened at mount stays in place and usable; we only
  // surface a truthful, non-destructive warning + retry.
  const warnRestorationFailed = useCallback(
    (diagnostic: string) => {
      diagnose(diagnostic);
      setRestorationWarning(RESTORATION_WARNING);
    },
    [diagnose],
  );

  const sellerHasEdited = useCallback(
    () =>
      draftRef.current !== null &&
      fallbackBaselineRef.current !== null &&
      draftRef.current !== fallbackBaselineRef.current,
    [],
  );

  // Background restoration: enhances the already-open workspace. Never gates the
  // page. A stored draft only replaces the fresh draft when the seller has not
  // already started new work; failures surface a non-destructive warning.
  const runRestore = useCallback(() => {
    const attempt = ++restoreAttemptRef.current;
    // Discard any object URLs from a previous attempt before starting a new one,
    // so a retry never leaks or duplicates image URLs. At mount this set is empty.
    revokeAllObjectUrls();
    setRestorationPending(true);
    setRestorationWarning(null);
    setRestorationDiagnostic(null);

    let settled = false;
    const isCurrent = () =>
      !restoreCancelledRef.current && attempt === restoreAttemptRef.current && !settled;
    const finish = () => {
      settled = true;
      setRestorationPending(false);
      if (restoreDeadlineRef.current) {
        clearTimeout(restoreDeadlineRef.current);
        restoreDeadlineRef.current = null;
      }
    };

    restoreDeadlineRef.current = setTimeout(() => {
      if (!isCurrent()) return;
      finish();
      warnRestorationFailed("timeout");
    }, RESTORE_DEADLINE_MS);

    loadPackageDraftLocally()
      .then((stored) => {
        if (!isCurrent()) return;
        finish();
        if (!stored) {
          // No stored draft (a normal first visit): keep the fresh draft, no warning.
          return;
        }
        if (sellerHasEdited()) {
          // A valid saved draft exists, but the seller already began new work.
          // Do not overwrite it; offer explicit restoration via the retry action.
          setRestorationWarning(RESTORED_AVAILABLE_NOTICE);
          setRestorationDiagnostic("superseded-by-active-edit");
          return;
        }
        applyRestoredDraft(stored);
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return;
        finish();
        const reason =
          error instanceof DraftStoreError ? error.reason : "LOCAL_DRAFT_STORAGE_FAILED";
        warnRestorationFailed(reason);
      });
  }, [applyRestoredDraft, revokeAllObjectUrls, sellerHasEdited, warnRestorationFailed]);

  const retryRestore = useCallback(() => {
    // Never overwrite active seller work without an explicit confirmation.
    if (sellerHasEdited() && typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Replace your current unsaved package with the restored draft? Your current changes will be discarded.",
      );
      if (!confirmed) return;
    }
    runRestore();
  }, [runRestore, sellerHasEdited]);

  useEffect(() => {
    restoreCancelledRef.current = false;
    // Render a usable workspace immediately with a fresh draft, then restore in the
    // background. Strict Mode double-invocation simply re-opens a fresh draft (no
    // edits exist yet at mount) and re-runs restoration under a new attempt id.
    openNewDraft(null, null);
    runRestore();
    return () => {
      restoreCancelledRef.current = true;
      if (restoreDeadlineRef.current) {
        clearTimeout(restoreDeadlineRef.current);
        restoreDeadlineRef.current = null;
      }
      revokeAllObjectUrls();
    };
  }, [openNewDraft, runRestore, revokeAllObjectUrls]);

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
  const activeCategoryDecision = activeCategory?.decision;
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
  const reviewingAcceptedEvidence = Boolean(
    workflow && reviewingEvidence && !workflow.focusCategoryIds.includes(activeCategoryId),
  );
  const canAnalyze =
    workflow?.readyForPrecheck === true &&
    analysisState !== "analyzing" &&
    draft?.panels.length === runtimePanels.length;
  const canExport =
    latestRun?.readiness === "ready_for_agent_submission" &&
    analysisCurrent &&
    saveState === "saved" &&
    submitter.trim() !== "";

  // A render-synced mirror of `workingRegion` so the reset effect below can read
  // the current in-progress edit without taking it as a dependency.
  const workingRegionRef = useRef(workingRegion);
  workingRegionRef.current = workingRegion;

  // Reset the in-progress (uncommitted) working edit to the active context's
  // defaults when the seller navigates to a different category or panel.
  //
  // It runs as a layout effect so this settling happens synchronously at load,
  // before the seller can type or draw — otherwise a passive re-run could flush
  // during a later interaction and wipe freshly entered text or a just-drawn/
  // copied region, silently disabling Save. Two further guards: (1) it does
  // nothing until the draft has loaded; (2) a working edit already belonging to
  // the current category+panel is left untouched — only edits carried over from
  // a previous context are cleared.
  useIsomorphicLayoutEffect(() => {
    if (!draft) return;
    const current = workingRegionRef.current;
    if (
      current &&
      current.categoryId === activeCategoryId &&
      current.panelId === activePanelForWorkingId
    ) {
      return;
    }

    if (!activePanelForWorkingId || !activeCategoryRegions || !activeInstruction) {
      setWorkingRegion(null);
      setWorkingValue(activeCategoryExpectedValue);
      setActiveRegionId(null);
      return;
    }
    const existing = activeCategoryRegions.find(
      (region) => region.panelId === activePanelForWorkingId,
    );
    setWorkingValue(activeCategoryExpectedValue);
    setWorkingRegion(null);
    setActiveRegionId(existing?.regionId ?? null);
    setEditingCategory(
      activeCategoryDecision === "unresolved" ||
        activeCategoryRegions.length === 0 ||
        activeCategoryExpectedValue === "",
    );
    setShowMachineObservation(false);
  }, [
    draft,
    activeCategoryExpectedValue,
    activeCategoryDecision,
    activeCategoryRegions,
    activeCategoryId,
    activeInstruction,
    activePanelForWorkingId,
    workflow?.panelDecisionsComplete,
  ]);

  useEffect(() => {
    if (analysisState !== "analyzing") return;
    const startedAt = Date.now();
    setAnalysisElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setAnalysisElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [analysisState]);

  useEffect(() => {
    if (!workflow || reviewingAcceptedEvidence || editingPanels) return;
    if (workflow.phase !== "mark" && workflow.phase !== "fix") return;
    const nextCategoryId = workflow.focusCategoryIds[0];
    if (nextCategoryId && !workflow.focusCategoryIds.includes(activeCategoryId)) {
      selectCategory(nextCategoryId);
    }
  }, [activeCategoryId, editingPanels, reviewingAcceptedEvidence, workflow]);

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

  function selectNextFocusedCategory(
    sourceDraft: SellerPackageDraft,
  ): "advanced" | "current" | "complete" {
    const nextWorkflow = deriveGuidedPackageWorkflow({
      draft: sourceDraft,
      definitions: WINE_PACKAGE_CATEGORY_DEFINITIONS,
      instructions: WINE_PACKAGE_CATEGORY_INSTRUCTIONS,
      saveState: "unsaved",
    });
    const nextCategoryId = nextWorkflow.focusCategoryIds.find(
      (categoryId) => categoryId !== activeCategoryId,
    );
    if (!nextCategoryId) {
      return nextWorkflow.focusCategoryIds.includes(activeCategoryId) ? "current" : "complete";
    }
    selectCategory(nextCategoryId, sourceDraft);
    return "advanced";
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
        { ...currentDraft, updatedAt: now(), panelDecisions: { ...decisions, back: "upload" } },
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
        { ...currentDraft, updatedAt: now(), panelDecisions: { ...decisions, additional: "add" } },
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
    setEditingCategory(true);
    setMessage(
      `Machine geometry was copied into a seller edit. Save ${labelForCategory(activeCategoryId)} to record it; the machine observation remains unchanged.`,
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
      setWorkingRegion(null);
      setEditingCategory(false);
      const focusResult = selectNextFocusedCategory(next);
      if (focusResult === "current") {
        setEditingCategory(true);
        setReviewingEvidence(true);
      } else if (focusResult === "complete") {
        setReviewingEvidence(false);
        setActiveRegionId(null);
      }
      return true;
    } catch {
      setSaveState("error");
      setMessage(
        "This category was not saved because browser-local persistence failed. No evidence record was added, and the workflow did not advance.",
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
    const regionChanged = Boolean(
      acceptedRegion && (!existingRegion || !sameRegion(existingRegion, acceptedRegion)),
    );
    if (categoryChanged || regionChanged) {
      next = appendSellerChange(
        next,
        changeFor({
          action: "category_updated",
          category: updatedCategory,
          region: acceptedRegion ?? undefined,
          detail: `${activeDefinition.label} seller-confirmed text and region saved together.`,
        }),
      );
    }

    if (!categoryChanged && !regionChanged) {
      setMessage(`${activeDefinition.label} is unchanged; no duplicate evidence record was added.`);
      return;
    }
    await checkpointCategory(
      next,
      `${activeDefinition.label} saved. The package still has unsaved changes.`,
    );
  }

  async function keepActiveCategoryEvidence() {
    if (!draft || !activeCategory || !activeDefinition || !latestRun) return;
    if (!workflow?.correctionPendingCategoryIds.includes(activeCategoryId)) return;
    const next = appendSellerChange(
      draft,
      changeFor({
        action: "category_updated",
        category: activeCategory,
        detail: `${activeDefinition.label} machine discrepancy reviewed; seller evidence deliberately kept unchanged.`,
      }),
    );
    await checkpointCategory(
      next,
      `${activeDefinition.label} reviewed. Your evidence was kept, and the package still has unsaved changes.`,
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

  // The structural workspace renders as soon as the mount effect has opened the
  // fresh draft; only the brief SSR / pre-mount frame (before any client effect)
  // shows this placeholder. Restoration is never allowed to gate the page.
  if (!draft || !workflow) {
    return (
      <p role="status" data-restoration-status="initializing">
        Preparing the package workspace…
      </p>
    );
  }

  const focusedDefinitions =
    workflow.phase === "fix"
      ? WINE_PACKAGE_CATEGORY_DEFINITIONS.filter((definition) =>
          workflow.correctionPendingCategoryIds.includes(definition.categoryId),
        )
      : WINE_PACKAGE_CATEGORY_DEFINITIONS;
  const activeTaskPosition = Math.max(
    0,
    focusedDefinitions.findIndex((definition) => definition.categoryId === activeCategoryId),
  );

  const annotationActive =
    !editingPanels &&
    workflow.panelDecisionsComplete &&
    (workflow.phase === "mark" || workflow.phase === "fix" || reviewingAcceptedEvidence);
  const allCategoriesComplete = workflow.completedCategoryCount === workflow.totalCategoryCount;
  const canSavePackage =
    workflow.panelDecisionsComplete && allCategoriesComplete && saveState !== "saving";
  const activeCategoryComplete =
    workflow.categoryStatuses.find((status) => status.categoryId === activeCategoryId)?.complete ??
    false;
  const activeCorrectionPending = workflow.correctionPendingCategoryIds.includes(activeCategoryId);
  const acceptedRegionOnPanel = activeCategory?.regions.find(
    (region) => region.panelId === activePanelId,
  );
  const workingRegionChanged = Boolean(
    workingRegion && (!acceptedRegionOnPanel || !sameRegion(acceptedRegionOnPanel, workingRegion)),
  );
  const workingTextChanged = Boolean(
    activeCategory && workingValue.trim() !== activeCategory.expectedValue.trim(),
  );
  const categoryHasMaterialChange =
    !activeCategoryComplete || workingRegionChanged || workingTextChanged;
  const categoryHasRegion = Boolean(
    (workingRegion && validNormalizedRegion(workingRegion)) || activeCategory?.regions.length,
  );
  const categoryHasText = Boolean(!activeDefinition?.requiresValue || workingValue.trim());
  const categoryReadyToSave =
    categoryHasRegion && categoryHasText && categoryHasMaterialChange && !acceptingCategory;

  let footerAction: PackageFooterAction;
  if (analysisState === "analyzing") {
    footerAction = {
      label: "Running pre-check…",
      disabled: true,
      pending: true,
      reason:
        "OCR and deterministic checks are running for this saved package. Duplicate requests are disabled.",
    };
  } else if (
    activeDefinition &&
    annotationActive &&
    ((workflow.phase === "mark" && !activeCategoryComplete) || editingCategory)
  ) {
    footerAction = {
      label: acceptingCategory
        ? `Saving ${activeDefinition.label}…`
        : `Save ${activeDefinition.label}`,
      disabled: !categoryReadyToSave,
      onClick: () => void acceptActiveCategory(),
      reason: acceptingCategory
        ? `${activeDefinition.label} evidence is being saved in this browser.`
        : !categoryHasRegion
          ? `Draw one region around the ${activeDefinition.label.toLowerCase()}.`
          : !categoryHasText
            ? `Confirm what the label says for the ${activeDefinition.label.toLowerCase()}.`
            : !categoryHasMaterialChange
              ? "No seller evidence has changed. Keep the current evidence or make an edit."
              : undefined,
    };
  } else if (workflow.phase === "mark") {
    const nextIncompleteCategoryId = workflow.incompleteCategoryIds[0];
    footerAction = {
      label: nextIncompleteCategoryId
        ? `Continue with ${labelForCategory(nextIncompleteCategoryId)}`
        : "Continue marking",
      disabled: !nextIncompleteCategoryId,
      onClick: nextIncompleteCategoryId
        ? () => {
            setReviewingEvidence(false);
            selectCategory(nextIncompleteCategoryId);
          }
        : undefined,
      reason: "Return to the next incomplete category to finish the marking stage.",
    };
  } else if (workflow.phase === "fix" && activeCorrectionPending) {
    footerAction = {
      label: acceptingCategory ? "Saving reviewed evidence…" : "Keep my evidence",
      disabled: acceptingCategory,
      onClick: () => void keepActiveCategoryEvidence(),
      reason:
        "Confirms that you reviewed the discrepancy while preserving machine and seller evidence as separate records.",
    };
  } else if (workflow.phase === "fix") {
    const nextPendingCategoryId = workflow.correctionPendingCategoryIds[0];
    footerAction = {
      label: nextPendingCategoryId
        ? `Review ${labelForCategory(nextPendingCategoryId)}`
        : "Review flagged evidence",
      disabled: !nextPendingCategoryId,
      onClick: nextPendingCategoryId ? () => selectCategory(nextPendingCategoryId) : undefined,
      reason: "Return to the remaining flagged category to complete this correction stage.",
    };
  } else if (workflow.phase === "upload") {
    footerAction = {
      label: "Continue to marking",
      disabled: true,
      reason: !workflow.frontUploaded
        ? "Upload the front label before continuing."
        : !workflow.backResolved
          ? "Choose whether this package has a back label."
          : "Choose whether this package has additional panels.",
    };
  } else if (workflow.phase === "save" && saveState !== "saved") {
    footerAction = {
      label:
        saveState === "saving"
          ? "Saving package…"
          : latestRun && !analysisCurrent
            ? "Save updated draft"
            : "Save draft locally",
      disabled: !canSavePackage,
      onClick: () => void saveDraft(),
      reason: !canSavePackage
        ? "Complete every required category before saving the package."
        : latestRun && !analysisCurrent
          ? "Seller evidence changed. Save the updated browser-local draft before re-checking."
          : "Package saving is browser-local and is required before the pre-check.",
    };
  } else if (workflow.phase === "save") {
    footerAction = {
      label:
        analysisState === "error"
          ? "Retry pre-check"
          : latestRun && !analysisCurrent
            ? "Run pre-check again"
            : "Run pre-check",
      disabled: !canAnalyze,
      onClick: () => void analyzePackage(),
      reason: canAnalyze
        ? analysisState === "error"
          ? "The prior attempt failed without advancing readiness or appending a successful run."
          : latestRun && !analysisCurrent
            ? "Pre-check results are stale because seller evidence changed."
            : "Runs OCR and deterministic checks on the current saved package."
        : "Save the package before running the pre-check.",
    };
  } else {
    footerAction = {
      label: "Prepare agent package",
      disabled: !canExport,
      onClick: () => void exportAgentPackage(),
      reason:
        submitter.trim() === ""
          ? "Enter the seller or submitter name before preparing the package."
          : "Creates a local download only. Nothing is transmitted.",
    };
  }

  return (
    <section
      className="min-w-0 pb-64 lg:pb-44"
      data-testid="seller-workstation"
      data-restoration-status={restorationDiagnostic ?? "restored"}
    >
      {restorationPending ? (
        <p
          role="status"
          data-testid="restoration-pending"
          className="mb-4 text-sm text-muted-foreground"
        >
          Checking for a locally saved draft… the workspace below is ready to use.
        </p>
      ) : null}
      {restorationWarning ? (
        <div
          role="alert"
          data-testid="restoration-warning"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="min-w-0">{restorationWarning}</p>
          <button
            type="button"
            onClick={retryRestore}
            className="shrink-0 rounded-md border border-amber-600/60 px-3 py-1.5 text-sm font-medium hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:hover:bg-amber-900/40"
          >
            {restorationDiagnostic === "superseded-by-active-edit"
              ? "Load saved local draft"
              : "Retry local draft restoration"}
          </button>
        </div>
      ) : null}
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <PackageWorkstationControls
          draft={draft}
          workflow={workflow}
          activePanelId={activePanelId}
          activeCategoryId={activeCategoryId}
          guideOpen={guideOpen}
          editingPanels={editingPanels}
          reviewingEvidence={reviewingAcceptedEvidence}
          message={message}
          showCategoryControls={workflow.panelDecisionsComplete && !editingPanels}
          onSelectPanel={(panelId) => {
            setActivePanelId(panelId);
            setActiveRegionId(panelId === workingRegion?.panelId ? workingRegion.regionId : null);
          }}
          onSelectMissingPanel={() => {
            setGuideOpen(false);
            setReviewingEvidence(false);
            setEditingPanels(true);
          }}
          onSelectCategory={(categoryId) => {
            setReviewingEvidence(!workflow.focusCategoryIds.includes(categoryId));
            selectCategory(categoryId);
          }}
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

        <main
          className="workspace-panel min-w-0"
          data-testid="cycling-workspace"
          data-current-phase={workflow.phase}
          aria-current="step"
        >
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
                  <span className="text-sm">
                    Pre-check: <strong>{ANALYSIS_LABEL[latestCategoryResult.state]}</strong>
                  </span>
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
                    machineRegions={showMachineObservation ? machineRegions : []}
                    activeRegionId={activeRegionId}
                    onActiveRegionChange={setActiveRegionId}
                    onWorkingRegionChange={(region) => {
                      setWorkingRegion(region);
                      setActiveRegionId(region.regionId);
                      setEditingCategory(true);
                    }}
                    onWorkingRegionDiscard={() => {
                      setWorkingRegion(null);
                      setActiveRegionId(null);
                      setMessage("Unsaved region edit deleted. Your saved evidence was unchanged.");
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
                {workflow.correctionCycleComplete && saveState !== "saved"
                  ? "All required evidence has been reviewed."
                  : saveState === "saved"
                    ? latestRun && !analysisCurrent
                      ? "Run the pre-check again"
                      : "Run the saved package pre-check"
                    : "All required evidence has been saved."}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {workflow.correctionCycleComplete && saveState !== "saved"
                  ? "Save the updated draft to continue."
                  : "The explicit package save remains local to this browser and is required before analysis."}
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
                    {workflow.completedCategoryCount}/{workflow.totalCategoryCount} saved
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
            editing={editingCategory}
            machineObservationVisible={showMachineObservation}
            machineRegionAvailable={machineRegions.some(
              (region) => region.categoryId === activeCategoryId,
            )}
            showReviewNavigation={
              focusedDefinitions.length > 1 && !workflow.correctionCycleComplete
            }
            onWorkingValueChange={(value) => {
              setWorkingValue(value);
              setEditingCategory(true);
            }}
            onBeginRegionEdit={() => {
              const existing = activeCategory.regions.find(
                (region) => region.panelId === activePanelId,
              );
              if (existing) {
                setWorkingRegion({ ...existing });
                setActiveRegionId(existing.regionId);
              }
              setEditingCategory(true);
              setMessage(
                `Edit the ${activeDefinition.label.toLowerCase()} region, then save it from the footer.`,
              );
            }}
            onBeginTextEdit={() => {
              setEditingCategory(true);
              setMessage(
                `Edit the confirmed ${activeDefinition.label.toLowerCase()} text, then save it from the footer.`,
              );
            }}
            onToggleMachineObservation={() => setShowMachineObservation((visible) => !visible)}
            onUseMachineRegion={useMachineRegion}
            onNeedsAttention={() => void markActiveCategoryNeedsAttention()}
            onPrevious={() => selectAdjacentCategory(-1)}
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
        action={footerAction}
        elapsedLabel={
          analysisState === "analyzing" ? formatElapsedTime(analysisElapsedSeconds) : undefined
        }
      />
    </section>
  );
}
