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
import type { ExtractionDebug } from "@/pipeline/extractor/extractor";
import type {
  AnalyzerCandidateProvenance,
  AnalyzerOcrConfidence,
  EvidenceGeometry,
} from "@/pipeline/analyzer/analyzer.types";
import {
  OCR_PASS_KINDS as PROD_PASS_KINDS,
  OCR_PASS_TRIGGER_REASONS as PROD_TRIGGER_REASONS,
  type OcrWord,
  type RegionOcrResult,
} from "@/pipeline/extractor/extractor.types";
import {
  BRAND_CANDIDATE_ASSEMBLIES as PROD_ASSEMBLIES,
  BRAND_CANDIDATE_DECISIONS as PROD_DECISIONS,
  BRAND_FILTER_CHECK_ORDER as PROD_FILTER_CHECK_ORDER,
  BRAND_LINE_REASONS as PROD_LINE_REASONS,
  selectBrandObservation,
  type BrandCandidateScore,
} from "@/pipeline/extractor/field-selection";

import { finalizeProductionBrandEvidence } from "../../../scripts/eval/lib/issue-149-candidate-adapter";

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
  CANDIDATE_EVIDENCE_REQUIRED_KEYS,
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

  it("derives interface key sets from typed exemplars, not from an asserted list", () => {
    // Amendment 5 asserted a hard-coded list here and repeated its own six-key
    // ocrConfidence mistake, so the "drift guard" agreed with the bug. A guard
    // that restates the thing it is guarding proves nothing.
    //
    // These exemplars are typed as the production interfaces. If a field is
    // added, removed or renamed upstream, the exemplar stops compiling — and the
    // key set below is read OFF the exemplar rather than written out again.
    const ocrConfidence: AnalyzerOcrConfidence = {
      aggregation: "mean",
      rawScale: "0-100",
      rawTokenConfidences: [91, null],
      rawMean: 91,
      rawMin: 91,
      rawMax: 91,
      missingTokenCount: 1,
    };
    const provenance: AnalyzerCandidateProvenance = {
      passId: "pass-1-full-image",
      passKind: "full-image-primary",
      triggerReasons: [],
      preprocessing: [],
      regionName: "full-image",
      supportingPassIds: [],
      supportingPassKinds: [],
      recoveryPassUsed: false,
    };
    const geometry: EvidenceGeometry = {
      imageIndex: 0,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      imageWidth: 2,
      imageHeight: 2,
    };
    const score: BrandCandidateScore = {
      positiveSignal: 0,
      meaningfulChars: 0,
      structure: 0,
      ocrEvidenceScore: 0,
      prominence: 0,
      area: 0,
      centrality: 0,
      alignment: 0,
      lineProximity: 0,
      residualPenalty: 0,
      lowInformationPenalty: 0,
      total: 0,
    };

    expect(new Set(ANALYZER_OCR_CONFIDENCE_KEYS)).toEqual(new Set(Object.keys(ocrConfidence)));
    expect(new Set(ANALYZER_CANDIDATE_PROVENANCE_KEYS)).toEqual(new Set(Object.keys(provenance)));
    expect(new Set(EVIDENCE_GEOMETRY_KEYS)).toEqual(new Set(Object.keys(geometry)));
    expect(new Set(BRAND_CANDIDATE_SCORE_KEYS)).toEqual(new Set(Object.keys(score)));
  });

  it("derives the RegionOcrResult key set from a typed exemplar", () => {
    const pass: RegionOcrResult = {
      passId: "pass-1-full-image",
      regionName: "full-image",
      passKind: "full-image-primary",
      triggerReasons: [],
      preprocessing: [],
      fieldEligibility: { brand: true, alcohol: true },
      transform: {
        crop: { left: 0, top: 0, width: 1, height: 1 },
        rotate: 0,
        scale: 1,
        originalWidth: 1,
        originalHeight: 1,
      },
      transformedSize: { width: 1, height: 1 },
      pageSegMode: 11,
      rawWordCount: 0,
      discardedWordCount: 0,
      timings: { preprocessMs: 0, ocrMs: 0, inverseMappingMs: 0, totalMs: 0 },
      words: [],
    };
    expect(new Set(REGION_OCR_RESULT_KEYS)).toEqual(new Set(Object.keys(pass)));
    // Order matters for the semantic preimage, so it is asserted separately.
    expect([...REGION_OCR_RESULT_KEYS]).toEqual(Object.keys(pass));
  });

  it("derives the candidate key set from what production actually emits", () => {
    // The strongest available guard: run the real selector, adapt one real
    // candidate, and require the frozen schema to describe exactly that record.
    const words: OcrWord[] = ["RED", "BRICK", "WINERY"].map((text, index) => {
      const x0 = 40 + index * 220;
      return {
        text,
        rawConfidence: 92,
        bbox: { x0, y0: 100, x1: x0 + text.length * 20, y1: 160 },
        originalGeometry: {
          imageIndex: 0,
          x: x0,
          y: 100,
          width: text.length * 20,
          height: 60,
          imageWidth: 1600,
          imageHeight: 1200,
        },
      };
    });
    const pass = {
      passId: "pass-1-full-image",
      regionName: "full-image",
      passKind: "full-image-primary",
      triggerReasons: [],
      preprocessing: [],
      fieldEligibility: { brand: true, alcohol: true },
      pageSegMode: 11,
      transform: {
        crop: { left: 0, top: 0, width: 1600, height: 1200 },
        rotate: 0,
        scale: 1,
        originalWidth: 1600,
        originalHeight: 1200,
      },
      transformedSize: { width: 1600, height: 1200 },
      rawWordCount: words.length,
      discardedWordCount: 0,
      words,
      timings: { preprocessMs: 0, ocrMs: 0, inverseMappingMs: 0, totalMs: 0 },
    } as unknown as RegionOcrResult;

    // Through the ONLY public entry point: the complete ExtractionDebug. There is
    // no runtime backdoor and no caller-supplied selection.
    const primaryBrand = selectBrandObservation([pass]);
    const debug = {
      decoded: { width: 1600, height: 1200, format: "png" },
      passes: [pass],
      primarySelections: { brand: primaryBrand, alcohol: primaryBrand },
      finalSelections: { brand: primaryBrand, alcohol: primaryBrand },
    } as unknown as ExtractionDebug;
    const { diagnosticSelection, candidateRecords } = finalizeProductionBrandEvidence(
      debug,
      "item-0001",
    );
    expect(diagnosticSelection.brandDiagnostics?.candidates.length).toBeGreaterThan(0);
    const [record] = candidateRecords;
    const derived = new Set(["canonicalRecordSha256", "stableCandidateId"]);
    expect(new Set(Object.keys(record).filter((key) => !derived.has(key)))).toEqual(
      new Set(CANDIDATE_EVIDENCE_REQUIRED_KEYS),
    );
  });
});
