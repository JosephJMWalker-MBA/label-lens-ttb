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
    expect(report.schemaVersion).toBe("extraction-baseline-report.v4");
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
});
