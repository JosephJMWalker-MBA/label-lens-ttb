import {
  DECISION_CLARITY_COMPLETION_STATES,
  type DecisionClarityCompletionState,
} from "./decision-clarity-diagnostic";

export const OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION =
  "local-vlm-observation-quality-benchmark.v1" as const;
export const OBSERVATION_QUALITY_BENCHMARK_IMPLEMENTATION_STATUS = "SLICE_1_TYPES_ONLY" as const;

export const realExecutionAuthorized = false as const;
export const productionPromptChangeAuthorized = false as const;

export const OBSERVATION_QUALITY_CASE_COUNT = 16 as const;
export const OBSERVATION_QUALITY_REPETITIONS_PER_CONTRACT = 2 as const;
export const OBSERVATION_QUALITY_TOTAL_TRIALS = 64 as const;
export const OBSERVATION_QUALITY_TOTAL_SCORED_ITEMS = 64 as const;
export const OBSERVATION_QUALITY_PRIMARY_REVIEWER_COUNT = 1 as const;
export const OBSERVATION_QUALITY_REPEAT_SCORING_PERCENT = 20 as const;
export const OBSERVATION_QUALITY_MATERIAL_IMPROVEMENT_POINTS = 15 as const;
export const OBSERVATION_QUALITY_MATERIAL_REGRESSION_POINTS = 10 as const;
export const OBSERVATION_QUALITY_CHALLENGE_SLICE_PROTECTION_POINTS = 20 as const;
export const OBSERVATION_QUALITY_AVAILABILITY_TOLERANCE_POINTS = 5 as const;

export const OBSERVATION_QUALITY_RESEARCH_CONTRACTS = ["A", "A_PRIME"] as const;
export const OBSERVATION_QUALITY_ABSTENTION_APPROPRIATENESS = [
  "ABSTENTION_APPROPRIATE",
  "ABSTENTION_INAPPROPRIATE",
  "ABSTENTION_APPROPRIATENESS_UNCERTAIN",
  "NOT_APPLICABLE",
] as const;
export const OBSERVATION_QUALITY_OPPORTUNITY_STATES = [
  "OBSERVATION_OPPORTUNITY_PRESENT",
  "NO_CLEAR_OBSERVATION_OPPORTUNITY",
  "UNCERTAIN",
] as const;
export const OBSERVATION_QUALITY_OPPORTUNITY_TAGS = [
  "LOW_CONTRAST",
  "ROTATED_PANEL",
  "DENSE_TEXT_CLUSTER",
  "DECORATIVE_TYPE",
  "MULTI_PANEL_LAYOUT",
  "SMALL_STATEMENT",
  "MULTIPLE_COMPETING_TEXT_CLUSTERS",
  "NO_CLEAR_SINGLE_TARGET",
  "OTHER_WITH_NOTE",
] as const;
export const OBSERVATION_QUALITY_EVIDENCE_STATES = [
  "OBSERVATION_PRESENT",
  "VALID_ABSTENTION",
  "INVALID_ABSTENTION",
  "NO_COMPLETION",
  "INVALID_OUTPUT",
  "INFRASTRUCTURE_FAILURE",
  "PROVENANCE_FAILURE",
  "BLOCKED",
  "NOT_SCORED",
] as const;
export const OBSERVATION_QUALITY_VISIBLE_GROUNDING_SCORES = [0, 1, 2] as const;
export const OBSERVATION_QUALITY_SPECIFICITY_SCORES = [0, 1, 2] as const;
export const OBSERVATION_QUALITY_ACTIONABILITY_SCORES = [0, 1, 2] as const;
export const OBSERVATION_QUALITY_OCR_INDEPENDENCE_SCORES = [0, 1, 2] as const;
export const OBSERVATION_QUALITY_CONCISENESS_SCORES = [0, 1, 2] as const;
export const OBSERVATION_QUALITY_BOUNDARY_PURITY_RESULTS = [
  "PASS",
  "FAIL_TRANSCRIPTION",
  "FAIL_FIELD_CLASSIFICATION",
  "FAIL_EXPECTED_VALUE_INFERENCE",
  "FAIL_COMPLIANCE_JUDGMENT",
  "FAIL_REGULATORY_CONCLUSION",
  "FAIL_MULTIPLE_BOUNDARIES",
] as const;
export const OBSERVATION_QUALITY_ABSTENTION_ASSESSMENTS = [
  "VALID_ABSTENTION",
  "INVALID_ABSTENTION",
  "UNCERTAIN_ABSTENTION",
  "NOT_APPLICABLE",
] as const;
export const OBSERVATION_QUALITY_HUMAN_DISPOSITIONS = ["ACCEPT", "REVISE", "REJECT"] as const;
export const OBSERVATION_QUALITY_DISPOSITION_REASONS = [
  "GROUNDED_AND_USEFUL",
  "GROUNDING_ERROR",
  "OVERSTATED",
  "TOO_VAGUE",
  "NOT_ACTIONABLE",
  "OCR_DUPLICATION",
  "TRANSCRIPTION",
  "FIELD_CLASSIFICATION",
  "EXPECTED_VALUE_INFERENCE",
  "COMPLIANCE_JUDGMENT",
  "REGULATORY_CONCLUSION",
  "MULTIPLE_OBSERVATIONS",
  "NARRATIVE_DRIFT",
  "VALID_ABSTENTION",
  "MISSED_OBSERVATION_OPPORTUNITY",
  "OTHER_WITH_EXPLANATION",
] as const;
export const OBSERVATION_QUALITY_RECORD_AUTHORITIES = [
  "IMMUTABLE_MACHINE_EVIDENCE",
  "APPEND_ONLY_HUMAN_EVIDENCE",
  "SEALED_UNTIL_UNBLINDING",
  "DERIVED_ANALYSIS",
] as const;
export const OBSERVATION_QUALITY_PRODUCT_GOVERNANCE_OUTCOMES = [
  "A_PRIME_ELIGIBLE_FOR_BROADER_STUDY",
  "A_PRIME_NOT_MATERIALLY_BETTER",
  "A_PRIME_WORSE_THAN_A",
  "INSUFFICIENT_EVIDENCE",
] as const;

