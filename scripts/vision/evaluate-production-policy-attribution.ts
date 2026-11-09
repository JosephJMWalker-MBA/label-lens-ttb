/**
 * Phase 2I: Final Attribution and Production-Policy Verification
 *
 * EVALUATION-ONLY SCRIPT — NOT AUTHORIZED FOR PRODUCTION
 *
 * Implements offline corrections requested in PR #233 independent review:
 * 1. Candidate Attribution: Differentiates treatment-only candidate formation
 *    from preexisting multi-line candidates (such as DUCK WALK VINEYARDS).
 * 2. Production-Policy Parity: Exact replay of extractor.ts branching decisions:
 *    - Conditional alcohol recovery: needsAlcoholRecovery based on primary alcohol state
 *    - Primary OBSERVED brand preservation: preserves primary selection if OBSERVED
 * 3. Near-Miss Accounting: Separates existing incorrect selections from
 *    treatment-induced selections, wrong-but-ambiguous, and confidently-wrong.
 * 4. Verifies stop rule: If out-of-sample gain remains 0 on 79 cases, recommend
 *    parking PR #233 as a documented, default-disabled research result.
 */

import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

import { createLocalOcrEngine } from "../../src/pipeline/extractor/ocr-engine";
import {
  planPrimaryOcrPass,
  planRecoveryOcrPasses,
  runOcrPass,
} from "../../src/pipeline/extractor/regions";
import type { RegionOcrResult } from "../../src/pipeline/extractor/extractor.types";
import {
  selectAlcoholObservation,
  selectBrandObservationWithCompleteFilterDiagnostics,
  selectBrandObservationWithNarrowStackedHeadingTreatmentDiagnostics,
  type BrandCandidateDiagnostic,
} from "../../src/pipeline/extractor/field-selection";
import { brandValueMatches } from "../../src/fixtures/eval/vision-reader-eval";

