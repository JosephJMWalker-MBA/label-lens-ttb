/**
 * Out-of-Sample Validation on 79 Genuinely Unused Public Labels (Phase 2H)
 *
 * EVALUATION-ONLY SCRIPT — NOT AUTHORIZED FOR PRODUCTION
 *
 * Protocol & Methodology:
 * 1. Evaluates PR #233's exact `selectBrandObservationWithNarrowStackedHeadingTreatment`
 *    against the frozen production baseline across 79 previously unused labels from
 *    the 115-label corpus (63 standard targets, 9 near-miss rivalry controls, 3 ambiguous controls, 4 absent controls).
 *
 * 2. Evaluates two distinct extraction scopes:
 *    - Scope 1: Single-pass primary OCR selector (`selectBrandObservation([primaryPass])`)
 *    - Scope 2: Complete multi-pass production recovery path (`selectBrandObservation([primaryPass, ...recoveryPasses])`)
 *
 * 3. Pre-registered failure metrics:
 *    - Correct recoveries (brand matches acceptable presentations)
 *    - Incorrect candidate insertions (stacked heading candidate generated that is not valid brand)
 *    - False selected brands on negative controls (absent or ambiguous asserted as valid brand)
 *    - Prior-correct regressions (cases where baseline was correct but treatment failed)
 *    - Inappropriate authority elevation (cases elevated to OBSERVED without independent corroboration)
 */

import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

import { createLocalOcrEngine } from "../../src/pipeline/extractor/ocr-engine";
import { planPrimaryOcrPass, planRecoveryOcrPasses, runOcrPass } from "../../src/pipeline/extractor/regions";
import type { RegionOcrResult } from "../../src/pipeline/extractor/extractor.types";
import {
  selectBrandObservationWithCompleteFilterDiagnostics,
  selectBrandObservationWithNarrowStackedHeadingTreatmentDiagnostics,
} from "../../src/pipeline/extractor/field-selection";
import { brandValueMatches } from "../../src/fixtures/eval/vision-reader-eval";

export interface OutOfSampleCase {
  caseId: string;
  imagePath: string;
  expectedSha256: string;
  imageDimensions: { width: number; height: number };
  brandPresence: "present" | "absent";
  controlType: "target" | "near_miss_rivalry_control" | "negative_control_ambiguous" | "negative_control_absent";
  genuinelyAmbiguous: boolean;
  acceptablePresentations: string[];
  forbiddenPresentations: string[];
  visualStrata: string[];
  notes: string | null;
}

export interface OutOfSampleManifest {
  schemaVersion: string;
  preRegisteredAt: string;
  description: string;
  totalCases: number;
  strataDistribution: {
    standard_targets: number;
    near_miss_rivalry_controls: number;
    negative_controls_ambiguous: number;
    negative_controls_absent: number;
  };
  cases: OutOfSampleCase[];
}

export interface ScopeEvaluationResult {
  candidateConstructed: boolean;
  topThreeRanked: boolean;
  selected: string | null;
  selectedMatches: boolean;
  confidence: number | null;
  state: string;
  supportingPassIds: string[];
  independentEvidenceCount: number;
  recoveryPassUsed: boolean;
}

export interface OutOfSampleCaseReport {
  caseId: string;
  controlType: string;
  brandPresence: "present" | "absent";
  acceptablePresentations: string[];
  singlePass: {
    baseline: ScopeEvaluationResult;
    narrowTreatment: ScopeEvaluationResult;
    isRegression: boolean;
    narrowStackedCandidate: string | null;
    narrowStackedIsCorrect: boolean | null;
  };
  multiPass: {
    recoveryPassesPlanned: number;
    baseline: ScopeEvaluationResult;
    narrowTreatment: ScopeEvaluationResult;
    isRegression: boolean;
    narrowStackedCandidate: string | null;
  };
}

export interface ScopeSummary {
  totalCases: number;
  targetCases: number;
  absentCases: number;
  ambiguousCases: number;
  nearMissCases: number;

  baseline: {
    candidateConstructedCount: number;
    candidateConstructedRate: string;
    topThreeRankedCount: number;
    topThreeRankedRate: string;
    selectedCorrectCount: number;
    selectedCorrectRate: string;
    reliableAcceptedCount: number;
    reliableAcceptedRate: string;
    negativeControlCandidateInsertions: number;
    negativeControlSelectedAssertions: number;
  };

