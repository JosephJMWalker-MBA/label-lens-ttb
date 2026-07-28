import { createHash } from "node:crypto";

import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import {
  selectAlcoholObservation,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";
import type { RegionOcrResult } from "@/pipeline/extractor/extractor.types";

export const ALCOHOL_RESELECTION_EXPERIMENT_ID =
  "issue-149-alcohol-reselection-experiment-a" as const;
export const ALCOHOL_RESELECTION_BASE_SHA = "5d22a6be0407e8df4870983aab9107bc89f7c5d0" as const;
export const ALCOHOL_RESELECTION_PREREGISTRATION_SHA256 =
  "19a9f649271265fee0369363b32e30bb9a4419b35d2a4f6b50d47db5779eb102" as const;

export type AlcoholReselectionArm = "control" | "treatment";
export type AlcoholReselectionDecision =
  "ADOPT_FOR_PRODUCTION_REVIEW" | "KILL" | "INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED";

export const ALCOHOL_RESELECTION_MECHANISMS = [
  "RECOVERY_TRUTH_PROMOTED",
  "STRONGER_RECOVERY_REPLACED_WEAK_PRIMARY",
  "CORRECT_PARSED_VALUE_PROMOTED",
  "PRIMARY_CORRECTLY_RETAINED",
  "RECOVERY_FALSE_POSITIVE_PROMOTED",
  "WEAKER_RECOVERY_REPLACED_PRIMARY",
  "TIE_BREAK_CHANGED_SELECTION",
  "CONFIDENCE_ONLY_CHANGE",
  "NO_MEANINGFUL_EFFECT",
  "UNDETERMINED",
] as const;
export type AlcoholReselectionMechanism = (typeof ALCOHOL_RESELECTION_MECHANISMS)[number];

/**
 * The complete preregistered treatment seam. It accepts no truth, case identity,
 * checksum, layout, or seller data. Both arms use the unchanged production
 * selector and the extractor's existing pass order.
 */
export function selectAlcoholForReselectionArm(input: {
  arm: AlcoholReselectionArm;
  primary: FieldSelection;
  passes: RegionOcrResult[];
}): FieldSelection {
  if (input.passes.length === 0) {
    throw new Error("Alcohol reselection requires the existing primary pass");
  }
  if (input.arm === "control") {
    return input.primary.observation.state === "NOT_OBSERVED"
      ? selectAlcoholObservation(input.passes)
      : input.primary;
  }
  return input.passes.length > 1 ? selectAlcoholObservation(input.passes) : input.primary;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function observationBehavior(observation: AnalyzerFieldObservation) {
  return {
    state: observation.state,
    value: observation.value,
    normalizedValue: observation.normalizedValue ?? null,
    rawText: observation.rawText ?? null,
    confidence: observation.confidence,
    ocrEvidenceScore: observation.ocrEvidenceScore,
    ocrConfidence: observation.ocrConfidence ?? null,
    candidateProvenance: observation.candidateProvenance ?? null,
    ranking: observation.ranking ?? null,
    geometry: observation.geometry ?? null,
    alternates: observation.alternates,
    ambiguityReason: observation.ambiguityReason ?? null,
  };
}

export function selectionBehavior(selection: FieldSelection) {
  return {
    observation: observationBehavior(selection.observation),
    sourceRegion: selection.sourceRegion,
    source: selection.source,
    supportingPassIds: selection.supportingPassIds,
    recoveryPassUsed: selection.recoveryPassUsed,
  };
}

export function selectionsBehaviorallyEqual(left: FieldSelection, right: FieldSelection): boolean {
  return canonicalJson(selectionBehavior(left)) === canonicalJson(selectionBehavior(right));
}

export function passTraceBehavior(passes: readonly RegionOcrResult[]) {
  return passes.map((pass) => ({
    passId: pass.passId,
    regionName: pass.regionName,
    passKind: pass.passKind,
    triggerReasons: pass.triggerReasons,
    preprocessing: pass.preprocessing,
    fieldEligibility: pass.fieldEligibility,
    transform: pass.transform,
    transformedSize: pass.transformedSize,
    pageSegMode: pass.pageSegMode,
    rawWordCount: pass.rawWordCount,
    discardedWordCount: pass.discardedWordCount,
    words: pass.words,
  }));
}

export interface AlcoholReselectionDecisionInput {
  eligibilityPassed: boolean;
  improvedCaseCount: number;
  improvementChecksumFamilyCount: number;
  detectionRecallImproved: boolean;
  parsedAccuracyImproved: boolean;
  recoveryTruthPromotionCount: number;
  correctRegressionCount: number;
  falseReliableReadIncrease: number;
  wrongReliableReadIncrease: number;
  absenceFalsePositiveCount: number;
  brandChangedCaseCount: number;
  warningChangedCaseCount: number;
  medianLatencyIncreasePercent: number;
  p95LatencyIncreasePercent: number;
  isolationViolationCount: number;
  sellerTruthLeak: boolean;
  behaviorReproduced: boolean;
  behaviorallyIdenticalEveryEvaluableCase: boolean;
}

export interface AlcoholReselectionDecisionRecord {
  decision: AlcoholReselectionDecision;
  reasons: string[];
  nextRecommendation: string | null;
}

export const ALCOHOL_RESELECTION_KILL_RECOMMENDATION =
  "Corpus expansion: add governed cases that naturally produce Brand-only recovery while primary Alcohol is OBSERVED, LOW_CONFIDENCE, or AMBIGUOUS, so the selector-input condition becomes observable without changing production recovery triggers." as const;

export function decideAlcoholReselection(
  input: AlcoholReselectionDecisionInput,
): AlcoholReselectionDecisionRecord {
  if (!input.eligibilityPassed) {
    return {
      decision: "INCONCLUSIVE_CORPUS_EXPANSION_REQUIRED",
      reasons: ["The preregistered governed eligibility minimum was not met."],
      nextRecommendation: null,
    };
  }

  const reasons: string[] = [];
  if (input.improvedCaseCount <= 1) reasons.push("Zero or one governed case improved.");
  if (input.improvementChecksumFamilyCount <= 1)
    reasons.push("Improvements covered at most one checksum family.");
  if (!input.detectionRecallImproved && !input.parsedAccuracyImproved)
    reasons.push("Neither detection recall nor parsed-value accuracy improved.");
  if (input.recoveryTruthPromotionCount < 1)
    reasons.push("No improvement promoted truth already present in recovery evidence.");
  if (input.correctRegressionCount > 0) reasons.push("A previously correct case regressed.");
  if (input.falseReliableReadIncrease > 0) reasons.push("False reliable reads increased.");
  if (input.wrongReliableReadIncrease > 0) reasons.push("Wrong reliable reads increased.");
  if (input.absenceFalsePositiveCount > 0) reasons.push("An absence control became positive.");
  if (input.brandChangedCaseCount > 0) reasons.push("Brand behavior changed.");
  if (input.warningChangedCaseCount > 0) reasons.push("Government Warning behavior changed.");
  if (input.medianLatencyIncreasePercent > 10)
    reasons.push("Median latency exceeded the 10% ceiling.");
  if (input.p95LatencyIncreasePercent > 15) reasons.push("P95 latency exceeded the 15% ceiling.");
  if (input.isolationViolationCount > 0) reasons.push("A frozen isolation boundary changed.");
  if (input.sellerTruthLeak) reasons.push("Seller or fixture truth entered OCR or selection.");
  if (!input.behaviorReproduced) reasons.push("Primary and repeat behavior did not reproduce.");
  if (input.behaviorallyIdenticalEveryEvaluableCase)
    reasons.push("Control and treatment were behaviorally identical in every evaluable case.");

  if (reasons.length > 0) {
    return {
      decision: "KILL",
      reasons,
      nextRecommendation: ALCOHOL_RESELECTION_KILL_RECOMMENDATION,
    };
  }
  return {
    decision: "ADOPT_FOR_PRODUCTION_REVIEW",
    reasons: ["Every preregistered success criterion passed."],
    nextRecommendation: null,
  };
}

export function classifyAlcoholReselectionMechanism(input: {
  changed: boolean;
  primaryCorrect: boolean;
  controlCorrect: boolean;
  treatmentCorrect: boolean;
  truthPresentInRecovery: boolean;
  controlState: AnalyzerFieldObservation["state"];
  treatmentState: AnalyzerFieldObservation["state"];
  controlValue: string | null;
  treatmentValue: string | null;
  treatmentConfidence: number;
  controlConfidence: number;
  truthAbsent: boolean;
}): AlcoholReselectionMechanism {
  if (!input.changed) return "NO_MEANINGFUL_EFFECT";
  if (input.truthAbsent && input.treatmentValue !== null) return "RECOVERY_FALSE_POSITIVE_PROMOTED";
  if (input.controlCorrect && !input.treatmentCorrect) return "WEAKER_RECOVERY_REPLACED_PRIMARY";
  if (!input.controlCorrect && input.treatmentCorrect && input.truthPresentInRecovery)
    return "RECOVERY_TRUTH_PROMOTED";
  if (!input.controlCorrect && input.treatmentCorrect) return "CORRECT_PARSED_VALUE_PROMOTED";
  if (
    input.primaryCorrect &&
    input.treatmentCorrect &&
    input.treatmentConfidence > input.controlConfidence
  ) {
    return "STRONGER_RECOVERY_REPLACED_WEAK_PRIMARY";
  }
  if (input.controlValue === input.treatmentValue && input.controlState !== input.treatmentState) {
    return "CONFIDENCE_ONLY_CHANGE";
  }
  if (
    input.controlConfidence === input.treatmentConfidence &&
    input.controlValue !== input.treatmentValue
  ) {
    return "TIE_BREAK_CHANGED_SELECTION";
  }
  if (input.primaryCorrect && input.treatmentCorrect) return "PRIMARY_CORRECTLY_RETAINED";
  return "UNDETERMINED";
}
