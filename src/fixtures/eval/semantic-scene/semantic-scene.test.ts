// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { OCR_REGION_BENCHMARK_CASE_ANNOTATIONS } from "../ocr-region-benchmark.annotations";
import { SEMANTIC_CASE_ANNOTATIONS } from "./annotations";
import { classifyAndRouteNode } from "./classifier";
import {
  SEMANTIC_REGION_CLASSES,
  SEMANTIC_REGION_CLASSES_BY_FAMILY,
  SEMANTIC_REGION_FAMILIES,
} from "./ontology";
import type { SemanticProjectionCandidate, SemanticRegionNode } from "./types";

function projection(
  id: string,
  field: SemanticProjectionCandidate["field"],
  observedText: string,
  filterReason: SemanticProjectionCandidate["filterReason"],
): SemanticProjectionCandidate {
  return {
    id,
    field,
    observedText,
    productionValue: null,
    status: "filtered",
    productionDecision: null,
    filterReason,
    ocrEvidenceScore: 0.4,
    parsedPercent: field === "alcohol" ? 13.5 : null,
  };
}

function node(overrides: Partial<SemanticRegionNode> = {}): SemanticRegionNode {
  return {
    id: "case:proposal:synthetic",
    caseId: "case",
    geometry: {
      imageIndex: 0,
      x: 10,
      y: 20,
      width: 100,
      height: 30,
      imageWidth: 400,
      imageHeight: 300,
    },
    parentPanelId: null,
    proposalSource: "ocr_token_or_line",
    proposalBasis: "synthetic observed artifact",
    evaluationRole: "system_proposal",
    visualObservations: [],
    classHypotheses: [],
    contentObservations: [],
    acquisitionHistory: [],
    relationships: [],
    projectionCandidates: [],
    state: "proposed",
    ...overrides,
  };
}

function keysDeep(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysDeep(child)]);
}

describe("semantic region ontology and provisional classification", () => {
  it("defines the complete v1 vocabulary with distinguishable families", () => {
    expect(SEMANTIC_REGION_FAMILIES).toEqual([
      "structural",
      "identity",
      "regulatory",
      "commercial",
      "presentation",
      "unknown",
    ]);
    expect(SEMANTIC_REGION_CLASSES_BY_FAMILY.unknown).toContain("unknown_text_region");
    expect(SEMANTIC_REGION_CLASSES_BY_FAMILY.unknown).toContain("conflicting_classification");
    expect(new Set(SEMANTIC_REGION_CLASSES).size).toBe(SEMANTIC_REGION_CLASSES.length);
  });

  it("retains multiple warranted hypotheses and their observed bases", () => {
    const classified = classifyAndRouteNode(
      node({
        projectionCandidates: [
          projection("domain", "brand", "EXAMPLE.WINE", "domain-like"),
          projection("alcohol", "alcohol", "13.5% ALC BY VOL", null),
        ],
      }),
    );
    const classes = classified.classHypotheses.map((item) => item.semanticClass);
    expect(classes).toContain("domain");
    expect(classes).toContain("brand_bearing_display");
    expect(classes).toContain("alcohol_statement");
    expect(classes).toContain("conflicting_classification");
    expect(
      classified.classHypotheses.every((hypothesis) => hypothesis.observedBasis.length > 0),
    ).toBe(true);
  });

  it("preserves unknown when no stronger observation exists", () => {
    const classified = classifyAndRouteNode(node());
    expect(classified.classHypotheses.map((item) => item.semanticClass)).toContain(
      "unknown_non_text_region",
    );
    expect(classified.state).toBe("provisionally_classified");
  });

  it("exposes ranking scores without probability or semantic confidence fields", () => {
    const classified = classifyAndRouteNode(
      node({
        projectionCandidates: [projection("brand", "brand", "M CELLARS", "candidate-positive")],
      }),
    );
    expect(classified.classHypotheses[0].rankingScore).toBeGreaterThan(0);
    expect(keysDeep(classified)).not.toContain("probability");
    expect(keysDeep(classified)).not.toContain("confidence");
  });

  it("keeps adjudicated expected values out of classifier and routing source", () => {
    const source = readFileSync(new URL("./classifier.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/acceptable(?:Percents)?|expectedClass|expectedOperation/);
  });
});

describe("sparse semantic annotations", () => {
  it("derives one target per selected benchmark field", () => {
    const benchmarkFields = OCR_REGION_BENCHMARK_CASE_ANNOTATIONS.reduce(
      (counts, annotation) => ({
        brand: counts.brand + Number(annotation.fields.brand !== undefined),
        alcohol: counts.alcohol + Number(annotation.fields.alcohol !== undefined),
      }),
      { brand: 0, alcohol: 0 },
    );
    const targets = SEMANTIC_CASE_ANNOTATIONS.flatMap((annotation) =>
      annotation.objects.filter((object) => object.role === "target"),
    );
    expect(SEMANTIC_CASE_ANNOTATIONS).toHaveLength(13);
    expect(benchmarkFields).toEqual({ brand: 11, alcohol: 12 });
    expect(targets).toHaveLength(23);
    expect(targets.filter((target) => target.relevantField === "brand")).toHaveLength(11);
    expect(targets.filter((target) => target.relevantField === "alcohol")).toHaveLength(12);
    expect(new Set(targets.map((target) => target.id)).size).toBe(targets.length);
  });

  it("covers the required hard-negative classes and valid normalized geometry", () => {
    const hardNegatives = SEMANTIC_CASE_ANNOTATIONS.flatMap((annotation) =>
      annotation.objects.filter((object) => object.role === "hard_negative"),
    );
    const classes = new Set(hardNegatives.flatMap((annotation) => annotation.semanticClasses));
    for (const required of [
      "producer_name_address",
      "class_type",
      "appellation",
      "domain",
      "decorative_prose",
      "barcode",
      "government_warning",
    ]) {
      expect(classes, required).toContain(required);
    }
    for (const annotation of SEMANTIC_CASE_ANNOTATIONS) {
      for (const item of [...annotation.panels, ...annotation.objects]) {
        expect(item.geometry.x).toBeGreaterThanOrEqual(0);
        expect(item.geometry.y).toBeGreaterThanOrEqual(0);
        expect(item.geometry.width).toBeGreaterThan(0);
        expect(item.geometry.height).toBeGreaterThan(0);
        expect(item.geometry.x + item.geometry.width).toBeLessThanOrEqual(1);
        expect(item.geometry.y + item.geometry.height).toBeLessThanOrEqual(1);
      }
    }
  });
});