export type ObservationQualityResearchContract =
  (typeof OBSERVATION_QUALITY_RESEARCH_CONTRACTS)[number];
export type ObservationQualityAbstentionAppropriateness =
  (typeof OBSERVATION_QUALITY_ABSTENTION_APPROPRIATENESS)[number];
export type ObservationQualityOpportunityState =
  (typeof OBSERVATION_QUALITY_OPPORTUNITY_STATES)[number];
export type ObservationQualityOpportunityTag =
  (typeof OBSERVATION_QUALITY_OPPORTUNITY_TAGS)[number];
export type ObservationQualityEvidenceState = (typeof OBSERVATION_QUALITY_EVIDENCE_STATES)[number];
export type ObservationQualityCompletionState = DecisionClarityCompletionState;
export type ObservationQualityVisibleGroundingScore =
  (typeof OBSERVATION_QUALITY_VISIBLE_GROUNDING_SCORES)[number];
export type ObservationQualitySpecificityScore =
  (typeof OBSERVATION_QUALITY_SPECIFICITY_SCORES)[number];
export type ObservationQualityActionabilityScore =
  (typeof OBSERVATION_QUALITY_ACTIONABILITY_SCORES)[number];
export type ObservationQualityOcrIndependenceScore =
  (typeof OBSERVATION_QUALITY_OCR_INDEPENDENCE_SCORES)[number];
export type ObservationQualityConcisenessScore =
  (typeof OBSERVATION_QUALITY_CONCISENESS_SCORES)[number];
export type ObservationQualityBoundaryPurityResult =
  (typeof OBSERVATION_QUALITY_BOUNDARY_PURITY_RESULTS)[number];
export type ObservationQualityAbstentionAssessment =
  (typeof OBSERVATION_QUALITY_ABSTENTION_ASSESSMENTS)[number];
export type ObservationQualityHumanDisposition =
  (typeof OBSERVATION_QUALITY_HUMAN_DISPOSITIONS)[number];
export type ObservationQualityDispositionReason =
  (typeof OBSERVATION_QUALITY_DISPOSITION_REASONS)[number];
export type ObservationQualityRecordAuthority =
  (typeof OBSERVATION_QUALITY_RECORD_AUTHORITIES)[number];
export type ObservationQualityProductGovernanceOutcome =
  (typeof OBSERVATION_QUALITY_PRODUCT_GOVERNANCE_OUTCOMES)[number];

export type ObservationQualityScorableEvidenceState = Extract<
  ObservationQualityEvidenceState,
  "OBSERVATION_PRESENT" | "VALID_ABSTENTION" | "INVALID_ABSTENTION"
>;

export type ObservationQualityNonScorableEvidenceState = Exclude<
  ObservationQualityEvidenceState,
  ObservationQualityScorableEvidenceState
>;

export interface ObservationQualityValidationSuccess {
  ok: true;
  issues: readonly [];
}

export interface ObservationQualityValidationFailure {
  ok: false;
  issues: readonly string[];
}

export type ObservationQualityValidationResult =
  ObservationQualityValidationSuccess | ObservationQualityValidationFailure;

