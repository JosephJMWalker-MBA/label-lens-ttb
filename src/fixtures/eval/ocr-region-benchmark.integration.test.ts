// @vitest-environment node
import { describe, expect, it } from "vitest";

import { renderOcrRegionBenchmarkMarkdown, runOcrRegionBenchmark } from "./ocr-region-benchmark";

const OCR_TIMEOUT = 6 * 60_000;

describe("ocr region benchmark integration", () => {
  it(
    "runs the bounded benchmark slice with replacement, additive, rotation, and scale variants",
    async () => {
      const report = await runOcrRegionBenchmark({
        caseIds: ["approved-wine-022", "la-fattoria-rotated"],
      });

      expect(report.cases).toHaveLength(2);
      expect(report.scenarioSummary).toHaveLength(13);
      expect(report.aggregateComparisons).toHaveLength(26);
      expect(report.contributionSummaries).toHaveLength(24);
      expect(report.productionBoundaryProof.productionBehaviorChangeAuthorized).toBe(false);

      const absentBrand = report.cases.find(
        (caseResult) => caseResult.caseId === "approved-wine-022",
      );
      expect(absentBrand).toBeDefined();
      expect(absentBrand!.fields.brand.scaleVariants.targetedCrop["1.5x"].applicable).toBe(false);
      expect(absentBrand!.fields.alcohol.scaleVariants.targetedCrop["1.5x"].applicable).toBe(true);
      expect(
        absentBrand!.fields.alcohol.scaleVariants.additiveTargetedCrop["1.5x"].hybridProvenance
          ?.productionPassIds.length,
      ).toBeGreaterThan(0);

      const rotated = report.cases.find(
        (caseResult) => caseResult.caseId === "la-fattoria-rotated",
      );
      expect(rotated).toBeDefined();
      expect(rotated!.fields.alcohol.scaleVariants.targetedCrop["1.5x"].applicable).toBe(true);
      expect(rotated!.fields.alcohol.scaleVariants.canonicalRotatedCrop["1.5x"].applicable).toBe(
        true,
      );
      expect(
        rotated!.fields.alcohol.scaleVariants.canonicalRotatedCrop["1.5x"].rotationApplied,
      ).toBe(270);
      expect(
        rotated!.fields.alcohol.scaleVariants.additiveCanonicalRotatedCrop["1.5x"].hybridProvenance
          ?.targetedPassKind,
      ).toBe("benchmark-canonical-rotated-targeted-crop");

      const markdown = renderOcrRegionBenchmarkMarkdown(report);
      expect(markdown).toContain("Partial fragments are not counted as phrase recovery");
      expect(markdown).toContain(
        "Dice/bigram similarity measures approximate character overlap only",
      );
    },
    OCR_TIMEOUT,
  );
});
