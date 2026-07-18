import type { EvidenceGeometry } from "@/pipeline/analyzer/analyzer.types";
import type { ExtractionDebug } from "@/pipeline/extractor/extractor";

import type { CaseReport } from "../eval-report.types";
import { SEMANTIC_REGION_ANNOTATION_SCHEMA_VERSION } from "./annotations";
import { classifyAndRouteNode } from "./classifier";
import { SEMANTIC_REGION_ONTOLOGY_VERSION, type SemanticRegionClass } from "./ontology";
import { adaptSemanticRegionProposals, semanticNormalizedToGeometry } from "./proposal-adapter";
import type {
  SemanticAcquisitionOperation,
  SemanticCandidateStatus,
  SemanticCaseAnnotation,
  SemanticCaseDiagnostic,
  SemanticObjectAnnotation,
  SemanticProjectionCandidate,
  SemanticProposalSource,
  SemanticRegionNode,
  SemanticSurvivalTrace,
  SemanticTerminalCategory,
} from "./types";

const SYSTEM_OBJECT_PROPOSAL_SOURCES = new Set<SemanticProposalSource>([
  "ocr_token_or_line",
  "brand_line",
  "brand_candidate",
  "alcohol_window_or_candidate",
]);

function intersectionArea(left: EvidenceGeometry, right: EvidenceGeometry): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return width * height;
}

function targetCoverage(node: SemanticRegionNode, target: EvidenceGeometry): number {
  return intersectionArea(node.geometry, target) / Math.max(1, target.width * target.height);
}

function nodeCenterInside(node: SemanticRegionNode, target: EvidenceGeometry): boolean {
  const x = node.geometry.x + node.geometry.width / 2;
  const y = node.geometry.y + node.geometry.height / 2;
  return (
    x >= target.x && x <= target.x + target.width && y >= target.y && y <= target.y + target.height
  );
}