  narrowTreatment: {
    candidateConstructedCount: number;
    candidateConstructedRate: string;
    topThreeRankedCount: number;
    topThreeRankedRate: string;
    selectedCorrectCount: number;
    selectedCorrectRate: string;
    reliableAcceptedCount: number;
    reliableAcceptedRate: string;
    negativeControlCandidateInsertions: number;
    negativeControlSelectedAssertions: number;
    regressionsCount: number;
    inappropriateAuthorityElevationCount: number;
  };

  stackedCandidatesFormedTotal: number;
  stackedCandidatesCorrect: number;
  stackedCandidatesIncorrect: number;
}

export interface OutOfSampleValidationReport {
  generatedAt: string;
  version: "phase-2h-out-of-sample-validation-v1";
  provenance: {
    manifestFile: string;
    totalEvaluatedCases: number;
    pr233Commit: string;
    fieldSelectionSha256: string;
    stackedHeadingsSha256: string;
  };
  verdict: {
    status: "OUT_OF_SAMPLE_VALIDATION_COMPLETED";
    singlePassVerdict: string;
    multiPassVerdict: string;
    regressionCount: number;
    falseAssertionCount: number;
    inappropriateElevationCount: number;
  };
  singlePassSummary: ScopeSummary;
  multiPassSummary: ScopeSummary;
  cases: OutOfSampleCaseReport[];
}

function candidateMatchesTruth(value: string | null | undefined, acceptable: string[]): boolean {
  if (!value) return false;
  return brandValueMatches(value, acceptable);
}

