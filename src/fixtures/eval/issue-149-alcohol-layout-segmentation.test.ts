import { describe, expect, it } from "vitest";

import { PAGE_SEG } from "@/pipeline/extractor/ocr-engine";
import { planSellerRegionOcrPass } from "@/pipeline/extractor/regions";

import {
  ALCOHOL_LAYOUT_CASES,
  alcoholLayoutTreatmentPass,
  passInvariantProjection,
  stableCaseProjection,
  treatmentEligibleForAlcoholLayout,
} from "./issue-149-alcohol-layout-segmentation";
import { cropPlanForCase, normalizedRegion } from "./issue-149-bounded-baseline";

describe("issue 149 alcohol layout segmentation experiment", () => {
  it("keeps Brand byte-for-byte on the control pass", () => {
    const brand = ALCOHOL_LAYOUT_CASES.find((item) => item.fieldType === "brandName");
    expect(brand).toBeDefined();
    const image = { width: brand!.source.width, height: brand!.source.height };
    const pass = planSellerRegionOcrPass(
      {
        categoryId: brand!.fieldType,
        regionId: `${brand!.caseId}-${brand!.fieldType}`,
        panelId: brand!.panelId,
        region: normalizedRegion(brand!.selectedPixelRegion, image.width, image.height),
      },
      image.width,
      image.height,
      1,
    );
    expect(pass).not.toBeNull();
    expect(alcoholLayoutTreatmentPass(brand!, pass!).pageSegMode).toBe(PAGE_SEG.SPARSE_TEXT);
    expect(alcoholLayoutTreatmentPass(brand!, pass!)).toEqual(pass);
  });

  it("keeps horizontal and bottom Alcohol on the control PSM", () => {
    const controls = ALCOHOL_LAYOUT_CASES.filter(
      (item) =>
        item.fieldType === "alcoholStatement" &&
        (item.layoutClass === "horizontal" || item.layoutClass === "bottom"),
    );
    expect(controls).toHaveLength(2);
    expect(controls.every((item) => !treatmentEligibleForAlcoholLayout(item))).toBe(true);
  });

  it("applies the treatment PSM only to side, rotated, and vertical Alcohol", () => {
    const treated = ALCOHOL_LAYOUT_CASES.filter(treatmentEligibleForAlcoholLayout);
    expect(treated.map((item) => item.layoutClass).sort()).toEqual([
      "rotated",
      "rotated",
      "side",
      "side",
      "vertical",
      "vertical",
    ]);
  });

  it("changes only page segmentation mode for eligible treatment passes", () => {
    const definition = ALCOHOL_LAYOUT_CASES.find(
      (item) => item.fieldType === "alcoholStatement" && item.layoutClass === "vertical",
    )!;
    const image = { width: definition.source.width, height: definition.source.height };
    const target = {
      categoryId: definition.fieldType,
      regionId: `${definition.caseId}-${definition.fieldType}`,
      panelId: definition.panelId,
      region: normalizedRegion(definition.selectedPixelRegion, image.width, image.height),
    };
    const control = planSellerRegionOcrPass(target, image.width, image.height, 1)!;
    const treatment = alcoholLayoutTreatmentPass(definition, control);
    expect(control.pageSegMode).toBe(PAGE_SEG.SPARSE_TEXT);
    expect(treatment.pageSegMode).toBe(PAGE_SEG.SINGLE_LINE);
    expect(passInvariantProjection(treatment)).toEqual(passInvariantProjection(control));
  });

  it("keeps crop geometry, scale, and preprocessing tied to the control planner", () => {
    for (const definition of ALCOHOL_LAYOUT_CASES) {
      const image = { width: definition.source.width, height: definition.source.height };
      const target = {
        categoryId: definition.fieldType,
        regionId: `${definition.caseId}-${definition.fieldType}`,
        panelId: definition.panelId,
        region: normalizedRegion(definition.selectedPixelRegion, image.width, image.height),
      };
      const pass = planSellerRegionOcrPass(target, image.width, image.height, 1)!;
      const treatment = alcoholLayoutTreatmentPass(definition, pass);
      expect(cropPlanForCase(definition, image)?.crop).toEqual(pass.transform.crop);
      expect(passInvariantProjection(treatment)).toEqual(passInvariantProjection(pass));
    }
  });

  it("preserves reliability/comparison thresholds and unreadable routing fixtures", () => {
    const unreadable = ALCOHOL_LAYOUT_CASES.find((item) => item.layoutClass === "unreadable");
    expect(unreadable?.expectedReadable).toBe(false);
    expect(unreadable && treatmentEligibleForAlcoholLayout(unreadable)).toBe(false);
  });

  it("has deterministic artifact projections outside latency", () => {
    const projected = stableCaseProjection({
      caseId: "case",
      arm: "control",
      layoutClass: "side",
      latencyMs: { boundedOcr: 1 },
    });
    expect(projected).toEqual({ caseId: "case", arm: "control", layoutClass: "side" });
  });
});