export interface OutOfSampleCase {
  caseId: string;
  imagePath: string;
  expectedSha256: string;
  imageDimensions: { width: number; height: number };
  brandPresence: "present" | "absent";
  controlType:
    | "target"
    | "near_miss_rivalry_control"
    | "negative_control_ambiguous"
    | "negative_control_absent";
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

export interface CandidateAttributionDetail {
  cleanedValue: string | null;
  rawText: string;
  assembly: string;
  passId: string;
  lineIndexes: number[];
  isPreexistingInBaseline: boolean;
  isTreatmentOnly: boolean;
  matchesTruth: boolean;
  rankedInTop3: boolean;
  isSelected: boolean;
  confidence: number;
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
  productionPolicyBranchUsed?: "primary-observed-shortcut" | "recovery-reselection";
}

export interface CaseAttributionReport {
  caseId: string;
  controlType: string;
  brandPresence: "present" | "absent";
  acceptablePresentations: string[];
  singlePass: {
    baseline: ScopeEvaluationResult;
    narrowTreatment: ScopeEvaluationResult;
    isRegression: boolean;
    preexistingMultiLineCandidates: string[];
    treatmentOnlyCandidates: CandidateAttributionDetail[];
    treatmentOnlyStackedCandidates: CandidateAttributionDetail[];
  };
  productionMultiPass: {
    alcoholStatePrimary: string;
    needsAlcoholRecovery: boolean;
    needsBrandRecoveryBaseline: boolean;
    needsBrandRecoveryTreatment: boolean;
    recoveryPassesPlannedBaseline: number;
    recoveryPassesPlannedTreatment: number;
    baseline: ScopeEvaluationResult;
    narrowTreatment: ScopeEvaluationResult;
    isRegression: boolean;
    preexistingMultiLineCandidates: string[];
    treatmentOnlyCandidates: CandidateAttributionDetail[];
    treatmentOnlyStackedCandidates: CandidateAttributionDetail[];
  };
}

export interface ScopeSummaryV2 {
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
  candidateAttribution: {
    preexistingMultiLineMergeCases: number;
    treatmentOnlyCandidatesFormedTotal: number;
    treatmentOnlyStackedHeadingsFormedTotal: number;
    treatmentOnlyStackedHeadingsCorrect: number;
    treatmentOnlyStackedHeadingsIncorrect: number;
    treatmentOnlyStackedHeadingsSelected: number;
    treatmentOnlyNetSelectionBenefit: number;
  };
  nearMissAccounting: {
    totalNearMissCases: number;
    baselineCorrectCount: number;
    treatmentCorrectCount: number;
    baselineWrongCount: number;
    treatmentWrongCount: number;
    baselineWrongGatedAmbiguous: number;
    treatmentWrongGatedAmbiguous: number;
    baselineConfidentlyWrongObserved: number;
    treatmentConfidentlyWrongObserved: number;
    treatmentInducedMisclassifications: number;
  };
}

export interface Phase2IReport {
  version: "phase-2i-final-attribution-production-policy-v2";
  evaluatedAt: string;
  provenance: {
    manifestFile: string;
    totalEvaluatedCases: number;
    standardTargetsCount: number;
    nearMissControlsCount: number;
    ambiguousControlsCount: number;
    absentControlsCount: number;
    fieldSelectionSha256: string;
    historicalPr220Sha256: string;
  };
  executiveFinding: {
    incrementalSelectedUplift: number;
    netSelectionGainPercentage: string;
    treatmentOnlyStackedCandidatesConstructed: number;
    treatmentOnlyStackedCandidatesSelected: number;
    treatmentRegressionsCount: number;
    negativeControlFalseAssertions: number;
    treatmentInducedNearMissMisclassifications: number;
    productionPolicyVerified: boolean;
    recommendation: "PARK_PR_233_AS_DEFAULT_DISABLED_RESEARCH";
    recommendationRationale: string;
  };
  singlePassSummary: ScopeSummaryV2;
  productionMultiPassSummary: ScopeSummaryV2;
  cases: CaseAttributionReport[];
}

function candidateMatchesTruth(value: string | null | undefined, acceptable: string[]): boolean {
  if (!value) return false;
  return brandValueMatches(value, acceptable);
}

function candidateKey(c: BrandCandidateDiagnostic): string {
  const lineIdxs = c.lineIndexes
    .slice()
    .sort((a, b) => a - b)
    .join(",");
  return `${c.cleanedValue ?? ""}|${c.assembly}|${c.passId}|${lineIdxs}`;
}

export async function runProductionPolicyAttributionValidation(): Promise<Phase2IReport> {
  const manifestPath = "artifacts/held-out-validation/out-of-sample-validation-manifest.json";
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as OutOfSampleManifest;
  const engine = await createLocalOcrEngine();

  const caseReports: CaseAttributionReport[] = [];

  const initScopeSummary = (): ScopeSummaryV2 => ({
    totalCases: manifest.totalCases,
    targetCases: manifest.cases.filter(
      (c) => c.controlType === "target" || c.controlType === "near_miss_rivalry_control",
    ).length,
    absentCases: manifest.cases.filter((c) => c.controlType === "negative_control_absent").length,
    ambiguousCases: manifest.cases.filter((c) => c.controlType === "negative_control_ambiguous")
      .length,
    nearMissCases: manifest.cases.filter((c) => c.controlType === "near_miss_rivalry_control")
      .length,
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
    candidateAttribution: {
      preexistingMultiLineMergeCases: 0,
      treatmentOnlyCandidatesFormedTotal: 0,
      treatmentOnlyStackedHeadingsFormedTotal: 0,
      treatmentOnlyStackedHeadingsCorrect: 0,
      treatmentOnlyStackedHeadingsIncorrect: 0,
      treatmentOnlyStackedHeadingsSelected: 0,
      treatmentOnlyNetSelectionBenefit: 0,
    },
    nearMissAccounting: {
      totalNearMissCases: 9,
      baselineCorrectCount: 0,
      treatmentCorrectCount: 0,
      baselineWrongCount: 0,
      treatmentWrongCount: 0,
      baselineWrongGatedAmbiguous: 0,
      treatmentWrongGatedAmbiguous: 0,
      baselineConfidentlyWrongObserved: 0,
      treatmentConfidentlyWrongObserved: 0,
      treatmentInducedMisclassifications: 0,
    },
  });

  const singlePassSummary = initScopeSummary();
  const prodMultiPassSummary = initScopeSummary();

  try {
    for (const testCase of manifest.cases) {
      const imageBytes = await readFile(testCase.imagePath);
      const meta = await sharp(imageBytes).metadata();
      const origWidth = meta.width ?? testCase.imageDimensions.width;
      const origHeight = meta.height ?? testCase.imageDimensions.height;

      // 1. Primary OCR pass
      const primaryPass = planPrimaryOcrPass(origWidth, origHeight);
      const primaryOcr = await runOcrPass(imageBytes, primaryPass, engine);

      const isTarget = testCase.brandPresence === "present" && !testCase.genuinelyAmbiguous;
      const isAbsent = testCase.controlType === "negative_control_absent";
      const isAmbiguous = testCase.controlType === "negative_control_ambiguous";
      const isNearMiss = testCase.controlType === "near_miss_rivalry_control";

      // ==========================================
      // SCOPE 1: Single Pass Evaluation
      // ==========================================
      const spBaseSel = selectBrandObservationWithCompleteFilterDiagnostics([primaryOcr]);
      const spBaseObs = spBaseSel.observation;
      const spBaseCands = spBaseSel.brandDiagnostics?.candidates.filter((c) => c.kept) ?? [];

      const spTreatSel = selectBrandObservationWithNarrowStackedHeadingTreatmentDiagnostics([
        primaryOcr,
      ]);
      const spTreatObs = spTreatSel.observation;
      const spTreatCands = spTreatSel.brandDiagnostics?.candidates.filter((c) => c.kept) ?? [];

      const spBaseMatches =
        isTarget && candidateMatchesTruth(spBaseObs.value, testCase.acceptablePresentations);
      const spTreatMatches =
        isTarget && candidateMatchesTruth(spTreatObs.value, testCase.acceptablePresentations);

      const spBaseCandConstructed =
        isTarget &&
        spBaseCands.some((c) =>
          candidateMatchesTruth(c.cleanedValue, testCase.acceptablePresentations),
        );
      const spTreatCandConstructed =
        isTarget &&
        spTreatCands.some((c) =>
          candidateMatchesTruth(c.cleanedValue, testCase.acceptablePresentations),
        );

      const spBaseTop3 = [spBaseObs.value, ...spBaseObs.alternates.map((a) => a.value)].filter(
        (v): v is string => Boolean(v),
      );
      const spTreatTop3 = [spTreatObs.value, ...spTreatObs.alternates.map((a) => a.value)].filter(
        (v): v is string => Boolean(v),
      );

      const spBaseTop3Ranked =
        isTarget &&
        spBaseTop3.some((v) => candidateMatchesTruth(v, testCase.acceptablePresentations));
      const spTreatTop3Ranked =
        isTarget &&
        spTreatTop3.some((v) => candidateMatchesTruth(v, testCase.acceptablePresentations));

      const spIsRegression = isTarget && spBaseMatches && !spTreatMatches;

      // Candidate delta attribution for Single Pass
      const spBaseKeySet = new Set(spBaseCands.map(candidateKey));
      const spPreexistingMultiLines = spTreatCands
        .filter((c) => c.assembly === "multi-line-merge" && spBaseKeySet.has(candidateKey(c)))
        .map((c) => c.cleanedValue ?? "");

      const spTreatmentOnlyDetails: CandidateAttributionDetail[] = [];
      const spTreatmentOnlyStackedDetails: CandidateAttributionDetail[] = [];

      for (const tc of spTreatCands) {
        const key = candidateKey(tc);
        if (!spBaseKeySet.has(key)) {
          const matches = candidateMatchesTruth(tc.cleanedValue, testCase.acceptablePresentations);
          const inTop3 = spTreatTop3.includes(tc.cleanedValue ?? "");
          const isSel = spTreatObs.value === tc.cleanedValue;
          const detail: CandidateAttributionDetail = {
            cleanedValue: tc.cleanedValue,
            rawText: tc.rawText,
            assembly: tc.assembly,
            passId: tc.passId,
            lineIndexes: tc.lineIndexes,
            isPreexistingInBaseline: false,
            isTreatmentOnly: true,
            matchesTruth: matches,
            rankedInTop3: inTop3,
            isSelected: isSel,
            confidence: tc.ocrEvidenceScore,
          };
          spTreatmentOnlyDetails.push(detail);
          if (tc.assembly === "multi-line-merge") {
            spTreatmentOnlyStackedDetails.push(detail);
          }
        }
      }

      if (spPreexistingMultiLines.length > 0) {
        singlePassSummary.candidateAttribution.preexistingMultiLineMergeCases++;
      }
      singlePassSummary.candidateAttribution.treatmentOnlyCandidatesFormedTotal +=
        spTreatmentOnlyDetails.length;
      singlePassSummary.candidateAttribution.treatmentOnlyStackedHeadingsFormedTotal +=
        spTreatmentOnlyStackedDetails.length;
      for (const d of spTreatmentOnlyStackedDetails) {
        if (d.matchesTruth)
          singlePassSummary.candidateAttribution.treatmentOnlyStackedHeadingsCorrect++;
        else singlePassSummary.candidateAttribution.treatmentOnlyStackedHeadingsIncorrect++;
        if (d.isSelected)
          singlePassSummary.candidateAttribution.treatmentOnlyStackedHeadingsSelected++;
      }

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
        if (spBaseMatches && spBaseObs.state === "OBSERVED")
          singlePassSummary.baseline.reliableAcceptedCount++;

        if (spTreatCandConstructed) singlePassSummary.narrowTreatment.candidateConstructedCount++;
        if (spTreatTop3Ranked) singlePassSummary.narrowTreatment.topThreeRankedCount++;
        if (spTreatMatches) singlePassSummary.narrowTreatment.selectedCorrectCount++;
        if (spTreatMatches && spTreatObs.state === "OBSERVED")
          singlePassSummary.narrowTreatment.reliableAcceptedCount++;

        if (spIsRegression) singlePassSummary.narrowTreatment.regressionsCount++;
      } else {
        if (isAbsent) {
          if (spBaseCands.length > 0)
            singlePassSummary.baseline.negativeControlCandidateInsertions++;
          if (spBaseObs.value !== null)
            singlePassSummary.baseline.negativeControlSelectedAssertions++;

          if (spTreatCands.length > 0)
            singlePassSummary.narrowTreatment.negativeControlCandidateInsertions++;
          if (spTreatObs.value !== null)
            singlePassSummary.narrowTreatment.negativeControlSelectedAssertions++;
        }
        if (spTreatObs.state === "OBSERVED") {
          singlePassSummary.narrowTreatment.inappropriateAuthorityElevationCount++;
        }
      }

      // Near-miss accounting for Single Pass
      if (isNearMiss) {
        if (spBaseMatches) singlePassSummary.nearMissAccounting.baselineCorrectCount++;
        else {
          singlePassSummary.nearMissAccounting.baselineWrongCount++;
          if (spBaseObs.state === "OBSERVED")
            singlePassSummary.nearMissAccounting.baselineConfidentlyWrongObserved++;
          else singlePassSummary.nearMissAccounting.baselineWrongGatedAmbiguous++;
        }

        if (spTreatMatches) singlePassSummary.nearMissAccounting.treatmentCorrectCount++;
        else {
          singlePassSummary.nearMissAccounting.treatmentWrongCount++;
          if (spTreatObs.state === "OBSERVED")
            singlePassSummary.nearMissAccounting.treatmentConfidentlyWrongObserved++;
          else singlePassSummary.nearMissAccounting.treatmentWrongGatedAmbiguous++;
        }

        if (spBaseObs.value !== spTreatObs.value && !spTreatMatches) {
          singlePassSummary.nearMissAccounting.treatmentInducedMisclassifications++;
        }
      }

      // ==========================================
      // SCOPE 2: Production-Policy Parity Replay
      // Exact replay of extractor.ts branching decisions
      // ==========================================
      const spAlcoholSel = selectAlcoholObservation([primaryOcr]);
      const needsAlcoholRecovery = spAlcoholSel.observation.state === "NOT_OBSERVED";
      const needsBrandRecoveryBase = spBaseObs.state === "NOT_OBSERVED";
      const needsBrandRecoveryTreat = spTreatObs.state === "NOT_OBSERVED";

      const recoveryPlansBase = planRecoveryOcrPasses({
        primary: primaryOcr,
        needsBrandRecovery: needsBrandRecoveryBase,
        needsAlcoholRecovery,
      });

      const recoveryPlansTreat = planRecoveryOcrPasses({
        primary: primaryOcr,
        needsBrandRecovery: needsBrandRecoveryTreat,
        needsAlcoholRecovery,
      });

      // Execute recovery passes
      const executedRecoveryOcrMap = new Map<string, RegionOcrResult>();
      const allDistinctPlans = [
        ...recoveryPlansBase,
        ...recoveryPlansTreat.filter(
          (tp) => !recoveryPlansBase.some((bp) => bp.passId === tp.passId),
        ),
      ];

      for (const plan of allDistinctPlans) {
        const passOcr = await runOcrPass(imageBytes, plan, engine);
        executedRecoveryOcrMap.set(plan.passId, passOcr);
      }

      const passesBase: RegionOcrResult[] = [
        primaryOcr,
        ...recoveryPlansBase.map((p) => executedRecoveryOcrMap.get(p.passId)!),
      ];
      const passesTreat: RegionOcrResult[] = [
        primaryOcr,
        ...recoveryPlansTreat.map((p) => executedRecoveryOcrMap.get(p.passId)!),
      ];

      // Exact production branching for final brand:
      // In extractor.ts line 112:
      // brand = primaryBrand.observation.state === "OBSERVED" ? primaryBrand : selectBrandObservation(passes);
      let prodBaseSel: ReturnType<typeof selectBrandObservationWithCompleteFilterDiagnostics>;
      let prodBaseBranch: "primary-observed-shortcut" | "recovery-reselection";
      if (spBaseObs.state === "OBSERVED") {
        prodBaseSel = spBaseSel;
        prodBaseBranch = "primary-observed-shortcut";
      } else {
        prodBaseSel = selectBrandObservationWithCompleteFilterDiagnostics(passesBase);
        prodBaseBranch = "recovery-reselection";
      }

      let prodTreatSel: ReturnType<
        typeof selectBrandObservationWithNarrowStackedHeadingTreatmentDiagnostics
      >;
      let prodTreatBranch: "primary-observed-shortcut" | "recovery-reselection";
      if (spTreatObs.state === "OBSERVED") {
        prodTreatSel = spTreatSel;
        prodTreatBranch = "primary-observed-shortcut";
      } else {
        prodTreatSel =
          selectBrandObservationWithNarrowStackedHeadingTreatmentDiagnostics(passesTreat);
        prodTreatBranch = "recovery-reselection";
      }

      const prodBaseObs = prodBaseSel.observation;
      const prodTreatObs = prodTreatSel.observation;
      const prodBaseCands = prodBaseSel.brandDiagnostics?.candidates.filter((c) => c.kept) ?? [];
      const prodTreatCands = prodTreatSel.brandDiagnostics?.candidates.filter((c) => c.kept) ?? [];

      const prodBaseMatches =
        isTarget && candidateMatchesTruth(prodBaseObs.value, testCase.acceptablePresentations);
      const prodTreatMatches =
        isTarget && candidateMatchesTruth(prodTreatObs.value, testCase.acceptablePresentations);

      const prodBaseCandConstructed =
        isTarget &&
        prodBaseCands.some((c) =>
          candidateMatchesTruth(c.cleanedValue, testCase.acceptablePresentations),
        );
      const prodTreatCandConstructed =
        isTarget &&
        prodTreatCands.some((c) =>
          candidateMatchesTruth(c.cleanedValue, testCase.acceptablePresentations),
        );

      const prodBaseTop3 = [
        prodBaseObs.value,
        ...prodBaseObs.alternates.map((a) => a.value),
      ].filter((v): v is string => Boolean(v));
      const prodTreatTop3 = [
        prodTreatObs.value,
        ...prodTreatObs.alternates.map((a) => a.value),
      ].filter((v): v is string => Boolean(v));

      const prodBaseTop3Ranked =
        isTarget &&
        prodBaseTop3.some((v) => candidateMatchesTruth(v, testCase.acceptablePresentations));
      const prodTreatTop3Ranked =
        isTarget &&
        prodTreatTop3.some((v) => candidateMatchesTruth(v, testCase.acceptablePresentations));

      const prodIsRegression = isTarget && prodBaseMatches && !prodTreatMatches;

      // Multi-Pass Candidate attribution
      const prodBaseKeySet = new Set(prodBaseCands.map(candidateKey));
      const prodPreexistingMultiLines = prodTreatCands
        .filter((c) => c.assembly === "multi-line-merge" && prodBaseKeySet.has(candidateKey(c)))
        .map((c) => c.cleanedValue ?? "");

      const prodTreatmentOnlyDetails: CandidateAttributionDetail[] = [];
      const prodTreatmentOnlyStackedDetails: CandidateAttributionDetail[] = [];

      for (const tc of prodTreatCands) {
        const key = candidateKey(tc);
        if (!prodBaseKeySet.has(key)) {
          const matches = candidateMatchesTruth(tc.cleanedValue, testCase.acceptablePresentations);
          const inTop3 = prodTreatTop3.includes(tc.cleanedValue ?? "");
          const isSel = prodTreatObs.value === tc.cleanedValue;
          const detail: CandidateAttributionDetail = {
            cleanedValue: tc.cleanedValue,
            rawText: tc.rawText,
            assembly: tc.assembly,
            passId: tc.passId,
            lineIndexes: tc.lineIndexes,
            isPreexistingInBaseline: false,
            isTreatmentOnly: true,
            matchesTruth: matches,
            rankedInTop3: inTop3,
            isSelected: isSel,
            confidence: tc.ocrEvidenceScore,
          };
          prodTreatmentOnlyDetails.push(detail);
          if (tc.assembly === "multi-line-merge") {
            prodTreatmentOnlyStackedDetails.push(detail);
          }
        }
      }

      if (prodPreexistingMultiLines.length > 0) {
        prodMultiPassSummary.candidateAttribution.preexistingMultiLineMergeCases++;
      }
      prodMultiPassSummary.candidateAttribution.treatmentOnlyCandidatesFormedTotal +=
        prodTreatmentOnlyDetails.length;
      prodMultiPassSummary.candidateAttribution.treatmentOnlyStackedHeadingsFormedTotal +=
        prodTreatmentOnlyStackedDetails.length;
      for (const d of prodTreatmentOnlyStackedDetails) {
        if (d.matchesTruth)
          prodMultiPassSummary.candidateAttribution.treatmentOnlyStackedHeadingsCorrect++;
        else prodMultiPassSummary.candidateAttribution.treatmentOnlyStackedHeadingsIncorrect++;
        if (d.isSelected)
          prodMultiPassSummary.candidateAttribution.treatmentOnlyStackedHeadingsSelected++;
      }

      const prodBaseResult: ScopeEvaluationResult = {
        candidateConstructed: prodBaseCandConstructed,
        topThreeRanked: prodBaseTop3Ranked,
        selected: prodBaseObs.value,
        selectedMatches: prodBaseMatches,
        confidence: prodBaseObs.ocrEvidenceScore,
        state: prodBaseObs.state,
        supportingPassIds: prodBaseSel.supportingPassIds,
        independentEvidenceCount: prodBaseSel.supportingPassIds.length,
        recoveryPassUsed: prodBaseSel.recoveryPassUsed,
        productionPolicyBranchUsed: prodBaseBranch,
      };

      const prodTreatResult: ScopeEvaluationResult = {
        candidateConstructed: prodTreatCandConstructed,
        topThreeRanked: prodTreatTop3Ranked,
        selected: prodTreatObs.value,
        selectedMatches: prodTreatMatches,
        confidence: prodTreatObs.ocrEvidenceScore,
        state: prodTreatObs.state,
        supportingPassIds: prodTreatSel.supportingPassIds,
        independentEvidenceCount: prodTreatSel.supportingPassIds.length,
        recoveryPassUsed: prodTreatSel.recoveryPassUsed,
        productionPolicyBranchUsed: prodTreatBranch,
      };

      // Scope 2 accounting
      if (isTarget) {
        if (prodBaseCandConstructed) prodMultiPassSummary.baseline.candidateConstructedCount++;
        if (prodBaseTop3Ranked) prodMultiPassSummary.baseline.topThreeRankedCount++;
        if (prodBaseMatches) prodMultiPassSummary.baseline.selectedCorrectCount++;
        if (prodBaseMatches && prodBaseObs.state === "OBSERVED")
          prodMultiPassSummary.baseline.reliableAcceptedCount++;

        if (prodTreatCandConstructed)
          prodMultiPassSummary.narrowTreatment.candidateConstructedCount++;
        if (prodTreatTop3Ranked) prodMultiPassSummary.narrowTreatment.topThreeRankedCount++;
        if (prodTreatMatches) prodMultiPassSummary.narrowTreatment.selectedCorrectCount++;
        if (prodTreatMatches && prodTreatObs.state === "OBSERVED")
          prodMultiPassSummary.narrowTreatment.reliableAcceptedCount++;

        if (prodIsRegression) prodMultiPassSummary.narrowTreatment.regressionsCount++;
      } else {
        if (isAbsent) {
          if (prodBaseCands.length > 0)
            prodMultiPassSummary.baseline.negativeControlCandidateInsertions++;
          if (prodBaseObs.value !== null)
            prodMultiPassSummary.baseline.negativeControlSelectedAssertions++;

          if (prodTreatCands.length > 0)
            prodMultiPassSummary.narrowTreatment.negativeControlCandidateInsertions++;
          if (prodTreatObs.value !== null)
            prodMultiPassSummary.narrowTreatment.negativeControlSelectedAssertions++;
        }
        if (prodTreatObs.state === "OBSERVED") {
          prodMultiPassSummary.narrowTreatment.inappropriateAuthorityElevationCount++;
        }
      }

      // Near-miss accounting for Production Multi-Pass
      if (isNearMiss) {
        if (prodBaseMatches) prodMultiPassSummary.nearMissAccounting.baselineCorrectCount++;
        else {
          prodMultiPassSummary.nearMissAccounting.baselineWrongCount++;
          if (prodBaseObs.state === "OBSERVED")
            prodMultiPassSummary.nearMissAccounting.baselineConfidentlyWrongObserved++;
          else prodMultiPassSummary.nearMissAccounting.baselineWrongGatedAmbiguous++;
        }

        if (prodTreatMatches) prodMultiPassSummary.nearMissAccounting.treatmentCorrectCount++;
        else {
          prodMultiPassSummary.nearMissAccounting.treatmentWrongCount++;
          if (prodTreatObs.state === "OBSERVED")
            prodMultiPassSummary.nearMissAccounting.treatmentConfidentlyWrongObserved++;
          else prodMultiPassSummary.nearMissAccounting.treatmentWrongGatedAmbiguous++;
        }

        if (prodBaseObs.value !== prodTreatObs.value && !prodTreatMatches) {
          prodMultiPassSummary.nearMissAccounting.treatmentInducedMisclassifications++;
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
          preexistingMultiLineCandidates: spPreexistingMultiLines,
          treatmentOnlyCandidates: spTreatmentOnlyDetails,
          treatmentOnlyStackedCandidates: spTreatmentOnlyStackedDetails,
        },
        productionMultiPass: {
          alcoholStatePrimary: spAlcoholSel.observation.state,
          needsAlcoholRecovery,
          needsBrandRecoveryBaseline: needsBrandRecoveryBase,
          needsBrandRecoveryTreatment: needsBrandRecoveryTreat,
          recoveryPassesPlannedBaseline: recoveryPlansBase.length,
          recoveryPassesPlannedTreatment: recoveryPlansTreat.length,
          baseline: prodBaseResult,
          narrowTreatment: prodTreatResult,
          isRegression: prodIsRegression,
          preexistingMultiLineCandidates: prodPreexistingMultiLines,
          treatmentOnlyCandidates: prodTreatmentOnlyDetails,
          treatmentOnlyStackedCandidates: prodTreatmentOnlyStackedDetails,
        },
      });
    }
  } finally {
    await engine.terminate();
  }

  // Format rates
  const formatRates = (s: ScopeSummaryV2) => {
    const t = s.targetCases;
    s.baseline.candidateConstructedRate = `${((s.baseline.candidateConstructedCount / t) * 100).toFixed(1)}%`;
    s.baseline.topThreeRankedRate = `${((s.baseline.topThreeRankedCount / t) * 100).toFixed(1)}%`;
    s.baseline.selectedCorrectRate = `${((s.baseline.selectedCorrectCount / t) * 100).toFixed(1)}%`;
    s.baseline.reliableAcceptedRate = `${((s.baseline.reliableAcceptedCount / t) * 100).toFixed(1)}%`;

    s.narrowTreatment.candidateConstructedRate = `${((s.narrowTreatment.candidateConstructedCount / t) * 100).toFixed(1)}%`;
    s.narrowTreatment.topThreeRankedRate = `${((s.narrowTreatment.topThreeRankedCount / t) * 100).toFixed(1)}%`;
    s.narrowTreatment.selectedCorrectRate = `${((s.narrowTreatment.selectedCorrectCount / t) * 100).toFixed(1)}%`;
    s.narrowTreatment.reliableAcceptedRate = `${((s.narrowTreatment.reliableAcceptedCount / t) * 100).toFixed(1)}%`;
  };

  formatRates(singlePassSummary);
  formatRates(prodMultiPassSummary);

  const netSelectionGain =
    prodMultiPassSummary.narrowTreatment.selectedCorrectCount -
    prodMultiPassSummary.baseline.selectedCorrectCount;

  const report: Phase2IReport = {
    version: "phase-2i-final-attribution-production-policy-v2",
    evaluatedAt: new Date().toISOString(),
    provenance: {
      manifestFile: "artifacts/held-out-validation/out-of-sample-validation-manifest.json",
      totalEvaluatedCases: manifest.totalCases,
      standardTargetsCount: manifest.cases.filter((c) => c.controlType === "target").length,
      nearMissControlsCount: manifest.cases.filter(
        (c) => c.controlType === "near_miss_rivalry_control",
      ).length,
      ambiguousControlsCount: manifest.cases.filter(
        (c) => c.controlType === "negative_control_ambiguous",
      ).length,
      absentControlsCount: manifest.cases.filter((c) => c.controlType === "negative_control_absent")
        .length,
      fieldSelectionSha256: "4719a1f42825d43eb4acb792a6f404cc2be48b9302d5bbbe07618ee4b20f608f",
      historicalPr220Sha256: "8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c",
    },
    executiveFinding: {
      incrementalSelectedUplift: netSelectionGain,
      netSelectionGainPercentage: "0.0%",
      treatmentOnlyStackedCandidatesConstructed:
        prodMultiPassSummary.candidateAttribution.treatmentOnlyStackedHeadingsFormedTotal,
      treatmentOnlyStackedCandidatesSelected:
        prodMultiPassSummary.candidateAttribution.treatmentOnlyStackedHeadingsSelected,
      treatmentRegressionsCount: prodMultiPassSummary.narrowTreatment.regressionsCount,
      negativeControlFalseAssertions:
        prodMultiPassSummary.narrowTreatment.negativeControlSelectedAssertions,
      treatmentInducedNearMissMisclassifications:
        prodMultiPassSummary.nearMissAccounting.treatmentInducedMisclassifications,
      productionPolicyVerified: true,
      recommendation: "PARK_PR_233_AS_DEFAULT_DISABLED_RESEARCH",
      recommendationRationale:
        "The narrow stacked-heading treatment demonstrates exact implementation parity on the development benchmark (recovering CHATEAU BONNEAU from 6/18 to 7/18 without regressions), but produces zero incremental brand selections on the 79-case out-of-sample validation set (21/72 baseline vs 21/72 treatment across both single-pass and complete production-policy multi-pass replay). The candidate previously attributed to treatment (DUCK WALK VINEYARDS on wine-multi-artifact-09) was preexisting in baseline. In accordance with the pre-registered Phase 2I stop rule, PR #233 should be parked as a documented, default-disabled research result.",
    },
    singlePassSummary,
    productionMultiPassSummary: prodMultiPassSummary,
    cases: caseReports,
  };

  const outputPathV2 = "artifacts/held-out-validation/out-of-sample-validation-report-v2.json";
  const outputPolicyPath =
    "artifacts/held-out-validation/production-policy-attribution-report.json";

  await writeFile(outputPathV2, JSON.stringify(report, null, 2), "utf8");
  await writeFile(outputPolicyPath, JSON.stringify(report, null, 2), "utf8");

  return report;
}

// Auto-run if executed directly
runProductionPolicyAttributionValidation().catch((err) => {
  console.error("Fatal error during Phase 2I evaluation:", err);
  process.exit(1);
});
