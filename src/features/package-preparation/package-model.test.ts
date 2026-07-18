import { describe, expect, it } from "vitest";

import type { PrecheckServiceResponse } from "@/server/precheck-service.types";

import {
  appendSellerChange,
  buildSellerPackageExport,
  categoryPreparationComplete,
  createAnalysisRun,
  deriveCategoryAnalysis,
  latestAnalysisIsCurrent,
  packagePreparationComplete,
  serializeSellerPackageExport,
  type PackageCategoryDefinition,
  type PackagePanelMachineRun,
  type SellerEvidenceRegion,
  type SellerPackageDraft,
} from "./package-model";

const definitions: PackageCategoryDefinition[] = [
  {
    categoryId: "brandName",
    requirementId: "wine-brand-name-required",
    requirementVersion: "1.0.0",
    label: "Brand name",
    requiresValue: true,
    applicability: "always",
  },
  {
    categoryId: "alcoholStatement",
    requirementId: "wine-alcohol-statement-required",
    requirementVersion: "1.0.0",
    label: "Alcohol statement",
    requiresValue: true,
    applicability: "conditional",
  },
];

function region(
  overrides: Partial<SellerEvidenceRegion> &
    Pick<SellerEvidenceRegion, "regionId" | "categoryId" | "panelId">,
): SellerEvidenceRegion {
  return {
    unit: "normalized-panel-relative",
    provenance: "seller-selected-region",
    x: 0.1,
    y: 0.1,
    width: 0.4,
    height: 0.2,
    ...overrides,
  };
}

function draft(): SellerPackageDraft {
  return {
    schemaVersion: "seller-package-draft.v1",
    packageId: "pkg-1",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    profile: { id: "wine-label-requirements", version: "1.0.0" },
    panels: [
      {
        panelId: "front-1",
        order: 0,
        role: "front",
        displayName: "front.png",
        mediaType: "image/png",
        byteSize: 10,
        checksumSha256: "a".repeat(64),
        width: 1000,
        height: 1500,
        rotation: 0,
      },
      {
        panelId: "back-1",
        order: 1,
        role: "back",
        displayName: "back.png",
        mediaType: "image/png",
        byteSize: 11,
        checksumSha256: "b".repeat(64),
        width: 900,
        height: 1400,
        rotation: 0,
      },
    ],
    categories: [
      {
        categoryId: "brandName",
        decision: "provided",
        expectedValue: "M CELLARS",
        regions: [region({ regionId: "brand-front", categoryId: "brandName", panelId: "front-1" })],
      },
      {
        categoryId: "alcoholStatement",
        decision: "provided",
        expectedValue: "12.5",
        regions: [
          region({
            regionId: "alcohol-back",
            categoryId: "alcoholStatement",
            panelId: "back-1",
            x: 0.5,
            y: 0.6,
            width: 0.4,
            height: 0.2,
          }),
        ],
      },
    ],
    sellerChangeHistory: [],
    analysisRuns: [],
  };
}

function panelRun(
  panelId: string,
  fields: Partial<PrecheckServiceResponse["observations"]> = {},
): PackagePanelMachineRun {
  const notObserved = {
    state: "NOT_OBSERVED" as const,
    value: null,
    confidence: 0,
    ocrEvidenceScore: 0,
    alternates: [],
  };
  return {
    panelId,
    machineResultId: `machine-${panelId}`,
    exportJson: JSON.stringify({
      versionManifest: {
        applicationBuild: {
          packageVersion: "0.1.0",
          gitCommitSha: "e575ca664b6ea897b0d7a25235dc87da428b69dd",
          commitProvenance: "build-environment",
        },
      },
    }),
    observations: {
      provenance: {
        artifactRef: panelId,
        derivativeSha256: "c".repeat(64),
        extractionAdapterId: "test",
        extractionAdapterVersion: "1",
        ocrEngine: { kind: "not_applicable" },
        parserId: "test",
        parserVersion: "1",
        processedAt: "2026-07-18T00:00:00.000Z",
      },
      brandName: notObserved,
      alcoholStatement: notObserved,
      ...fields,
    },
  };
}

