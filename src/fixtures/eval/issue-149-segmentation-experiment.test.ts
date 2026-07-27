// @vitest-environment node
import { describe, expect, it } from "vitest";

import { BASELINE_CASES, normalizedRegion } from "./issue-149-bounded-baseline";
import {
  passInvariantProjection,
  treatmentPassFromControl,
} from "./issue-149-segmentation-experiment";
import { PAGE_SEG } from "@/pipeline/extractor/ocr-engine";
import { planSellerRegionOcrPass } from "@/pipeline/extractor/regions";

const definition = BASELINE_CASES[0]!;
const image =
  definition.source.kind === "synthetic"
    ? { width: definition.source.width, height: definition.source.height }
    : { width: 976, height: 1126 };
const target = {
  categoryId: definition.fieldType,
  regionId: `${definition.caseId}-${definition.fieldType}`,
  panelId: definition.panelId,
  region: normalizedRegion(definition.selectedPixelRegion, image.width, image.height),
};

describe("Issue #149 segmentation experiment", () => {
  it("keeps the control segmentation mode unchanged", () => {
    const control = planSellerRegionOcrPass(target, image.width, image.height, 1);
    expect(control?.pageSegMode).toBe(PAGE_SEG.SPARSE_TEXT);
  });

  it("changes only the segmentation mode in the treatment pass", () => {
    const control = planSellerRegionOcrPass(target, image.width, image.height, 1);
    expect(control).not.toBeNull();
    const treatment = treatmentPassFromControl(control!);
    expect(treatment.pageSegMode).toBe(PAGE_SEG.SINGLE_LINE);
    expect(passInvariantProjection(treatment)).toEqual(passInvariantProjection(control!));
  });

  it("keeps crop geometry byte target, preprocessing, scaling, and orientation identical", () => {
    const control = planSellerRegionOcrPass(target, image.width, image.height, 1)!;
    const treatment = treatmentPassFromControl(control);
    expect(treatment.transform.crop).toEqual(control.transform.crop);
    expect(treatment.transform.scale).toBe(control.transform.scale);
    expect(treatment.transform.rotate).toBe(control.transform.rotate);
    expect(treatment.preprocessing).toEqual(control.preprocessing);
  });

  it("keeps authority and comparison policy outside the production path", () => {
    const control = planSellerRegionOcrPass(target, image.width, image.height, 1)!;
    const treatment = treatmentPassFromControl(control);
    expect(treatment.fieldEligibility).toEqual(control.fieldEligibility);
    expect(treatment.triggerReasons).toEqual(control.triggerReasons);
    expect(treatment.passKind).toBe(control.passKind);
  });

  it("contains the unreadable safety case in the fixed corpus", () => {
    expect(
      BASELINE_CASES.some((item) => item.caseId === "alcohol-unreadable-selected-region"),
    ).toBe(true);
  });

  it("uses a deterministic treatment pass projection", () => {
    const control = planSellerRegionOcrPass(target, image.width, image.height, 1)!;
    expect(JSON.stringify(treatmentPassFromControl(control))).toBe(
      JSON.stringify(treatmentPassFromControl(control)),
    );
  });
});
