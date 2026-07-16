import { describe, expect, it } from "vitest";

import {
  OBSERVATION_QUALITY_ABSTENTION_APPROPRIATENESS,
  OBSERVATION_QUALITY_ABSTENTION_ASSESSMENTS,
  OBSERVATION_QUALITY_ACTIONABILITY_SCORES,
  OBSERVATION_QUALITY_AVAILABILITY_TOLERANCE_POINTS,
  OBSERVATION_QUALITY_BENCHMARK_IMPLEMENTATION_STATUS,
  OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION,
  OBSERVATION_QUALITY_BOUNDARY_PURITY_RESULTS,
  OBSERVATION_QUALITY_CASE_COUNT,
  OBSERVATION_QUALITY_CHALLENGE_SLICE_PROTECTION_POINTS,
  OBSERVATION_QUALITY_CONCISENESS_SCORES,
  OBSERVATION_QUALITY_CONTRACT_POLICIES,
  OBSERVATION_QUALITY_DISPOSITION_REASONS,
  OBSERVATION_QUALITY_EVIDENCE_STATE_METADATA,
  OBSERVATION_QUALITY_EVIDENCE_STATES,
  OBSERVATION_QUALITY_HUMAN_DISPOSITIONS,
  OBSERVATION_QUALITY_MATERIAL_IMPROVEMENT_POINTS,
  OBSERVATION_QUALITY_MATERIAL_REGRESSION_POINTS,
  OBSERVATION_QUALITY_OCR_INDEPENDENCE_SCORES,
  OBSERVATION_QUALITY_OPPORTUNITY_STATES,
  OBSERVATION_QUALITY_OPPORTUNITY_TAGS,
  OBSERVATION_QUALITY_PRIMARY_REVIEWER_COUNT,
  OBSERVATION_QUALITY_PRODUCT_GOVERNANCE_OUTCOMES,
  OBSERVATION_QUALITY_RECORD_AUTHORITIES,
  OBSERVATION_QUALITY_REPEAT_SCORING_PERCENT,
  OBSERVATION_QUALITY_REPETITIONS_PER_CONTRACT,
  OBSERVATION_QUALITY_RESEARCH_CONTRACTS,
  OBSERVATION_QUALITY_SPECIFICITY_SCORES,
  OBSERVATION_QUALITY_TOTAL_SCORED_ITEMS,
  OBSERVATION_QUALITY_TOTAL_TRIALS,
  OBSERVATION_QUALITY_VISIBLE_GROUNDING_SCORES,
  evaluateObservationQualityCompleteEvidenceGate,
  isHumanAcceptedObservationQualityScore,
  isObservationQualityBoundaryPure,
  isObservationQualityResearchContract,
  observationQualityContractPolicy,
  observationQualityEvidenceStateMetadata,
  productionPromptChangeAuthorized,
  realExecutionAuthorized,
  validateObservationQualityBenchmarkArithmetic,
  validateObservationQualityCompletionEvidenceCompatibility,
  validateObservationQualityDispositionRecord,
  validateObservationQualityHumanScore,
  validateObservationQualityOpportunityAnnotation,
  type ObservationQualityAbstentionHumanScore,
  type ObservationQualityCompleteEvidenceGateInput,
  type ObservationQualityCompletionEvidencePair,
  type ObservationQualityNonScorableHumanRecord,
  type ObservationQualityObservationPresentHumanScore,
  type ObservationQualityOpportunityAnnotation,
  type ObservationQualityResearchContract,
} from "./observation-quality-benchmark-protocol";

function expectOpportunityAnnotation(_value: ObservationQualityOpportunityAnnotation): void {
  void _value;
}

function expectObservationRecord(_value: ObservationQualityObservationPresentHumanScore): void {
  void _value;
}

function expectAbstentionRecord(_value: ObservationQualityAbstentionHumanScore): void {
  void _value;
}

