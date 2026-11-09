import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import type { EvidenceReconciliationReport } from "../../../scripts/vision/reconcile-evidence";
import type { AdditiveCounterfactualReport } from "../../../scripts/vision/simulate-additive-counterfactual";
import type { CandidateFormationTreatmentReport } from "../../../scripts/vision/evaluate-candidate-formation-treatment";
import type { SamePassTreatmentReport } from "../../../scripts/vision/evaluate-same-pass-treatment";

describe("Candidate Loss Reconciliation and Treatment Invariants (Phase 2F)", () => {
  it("enforces evidence scope reconciliation invariants across Scope A and Scope B", async () => {
    const raw = await readFile(
      "artifacts/held-out-validation/evidence-reconciliation.json",
      "utf8",
    );
    const report: EvidenceReconciliationReport = JSON.parse(raw);

    // Summary counts
    expect(report.summary.totalCases).toBe(24);
    expect(report.summary.brandPresentCases).toBe(18);
    expect(report.summary.brandAbsentCases).toBe(6);

    // Scope A vs Scope B raw presence
    expect(report.summary.rawBrandPresence.scopeA_archivedPreview_ocr).toBe("15/18 (83.3%)");
    expect(report.summary.rawBrandPresence.scopeB_replayedFull_ocr).toBe("16/18 (88.9%)");

    // Exact loss taxonomy sum invariant: 2 + 8 + 2 + 6 + 0 = 18
    const tax = report.summary.lossTaxonomy_fullOcr;
    expect(tax.rawOcrMiss).toBe(2);
    expect(tax.candidateFormationLoss).toBe(8);
    expect(tax.rankingDisplacement).toBe(2);
    expect(tax.conservativeAuthorityGate).toBe(6);
    expect(tax.correctAndReliable).toBe(0);
    expect(
      tax.rawOcrMiss +
        tax.candidateFormationLoss +
        tax.rankingDisplacement +
        tax.conservativeAuthorityGate +
        tax.correctAndReliable,
    ).toBe(18);

    // Negative control clean abstentions
    expect(report.summary.negativeControlAbstention.tesseractCleanAbstentions).toContain("6/6");
    expect(report.summary.negativeControlAbstention.tesseractFalseInsertions).toBe("0/6");

    // Case 012 pivot verification
    const case012 = report.cases.find((c) => c.caseId === "approved-wine-012");
    expect(case012).toBeDefined();
    expect(case012?.archivedPreview.rawBrandPresent).toBe(false);
    expect(case012?.replayedFullOcr.rawBrandPresent).toBe(true);
    expect(case012?.replayedFullOcr.finePrintOccurrence).toBe(true);
    expect(case012?.replayedFullOcr.lossStage).toBe("CANDIDATE_FORMATION_LOSS");

    // Case 011 genuinely vision-only raw presence verification
    const case011 = report.cases.find((c) => c.caseId === "approved-wine-011");
    expect(case011).toBeDefined();
    expect(case011?.replayedFullOcr.rawBrandPresent).toBe(false);
    expect(case011?.visionObserved.rawBrandPresentMultilineCheck).toBe(true);
    expect(case011?.concordance.scopeB_fullOcrLevel).toBe("VISION_ONLY_RAW_PRESENT");
  });

  it("enforces oracle-assisted upper bound labeling and sensitivity constraints in additive counterfactual", async () => {
    const raw = await readFile(
      "artifacts/held-out-validation/additive-counterfactual-report.json",
      "utf8",
    );
    const report: AdditiveCounterfactualReport = JSON.parse(raw);

    // Explicit upper bound relabeling
    expect(report.feasibilityStatus).toBe("ORACLE_ASSISTED_UPPER_BOUND_FEASIBILITY");
    expect(report.methodologyNotice).toContain("ORACLE-ASSISTED SYNTHETIC UPPER BOUND");
    expect(report.architecturalLimitations.lackOfAuthenticCoordinates).toContain(
      "lacking authentic pixel coordinates",
    );
    expect(report.architecturalLimitations.spatialBoundingRequirement).toContain(
      "spatial targeting",
    );

    // Feasibility summary
    expect(report.summary.brandPresentTotalCases).toBe(18);
    expect(report.summary.baselineSelectedMatches).toBe(6);
    expect(report.summary.additiveSelectedMatches_oracleAssisted).toBe(7);
    expect(report.summary.netRecoveryUplift_oracleAssisted).toBe(
      "6/18 (33.3%) -> 7/18 (38.9%) (+5.6 pp)",
    );

    // Negative controls remain protected in oracle evaluation
    expect(report.summary.negativeControlCleanAbstentions_oracleAssisted).toBe(6);
    expect(report.summary.negativeControlFalseInsertions_oracleAssisted).toBe(0);

    // Sensitivity analysis validation for approved-wine-012
    const sens012 = report.sensitivityAnalysis.find((s) => s.caseId === "approved-wine-012");
    expect(sens012).toBeDefined();

    // At confidence 0, candidate score drops and selection fails
    const conf0 = sens012?.confidenceSensitivity.find((p) => p.confidence === 0);
    expect(conf0?.selectedMatchesTruth).toBe(false);
    expect(conf0?.candidateRank).toBe(4);

    // At confidence >= 50, candidate is selected
    const conf95 = sens012?.confidenceSensitivity.find((p) => p.confidence === 95);
    expect(conf95?.selectedMatchesTruth).toBe(true);
    expect(conf95?.candidateRank).toBe(3);

    // Geometry subordination drops score and displaces candidate behind competitor
    const subordinateGeom = sens012?.geometrySensitivity.find(
      (g) => g.geometryType === "subordinate",
    );
    expect(subordinateGeom?.selectedMatchesTruth).toBe(false);
    expect(subordinateGeom?.selectedCandidate).toBe("Texas Tempranillo 750ml");
  });

  it("enforces candidate formation failure breakdown and narrow treatment safety", async () => {
    const raw = await readFile(
      "artifacts/held-out-validation/candidate-formation-treatment-report.json",
      "utf8",
    );
    const report: CandidateFormationTreatmentReport = JSON.parse(raw);

    // Diagnosis breakdown sum: 5 + 1 + 1 + 1 = 8
    const bd = report.formationLossDiagnosis.failureCategoryBreakdown;
    expect(bd.overlongLineTooManyWords).toBe(5);
    expect(bd.stackedSingleWordHeading).toBe(1);
    expect(bd.legalSuffixRetained).toBe(1);
    expect(bd.heroOcrNoiseWithProducerFinePrint).toBe(1);
    expect(
      bd.overlongLineTooManyWords +
        bd.stackedSingleWordHeading +
        bd.legalSuffixRetained +
        bd.heroOcrNoiseWithProducerFinePrint,
    ).toBe(8);

    // Treatment safety and uplift
    const tSum = report.treatmentEvaluation.summary;
    expect(tSum.baselineSelectedMatches).toBe(6);
    expect(tSum.treatmentSelectedMatches).toBe(7);
    expect(tSum.regressionsCount).toBe(0);
    expect(tSum.negativeControlCleanAbstentions).toBe(6);
    expect(tSum.negativeControlFalseInsertions).toBe(0);
    expect(tSum.safetyVerdict).toContain("SAFE_EVALUATION_PASS");

    // chateau-bonneau recovered
    const chateauCase = report.treatmentEvaluation.cases.find(
      (c) => c.caseId === "chateau-bonneau",
    );
    expect(chateauCase?.delta).toBe("RECOVERED");
    expect(chateauCase?.baseline.matchesTruth).toBe(false);
    expect(chateauCase?.treatment.matchesTruth).toBe(true);
    expect(chateauCase?.treatment.selectedCandidate).toBe("CHATEAU BONNEAU");

    // Predeclared validation protocol requirements
    expect(report.predeclaredValidationProtocol.status).toBe("PREDECLARED_NOT_PROMOTED");
    expect(
      report.predeclaredValidationProtocol.prerequisitesForProduction.length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("enforces Phase 2G authentic same-pass treatment report invariants and 3-condition comparison", async () => {
    const raw = await readFile(
      "artifacts/held-out-validation/same-pass-treatment-report.json",
      "utf8",
    );
    const report: SamePassTreatmentReport = JSON.parse(raw);

    // Version and scoped safety verdict
    expect(report.version).toBe("phase-2g-authentic-same-pass-v1");
    expect(report.scopeNotice.safetyVerdict).toBe("NO_REGRESSIONS_IN_THIS_24_CASE_DEVELOPMENT_SET");

    // Condition A (Frozen baseline)
    const condA = report.conditionSummaries.conditionA_baseline;
    expect(condA.candidateConstructedCount).toBe(8);
    expect(condA.topThreeRankedCount).toBe(7);
    expect(condA.selectedCorrectCount).toBe(6);
    expect(condA.reliableAcceptedCount).toBe(0);
    expect(condA.negativeControlSelectedInsertions).toBe(0);

    // Condition B (Synthetic focus-crop upper bound)
    const condB = report.conditionSummaries.conditionB_syntheticPass;
    expect(condB.candidateConstructedCount).toBe(9);
    expect(condB.topThreeRankedCount).toBe(8);
    expect(condB.selectedCorrectCount).toBe(7);
    expect(condB.reliableAcceptedCount).toBe(0);
    expect(condB.negativeControlSelectedInsertions).toBe(0);

    // Condition C (Authentic same-pass treatment)
    const condC = report.conditionSummaries.conditionC_samePass;
    expect(condC.candidateConstructedCount).toBe(9);
    expect(condC.topThreeRankedCount).toBe(8);
    expect(condC.selectedCorrectCount).toBe(7);
    expect(condC.reliableAcceptedCount).toBe(0);
    expect(condC.negativeControlSelectedInsertions).toBe(0);
    expect(condC.regressionsCount).toBe(0);

    // Invariants audit
    expect(report.invariantsAudit.singlePassIntegrity).toBe(true);
    expect(report.invariantsAudit.authenticConfidencePreserved).toBe(true);
    expect(report.invariantsAudit.consensusFabricationPrevented).toBe(true);
    expect(report.invariantsAudit.authorityGatePreserved).toBe(true);
    expect(report.invariantsAudit.zeroFalseInsertionsOnNegativeControls).toBe(true);
    expect(report.invariantsAudit.zeroRegressionsOnPriorCorrectCases).toBe(true);

    // Specific case checks: chateau-bonneau in Condition C
    const chateauCase = report.cases.find((c) => c.caseId === "chateau-bonneau");
    expect(chateauCase).toBeDefined();
    expect(chateauCase?.conditionA_baseline.selectedMatches).toBe(false);
    expect(chateauCase?.conditionC_samePass.selectedMatches).toBe(true);
    expect(chateauCase?.conditionC_samePass.selected).toBe("CHATEAU BONNEAU");
    expect(chateauCase?.conditionC_samePass.state).toBe("AMBIGUOUS");
    expect(chateauCase?.conditionC_samePass.supportingPassIds).toEqual(["pass-0-full-image"]);
    expect(chateauCase?.conditionC_samePass.recoveryPassUsed).toBe(false);
    expect(chateauCase?.isRegressionInC).toBe(false);

    // Sample accounting correction assertions
    expect(report.sampleAccountingCorrection.phase2BCountClarification).toContain(
      "10 approved fixtures / 11 occurrences",
    );
    expect(report.sampleAccountingCorrection.combinedCorpusClarification).toContain(
      "does NOT constitute a 48 unique label corpus",
    );
  });
});
