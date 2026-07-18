import type { EvidenceGeometry } from "@/pipeline/analyzer/analyzer.types";
import type { ExtractionDebug } from "@/pipeline/extractor/extractor";
import type { OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import { unionGeometry } from "@/pipeline/extractor/geometry";

import { semanticFamilyOf } from "./ontology";
import type {
  SemanticCaseAnnotation,
  SemanticContentObservation,
  SemanticContentToken,
  SemanticNormalizedBox,
  SemanticProjectionCandidate,
  SemanticRegionNode,
} from "./types";

const LINE_Y_TOLERANCE = 20;
const MAX_SYSTEM_PROPOSALS_PER_CASE = 1_000;

function lines(words: OcrWord[]): OcrWord[][] {
  const ordered = [...words].sort((left, right) => {
    const leftY = (left.bbox.y0 + left.bbox.y1) / 2;
    const rightY = (right.bbox.y0 + right.bbox.y1) / 2;
    if (Math.abs(leftY - rightY) > LINE_Y_TOLERANCE) return leftY - rightY;
    return left.bbox.x0 - right.bbox.x0;
  });
  const grouped: OcrWord[][] = [];
  for (const word of ordered) {
    const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
    const line = grouped.find((candidate) => {
      const candidateY = (candidate[0].bbox.y0 + candidate[0].bbox.y1) / 2;
      return Math.abs(candidateY - centerY) <= LINE_Y_TOLERANCE;
    });
    if (line) line.push(word);
    else grouped.push([word]);
  }
  return grouped.map((line) => [...line].sort((left, right) => left.bbox.x0 - right.bbox.x0));
}

function originalGeometryOf(word: OcrWord): EvidenceGeometry {
  if (!word.originalGeometry) throw new Error("semantic adapter requires mapped OCR geometry");
  return word.originalGeometry;
}

function geometryOf(words: OcrWord[]): EvidenceGeometry {
  if (words.length === 0) throw new Error("semantic adapter requires at least one observed word");
  return unionGeometry(words.map(originalGeometryOf));
}

function normalizedToGeometry(
  box: SemanticNormalizedBox,
  width: number,
  height: number,
): EvidenceGeometry {
  const x = Math.max(0, Math.min(width - 1, Math.round(box.x * width)));
  const y = Math.max(0, Math.min(height - 1, Math.round(box.y * height)));
  const right = Math.max(x + 1, Math.min(width, Math.round((box.x + box.width) * width)));
  const bottom = Math.max(y + 1, Math.min(height, Math.round((box.y + box.height) * height)));
  return {
    imageIndex: 0,
    x,
    y,
    width: right - x,
    height: bottom - y,
    imageWidth: width,
    imageHeight: height,
  };
}

function centerInside(geometry: EvidenceGeometry, container: EvidenceGeometry): boolean {
  const x = geometry.x + geometry.width / 2;
  const y = geometry.y + geometry.height / 2;
  return (
    x >= container.x &&
    x <= container.x + container.width &&
    y >= container.y &&
    y <= container.y + container.height
  );
}

function panelFor(
  geometry: EvidenceGeometry,
  annotation: SemanticCaseAnnotation,
  width: number,
  height: number,
): string | null {
  return (
    annotation.panels.find((panel) =>
      centerInside(geometry, normalizedToGeometry(panel.geometry, width, height)),
    )?.id ?? null
  );
}

function contentTokens(words: OcrWord[]): SemanticContentToken[] {
  return words.map((word) => ({
    text: word.text,
    rawOcrScore: Number.isFinite(word.rawConfidence) ? word.rawConfidence : null,
    processedBox: word.bbox,
    originalGeometry: originalGeometryOf(word),
  }));
}

function contentObservation(
  id: string,
  words: OcrWord[],
  pass: RegionOcrResult,
): SemanticContentObservation {
  return {
    id,
    rawText: words.map((word) => word.text).join(" "),
    tokens: contentTokens(words),
    passId: pass.passId,
    passKind: pass.passKind,
    regionName: pass.regionName,
    preprocessing: [...pass.preprocessing],
    triggerReasons: [...pass.triggerReasons],
  };
}

function baseNode(args: {
  id: string;
  caseId: string;
  geometry: EvidenceGeometry;
  parentPanelId: string | null;
  proposalSource: SemanticRegionNode["proposalSource"];
  proposalBasis: string;
  visualObservations?: string[];
  contentObservations?: SemanticContentObservation[];
  projectionCandidates?: SemanticProjectionCandidate[];
}): SemanticRegionNode {
  return {
    id: args.id,
    caseId: args.caseId,
    geometry: args.geometry,
    parentPanelId: args.parentPanelId,
    proposalSource: args.proposalSource,
    proposalBasis: args.proposalBasis,
    evaluationRole: "system_proposal",
    visualObservations: args.visualObservations ?? [],
    classHypotheses: [],
    contentObservations: args.contentObservations ?? [],
    acquisitionHistory: [],
    relationships: [],
    projectionCandidates: args.projectionCandidates ?? [],
    state: "proposed",
  };
}

function candidateStatus(
  kept: boolean,
  decision: string | undefined,
): SemanticProjectionCandidate["status"] {
  if (!kept) return "filtered";
  if (decision === "selected") return "selected";
  if (decision === "ambiguous-rival") return "quarantined";
  if (decision === "alternate") return "alternate";
  return "retained";
}

function wordsForBrandCandidate(
  pass: RegionOcrResult,
  lineIndexes: number[],
  rawText: string,
): OcrWord[] {
  const grouped = lines(pass.words);
  const candidates = lineIndexes.flatMap((index) => grouped[index] ?? []);
  const targetTokens = rawText.split(/\s+/).filter(Boolean);
  if (targetTokens.length === 0 || candidates.length === 0) return candidates;
  for (let start = 0; start <= candidates.length - targetTokens.length; start += 1) {
    const slice = candidates.slice(start, start + targetTokens.length);
    if (slice.map((word) => word.text).join(" ") === rawText) return slice;
  }
  return candidates;
}

function passNodes(
  caseId: string,
  debug: ExtractionDebug,
  annotation: SemanticCaseAnnotation,
): SemanticRegionNode[] {
  return debug.passes.map((pass) => {
    const crop = pass.transform.crop;
    const geometry: EvidenceGeometry = {
      imageIndex: 0,
      x: crop.left,
      y: crop.top,
      width: crop.width,
      height: crop.height,
      imageWidth: pass.transform.originalWidth,
      imageHeight: pass.transform.originalHeight,
    };
    const isCrop =
      crop.left !== 0 ||
      crop.top !== 0 ||
      crop.width !== pass.transform.originalWidth ||
      crop.height !== pass.transform.originalHeight;
    return baseNode({
      id: `${caseId}:proposal:pass:${pass.passId}`,
      caseId,
      geometry,
      parentPanelId: panelFor(
        geometry,
        annotation,
        pass.transform.originalWidth,
        pass.transform.originalHeight,
      ),
      proposalSource: isCrop ? "recovery_crop" : "ocr_pass_region",
      proposalBasis: `existing OCR pass ${pass.passId}; ${pass.passKind}`,
      visualObservations: [
        `rotation:${pass.transform.rotate}`,
        `scale:${pass.transform.scale}`,
        `field-eligibility:brand=${pass.fieldEligibility.brand},alcohol=${pass.fieldEligibility.alcohol}`,
      ],
    });
  });
}

function lineNodes(
  caseId: string,
  debug: ExtractionDebug,
  annotation: SemanticCaseAnnotation,
): SemanticRegionNode[] {
  return debug.passes.flatMap((pass) =>
    lines(pass.words).flatMap((line, index) => {
      if (line.length === 0) return [];
      const geometry = geometryOf(line);
      return [
        baseNode({
          id: `${caseId}:proposal:line:${pass.passId}:${index}`,
          caseId,
          geometry,
          parentPanelId: panelFor(
            geometry,
            annotation,
            pass.transform.originalWidth,
            pass.transform.originalHeight,
          ),
          proposalSource: "ocr_token_or_line",
          proposalBasis: `observed OCR line ${index} in ${pass.passId}`,
          contentObservations: [
            contentObservation(`${caseId}:content:line:${pass.passId}:${index}`, line, pass),
          ],
        }),
      ];
    }),
  );
}

function brandCandidateNodes(
  caseId: string,
  debug: ExtractionDebug,
  annotation: SemanticCaseAnnotation,
): SemanticRegionNode[] {
  const diagnostics = debug.finalSelections.brand.brandDiagnostics?.candidates ?? [];
  return diagnostics.flatMap((candidate, index) => {
    const pass = debug.passes.find((candidatePass) => candidatePass.passId === candidate.passId);
    if (!pass) return [];
    const words = wordsForBrandCandidate(pass, candidate.lineIndexes, candidate.rawText);
    if (words.length === 0) return [];
    const geometry = geometryOf(words);
    const projection: SemanticProjectionCandidate = {
      id: `${caseId}:projection:brand:${index}`,
      field: "brand",
      observedText: candidate.rawText,
      productionValue: candidate.cleanedValue,
      status: candidateStatus(candidate.kept, candidate.decision),
      productionDecision: candidate.decision ?? null,
      filterReason: candidate.filterReason,
      ocrEvidenceScore: candidate.ocrEvidenceScore,
      parsedPercent: null,
      ranking: candidate.ranking,
    };
    const observation = contentObservation(
      `${caseId}:content:brand:${candidate.passId}:${index}`,
      words,
      pass,
    );
    observation.candidateProvenance = candidate.candidateProvenance;
    return [
      baseNode({
        id: `${caseId}:proposal:brand-candidate:${candidate.passId}:${index}`,
        caseId,
        geometry,
        parentPanelId: panelFor(
          geometry,
          annotation,
          pass.transform.originalWidth,
          pass.transform.originalHeight,
        ),
        proposalSource: candidate.assembly === "whole-line" ? "brand_line" : "brand_candidate",
        proposalBasis: `existing brand ${candidate.assembly}; filter=${candidate.filterReason}; kept=${candidate.kept}`,
        contentObservations: [observation],
        projectionCandidates: [projection],
      }),
    ];
  });
}

function alcoholCandidateNodes(
  caseId: string,
  debug: ExtractionDebug,
  annotation: SemanticCaseAnnotation,
): SemanticRegionNode[] {
  const diagnostics = debug.finalSelections.alcohol.alcoholDiagnostics?.candidates ?? [];
  return diagnostics.flatMap((candidate, index) => {
    const pass = debug.passes.find((candidatePass) => candidatePass.passId === candidate.passId);
    if (!pass || candidate.sourceOriginalBoxes.length === 0) return [];
    const geometry = unionGeometry(candidate.sourceOriginalBoxes);
    const tokens: SemanticContentToken[] = candidate.sourceTokens.map((text, tokenIndex) => ({
      text,
      rawOcrScore: candidate.ocrConfidence.rawTokenConfidences[tokenIndex] ?? null,
      processedBox: candidate.sourceBoxes[tokenIndex],
      originalGeometry: candidate.sourceOriginalBoxes[tokenIndex],
    }));
    const observation: SemanticContentObservation = {
      id: `${caseId}:content:alcohol:${candidate.passId}:${index}`,
      rawText: candidate.rawText,
      tokens,
      passId: candidate.passId,
      passKind: candidate.passKind,
      regionName: candidate.regionName,
      preprocessing: [...candidate.candidateProvenance.preprocessing],
      triggerReasons: [...pass.triggerReasons],
      candidateProvenance: candidate.candidateProvenance,
    };
    const projection: SemanticProjectionCandidate = {
      id: `${caseId}:projection:alcohol:${index}`,
      field: "alcohol",
      observedText: candidate.rawText,
      productionValue: candidate.normalizedValue,
      status: candidateStatus(candidate.kept, candidate.decision),
      productionDecision: candidate.decision ?? null,
      filterReason: candidate.rejectionReason ?? null,
      ocrEvidenceScore: candidate.ocrEvidenceScore,
      parsedPercent: candidate.parsedPercent,
      ranking: candidate.ranking,
    };
    return [
      baseNode({
        id: `${caseId}:proposal:alcohol-candidate:${candidate.passId}:${index}`,
        caseId,
        geometry,
        parentPanelId: panelFor(
          geometry,
          annotation,
          pass.transform.originalWidth,
          pass.transform.originalHeight,
        ),
        proposalSource: "alcohol_window_or_candidate",
        proposalBasis: `existing alcohol ${candidate.assembly}; rejection=${candidate.rejectionReason ?? "none"}; kept=${candidate.kept}`,
        contentObservations: [observation],
        projectionCandidates: [projection],
      }),
    ];
  });
}

function annotationNodes(
  caseId: string,
  debug: ExtractionDebug,
  annotation: SemanticCaseAnnotation,
): SemanticRegionNode[] {
  const width = debug.decoded.width;
  const height = debug.decoded.height;
  const panelNodes = annotation.panels.map((panel): SemanticRegionNode => ({
    ...baseNode({
      id: panel.id,
      caseId,
      geometry: normalizedToGeometry(panel.geometry, width, height),
      parentPanelId: null,
      proposalSource: "panel_annotation",
      proposalBasis: panel.adjudicationBasis,
    }),
    evaluationRole: "annotation_anchor",
    classHypotheses: [
      {
        semanticClass: panel.semanticClass,
        family: semanticFamilyOf(panel.semanticClass),
        rankingScore: 0,
        observedBasis: [
          { kind: "annotation", value: panel.adjudicationBasis, sourceRef: panel.id },
        ],
      },
    ],
    state: "provisionally_classified",
  }));
  const objectNodes = annotation.objects.map((object): SemanticRegionNode => ({
    ...baseNode({
      id: object.id,
      caseId,
      geometry: normalizedToGeometry(object.geometry, width, height),
      parentPanelId: object.panelId,
      proposalSource: object.role === "target" ? "annotated_target" : "panel_annotation",
      proposalBasis: object.adjudicationBasis,
    }),
    evaluationRole: "annotation_anchor",
    classHypotheses: object.semanticClasses.map((semanticClass) => ({
      semanticClass,
      family: semanticFamilyOf(semanticClass),
      rankingScore: 0,
      observedBasis: [
        { kind: "annotation", value: object.adjudicationBasis, sourceRef: object.id },
      ],
    })),
    state: "provisionally_classified",
  }));
  return [...panelNodes, ...objectNodes];
}

function attachRelationships(nodes: SemanticRegionNode[], annotation: SemanticCaseAnnotation) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const systemNodes = nodes.filter((node) => node.evaluationRole === "system_proposal");
  for (const node of systemNodes) {
    if (node.parentPanelId) {
      byId.get(node.parentPanelId)?.relationships.push({
        type: "contains",
        targetNodeId: node.id,
        observedBasis: "proposal center lies inside the annotated panel",
      });
      node.relationships.push({
        type: "same_panel_as",
        targetNodeId: node.parentPanelId,
        observedBasis: "shared original-image panel coordinate frame",
      });
    }
    for (const projection of node.projectionCandidates) {
      const targets = annotation.objects.filter(
        (object) => object.role === "target" && object.relevantField === projection.field,
      );
      for (const target of targets) {
        node.relationships.push({
          type: "supports_field",
          targetNodeId: target.id,
          observedBasis: `existing ${projection.field} candidate artifact`,
        });
      }
    }
  }

  const previousByField = new Map<string, SemanticRegionNode>();
  for (const node of systemNodes.filter((candidate) => candidate.projectionCandidates.length > 0)) {
    const field = node.projectionCandidates[0].field;
    const key = `${field}:${node.contentObservations[0]?.passId ?? "none"}`;
    const previous = previousByField.get(key);
    if (previous) {
      node.relationships.push({
        type: "alternative_to",
        targetNodeId: previous.id,
        observedBasis: `same ${field} projection lane and OCR pass`,
      });
    }
    previousByField.set(key, node);
  }

  const targets = annotation.objects.filter((object) => object.role === "target");
  for (const context of annotation.objects.filter((object) => object.role !== "target")) {
    const contextNode = byId.get(context.id);
    if (!contextNode) continue;
    for (const target of targets.filter((candidate) => candidate.panelId === context.panelId)) {
      contextNode.relationships.push({
        type: "contextualizes",
        targetNodeId: target.id,
        observedBasis: "adjudicated hard negative shares the target panel",
      });
    }
  }
}

export interface SemanticProposalAdapterResult {
  nodes: SemanticRegionNode[];
  omittedProposalCount: number;
}

export function adaptSemanticRegionProposals(
  caseId: string,
  debug: ExtractionDebug,
  annotation: SemanticCaseAnnotation,
): SemanticProposalAdapterResult {
  const systemProposals = [
    ...passNodes(caseId, debug, annotation),
    ...lineNodes(caseId, debug, annotation),
    ...brandCandidateNodes(caseId, debug, annotation),
    ...alcoholCandidateNodes(caseId, debug, annotation),
  ];
  const retained = systemProposals.slice(0, MAX_SYSTEM_PROPOSALS_PER_CASE);
  const nodes = [...annotationNodes(caseId, debug, annotation), ...retained];
  attachRelationships(nodes, annotation);
  return {
    nodes,
    omittedProposalCount: Math.max(0, systemProposals.length - retained.length),
  };
}

export function semanticNormalizedToGeometry(
  box: SemanticNormalizedBox,
  width: number,
  height: number,
): EvidenceGeometry {
  return normalizedToGeometry(box, width, height);
}