function expectNonScorableRecord(_value: ObservationQualityNonScorableHumanRecord): void {
  void _value;
}

function expectResearchContract(_value: ObservationQualityResearchContract): void {
  void _value;
}

expectOpportunityAnnotation({
  sourceCaseId: "case-001",
  state: "OBSERVATION_OPPORTUNITY_PRESENT",
  tags: ["LOW_CONTRAST"],
  note: null,
  annotatorId: "annotator-1",
  annotatedAt: "2026-07-16T00:00:00Z",
});

expectOpportunityAnnotation({
  sourceCaseId: "case-001",
  state: "OBSERVATION_OPPORTUNITY_PRESENT",
  tags: ["LOW_CONTRAST"],
  note: null,
  annotatorId: "annotator-1",
  annotatedAt: "2026-07-16T00:00:00Z",
  // @ts-expect-error contract identity is outside the Slice 1 annotation surface
  contract: "A",
});

expectOpportunityAnnotation({
  sourceCaseId: "case-001",
  state: "OBSERVATION_OPPORTUNITY_PRESENT",
  tags: ["LOW_CONTRAST"],
  note: null,
  annotatorId: "annotator-1",
  annotatedAt: "2026-07-16T00:00:00Z",
  // @ts-expect-error OCR text is outside the Slice 1 annotation surface
  ocrText: "added text",
});

expectObservationRecord({
  evidenceState: "OBSERVATION_PRESENT",
  completionState: "TIMELY_VALID_COMPLETION",
  visibleGrounding: 2,
  specificity: 1,
  boundaryPurity: "PASS",
  actionability: 1,
  ocrIndependence: 1,
  conciseness: 1,
  humanDisposition: "ACCEPT",
  dispositionReasons: ["GROUNDED_AND_USEFUL"],
  otherReasonExplanation: null,
});

// @ts-expect-error observation-present scores require all six quality dimensions
expectObservationRecord({
  evidenceState: "OBSERVATION_PRESENT",
  completionState: "TIMELY_VALID_COMPLETION",
  visibleGrounding: 2,
  specificity: 1,
  boundaryPurity: "PASS",
  actionability: 1,
  ocrIndependence: 1,
  humanDisposition: "ACCEPT",
  dispositionReasons: ["GROUNDED_AND_USEFUL"],
  otherReasonExplanation: null,
});

expectAbstentionRecord({
  evidenceState: "VALID_ABSTENTION",
  completionState: "TIMELY_VALID_COMPLETION",
  abstentionAssessment: "VALID_ABSTENTION",
  // @ts-expect-error abstention records do not accept observation dimensions
  visibleGrounding: 2,
  humanDisposition: "REVISE",
  dispositionReasons: ["VALID_ABSTENTION"],
  otherReasonExplanation: null,
});

expectNonScorableRecord({
  evidenceState: "NO_COMPLETION",
  completionState: "HARD_NON_COMPLETION",
  // @ts-expect-error non-scorable records do not accept quality dimensions
  visibleGrounding: 2,
  humanDisposition: null,
  dispositionReasons: [],
  otherReasonExplanation: null,
});

// @ts-expect-error only A and A_PRIME are approved research contracts
expectResearchContract("B");

const validOpportunityAnnotation: ObservationQualityOpportunityAnnotation = {
  sourceCaseId: "case-001",
  state: "OBSERVATION_OPPORTUNITY_PRESENT",
  tags: ["LOW_CONTRAST", "ROTATED_PANEL"],
  note: null,
  annotatorId: "annotator-1",
  annotatedAt: "2026-07-16T00:00:00Z",
};

const validObservationRecord: ObservationQualityObservationPresentHumanScore = {
  evidenceState: "OBSERVATION_PRESENT",
  completionState: "TIMELY_VALID_COMPLETION",
  visibleGrounding: 2,
  specificity: 1,
  boundaryPurity: "PASS",
  actionability: 1,
  ocrIndependence: 1,
  conciseness: 1,
  humanDisposition: "ACCEPT",
  dispositionReasons: ["GROUNDED_AND_USEFUL"],
  otherReasonExplanation: null,
};

