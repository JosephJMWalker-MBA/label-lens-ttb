import { semanticFamilyOf, type SemanticRegionClass } from "./ontology";
import type {
  SemanticAcquisitionOperation,
  SemanticClassHypothesis,
  SemanticObservedBasis,
  SemanticProjectionCandidate,
  SemanticRegionNode,
} from "./types";

interface HypothesisAccumulator {
  semanticClass: SemanticRegionClass;
  rankingScore: number;
  observedBasis: SemanticObservedBasis[];
}

function addHypothesis(
  hypotheses: Map<SemanticRegionClass, HypothesisAccumulator>,
  semanticClass: SemanticRegionClass,
  rankingScore: number,
  basis: SemanticObservedBasis,
) {
  const existing = hypotheses.get(semanticClass);
  if (!existing) {
    hypotheses.set(semanticClass, { semanticClass, rankingScore, observedBasis: [basis] });
    return;
  }
  existing.rankingScore = Math.max(existing.rankingScore, rankingScore);
  if (
    !existing.observedBasis.some(
      (candidate) =>
        candidate.kind === basis.kind &&
        candidate.value === basis.value &&
        candidate.sourceRef === basis.sourceRef,
    )
  ) {
    existing.observedBasis.push(basis);
  }
}

function sourceBasis(node: SemanticRegionNode, value: string): SemanticObservedBasis {
  return { kind: "proposal_source", value, sourceRef: node.id };
}

function textBasis(node: SemanticRegionNode, value: string): SemanticObservedBasis {
  return { kind: "text_shape", value, sourceRef: node.id };
}

function filterBasis(
  node: SemanticRegionNode,
  projection: SemanticProjectionCandidate,
): SemanticObservedBasis {
  return {
    kind: "filter_reason",
    value: projection.filterReason ?? "candidate retained without filter rejection",
    sourceRef: projection.id,
  };
}

function classifyProjection(
  node: SemanticRegionNode,
  projection: SemanticProjectionCandidate,
  hypotheses: Map<SemanticRegionClass, HypothesisAccumulator>,
) {
  const reason = projection.filterReason;
  const basis = filterBasis(node, projection);
  if (projection.field === "alcohol") {
    const markerRich =
      projection.parsedPercent !== null ||
      /(?:%|\balc\b|alcohol|\bvol(?:ume)?\b)/i.test(projection.observedText);
    addHypothesis(hypotheses, "alcohol_statement", markerRich ? 100 : 70, basis);
    addHypothesis(hypotheses, "mandatory_disclosure", markerRich ? 75 : 55, basis);
    return;
  }

  switch (reason) {
    case "producer-line":
      addHypothesis(hypotheses, "producer_name_address", 100, basis);
      addHypothesis(hypotheses, "brand_bearing_display", 45, basis);
      break;
    case "domain-like":
      addHypothesis(hypotheses, "domain", 100, basis);
      addHypothesis(hypotheses, "brand_bearing_display", 55, basis);
      break;
    case "varietal-or-designation":
      addHypothesis(hypotheses, "class_type", 100, basis);
      addHypothesis(hypotheses, "appellation", 45, basis);
      break;
    case "location-or-appellation":
      addHypothesis(hypotheses, "appellation", 100, basis);
      addHypothesis(hypotheses, "class_type", 55, basis);
      break;
    case "generic-product-language":
      addHypothesis(hypotheses, "class_type", 80, basis);
      addHypothesis(hypotheses, "decorative_prose", 50, basis);
      break;
    case "non-brand-keyword":
      addHypothesis(hypotheses, "mandatory_disclosure", 80, basis);
      addHypothesis(hypotheses, "unknown_text_region", 45, basis);
      break;
    case "too-many-words":
    case "sentence-fragment":
      addHypothesis(hypotheses, "decorative_prose", 85, basis);
      addHypothesis(hypotheses, "producer_name_address", 35, basis);
      addHypothesis(hypotheses, "brand_bearing_display", 25, basis);
      break;
    case "low-information-fragment":
    case "no-letters-or-too-short":
      addHypothesis(hypotheses, "unknown_text_region", 90, basis);
      break;
    case "candidate-positive":
      addHypothesis(hypotheses, "brand_bearing_display", 100, basis);
      addHypothesis(hypotheses, "producer_name_address", 40, basis);
      addHypothesis(hypotheses, "decorative_script", 35, basis);
      break;
    case "candidate-plausible":
    case null:
      addHypothesis(hypotheses, "brand_bearing_display", 75, basis);
      addHypothesis(hypotheses, "decorative_script", 55, basis);
      addHypothesis(hypotheses, "unknown_text_region", 35, basis);
      break;
  }
}

