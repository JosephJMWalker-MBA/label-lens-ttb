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
    expect(new Set(traces.map((trace) => trace.traceId)).size).toBe(traces.length);
    expect(new Set(traces.map((trace) => trace.targetAnnotationId))).toEqual(
      new Set(targets.map((target) => target.id)),
    );
    for (const target of targets) {
      expect(traces.filter((trace) => trace.targetAnnotationId === target.id)).toHaveLength(1);
    }
  });

  it("never counts annotation anchors as system proposals or class success", () => {
    const report = loadCommittedReport();
    for (const caseReport of report.cases) {
      const nodes = new Map(
        (caseReport.semanticScene?.nodes ?? []).map((node) => [node.id, node] as const),
      );
      for (const trace of caseReport.semanticScene?.traces ?? []) {
        const matched = trace.proposalNodeIds.map((nodeId) => nodes.get(nodeId));
        expect(matched.every((node) => node?.evaluationRole === "system_proposal")).toBe(true);
        expect(matched.some((node) => node?.proposalSource === "annotated_target")).toBe(false);
        if (trace.correctClassTop1) {
          expect(
            matched.some((node) => node?.classHypotheses[0]?.semanticClass === trace.expectedClass),
          ).toBe(true);
        }
        if (trace.correctClassTop3) {
          expect(
            matched.some((node) =>
              node?.classHypotheses
                .slice(0, 3)
                .some((hypothesis) => hypothesis.semanticClass === trace.expectedClass),
            ),
          ).toBe(true);
        }
      }
    }
  });

  it("keeps every semantic failure and uncertainty bucket attributable to exact identities", () => {
    const metrics = loadCommittedReport().semanticRegionSurvival.metrics;
    for (const bucket of Object.values(metrics.terminalCategories)) {
      expect(bucket.targetIds).toHaveLength(bucket.count);
      if (bucket.count > 0) expect(bucket.caseIds.length).toBeGreaterThan(0);
    }
    expect(metrics.unknownBearingProposals.nodeIds).toHaveLength(
      metrics.unknownBearingProposals.count,
    );
    expect(metrics.conflictingClassificationProposals.nodeIds).toHaveLength(
      metrics.conflictingClassificationProposals.count,
    );
    expect(metrics.unattributed.targetIds).toHaveLength(metrics.unattributed.count);
  });

  it("assigns one mutually exclusive terminal from the furthest observable stage", () => {
    const report = loadCommittedReport();
    const traces = report.cases.flatMap((caseReport) => caseReport.semanticScene?.traces ?? []);
    const metrics = report.semanticRegionSurvival.metrics;
    expect(
      Object.values(metrics.terminalCategories).reduce((sum, bucket) => sum + bucket.count, 0),
    ).toBe(traces.length);
    for (const trace of traces) {
      expect(
        Object.values(metrics.terminalCategories).filter((bucket) =>
          bucket.targetIds.includes(trace.targetAnnotationId),
        ),
      ).toHaveLength(1);
      if (trace.terminalCategory === "target_class_preserved_wrong_operation") {
        expect(trace.contentRecovered).toBe(false);
        expect(trace.operationFailureCausallySupported).toBe(true);
      }
    }
    for (const targetId of [
      "luigi-giovanni-live:target:alcohol",
      "patricia-green-cellars:target:brand",
      "alfredos-wine:target:alcohol",
      "approved-wine-006:target:brand",
      "wine-multi-artifact-04:target:alcohol",
    ]) {
      expect(traces.find((trace) => trace.targetAnnotationId === targetId)).toMatchObject({
        contentRecovered: true,
        sceneObjectAssembled: true,
        fieldCandidateProjected: true,
        candidateStatus: "filtered",
        terminalCategory: "candidate_filtered",
      });
    }
  });

  it("reconciles raw flags and the cumulative funnel without an operation gate", () => {
    const report = loadCommittedReport();
    const traces = report.cases.flatMap((caseReport) => caseReport.semanticScene?.traces ?? []);
    const metrics = report.semanticRegionSurvival.metrics;
    const cumulative = {
      annotated_target: traces,
      region_proposed: traces.filter((trace) => trace.targetProposed),
      correct_class_retained: traces.filter(
        (trace) => trace.targetProposed && !trace.targetIncorrectlySuppressed,
      ),
      content_recovered: traces.filter(
        (trace) =>
          trace.targetProposed && !trace.targetIncorrectlySuppressed && trace.contentRecovered,
      ),
      object_assembled: traces.filter(
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.contentRecovered &&
          trace.sceneObjectAssembled,
      ),
      field_candidate_projected: traces.filter(
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.contentRecovered &&
          trace.sceneObjectAssembled &&
          trace.fieldCandidateProjected,
      ),
      candidate_survived: traces.filter(
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.contentRecovered &&
          trace.sceneObjectAssembled &&
          trace.fieldCandidateProjected &&
          !["filtered", "not_projected"].includes(trace.candidateStatus),
      ),
      trustworthy_evidence: traces.filter(
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.contentRecovered &&
          trace.sceneObjectAssembled &&
          trace.fieldCandidateProjected &&
          !["filtered", "not_projected"].includes(trace.candidateStatus) &&
          trace.trustworthyDownstreamEvidence,
      ),
    };
    for (const stage of metrics.funnel) {
      expect(stage.targetIds).toEqual(
        cumulative[stage.stage].map((trace) => trace.targetAnnotationId).sort(),
      );
    }
    expect(metrics.rawSurvival.contentRecovered.count).toBe(
      traces.filter((trace) => trace.contentRecovered).length,
    );
    expect(metrics.rawSurvival.objectAssembled.count).toBe(
      traces.filter((trace) => trace.sceneObjectAssembled).length,
    );
    expect(metrics.rawSurvival.candidateProjected.count).toBe(
      traces.filter((trace) => trace.fieldCandidateProjected).length,
    );
    expect(metrics.funnel.map((stage) => stage.stage)).not.toContain("appropriate_operation");
  });

  it("computes permissive and strict proposal matching independently", () => {
    const report = loadCommittedReport();
    const traces = report.cases.flatMap((caseReport) => caseReport.semanticScene?.traces ?? []);
    const { permissive, strictRepresentative } =
      report.semanticRegionSurvival.metrics.proposalMatching;
    expect(permissive.optimisticUpperBound).toBe(true);
    expect(strictRepresentative.optimisticUpperBound).toBe(false);
    expect(permissive.matchedProposalCounts.byTarget).toEqual(
      traces
        .map((trace) => ({ targetId: trace.targetAnnotationId, count: trace.matchedProposalCount }))
        .sort((left, right) => left.targetId.localeCompare(right.targetId)),
    );
    expect(strictRepresentative.matchedProposalCounts.byTarget).toEqual(
      traces
        .map((trace) => ({
          targetId: trace.targetAnnotationId,
          count: Number(trace.strictTargetProposed),
        }))
        .sort((left, right) => left.targetId.localeCompare(right.targetId)),
    );
    expect(
      strictRepresentative.matchedProposalCounts.byTarget.every(({ count }) => count <= 1),
    ).toBe(true);
    expect(permissive.matchedProposalCounts.maximumTargetIds).toContain(
      "patricia-green-cellars:target:brand",
    );
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
