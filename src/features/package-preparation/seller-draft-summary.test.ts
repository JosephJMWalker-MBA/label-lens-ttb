import { describe, expect, it } from "vitest";

import type { SellerPackageDraft } from "./package-model";
import type { StoredPackageDraft } from "./package-draft-store";
import { WINE_PACKAGE_CATEGORY_DEFINITIONS } from "./package-profile";
import { summarizeLocalDrafts } from "./seller-draft-summary";

const T0 = "2026-11-08T10:00:00.000Z";

function base(packageId: string, updatedAt = T0): SellerPackageDraft {
  return {
    schemaVersion: "seller-package-draft.v1",
    packageId,
    createdAt: T0,
    updatedAt,
    profile: { id: "wine-label-requirements", version: "1.0.0" },
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

function withFront(draft: SellerPackageDraft): SellerPackageDraft {
  draft.panels = [
    {
      panelId: `${draft.packageId}-front`,
      order: 0,
      role: "front",
      displayName: "front.png",
      mediaType: "image/png",
      byteSize: 10,
      checksumSha256: "0".repeat(64),
      width: 1000,
      height: 1500,
      rotation: 0,
    },
  ];
  return draft;
}

function resolved(draft: SellerPackageDraft): SellerPackageDraft {
  withFront(draft);
  draft.panelDecisions = { back: "absent", additional: "none" };
  return draft;
}

function mark(
  draft: SellerPackageDraft,
  categoryId: "brandName" | "alcoholStatement",
  value: string,
) {
  draft.categories = draft.categories.map((category) =>
    category.categoryId === categoryId
      ? {
          ...category,
          expectedValue: value,
          regions: [
            {
              regionId: `${draft.packageId}-${categoryId}`,
              categoryId,
              panelId: `${draft.packageId}-front`,
              unit: "normalized-panel-relative",
              provenance: "seller-selected-region",
              x: 0.1,
              y: categoryId === "brandName" ? 0.1 : 0.8,
              width: 0.5,
              height: 0.1,
            },
          ],
        }
      : category,
  );
  return draft;
}

function saved(draft: SellerPackageDraft): SellerPackageDraft {
  draft.sellerChangeHistory.push({
    changeId: `${draft.packageId}-saved-${draft.sellerChangeHistory.length + 1}`,
    sequence: draft.sellerChangeHistory.length + 1,
    recordedAt: T0,
    action: "draft_saved",
    detail: "Seller package draft saved locally.",
  });
  return draft;
}

function cleanRun(draft: SellerPackageDraft): SellerPackageDraft {
  draft.analysisRuns = [
    {
      analysisRunId: `${draft.packageId}-run`,
      sequence: 1,
      sellerChangeSequence: draft.sellerChangeHistory.length,
      recordedAt: T0,
      panelRuns: [],
      categories: WINE_PACKAGE_CATEGORY_DEFINITIONS.map((definition) => ({
        categoryId: definition.categoryId,
        state: "clearly_readable",
        observedValue: "clear",
        supportingPanelIds: [],
        supportingRegionIds: [],
        reason: "Clear.",
      })),
      readiness: "ready_for_agent_submission",
    },
  ];
  return draft;
}

function ready(packageId: string, brand: string, updatedAt = T0): SellerPackageDraft {
  const draft = resolved(base(packageId, updatedAt));
  mark(draft, "brandName", brand);
  mark(draft, "alcoholStatement", "13.5% alc. by vol.");
  return cleanRun(saved(draft));
}

function stored(draft: SellerPackageDraft, revisionOf?: string): StoredPackageDraft {
  return {
    draft,
    panelFiles: [],
    ...(revisionOf
      ? {
          revisionContext: {
            kind: "requested_changes_response" as const,
            submissionId: revisionOf,
            baseRevisionId: "rev-1",
            baseRevisionNumber: 1,
            respondedToDecisionId: "decision-1",
            expectedSubmissionVersion: 2,
          },
        }
      : {}),
  };
}

describe("seller dashboard draft summaries", () => {
  it("names one plain next step for each stage of an unfinished package", () => {
    const brandOnly = mark(resolved(base("pkg-marking")), "brandName", "Cedar Ridge");
    const complete = mark(
      mark(resolved(base("pkg-complete")), "brandName", "Cedar Ridge"),
      "alcoholStatement",
      "13.5%",
    );
    const cases: Array<[SellerPackageDraft, string]> = [
      [base("pkg-empty"), "Add the front label image"],
      [withFront(base("pkg-front")), "Answer the back-label and extra-panel questions"],
      [brandOnly, "Mark the alcohol statement on your label"],
      [complete, "Save your package"],
      [saved(structuredClone(complete)), "Run the pre-check"],
      [ready("pkg-ready", "Cedar Ridge"), "Submit for internal review"],
    ];
    for (const [draft, nextStep] of cases) {
      const [summary] = summarizeLocalDrafts([stored(draft)], []);
      expect(summary?.nextStep, draft.packageId).toBe(nextStep);
      expect(summary?.href).toBe(`/review?packageId=${encodeURIComponent(draft.packageId)}`);
    }
  });

  it("uses the declared brand as the title and counts progress from the workspace stages", () => {
    const [untitled] = summarizeLocalDrafts([stored(base("pkg-new"))], []);
    expect(untitled).toMatchObject({ title: "Untitled package", progress: "0 of 5 steps done" });

    const [readySummary] = summarizeLocalDrafts([stored(ready("pkg-ready", " Cedar Ridge "))], []);
    expect(readySummary).toMatchObject({
      title: "Cedar Ridge",
      kind: "in_progress",
      progress: "4 of 5 steps done",
    });
  });

  it("hides drafts the server already holds as submissions", () => {
    const summaries = summarizeLocalDrafts(
      [stored(ready("pkg-submitted", "Submitted Label")), stored(base("pkg-open"))],
      [{ id: "pkg-submitted", currentStatus: "waiting_for_agent_review" }],
    );
    expect(summaries.map((summary) => summary.packageId)).toEqual(["pkg-open"]);
  });

  it("shows a requested-changes response only while the seller still owes the changes", () => {
    const revision = stored(ready("pkg-1", "Revised Label"), "pkg-1");

    const waiting = summarizeLocalDrafts(
      [revision],
      [{ id: "pkg-1", currentStatus: "changes_requested" }],
    );
    expect(waiting).toEqual([
      expect.objectContaining({
        kind: "revision_response",
        nextStep: "Resubmit for internal review",
        revisionOf: { submissionId: "pkg-1", baseRevisionNumber: 1 },
      }),
    ]);

    // Already resubmitted: the submission moved on, so the draft is no longer pending.
    expect(
      summarizeLocalDrafts(
        [revision],
        [{ id: "pkg-1", currentStatus: "waiting_for_agent_review" }],
      ),
    ).toEqual([]);
    // Not this seller's submission (drafts are per browser, not per account).
    expect(summarizeLocalDrafts([revision], [])).toEqual([]);
  });

  it("lists the most recently updated draft first", () => {
    const summaries = summarizeLocalDrafts(
      [
        stored(base("pkg-older", "2026-11-07T09:00:00.000Z")),
        stored(base("pkg-newer", "2026-11-08T09:00:00.000Z")),
      ],
      [],
    );
    expect(summaries.map((summary) => summary.packageId)).toEqual(["pkg-newer", "pkg-older"]);
  });
});