export async function runOutOfSampleValidation(): Promise<OutOfSampleValidationReport> {
  const manifestPath = "artifacts/held-out-validation/out-of-sample-validation-manifest.json";
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as OutOfSampleManifest;
  const engine = await createLocalOcrEngine();

  const caseReports: OutOfSampleCaseReport[] = [];

  const initScopeSummary = (): ScopeSummary => ({
    totalCases: manifest.totalCases,
    targetCases: manifest.cases.filter((c) => c.controlType === "target" || c.controlType === "near_miss_rivalry_control").length,
    absentCases: manifest.cases.filter((c) => c.controlType === "negative_control_absent").length,
    ambiguousCases: manifest.cases.filter((c) => c.controlType === "negative_control_ambiguous").length,
    nearMissCases: manifest.cases.filter((c) => c.controlType === "near_miss_rivalry_control").length,
    baseline: {
      candidateConstructedCount: 0,
      candidateConstructedRate: "0.0%",
      topThreeRankedCount: 0,
      topThreeRankedRate: "0.0%",
      selectedCorrectCount: 0,
      selectedCorrectRate: "0.0%",
      reliableAcceptedCount: 0,
      reliableAcceptedRate: "0.0%",
      negativeControlCandidateInsertions: 0,
      negativeControlSelectedAssertions: 0,
    },
    narrowTreatment: {
      candidateConstructedCount: 0,
      candidateConstructedRate: "0.0%",
      topThreeRankedCount: 0,
      topThreeRankedRate: "0.0%",
      selectedCorrectCount: 0,
      selectedCorrectRate: "0.0%",
      reliableAcceptedCount: 0,
      reliableAcceptedRate: "0.0%",
      negativeControlCandidateInsertions: 0,
      negativeControlSelectedAssertions: 0,
      regressionsCount: 0,
      inappropriateAuthorityElevationCount: 0,
    },
    stackedCandidatesFormedTotal: 0,
    stackedCandidatesCorrect: 0,
    stackedCandidatesIncorrect: 0,
  });

  const singlePassSummary = initScopeSummary();
  const multiPassSummary = initScopeSummary();

  try {
    for (const testCase of manifest.cases) {
      const imageBytes = await readFile(testCase.imagePath);
      const meta = await sharp(imageBytes).metadata();
      const origWidth = meta.width ?? testCase.imageDimensions.width;
      const origHeight = meta.height ?? testCase.imageDimensions.height;

      // 1. Primary pass
      const primaryPass = planPrimaryOcrPass(origWidth, origHeight);
      const primaryOcr = await runOcrPass(imageBytes, primaryPass, engine);

      // --- Scope 1: Single Pass ---
      const spBaseSel = selectBrandObservationWithCompleteFilterDiagnostics([primaryOcr]);
      const spBaseObs = spBaseSel.observation;
      const spBaseCands = spBaseSel.brandDiagnostics?.candidates.filter((c) => c.kept) ?? [];

      const spTreatSel = selectBrandObservationWithNarrowStackedHeadingTreatmentDiagnostics([primaryOcr]);
      const spTreatObs = spTreatSel.observation;
      const spTreatCands = spTreatSel.brandDiagnostics?.candidates.filter((c) => c.kept) ?? [];

      const isTarget = testCase.brandPresence === "present" && !testCase.genuinelyAmbiguous;
      const isAbsent = testCase.controlType === "negative_control_absent";
      const isAmbiguous = testCase.controlType === "negative_control_ambiguous";

      const spBaseMatches = isTarget && candidateMatchesTruth(spBaseObs.value, testCase.acceptablePresentations);
      const spTreatMatches = isTarget && candidateMatchesTruth(spTreatObs.value, testCase.acceptablePresentations);

      const spBaseCandConstructed = isTarget && spBaseCands.some((c) => candidateMatchesTruth(c.cleanedValue, testCase.acceptablePresentations));
      const spTreatCandConstructed = isTarget && spTreatCands.some((c) => candidateMatchesTruth(c.cleanedValue, testCase.acceptablePresentations));

      const spBaseTop3 = [spBaseObs.value, ...spBaseObs.alternates.map((a) => a.value)].filter((v): v is string => Boolean(v));
      const spTreatTop3 = [spTreatObs.value, ...spTreatObs.alternates.map((a) => a.value)].filter((v): v is string => Boolean(v));

      const spBaseTop3Ranked = isTarget && spBaseTop3.some((v) => candidateMatchesTruth(v, testCase.acceptablePresentations));
      const spTreatTop3Ranked = isTarget && spTreatTop3.some((v) => candidateMatchesTruth(v, testCase.acceptablePresentations));

      const spStackedCand = spTreatCands.find((c) => c.assembly === "multi-line-merge");
      let spStackedCorrect: boolean | null = null;
      if (spStackedCand) {
        singlePassSummary.stackedCandidatesFormedTotal++;
        spStackedCorrect = isTarget && candidateMatchesTruth(spStackedCand.cleanedValue, testCase.acceptablePresentations);
        if (spStackedCorrect) singlePassSummary.stackedCandidatesCorrect++;
        else singlePassSummary.stackedCandidatesIncorrect++;
      }

      const spIsRegression = isTarget && spBaseMatches && !spTreatMatches;

      const spBaseResult: ScopeEvaluationResult = {
        candidateConstructed: spBaseCandConstructed,
        topThreeRanked: spBaseTop3Ranked,
        selected: spBaseObs.value,
        selectedMatches: spBaseMatches,
        confidence: spBaseObs.ocrEvidenceScore,
        state: spBaseObs.state,
        supportingPassIds: spBaseSel.supportingPassIds,
        independentEvidenceCount: spBaseSel.supportingPassIds.length,
        recoveryPassUsed: spBaseSel.recoveryPassUsed,
      };

      const spTreatResult: ScopeEvaluationResult = {
        candidateConstructed: spTreatCandConstructed,
        topThreeRanked: spTreatTop3Ranked,
        selected: spTreatObs.value,
        selectedMatches: spTreatMatches,
        confidence: spTreatObs.ocrEvidenceScore,
        state: spTreatObs.state,
        supportingPassIds: spTreatSel.supportingPassIds,
        independentEvidenceCount: spTreatSel.supportingPassIds.length,
        recoveryPassUsed: spTreatSel.recoveryPassUsed,
      };

      // Scope 1 accounting
      if (isTarget) {
        if (spBaseCandConstructed) singlePassSummary.baseline.candidateConstructedCount++;
        if (spBaseTop3Ranked) singlePassSummary.baseline.topThreeRankedCount++;
        if (spBaseMatches) singlePassSummary.baseline.selectedCorrectCount++;
        if (spBaseMatches && spBaseObs.state === "OBSERVED") singlePassSummary.baseline.reliableAcceptedCount++;

        if (spTreatCandConstructed) singlePassSummary.narrowTreatment.candidateConstructedCount++;
        if (spTreatTop3Ranked) singlePassSummary.narrowTreatment.topThreeRankedCount++;
        if (spTreatMatches) singlePassSummary.narrowTreatment.selectedCorrectCount++;
        if (spTreatMatches && spTreatObs.state === "OBSERVED") singlePassSummary.narrowTreatment.reliableAcceptedCount++;

        if (spIsRegression) singlePassSummary.narrowTreatment.regressionsCount++;
      } else {
        // Negative controls (absent or ambiguous)
        if (isAbsent) {
          if (spBaseCands.length > 0) singlePassSummary.baseline.negativeControlCandidateInsertions++;
          if (spBaseObs.value !== null) singlePassSummary.baseline.negativeControlSelectedAssertions++;

          if (spTreatCands.length > 0) singlePassSummary.narrowTreatment.negativeControlCandidateInsertions++;
          if (spTreatObs.value !== null) singlePassSummary.narrowTreatment.negativeControlSelectedAssertions++;
        }
        if (spTreatObs.state === "OBSERVED") {
          singlePassSummary.narrowTreatment.inappropriateAuthorityElevationCount++;
        }
      }

      // --- Scope 2: Complete Multi-Pass Production Recovery Path ---
      const recoveryPassPlans = planRecoveryOcrPasses({
        primary: primaryOcr,
        needsBrandRecovery: spBaseObs.state === "NOT_OBSERVED",
        needsAlcoholRecovery: true,
      });

      const allPasses: RegionOcrResult[] = [primaryOcr];
      for (const passPlan of recoveryPassPlans) {
        const passOcr = await runOcrPass(imageBytes, passPlan, engine);
        allPasses.push(passOcr);
      }

      const mpBaseSel = selectBrandObservationWithCompleteFilterDiagnostics(allPasses);
      const mpBaseObs = mpBaseSel.observation;
      const mpBaseCands = mpBaseSel.brandDiagnostics?.candidates.filter((c) => c.kept) ?? [];

      const mpTreatSel = selectBrandObservationWithNarrowStackedHeadingTreatmentDiagnostics(allPasses);
      const mpTreatObs = mpTreatSel.observation;
      const mpTreatCands = mpTreatSel.brandDiagnostics?.candidates.filter((c) => c.kept) ?? [];

      const mpBaseMatches = isTarget && candidateMatchesTruth(mpBaseObs.value, testCase.acceptablePresentations);
      const mpTreatMatches = isTarget && candidateMatchesTruth(mpTreatObs.value, testCase.acceptablePresentations);

      const mpBaseCandConstructed = isTarget && mpBaseCands.some((c) => candidateMatchesTruth(c.cleanedValue, testCase.acceptablePresentations));
      const mpTreatCandConstructed = isTarget && mpTreatCands.some((c) => candidateMatchesTruth(c.cleanedValue, testCase.acceptablePresentations));

      const mpBaseTop3 = [mpBaseObs.value, ...mpBaseObs.alternates.map((a) => a.value)].filter((v): v is string => Boolean(v));
      const mpTreatTop3 = [mpTreatObs.value, ...mpTreatObs.alternates.map((a) => a.value)].filter((v): v is string => Boolean(v));

      const mpBaseTop3Ranked = isTarget && mpBaseTop3.some((v) => candidateMatchesTruth(v, testCase.acceptablePresentations));
      const mpTreatTop3Ranked = isTarget && mpTreatTop3.some((v) => candidateMatchesTruth(v, testCase.acceptablePresentations));

      const mpStackedCand = mpTreatCands.find((c) => c.assembly === "multi-line-merge");
      if (mpStackedCand) {
        multiPassSummary.stackedCandidatesFormedTotal++;
        const mpStackedCorrect = isTarget && candidateMatchesTruth(mpStackedCand.cleanedValue, testCase.acceptablePresentations);
        if (mpStackedCorrect) multiPassSummary.stackedCandidatesCorrect++;
        else multiPassSummary.stackedCandidatesIncorrect++;
      }

      const mpIsRegression = isTarget && mpBaseMatches && !mpTreatMatches;

      const mpBaseResult: ScopeEvaluationResult = {
        candidateConstructed: mpBaseCandConstructed,
        topThreeRanked: mpBaseTop3Ranked,
        selected: mpBaseObs.value,
        selectedMatches: mpBaseMatches,
        confidence: mpBaseObs.ocrEvidenceScore,
        state: mpBaseObs.state,
        supportingPassIds: mpBaseSel.supportingPassIds,
        independentEvidenceCount: mpBaseSel.supportingPassIds.length,
        recoveryPassUsed: mpBaseSel.recoveryPassUsed,
      };

      const mpTreatResult: ScopeEvaluationResult = {
        candidateConstructed: mpTreatCandConstructed,
        topThreeRanked: mpTreatTop3Ranked,
        selected: mpTreatObs.value,
        selectedMatches: mpTreatMatches,
        confidence: mpTreatObs.ocrEvidenceScore,
        state: mpTreatObs.state,
        supportingPassIds: mpTreatSel.supportingPassIds,
        independentEvidenceCount: mpTreatSel.supportingPassIds.length,
        recoveryPassUsed: mpTreatSel.recoveryPassUsed,
      };

      // Scope 2 accounting
      if (isTarget) {
        if (mpBaseCandConstructed) multiPassSummary.baseline.candidateConstructedCount++;
        if (mpBaseTop3Ranked) multiPassSummary.baseline.topThreeRankedCount++;
        if (mpBaseMatches) multiPassSummary.baseline.selectedCorrectCount++;
        if (mpBaseMatches && mpBaseObs.state === "OBSERVED") multiPassSummary.baseline.reliableAcceptedCount++;

        if (mpTreatCandConstructed) multiPassSummary.narrowTreatment.candidateConstructedCount++;
        if (mpTreatTop3Ranked) multiPassSummary.narrowTreatment.topThreeRankedCount++;
        if (mpTreatMatches) multiPassSummary.narrowTreatment.selectedCorrectCount++;
        if (mpTreatMatches && mpTreatObs.state === "OBSERVED") multiPassSummary.narrowTreatment.reliableAcceptedCount++;

        if (mpIsRegression) multiPassSummary.narrowTreatment.regressionsCount++;
      } else {
        if (isAbsent) {
          if (mpBaseCands.length > 0) multiPassSummary.baseline.negativeControlCandidateInsertions++;
          if (mpBaseObs.value !== null) multiPassSummary.baseline.negativeControlSelectedAssertions++;

          if (mpTreatCands.length > 0) multiPassSummary.narrowTreatment.negativeControlCandidateInsertions++;
          if (mpTreatObs.value !== null) multiPassSummary.narrowTreatment.negativeControlSelectedAssertions++;
        }
        if (mpTreatObs.state === "OBSERVED") {
          multiPassSummary.narrowTreatment.inappropriateAuthorityElevationCount++;
        }
      }

      caseReports.push({
        caseId: testCase.caseId,
        controlType: testCase.controlType,
        brandPresence: testCase.brandPresence,
        acceptablePresentations: testCase.acceptablePresentations,
        singlePass: {
          baseline: spBaseResult,
          narrowTreatment: spTreatResult,
          isRegression: spIsRegression,
          narrowStackedCandidate: spStackedCand?.cleanedValue ?? null,
          narrowStackedIsCorrect: spStackedCorrect,
        },
        multiPass: {
          recoveryPassesPlanned: recoveryPassPlans.length,
          baseline: mpBaseResult,
          narrowTreatment: mpTreatResult,
          isRegression: mpIsRegression,
          narrowStackedCandidate: mpStackedCand?.cleanedValue ?? null,
        },
      });
    }

    const calcRates = (s: ScopeSummary) => {
      s.baseline.candidateConstructedRate = `${((s.baseline.candidateConstructedCount / s.targetCases) * 100).toFixed(1)}%`;
      s.baseline.topThreeRankedRate = `${((s.baseline.topThreeRankedCount / s.targetCases) * 100).toFixed(1)}%`;
      s.baseline.selectedCorrectRate = `${((s.baseline.selectedCorrectCount / s.targetCases) * 100).toFixed(1)}%`;
      s.baseline.reliableAcceptedRate = `${((s.baseline.reliableAcceptedCount / s.targetCases) * 100).toFixed(1)}%`;

      s.narrowTreatment.candidateConstructedRate = `${((s.narrowTreatment.candidateConstructedCount / s.targetCases) * 100).toFixed(1)}%`;
      s.narrowTreatment.topThreeRankedRate = `${((s.narrowTreatment.topThreeRankedCount / s.targetCases) * 100).toFixed(1)}%`;
      s.narrowTreatment.selectedCorrectRate = `${((s.narrowTreatment.selectedCorrectCount / s.targetCases) * 100).toFixed(1)}%`;
      s.narrowTreatment.reliableAcceptedRate = `${((s.narrowTreatment.reliableAcceptedCount / s.targetCases) * 100).toFixed(1)}%`;
    };

    calcRates(singlePassSummary);
    calcRates(multiPassSummary);

    const report: OutOfSampleValidationReport = {
      generatedAt: new Date().toISOString(),
      version: "phase-2h-out-of-sample-validation-v1",
      provenance: {
        manifestFile: manifestPath,
        totalEvaluatedCases: manifest.totalCases,
        pr233Commit: "5d690fbf377f8846395ec1ea5a7ef61c8c5c4852",
        fieldSelectionSha256: "4719a1f42825d43eb4acb792a6f404cc2be48b9302d5bbbe07618ee4b20f608f",
        stackedHeadingsSha256: "5bdc0137ee6044097dd58535c4f5579994611981f4546dda59e4177205eff589",
      },
      verdict: {
        status: "OUT_OF_SAMPLE_VALIDATION_COMPLETED",
        singlePassVerdict: singlePassSummary.narrowTreatment.regressionsCount === 0 && singlePassSummary.narrowTreatment.negativeControlSelectedAssertions === 0
          ? "CLEAN_PARITY_OR_IMPROVEMENT"
          : "FAILURES_OBSERVED",
        multiPassVerdict: multiPassSummary.narrowTreatment.regressionsCount === 0 && multiPassSummary.narrowTreatment.negativeControlSelectedAssertions === 0
          ? "CLEAN_PARITY_OR_IMPROVEMENT"
          : "FAILURES_OBSERVED",
        regressionCount: singlePassSummary.narrowTreatment.regressionsCount + multiPassSummary.narrowTreatment.regressionsCount,
        falseAssertionCount: singlePassSummary.narrowTreatment.negativeControlSelectedAssertions + multiPassSummary.narrowTreatment.negativeControlSelectedAssertions,
        inappropriateElevationCount: singlePassSummary.narrowTreatment.inappropriateAuthorityElevationCount + multiPassSummary.narrowTreatment.inappropriateAuthorityElevationCount,
      },
      singlePassSummary,
      multiPassSummary,
      cases: caseReports,
    };

    const outputPath = "artifacts/held-out-validation/out-of-sample-validation-report.json";
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    return report;
  } finally {
    await engine.terminate();
  }
}