describe("seller package model", () => {
  it("treats front and back as one package without combining their coordinate frames", () => {
    const value = draft();
    expect(value.panels.map((panel) => panel.panelId)).toEqual(["front-1", "back-1"]);
    expect(value.categories[0].regions[0].panelId).toBe("front-1");
    expect(value.categories[1].regions[0].panelId).toBe("back-1");
    expect(packagePreparationComplete(value, definitions)).toBe(true);
  });

  it("supports multiple regions for one category across different panels", () => {
    const value = draft();
    const brand = value.categories[0];
    brand.regions.push(
      region({ regionId: "brand-back", categoryId: "brandName", panelId: "back-1" }),
    );
    expect(brand.regions.map((item) => item.panelId)).toEqual(["front-1", "back-1"]);
    expect(categoryPreparationComplete(brand, definitions[0])).toBe(true);
  });

  it("does not count empty geometry as prepared evidence", () => {
    const value = draft().categories[0];
    value.regions[0] = { ...value.regions[0], width: 0 };
    expect(categoryPreparationComplete(value, definitions[0])).toBe(false);
  });

  it("allows explicit unresolved and not-present states to satisfy preparation gating", () => {
    const value = draft();
    value.categories[0] = {
      ...value.categories[0],
      decision: "unresolved",
      expectedValue: "",
      regions: [],
    };
    value.categories[1] = {
      ...value.categories[1],
      decision: "not_present",
      expectedValue: "",
      regions: [],
    };
    expect(packagePreparationComplete(value, definitions)).toBe(true);
  });

  it("keeps seller changes append-only and sequential", () => {
    const first = appendSellerChange(draft(), {
      changeId: "change-1",
      recordedAt: "2026-07-18T01:00:00.000Z",
      action: "region_added",
      categoryId: "brandName",
      panelId: "front-1",
      regionId: "brand-front",
      detail: "Brand region committed.",
    });
    const second = appendSellerChange(first, {
      changeId: "change-2",
      recordedAt: "2026-07-18T01:01:00.000Z",
      action: "region_moved",
      categoryId: "brandName",
      panelId: "front-1",
      regionId: "brand-front",
      detail: "Brand region moved.",
    });
    expect(second.sellerChangeHistory.map((change) => change.sequence)).toEqual([1, 2]);
    expect(first.sellerChangeHistory).toHaveLength(1);
  });

  it("preserves seller evidence and reports not_found when OCR returns NOT_OBSERVED", () => {
    const category = draft().categories[1];
    const result = deriveCategoryAnalysis(category, [panelRun("front-1"), panelRun("back-1")]);
    expect(category.regions).toHaveLength(1);
    expect(result.state).toBe("not_found");
  });

  it("requires clear machine evidence, value agreement, and seller-region overlap", () => {
    const brandObservation = {
      state: "OBSERVED" as const,
      value: "M CELLARS",
      normalizedValue: "M CELLARS",
      confidence: 0.9,
      ocrEvidenceScore: 0.9,
      alternates: [],
      geometry: {
        imageIndex: 0,
        x: 100,
        y: 100,
        width: 300,
        height: 100,
        imageWidth: 1000,
        imageHeight: 1000,
      },
    };
    const result = deriveCategoryAnalysis(draft().categories[0], [
      panelRun("front-1", { brandName: brandObservation }),
      panelRun("back-1"),
    ]);
    expect(result.state).toBe("clearly_readable");
    expect(result.supportingPanelIds).toEqual(["front-1"]);
    expect(result.supportingRegionIds).toEqual(["brand-front"]);
  });

  it("preserves prior machine runs when re-analysis appends a new run", () => {
    const value = draft();
    const first = createAnalysisRun({
      draft: value,
      panelRuns: [panelRun("front-1"), panelRun("back-1")],
      analysisRunId: "analysis-1",
      recordedAt: "2026-07-18T02:00:00.000Z",
    });
    const withFirst = { ...value, analysisRuns: [first] };
    const second = createAnalysisRun({
      draft: withFirst,
      panelRuns: [panelRun("front-1"), panelRun("back-1")],
      analysisRunId: "analysis-2",
      recordedAt: "2026-07-18T03:00:00.000Z",
    });
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(withFirst.analysisRuns[0]).toBe(first);
  });

  it("derives readiness and exports exact machine build provenance with package integrity", async () => {
    const value = draft();
    const observedBrand = {
      state: "OBSERVED" as const,
      value: "M CELLARS",
      confidence: 0.9,
      ocrEvidenceScore: 0.9,
      alternates: [],
      geometry: {
        imageIndex: 0,
        x: 100,
        y: 100,
        width: 300,
        height: 100,
        imageWidth: 1000,
        imageHeight: 1000,
      },
    };
    const observedAlcohol = {
      state: "OBSERVED" as const,
      value: "12.5% alc./vol.",
      normalizedValue: "12.5",
      confidence: 0.9,
      ocrEvidenceScore: 0.9,
      alternates: [],
      geometry: {
        imageIndex: 0,
        x: 500,
        y: 600,
        width: 300,
        height: 100,
        imageWidth: 1000,
        imageHeight: 1000,
      },
    };
    const run = createAnalysisRun({
      draft: value,
      panelRuns: [
        panelRun("front-1", { brandName: observedBrand }),
        panelRun("back-1", { alcoholStatement: observedAlcohol }),
      ],
      analysisRunId: "analysis-ready",
      recordedAt: "2026-07-18T04:00:00.000Z",
    });
    expect(run.readiness).toBe("ready_for_agent_submission");

    const exportValue = await buildSellerPackageExport({
      draft: { ...value, analysisRuns: [run] },
      submittedBy: "Seller example",
      submittedAt: "2026-07-18T05:00:00.000Z",
    });
    expect(exportValue.applicationBuild).toMatchObject({
      gitCommitSha: "e575ca664b6ea897b0d7a25235dc87da428b69dd",
    });
    expect(exportValue.boundary.transmission).toBe("local-download-only");
    expect(exportValue.boundary.governmentApproval).toBe(false);
    expect(exportValue.integrity.value).toMatch(/^[a-f0-9]{64}$/);
    expect(serializeSellerPackageExport(exportValue)).toContain("seller-prepared-agent-package");

    const revised = appendSellerChange(
      { ...value, analysisRuns: [run] },
      {
        changeId: "change-after-analysis",
        recordedAt: "2026-07-18T05:01:00.000Z",
        action: "category_updated",
        categoryId: "brandName",
        detail: "Seller changed the value after analysis.",
      },
    );
    expect(latestAnalysisIsCurrent(revised)).toBe(false);
    await expect(
      buildSellerPackageExport({
        draft: revised,
        submittedBy: "Seller example",
        submittedAt: "2026-07-18T05:02:00.000Z",
      }),
    ).rejects.toThrow("PACKAGE_NOT_READY_FOR_AGENT_SUBMISSION");
  });
});