export interface ObservationQualityBenchmarkArithmetic {
  readonly caseCount: number;
  readonly contractCount: number;
  readonly repetitionsPerContract: number;
  readonly totalTrials: number;
  readonly totalScoredItems: number;
}

export interface ObservationQualityContractPolicy {
  readonly contract: ObservationQualityResearchContract;
  readonly contractPermitsAbstention: boolean;
}

export interface ObservationQualityOpportunityAnnotation {
  readonly sourceCaseId: string;
  readonly state: ObservationQualityOpportunityState;
  readonly tags: readonly ObservationQualityOpportunityTag[];
  readonly note: string | null;
  readonly annotatorId: string;
  readonly annotatedAt: string;
}

export interface ObservationQualityEvidenceStateMetadata {
  readonly receivesDimensionScores: boolean;
  readonly receivesAbstentionScore: boolean;
  readonly countsTowardAvailability: boolean;
  readonly attributableToModelQuality: boolean;
  readonly failsCompleteEvidenceGate: boolean;
  readonly includedInAcceptedRateDenominator: boolean;
}

export interface ObservationQualityCompletionEvidencePair {
  readonly evidenceState: ObservationQualityEvidenceState;
  readonly completionState: ObservationQualityCompletionState;
}

export interface ObservationQualityDispositionRecord {
  readonly humanDisposition: ObservationQualityHumanDisposition;
  readonly dispositionReasons: readonly ObservationQualityDispositionReason[];
  readonly otherReasonExplanation: string | null;
}

export interface ObservationQualityObservationPresentHumanScore extends ObservationQualityDispositionRecord {
  readonly evidenceState: "OBSERVATION_PRESENT";
  readonly completionState: ObservationQualityCompletionState;
  readonly visibleGrounding: ObservationQualityVisibleGroundingScore;
  readonly specificity: ObservationQualitySpecificityScore;
  readonly boundaryPurity: ObservationQualityBoundaryPurityResult;
  readonly actionability: ObservationQualityActionabilityScore;
  readonly ocrIndependence: ObservationQualityOcrIndependenceScore;
  readonly conciseness: ObservationQualityConcisenessScore;
}

export interface ObservationQualityAbstentionHumanScore extends ObservationQualityDispositionRecord {
  readonly evidenceState: "VALID_ABSTENTION" | "INVALID_ABSTENTION";
  readonly completionState: ObservationQualityCompletionState;
  readonly abstentionAssessment: ObservationQualityAbstentionAssessment;
}

export interface ObservationQualityNonScorableHumanRecord {
  readonly evidenceState: ObservationQualityNonScorableEvidenceState;
  readonly completionState: ObservationQualityCompletionState;
  readonly humanDisposition: null;
  readonly dispositionReasons: readonly [];
  readonly otherReasonExplanation: null;
}

export type ObservationQualityHumanScore =
  | ObservationQualityObservationPresentHumanScore
  | ObservationQualityAbstentionHumanScore
  | ObservationQualityNonScorableHumanRecord;

export interface ObservationQualityFieldAuthorityAssignment {
  readonly fieldPath: string;
  readonly authority: ObservationQualityRecordAuthority;
}

export type ObservationQualityFieldAuthorityMap =
  readonly ObservationQualityFieldAuthorityAssignment[];

export interface ObservationQualityCompleteEvidenceGateInput {
  readonly protocolVersionApproved: boolean;
  readonly corpusManifestFrozen: boolean;
  readonly allSourceDigestsMatched: boolean;
  readonly allDerivativeDigestsMatched: boolean;
  readonly aFingerprintMatched: boolean;
  readonly aPrimeFingerprintMatched: boolean;
  readonly allScheduledTrialsRepresented: boolean;
  readonly silentRetryCount: number;
  readonly contractIdentityLeakCount: number;
  readonly allBlindedPacketDigestsReconciled: boolean;
  readonly allRequiredScoresRepresented: boolean;
  readonly allScoresLockedBeforeUnblinding: boolean;
  readonly identityMapReconciliationPassed: boolean;
  readonly infrastructureFailureCount: number;
  readonly provenanceFailureCount: number;
  readonly blockedCount: number;
  readonly notScoredCount: number;
  readonly evidenceOverwriteCount: number;
  readonly opportunityAnnotationsCreatedBeforeOutputReview: boolean;
  readonly challengeTagsFrozenBeforeExecution: boolean;
}

export interface ObservationQualityCompleteEvidenceGateResult {
  readonly satisfied: boolean;
  readonly issues: readonly string[];
}

export const OBSERVATION_QUALITY_CONTRACT_POLICIES = {
  A: {
    contract: "A",
    contractPermitsAbstention: false,
  },
  A_PRIME: {
    contract: "A_PRIME",
    contractPermitsAbstention: true,
  },
} as const satisfies Readonly<
  Record<ObservationQualityResearchContract, ObservationQualityContractPolicy>