function classifyText(
  node: SemanticRegionNode,
  rawText: string,
  hypotheses: Map<SemanticRegionClass, HypothesisAccumulator>,
) {
  const text = rawText.trim();
  if (!text) return;
  if (/government\s+warning|surgeon\s+general|birth\s+defects/i.test(text)) {
    addHypothesis(hypotheses, "government_warning", 100, textBasis(node, text));
    addHypothesis(hypotheses, "mandatory_disclosure", 85, textBasis(node, text));
  }
  if (/\d/.test(text) && /(?:%|\balc\b|alcohol|\bvol(?:ume)?\b)/i.test(text)) {
    addHypothesis(hypotheses, "alcohol_statement", 95, {
      kind: "regulatory_marker",
      value: text,
      sourceRef: node.id,
    });
    addHypothesis(hypotheses, "mandatory_disclosure", 70, textBasis(node, text));
  }
  if (/\b(?:produced|bottled|imported|distributed|vinted|cellared)\b.*\bby\b/i.test(text)) {
    addHypothesis(hypotheses, "producer_name_address", 95, textBasis(node, text));
    addHypothesis(hypotheses, "brand_bearing_display", 35, textBasis(node, text));
  }
  if (/\b(?:https?:\/\/|www\.)|\b[a-z0-9-]+\.(?:com|net|org|wine)\b/i.test(text)) {
    addHypothesis(hypotheses, "domain", 100, textBasis(node, text));
    addHypothesis(hypotheses, "brand_bearing_display", 50, textBasis(node, text));
  }
  if (
    /\b(?:cabernet|chardonnay|merlot|pinot|sauvignon|barbera|red wine|white wine|reserva)\b/i.test(
      text,
    )
  ) {
    addHypothesis(hypotheses, "class_type", 85, textBasis(node, text));
  }
  if (/\b(?:valley|coast|county|appellation|bourgogne|montrachet|california|napa)\b/i.test(text)) {
    addHypothesis(hypotheses, "appellation", 80, textBasis(node, text));
  }
  if (/\b(?:19|20)\d{2}\b/.test(text)) {
    addHypothesis(hypotheses, "vintage", 75, textBasis(node, text));
  }
  if (/\b(?:net\s+contents?|\d+\s*(?:ml|cl|l))\b/i.test(text)) {
    addHypothesis(hypotheses, "net_contents", 85, textBasis(node, text));
    addHypothesis(hypotheses, "mandatory_disclosure", 65, textBasis(node, text));
  }
  const wordCount = text.split(/\s+/).length;
  if (wordCount >= 8) {
    addHypothesis(hypotheses, "decorative_prose", 70, textBasis(node, `${wordCount} words`));
  }
}

