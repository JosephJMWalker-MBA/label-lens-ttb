import type { CaseReport } from "../eval-report.types";
import { SEMANTIC_REGION_ANNOTATION_SCHEMA_VERSION } from "./annotations";
import { SEMANTIC_REGION_ONTOLOGY_VERSION, type SemanticRegionClass } from "./ontology";
import type {
  SemanticAcquisitionOperation,
  SemanticCandidateStatus,
  SemanticOperationAgreement,
  SemanticProposalSource,
  SemanticSurvivalTrace,
  SemanticTerminalCategory,
} from "./types";

export interface SemanticIdentityBucket {
  count: number;
  caseIds: string[];
  targetIds: string[];
}

export interface SemanticFunnelStage extends SemanticIdentityBucket {
  stage:
    | "annotated_target"
    | "region_proposed"
    | "correct_class_retained"
    | "content_recovered"
    | "object_assembled"
    | "field_candidate_projected"
    | "candidate_survived"
    | "trustworthy_evidence";
}

export interface SemanticOperationRoutingBucket extends SemanticIdentityBucket {
  representativeRecommendedOperation: SemanticAcquisitionOperation;
  contentBearingRecommendedOperation: SemanticAcquisitionOperation;
  actualAcquisitionOperation: SemanticAcquisitionOperation;
  expectedEvaluationOperation: SemanticAcquisitionOperation;
  representativeAgreement: SemanticOperationAgreement;
  contentBearingAgreement: SemanticOperationAgreement;
  actualAgreement: SemanticOperationAgreement;
  recoveredCount: number;
}

export interface SemanticNodeIdentityBucket {
  count: number;
  caseIds: string[];
  nodeIds: string[];
  distinctCaseCount: number;
  totalSystemProposalCount: number;
}

export interface SemanticMatchedProposalCount {
  targetId: string;
  count: number;
}

export interface SemanticProposalMatchingView {
  rule: string;
  optimisticUpperBound: boolean;
  proposalRecall: SemanticIdentityBucket;
  correctClassTop1: SemanticIdentityBucket;
  correctClassTop3: SemanticIdentityBucket;
  matchedProposalCounts: {
    mean: number;
    median: number;
    maximum: number;
    maximumTargetIds: string[];
    byTarget: SemanticMatchedProposalCount[];
  };
}

export interface SemanticOperationDiagnostics {
  representativeAgreement: Record<SemanticOperationAgreement, SemanticIdentityBucket>;
  contentBearingAgreement: Record<SemanticOperationAgreement, SemanticIdentityBucket>;
  actualOperationAgreement: Record<SemanticOperationAgreement, SemanticIdentityBucket>;
  representativeMismatchDespiteSuccessfulRecovery: SemanticIdentityBucket;
  representativeMismatchWithFailedRecovery: SemanticIdentityBucket;
  representativeUnresolvedDespiteSuccessfulRecovery: SemanticIdentityBucket;
  representativeUnresolvedWithFailedRecovery: SemanticIdentityBucket;
  causallySupportedAcquisitionFailure: SemanticIdentityBucket;
  routingMatrix: SemanticOperationRoutingBucket[];
}

export interface SemanticTokenFirstComparisonBucket extends SemanticIdentityBucket {
  tokenFirstFailureClass: string;
  semanticTerminalCategory: SemanticTerminalCategory;
}

export interface SemanticNextExperiment {
  rank: number;
  experiment: string;
  approachA: string;
  approachB: string;
  measurement: string;
  measuredTriggerCount: number;
  targetIds: string[];
}