>;

export const OBSERVATION_QUALITY_EVIDENCE_STATE_METADATA = {
  OBSERVATION_PRESENT: {
    receivesDimensionScores: true,
    receivesAbstentionScore: false,
    countsTowardAvailability: true,
    attributableToModelQuality: true,
    failsCompleteEvidenceGate: false,
    includedInAcceptedRateDenominator: true,
  },
  VALID_ABSTENTION: {
    receivesDimensionScores: false,
    receivesAbstentionScore: true,
    countsTowardAvailability: true,
    attributableToModelQuality: true,
    failsCompleteEvidenceGate: false,
    includedInAcceptedRateDenominator: true,
  },
  INVALID_ABSTENTION: {
    receivesDimensionScores: false,
    receivesAbstentionScore: true,
    countsTowardAvailability: true,
    attributableToModelQuality: true,
    failsCompleteEvidenceGate: false,
    includedInAcceptedRateDenominator: true,
  },
  NO_COMPLETION: {
    receivesDimensionScores: false,
    receivesAbstentionScore: false,
    countsTowardAvailability: false,
    attributableToModelQuality: true,
    failsCompleteEvidenceGate: false,
    includedInAcceptedRateDenominator: true,
  },
  INVALID_OUTPUT: {
    receivesDimensionScores: false,
    receivesAbstentionScore: false,
    countsTowardAvailability: false,
    attributableToModelQuality: true,
    failsCompleteEvidenceGate: false,
    includedInAcceptedRateDenominator: true,
  },
  INFRASTRUCTURE_FAILURE: {
    receivesDimensionScores: false,
    receivesAbstentionScore: false,
    countsTowardAvailability: false,
    attributableToModelQuality: false,
    failsCompleteEvidenceGate: true,
    includedInAcceptedRateDenominator: false,
  },
  PROVENANCE_FAILURE: {
    receivesDimensionScores: false,
    receivesAbstentionScore: false,
    countsTowardAvailability: false,
    attributableToModelQuality: false,
    failsCompleteEvidenceGate: true,
    includedInAcceptedRateDenominator: false,
  },
  BLOCKED: {
    receivesDimensionScores: false,
    receivesAbstentionScore: false,
    countsTowardAvailability: false,
    attributableToModelQuality: false,
    failsCompleteEvidenceGate: true,
    includedInAcceptedRateDenominator: false,
  },
  NOT_SCORED: {
    receivesDimensionScores: false,
    receivesAbstentionScore: false,
    countsTowardAvailability: false,
    attributableToModelQuality: false,
    failsCompleteEvidenceGate: true,
    includedInAcceptedRateDenominator: false,
  },
} as const satisfies Readonly<
  Record<ObservationQualityEvidenceState, ObservationQualityEvidenceStateMetadata>
>;

const CRITICAL_BOUNDARY_FAILURE_REASONS = new Set<ObservationQualityDispositionReason>([
  "TRANSCRIPTION",
  "FIELD_CLASSIFICATION",
  "EXPECTED_VALUE_INFERENCE",
  "COMPLIANCE_JUDGMENT",
  "REGULATORY_CONCLUSION",
]);

const VALID_OUTPUT_COMPLETION_STATES = new Set<ObservationQualityCompletionState>([
  "TIMELY_VALID_COMPLETION",
  "LATE_VALID_COMPLETION",
]);
const INVALID_OUTPUT_COMPLETION_STATES = new Set<ObservationQualityCompletionState>([
  "TIMELY_INVALID_COMPLETION",
  "LATE_INVALID_COMPLETION",
]);
const INFRASTRUCTURE_COMPLETION_STATES = new Set<ObservationQualityCompletionState>([
  "REQUEST_NOT_SENT",
  "TRANSPORT_FAILURE",
  "PROCESS_FAILURE",
]);

function success(): ObservationQualityValidationSuccess {
  return {
    ok: true,
    issues: [],
  };
}

function failure(issues: string[]): ObservationQualityValidationFailure {
  return {
    ok: false,
    issues,
  };
}

