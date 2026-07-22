// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import type { StoredPackageDraft } from "./package-draft-store";

const store = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("./package-draft-store", () => ({
  loadPackageDraftLocally: store.load,
  savePackageDraftLocally: store.save,
}));

import { RevisionSeedHydrator } from "./RevisionSeedHydrator";

const revisionContext = {
  kind: "requested_changes_response" as const,
  submissionId: "pkg-seed",
  baseRevisionId: "revision-parent",
  baseRevisionNumber: 1,
  respondedToDecisionId: "decision-change",
  expectedSubmissionVersion: 3,
};

function seedResponse() {
  return {
    submissionId: "pkg-seed",
    baseRevision: {
      id: "revision-parent",
      revisionNumber: 1,
      profileId: "wine-label-requirements",
      profileVersion: "1.0.0",
      panels: [
        {
          panelId: "old-front",
          order: 0,
          role: "front",
          displayName: "front.png",
          mediaType: "image/png",
          byteSize: 5,
          checksumSha256: "a".repeat(64),
          width: 100,
          height: 200,
          rotation: 0,
        },
        {
          panelId: "old-back",
          order: 1,
          role: "back",
          displayName: "back.png",
          mediaType: "image/png",
          byteSize: 4,
          checksumSha256: "b".repeat(64),
          width: 90,
          height: 180,
          rotation: 0,
        },
      ],
      sellerEvidence: [
        {
          categoryId: "brandName",
          decision: "provided",
          expectedValue: "Seed Brand",
          regions: [
            {
              regionId: "old-brand-region",
              categoryId: "brandName",
              panelId: "old-front",
              unit: "normalized-panel-relative",
              provenance: "seller-selected-region",
              x: 0.1,
              y: 0.2,
              width: 0.3,
              height: 0.4,
            },
          ],
        },
        {
          categoryId: "alcoholStatement",
          decision: "provided",
          expectedValue: "12%",
          regions: [
            {
              regionId: "old-alcohol-region",
              categoryId: "alcoholStatement",
              panelId: "old-back",
              unit: "normalized-panel-relative",
              provenance: "seller-selected-region",
              x: 0.4,
              y: 0.5,
              width: 0.2,
              height: 0.1,
            },
          ],
        },
      ],
    },
    changeRequest: {
      rationale: "Clarify front panel evidence.",
    },
    revisionContext,
  };
}

function existingStoredDraft(
  context = { ...revisionContext, respondedToDecisionId: "other-decision" },
): StoredPackageDraft {
  return {
    draft: {
      schemaVersion: "seller-package-draft.v1",
      packageId: "pkg-seed",
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
      profile: { id: "wine-label-requirements", version: "1.0.0" },
      panels: [],
      categories: [],
      sellerChangeHistory: [],
      analysisRuns: [],
    },
    panelFiles: [],
    revisionContext: context,
  } as StoredPackageDraft;
}

