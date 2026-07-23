"use client";

import Link from "next/link";
import { useState } from "react";

import {
  loadPackageDraftLocally,
  savePackageDraftLocally,
  type StoredPackageDraft,
} from "./package-draft-store";
import type {
  CategoryPreparationDecision,
  PackagePanelMetadata,
  PanelRole,
  PanelRotation,
  SellerEvidenceRegion,
  SellerPackageDraft,
} from "./package-model";
import { WINE_PACKAGE_CATEGORY_DEFINITIONS, WINE_PACKAGE_PROFILE } from "./package-profile";
import type { RevisionResponseContext } from "./revision-context";

interface SeedPanel {
  panelId: string;
  assetPanelId: string;
  order: number;
  role: string;
  displayName: string;
  mediaType: string;
  byteSize: number;
  checksumSha256: string;
  width: number;
  height: number;
  rotation: number;
}

interface SeedEvidence {
  categoryId: string;
  decision: string;
  expectedValue: string | null;
  regions: unknown[];
}

interface RevisionSeedResponse {
  submissionId: string;
  baseRevision: {
    id: string;
    revisionNumber: number;
    profileId: string;
    profileVersion: string;
    panels: SeedPanel[];
    sellerEvidence: SeedEvidence[];
  };
  changeRequest: {
    rationale: string;
  };
  revisionContext: RevisionResponseContext;
}

type HydrationState = "idle" | "loading" | "ready" | "error";

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function now() {
  return new Date().toISOString();
}

function sameContext(left?: RevisionResponseContext, right?: RevisionResponseContext): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function remapRegion(region: unknown, panelIdMap: Map<string, string>): SellerEvidenceRegion {
  const value = region as SellerEvidenceRegion;
  const mappedPanelId = panelIdMap.get(value.panelId);
  if (!mappedPanelId) throw new Error("REVISION_SEED_REGION_PANEL_MISSING");
  return {
    ...value,
    regionId: makeId("revision-region"),
    panelId: mappedPanelId,
  };
}

async function hydrateFromSeed(seed: RevisionSeedResponse): Promise<StoredPackageDraft> {
  const panelIdMap = new Map<string, string>();
  const panels: PackagePanelMetadata[] = seed.baseRevision.panels.map((panel, index) => {
    const panelId = makeId("package-panel");
    panelIdMap.set(panel.panelId, panelId);
    return {
      panelId,
      order: index,
      role: panel.role as PanelRole,
      displayName: panel.displayName,
      mediaType: panel.mediaType,
      byteSize: panel.byteSize,
      checksumSha256: panel.checksumSha256,
      width: panel.width,
      height: panel.height,
      rotation: panel.rotation as PanelRotation,
    };
  });

  const files = await Promise.all(
    seed.baseRevision.panels.map(async (basePanel) => {
      const mappedPanelId = panelIdMap.get(basePanel.panelId);
      if (!mappedPanelId) throw new Error("REVISION_SEED_PANEL_MAP_MISSING");
      const response = await fetch(
        `/api/package/submit/revision-seed/${encodeURIComponent(seed.submissionId)}/panels/${encodeURIComponent(basePanel.assetPanelId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("REVISION_SEED_PANEL_RESTORE_FAILED");
      const blob = await response.blob();
      return {
        panelId: mappedPanelId,
        file: new File([blob], basePanel.displayName, { type: basePanel.mediaType }),
      };
    }),
  );

  const evidenceByCategory = new Map(
    seed.baseRevision.sellerEvidence.map((item) => [item.categoryId, item]),
  );
  const recordedAt = now();
  const draft: SellerPackageDraft = {
    schemaVersion: "seller-package-draft.v1",
    packageId: seed.submissionId,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    profile: {
      id: seed.baseRevision.profileId || WINE_PACKAGE_PROFILE.id,
      version: seed.baseRevision.profileVersion || WINE_PACKAGE_PROFILE.version,
    },
    panelDecisions: {
      back: panels.some((panel) => panel.role === "back") ? "upload" : "absent",
      additional: panels.some((panel) => panel.role !== "front" && panel.role !== "back")
        ? "add"
        : "none",
    },
    panels,
    categories: WINE_PACKAGE_CATEGORY_DEFINITIONS.map((definition) => {
      const prior = evidenceByCategory.get(definition.categoryId);
      return {
        categoryId: definition.categoryId,
        decision: (prior?.decision ?? "provided") as CategoryPreparationDecision,
        expectedValue: prior?.expectedValue ?? "",
        regions: (prior?.regions ?? []).map((region) => remapRegion(region, panelIdMap)),
      };
    }),
    sellerChangeHistory: [
      {
        changeId: makeId("seller-change"),
        sequence: 1,
        recordedAt,
        action: "revision_response_started",
        detail:
          "Revision response draft created. Prior machine analysis and provenance were not copied; run analysis again before resubmitting.",
      },
    ],
    analysisRuns: [],
  };

  return {
    draft,
    panelFiles: files,
    revisionContext: seed.revisionContext,
  };
}

export function RevisionSeedHydrator({ submissionId }: { submissionId: string }) {
  const [state, setState] = useState<HydrationState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function prepareRevisionDraft() {
    setState("loading");
    setMessage(null);
    try {
      const seedResponse = await fetch(
        `/api/package/submit/revision-seed/${encodeURIComponent(submissionId)}`,
        { cache: "no-store" },
      );
      if (!seedResponse.ok) {
        const body = (await seedResponse.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message || "The requested-change seed is unavailable.");
      }
      const seed = (await seedResponse.json()) as RevisionSeedResponse;
      const existing = await loadPackageDraftLocally();
      if (existing && sameContext(existing.revisionContext, seed.revisionContext)) {
        setState("ready");
        setMessage(
          "An existing revision response draft is already stored in this browser. Resume it in Review.",
        );
        return;
      }
      if (existing && !sameContext(existing.revisionContext, seed.revisionContext)) {
        const confirmed = window.confirm(
          "Replace your current browser-local draft with this requested-change response draft?",
        );
        if (!confirmed) {
          setState("idle");
          return;
        }
      }

      const stored = await hydrateFromSeed(seed);
      await savePackageDraftLocally(stored);
      setState("ready");
      setMessage(
        "Revision response draft is ready in this browser. Open Review, run analysis, then resubmit.",
      );
    } catch (error) {
      setState("error");
      const rawMessage = error instanceof Error ? error.message : "";
      setMessage(
        rawMessage === "REVISION_SEED_REGION_PANEL_MISSING" ||
          rawMessage === "REVISION_SEED_PANEL_MAP_MISSING"
          ? "A stored panel identity could not be reconciled safely. No revision draft was created."
          : rawMessage
            ? rawMessage
            : "Could not prepare the revision response draft.",
      );
    }
  }

  return (
    <section className="mt-6 rounded-md border border-border/70 p-4">
      <h2 className="text-lg font-semibold tracking-tight">Prepare revision response</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This restores seller-owned panel files into a new local draft. It does not copy prior
        machine analysis, machine result IDs, append tokens, or prior draft history.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void prepareRevisionDraft()}
          disabled={state === "loading"}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "loading" ? "Preparing…" : "Prepare local revision draft"}
        </button>
        {state === "ready" ? (
          <Link
            href="/review"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Open Review workspace
          </Link>
        ) : null}
      </div>
      {message ? (
        <p
          role={state === "error" ? "alert" : undefined}
          className={`mt-3 text-sm ${state === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