const validAbstentionRecord: ObservationQualityAbstentionHumanScore = {
  evidenceState: "VALID_ABSTENTION",
  completionState: "TIMELY_VALID_COMPLETION",
  abstentionAssessment: "VALID_ABSTENTION",
  humanDisposition: "REVISE",
  dispositionReasons: ["VALID_ABSTENTION"],
  otherReasonExplanation: null,
};

const validNonScorableRecord: ObservationQualityNonScorableHumanRecord = {
  evidenceState: "NO_COMPLETION",
  completionState: "HARD_NON_COMPLETION",
  humanDisposition: null,
  dispositionReasons: [],
  otherReasonExplanation: null,
};

const validGateInput: ObservationQualityCompleteEvidenceGateInput = {
  protocolVersionApproved: true,
  corpusManifestFrozen: true,
  allSourceDigestsMatched: true,
  allDerivativeDigestsMatched: true,
  aFingerprintMatched: true,
  aPrimeFingerprintMatched: true,
  allScheduledTrialsRepresented: true,
  silentRetryCount: 0,
  contractIdentityLeakCount: 0,
  allBlindedPacketDigestsReconciled: true,
  allRequiredScoresRepresented: true,
  allScoresLockedBeforeUnblinding: true,
  identityMapReconciliationPassed: true,
  infrastructureFailureCount: 0,
  provenanceFailureCount: 0,
  blockedCount: 0,
  notScoredCount: 0,
  evidenceOverwriteCount: 0,
  opportunityAnnotationsCreatedBeforeOutputReview: true,
  challengeTagsFrozenBeforeExecution: true,
};

