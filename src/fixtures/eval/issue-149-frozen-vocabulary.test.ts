/**
 * Issue #149 — the canonical helper's copied vocabularies must equal production.
 *
 * Non-OCR. `scripts/eval/lib/issue-149-evidence-canonical.ts` deliberately
 * imports nothing, so the enum values it validates against are literal copies.
 * A copy can drift. This test is the guard: it imports the real production
 * constants and asserts each copy is identical.
 *
 * A test may import production; the acquisition runner may not, and does not.
 */
import { describe, expect, it } from "vitest";

import {
  ANALYZER_CANDIDATE_RANKING_MODES as PROD_RANKING_MODES,
  ANALYZER_CANDIDATE_RANKING_STRATEGIES as PROD_RANKING_STRATEGIES,
  ANALYZER_RANKING_COMPARATOR_IDS as PROD_COMPARATOR_IDS,
  ANALYZER_RANKING_DIRECTIONS as PROD_RANKING_DIRECTIONS,
  ANALYZER_RANKING_SCORE_FACTOR_DIRECTIONS as PROD_SCORE_FACTOR_DIRECTIONS,
  ANALYZER_RANKING_SCORE_FACTOR_IDS as PROD_SCORE_FACTOR_IDS,
} from "@/pipeline/analyzer/analyzer.types";
import {
  OCR_PASS_KINDS as PROD_PASS_KINDS,
  OCR_PASS_TRIGGER_REASONS as PROD_TRIGGER_REASONS,
} from "@/pipeline/extractor/extractor.types";
import {
  BRAND_CANDIDATE_ASSEMBLIES as PROD_ASSEMBLIES,
  BRAND_CANDIDATE_DECISIONS as PROD_DECISIONS,
  BRAND_FILTER_CHECK_ORDER as PROD_FILTER_CHECK_ORDER,
  BRAND_LINE_REASONS as PROD_LINE_REASONS,
} from "@/pipeline/extractor/field-selection";

import {
  ANALYZER_CANDIDATE_PROVENANCE_KEYS,
  ANALYZER_CANDIDATE_RANKING_MODES,
  ANALYZER_CANDIDATE_RANKING_STRATEGIES,
  ANALYZER_OCR_CONFIDENCE_KEYS,
  ANALYZER_RANKING_COMPARATOR_IDS,
  ANALYZER_RANKING_DIRECTIONS,
  ANALYZER_RANKING_SCORE_FACTOR_DIRECTIONS,
  ANALYZER_RANKING_SCORE_FACTOR_IDS,
  BRAND_CANDIDATE_ASSEMBLIES,
  BRAND_CANDIDATE_DECISIONS,
  BRAND_CANDIDATE_SCORE_KEYS,
  BRAND_FILTER_CHECK_ORDER,
  BRAND_KEPT_REASONS,
  BRAND_LINE_REASONS,
  EVIDENCE_GEOMETRY_KEYS,
  OCR_PASS_KINDS,
  OCR_PASS_TRIGGER_REASONS,
  REGION_OCR_RESULT_KEYS,
} from "../../../scripts/eval/lib/issue-149-evidence-canonical";

describe("Issue #149 frozen vocabulary matches production", () => {
  it("copies every ordered enum exactly, order included", () => {
    // Order matters for the filter ladder; for the rest it is simply the truth.
    expect([...OCR_PASS_KINDS]).toEqual([...PROD_PASS_KINDS]);
    expect([...OCR_PASS_TRIGGER_REASONS]).toEqual([...PROD_TRIGGER_REASONS]);
    expect([...BRAND_FILTER_CHECK_ORDER]).toEqual([...PROD_FILTER_CHECK_ORDER]);
    expect([...BRAND_CANDIDATE_ASSEMBLIES]).toEqual([...PROD_ASSEMBLIES]);
    expect([...BRAND_CANDIDATE_DECISIONS]).toEqual([...PROD_DECISIONS]);
    expect([...ANALYZER_CANDIDATE_RANKING_STRATEGIES]).toEqual([...PROD_RANKING_STRATEGIES]);
    expect([...ANALYZER_CANDIDATE_RANKING_MODES]).toEqual([...PROD_RANKING_MODES]);
    expect([...ANALYZER_RANKING_COMPARATOR_IDS]).toEqual([...PROD_COMPARATOR_IDS]);
    expect([...ANALYZER_RANKING_DIRECTIONS]).toEqual([...PROD_RANKING_DIRECTIONS]);
    expect([...ANALYZER_RANKING_SCORE_FACTOR_IDS]).toEqual([...PROD_SCORE_FACTOR_IDS]);
    expect([...ANALYZER_RANKING_SCORE_FACTOR_DIRECTIONS]).toEqual([
      ...PROD_SCORE_FACTOR_DIRECTIONS,
    ]);
  });

  it("covers exactly the production BrandLineReason set", () => {
    expect(new Set(BRAND_LINE_REASONS)).toEqual(new Set(PROD_LINE_REASONS));
    // The kept reasons are precisely the line reasons that are not ladder rules.
    const ladder = new Set<string>(PROD_FILTER_CHECK_ORDER);
    expect(new Set(BRAND_KEPT_REASONS)).toEqual(
      new Set(PROD_LINE_REASONS.filter((reason) => !ladder.has(reason as never))),
    );
  });

  it("declares key sets that match the production interfaces", () => {
    // These mirror interfaces rather than const arrays, so they are asserted
    // against the literal shapes production emits.
    expect([...REGION_OCR_RESULT_KEYS]).toEqual([
      "passId",
      "regionName",
      "passKind",
      "triggerReasons",
      "preprocessing",
      "fieldEligibility",
      "transform",
      "transformedSize",
      "pageSegMode",
      "rawWordCount",
      "discardedWordCount",
      "timings",
      "words",
    ]);
    expect([...ANALYZER_OCR_CONFIDENCE_KEYS]).toEqual([
      "aggregation",
      "rawScale",
      "rawTokenConfidences",
      "rawMean",
      "rawMin",
      "rawMax",
    ]);
    expect([...ANALYZER_CANDIDATE_PROVENANCE_KEYS]).toEqual([
      "passId",
      "passKind",
      "triggerReasons",
      "preprocessing",
      "regionName",
      "supportingPassIds",
      "supportingPassKinds",
      "recoveryPassUsed",
    ]);
    expect([...BRAND_CANDIDATE_SCORE_KEYS]).toEqual([
      "positiveSignal",
      "meaningfulChars",
      "structure",
      "ocrEvidenceScore",
      "prominence",
      "area",
      "centrality",
      "alignment",
      "lineProximity",
      "lowInformationPenalty",
      "residualPenalty",
      "total",
    ]);
    expect([...EVIDENCE_GEOMETRY_KEYS]).toEqual([
      "imageIndex",
      "x",
      "y",
      "width",
      "height",
      "imageWidth",
      "imageHeight",
    ]);
  });
});
