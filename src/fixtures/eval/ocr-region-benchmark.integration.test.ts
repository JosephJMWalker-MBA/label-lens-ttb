// @vitest-environment node
import { describe, expect, it } from "vitest";

import { loadEvalManifest } from "./eval-loader";
import { runCase } from "./eval-harness";
import { renderOcrRegionBenchmarkMarkdown, runOcrRegionBenchmark } from "./ocr-region-benchmark";

const OCR_TIMEOUT = 6 * 60_000;

describe("ocr region benchmark integration", () => {
  it(
    "runs the bounded benchmark slice with recovery, regression, latency, and scale accounting",
    async () => {
      const report = await runOcrRegionBenchmark({
        caseIds: [
          "approved-wine-006",
          "approved-wine-013",
          "approved-wine-022",
          "approved-wine-054",
          "la-fattoria-rotated",
          "wine-multi-artifact-09",
        ],
      });

      expect(report.cases).toHaveLength(6);
      expect(report.scenarioSummary).toHaveLength(13);
      expect(report.aggregateComparisons).toHaveLength(26);
      expect(report.contributionSummaries).toHaveLength(24);
      expect(report.recoverySummaries).toHaveLength(24);
      expect(report.regressionSummaries).toHaveLength(16);
      expect(report.scaleAnalysis).toHaveLength(8);
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
      const absentBrandAggregate = report.aggregateComparisons.find(
        (row) =>
          row.scenario === "human-targeted-crop" && row.scale === 1.5 && row.field === "brand",
      );
      expect(absentBrandAggregate?.absentCaseCount).toBe(0);
      expect(absentBrandAggregate?.absentFieldFalsePositiveRate).toBeNull();

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

      const cropBrandRecovery15 = report.recoverySummaries.find(
        (row) =>
          row.scenario === "human-targeted-crop" && row.scale === 1.5 && row.field === "brand",
      );
      expect(cropBrandRecovery15).toMatchObject({
        exactRecoveryCount: 0,
        correctUncertaintyRecoveryCount: 2,
        totalAcceptableRecoveryCount: 2,
      });
      const additiveBrandRecovery15 = report.recoverySummaries.find(
        (row) =>
          row.scenario === "baseline-plus-targeted-crop" &&
          row.scale === 1.5 &&
          row.field === "brand",
      );
      expect(additiveBrandRecovery15).toMatchObject({
        exactRecoveryCount: 0,
        correctUncertaintyRecoveryCount: 2,
        totalAcceptableRecoveryCount: 2,
      });

      const cropRegressionSummary = report.regressionSummaries.find(
        (row) => row.scenario === "human-targeted-crop" && row.scale === null,
      );
      expect(cropRegressionSummary).toMatchObject({
        scenarioScaleRegressionInstanceCount: 19,
        uniqueCaseFieldRegressionCount: 7,
      });
      const additiveRegressionSummary = report.regressionSummaries.find(
        (row) => row.scenario === "baseline-plus-targeted-crop" && row.scale === null,
      );
      expect(additiveRegressionSummary).toMatchObject({
        scenarioScaleRegressionInstanceCount: 1,
        uniqueCaseFieldRegressionCount: 1,
      });

      const additiveBrandLatency15 = report.latencyComparison.find(
        (row) =>
          row.scenario === "baseline-plus-targeted-crop" &&
          row.scale === 1.5 &&
          row.field === "brand",
      );
      expect(additiveBrandLatency15?.latencyInterpretation).toBe("estimated-combined");
      expect(additiveBrandLatency15?.matchedBaselineMedianLatencyMs).not.toBeNull();
      expect(additiveBrandLatency15?.measuredTargetedIncrementalMedianLatencyMs).not.toBeNull();
      expect(additiveBrandLatency15?.estimatedCombinedMedianLatencyMs).not.toBeNull();
      expect(additiveBrandLatency15?.matchedMedianDeltaLatencyMs).toBeCloseTo(
        additiveBrandLatency15?.measuredTargetedIncrementalMedianLatencyMs,
        10,
      );

      const additiveAlcoholScale = report.scaleAnalysis.find(
        (row) => row.scenario === "baseline-plus-targeted-crop" && row.field === "alcohol",
      );
      expect(additiveAlcoholScale).toMatchObject({
        improvedWithScaleCount: 0,
        worsenedWithScaleCount: 1,
      });

      const additiveBrandConclusion = report.conclusions.find(
        (conclusion) => conclusion.topic === "additive-brand",
      );
      expect(additiveBrandConclusion?.labels).toContain("BOUNDED ADDITIVE BRAND SIGNAL SUPPORTED");
      expect(additiveBrandConclusion?.evidence.join("\n")).toContain("approved-wine-013:brand");
      expect(additiveBrandConclusion?.evidence.join("\n")).toContain("approved-wine-054:brand");

      const recoveredCase = report.cases.find(
        (caseResult) => caseResult.caseId === "approved-wine-013",
      );
      expect(recoveredCase?.fields.brand.diagnosticBestScenario.scenario).toBe(
        "human-targeted-crop",
      );

      const rotationConclusion = report.conclusions.find(
        (conclusion) => conclusion.topic === "rotation",
      );
      expect(rotationConclusion?.rationale).toContain("two applicable alcohol fields");

      const markdown = renderOcrRegionBenchmarkMarkdown(report);
      expect(markdown).toContain("Partial fragments are not counted as phrase recovery");
      expect(markdown).toContain(
        "Dice/bigram similarity measures approximate character overlap only",
      );
      expect(markdown).toContain("Estimated combined latency");
      expect(markdown).toContain("N/A");
      expect(markdown).toContain("Scenario-scale regression instances");
      expect(markdown).toContain("Diagnostic best outcome (non-prescriptive)");
    },
    OCR_TIMEOUT,
  );

  it(
    "keeps the benchmark baseline aligned with the real production case report",
    async () => {
      const manifest = loadEvalManifest();
      const evalCase = manifest.cases.find((candidate) => candidate.caseId === "approved-wine-013");
      expect(evalCase).toBeDefined();

      const benchmark = await runOcrRegionBenchmark({ caseIds: ["approved-wine-013"] });
      const direct = await runCase(evalCase!);
      const benchmarkBrand = benchmark.cases[0].fields.brand.baseline;
      const benchmarkAlcohol = benchmark.cases[0].fields.alcohol.baseline;

      expect(benchmarkBrand.selectedValue).toBe(direct.brand.value);
      expect(benchmarkBrand.failureClass).toBe(direct.brand.failureClass);
      expect(benchmarkAlcohol.selectedValue).toBe(direct.alcohol.value);
      expect(benchmarkAlcohol.failureClass).toBe(direct.alcohol.failureClass);
    },
    OCR_TIMEOUT,
  );
});
