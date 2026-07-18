import type { CaseReport } from "../eval-report.types";
import { SEMANTIC_REGION_ANNOTATION_SCHEMA_VERSION } from "./annotations";
import { SEMANTIC_REGION_ONTOLOGY_VERSION, type SemanticRegionClass } from "./ontology";
import type {
  SemanticAcquisitionOperation,
  SemanticCandidateStatus,
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
    | "appropriate_operation"
    | "content_recovered"
    | "object_assembled"
    | "field_candidate_projected"
    | "candidate_survived"
    | "trustworthy_evidence";
}

export interface SemanticOperationRoutingBucket extends SemanticIdentityBucket {
  recommendedOperation: SemanticAcquisitionOperation;
  actualOperation: SemanticAcquisitionOperation;
  appropriateCount: number;
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
  classification: {
    top1: SemanticIdentityBucket;
    top3: SemanticIdentityBucket;
    retainedAlternative: SemanticIdentityBucket;
    suppressed: SemanticIdentityBucket;
  };
  operationRouting: SemanticOperationRoutingBucket[];
  appropriateOperation: SemanticIdentityBucket;
  funnel: SemanticFunnelStage[];
  candidateStatus: Record<SemanticCandidateStatus, SemanticIdentityBucket>;
  terminalCategories: Record<SemanticTerminalCategory, SemanticIdentityBucket>;
  falseCertainty: SemanticIdentityBucket;
  unknownRegions: SemanticIdentityBucket;
  conflictingClassifications: SemanticIdentityBucket;
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
      experiment: "Operation routing",
      approachA: "Existing generic fixed OCR pass",
      approachB: "Class-specific stylized or numeric OCR in shadow mode",
      measurement: "correct content recovered per operation millisecond",
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
    const actual =
      trace.actualOperations.length > 0 ? trace.actualOperations : ["unresolved_operation"];
    for (const actualOperation of actual) {
      const key = `${trace.recommendedOperation}:${actualOperation}`;
      routing.set(key, [...(routing.get(key) ?? []), trace]);
    }
  }
  const operationRouting = [...routing.entries()]
    .map(([key, bucketTraces]) => {
      const [recommendedOperation, actualOperation] = key.split(":") as [
        SemanticAcquisitionOperation,
        SemanticAcquisitionOperation,
      ];
      return {
        recommendedOperation,
        actualOperation,
        appropriateCount: bucketTraces.filter((trace) => trace.operationAppropriate).length,
        ...identities(bucketTraces),
      };
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.recommendedOperation.localeCompare(right.recommendedOperation) ||
        left.actualOperation.localeCompare(right.actualOperation),
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

  const unknownNodes = semanticCases.flatMap((caseReport) =>
    (caseReport.semanticScene?.nodes ?? []).filter(
      (node) =>
        node.evaluationRole === "system_proposal" &&
        node.classHypotheses.some(
          (hypothesis) =>
            hypothesis.semanticClass === "unknown_text_region" ||
            hypothesis.semanticClass === "unknown_non_text_region",
        ),
    ),
  );
  const conflictingNodes = semanticCases.flatMap((caseReport) =>
    (caseReport.semanticScene?.nodes ?? []).filter(
      (node) =>
        node.evaluationRole === "system_proposal" &&
        node.classHypotheses.some(
          (hypothesis) => hypothesis.semanticClass === "conflicting_classification",
        ),
    ),
  );
  const nodeIdentities = (nodes: typeof unknownNodes): SemanticIdentityBucket => ({
    count: nodes.length,
    caseIds: [...new Set(nodes.map((node) => node.caseId))].sort(),
    targetIds: nodes.map((node) => node.id).sort(),
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
    classification: {
      top1: identities(traces.filter((trace) => trace.correctClassTop1)),
      top3: identities(traces.filter((trace) => trace.correctClassTop3)),
      retainedAlternative: identities(
        traces.filter((trace) => trace.retainedAlternatives.length > 0),
      ),
      suppressed: identities(traces.filter((trace) => trace.targetIncorrectlySuppressed)),
    },
    operationRouting,
    appropriateOperation: identities(traces.filter((trace) => trace.operationAppropriate)),
    funnel: [
      funnelStage("annotated_target", traces, () => true),
      funnelStage("region_proposed", traces, (trace) => trace.targetProposed),
      funnelStage(
        "correct_class_retained",
        traces,
        (trace) => trace.targetProposed && !trace.targetIncorrectlySuppressed,
      ),
      funnelStage(
        "appropriate_operation",
        traces,
        (trace) =>
          trace.targetProposed && !trace.targetIncorrectlySuppressed && trace.operationAppropriate,
      ),
      funnelStage(
        "content_recovered",
        traces,
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.operationAppropriate &&
          trace.contentRecovered,
      ),
      funnelStage(
        "object_assembled",
        traces,
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.operationAppropriate &&
          trace.contentRecovered &&
          trace.sceneObjectAssembled,
      ),
      funnelStage(
        "field_candidate_projected",
        traces,
        (trace) =>
          trace.targetProposed &&
          !trace.targetIncorrectlySuppressed &&
          trace.operationAppropriate &&
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
          trace.operationAppropriate &&
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
          trace.operationAppropriate &&
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
    unknownRegions: nodeIdentities(unknownNodes),
    conflictingClassifications: nodeIdentities(conflictingNodes),
    unattributed: terminalCategories.unattributed,
    tokenFirstComparison,
    nextExperiments: buildNextExperiments(terminalCategories),
  };
}