export interface SemanticRegionSurvivalMetrics {
  ontologyVersion: string;
  annotationSchemaVersion: string;
  annotationCoverage: {
    selectedCaseCount: number;
    targetCount: number;
    brandTargetCount: number;
    alcoholTargetCount: number;
    hardNegativeCount: number;
    panelCount: number;
    hardNegativeClassCounts: Partial<Record<SemanticRegionClass, number>>;
  };
  proposal: {
    proposed: SemanticIdentityBucket;
    notProposed: SemanticIdentityBucket;
    bySource: Partial<Record<SemanticProposalSource, SemanticIdentityBucket>>;
  };
  proposalMatching: {
    permissive: SemanticProposalMatchingView;
    strictRepresentative: SemanticProposalMatchingView;
  };
  classification: {
    top1: SemanticIdentityBucket;
    top3: SemanticIdentityBucket;
    retainedAlternative: SemanticIdentityBucket;
    suppressed: SemanticIdentityBucket;
  };
  operationRouting: SemanticOperationDiagnostics;
  rawSurvival: {
    targetProposed: SemanticIdentityBucket;
    correctClassRetained: SemanticIdentityBucket;
    contentRecovered: SemanticIdentityBucket;
    objectAssembled: SemanticIdentityBucket;
    candidateProjected: SemanticIdentityBucket;
    candidateFiltered: SemanticIdentityBucket;
    candidateSurvived: SemanticIdentityBucket;
    trustworthyEvidence: SemanticIdentityBucket;
  };
  funnel: SemanticFunnelStage[];
  candidateStatus: Record<SemanticCandidateStatus, SemanticIdentityBucket>;
  terminalCategories: Record<SemanticTerminalCategory, SemanticIdentityBucket>;
  falseCertainty: SemanticIdentityBucket;
  unknownBearingProposals: SemanticNodeIdentityBucket;
  conflictingClassificationProposals: SemanticNodeIdentityBucket;
  unattributed: SemanticIdentityBucket;
  tokenFirstComparison: SemanticTokenFirstComparisonBucket[];
  nextExperiments: SemanticNextExperiment[];
}

function identities(traces: SemanticSurvivalTrace[]): SemanticIdentityBucket {
  return {
    count: traces.length,
    caseIds: [...new Set(traces.map((trace) => trace.caseId))].sort(),
    targetIds: traces.map((trace) => trace.targetAnnotationId).sort(),
  };
}

function emptyIdentity(): SemanticIdentityBucket {
  return { count: 0, caseIds: [], targetIds: [] };
}

function identityRecord<T extends string>(keys: readonly T[]): Record<T, SemanticIdentityBucket> {
  return Object.fromEntries(keys.map((key) => [key, emptyIdentity()])) as Record<
    T,
    SemanticIdentityBucket
  >;
}

function funnelStage(
  stage: SemanticFunnelStage["stage"],
  traces: SemanticSurvivalTrace[],
  predicate: (trace: SemanticSurvivalTrace) => boolean,
): SemanticFunnelStage {
  return { stage, ...identities(traces.filter(predicate)) };
}

function agreementBuckets(
  traces: SemanticSurvivalTrace[],
  agreement: (trace: SemanticSurvivalTrace) => SemanticOperationAgreement,
): Record<SemanticOperationAgreement, SemanticIdentityBucket> {
  return {
    agree: identities(traces.filter((trace) => agreement(trace) === "agree")),
    disagree: identities(traces.filter((trace) => agreement(trace) === "disagree")),
    unresolved: identities(traces.filter((trace) => agreement(trace) === "unresolved")),
  };
}

function matchingView(args: {
  traces: SemanticSurvivalTrace[];
  rule: string;
  optimisticUpperBound: boolean;
  proposed: (trace: SemanticSurvivalTrace) => boolean;
  top1: (trace: SemanticSurvivalTrace) => boolean;
  top3: (trace: SemanticSurvivalTrace) => boolean;
  matchedCount: (trace: SemanticSurvivalTrace) => number;
}): SemanticProposalMatchingView {
  const byTarget = args.traces
    .map((trace) => ({
      targetId: trace.targetAnnotationId,
      count: args.matchedCount(trace),
    }))
    .sort((left, right) => left.targetId.localeCompare(right.targetId));
  const counts = byTarget.map((item) => item.count).sort((left, right) => left - right);
  const maximum = counts.at(-1) ?? 0;
  return {
    rule: args.rule,
    optimisticUpperBound: args.optimisticUpperBound,
    proposalRecall: identities(args.traces.filter(args.proposed)),
    correctClassTop1: identities(args.traces.filter(args.top1)),
    correctClassTop3: identities(args.traces.filter(args.top3)),
    matchedProposalCounts: {
      mean: counts.length === 0 ? 0 : counts.reduce((sum, count) => sum + count, 0) / counts.length,
      median: counts.length === 0 ? 0 : counts[Math.floor(counts.length / 2)],
      maximum,
      maximumTargetIds: byTarget
        .filter((item) => item.count === maximum)
        .map((item) => item.targetId),
      byTarget,
    },
  };
}

