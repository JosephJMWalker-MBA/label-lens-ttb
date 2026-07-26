import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GuidedCategoryTask } from "./GuidedCategoryTask";
import type { PackageCategoryAnalysis, PackageCategoryDraft } from "./package-model";

const category: PackageCategoryDraft = {
  categoryId: "brandName",
  decision: "provided",
  expectedValue: "M CELLARS",
  regions: [
    {
      regionId: "brand-a",
      categoryId: "brandName",
      panelId: "front",
      unit: "normalized-panel-relative",
      provenance: "seller-selected-region",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.1,
    },
  ],
};

const analysis: PackageCategoryAnalysis = {
  categoryId: "brandName",
  state: "needs_review",
  observedValue: "PRODUCER ELSEWHERE",
  supportingPanelIds: [],
  supportingRegionIds: [],
  reason:
    "The seller-region machine reading conflicts with the independent machine-discovered reading.",
  comparison: {
    categoryId: "brandName",
    sellerDeclaredValue: "M CELLARS",
    sellerRegionReadings: [
      {
        categoryId: "brandName",
        regionId: "brand-a",
        panelId: "front",
        sellerRegion: category.regions[0],
        cropGeometry: {
          left: 90,
          top: 290,
          width: 330,
          height: 160,
          imageWidth: 1000,
          imageHeight: 1500,
        },
        rawTranscript: "M CELLARS",
        observedValue: "M CELLARS",
        ocrEvidenceScore: 0.92,
        evidenceState: "OBSERVED",
        observationState: "OBSERVED",
        passProvenance: null,
        extractionProvenance: {
          extractionAdapterId: "test",
          extractionAdapterVersion: "1",
          ocrEngine: { kind: "not_applicable" },
          parserId: "test-parser",
          parserVersion: "1",
          processedAt: "2026-07-18T00:00:00.000Z",
        },
      },
    ],
    machineDiscoveredReading: {
      panelId: "front",
      observedValue: "PRODUCER ELSEWHERE",
      state: "OBSERVED",
      ocrEvidenceScore: 0.94,
      confidence: 0.94,
      source: "machine-discovered-reading",
    },
    outcome: "CONFLICT",
    reason:
      "The seller-region machine reading conflicts with the independent machine-discovered reading.",
    supportingPanelIds: [],
    supportingRegionIds: [],
    conflictingPanelIds: ["front"],
    conflictingRegionIds: ["brand-a"],
  },
};

function renderTask() {
  render(
    <GuidedCategoryTask
      definition={{
        categoryId: "brandName",
        requirementId: "wine-brand-name-required",
        requirementVersion: "1.0.0",
        label: "Brand name",
        requiresValue: true,
        applicability: "always",
      }}
      instruction={{
        categoryId: "brandName",
        plainLanguageQuestion: "What brand name is printed most prominently on the label?",
        placementHint: "Usually on the front panel.",
        exampleValue: "M CELLARS",
        examplePanelRole: "front",
        exampleRegion: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
        starterRegion: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
        notPresentAllowed: false,
      }}
      category={category}
      analysis={analysis}
      taskPosition={1}
      taskCount={2}
      workingValue="M CELLARS"
      pendingRegionAvailable={false}
      editing={false}
      machineObservationVisible={false}
      machineRegionAvailable={false}
      showReviewNavigation
      onWorkingValueChange={vi.fn()}
      onBeginRegionEdit={vi.fn()}
      onBeginTextEdit={vi.fn()}
      onToggleMachineObservation={vi.fn()}
      onUseMachineRegion={vi.fn()}
      onNeedsAttention={vi.fn()}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
    />,
  );
}

describe("GuidedCategoryTask two-stream comparison", () => {
  it("labels seller-region and independent machine readings separately", () => {
    renderTask();

    expect(screen.getByText("Seller says")).toBeInTheDocument();
    expect(screen.getByText("Machine read inside selected location")).toBeInTheDocument();
    expect(screen.getByText("Machine independently found")).toBeInTheDocument();
    expect(screen.getByText("Comparison state")).toBeInTheDocument();
    expect(screen.getByText("Conflict")).toBeInTheDocument();
    expect(screen.getAllByText("M CELLARS")).toHaveLength(2);
    expect(screen.getByText("PRODUCER ELSEWHERE")).toBeInTheDocument();
  });
});
