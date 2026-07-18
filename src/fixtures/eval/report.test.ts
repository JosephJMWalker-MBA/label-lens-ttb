// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { EvalReport } from "./eval-report.types";
import { assertCalibrationCoverage, assertCandidateFilteringSubtypeCoverage } from "./report";

function loadCommittedReport(): EvalReport {
  return JSON.parse(
    readFileSync(join(process.cwd(), "docs/extraction-full-corpus/extractor-report.json"), "utf8"),
  ) as EvalReport;
}

describe("committed full-corpus report candidate-filtering coverage", () => {
  it("uses the Phase 5B schema version", () => {
    const report = loadCommittedReport();
    expect(report.schemaVersion).toBe("extraction-baseline-report.v5");
  });

  it("covers every candidate-filtering failure exactly once per field", () => {
    const report = loadCommittedReport();

    const summary = assertCandidateFilteringSubtypeCoverage(
      report.cases,
      report.breakdowns.candidateFilteringSubtypes,
    );

    expect(summary.byField.brand.caseSubtypeCount).toBe(
      summary.byField.brand.candidateFilteringFailureCount,
    );
    expect(summary.byField.brand.aggregateSubtypeCount).toBe(
      summary.byField.brand.candidateFilteringFailureCount,
    );
    expect(summary.byField.brand.nonCandidateFilteringSubtypeCount).toBe(0);

    expect(summary.byField.alcohol.caseSubtypeCount).toBe(
      summary.byField.alcohol.candidateFilteringFailureCount,
    );
    expect(summary.byField.alcohol.aggregateSubtypeCount).toBe(
      summary.byField.alcohol.candidateFilteringFailureCount,
    );
    expect(summary.byField.alcohol.nonCandidateFilteringSubtypeCount).toBe(0);
  });

  it("reconciles calibration coverage with case-level candidate records", () => {
    const report = loadCommittedReport();
    const coverage = assertCalibrationCoverage(report.cases, report.breakdowns.calibrationCoverage);

    expect(coverage.totalRecordCount).toBeGreaterThan(0);
    expect(coverage.byField.brand.recordCount + coverage.byField.alcohol.recordCount).toBe(
      coverage.totalRecordCount,
    );
  });

  it("records every evaluated candidate exactly once with explicit inference/evaluation separation", () => {
    const report = loadCommittedReport();

    for (const caseReport of report.cases) {
      const brandRecords = caseReport.diagnostics.calibrationCandidates.filter(
        (record) => record.field === "brand",
      );
      const alcoholRecords = caseReport.diagnostics.calibrationCandidates.filter(
        (record) => record.field === "alcohol",
      );

      expect(brandRecords).toHaveLength(caseReport.diagnostics.brandCandidateDecisions.length);
      expect(alcoholRecords).toHaveLength(caseReport.diagnostics.alcoholCandidateDecisions.length);

      for (const record of caseReport.diagnostics.calibrationCandidates) {
        expect(record.caseId).toBe(caseReport.caseId);
        expect(record.candidateId.length).toBeGreaterThan(0);
        expect(record.selected).toBe(record.candidateStatus === "selected");
        expect("truthPresent" in record.inference).toBe(false);
        expect("acceptable" in record.inference).toBe(false);

        const rawPresent = record.inference.ocrConfidence.rawMean !== null;
        if (rawPresent) {
          expect(
            record.inference.ocrConfidence.rawTokenConfidences.some((value) => value !== null),
          ).toBe(true);
        } else {
          expect(record.inference.ocrConfidence.missingTokenCount).toBe(
            record.inference.ocrConfidence.rawTokenConfidences.length,
          );
        }

        if (record.candidateStatus === "rejected") {
          expect(record.selected).toBe(false);
        } else {
          expect(record.inference.ranking).toBeDefined();
        }
      }
    }
  });

  it("records one complete survival trace for every semantic target", () => {
    const report = loadCommittedReport();
    const semanticCases = report.cases.filter((caseReport) => caseReport.semanticScene);
    const targets = semanticCases.flatMap((caseReport) =>
      caseReport.semanticScene!.annotation.objects.filter((object) => object.role === "target"),
    );
    const traces = semanticCases.flatMap((caseReport) => caseReport.semanticScene!.traces);
    expect(semanticCases).toHaveLength(13);
    expect(targets).toHaveLength(23);
    expect(traces).toHaveLength(targets.length);
    expect(new Set(traces.map((trace) => trace.targetAnnotationId))).toEqual(
      new Set(targets.map((target) => target.id)),
    );
  });

  it("keeps every semantic failure and uncertainty bucket attributable to exact identities", () => {
    const metrics = loadCommittedReport().semanticRegionSurvival.metrics;
    for (const bucket of Object.values(metrics.terminalCategories)) {
      expect(bucket.targetIds).toHaveLength(bucket.count);
      if (bucket.count > 0) expect(bucket.caseIds.length).toBeGreaterThan(0);
    }
    expect(metrics.unknownRegions.targetIds).toHaveLength(metrics.unknownRegions.count);
    expect(metrics.conflictingClassifications.targetIds).toHaveLength(
      metrics.conflictingClassifications.count,
    );
    expect(metrics.unattributed.targetIds).toHaveLength(metrics.unattributed.count);
  });

  it("preserves observed projection text and original-image geometry", () => {
    const report = loadCommittedReport();
    for (const caseReport of report.cases) {
      for (const node of caseReport.semanticScene?.nodes ?? []) {
        const geometry = node.geometry;
        expect(geometry.imageIndex, node.id).toBe(0);
        expect(geometry.x, node.id).toBeGreaterThanOrEqual(0);
        expect(geometry.y, node.id).toBeGreaterThanOrEqual(0);
        expect(geometry.x + geometry.width, node.id).toBeLessThanOrEqual(geometry.imageWidth);
        expect(geometry.y + geometry.height, node.id).toBeLessThanOrEqual(geometry.imageHeight);
        const observedTexts = node.contentObservations.map((observation) =>
          observation.rawText.toLowerCase().replace(/[^a-z0-9]/g, ""),
        );
        for (const projection of node.projectionCandidates) {
          const projected = projection.observedText.toLowerCase().replace(/[^a-z0-9]/g, "");
          expect(
            observedTexts.some(
              (observed) => observed.includes(projected) || projected.includes(observed),
            ),
            `${node.id}: ${projection.observedText}`,
          ).toBe(true);
        }
      }
    }
  });

  it("proves exact analyzer parity and preserves pre-diagnostic aggregate outcomes", () => {
    const report = loadCommittedReport();
    expect(report.semanticRegionSurvival.productionParity).toMatchObject({
      status: "PASS",
      expectedCaseCount: 115,
      actualCaseCount: 115,
      matchedCaseCount: 115,
      mismatches: [],
      comparisonBasis: "exact-serialized-analyzer-response-bytes",
    });
    expect(report.aggregate).toMatchObject({
      caseCount: 115,
      determinateBrandCount: 101,
      brandExactMatchRate: 0.26732673267326734,
      brandTop3Recall: 0.32673267326732675,
      presentAlcoholCount: 102,
      alcoholDetectionRecall: 0.6078431372549019,
      alcoholParsedValueAccuracy: 0.5686274509803921,
      alcoholFalseCertaintyRate: 0.008695652173913044,
    });
  });
});