const CANDIDATE_STATUSES = [
  "selected",
  "alternate",
  "quarantined",
  "filtered",
  "retained",
  "not_projected",
] as const satisfies readonly SemanticCandidateStatus[];

const TERMINAL_CATEGORIES = [
  "target_not_proposed",
  "target_proposed_but_semantically_suppressed",
  "target_class_preserved_wrong_operation",
  "content_not_recovered",
  "object_assembly_failure",
  "field_projection_failure",
  "candidate_filtered",
  "candidate_ranked_below_useful_range",
  "honest_alternate",
  "honest_unresolved",
  "trustworthy_selected_evidence",
  "false_certainty",
  "unattributed",
] as const satisfies readonly SemanticTerminalCategory[];

function buildNextExperiments(
  terminal: Record<SemanticTerminalCategory, SemanticIdentityBucket>,
): SemanticNextExperiment[] {
  const proposals = [
    {
      experiment: "Proposal source",
      approachA: "Existing OCR/candidate regions",
      approachB: "Deterministic image-first connected components",
      measurement: "semantic-object proposal recall at the same proposal budget",
      bucket: terminal.target_not_proposed,
    },
    {
      experiment: "Content acquisition",
      approachA: "Existing generic fixed OCR pass",
      approachB: "Class-specific stylized or numeric OCR in shadow mode",
      measurement: "correct content recovered per operation millisecond",
      bucket: {
        count:
          terminal.content_not_recovered.count +
          terminal.target_class_preserved_wrong_operation.count,
        caseIds: [
          ...new Set([
            ...terminal.content_not_recovered.caseIds,
            ...terminal.target_class_preserved_wrong_operation.caseIds,
          ]),
        ].sort(),
        targetIds: [
          ...terminal.content_not_recovered.targetIds,
          ...terminal.target_class_preserved_wrong_operation.targetIds,
        ].sort(),
      },
    },
    {
      experiment: "Operation routing",
      approachA: "Actual existing acquisition operation",
      approachB: "Independently recommended evaluation operation",
      measurement: "causally supported routing failures at fixed false certainty",
      bucket: terminal.target_class_preserved_wrong_operation,
    },
    {
      experiment: "Object assembly",
      approachA: "Independent OCR lines",
      approachB: "Panel, alignment, adjacency, and continuation relationships",
      measurement: "complete target objects assembled without unsafe text joins",
      bucket: terminal.object_assembly_failure,
    },
    {
      experiment: "Projection timing",
      approachA: "Current token-first filtering",
      approachB: "Region-first provisional classification before field projection",
      measurement: "target candidate projection and suppression at fixed false-certainty count",
      bucket: {
        count:
          terminal.field_projection_failure.count +
          terminal.candidate_filtered.count +
          terminal.target_proposed_but_semantically_suppressed.count,
        caseIds: [
          ...new Set([
            ...terminal.field_projection_failure.caseIds,
            ...terminal.candidate_filtered.caseIds,
            ...terminal.target_proposed_but_semantically_suppressed.caseIds,
          ]),
        ].sort(),
        targetIds: [
          ...terminal.field_projection_failure.targetIds,
          ...terminal.candidate_filtered.targetIds,
          ...terminal.target_proposed_but_semantically_suppressed.targetIds,
        ].sort(),
      },
    },
  ];
  return proposals
    .sort(
      (left, right) =>
        right.bucket.count - left.bucket.count || left.experiment.localeCompare(right.experiment),
    )
    .map((proposal, index) => ({
      rank: index + 1,
      experiment: proposal.experiment,
      approachA: proposal.approachA,
      approachB: proposal.approachB,
      measurement: proposal.measurement,
      measuredTriggerCount: proposal.bucket.count,
      targetIds: proposal.bucket.targetIds,
    }));
}

