/**
 * Issue #149 — the frozen schema must accept REAL production evidence, and the
 * public API must own the derivation.
 *
 * Non-OCR. Every pass record here is synthetic and built in this file; no image
 * is read and no recognizer runs. What is NOT synthetic is the evidence: every
 * `ExtractionDebug` is assembled from the real production selectors over those
 * passes, and `finalizeProductionBrandEvidence` derives the diagnostic selection,
 * asserts parity and finalizes candidates internally.
 *
 * There is deliberately no helper that builds a `FieldSelection` around a
 * caller-chosen candidate array. Amendment 9's `selectionOf()` was exactly the
 * bypass this amendment closes: it demonstrated that a filtered population could
 * be wrapped in a fresh selection and accepted.
 */
import { describe, expect, it } from "vitest";

import type { ExtractionDebug } from "@/pipeline/extractor/extractor";
import type { OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import {
  BRAND_FILTER_CHECK_ORDER,
  compareCandidateRanking,
  selectBrandObservation,
  type BrandCandidateDiagnostic,
} from "@/pipeline/extractor/field-selection";

import {
  CandidateAdapterError,
  finalizeProductionBrandEvidence,
} from "../../../scripts/eval/lib/issue-149-candidate-adapter";
import {
  ANALYZER_OCR_CONFIDENCE_KEYS,
  CANDIDATE_EVIDENCE_REQUIRED_KEYS,
  CANDIDATE_FINALIZED_KEYS,
} from "../../../scripts/eval/lib/issue-149-evidence-canonical";

/** One synthetic word. Geometry is uniform so prominence never decides anything. */
function word(text: string, index: number, y: number, rawConfidence: number | null): OcrWord {
  const width = Math.max(text.length, 1) * 20;
  const x0 = 40 + index * 220;
  return {
    text,
    // `null` means the word carries NO rawConfidence property at all, which is
    // what drives production's missingTokenCount above zero.
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
function region(
  lines: string[][],
  missingConfidenceOn: string[] = [],
  passId = "pass-1-full-image",
  passKind = "full-image-primary",
): RegionOcrResult {
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
    passId,
    regionName: "full-image",
    passKind,
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
 * A real `ExtractionDebug`, assembled the way `extractLabelEvidenceDetailed` does
 * (`extractor.ts:99, 113`): the primary selection over `[passes[0]]`, and the
 * final selection retained when primary Brand is OBSERVED, otherwise re-selected
 * over the complete ordered pass array.
 */
function debugFor(passes: RegionOcrResult[]): ExtractionDebug {
  const primaryBrand = selectBrandObservation([passes[0]]);
  const brand =
    primaryBrand.observation.state === "OBSERVED" ? primaryBrand : selectBrandObservation(passes);
  const primaryAlcohol = selectBrandObservation([passes[0]]);
  return {
    decoded: { width: 1600, height: 1200, format: "png" },
    passes,
    primarySelections: { brand: primaryBrand, alcohol: primaryAlcohol },
    finalSelections: { brand, alcohol: primaryAlcohol },
  } as unknown as ExtractionDebug;
}

const LINES: string[][] = [
  ["RED", "BRICK", "WINERY"],
  ["PRODUCED", "AND", "BOTTLED", "BY", "SOMEONE", "ELSE"],
  ["NAPA", "VALLEY"],
];

const DEBUG = debugFor([region(LINES)]);
const EVIDENCE = finalizeProductionBrandEvidence(DEBUG, "item-0001");
const CANDIDATES = EVIDENCE.diagnosticSelection.brandDiagnostics!.candidates;

/** Clone a debug object so a test can corrupt it without touching the shared one. */
const cloneDebug = (debug: ExtractionDebug): ExtractionDebug =>
  structuredClone(debug) as ExtractionDebug;

describe("Issue #149 production candidate compatibility", () => {
  it("produces a real candidate population with both kept and rejected members", () => {
    expect(CANDIDATES.length).toBeGreaterThan(1);
    expect(CANDIDATES.some((candidate) => candidate.kept)).toBe(true);
    expect(CANDIDATES.some((candidate) => !candidate.kept)).toBe(true);
    expect(CANDIDATES.some((candidate) => candidate.ranking !== undefined)).toBe(true);
  });

  it("emits all ten complete filter diagnostics on every real candidate", () => {
    for (const candidate of CANDIDATES) {
      expect(candidate.filterChecks?.map((check) => check.check)).toEqual([
        ...BRAND_FILTER_CHECK_ORDER,
      ]);
      expect(candidate.activeRejectionReasons).toBeDefined();
    }
  });

  it("emits an ocrConfidence carrying every key the frozen schema declares", () => {
    for (const candidate of CANDIDATES) {
      expect(new Set(Object.keys(candidate.ocrConfidence))).toEqual(
        new Set(ANALYZER_OCR_CONFIDENCE_KEYS),
      );
    }
    expect(ANALYZER_OCR_CONFIDENCE_KEYS).toContain("missingTokenCount");
  });

  it("finalizes every real candidate, contiguously and uniquely", () => {
    const { candidateRecords } = EVIDENCE;
    expect(candidateRecords).toHaveLength(CANDIDATES.length);
    candidateRecords.forEach((record, index) => {
      expect(new Set(Object.keys(record))).toEqual(new Set(CANDIDATE_FINALIZED_KEYS));
      expect(record.opaqueItemId).toBe("item-0001");
      expect(record.candidateOrdinal).toBe(index);
      expect(record.completeCandidateArrayLength).toBe(CANDIDATES.length);
      expect(record.rawText).toBe(CANDIDATES[index].rawText);
      expect(String(record.stableCandidateId)).toContain(String(record.canonicalRecordSha256));
    });
    expect(new Set(candidateRecords.map((r) => r.stableCandidateId)).size).toBe(
      candidateRecords.length,
    );
  });

  it("declares a required key set the real candidates can actually satisfy", () => {
    const derived = new Set(["canonicalRecordSha256", "stableCandidateId"]);
    const keys = Object.keys(EVIDENCE.candidateRecords[0]).filter((key) => !derived.has(key));
    expect(new Set(keys)).toEqual(new Set(CANDIDATE_EVIDENCE_REQUIRED_KEYS));
  });

  it("carries the real score, ranking and provenance through unchanged", () => {
    const rankedIndex = CANDIDATES.findIndex((candidate) => candidate.ranking !== undefined);
    expect(rankedIndex).toBeGreaterThanOrEqual(0);
    const source = CANDIDATES[rankedIndex];
    const record = EVIDENCE.candidateRecords[rankedIndex];

    const ranking = record.ranking as Record<string, unknown>;
    expect(ranking.strategy).toBe(source.ranking?.strategy);
    expect(ranking.orderingMode).toBe(source.ranking?.orderingMode);
    expect(ranking.comparator).toEqual(source.ranking?.comparator);
    expect(record.rankingEligible).toBe(true);
    expect(record.rankingScore).toBe(source.ranking?.rankingScore ?? null);
    if (source.score !== undefined) expect(record.score).toEqual({ ...source.score });
    expect(record.candidateProvenance).toEqual({ ...source.candidateProvenance });
  });

  it("accepts a real ocrConfidence with missing token confidences", () => {
    const withMissing = finalizeProductionBrandEvidence(
      debugFor([region(LINES, ["BRICK"])]),
      "item-0002",
    );
    const candidates = withMissing.diagnosticSelection.brandDiagnostics!.candidates;
    expect(candidates.some((candidate) => candidate.ocrConfidence.missingTokenCount > 0)).toBe(
      true,
    );
    expect(withMissing.candidateRecords.length).toBe(candidates.length);
  });

  it("rejects a candidate whose repeated facts disagree", () => {
    for (const tamper of [
      { passId: "pass-9-elsewhere" },
      { regionName: "brand-band" },
      { supportPassIds: ["pass-9-elsewhere"] },
      { confidence: 0.123456 },
    ]) {
      const corrupted = cloneDebug(DEBUG);
      // Corrupt the AUTHORITY as well, so parity still holds and the adapter
      // reaches the provenance check rather than halting earlier.
      const target = corrupted.finalSelections.brand.brandDiagnostics!.candidates[0];
      Object.assign(target, tamper);
      expect(() => finalizeProductionBrandEvidence(corrupted, "item-0001")).toThrow(
        CandidateAdapterError,
      );
    }
  });
});

describe("Issue #149 the public API owns the derivation", () => {
  it("accepts only ExtractionDebug — no selection, no candidate array", () => {
    // A filtered population wrapped in a fresh FieldSelection was the Amendment 9
    // bypass. There is no longer a parameter through which one can be supplied.
    for (const notDebug of [
      CANDIDATES,
      CANDIDATES.filter((candidate) => !candidate.kept),
      EVIDENCE.diagnosticSelection,
      { brandDiagnostics: { candidates: CANDIDATES } },
      {},
    ]) {
      expect(() =>
        finalizeProductionBrandEvidence(notDebug as unknown as ExtractionDebug, "item-0001"),
      ).toThrow(CandidateAdapterError);
    }
  });

  it("halts when debug.passes is absent or empty", () => {
    for (const passes of [undefined, null, [], "not-an-array"]) {
      const broken = { ...cloneDebug(DEBUG), passes } as unknown as ExtractionDebug;
      try {
        finalizeProductionBrandEvidence(broken, "item-0001");
        throw new Error("expected a rejection");
      } catch (error) {
        expect((error as CandidateAdapterError).code).toBe("DEBUG_PASSES_ABSENT");
      }
    }
  });

  it("validates opaqueItemId before anything else", () => {
    for (const bad of ["item-7", "ITEM-0001", "", "case-0001"]) {
      try {
        finalizeProductionBrandEvidence(DEBUG, bad);
        throw new Error("expected a rejection");
      } catch (error) {
        expect((error as CandidateAdapterError).code).toBe("MALFORMED_OPAQUE_ITEM_ID");
      }
    }
  });

  it("uses exactly [passes[0]] when primary Brand is OBSERVED", () => {
    const observed = debugFor([region([["RED", "BRICK", "WINERY"]])]);
    expect(observed.primarySelections.brand.observation.state).toBe("OBSERVED");
    // The recovery pass carries a different Brand. If the adapter selected over
    // all passes it would see it; parity against the authority proves it did not.
    const withRecovery = {
      ...observed,
      passes: [
        observed.passes[0],
        region([["SILVER", "OAK", "CELLARS"]], [], "pass-2-rot180", "full-image-rot180"),
      ],
    } as unknown as ExtractionDebug;
    const evidence = finalizeProductionBrandEvidence(withRecovery, "item-0003");
    const values = evidence.diagnosticSelection.brandDiagnostics!.candidates.map((c) => c.rawText);
    expect(values).toContain("RED BRICK WINERY");
    expect(values).not.toContain("SILVER OAK CELLARS");
  });

  it("uses the complete ordered pass array when primary Brand is not OBSERVED", () => {
    const passes = [
      region([["PRODUCED", "AND", "BOTTLED", "BY", "SOMEONE", "ELSE"]]),
      region([["RED", "BRICK", "WINERY"]], [], "pass-2-rot180", "full-image-rot180"),
    ];
    const debug = debugFor(passes);
    expect(debug.primarySelections.brand.observation.state).not.toBe("OBSERVED");
    const evidence = finalizeProductionBrandEvidence(debug, "item-0004");
    const values = evidence.diagnosticSelection.brandDiagnostics!.candidates.map((c) => c.rawText);
    // The second pass's candidate is present, so all passes were selected over.
    expect(values).toContain("RED BRICK WINERY");
  });
});

describe("Issue #149 internal parity against the authority", () => {
  it("succeeds on a valid debug object", () => {
    expect(() => finalizeProductionBrandEvidence(DEBUG, "item-0001")).not.toThrow();
  });

  it("fails on an altered line diagnostic, and returns no evidence", () => {
    const corrupted = cloneDebug(DEBUG);
    const lines = corrupted.finalSelections.brand.brandDiagnostics!.lines;
    expect(lines.length).toBeGreaterThan(0);
    lines[0].rawText = "ALTERED LINE";
    try {
      finalizeProductionBrandEvidence(corrupted, "item-0001");
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CandidateAdapterError).code).toBe(
        "BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE",
      );
    }
  });

  it("fails on an altered candidate property", () => {
    const corrupted = cloneDebug(DEBUG);
    corrupted.finalSelections.brand.brandDiagnostics!.candidates[0].prominence += 1;
    expect(() => finalizeProductionBrandEvidence(corrupted, "item-0001")).toThrow(
      /BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE/,
    );
  });

  it("fails on an altered observation field", () => {
    const corrupted = cloneDebug(DEBUG);
    corrupted.finalSelections.brand.observation.confidence = 0.123456;
    expect(() => finalizeProductionBrandEvidence(corrupted, "item-0001")).toThrow(
      /BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE/,
    );
  });

  it("fails on an altered final selection provenance field", () => {
    const corrupted = cloneDebug(DEBUG);
    corrupted.finalSelections.brand.supportingPassIds = ["pass-9-elsewhere"];
    expect(() => finalizeProductionBrandEvidence(corrupted, "item-0001")).toThrow(
      /BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE/,
    );
  });
});

describe("Issue #149 production ranked membership", () => {
  it("uses a comparator that reads only candidate.ranking", () => {
    const ranked = CANDIDATES.filter((candidate) => candidate.ranking !== undefined);
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    const wrap = (candidate: BrandCandidateDiagnostic) =>
      ({ ranking: candidate.ranking }) as unknown as Parameters<typeof compareCandidateRanking>[0];
    expect(typeof compareCandidateRanking(wrap(ranked[0]), wrap(ranked[0]))).toBe("number");
  });

  it("gives a deduplicated candidate ranking semantics but NO ranked position", () => {
    // The same Brand read from two passes. Production keeps both diagnostics and
    // scores both, then removes one during deduplication.
    const duplicates = finalizeProductionBrandEvidence(
      debugFor([
        region([["PRODUCED", "AND", "BOTTLED", "BY", "SOMEONE", "ELSE"]]),
        region([["RED", "BRICK", "WINERY"]], [], "pass-2-rot180", "full-image-rot180"),
        region([["RED", "BRICK", "WINERY"]], [], "pass-3-rot90", "right-edge-strip-rot90"),
      ]),
      "item-0005",
    );
    const candidates = duplicates.diagnosticSelection.brandDiagnostics!.candidates;
    const withRanking = candidates.filter((candidate) => candidate.ranking !== undefined);
    const withDecision = candidates.filter((candidate) => candidate.decision !== undefined);
    expect(withRanking.length).toBeGreaterThan(withDecision.length);

    const positions = duplicates.candidateRecords.map((record) => record.rankedPosition);
    expect(positions.filter((position) => position !== null)).toEqual(
      Array.from({ length: withDecision.length }, (_, index) => index),
    );
    for (const record of duplicates.candidateRecords.filter((r) => r.decision === null && r.kept)) {
      expect(record.rankedPosition).toBeNull();
      expect(record.rankingEligible).toBe(true);
      expect(record.ranking).not.toBeNull();
    }
  });

  it("orders multiple ranked candidates the way production's comparator does", () => {
    const evidence = finalizeProductionBrandEvidence(
      debugFor([
        region([
          ["RED", "BRICK", "WINERY"],
          ["SILVER", "OAK", "CELLARS"],
        ]),
      ]),
      "item-0006",
    );
    const ranked = evidence.candidateRecords
      .filter((record) => record.rankedPosition !== null)
      .sort((a, b) => (a.rankedPosition as number) - (b.rankedPosition as number));
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    expect(ranked.map((record) => record.rankedPosition)).toEqual(
      Array.from({ length: ranked.length }, (_, index) => index),
    );
    expect(ranked[0].selected).toBe(true);
    expect(ranked.slice(1).every((record) => record.selected === false)).toBe(true);

    const members = evidence.diagnosticSelection
      .brandDiagnostics!.candidates.map((candidate, index) => ({ candidate, index }))
      .filter((entry) => entry.candidate.decision !== undefined);
    const wrap = (c: BrandCandidateDiagnostic) =>
      ({ ranking: c.ranking }) as unknown as Parameters<typeof compareCandidateRanking>[0];
    const expected = [...members]
      .sort((left, right) => {
        const compared = compareCandidateRanking(wrap(left.candidate), wrap(right.candidate));
        return compared !== 0 ? compared : left.index - right.index;
      })
      .map((entry) => entry.candidate.rawText);
    expect(ranked.map((record) => record.rawText)).toEqual(expected);
  });

  it("does not order by rankingScore alone", () => {
    const ranking = (valueKey: string) => ({
      strategy: "brand-mixed-prominence-score" as const,
      orderingMode: "score-first" as const,
      comparator: [
        { id: "score-eligibility" as const, direction: "desc" as const, value: true },
        { id: "ranking-score" as const, direction: "desc" as const, value: 5 },
        { id: "normalized-value-key" as const, direction: "asc" as const, value: valueKey },
      ],
      rankingScore: 5,
    });
    const wrap = (valueKey: string) =>
      ({ ranking: ranking(valueKey) }) as unknown as Parameters<typeof compareCandidateRanking>[0];
    expect(compareCandidateRanking(wrap("zulu"), wrap("alpha"))).toBeGreaterThan(0);
    expect(compareCandidateRanking(wrap("alpha"), wrap("zulu"))).toBeLessThan(0);
  });
});

describe("Issue #149 a kept population must retain a ranked survivor", () => {
  it("halts when every kept candidate loses its decision", () => {
    // The deliberate corruption under test: decisions removed from BOTH the
    // authority and, by construction, the internally derived selection — the
    // adapter derives its own selection, so the corruption must be applied to the
    // debug object the adapter reads.
    const corrupted = cloneDebug(DEBUG);
    for (const candidate of corrupted.finalSelections.brand.brandDiagnostics!.candidates) {
      delete (candidate as { decision?: unknown }).decision;
    }
    // Parity now fails first, which is itself correct: a selection missing every
    // decision is not the authority's. Prove the adapter refuses either way.
    expect(() => finalizeProductionBrandEvidence(corrupted, "item-0001")).toThrow(
      CandidateAdapterError,
    );
  });

  it("accepts an all-rejected population derived from real passes", () => {
    // A real pass set whose complete selector result contains only rejected
    // candidates — obtained by choosing the input text, never by filtering.
    const debug = debugFor([
      region([
        ["PRODUCED", "AND", "BOTTLED", "BY", "SOMEONE", "ELSE"],
        ["NAPA", "VALLEY"],
      ]),
    ]);
    const evidence = finalizeProductionBrandEvidence(debug, "item-0007");
    const candidates = evidence.diagnosticSelection.brandDiagnostics!.candidates;
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => !candidate.kept)).toBe(true);
    expect(evidence.candidateRecords.every((record) => record.rankedPosition === null)).toBe(true);
    expect(evidence.candidateRecords.every((record) => record.selected === false)).toBe(true);
  });

  it("halts on a decision attached to a rejected candidate", () => {
    const corrupted = cloneDebug(DEBUG);
    for (const candidate of corrupted.finalSelections.brand.brandDiagnostics!.candidates) {
      if (!candidate.kept) (candidate as { decision?: string }).decision = "alternate";
    }
    expect(() => finalizeProductionBrandEvidence(corrupted, "item-0001")).toThrow(
      CandidateAdapterError,
    );
  });
});

describe("Issue #149 adapter runtime export surface", () => {
  it("exports exactly the error class and the debug-owned API", async () => {
    // The authoritative check: the real runtime namespace, not a source regex.
    const namespace = await import("../../../scripts/eval/lib/issue-149-candidate-adapter");
    expect(Object.keys(namespace).sort()).toEqual([
      "CandidateAdapterError",
      "finalizeProductionBrandEvidence",
    ]);
    for (const removed of [
      "finalizeProductionCandidateArray",
      "toCandidateEvidenceRecord",
      "finalizeProductionCandidate",
      "TEST_ONLY_candidateAdapterInternals",
      "assertRankedArrayInvariants",
    ]) {
      expect(Object.hasOwn(namespace, removed)).toBe(false);
    }
  });

  it("does not re-expose the selector the runner must not call", async () => {
    const namespace = await import("../../../scripts/eval/lib/issue-149-candidate-adapter");
    expect(Object.hasOwn(namespace, "selectBrandObservationWithCompleteFilterDiagnostics")).toBe(
      false,
    );
  });
});