export function classifySemanticRegion(node: SemanticRegionNode): SemanticClassHypothesis[] {
  if (node.evaluationRole === "annotation_anchor") return node.classHypotheses;

  const hypotheses = new Map<SemanticRegionClass, HypothesisAccumulator>();
  if (node.proposalSource === "ocr_pass_region" || node.proposalSource === "recovery_crop") {
    addHypothesis(
      hypotheses,
      node.proposalSource === "ocr_pass_region" ? "artifact" : "unknown_panel",
      80,
      sourceBasis(node, node.proposalSource),
    );
  }

  for (const projection of node.projectionCandidates) {
    classifyProjection(node, projection, hypotheses);
  }
  for (const observation of node.contentObservations) {
    classifyText(node, observation.rawText, hypotheses);
  }

  if (hypotheses.size === 0) {
    addHypothesis(
      hypotheses,
      node.contentObservations.length > 0 ? "unknown_text_region" : "unknown_non_text_region",
      50,
      { kind: "unknown", value: "no stronger observable semantic cue", sourceRef: node.id },
    );
  }

  const ranked = [...hypotheses.values()].sort(
    (left, right) =>
      right.rankingScore - left.rankingScore ||
      left.semanticClass.localeCompare(right.semanticClass),
  );
  if (
    ranked.length > 1 &&
    ranked[0].rankingScore - ranked[1].rankingScore <= 10 &&
    semanticFamilyOf(ranked[0].semanticClass) !== semanticFamilyOf(ranked[1].semanticClass)
  ) {
    addHypothesis(hypotheses, "conflicting_classification", 40, {
      kind: "unknown",
      value: `near-ranked alternatives ${ranked[0].semanticClass} and ${ranked[1].semanticClass}`,
      sourceRef: node.id,
    });
  }

  return [...hypotheses.values()]
    .map((hypothesis) => ({ ...hypothesis, family: semanticFamilyOf(hypothesis.semanticClass) }))
    .sort(
      (left, right) =>
        right.rankingScore - left.rankingScore ||
        left.semanticClass.localeCompare(right.semanticClass),
    );
}

export function recommendedOperationFor(
  hypotheses: SemanticClassHypothesis[],
): SemanticAcquisitionOperation {
  const score = (semanticClass: SemanticRegionClass) =>
    hypotheses.find((hypothesis) => hypothesis.semanticClass === semanticClass)?.rankingScore ??
    Number.NEGATIVE_INFINITY;
  if (Math.max(score("barcode"), score("qr_code")) >= 70) return "barcode_decoder_future";
  if (score("alcohol_statement") >= 70) return "numeric_mandatory_statement_ocr";
  if (score("brand_bearing_display") >= 60) {
    return score("decorative_script") >= 50 ? "stylized_text_ocr" : "generic_text_ocr";
  }
  if (
    Math.max(score("decorative_prose"), score("illustration"), score("background_texture")) >= 70
  ) {
    return "no_read_contextual";
  }
  if (score("unknown_text_region") >= 50 || score("unknown_non_text_region") >= 50) {
    return "unresolved_operation";
  }
  return "generic_text_ocr";
}

export function classifyAndRouteNode(node: SemanticRegionNode): SemanticRegionNode {
  const classHypotheses = classifySemanticRegion(node);
  const recommendedOperation = recommendedOperationFor(classHypotheses);
  const actualOperation: SemanticAcquisitionOperation =
    node.contentObservations.length > 0 ? "generic_text_ocr" : "unresolved_operation";
  const top = classHypotheses[0]?.semanticClass;
  const selected = node.projectionCandidates.some((candidate) => candidate.status === "selected");
  const state = selected
    ? "resolved"
    : node.contentObservations.length > 0
      ? top === "unknown_text_region" || top === "conflicting_classification"
        ? "unresolved"
        : "partially_read"
      : classHypotheses.length > 0
        ? "provisionally_classified"
        : "proposed";
  return {
    ...node,
    classHypotheses,
    acquisitionHistory: [
      ...node.acquisitionHistory,
      {
        actualOperation,
        recommendedOperation,
        passId: node.contentObservations[0]?.passId ?? null,
        usefulContentObserved: node.contentObservations.some(
          (observation) => observation.rawText.trim().length > 0,
        ),
        note:
          actualOperation === "generic_text_ocr"
            ? "Existing fixed OCR pass observed this region; no specialized operation is claimed."
            : "No existing OCR content observation is attached to this proposal.",
      },
    ],
    state,
  };
}
