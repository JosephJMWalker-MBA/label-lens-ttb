// @vitest-environment node
import { describe, expect, it } from "vitest";

import { runOcrRegionBenchmark } from "./ocr-region-benchmark";

const OCR_TIMEOUT = 180_000;

describe("ocr region benchmark integration", () => {
  it(
    "runs the bounded benchmark slice with targeted and canonical scenarios",
    async () => {
      const report = await runOcrRegionBenchmark({
        caseIds: ["approved-wine-022", "la-fattoria-rotated"],
      });

      expect(report.cases).toHaveLength(2);
      const absentBrand = report.cases.find(
        (caseResult) => caseResult.caseId === "approved-wine-022",
      );
      expect(absentBrand).toBeDefined();
      expect(absentBrand!.fields.brand.targetedCrop.applicable).toBe(false);
      expect(absentBrand!.fields.alcohol.targetedCrop.applicable).toBe(true);

      const rotated = report.cases.find(
        (caseResult) => caseResult.caseId === "la-fattoria-rotated",
      );
      expect(rotated).toBeDefined();
      expect(rotated!.fields.alcohol.targetedCrop.applicable).toBe(true);
      expect(rotated!.fields.alcohol.canonicalRotatedCrop.applicable).toBe(true);
      expect(rotated!.fields.alcohol.canonicalRotatedCrop.rotationApplied).toBe(270);

      expect(report.aggregateComparisons.length).toBe(6);
      expect(report.productionBoundaryProof.productionBehaviorChangeAuthorized).toBe(false);
    },
    OCR_TIMEOUT,
  );
});