describe("observation-quality benchmark protocol", () => {
  describe("protocol constants", () => {
    it("encodes the approved protocol identity and bounds", () => {
      expect(OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION).toBe(
        "local-vlm-observation-quality-benchmark.v1",
      );
      expect(OBSERVATION_QUALITY_BENCHMARK_IMPLEMENTATION_STATUS).toBe("SLICE_1_TYPES_ONLY");
      expect(realExecutionAuthorized).toBe(false);
      expect(productionPromptChangeAuthorized).toBe(false);
      expect(OBSERVATION_QUALITY_CASE_COUNT).toBe(16);
      expect(OBSERVATION_QUALITY_RESEARCH_CONTRACTS.length).toBe(2);
      expect(OBSERVATION_QUALITY_REPETITIONS_PER_CONTRACT).toBe(2);
      expect(OBSERVATION_QUALITY_TOTAL_TRIALS).toBe(64);
      expect(OBSERVATION_QUALITY_TOTAL_SCORED_ITEMS).toBe(64);
      expect(OBSERVATION_QUALITY_PRIMARY_REVIEWER_COUNT).toBe(1);
      expect(OBSERVATION_QUALITY_REPEAT_SCORING_PERCENT).toBe(20);
      expect(OBSERVATION_QUALITY_MATERIAL_IMPROVEMENT_POINTS).toBe(15);
      expect(OBSERVATION_QUALITY_MATERIAL_REGRESSION_POINTS).toBe(10);
      expect(OBSERVATION_QUALITY_CHALLENGE_SLICE_PROTECTION_POINTS).toBe(20);
      expect(OBSERVATION_QUALITY_AVAILABILITY_TOLERANCE_POINTS).toBe(5);
      expect(validateObservationQualityBenchmarkArithmetic()).toEqual({
        ok: true,
        issues: [],
      });
    });

    it("fails loudly when arithmetic consistency is broken", () => {
      expect(
        validateObservationQualityBenchmarkArithmetic({
          caseCount: 16,
          contractCount: 2,
          repetitionsPerContract: 2,
          totalTrials: 63,
          totalScoredItems: 64,
        }),
      ).toEqual({
        ok: false,
        issues: [
          "caseCount × contractCount × repetitionsPerContract must equal totalTrials (64 !== 63)",
          "totalTrials must equal totalScoredItems (63 !== 64)",
        ],
      });
    });
  });

  describe("contract policy", () => {
    it("encodes the approved abstention asymmetry", () => {
      expect(observationQualityContractPolicy("A").contractPermitsAbstention).toBe(false);
      expect(observationQualityContractPolicy("A_PRIME").contractPermitsAbstention).toBe(true);
      expect(OBSERVATION_QUALITY_CONTRACT_POLICIES).toEqual({
        A: {
          contract: "A",
          contractPermitsAbstention: false,
        },
        A_PRIME: {
          contract: "A_PRIME",
          contractPermitsAbstention: true,
        },
      });
      expect(Object.keys(OBSERVATION_QUALITY_CONTRACT_POLICIES)).toHaveLength(
        OBSERVATION_QUALITY_RESEARCH_CONTRACTS.length,
      );
    });

    it("rejects unknown contracts at the guard boundary", () => {
      expect(isObservationQualityResearchContract("A")).toBe(true);
      expect(isObservationQualityResearchContract("A_PRIME")).toBe(true);
      expect(isObservationQualityResearchContract("B")).toBe(false);
    });
  });

  describe("observation opportunity", () => {
    it("represents the approved states and tags", () => {
      expect(OBSERVATION_QUALITY_OPPORTUNITY_STATES).toEqual([
        "OBSERVATION_OPPORTUNITY_PRESENT",
        "NO_CLEAR_OBSERVATION_OPPORTUNITY",
        "UNCERTAIN",
      ]);
      expect(OBSERVATION_QUALITY_OPPORTUNITY_TAGS).toEqual([
        "LOW_CONTRAST",
        "ROTATED_PANEL",
        "DENSE_TEXT_CLUSTER",
        "DECORATIVE_TYPE",
        "MULTI_PANEL_LAYOUT",
        "SMALL_STATEMENT",
        "MULTIPLE_COMPETING_TEXT_CLUSTERS",
        "NO_CLEAR_SINGLE_TARGET",
        "OTHER_WITH_NOTE",
      ]);
      expect(validateObservationQualityOpportunityAnnotation(validOpportunityAnnotation)).toEqual({
        ok: true,
        issues: [],
      });
    });

    it("requires a note for OTHER_WITH_NOTE and rejects duplicates", () => {
      expect(
        validateObservationQualityOpportunityAnnotation({
          ...validOpportunityAnnotation,
          tags: ["OTHER_WITH_NOTE"],
          note: null,
        }),
      ).toEqual({
        ok: false,
        issues: ["OTHER_WITH_NOTE requires a non-empty note"],
      });

      expect(
        validateObservationQualityOpportunityAnnotation({
          ...validOpportunityAnnotation,
          tags: ["LOW_CONTRAST", "LOW_CONTRAST"],
        }),
      ).toEqual({
        ok: false,
        issues: ["opportunity tags must be unique"],
      });
    });
  });

  describe("evidence-state metadata", () => {
    it("covers all nine states with the approved semantics", () => {
      expect(OBSERVATION_QUALITY_EVIDENCE_STATES).toHaveLength(9);
      expect(new Set(OBSERVATION_QUALITY_EVIDENCE_STATES)).toHaveProperty("size", 9);
      expect(OBSERVATION_QUALITY_EVIDENCE_STATE_METADATA).toMatchObject({
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
      });
      expect(
        observationQualityEvidenceStateMetadata("NO_COMPLETION").includedInAcceptedRateDenominator,
      ).toBe(true);
      expect(
        observationQualityEvidenceStateMetadata("INVALID_OUTPUT").includedInAcceptedRateDenominator,
      ).toBe(true);
      expect(
        observationQualityEvidenceStateMetadata("INFRASTRUCTURE_FAILURE")
          .attributableToModelQuality,
      ).toBe(false);
      expect(
        observationQualityEvidenceStateMetadata("INFRASTRUCTURE_FAILURE").failsCompleteEvidenceGate,
      ).toBe(true);
      expect(
        observationQualityEvidenceStateMetadata("PROVENANCE_FAILURE").failsCompleteEvidenceGate,
      ).toBe(true);
      expect(observationQualityEvidenceStateMetadata("BLOCKED").failsCompleteEvidenceGate).toBe(
        true,
      );
      expect(observationQualityEvidenceStateMetadata("NOT_SCORED").failsCompleteEvidenceGate).toBe(
        true,
      );
    });
  });

  describe("completion and evidence compatibility", () => {
    it("accepts the valid combinations used by the protocol", () => {
      const validPairs: ObservationQualityCompletionEvidencePair[] = [
        {
          evidenceState: "OBSERVATION_PRESENT",
          completionState: "TIMELY_VALID_COMPLETION",
        },
        {
          evidenceState: "VALID_ABSTENTION",
          completionState: "LATE_VALID_COMPLETION",
        },
        {
          evidenceState: "INVALID_ABSTENTION",
          completionState: "TIMELY_VALID_COMPLETION",
        },
        {
          evidenceState: "NO_COMPLETION",
          completionState: "HARD_NON_COMPLETION",
        },
        {
          evidenceState: "INVALID_OUTPUT",
          completionState: "TIMELY_INVALID_COMPLETION",
        },
        {
          evidenceState: "INFRASTRUCTURE_FAILURE",
          completionState: "TRANSPORT_FAILURE",
        },
        {
          evidenceState: "PROVENANCE_FAILURE",
          completionState: "PROVENANCE_FAILURE",
        },
        {
          evidenceState: "BLOCKED",
          completionState: "BLOCKED",
        },
        {
          evidenceState: "NOT_SCORED",
          completionState: "LATE_VALID_COMPLETION",
        },
      ];

      for (const pair of validPairs) {
        expect(validateObservationQualityCompletionEvidenceCompatibility(pair)).toEqual({
          ok: true,
          issues: [],
        });
      }
    });

    it("rejects semantically impossible combinations", () => {
      expect(
        validateObservationQualityCompletionEvidenceCompatibility({
          evidenceState: "OBSERVATION_PRESENT",
          completionState: "TRANSPORT_FAILURE",
        }),
      ).toEqual({
        ok: false,
        issues: [
          "OBSERVATION_PRESENT requires a valid attributable completion, received TRANSPORT_FAILURE",
        ],
      });

      expect(
        validateObservationQualityCompletionEvidenceCompatibility({
          evidenceState: "VALID_ABSTENTION",
          completionState: "PROCESS_FAILURE",
        }),
      ).toEqual({
        ok: false,
        issues: [
          "VALID_ABSTENTION requires a valid attributable completion, received PROCESS_FAILURE",
        ],
      });

      expect(
        validateObservationQualityCompletionEvidenceCompatibility({
          evidenceState: "INFRASTRUCTURE_FAILURE",
          completionState: "TIMELY_VALID_COMPLETION",
        }),
      ).toEqual({
        ok: false,
        issues: [
          "INFRASTRUCTURE_FAILURE requires REQUEST_NOT_SENT, TRANSPORT_FAILURE, or PROCESS_FAILURE, received TIMELY_VALID_COMPLETION",
        ],
      });

      expect(
        validateObservationQualityCompletionEvidenceCompatibility({
          evidenceState: "PROVENANCE_FAILURE",
          completionState: "LATE_VALID_COMPLETION",
        }),
      ).toEqual({
        ok: false,
        issues: ["PROVENANCE_FAILURE requires PROVENANCE_FAILURE, received LATE_VALID_COMPLETION"],
      });

      expect(
        validateObservationQualityCompletionEvidenceCompatibility({
          evidenceState: "BLOCKED",
          completionState: "HARD_NON_COMPLETION",
        }),
      ).toEqual({
        ok: false,
        issues: ["BLOCKED requires BLOCKED, received HARD_NON_COMPLETION"],
      });
    });
  });

  describe("boundary purity", () => {
    it("treats PASS as the only pure boundary outcome", () => {
      expect(isObservationQualityBoundaryPure("PASS")).toBe(true);
      for (const result of OBSERVATION_QUALITY_BOUNDARY_PURITY_RESULTS) {
        if (result === "PASS") continue;
        expect(isObservationQualityBoundaryPure(result)).toBe(false);
      }
    });
  });

  describe("disposition validation", () => {
    it("requires at least one unique reason", () => {
      expect(
        validateObservationQualityDispositionRecord({
          humanDisposition: "REJECT",
          dispositionReasons: [],
          otherReasonExplanation: null,
        }),
      ).toEqual({
        ok: false,
        issues: ["at least one disposition reason is required"],
      });

      expect(
        validateObservationQualityDispositionRecord({
          humanDisposition: "REJECT",
          dispositionReasons: ["TOO_VAGUE", "TOO_VAGUE"],
          otherReasonExplanation: null,
        }),
      ).toEqual({
        ok: false,
        issues: ["disposition reasons must be unique"],
      });
    });

    it("applies the explicit OTHER_WITH_EXPLANATION rule", () => {
      expect(
        validateObservationQualityDispositionRecord({
          humanDisposition: "REVISE",
          dispositionReasons: ["OTHER_WITH_EXPLANATION"],
          otherReasonExplanation: null,
        }),
      ).toEqual({
        ok: false,
        issues: ["OTHER_WITH_EXPLANATION requires a non-empty explanation"],
      });

      expect(
        validateObservationQualityDispositionRecord({
          humanDisposition: "REVISE",
          dispositionReasons: ["TOO_VAGUE"],
          otherReasonExplanation: "extra note",
        }),
      ).toEqual({
        ok: false,
        issues: ["otherReasonExplanation is allowed only with OTHER_WITH_EXPLANATION"],
      });
    });

    it("rejects impossible ACCEPT combinations", () => {
      expect(
        validateObservationQualityDispositionRecord({
          humanDisposition: "ACCEPT",
          dispositionReasons: ["TRANSCRIPTION"],
          otherReasonExplanation: null,
        }),
      ).toEqual({
        ok: false,
        issues: ["ACCEPT cannot include a critical boundary-failure reason"],
      });

      expect(
        validateObservationQualityDispositionRecord({
          humanDisposition: "ACCEPT",
          dispositionReasons: ["GROUNDING_ERROR"],
          otherReasonExplanation: null,
        }),
      ).toEqual({
        ok: false,
        issues: ["ACCEPT cannot include GROUNDING_ERROR"],
      });

      expect(
        validateObservationQualityDispositionRecord({
          humanDisposition: "ACCEPT",
          dispositionReasons: ["MISSED_OBSERVATION_OPPORTUNITY"],
          otherReasonExplanation: null,
        }),
      ).toEqual({
        ok: false,
        issues: ["ACCEPT cannot include MISSED_OBSERVATION_OPPORTUNITY"],
      });
    });
  });

  describe("human score validation", () => {
    it("accepts the valid score union variants", () => {
      expect(validateObservationQualityHumanScore(validObservationRecord)).toEqual({
        ok: true,
        issues: [],
      });
      expect(validateObservationQualityHumanScore(validAbstentionRecord)).toEqual({
        ok: true,
        issues: [],
      });
      expect(validateObservationQualityHumanScore(validNonScorableRecord)).toEqual({
        ok: true,
        issues: [],
      });
    });

    it("rejects invalid runtime score content", () => {
      expect(
        validateObservationQualityHumanScore({
          ...validObservationRecord,
          visibleGrounding: 3,
        } as unknown as ObservationQualityObservationPresentHumanScore),
      ).toEqual({
        ok: false,
        issues: ["invalid visibleGrounding score: 3"],
      });

      expect(
        validateObservationQualityHumanScore({
          ...validAbstentionRecord,
          abstentionAssessment: "UNKNOWN",
        } as unknown as ObservationQualityAbstentionHumanScore),
      ).toEqual({
        ok: false,
        issues: ["invalid abstentionAssessment: UNKNOWN"],
      });

      expect(
        validateObservationQualityHumanScore({
          ...validNonScorableRecord,
          humanDisposition: "REJECT",
          dispositionReasons: ["TOO_VAGUE"],
        } as unknown as ObservationQualityNonScorableHumanRecord),
      ).toEqual({
        ok: false,
        issues: [
          "humanDisposition must be null for non-scorable records",
          "dispositionReasons must be empty for non-scorable records",
        ],
      });
    });
  });

  describe("human acceptance helper", () => {
    it("returns true only for the approved acceptance baseline", () => {
      expect(isHumanAcceptedObservationQualityScore(validObservationRecord)).toBe(true);
      expect(
        isHumanAcceptedObservationQualityScore({
          ...validObservationRecord,
          visibleGrounding: 1,
        }),
      ).toBe(false);
      expect(
        isHumanAcceptedObservationQualityScore({
          ...validObservationRecord,
          boundaryPurity: "FAIL_TRANSCRIPTION",
        }),
      ).toBe(false);
      expect(
        isHumanAcceptedObservationQualityScore({
          ...validObservationRecord,
          humanDisposition: "REVISE",
        }),
      ).toBe(false);
      expect(isHumanAcceptedObservationQualityScore(validAbstentionRecord)).toBe(false);
      expect(isHumanAcceptedObservationQualityScore(validNonScorableRecord)).toBe(false);
    });
  });

  describe("complete-evidence gate", () => {
    it("passes for fully valid evidence and is deterministic", () => {
      const first = evaluateObservationQualityCompleteEvidenceGate(validGateInput);
      const second = evaluateObservationQualityCompleteEvidenceGate(validGateInput);

      expect(first).toEqual({
        satisfied: true,
        issues: [],
      });
      expect(second).toEqual(first);
    });

    it("fails each individual gate mechanism explicitly", () => {
      const booleanFailures = [
        ["protocolVersionApproved", "protocolVersionApproved must be true"],
        ["corpusManifestFrozen", "corpusManifestFrozen must be true"],
        ["allSourceDigestsMatched", "allSourceDigestsMatched must be true"],
        ["allDerivativeDigestsMatched", "allDerivativeDigestsMatched must be true"],
        ["aFingerprintMatched", "aFingerprintMatched must be true"],
        ["aPrimeFingerprintMatched", "aPrimeFingerprintMatched must be true"],
        ["allScheduledTrialsRepresented", "allScheduledTrialsRepresented must be true"],
        ["allBlindedPacketDigestsReconciled", "allBlindedPacketDigestsReconciled must be true"],
        ["allRequiredScoresRepresented", "allRequiredScoresRepresented must be true"],
        ["allScoresLockedBeforeUnblinding", "allScoresLockedBeforeUnblinding must be true"],
        ["identityMapReconciliationPassed", "identityMapReconciliationPassed must be true"],
        [
          "opportunityAnnotationsCreatedBeforeOutputReview",
          "opportunityAnnotationsCreatedBeforeOutputReview must be true",
        ],
        ["challengeTagsFrozenBeforeExecution", "challengeTagsFrozenBeforeExecution must be true"],
      ] as const;

      for (const [key, issue] of booleanFailures) {
        expect(
          evaluateObservationQualityCompleteEvidenceGate({
            ...validGateInput,
            [key]: false,
          }),
        ).toEqual({
          satisfied: false,
          issues: [issue],
        });
      }

      const countFailures = [
        ["silentRetryCount", "silentRetryCount must be 0, received 1"],
        ["contractIdentityLeakCount", "contractIdentityLeakCount must be 0, received 1"],
        ["infrastructureFailureCount", "infrastructureFailureCount must be 0, received 1"],
        ["provenanceFailureCount", "provenanceFailureCount must be 0, received 1"],
        ["blockedCount", "blockedCount must be 0, received 1"],
        ["notScoredCount", "notScoredCount must be 0, received 1"],
        ["evidenceOverwriteCount", "evidenceOverwriteCount must be 0, received 1"],
      ] as const;

      for (const [key, issue] of countFailures) {
        expect(
          evaluateObservationQualityCompleteEvidenceGate({
            ...validGateInput,
            [key]: 1,
          }),
        ).toEqual({
          satisfied: false,
          issues: [issue],
        });
      }
    });

    it("surfaces multiple issues together", () => {
      expect(
        evaluateObservationQualityCompleteEvidenceGate({
          ...validGateInput,
          protocolVersionApproved: false,
          contractIdentityLeakCount: 2,
          blockedCount: 1,
        }),
      ).toEqual({
        satisfied: false,
        issues: [
          "protocolVersionApproved must be true",
          "contractIdentityLeakCount must be 0, received 2",
          "blockedCount must be 0, received 1",
        ],
      });
    });
  });

  describe("governed vocabularies", () => {
    it("retains the approved discrete vocabularies for later slices", () => {
      expect(OBSERVATION_QUALITY_ABSTENTION_APPROPRIATENESS).toEqual([
        "ABSTENTION_APPROPRIATE",
        "ABSTENTION_INAPPROPRIATE",
        "ABSTENTION_APPROPRIATENESS_UNCERTAIN",
        "NOT_APPLICABLE",
      ]);
      expect(OBSERVATION_QUALITY_ABSTENTION_ASSESSMENTS).toEqual([
        "VALID_ABSTENTION",
        "INVALID_ABSTENTION",
        "UNCERTAIN_ABSTENTION",
        "NOT_APPLICABLE",
      ]);
      expect(OBSERVATION_QUALITY_HUMAN_DISPOSITIONS).toEqual(["ACCEPT", "REVISE", "REJECT"]);
      expect(OBSERVATION_QUALITY_DISPOSITION_REASONS).toContain("OTHER_WITH_EXPLANATION");
      expect(OBSERVATION_QUALITY_VISIBLE_GROUNDING_SCORES).toEqual([0, 1, 2]);
      expect(OBSERVATION_QUALITY_SPECIFICITY_SCORES).toEqual([0, 1, 2]);
      expect(OBSERVATION_QUALITY_ACTIONABILITY_SCORES).toEqual([0, 1, 2]);
      expect(OBSERVATION_QUALITY_OCR_INDEPENDENCE_SCORES).toEqual([0, 1, 2]);
      expect(OBSERVATION_QUALITY_CONCISENESS_SCORES).toEqual([0, 1, 2]);
      expect(OBSERVATION_QUALITY_RECORD_AUTHORITIES).toEqual([
        "IMMUTABLE_MACHINE_EVIDENCE",
        "APPEND_ONLY_HUMAN_EVIDENCE",
        "SEALED_UNTIL_UNBLINDING",
        "DERIVED_ANALYSIS",
      ]);
      expect(OBSERVATION_QUALITY_PRODUCT_GOVERNANCE_OUTCOMES).toEqual([
        "A_PRIME_ELIGIBLE_FOR_BROADER_STUDY",
        "A_PRIME_NOT_MATERIALLY_BETTER",
        "A_PRIME_WORSE_THAN_A",
        "INSUFFICIENT_EVIDENCE",
      ]);
    });
  });
});
