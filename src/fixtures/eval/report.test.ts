// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { EvalReport } from "./eval-report.types";
import { assertCandidateFilteringSubtypeCoverage } from "./report";

function loadCommittedReport(): EvalReport {
  return JSON.parse(
    readFileSync(join(process.cwd(), "docs/extraction-full-corpus/extractor-report.json"), "utf8"),
  ) as EvalReport;
}

describe("committed full-corpus report candidate-filtering coverage", () => {
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
});
