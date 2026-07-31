/**
 * Issue #149 — the frozen schema must accept REAL production candidates.
 *
 * Non-OCR. Every pass record here is synthetic and built in this file; no image
 * is read and no recognizer runs. What is NOT synthetic is the candidate
 * evidence: this test calls the real
 * `selectBrandObservationWithCompleteFilterDiagnostics` and finalizes the actual
 * `BrandCandidateDiagnostic` objects production emits.
 *
 * That distinction is the point. Amendment 5's closed schema listed six
 * `ocrConfidence` keys where production emits seven, and both the synthetic
 * schema tests and a hard-coded "drift guard" repeated the same wrong list — so
 * CI stayed green while the Stage 2 adapter would have failed on every actual
 * candidate. A synthetic-only test cannot expose that; driving the real selector
 * can.
 */
import { describe, expect, it } from "vitest";

import type { OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import {
  BRAND_FILTER_CHECK_ORDER,
  selectBrandObservationWithCompleteFilterDiagnostics,
  type BrandCandidateDiagnostic,
} from "@/pipeline/extractor/field-selection";

import {
  finalizeProductionCandidate,
  finalizeProductionCandidateArray,
  toCandidateEvidenceRecord,
  CandidateAdapterError,
} from "../../../scripts/eval/lib/issue-149-candidate-adapter";
import {
  ANALYZER_OCR_CONFIDENCE_KEYS,
  CANDIDATE_EVIDENCE_REQUIRED_KEYS,
  CANDIDATE_FINALIZED_KEYS,
  assertCompleteCandidateEvidenceRecord,
} from "../../../scripts/eval/lib/issue-149-evidence-canonical";

/** One synthetic word. Geometry is uniform so prominence never decides anything. */
function word(text: string, index: number, y: number, rawConfidence: number | null): OcrWord {
  const width = Math.max(text.length, 1) * 20;
  const x0 = 40 + index * 220;
  return {
    text,
    // `null` means the word carries NO rawConfidence property at all, which is
    // what drives production's missingTokenCount above zero. A `undefined`
    // argument would silently take a default parameter instead.
    ...(rawConfidence === null ? {} : { rawConfidence }),
    bbox: { x0, y0: y, x1: x0 + width, y1: y + 60 },
    originalGeometry: {
      imageIndex: 0,
      x: x0,
      y,
      width,
      height: 60,
      imageWidth: 1600,
      imageHeight: 1200,
    },
  } as OcrWord;
}

/** One synthetic single-pass region result containing the given lines. */
function region(lines: string[][], missingConfidenceOn: string[] = []): RegionOcrResult {
  const words: OcrWord[] = [];
  lines.forEach((line, lineIndex) => {
    line.forEach((text, wordIndex) =>
      words.push(
        word(
          text,
          wordIndex,
          100 + lineIndex * 200,
          missingConfidenceOn.includes(text) ? null : 92,
        ),
      ),
    );
  });
  return {
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
}

/**
 * A corpus that reliably produces both sides of the ladder: a rejected
 * producer-line span and a kept, ranked, selected brand span.
 */
const LINES: string[][] = [
  ["RED", "BRICK", "WINERY"],
  ["PRODUCED", "AND", "BOTTLED", "BY", "SOMEONE", "ELSE"],
  ["NAPA", "VALLEY"],
];

function productionCandidates(
  lines: string[][] = LINES,
  missingConfidenceOn: string[] = [],
): BrandCandidateDiagnostic[] {
  const selection = selectBrandObservationWithCompleteFilterDiagnostics([
    region(lines, missingConfidenceOn),
  ]);
  return selection.brandDiagnostics?.candidates ?? [];
}

describe("Issue #149 production candidate compatibility", () => {
  const candidates = productionCandidates();

  it("produces a real candidate population with both kept and rejected members", () => {
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.some((candidate) => candidate.kept)).toBe(true);
    expect(candidates.some((candidate) => !candidate.kept)).toBe(true);
    // At least one candidate must be ranked, or the ranking path is untested.
    expect(candidates.some((candidate) => candidate.ranking !== undefined)).toBe(true);
  });

  it("emits all ten complete filter diagnostics on every real candidate", () => {
    for (const candidate of candidates) {
      expect(candidate.filterChecks).toBeDefined();
      expect(candidate.activeRejectionReasons).toBeDefined();
      expect(candidate.filterChecks?.map((check) => check.check)).toEqual([
        ...BRAND_FILTER_CHECK_ORDER,
      ]);
    }
  });

  it("emits an ocrConfidence carrying every key the frozen schema declares", () => {
    // The Amendment 5 defect, stated as an assertion: the real object's key set
    // must EQUAL the frozen list, in both directions.
    for (const candidate of candidates) {
      expect(new Set(Object.keys(candidate.ocrConfidence))).toEqual(
        new Set(ANALYZER_OCR_CONFIDENCE_KEYS),
      );
    }
    expect(ANALYZER_OCR_CONFIDENCE_KEYS).toContain("missingTokenCount");
  });

  it("finalizes every real candidate through the reference adapter", () => {
    const finalized = finalizeProductionCandidateArray(candidates, "item-0001");
    expect(finalized).toHaveLength(candidates.length);

    finalized.forEach((record, index) => {
      expect(new Set(Object.keys(record))).toEqual(new Set(CANDIDATE_FINALIZED_KEYS));
      expect(record.opaqueItemId).toBe("item-0001");
      expect(record.candidateOrdinal).toBe(index);
      expect(record.completeCandidateArrayLength).toBe(candidates.length);
      expect(String(record.canonicalRecordSha256)).toMatch(/^[0-9a-f]{64}$/);
      expect(String(record.stableCandidateId)).toContain(String(record.canonicalRecordSha256));
    });

    // Identity is unique and ordinals are contiguous from 0.
    const ids = finalized.map((record) => record.stableCandidateId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(finalized.map((r) => r.candidateOrdinal)).toEqual(
      Array.from({ length: candidates.length }, (_, i) => i),
    );
  });

  it("carries the real score and ranking structures through unchanged", () => {
    const ranked = candidates.find((candidate) => candidate.ranking !== undefined);
    expect(ranked).toBeDefined();
    const record = toCandidateEvidenceRecord(ranked!, {
      opaqueItemId: "item-0001",
      candidateOrdinal: 0,
      completeCandidateArrayLength: candidates.length,
      rankedPosition: 0,
    });
    expect(() => assertCompleteCandidateEvidenceRecord(record)).not.toThrow();

    const ranking = record.ranking as Record<string, unknown>;
    expect(ranking.strategy).toBe(ranked!.ranking?.strategy);
    expect(ranking.orderingMode).toBe(ranked!.ranking?.orderingMode);
    expect(ranking.comparator).toEqual(ranked!.ranking?.comparator);
    expect(record.rankingEligible).toBe(true);
    expect(record.rankingScore).toBe(ranked!.ranking?.rankingScore ?? null);
    if (ranked!.score !== undefined) {
      expect(record.score).toEqual({ ...ranked!.score });
    }
  });

  it("carries the real candidateProvenance through unchanged", () => {
    const record = toCandidateEvidenceRecord(candidates[0], {
      opaqueItemId: "item-0001",
      candidateOrdinal: 0,
      completeCandidateArrayLength: candidates.length,
      rankedPosition: null,
    });
    expect(record.candidateProvenance).toEqual({ ...candidates[0].candidateProvenance });
  });

  it("accepts a real ocrConfidence with missing token confidences", () => {
    // A word without rawConfidence drives missingTokenCount above zero and the
    // aggregates to their null-or-derived forms, which the validator now checks.
    const withMissing = productionCandidates(LINES, ["BRICK"]);
    expect(withMissing.length).toBeGreaterThan(0);
    const anyMissing = withMissing.some(
      (candidate) => candidate.ocrConfidence.missingTokenCount > 0,
    );
    expect(anyMissing).toBe(true);
    expect(() => finalizeProductionCandidateArray(withMissing, "item-0002")).not.toThrow();
  });

  it("requires the complete-diagnostics entry point", () => {
    const withoutDiagnostics = { ...candidates[0] };
    delete (withoutDiagnostics as { filterChecks?: unknown }).filterChecks;
    expect(() =>
      finalizeProductionCandidate(withoutDiagnostics, {
        opaqueItemId: "item-0001",
        candidateOrdinal: 0,
        completeCandidateArrayLength: 1,
        rankedPosition: null,
      }),
    ).toThrow(CandidateAdapterError);
  });

  it("rejects a candidate whose repeated facts disagree", () => {
    for (const tamper of [
      { passId: "pass-9-elsewhere" },
      { regionName: "brand-band" },
      { supportPassIds: ["pass-9-elsewhere"] },
      { confidence: 0.123456 },
    ]) {
      const tampered = { ...candidates[0], ...tamper } as BrandCandidateDiagnostic;
      expect(() =>
        finalizeProductionCandidate(tampered, {
          opaqueItemId: "item-0001",
          candidateOrdinal: 0,
          completeCandidateArrayLength: 1,
          rankedPosition: null,
        }),
      ).toThrow(CandidateAdapterError);
    }
  });

  it("declares a required key set the real candidates can actually satisfy", () => {
    // Every required key must be produced by the adapter from real input; a key
    // no adapter can fill would block Stage 2 exactly as the six-key
    // ocrConfidence list would have.
    const record = toCandidateEvidenceRecord(candidates[0], {
      opaqueItemId: "item-0001",
      candidateOrdinal: 0,
      completeCandidateArrayLength: candidates.length,
      rankedPosition: null,
    });
    expect(new Set(Object.keys(record))).toEqual(new Set(CANDIDATE_EVIDENCE_REQUIRED_KEYS));
  });
});
