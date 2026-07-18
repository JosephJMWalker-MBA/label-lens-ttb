"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { triggerDownload } from "@/features/precheck/download";

import { PackageAnnotationCanvas, type MachinePackageRegion } from "./PackageAnnotationCanvas";
import {
  loadPackageDraftLocally,
  savePackageDraftLocally,
  type StoredPackagePanelFile,
} from "./package-draft-store";
import {
  appendSellerChange,
  buildSellerPackageExport,
  categoryPreparationComplete,
  labelForCategory,
  latestAnalysisIsCurrent,
  normalizedRegionFromObservation,
  packagePreparationComplete,
  serializeSellerPackageExport,
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
import { WINE_PACKAGE_CATEGORY_DEFINITIONS, WINE_PACKAGE_PROFILE } from "./package-profile";

const ACCEPTED_IMAGES = "image/png,image/jpeg";
const MAX_PACKAGE_PANELS = 6;

type SaveState = "unsaved" | "saving" | "saved" | "error";
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

export function PackagePreparationWorkspace() {
  const [draft, setDraft] = useState<SellerPackageDraft | null>(null);
  const [runtimePanels, setRuntimePanels] = useState<RuntimePanel[]>([]);
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<PackageCategoryId>("brandName");
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [optionalRole, setOptionalRole] =
    useState<Extract<PanelRole, "neck" | "side" | "other">>("neck");
  const [saveState, setSaveState] = useState<SaveState>("unsaved");
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
        setSaveState("saved");
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
  const latestRun = draft?.analysisRuns.at(-1);
  const analysisCurrent = draft ? latestAnalysisIsCurrent(draft) : false;
  const latestCategoryResult = latestRun?.categories.find(
    (category) => category.categoryId === activeCategoryId,
  );
  const preparationComplete = draft
    ? packagePreparationComplete(draft, WINE_PACKAGE_CATEGORY_DEFINITIONS)
    : false;
  const canAnalyze =
    preparationComplete &&
    saveState === "saved" &&
    analysisState !== "analyzing" &&
    draft?.panels.length === runtimePanels.length;
  const canExport =
    latestRun?.readiness === "ready_for_agent_submission" &&
    analysisCurrent &&
    saveState === "saved" &&
    submitter.trim() !== "";

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
      setActivePanelId(identity);
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

  function updateCategory(
    categoryId: PackageCategoryId,
    mutation: (category: PackageCategoryDraft) => PackageCategoryDraft,
    detail: string,
  ) {
    if (!draft) return;
    let updatedCategory: PackageCategoryDraft | undefined;
    const categories = draft.categories.map((category) => {
      if (category.categoryId !== categoryId) return category;
      updatedCategory = mutation(category);
      return updatedCategory;
    });
    if (!updatedCategory) return;
    const next = appendSellerChange(
      { ...draft, categories },
      changeFor({ action: "category_updated", category: updatedCategory, detail }),
    );
    updateDraft(next, detail);
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
    commitRegion(region, "region_added");
    setMessage(
      "Machine geometry was copied into a new seller region. The machine observation remains unchanged.",
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

  if (restoring || !draft) {
    return <p role="status">Restoring the locally saved package draft…</p>;
  }

  return (
    <section className="flex min-w-0 flex-col gap-8">
      <div className="sticky top-0 z-20 grid min-w-0 gap-3 rounded-md border border-border bg-background/95 p-4 shadow-sm backdrop-blur md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Package {draft.packageId}</p>
          <p className="break-words text-sm text-muted-foreground" aria-live="polite">
            {message}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded border border-border px-2 py-1">Draft: {saveState}</span>
          <span className="rounded border border-border px-2 py-1">
            Analysis runs: {draft.analysisRuns.length}
          </span>
          <span className="rounded border border-border px-2 py-1">
            {readinessLabel(latestRun?.readiness, analysisCurrent)}
          </span>
        </div>
      </div>

      <section className="flex min-w-0 flex-col gap-4" aria-labelledby="package-panels-heading">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Step 1
          </p>
          <h2 id="package-panels-heading" className="text-2xl font-semibold">
            Upload the seller label package
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
                      setActiveRegionId(null);
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

      <section className="flex min-w-0 flex-col gap-4" aria-labelledby="category-checklist-heading">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Step 2
          </p>
          <h2 id="category-checklist-heading" className="text-2xl font-semibold">
            Prepare profile evidence
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This checklist contains only categories backed by the existing reviewed wine
            requirements profile. Mark uncertainty directly; do not guess.
          </p>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {WINE_PACKAGE_CATEGORY_DEFINITIONS.map((definition) => {
            const category = draft.categories.find(
              (candidate) => candidate.categoryId === definition.categoryId,
            )!;
            const result = latestRun?.categories.find(
              (candidate) => candidate.categoryId === definition.categoryId,
            );
            const complete = categoryPreparationComplete(category, definition);
            return (
              <button
                key={definition.categoryId}
                type="button"
                className={`min-w-0 rounded-md border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeCategoryId === definition.categoryId
                    ? "border-primary bg-muted/40"
                    : "border-border"
                }`}
                aria-pressed={activeCategoryId === definition.categoryId}
                onClick={() => {
                  setActiveCategoryId(definition.categoryId);
                  setActiveRegionId(null);
                }}
              >
                <span className="block font-semibold">{definition.label}</span>
                <span className="block break-words text-xs text-muted-foreground">
                  {complete ? "Prepared" : "Preparation incomplete"} · {category.regions.length}{" "}
                  seller region{category.regions.length === 1 ? "" : "s"}
                </span>
                <span className="mt-1 block text-xs">
                  Analysis: {result ? ANALYSIS_LABEL[result.state] : "Not run"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {activePanel && activeRuntimePanel && activeCategory && activeDefinition ? (
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
          <PackageAnnotationCanvas
            panel={activePanel}
            imageUrl={activeRuntimePanel.imageUrl}
            activeCategoryId={activeCategoryId}
            regions={activeCategory.regions.filter((region) => region.panelId === activePanelId)}
            machineRegions={machineRegions}
            activeRegionId={activeRegionId}
            onActiveRegionChange={setActiveRegionId}
            onRegionCommit={commitRegion}
            onRegionRemove={removeRegion}
            onPanelRotationChange={rotatePanel}
          />

          <aside className="flex min-w-0 flex-col gap-4 rounded-md border border-border bg-card p-4 lg:sticky lg:top-28">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Active category
              </p>
              <h3 className="text-xl font-semibold">{activeDefinition.label}</h3>
              <p className="text-xs text-muted-foreground">
                Registry requirement {activeDefinition.requirementId} v
                {activeDefinition.requirementVersion} · {activeDefinition.applicability}
              </p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold">Seller preparation decision</legend>
              {(
                [
                  ["provided", "I can provide a value and evidence region"],
                  ["unresolved", "Unable to confirm — preserve uncertainty"],
                  ["not_present", "Not present on the supplied package"],
                ] as const
              ).map(([decision, label]) => (
                <label key={decision} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`decision-${activeCategoryId}`}
                    value={decision}
                    checked={activeCategory.decision === decision}
                    onChange={() =>
                      updateCategory(
                        activeCategoryId,
                        (category) => ({ ...category, decision }),
                        `${activeDefinition.label} seller decision changed to ${decision}.`,
                      )
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>

            <div>
              <Label htmlFor="seller-expected-value">Seller-provided value</Label>
              <Input
                id="seller-expected-value"
                value={activeCategory.expectedValue}
                disabled={activeCategory.decision !== "provided"}
                onChange={(event) => {
                  const expectedValue = event.target.value;
                  updateCategory(
                    activeCategoryId,
                    (category) => ({ ...category, decision: "provided", expectedValue }),
                    `${activeDefinition.label} seller value revised.`,
                  );
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                This is seller-provided context. It never overwrites machine-observed text.
              </p>
            </div>

            <div className="rounded-md border border-border p-3 text-sm">
              <p className="font-semibold">Evidence regions</p>
              <p className="text-muted-foreground">
                {activeCategory.regions.length} across{" "}
                {new Set(activeCategory.regions.map((r) => r.panelId)).size} panel(s). Multiple
                regions and panels remain separate.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={!machineRegions.some((region) => region.categoryId === activeCategoryId)}
                onClick={useMachineRegion}
              >
                Copy machine region as seller region
              </Button>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">Latest machine observation</p>
              {latestCategoryResult ? (
                <>
                  <p>{ANALYSIS_LABEL[latestCategoryResult.state]}</p>
                  <p className="break-words text-muted-foreground">
                    Observed: {latestCategoryResult.observedValue ?? "No observed value"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {latestCategoryResult.reason}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Not run. Seller evidence can be saved first.
                </p>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          Upload and select a panel to open the evidence editor.
        </p>
      )}

      <section
        className="flex min-w-0 flex-col gap-4 rounded-md border border-border p-5"
        aria-labelledby="package-actions-heading"
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Step 3
          </p>
          <h2 id="package-actions-heading" className="text-2xl font-semibold">
            Save, analyze, and prepare a local agent package
          </h2>
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
          <li>All profile categories prepared: {preparationComplete ? "yes" : "no"}</li>
          <li>Saved before analysis: {saveState === "saved" ? "yes" : "no"}</li>
        </ul>

        <div className="border-t border-border pt-4">
          <h3 className="font-semibold">Submit to agent</h3>
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