beforeEach(() => {
  store.load.mockReset();
  store.save.mockReset();
  store.save.mockResolvedValue(undefined);
  let uuidCounter = 0;
  vi.stubGlobal("crypto", {
    ...crypto,
    randomUUID: vi.fn(() => {
      uuidCounter += 1;
      return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
    }),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/package/submit/revision-seed/pkg-seed")) {
        return Response.json(seedResponse());
      }
      if (url.includes("/panels/old-front")) {
        return new Response(new Blob(["front"], { type: "image/png" }));
      }
      if (url.includes("/panels/old-back")) {
        return new Response(new Blob(["back"], { type: "image/png" }));
      }
      return new Response(null, { status: 404 });
    }),
  );
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RevisionSeedHydrator", () => {
  it("hydrates a local revision draft with fresh panel and evidence-region IDs", async () => {
    store.load.mockResolvedValue(null);
    render(<RevisionSeedHydrator submissionId="pkg-seed" />);

    fireEvent.click(screen.getByRole("button", { name: /prepare local revision draft/i }));

    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(1));
    const saved = store.save.mock.calls[0][0];
    expect(saved.revisionContext).toEqual(revisionContext);
    expect(saved.draft.packageId).toBe("pkg-seed");
    expect(saved.draft.analysisRuns).toEqual([]);
    expect(saved.draft.sellerChangeHistory).toEqual([
      expect.objectContaining({
        sequence: 1,
        action: "revision_response_started",
        detail:
          "Revision response draft created. Prior machine analysis and provenance were not copied; run analysis again before resubmitting.",
      }),
    ]);

    const panelIds = saved.draft.panels.map((panel: { panelId: string }) => panel.panelId);
    expect(panelIds).toHaveLength(2);
    expect(new Set(panelIds).size).toBe(2);
    expect(panelIds).not.toContain("old-front");
    expect(panelIds).not.toContain("old-back");
    expect(saved.panelFiles.map((item: { panelId: string }) => item.panelId)).toEqual(panelIds);

    const remappedRegionPanelIds = saved.draft.categories.flatMap(
      (category: { regions: Array<{ panelId: string; regionId: string }> }) =>
        category.regions.map((region) => region.panelId),
    );
    expect(remappedRegionPanelIds.sort()).toEqual(panelIds.sort());
    expect(JSON.stringify(saved.draft)).not.toMatch(
      /old-front|old-back|old-brand-region|old-alcohol-region|machineResultId|appendToken|analysisRunId/,
    );
    const serializedDraft = canonicalStringify(saved.draft);
    expect(serializedDraft).not.toContain(revisionContext.baseRevisionId);
    expect(serializedDraft).not.toContain(revisionContext.respondedToDecisionId);
    expect(serializedDraft).not.toContain(seedResponse().changeRequest.rationale);
    expect(
      saved.draft.sellerChangeHistory.map((entry: { detail: string }) => entry.detail).join(" "),
    ).not.toMatch(/revision v1|revision 1/i);
    expect(saved.revisionContext).toEqual(revisionContext);
  });

  it("does not overwrite an unrelated local draft when the seller declines confirmation", async () => {
    store.load.mockResolvedValue(existingStoredDraft());
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    render(<RevisionSeedHydrator submissionId="pkg-seed" />);

    fireEvent.click(screen.getByRole("button", { name: /prepare local revision draft/i }));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(store.save).not.toHaveBeenCalled();
    expect(screen.queryByText(/revision response draft is ready/i)).toBeNull();
  });

  it("resumes an existing same-context draft without overwriting seller edits", async () => {
    const existing = existingStoredDraft(revisionContext);
    existing.draft.panels = [
      {
        panelId: "edited-front-panel",
        order: 0,
        role: "front" as const,
        displayName: "edited-front.png",
        mediaType: "image/png",
        byteSize: 11,
        checksumSha256: "c".repeat(64),
        width: 100,
        height: 100,
        rotation: 0 as const,
      },
    ];
    existing.panelFiles = [
      {
        panelId: "edited-front-panel",
        file: new File(["edited-file"], "edited-front.png", { type: "image/png" }),
      },
    ];
    existing.draft.categories = [
      {
        categoryId: "brandName",
        decision: "provided" as const,
        expectedValue: "Seller Edited Brand",
        regions: [],
      },
    ];
    existing.draft.analysisRuns = [
      {
        analysisRunId: "seller-edited-analysis",
        sequence: 1,
        sellerChangeSequence: 1,
        recordedAt: "2026-07-22T00:00:00.000Z",
        panelRuns: [],
        categories: [],
        readiness: "ready_for_agent_submission" as const,
      },
    ];
    store.load.mockResolvedValue(existing);
    render(<RevisionSeedHydrator submissionId="pkg-seed" />);

    fireEvent.click(screen.getByRole("button", { name: /prepare local revision draft/i }));

    expect(
      await screen.findByText(
        "An existing revision response draft is already stored in this browser. Resume it in Review.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open review workspace/i })).toBeInTheDocument();
    expect(store.save).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(existing.draft.categories[0].expectedValue).toBe("Seller Edited Brand");
    expect(existing.draft.panels[0].panelId).toBe("edited-front-panel");
    expect(existing.draft.analysisRuns[0].analysisRunId).toBe("seller-edited-analysis");
  });
});