function nonEmptyText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function hasOwnProperty(value: object, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function countIssue(name: string, value: number): string | null {
  if (!Number.isFinite(value) || value < 0) {
    return `${name} must be a finite non-negative number`;
  }
  if (value > 0) {
    return `${name} must be 0, received ${value}`;
  }
  return null;
}

export function isObservationQualityResearchContract(
  value: string,
): value is ObservationQualityResearchContract {
  return (OBSERVATION_QUALITY_RESEARCH_CONTRACTS as readonly string[]).includes(value);
}

export function isObservationQualityOpportunityState(
  value: string,
): value is ObservationQualityOpportunityState {
  return (OBSERVATION_QUALITY_OPPORTUNITY_STATES as readonly string[]).includes(value);
}

export function isObservationQualityOpportunityTag(
  value: string,
): value is ObservationQualityOpportunityTag {
  return (OBSERVATION_QUALITY_OPPORTUNITY_TAGS as readonly string[]).includes(value);
}

export function isObservationQualityEvidenceState(
  value: string,
): value is ObservationQualityEvidenceState {
  return (OBSERVATION_QUALITY_EVIDENCE_STATES as readonly string[]).includes(value);
}

export function isObservationQualityCompletionState(
  value: string,
): value is ObservationQualityCompletionState {
  return (DECISION_CLARITY_COMPLETION_STATES as readonly string[]).includes(value);
}

export function isObservationQualityBoundaryPurityResult(
  value: string,
): value is ObservationQualityBoundaryPurityResult {
  return (OBSERVATION_QUALITY_BOUNDARY_PURITY_RESULTS as readonly string[]).includes(value);
}

export function isObservationQualityAbstentionAssessment(
  value: string,
): value is ObservationQualityAbstentionAssessment {
  return (OBSERVATION_QUALITY_ABSTENTION_ASSESSMENTS as readonly string[]).includes(value);
}

export function isObservationQualityHumanDisposition(
  value: string,
): value is ObservationQualityHumanDisposition {
  return (OBSERVATION_QUALITY_HUMAN_DISPOSITIONS as readonly string[]).includes(value);
}

export function isObservationQualityDispositionReason(
  value: string,
): value is ObservationQualityDispositionReason {
  return (OBSERVATION_QUALITY_DISPOSITION_REASONS as readonly string[]).includes(value);
}

export function observationQualityContractPolicy(
  contract: ObservationQualityResearchContract,
): ObservationQualityContractPolicy {
  return OBSERVATION_QUALITY_CONTRACT_POLICIES[contract];
}

export function observationQualityEvidenceStateMetadata(
  state: ObservationQualityEvidenceState,
): ObservationQualityEvidenceStateMetadata {
  return OBSERVATION_QUALITY_EVIDENCE_STATE_METADATA[state];
}

export function validateObservationQualityBenchmarkArithmetic(
  arithmetic: ObservationQualityBenchmarkArithmetic = {
    caseCount: OBSERVATION_QUALITY_CASE_COUNT,
    contractCount: OBSERVATION_QUALITY_RESEARCH_CONTRACTS.length,
    repetitionsPerContract: OBSERVATION_QUALITY_REPETITIONS_PER_CONTRACT,
    totalTrials: OBSERVATION_QUALITY_TOTAL_TRIALS,
    totalScoredItems: OBSERVATION_QUALITY_TOTAL_SCORED_ITEMS,
  },
): ObservationQualityValidationResult {
  const issues: string[] = [];
  if (!Number.isFinite(arithmetic.caseCount) || arithmetic.caseCount <= 0) {
    issues.push("caseCount must be a finite positive number");
  }
  if (!Number.isFinite(arithmetic.contractCount) || arithmetic.contractCount <= 0) {
    issues.push("contractCount must be a finite positive number");
  }
  if (
    !Number.isFinite(arithmetic.repetitionsPerContract) ||
    arithmetic.repetitionsPerContract <= 0
  ) {
    issues.push("repetitionsPerContract must be a finite positive number");
  }
  if (!Number.isFinite(arithmetic.totalTrials) || arithmetic.totalTrials <= 0) {
    issues.push("totalTrials must be a finite positive number");
  }
  if (!Number.isFinite(arithmetic.totalScoredItems) || arithmetic.totalScoredItems <= 0) {
    issues.push("totalScoredItems must be a finite positive number");
  }
  const expectedTrials =
    arithmetic.caseCount * arithmetic.contractCount * arithmetic.repetitionsPerContract;
  if (expectedTrials !== arithmetic.totalTrials) {
    issues.push(
      `caseCount × contractCount × repetitionsPerContract must equal totalTrials (${expectedTrials} !== ${arithmetic.totalTrials})`,
    );
  }
  if (arithmetic.totalTrials !== arithmetic.totalScoredItems) {
    issues.push(
      `totalTrials must equal totalScoredItems (${arithmetic.totalTrials} !== ${arithmetic.totalScoredItems})`,
    );
  }
  return issues.length === 0 ? success() : failure(issues);
}

export function validateObservationQualityOpportunityAnnotation(
  annotation: ObservationQualityOpportunityAnnotation,
): ObservationQualityValidationResult {
  const issues: string[] = [];
  if (!nonEmptyText(annotation.sourceCaseId)) {
    issues.push("sourceCaseId must be a non-empty string");
  }
  if (!isObservationQualityOpportunityState(annotation.state)) {
    issues.push(`unknown opportunity state: ${String(annotation.state)}`);
  }
  if (!Array.isArray(annotation.tags)) {
    issues.push("tags must be an array");
  } else {
    if (!uniqueValues(annotation.tags)) {
      issues.push("opportunity tags must be unique");
    }
    const invalidTags = annotation.tags.filter((tag) => !isObservationQualityOpportunityTag(tag));
    if (invalidTags.length > 0) {
      issues.push(`unknown opportunity tag(s): ${invalidTags.join(", ")}`);
    }
    if (annotation.tags.includes("OTHER_WITH_NOTE") && !nonEmptyText(annotation.note)) {
      issues.push("OTHER_WITH_NOTE requires a non-empty note");
    }
  }
  if (!nonEmptyText(annotation.annotatorId)) {
    issues.push("annotatorId must be a non-empty string");
  }
  if (!nonEmptyText(annotation.annotatedAt)) {
    issues.push("annotatedAt must be a non-empty string");
  }
  return issues.length === 0 ? success() : failure(issues);
}

export function validateObservationQualityCompletionEvidenceCompatibility(
  pair: ObservationQualityCompletionEvidencePair,
): ObservationQualityValidationResult {
  const issues: string[] = [];
  if (!isObservationQualityEvidenceState(pair.evidenceState)) {
    issues.push(`unknown evidenceState: ${String(pair.evidenceState)}`);
  }
  if (!isObservationQualityCompletionState(pair.completionState)) {
    issues.push(`unknown completionState: ${String(pair.completionState)}`);
  }
  if (issues.length > 0) return failure(issues);

  switch (pair.evidenceState) {
    case "OBSERVATION_PRESENT":
      if (!VALID_OUTPUT_COMPLETION_STATES.has(pair.completionState)) {
        issues.push(
          `OBSERVATION_PRESENT requires a valid attributable completion, received ${pair.completionState}`,
        );
      }
      break;
    case "VALID_ABSTENTION":
    case "INVALID_ABSTENTION":
      if (!VALID_OUTPUT_COMPLETION_STATES.has(pair.completionState)) {
        issues.push(
          `${pair.evidenceState} requires a valid attributable completion, received ${pair.completionState}`,
        );
      }
      break;
    case "NO_COMPLETION":
      if (pair.completionState !== "HARD_NON_COMPLETION") {
        issues.push(`NO_COMPLETION requires HARD_NON_COMPLETION, received ${pair.completionState}`);
      }
      break;
    case "INVALID_OUTPUT":
      if (!INVALID_OUTPUT_COMPLETION_STATES.has(pair.completionState)) {
        issues.push(
          `INVALID_OUTPUT requires an invalid attributable completion, received ${pair.completionState}`,
        );
      }
      break;
    case "INFRASTRUCTURE_FAILURE":
      if (!INFRASTRUCTURE_COMPLETION_STATES.has(pair.completionState)) {
        issues.push(
          `INFRASTRUCTURE_FAILURE requires REQUEST_NOT_SENT, TRANSPORT_FAILURE, or PROCESS_FAILURE, received ${pair.completionState}`,
        );
      }
      break;
    case "PROVENANCE_FAILURE":
      if (pair.completionState !== "PROVENANCE_FAILURE") {
        issues.push(
          `PROVENANCE_FAILURE requires PROVENANCE_FAILURE, received ${pair.completionState}`,
        );
      }
      break;
    case "BLOCKED":
      if (pair.completionState !== "BLOCKED") {
        issues.push(`BLOCKED requires BLOCKED, received ${pair.completionState}`);
      }
      break;
    case "NOT_SCORED":
      if (!VALID_OUTPUT_COMPLETION_STATES.has(pair.completionState)) {
        issues.push(
          `NOT_SCORED requires a valid attributable completion, received ${pair.completionState}`,
        );
      }
      break;
    default: {
      const unreachable: never = pair.evidenceState;
      throw new Error(`unreachable evidence state: ${String(unreachable)}`);
    }
  }

  return issues.length === 0 ? success() : failure(issues);
}

export function isObservationQualityBoundaryPure(
  result: ObservationQualityBoundaryPurityResult,
): boolean {
  return result === "PASS";
}

export function validateObservationQualityDispositionRecord(
  record: ObservationQualityDispositionRecord,
): ObservationQualityValidationResult {
  const issues: string[] = [];
  if (!isObservationQualityHumanDisposition(record.humanDisposition)) {
    issues.push(`unknown humanDisposition: ${String(record.humanDisposition)}`);
  }
  if (!Array.isArray(record.dispositionReasons) || record.dispositionReasons.length === 0) {
    issues.push("at least one disposition reason is required");
  } else {
    if (!uniqueValues(record.dispositionReasons)) {
      issues.push("disposition reasons must be unique");
    }
    const invalidReasons = record.dispositionReasons.filter(
      (reason) => !isObservationQualityDispositionReason(reason),
    );
    if (invalidReasons.length > 0) {
      issues.push(`unknown disposition reason(s): ${invalidReasons.join(", ")}`);
    }
    const hasOther = record.dispositionReasons.includes("OTHER_WITH_EXPLANATION");
    if (hasOther && !nonEmptyText(record.otherReasonExplanation)) {
      issues.push("OTHER_WITH_EXPLANATION requires a non-empty explanation");
    }
    if (!hasOther && record.otherReasonExplanation !== null) {
      issues.push("otherReasonExplanation is allowed only with OTHER_WITH_EXPLANATION");
    }
    if (record.humanDisposition === "ACCEPT") {
      if (
        record.dispositionReasons.some((reason) => CRITICAL_BOUNDARY_FAILURE_REASONS.has(reason))
      ) {
        issues.push("ACCEPT cannot include a critical boundary-failure reason");
      }
      if (record.dispositionReasons.includes("GROUNDING_ERROR")) {
        issues.push("ACCEPT cannot include GROUNDING_ERROR");
      }
      if (record.dispositionReasons.includes("MISSED_OBSERVATION_OPPORTUNITY")) {
        issues.push("ACCEPT cannot include MISSED_OBSERVATION_OPPORTUNITY");
      }
    }
  }
  return issues.length === 0 ? success() : failure(issues);
}

function forbiddenObservationDimensionIssues(record: object): string[] {
  const issues: string[] = [];
  const forbiddenKeys = [
    "visibleGrounding",
    "specificity",
    "boundaryPurity",
    "actionability",
    "ocrIndependence",
    "conciseness",
  ] as const;
  for (const key of forbiddenKeys) {
    if (hasOwnProperty(record, key)) {
      issues.push(`${key} is not allowed for this human-score record`);
    }
  }
  return issues;
}

export function validateObservationQualityHumanScore(
  record: ObservationQualityHumanScore,
): ObservationQualityValidationResult {
  const issues: string[] = [];
  const compatibility = validateObservationQualityCompletionEvidenceCompatibility({
    evidenceState: record.evidenceState,
    completionState: record.completionState,
  });
  if (!compatibility.ok) issues.push(...compatibility.issues);

  switch (record.evidenceState) {
    case "OBSERVATION_PRESENT": {
      const disposition = validateObservationQualityDispositionRecord(record);
      if (!disposition.ok) issues.push(...disposition.issues);
      if (!OBSERVATION_QUALITY_VISIBLE_GROUNDING_SCORES.includes(record.visibleGrounding)) {
        issues.push(`invalid visibleGrounding score: ${String(record.visibleGrounding)}`);
      }
      if (!OBSERVATION_QUALITY_SPECIFICITY_SCORES.includes(record.specificity)) {
        issues.push(`invalid specificity score: ${String(record.specificity)}`);
      }
      if (!isObservationQualityBoundaryPurityResult(record.boundaryPurity)) {
        issues.push(`invalid boundaryPurity result: ${String(record.boundaryPurity)}`);
      }
      if (!OBSERVATION_QUALITY_ACTIONABILITY_SCORES.includes(record.actionability)) {
        issues.push(`invalid actionability score: ${String(record.actionability)}`);
      }
      if (!OBSERVATION_QUALITY_OCR_INDEPENDENCE_SCORES.includes(record.ocrIndependence)) {
        issues.push(`invalid ocrIndependence score: ${String(record.ocrIndependence)}`);
      }
      if (!OBSERVATION_QUALITY_CONCISENESS_SCORES.includes(record.conciseness)) {
        issues.push(`invalid conciseness score: ${String(record.conciseness)}`);
      }
      if (hasOwnProperty(record, "abstentionAssessment")) {
        issues.push("abstentionAssessment is not allowed for OBSERVATION_PRESENT");
      }
      break;
    }
    case "VALID_ABSTENTION":
    case "INVALID_ABSTENTION": {
      const disposition = validateObservationQualityDispositionRecord(record);
      if (!disposition.ok) issues.push(...disposition.issues);
      if (!isObservationQualityAbstentionAssessment(record.abstentionAssessment)) {
        issues.push(`invalid abstentionAssessment: ${String(record.abstentionAssessment)}`);
      }
      issues.push(...forbiddenObservationDimensionIssues(record));
      break;
    }
    case "NO_COMPLETION":
    case "INVALID_OUTPUT":
    case "INFRASTRUCTURE_FAILURE":
    case "PROVENANCE_FAILURE":
    case "BLOCKED":
    case "NOT_SCORED":
      issues.push(...forbiddenObservationDimensionIssues(record));
      if (hasOwnProperty(record, "abstentionAssessment")) {
        issues.push("abstentionAssessment is not allowed for non-scorable records");
      }
      if (record.humanDisposition !== null) {
        issues.push("humanDisposition must be null for non-scorable records");
      }
      if (record.dispositionReasons.length !== 0) {
        issues.push("dispositionReasons must be empty for non-scorable records");
      }
      if (record.otherReasonExplanation !== null) {
        issues.push("otherReasonExplanation must be null for non-scorable records");
      }
      break;
    default: {
      const unreachable: never = record;
      throw new Error(`unreachable human-score record: ${String(unreachable)}`);
    }
  }

  return issues.length === 0 ? success() : failure(issues);
}

export function isHumanAcceptedObservationQualityScore(
  record: ObservationQualityHumanScore,
): boolean {
  const validation = validateObservationQualityHumanScore(record);
  if (!validation.ok) return false;
  if (record.evidenceState !== "OBSERVATION_PRESENT") return false;
  return (
    record.visibleGrounding === 2 &&
    record.specificity >= 1 &&
    isObservationQualityBoundaryPure(record.boundaryPurity) &&
    record.actionability >= 1 &&
    record.ocrIndependence >= 1 &&
    record.conciseness >= 1 &&
    record.humanDisposition === "ACCEPT"
  );
}

export function evaluateObservationQualityCompleteEvidenceGate(
  input: ObservationQualityCompleteEvidenceGateInput,
): ObservationQualityCompleteEvidenceGateResult {
  const issues: string[] = [];

  if (!input.protocolVersionApproved) {
    issues.push("protocolVersionApproved must be true");
  }
  if (!input.corpusManifestFrozen) {
    issues.push("corpusManifestFrozen must be true");
  }
  if (!input.allSourceDigestsMatched) {
    issues.push("allSourceDigestsMatched must be true");
  }
  if (!input.allDerivativeDigestsMatched) {
    issues.push("allDerivativeDigestsMatched must be true");
  }
  if (!input.aFingerprintMatched) {
    issues.push("aFingerprintMatched must be true");
  }
  if (!input.aPrimeFingerprintMatched) {
    issues.push("aPrimeFingerprintMatched must be true");
  }
  if (!input.allScheduledTrialsRepresented) {
    issues.push("allScheduledTrialsRepresented must be true");
  }
  const silentRetryIssue = countIssue("silentRetryCount", input.silentRetryCount);
  if (silentRetryIssue !== null) issues.push(silentRetryIssue);
  const contractLeakIssue = countIssue(
    "contractIdentityLeakCount",
    input.contractIdentityLeakCount,
  );
  if (contractLeakIssue !== null) issues.push(contractLeakIssue);
  if (!input.allBlindedPacketDigestsReconciled) {
    issues.push("allBlindedPacketDigestsReconciled must be true");
  }
  if (!input.allRequiredScoresRepresented) {
    issues.push("allRequiredScoresRepresented must be true");
  }
  if (!input.allScoresLockedBeforeUnblinding) {
    issues.push("allScoresLockedBeforeUnblinding must be true");
  }
  if (!input.identityMapReconciliationPassed) {
    issues.push("identityMapReconciliationPassed must be true");
  }
  const infrastructureIssue = countIssue(
    "infrastructureFailureCount",
    input.infrastructureFailureCount,
  );
  if (infrastructureIssue !== null) issues.push(infrastructureIssue);
  const provenanceIssue = countIssue("provenanceFailureCount", input.provenanceFailureCount);
  if (provenanceIssue !== null) issues.push(provenanceIssue);
  const blockedIssue = countIssue("blockedCount", input.blockedCount);
  if (blockedIssue !== null) issues.push(blockedIssue);
  const notScoredIssue = countIssue("notScoredCount", input.notScoredCount);
  if (notScoredIssue !== null) issues.push(notScoredIssue);
  const overwriteIssue = countIssue("evidenceOverwriteCount", input.evidenceOverwriteCount);
  if (overwriteIssue !== null) issues.push(overwriteIssue);
  if (!input.opportunityAnnotationsCreatedBeforeOutputReview) {
    issues.push("opportunityAnnotationsCreatedBeforeOutputReview must be true");
  }
  if (!input.challengeTagsFrozenBeforeExecution) {
    issues.push("challengeTagsFrozenBeforeExecution must be true");
  }

  return {
    satisfied: issues.length === 0,
    issues,
  };
}