export function buildSemanticRegionSurvivalMetrics(
  cases: CaseReport[],
): SemanticRegionSurvivalMetrics {
  const semanticCases = cases.filter((caseReport) => caseReport.semanticScene !== undefined);
  const traces = semanticCases.flatMap((caseReport) => caseReport.semanticScene?.traces ?? []);
  const annotations = semanticCases.map((caseReport) => caseReport.semanticScene!.annotation);
  const hardNegatives = annotations.flatMap((annotation) =>
    annotation.objects.filter((object) => object.role === "hard_negative"),
  );
  const hardNegativeClassCounts: Partial<Record<SemanticRegionClass, number>> = {};
  for (const annotation of hardNegatives) {
    hardNegativeClassCounts[annotation.expectedClass] =
      (hardNegativeClassCounts[annotation.expectedClass] ?? 0) + 1;
  }

  const proposalBySource: Partial<Record<SemanticProposalSource, SemanticIdentityBucket>> = {};
  const proposalSources = [...new Set(traces.flatMap((trace) => trace.proposalSources))].sort();
  for (const source of proposalSources) {
    proposalBySource[source] = identities(
      traces.filter((trace) => trace.proposalSources.includes(source)),
    );
  }

  const routing = new Map<string, SemanticSurvivalTrace[]>();
  for (const trace of traces) {
    const key = [
      trace.representativeRecommendedOperation,
      trace.contentBearingRecommendedOperation,
      trace.actualAcquisitionOperation,
      trace.expectedEvaluationOperation,
      trace.representativeOperationAgreement,
      trace.contentBearingOperationAgreement,
      trace.actualOperationAgreement,
    ].join(":");
    routing.set(key, [...(routing.get(key) ?? []), trace]);
  }
  const routingMatrix = [...routing.entries()]
    .map(([key, bucketTraces]) => {
      const [
        representativeRecommendedOperation,
        contentBearingRecommendedOperation,
        actualAcquisitionOperation,
        expectedEvaluationOperation,
        representativeAgreement,
        contentBearingAgreement,
        actualAgreement,
      ] = key.split(":") as [
        SemanticAcquisitionOperation,
        SemanticAcquisitionOperation,
        SemanticAcquisitionOperation,
        SemanticAcquisitionOperation,
        SemanticOperationAgreement,
        SemanticOperationAgreement,
        SemanticOperationAgreement,
      ];
      return {
        representativeRecommendedOperation,
        contentBearingRecommendedOperation,
        actualAcquisitionOperation,
        expectedEvaluationOperation,
        representativeAgreement,
        contentBearingAgreement,
        actualAgreement,
        recoveredCount: bucketTraces.filter((trace) => trace.contentRecovered).length,
        ...identities(bucketTraces),
      };
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.representativeRecommendedOperation.localeCompare(
          right.representativeRecommendedOperation,
        ) ||
        left.contentBearingRecommendedOperation.localeCompare(
          right.contentBearingRecommendedOperation,
        ) ||
        left.actualAcquisitionOperation.localeCompare(right.actualAcquisitionOperation) ||
        left.expectedEvaluationOperation.localeCompare(right.expectedEvaluationOperation),
    );

  const candidateStatus = identityRecord(CANDIDATE_STATUSES);
  for (const status of CANDIDATE_STATUSES) {
    candidateStatus[status] = identities(
      traces.filter((trace) => trace.candidateStatus === status),
    );
  }
  const terminalCategories = identityRecord(TERMINAL_CATEGORIES);
  for (const category of TERMINAL_CATEGORIES) {
    terminalCategories[category] = identities(
      traces.filter((trace) => trace.terminalCategory === category),
    );
  }

  const systemProposalNodes = semanticCases.flatMap((caseReport) =>
    (caseReport.semanticScene?.nodes ?? []).filter(
      (node) => node.evaluationRole === "system_proposal",
    ),
  );
  const unknownNodes = systemProposalNodes.filter((node) =>
    node.classHypotheses.some(
      (hypothesis) =>
        hypothesis.semanticClass === "unknown_text_region" ||
        hypothesis.semanticClass === "unknown_non_text_region",
    ),
  );
  const conflictingNodes = systemProposalNodes.filter((node) =>
    node.classHypotheses.some(
      (hypothesis) => hypothesis.semanticClass === "conflicting_classification",
    ),
  );
  const nodeIdentities = (nodes: typeof unknownNodes): SemanticNodeIdentityBucket => ({
    count: nodes.length,
    caseIds: [...new Set(nodes.map((node) => node.caseId))].sort(),
    nodeIds: nodes.map((node) => node.id).sort(),
    distinctCaseCount: new Set(nodes.map((node) => node.caseId)).size,
    totalSystemProposalCount: systemProposalNodes.length,
  });

  const tokenComparison = new Map<string, SemanticSurvivalTrace[]>();
  for (const trace of traces) {
    const key = `${trace.tokenFirstFailureClass}:${trace.terminalCategory}`;
    tokenComparison.set(key, [...(tokenComparison.get(key) ?? []), trace]);
  }
  const tokenFirstComparison = [...tokenComparison.entries()]
    .map(([key, bucketTraces]) => {
      const separator = key.indexOf(":");
      return {
        tokenFirstFailureClass: key.slice(0, separator),
        semanticTerminalCategory: key.slice(separator + 1) as SemanticTerminalCategory,
        ...identities(bucketTraces),
      };
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.tokenFirstFailureClass.localeCompare(right.tokenFirstFailureClass) ||
        left.semanticTerminalCategory.localeCompare(right.semanticTerminalCategory),
    );

  return {
    ontologyVersion: SEMANTIC_REGION_ONTOLOGY_VERSION,
    annotationSchemaVersion: SEMANTIC_REGION_ANNOTATION_SCHEMA_VERSION,
    annotationCoverage: {
      selectedCaseCount: semanticCases.length,
      targetCount: traces.length,
      brandTargetCount: traces.filter((trace) => trace.field === "brand").length,
      alcoholTargetCount: traces.filter((trace) => trace.field === "alcohol").length,
      hardNegativeCount: hardNegatives.length,
      panelCount: annotations.reduce((sum, annotation) => sum + annotation.panels.length, 0),
      hardNegativeClassCounts,
    },
    proposal: {
      proposed: identities(traces.filter((trace) => trace.targetProposed)),
      notProposed: identities(traces.filter((trace) => !trace.targetProposed)),
      bySource: proposalBySource,
    },
    proposalMatching: {
      permissive: matchingView({
        traces,
        rule: "Any system proposal with target coverage >= 0.08 or proposal center inside the target; success is any-of-all-matched proposals.",
        optimisticUpperBound: true,
        proposed: (trace) => trace.targetProposed,
        top1: (trace) => trace.correctClassTop1,
        top3: (trace) => trace.correctClassTop3,
        matchedCount: (trace) => trace.matchedProposalCount,
      }),
      strictRepresentative: matchingView({
        traces,
        rule: "Exactly one deterministic representative from the permissive match set: greatest target coverage, then proposal-source specificity, then node ID; expected class and expected operation are not selection features.",
        optimisticUpperBound: false,
        proposed: (trace) => trace.strictTargetProposed,
        top1: (trace) => trace.strictCorrectClassTop1,
        top3: (trace) => trace.strictCorrectClassTop3,
        matchedCount: (trace) => Number(trace.strictTargetProposed),
      }),
    },
    classification: {
      top1: identities(traces.filter((trace) => trace.correctClassTop1)),
      top3: identities(traces.filter((trace) => trace.correctClassTop3)),
      retainedAlternative: identities(
        traces.filter((trace) => trace.retainedAlternatives.length > 0),
      ),
      suppressed: identities(traces.filter((trace) => trace.targetIncorrectlySuppressed)),
    },
    operationRouting: {
      representativeAgreement: agreementBuckets(
        traces,
        (trace) => trace.representativeOperationAgreement,
      ),
      contentBearingAgreement: agreementBuckets(
        traces,
        (trace) => trace.contentBearingOperationAgreement,
      ),
      actualOperationAgreement: agreementBuckets(traces, (trace) => trace.actualOperationAgreement),
      representativeMismatchDespiteSuccessfulRecovery: identities(
        traces.filter(
          (trace) =>
            trace.representativeOperationAgreement === "disagree" && trace.contentRecovered,
        ),
      ),
      representativeMismatchWithFailedRecovery: identities(
        traces.filter(
          (trace) =>
            trace.representativeOperationAgreement === "disagree" && !trace.contentRecovered,
        ),
      ),
      representativeUnresolvedDespiteSuccessfulRecovery: identities(
        traces.filter(
          (trace) =>
            trace.representativeOperationAgreement === "unresolved" && trace.contentRecovered,
        ),
      ),
      representativeUnresolvedWithFailedRecovery: identities(
        traces.filter(
          (trace) =>
            trace.representativeOperationAgreement === "unresolved" && !trace.contentRecovered,
        ),
      ),
      causallySupportedAcquisitionFailure: identities(
        traces.filter((trace) => trace.operationFailureCausallySupported),
      ),
      routingMatrix,
    },
    rawSurvival: {
      targetProposed: identities(traces.filter((trace) => trace.targetProposed)),
      correctClassRetained: identities(
        traces.filter((trace) => trace.targetProposed && !trace.targetIncorrectlySuppressed),
      ),
      contentRecovered: identities(traces.filter((trace) => trace.contentRecovered)),
      objectAssembled: identities(traces.filter((trace) => trace.sceneObjectAssembled)),
      candidateProjected: identities(traces.filter((trace) => trace.fieldCandidateProjected)),
      candidateFiltered: identities(traces.filter((trace) => trace.candidateStatus === "filtered")),
      candidateSurvived: identities(
        traces.filter((trace) => !["filtered", "not_projected"].includes(trace.candidateStatus)),
      ),
      trustworthyEvidence: identities(
        traces.filter((trace) => trace.trustworthyDownstreamEvidence),
      ),
    },
    funnel: [
      funnelStage("annotated_target", traces, () => true),
      funnelStage("region_proposed", traces, (trace) => trace.targetProposed),
      funnelStage(
        "correct_class_retained",
        traces,
        (trace) => trace.targetProposed && !trace.targetIncorrectlySuppressed,
      ),
      funnelStage(
        "content_recovered",
        traces,
        (trace) =>
          trace.targetProposed && !trace.targetIncorrectlySuppressed && trace.contentRecovered,
      ),
      funnelStage(
        "object_assembled",
        traces,
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.contentRecovered &&
          trace.sceneObjectAssembled,
      ),
      funnelStage(
        "field_candidate_projected",
        traces,
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.contentRecovered &&
          trace.sceneObjectAssembled &&
          trace.fieldCandidateProjected,
      ),
      funnelStage(
        "candidate_survived",
        traces,
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.contentRecovered &&
          trace.sceneObjectAssembled &&
          trace.fieldCandidateProjected &&
          !["filtered", "not_projected"].includes(trace.candidateStatus),
      ),
      funnelStage(
        "trustworthy_evidence",
        traces,
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.contentRecovered &&
          trace.sceneObjectAssembled &&
          trace.fieldCandidateProjected &&
          !["filtered", "not_projected"].includes(trace.candidateStatus) &&
          trace.trustworthyDownstreamEvidence,
      ),
    ],
    candidateStatus,
    terminalCategories,
    falseCertainty: identities(traces.filter((trace) => trace.falseCertainty)),
    unknownBearingProposals: nodeIdentities(unknownNodes),
    conflictingClassificationProposals: nodeIdentities(conflictingNodes),
    unattributed: terminalCategories.unattributed,
    tokenFirstComparison,
    nextExperiments: buildNextExperiments(terminalCategories),
  };
}