function matchesTargetGeometry(node: SemanticRegionNode, target: EvidenceGeometry): boolean {
  return targetCoverage(node, target) >= 0.08 || nodeCenterInside(node, target);
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function brandTextMatches(value: string, acceptable: string[]): boolean {
  const observed = normalizedText(value);
  if (!observed) return false;
  return acceptable.some((candidate) => {
    const expected = normalizedText(candidate);
    return (
      expected.length > 0 &&
      (observed.includes(expected) || (observed.length >= 4 && expected.includes(observed)))
    );
  });
}

function observedNumbers(value: string): number[] {
  return [...value.matchAll(/\d{1,2}(?:[.,]\d{1,2})?/g)]
    .map((match) => Number(match[0].replace(",", ".")))
    .filter((number) => Number.isFinite(number));
}

function alcoholTextMatches(value: string, acceptablePercents: number[]): boolean {
  return observedNumbers(value).some((number) =>
    acceptablePercents.some((acceptable) => Math.abs(acceptable - number) < 0.001),
  );
}

function nodeContentMatches(
  node: SemanticRegionNode,
  target: SemanticObjectAnnotation,
  caseReport: CaseReport,
): boolean {
  const rawText = node.contentObservations.map((observation) => observation.rawText).join(" ");
  if (target.relevantField === "brand") {
    return brandTextMatches(rawText, caseReport.brand.acceptable);
  }
  return (
    alcoholTextMatches(rawText, caseReport.alcohol.acceptablePercents) ||
    node.projectionCandidates.some(
      (candidate) =>
        candidate.field === "alcohol" &&
        candidate.parsedPercent !== null &&
        caseReport.alcohol.acceptablePercents.some(
          (acceptable) => Math.abs(acceptable - candidate.parsedPercent!) < 0.001,
        ),
    )
  );
}

function combinedContentMatches(
  nodes: SemanticRegionNode[],
  target: SemanticObjectAnnotation,
  caseReport: CaseReport,
): boolean {
  const rawText = nodes
    .flatMap((node) => node.contentObservations.map((observation) => observation.rawText))
    .join(" ");
  return target.relevantField === "brand"
    ? brandTextMatches(rawText, caseReport.brand.acceptable)
    : alcoholTextMatches(rawText, caseReport.alcohol.acceptablePercents) ||
        nodes.some((node) => nodeContentMatches(node, target, caseReport));
}

function candidateMatches(
  candidate: SemanticProjectionCandidate,
  target: SemanticObjectAnnotation,
  caseReport: CaseReport,
): boolean {
  if (candidate.field !== target.relevantField) return false;
  if (candidate.field === "brand") {
    return brandTextMatches(
      `${candidate.observedText} ${candidate.productionValue ?? ""}`,
      caseReport.brand.acceptable,
    );
  }
  return (
    (candidate.parsedPercent !== null &&
      caseReport.alcohol.acceptablePercents.some(
        (acceptable) => Math.abs(acceptable - candidate.parsedPercent!) < 0.001,
      )) ||
    alcoholTextMatches(candidate.observedText, caseReport.alcohol.acceptablePercents)
  );
}

function sourceSpecificity(source: SemanticProposalSource): number {
  switch (source) {
    case "brand_candidate":
    case "alcohol_window_or_candidate":
      return 4;
    case "brand_line":
      return 3;
    case "ocr_token_or_line":
      return 2;
    default:
      return 1;
  }
}

function representativeNode(
  nodes: SemanticRegionNode[],
  targetGeometry: EvidenceGeometry,
): SemanticRegionNode | null {
  return (
    [...nodes].sort((left, right) => {
      const coverageDelta =
        targetCoverage(right, targetGeometry) - targetCoverage(left, targetGeometry);
      if (Math.abs(coverageDelta) > 1e-9) return coverageDelta;
      const specificityDelta =
        sourceSpecificity(right.proposalSource) - sourceSpecificity(left.proposalSource);
      if (specificityDelta !== 0) return specificityDelta;
      return left.id.localeCompare(right.id);
    })[0] ?? null
  );
}

function contentBearingNode(
  nodes: SemanticRegionNode[],
  target: SemanticObjectAnnotation,
  targetGeometry: EvidenceGeometry,
  caseReport: CaseReport,
): SemanticRegionNode | null {
  return (
    [...nodes].sort((left, right) => {
      const projectionDelta =
        Number(
          right.projectionCandidates.some((candidate) =>
            candidateMatches(candidate, target, caseReport),
          ),
        ) -
        Number(
          left.projectionCandidates.some((candidate) =>
            candidateMatches(candidate, target, caseReport),
          ),
        );
      if (projectionDelta !== 0) return projectionDelta;
      const specificityDelta =
        sourceSpecificity(right.proposalSource) - sourceSpecificity(left.proposalSource);
      if (specificityDelta !== 0) return specificityDelta;
      const coverageDelta =
        targetCoverage(right, targetGeometry) - targetCoverage(left, targetGeometry);
      if (Math.abs(coverageDelta) > 1e-9) return coverageDelta;
      return left.id.localeCompare(right.id);
    })[0] ?? null
  );
}

function recommendedOperationFor(node: SemanticRegionNode | null): SemanticAcquisitionOperation {
  return node?.acquisitionHistory.at(-1)?.recommendedOperation ?? "unresolved_operation";
}

function operationAgreement(
  observed: SemanticAcquisitionOperation,
  expected: SemanticAcquisitionOperation,
): "agree" | "disagree" | "unresolved" {
  if (observed === "unresolved_operation") return "unresolved";
  return observed === expected ? "agree" : "disagree";
}

function allRetainedClasses(nodes: SemanticRegionNode[]): SemanticRegionClass[] {
  return [
    ...new Set(nodes.flatMap((node) => node.classHypotheses.map((item) => item.semanticClass))),
  ];
}

function bestCandidateStatus(candidates: SemanticProjectionCandidate[]): SemanticCandidateStatus {
  const priority: SemanticCandidateStatus[] = [
    "selected",
    "quarantined",
    "alternate",
    "retained",
    "filtered",
    "not_projected",
  ];
  return (
    priority.find((status) => candidates.some((candidate) => candidate.status === status)) ??
    "not_projected"
  );
}

export function deriveSemanticTerminalCategory(args: {
  targetProposed: boolean;
  correctClassRetained: boolean;
  operationFailureCausallySupported: boolean;
  contentRecovered: boolean;
  sceneObjectAssembled: boolean;
  fieldCandidateProjected: boolean;
  candidateStatus: SemanticCandidateStatus;
  trustworthyDownstreamEvidence: boolean;
  falseCertainty: boolean;
  fieldState: CaseReport["brand"]["state"];
  fieldTop3: boolean;
}): SemanticTerminalCategory {
  if (!args.targetProposed) return "target_not_proposed";
  if (!args.correctClassRetained) return "target_proposed_but_semantically_suppressed";
  if (!args.contentRecovered) {
    return args.operationFailureCausallySupported
      ? "target_class_preserved_wrong_operation"
      : "content_not_recovered";
  }
  if (!args.sceneObjectAssembled) return "object_assembly_failure";
  if (!args.fieldCandidateProjected) return "field_projection_failure";
  if (args.candidateStatus === "filtered") return "candidate_filtered";
  if (args.candidateStatus === "quarantined") return "honest_alternate";
  if (args.candidateStatus === "alternate") {
    return args.fieldTop3 ? "honest_alternate" : "candidate_ranked_below_useful_range";
  }
  if (args.fieldState === "AMBIGUOUS" || args.fieldState === "NOT_OBSERVED") {
    return "honest_unresolved";
  }
  if (args.trustworthyDownstreamEvidence) return "trustworthy_selected_evidence";
  if (args.falseCertainty) return "false_certainty";
  return "unattributed";
}

function traceTarget(
  target: SemanticObjectAnnotation,
  nodes: SemanticRegionNode[],
  debug: ExtractionDebug,
  caseReport: CaseReport,
): SemanticSurvivalTrace {
  if (!target.relevantField) throw new Error(`${target.id}: target requires an active field`);
  const targetGeometry = semanticNormalizedToGeometry(
    target.geometry,
    debug.decoded.width,
    debug.decoded.height,
  );
  const proposals = nodes.filter(
    (node) =>
      node.evaluationRole === "system_proposal" &&
      SYSTEM_OBJECT_PROPOSAL_SOURCES.has(node.proposalSource) &&
      matchesTargetGeometry(node, targetGeometry),
  );
  const representative = representativeNode(proposals, targetGeometry);
  const retainedClasses = allRetainedClasses(proposals);
  const correctClassRetained = retainedClasses.includes(target.expectedClass);
  const correctClassTop1 = proposals.some(
    (node) => node.classHypotheses[0]?.semanticClass === target.expectedClass,
  );
  const correctClassTop3 = proposals.some((node) =>
    node.classHypotheses
      .slice(0, 3)
      .some((hypothesis) => hypothesis.semanticClass === target.expectedClass),
  );
  const representativeRecommendedOperation = recommendedOperationFor(representative);
  const actualAcquisitionOperations = [
    ...new Set(
      proposals.flatMap((node) =>
        node.acquisitionHistory.map((history) => history.actualOperation),
      ),
    ),
  ].sort();
  const actualAcquisitionOperation: SemanticAcquisitionOperation =
    actualAcquisitionOperations.length === 1
      ? actualAcquisitionOperations[0]
      : "unresolved_operation";
  const contentRecovered = combinedContentMatches(proposals, target, caseReport);
  const contentBearingNodes = contentRecovered
    ? proposals.filter((node) => nodeContentMatches(node, target, caseReport))
    : [];
  const contentBearing = contentBearingNode(
    contentBearingNodes,
    target,
    targetGeometry,
    caseReport,
  );
  const contentBearingRecommendedOperation = recommendedOperationFor(contentBearing);
  const contentBearingRecommendedOperations = [
    ...new Set(contentBearingNodes.map((node) => recommendedOperationFor(node))),
  ].sort();
  const contentBearingOperationRecommendations = contentBearingNodes
    .map((node) => ({
      nodeId: node.id,
      recommendedOperation: recommendedOperationFor(node),
    }))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const representativeOperationAgreement = operationAgreement(
    representativeRecommendedOperation,
    target.expectedOperation,
  );
  const contentBearingOperationAgreement = operationAgreement(
    contentBearingRecommendedOperation,
    target.expectedOperation,
  );
  const actualOperationAgreement =
    actualAcquisitionOperations.length === 0
      ? "unresolved"
      : actualAcquisitionOperations.includes(target.expectedOperation)
        ? "agree"
        : "disagree";
  const operationFailureCausallySupported =
    !contentRecovered &&
    correctClassRetained &&
    representativeOperationAgreement === "agree" &&
    actualOperationAgreement === "disagree";
  const sceneObjectAssembled = proposals.some(
    (node) =>
      node.classHypotheses.some(
        (hypothesis) => hypothesis.semanticClass === target.expectedClass,
      ) && nodeContentMatches(node, target, caseReport),
  );
  const targetCandidates = proposals
    .flatMap((node) => node.projectionCandidates)
    .filter((candidate) => candidateMatches(candidate, target, caseReport));
  const fieldCandidateProjected = targetCandidates.length > 0;
  const candidateStatus = bestCandidateStatus(targetCandidates);
  const fieldReport = caseReport[target.relevantField];
  const trustworthyDownstreamEvidence =
    candidateStatus === "selected" &&
    (target.relevantField === "brand"
      ? caseReport.brand.exactMatch || caseReport.brand.normalizedMatch
      : caseReport.alcohol.parsedAccurate);
  const falseCertainty = fieldReport.failureClass === "false-certainty";
  const fieldTop3 =
    target.relevantField === "brand"
      ? caseReport.brand.top3Recall
      : caseReport.alcohol.parsedAccurate;
  const terminal = deriveSemanticTerminalCategory({
    targetProposed: proposals.length > 0,
    correctClassRetained,
    operationFailureCausallySupported,
    contentRecovered,
    sceneObjectAssembled,
    fieldCandidateProjected,
    candidateStatus,
    trustworthyDownstreamEvidence,
    falseCertainty,
    fieldState: fieldReport.state,
    fieldTop3,
  });

  return {
    traceId: `${target.id}:survival-trace`,
    caseId: target.caseId,
    targetAnnotationId: target.id,
    field: target.relevantField,
    expectedClass: target.expectedClass,
    targetProposed: proposals.length > 0,
    proposalNodeIds: proposals.map((node) => node.id),
    proposalSources: [...new Set(proposals.map((node) => node.proposalSource))],
    matchedProposalCount: proposals.length,
    correctClassTop1,
    correctClassTop3,
    strictProposalNodeId: representative?.id ?? null,
    strictTargetProposed: representative !== null,
    strictCorrectClassTop1:
      representative?.classHypotheses[0]?.semanticClass === target.expectedClass,
    strictCorrectClassTop3:
      representative?.classHypotheses
        .slice(0, 3)
        .some((hypothesis) => hypothesis.semanticClass === target.expectedClass) ?? false,
    retainedAlternatives: retainedClasses.filter(
      (semanticClass) => semanticClass !== target.expectedClass,
    ),
    targetIncorrectlySuppressed: proposals.length > 0 && !correctClassRetained,
    representativeNodeId: representative?.id ?? null,
    representativeRecommendedOperation,
    contentBearingNodeId: contentBearing?.id ?? null,
    contentBearingNodeIds: contentBearingNodes.map((node) => node.id).sort(),
    contentBearingRecommendedOperation,
    contentBearingRecommendedOperations,
    contentBearingOperationRecommendations,
    actualAcquisitionOperation,
    actualAcquisitionOperations,
    expectedEvaluationOperation: target.expectedOperation,
    representativeOperationAgreement,
    contentBearingOperationAgreement,
    actualOperationAgreement,
    operationFailureCausallySupported,
    operationDiagnosticBasis: [
      `representative node=${representative?.id ?? "none"}; recommendation=${representativeRecommendedOperation}; agreement=${representativeOperationAgreement}`,
      `content-bearing node=${contentBearing?.id ?? "none"}; recommendation=${contentBearingRecommendedOperation}; agreement=${contentBearingOperationAgreement}`,
      `actual acquisition operations=${actualAcquisitionOperations.join(", ") || "none"}; expected evaluation operation=${target.expectedOperation}; agreement=${actualOperationAgreement}`,
      operationFailureCausallySupported
        ? "routing failure is causally supported: content was not recovered, the correct class survived, the representative independently recommended the expected operation, and the executed operation differed"
        : "routing comparison is descriptive and is not used as a survival gate",
    ],
    contentRecovered,
    sceneObjectAssembled,
    fieldCandidateProjected,
    candidateStatus,
    trustworthyDownstreamEvidence,
    falseCertainty,
    tokenFirstFailureClass: fieldReport.failureClass,
    terminalCategory: terminal,
    attributionBasis: [
      `${proposals.length} qualifying system proposal(s) match the permissive rule (target coverage >= 0.08 or proposal center inside target); strict representative=${representative?.id ?? "none"}`,
      `correct class retained=${correctClassRetained}; top1=${correctClassTop1}; top3=${correctClassTop3}`,
      `representative recommendation=${representativeRecommendedOperation}; content-bearing recommendation=${contentBearingRecommendedOperation}; expected operation=${target.expectedOperation}`,
      `content recovered=${contentRecovered}; assembled=${sceneObjectAssembled}; projected=${fieldCandidateProjected}`,
      `candidate status=${candidateStatus}; token-first category=${fieldReport.failureClass}`,
    ],
  };
}

export function buildSemanticCaseDiagnostic(args: {
  caseId: string;
  debug: ExtractionDebug;
  caseReport: CaseReport;
  annotation: SemanticCaseAnnotation;
}): SemanticCaseDiagnostic {
  const adapted = adaptSemanticRegionProposals(args.caseId, args.debug, args.annotation);
  const nodes = adapted.nodes.map((node) => classifyAndRouteNode(node));
  const traces = args.annotation.objects
    .filter((object) => object.role === "target")
    .map((target) => traceTarget(target, nodes, args.debug, args.caseReport));
  return {
    ontologyVersion: SEMANTIC_REGION_ONTOLOGY_VERSION,
    annotationSchemaVersion: SEMANTIC_REGION_ANNOTATION_SCHEMA_VERSION,
    caseId: args.caseId,
    annotation: args.annotation,
    nodes,
    traces,
    omittedProposalCount: adapted.omittedProposalCount,
    limitations: [
      "Annotated target and panel nodes are evaluation anchors and never count as system proposals.",
      "The current extractor has no image-first component proposals; only existing OCR/line/candidate artifacts are measured.",
      "Actual operations are existing generic fixed OCR passes; specialized operations are recommendations only.",
      "Brand candidate geometry is reconstructed only from its recorded pass and line indexes; no independent candidate box is claimed.",
      "Unattributed remains valid where current artifacts cannot support a more specific causal claim.",
    ],
  };
}