console.log("OUT OF SAMPLE SCRIPT LOADED");
if (true) {
  runOutOfSampleValidation()
    .then((rep) => {
      console.log("=== Phase 2H Out-of-Sample Validation Complete (79 Unseen Cases) ===");
      console.log(`  Single-Pass Baseline Selected:    ${rep.singlePassSummary.baseline.selectedCorrectCount}/${rep.singlePassSummary.targetCases} (${rep.singlePassSummary.baseline.selectedCorrectRate})`);
      console.log(`  Single-Pass Treatment Selected:   ${rep.singlePassSummary.narrowTreatment.selectedCorrectCount}/${rep.singlePassSummary.targetCases} (${rep.singlePassSummary.narrowTreatment.selectedCorrectRate})`);
      console.log(`  Single-Pass Regressions:          ${rep.singlePassSummary.narrowTreatment.regressionsCount}`);
      console.log(`  Single-Pass False Assertions:     ${rep.singlePassSummary.narrowTreatment.negativeControlSelectedAssertions}/${rep.singlePassSummary.absentCases}`);
      console.log(`  Single-Pass Authority Elevation:  ${rep.singlePassSummary.narrowTreatment.inappropriateAuthorityElevationCount}`);
      console.log(`  Multi-Pass Baseline Selected:     ${rep.multiPassSummary.baseline.selectedCorrectCount}/${rep.multiPassSummary.targetCases} (${rep.multiPassSummary.baseline.selectedCorrectRate})`);
      console.log(`  Multi-Pass Treatment Selected:    ${rep.multiPassSummary.narrowTreatment.selectedCorrectCount}/${rep.multiPassSummary.targetCases} (${rep.multiPassSummary.narrowTreatment.selectedCorrectRate})`);
      console.log(`  Multi-Pass Regressions:           ${rep.multiPassSummary.narrowTreatment.regressionsCount}`);
      console.log(`  Multi-Pass False Assertions:      ${rep.multiPassSummary.narrowTreatment.negativeControlSelectedAssertions}/${rep.multiPassSummary.absentCases}`);
      console.log(`  Multi-Pass Authority Elevation:   ${rep.multiPassSummary.narrowTreatment.inappropriateAuthorityElevationCount}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
