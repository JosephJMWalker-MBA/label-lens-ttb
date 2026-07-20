import { describe, expect, it } from "vitest";

import type { SellerPackageDraft } from "./package-model";
import {
  WINE_PACKAGE_CATEGORY_DEFINITIONS,
  WINE_PACKAGE_CATEGORY_INSTRUCTIONS,
} from "./package-profile";
import { deriveGuidedPackageWorkflow } from "./package-workflow";

function draft(): SellerPackageDraft {
  return {
    schemaVersion: "seller-package-draft.v1",
    packageId: "guided-package",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
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

function addPanels(value: SellerPackageDraft) {
  value.panelDecisions = { back: "upload", additional: "none" };
  value.panels = (["front", "back"] as const).map((role, index) => ({
    panelId: `${role}-panel`,
    order: index,
    role,
    displayName: `${role}.png`,
    mediaType: "image/png",
    byteSize: 10,
    checksumSha256: `${index}`.repeat(64),
    width: 1000,
    height: 1500,
    rotation: 0,
  }));
}

function acceptCategories(value: SellerPackageDraft) {
  value.categories = value.categories.map((category) => ({
    ...category,
    expectedValue: category.categoryId === "brandName" ? "CEDAR RIDGE" : "12.5",
    regions: [
      {
        regionId: `${category.categoryId}-region`,
        categoryId: category.categoryId,
        panelId: category.categoryId === "brandName" ? "front-panel" : "back-panel",
        unit: "normalized-panel-relative",
        provenance: "seller-selected-region",
        x: 0.1,
        y: 0.2,
        width: 0.5,
        height: 0.2,
      },
    ],
  }));
}

function project(value: SellerPackageDraft, saveState: "unsaved" | "saved") {
  return deriveGuidedPackageWorkflow({
    draft: value,
    definitions: WINE_PACKAGE_CATEGORY_DEFINITIONS,
    instructions: WINE_PACKAGE_CATEGORY_INSTRUCTIONS,
    saveState,
  });
}

describe("guided package workflow projection", () => {
  it("enumerates instructional tasks only for categories in the reviewed profile projection", () => {
    expect(
      WINE_PACKAGE_CATEGORY_INSTRUCTIONS.map((instruction) => instruction.categoryId).sort(),
    ).toEqual(WINE_PACKAGE_CATEGORY_DEFINITIONS.map((definition) => definition.categoryId).sort());
    expect(WINE_PACKAGE_CATEGORY_INSTRUCTIONS.every((item) => !item.notPresentAllowed)).toBe(true);
  });

  it("moves from explicit panel decisions to one-category marking", () => {
    const value = draft();
    expect(project(value, "unsaved").phase).toBe("upload");
    expect(project(value, "unsaved").progressStages[0]).toMatchObject({
      id: "upload",
      status: "current",
    });
    addPanels(value);
    const marking = project(value, "unsaved");
    expect(marking.phase).toBe("mark");
    expect(marking.focusCategoryIds).toEqual(
      WINE_PACKAGE_CATEGORY_DEFINITIONS.map((definition) => definition.categoryId),
    );
    expect(marking.recommendedAction).toBe("Complete the next required category");
    expect(marking.progressStages.map((stage) => stage.status)).toEqual([
      "complete",
      "current",
      "not_started",
      "not_started",
      "not_started",
    ]);
  });

  it("resolves truthful back absence and optional-panel intent without fake artifacts", () => {
    const value = draft();
    value.panels = [
      {
        panelId: "front-panel",
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
    value.panelDecisions = { back: "absent", additional: "none" };
    const workflow = project(value, "unsaved");
    expect(workflow).toMatchObject({
      phase: "mark",
      backUploaded: false,
      backAbsent: true,
      backResolved: true,
      additionalResolved: true,
      panelDecisionsComplete: true,
      uploadedPanelCount: 1,
    });
    expect(value.panels).toHaveLength(1);
  });

  it("requires explicit provided evidence for readiness even though the canonical model preserves uncertainty", () => {
    const value = draft();
    addPanels(value);
    value.categories[0].decision = "unresolved";
    value.categories[1].decision = "not_present";
    const workflow = project(value, "saved");
    expect(workflow.completedCategoryCount).toBe(0);
    expect(workflow.readyForPrecheck).toBe(false);
    expect(workflow.categoryStatuses.map((status) => status.needsAttention)).toEqual([true, false]);
  });

  it("honors an instructional profile that explicitly allows not-present for a category", () => {
    const value = draft();
    addPanels(value);
    acceptCategories(value);
    const allowedCategory = value.categories[0].categoryId;
    value.categories[0] = {
      ...value.categories[0],
      decision: "not_present",
      expectedValue: "",
      regions: [],
    };
    const workflow = deriveGuidedPackageWorkflow({
      draft: value,
      definitions: WINE_PACKAGE_CATEGORY_DEFINITIONS,
      instructions: WINE_PACKAGE_CATEGORY_INSTRUCTIONS.map((instruction) => ({
        ...instruction,
        notPresentAllowed: instruction.categoryId === allowedCategory,
      })),
      saveState: "saved",
    });
    expect(
      workflow.categoryStatuses.find((status) => status.categoryId === allowedCategory)?.complete,
    ).toBe(true);
  });

  it("requires panel-local valid geometry and an explicit package save before pre-check", () => {
    const value = draft();
    addPanels(value);
    acceptCategories(value);
    expect(project(value, "unsaved")).toMatchObject({
      phase: "save",
      completedCategoryCount: 2,
      readyForPrecheck: false,
    });
    expect(project(value, "saved").readyForPrecheck).toBe(true);
    value.categories[0].regions[0].panelId = "missing-panel";
    expect(project(value, "saved").readyForPrecheck).toBe(false);
  });

  it("focuses the correction phase only on flagged reviewed categories", () => {
    const value = draft();
    addPanels(value);
    acceptCategories(value);
    value.analysisRuns = [
      {
        analysisRunId: "analysis-1",
        sequence: 1,
        sellerChangeSequence: 0,
        recordedAt: "2026-07-18T01:00:00.000Z",
        panelRuns: [],
        categories: [
          {
            categoryId: "brandName",
            state: "clearly_readable",
            observedValue: "CEDAR RIDGE",
            supportingPanelIds: ["front-panel"],
            supportingRegionIds: ["brandName-region"],
            reason: "Clear.",
          },
          {
            categoryId: "alcoholStatement",
            state: "needs_review",
            observedValue: "12%",
            supportingPanelIds: [],
            supportingRegionIds: [],
            reason: "Mismatch.",
          },
        ],
        readiness: "needs_seller_review",
      },
    ];
    const workflow = project(value, "saved");
    expect(workflow.phase).toBe("fix");
    expect(workflow.flaggedCategoryIds).toEqual(["alcoholStatement"]);
    expect(workflow.focusCategoryIds).toEqual(["alcoholStatement"]);
  });

  it("removes resolved correction categories from the queue and exits instead of cycling", () => {
    const value = draft();
    addPanels(value);
    acceptCategories(value);
    value.analysisRuns = [
      {
        analysisRunId: "analysis-1",
        sequence: 1,
        sellerChangeSequence: 0,
        recordedAt: "2026-07-18T01:00:00.000Z",
        panelRuns: [],
        categories: WINE_PACKAGE_CATEGORY_DEFINITIONS.map((definition) => ({
          categoryId: definition.categoryId,
          state: "needs_review" as const,
          observedValue: "machine value",
          supportingPanelIds: [],
          supportingRegionIds: [],
          reason: "Seller and machine evidence differ.",
        })),
        readiness: "needs_seller_review",
      },
    ];

    expect(project(value, "saved").correctionPendingCategoryIds).toEqual([
      "brandName",
      "alcoholStatement",
    ]);
    value.sellerChangeHistory.push({
      changeId: "brand-reviewed",
      sequence: 1,
      recordedAt: "2026-07-18T02:00:00.000Z",
      action: "category_updated",
      categoryId: "brandName",
      detail: "Brand discrepancy reviewed.",
    });
    expect(project(value, "unsaved")).toMatchObject({
      phase: "fix",
      correctionResolvedCategoryIds: ["brandName"],
      correctionPendingCategoryIds: ["alcoholStatement"],
      focusCategoryIds: ["alcoholStatement"],
      correctionCycleComplete: false,
    });

    value.sellerChangeHistory.push({
      changeId: "alcohol-reviewed",
      sequence: 2,
      recordedAt: "2026-07-18T03:00:00.000Z",
      action: "category_updated",
      categoryId: "alcoholStatement",
      detail: "Alcohol discrepancy reviewed.",
    });
    expect(project(value, "unsaved")).toMatchObject({
      phase: "save",
      correctionPendingCategoryIds: [],
      focusCategoryIds: [],
      correctionCycleComplete: true,
      recommendedAction: "Save the updated draft",
    });
    expect(project(value, "saved")).toMatchObject({
      phase: "save",
      correctionCycleComplete: true,
      recommendedAction: "Run the package pre-check again",
    });
  });

  it("allows human-agent handoff after the seller explicitly keeps flagged evidence unchanged", () => {
    const value = draft();
    addPanels(value);
    acceptCategories(value);
    value.analysisRuns = [
      {
        analysisRunId: "analysis-1",
        sequence: 1,
        sellerChangeSequence: 0,
        recordedAt: "2026-07-18T01:00:00.000Z",
        panelRuns: [],
        categories: [
          {
            categoryId: "brandName",
            state: "clearly_readable",
            observedValue: "CEDAR RIDGE",
            supportingPanelIds: ["front-panel"],
            supportingRegionIds: ["brandName-region"],
            reason: "Clear.",
          },
          {
            categoryId: "alcoholStatement",
            state: "needs_review",
            observedValue: "12%",
            supportingPanelIds: [],
            supportingRegionIds: [],
            reason: "Seller and machine evidence differ.",
          },
        ],
        readiness: "needs_seller_review",
      },
    ];
    value.sellerChangeHistory.push({
      changeId: "alcohol-kept",
      sequence: 1,
      recordedAt: "2026-07-18T02:00:00.000Z",
      action: "category_updated",
      categoryId: "alcoholStatement",
      detail:
        "Alcohol statement machine discrepancy reviewed; seller evidence deliberately kept unchanged.",
    });

    expect(project(value, "saved")).toMatchObject({
      phase: "prepare",
      analysisCurrent: true,
      correctionCycleComplete: true,
      readyForAgentPackage: true,
      recommendedAction: "Prepare the local-only agent package",
    });
  });

  it("distinguishes stale readiness from a current local-export-ready run", () => {
    const value = draft();
    addPanels(value);
    acceptCategories(value);
    value.analysisRuns = [
      {
        analysisRunId: "analysis-1",
        sequence: 1,
        sellerChangeSequence: 0,
        recordedAt: "2026-07-18T01:00:00.000Z",
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
    expect(project(value, "saved")).toMatchObject({
      phase: "prepare",
      analysisCurrent: true,
      readyForAgentPackage: true,
    });
    value.sellerChangeHistory.push({
      changeId: "change-1",
      sequence: 1,
      recordedAt: "2026-07-18T02:00:00.000Z",
      action: "category_updated",
      detail: "Material seller edit.",
    });
    expect(project(value, "unsaved")).toMatchObject({
      phase: "save",
      analysisCurrent: false,
      readyForAgentPackage: false,
    });
  });
});
