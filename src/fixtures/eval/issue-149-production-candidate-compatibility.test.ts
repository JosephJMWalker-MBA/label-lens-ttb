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
  compareCandidateRanking,
  selectBrandObservationWithCompleteFilterDiagnostics,
  type BrandCandidateDiagnostic,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";

import {
  CandidateAdapterError,
  finalizeProductionCandidateArray,
} from "../../../scripts/eval/lib/issue-149-candidate-adapter";

/**
 * The adapter exposes ONE function. There is no runtime test-only backdoor, so
 * these tests reach candidate construction the same way Stage 2 will: through the
 * complete diagnostic selection.
 */
function selectionOf(candidates: BrandCandidateDiagnostic[]): FieldSelection {
  return {
    observation: {
      state: "NOT_OBSERVED",
      value: null,
      confidence: 0,
      ocrEvidenceScore: 0,
      alternates: [],
    },
    sourceRegion: null,
    source: null,
    supportingPassIds: [],
    recoveryPassUsed: false,
    brandDiagnostics: { lines: [], candidates },
  } as unknown as FieldSelection;
}

/** One finalized record, obtained through the only public entry point. */
function finalizeOne(candidate: BrandCandidateDiagnostic, opaqueItemId = "item-0001") {
  return finalizeProductionCandidateArray(selectionOf([candidate]), opaqueItemId)[0];
}
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
    const finalized = finalizeProductionCandidateArray(selectionOf(candidates), "item-0001");
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
    const record = finalizeOne(ranked!, "item-0001");
    // Finalization already validated the complete schema; re-validating a
    // finalized record would correctly halt with ALREADY_FINALIZED.
    expect(String(record.canonicalRecordSha256)).toMatch(/^[0-9a-f]{64}$/);

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
    const record = finalizeOne(candidates[0], "item-0001");
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
    expect(() =>
      finalizeProductionCandidateArray(selectionOf(withMissing), "item-0002"),
    ).not.toThrow();
  });

  it("requires the complete-diagnostics entry point", () => {
    const withoutDiagnostics = { ...candidates[0] };
    delete (withoutDiagnostics as { filterChecks?: unknown }).filterChecks;
    expect(() => finalizeOne(withoutDiagnostics, "item-0001")).toThrow(CandidateAdapterError);
  });

  it("rejects a candidate whose repeated facts disagree", () => {
    for (const tamper of [
      { passId: "pass-9-elsewhere" },
      { regionName: "brand-band" },
      { supportPassIds: ["pass-9-elsewhere"] },
      { confidence: 0.123456 },
    ]) {
      const tampered = { ...candidates[0], ...tamper } as BrandCandidateDiagnostic;
      expect(() => finalizeOne(tampered, "item-0001")).toThrow(CandidateAdapterError);
    }
  });

  it("declares a required key set the real candidates can actually satisfy", () => {
    // Every required key must be produced by the adapter from real input; a key
    // no adapter can fill would block Stage 2 exactly as the six-key
    // ocrConfidence list would have.
    const record = finalizeOne(candidates[0], "item-0001");
    const derived = new Set(["canonicalRecordSha256", "stableCandidateId"]);
    expect(new Set(Object.keys(record).filter((key) => !derived.has(key)))).toEqual(
      new Set(CANDIDATE_EVIDENCE_REQUIRED_KEYS),
    );
  });
});

/** Diagnostics from an arbitrary pass set, so multi-pass behaviour is reachable. */
function candidatesFrom(passes: RegionOcrResult[]): BrandCandidateDiagnostic[] {
  return (
    selectBrandObservationWithCompleteFilterDiagnostics(passes).brandDiagnostics?.candidates ?? []
  );
}

describe("Issue #149 production ranked membership", () => {
  it("uses a comparator that reads only candidate.ranking", () => {
    // The adapter wraps a diagnostic as `{ ranking }` before calling production's
    // comparator. That is faithful only while the comparator touches nothing
    // else, so the claim is checked against the real function rather than
    // assumed: two wrappers carrying only rankings must compare without throwing.
    const ranked = candidatesFrom([
      region([
        ["RED", "BRICK", "WINERY"],
        ["SILVER", "OAK", "CELLARS"],
      ]),
    ]).filter((candidate) => candidate.ranking !== undefined);
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    const wrap = (candidate: BrandCandidateDiagnostic) =>
      ({ ranking: candidate.ranking }) as unknown as Parameters<typeof compareCandidateRanking>[0];
    expect(() => compareCandidateRanking(wrap(ranked[0]), wrap(ranked[1]))).not.toThrow();
    expect(typeof compareCandidateRanking(wrap(ranked[0]), wrap(ranked[1]))).toBe("number");
  });

  it("gives a deduplicated candidate ranking semantics but NO ranked position", () => {
    // The same Brand read from two passes: production keeps both diagnostics,
    // scores both — so both carry `ranking` — and then removes one during
    // deduplication, so only the survivor receives a `decision`.
    const duplicates = candidatesFrom([
      region([["RED", "BRICK", "WINERY"]], [], "pass-1-full-image", "full-image-primary"),
      region([["RED", "BRICK", "WINERY"]], [], "pass-2-rot180", "full-image-rot180"),
    ]);
    const withRanking = duplicates.filter((candidate) => candidate.ranking !== undefined);
    const withDecision = duplicates.filter((candidate) => candidate.decision !== undefined);
    expect(withRanking.length).toBeGreaterThan(withDecision.length);
    expect(withDecision).toHaveLength(1);

    const finalized = finalizeProductionCandidateArray(selectionOf(duplicates), "item-0003");
    const positions = finalized.map((record) => record.rankedPosition);
    expect(positions.filter((position) => position !== null)).toEqual([0]);

    // The eliminated duplicate keeps its ranking evidence and gets no position.
    const eliminated = finalized.filter((record) => record.decision === null);
    expect(eliminated.length).toBeGreaterThan(0);
    for (const record of eliminated) {
      expect(record.rankedPosition).toBeNull();
      expect(record.selected).toBe(false);
      // Ranking semantics are still persisted — they are real evidence.
      expect(record.rankingEligible).toBe(true);
      expect(record.ranking).not.toBeNull();
    }
  });

  it("orders multiple ranked candidates the way production's comparator does", () => {
    const distinct = candidatesFrom([
      region([
        ["RED", "BRICK", "WINERY"],
        ["SILVER", "OAK", "CELLARS"],
      ]),
    ]);
    const rankedMembers = distinct.filter((candidate) => candidate.decision !== undefined);
    expect(rankedMembers.length).toBeGreaterThanOrEqual(2);

    const finalized = finalizeProductionCandidateArray(selectionOf(distinct), "item-0004");
    const positions = finalized
      .map((record, index) => ({ record, index }))
      .filter((entry) => entry.record.rankedPosition !== null)
      .sort((a, b) => (a.record.rankedPosition as number) - (b.record.rankedPosition as number));

    // Contiguous from 0, unique, and the selected candidate leads.
    expect(positions.map((entry) => entry.record.rankedPosition)).toEqual(
      Array.from({ length: positions.length }, (_, i) => i),
    );
    expect(positions[0].record.selected).toBe(true);
    expect(positions[0].record.decision).toBe("selected");
    expect(positions.slice(1).every((entry) => entry.record.selected === false)).toBe(true);

    // The order matches production's comparator applied to the same members.
    const expectedOrder = rankedMembers
      .map((candidate, index) => ({ candidate, index }))
      .sort((left, right) => {
        const wrap = (c: BrandCandidateDiagnostic) =>
          ({ ranking: c.ranking }) as unknown as Parameters<typeof compareCandidateRanking>[0];
        const compared = compareCandidateRanking(wrap(left.candidate), wrap(right.candidate));
        return compared !== 0 ? compared : left.index - right.index;
      })
      .map((entry) => entry.candidate.rawText);
    expect(positions.map((entry) => entry.record.rawText)).toEqual(expectedOrder);
  });

  it("does not order by rankingScore alone", () => {
    // A controlled synthetic ranking array where score ties but a later
    // comparator entry decides. Sorting on rankingScore alone would leave the
    // original order; production's comparator must reverse it.
    const ranking = (valueKey: string) => ({
      strategy: "brand-mixed-prominence-score" as const,
      orderingMode: "score-first" as const,
      comparator: [
        { id: "score-eligibility" as const, direction: "desc" as const, value: true },
        { id: "ranking-score" as const, direction: "desc" as const, value: 5 },
        { id: "prominence" as const, direction: "desc" as const, value: 60 },
        { id: "ocr-evidence-score" as const, direction: "desc" as const, value: 0.92 },
        { id: "normalized-value-key" as const, direction: "asc" as const, value: valueKey },
      ],
      rankingScore: 5,
    });
    const wrap = (valueKey: string) =>
      ({ ranking: ranking(valueKey) }) as unknown as Parameters<typeof compareCandidateRanking>[0];

    // Equal rankingScore, so a score-only sort returns 0 for every pair.
    expect(compareCandidateRanking(wrap("zulu"), wrap("alpha"))).toBeGreaterThan(0);
    expect(compareCandidateRanking(wrap("alpha"), wrap("zulu"))).toBeLessThan(0);
    expect(compareCandidateRanking(wrap("alpha"), wrap("alpha"))).toBe(0);
  });

  it("keeps original diagnostic-array order when the comparator ties", () => {
    // Two identical-in-every-comparator-entry candidates cannot be distinguished
    // by production, so the evidence order must be preserved rather than
    // arbitrarily permuted by the sort.
    const base = candidatesFrom([
      region([
        ["RED", "BRICK", "WINERY"],
        ["SILVER", "OAK", "CELLARS"],
      ]),
    ]).filter((candidate) => candidate.decision !== undefined);
    expect(base.length).toBeGreaterThanOrEqual(2);

    const tied = base.map((candidate, index) => ({
      ...candidate,
      ranking: { ...base[0].ranking!, comparator: [...base[0].ranking!.comparator] },
      decision: index === 0 ? ("selected" as const) : ("alternate" as const),
    }));
    const finalized = finalizeProductionCandidateArray(selectionOf(tied), "item-0005");
    expect(finalized.map((record) => record.rankedPosition)).toEqual(tied.map((_, index) => index));
    expect(finalized.map((record) => record.rawText)).toEqual(tied.map((c) => c.rawText));
  });

  it("halts when ranked membership or position parity is impossible", () => {
    const distinct = candidatesFrom([
      region([
        ["RED", "BRICK", "WINERY"],
        ["SILVER", "OAK", "CELLARS"],
      ]),
    ]);
    const member = distinct.find((candidate) => candidate.decision !== undefined)!;

    // A decision without ranking semantics cannot have come from production.
    const noRanking = distinct.map((candidate) =>
      candidate === member ? { ...candidate, ranking: undefined } : candidate,
    );
    try {
      finalizeProductionCandidateArray(selectionOf(noRanking), "item-0006");
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CandidateAdapterError).code).toBe("RANKED_MEMBERSHIP_INCONSISTENT");
    }

    // Two selected candidates cannot have come from production either.
    const twoSelected = distinct.map((candidate) =>
      candidate.decision === undefined
        ? candidate
        : { ...candidate, decision: "selected" as const },
    );
    try {
      finalizeProductionCandidateArray(selectionOf(twoSelected), "item-0006");
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CandidateAdapterError).code).toBe("RANKED_POSITION_PARITY_FAILURE");
    }
  });
});

describe("Issue #149 complete-selection candidate API", () => {
  const realSelection = selectBrandObservationWithCompleteFilterDiagnostics([region(LINES)]);

  it("accepts the real diagnostic FieldSelection", () => {
    const records = finalizeProductionCandidateArray(realSelection, "item-0001");
    expect(records.length).toBe(realSelection.brandDiagnostics?.candidates.length);
    expect(records.length).toBeGreaterThan(0);
  });

  it("takes the population from brandDiagnostics.candidates, not from the selection root", () => {
    // The workflow previously named `diagnosticSelection.candidates`, which does
    // not exist on FieldSelection.
    expect(Object.hasOwn(realSelection, "candidates")).toBe(false);
    expect(Array.isArray(realSelection.brandDiagnostics?.candidates)).toBe(true);
  });

  it("rejects a selection with no brandDiagnostics", () => {
    const stripped = { ...realSelection };
    delete (stripped as { brandDiagnostics?: unknown }).brandDiagnostics;
    try {
      finalizeProductionCandidateArray(stripped as FieldSelection, "item-0001");
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CandidateAdapterError).code).toBe("COMPLETE_DIAGNOSTICS_ABSENT");
    }
  });

  it("rejects a selection whose candidates array is missing or not an array", () => {
    for (const candidates of [undefined, null, "not-an-array", {}]) {
      const broken = {
        ...realSelection,
        brandDiagnostics: { ...realSelection.brandDiagnostics, candidates },
      } as unknown as FieldSelection;
      try {
        finalizeProductionCandidateArray(broken, "item-0001");
        throw new Error("expected a rejection");
      } catch (error) {
        expect((error as CandidateAdapterError).code).toBe("COMPLETE_DIAGNOSTICS_ABSENT");
      }
    }
  });

  it("cannot be handed a filtered bare array", () => {
    // A bare array is not a FieldSelection: it has no brandDiagnostics, so the
    // filtered population is rejected rather than silently accepted.
    const filtered = (realSelection.brandDiagnostics?.candidates ?? []).filter((c) => c.kept);
    expect(filtered.length).toBeLessThan(realSelection.brandDiagnostics!.candidates.length);
    try {
      finalizeProductionCandidateArray(filtered as unknown as FieldSelection, "item-0001");
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CandidateAdapterError).code).toBe("COMPLETE_DIAGNOSTICS_ABSENT");
    }
  });

  it("emits exactly one record per diagnostic candidate, in original order", () => {
    const candidates = realSelection.brandDiagnostics!.candidates;
    const records = finalizeProductionCandidateArray(realSelection, "item-0001");
    expect(records).toHaveLength(candidates.length);
    records.forEach((record, index) => {
      expect(record.candidateOrdinal).toBe(index);
      expect(record.completeCandidateArrayLength).toBe(candidates.length);
      expect(record.rawText).toBe(candidates[index].rawText);
    });
  });

  it("validates opaqueItemId even when the candidate array is empty", () => {
    const empty = selectionOf([]);
    expect(finalizeProductionCandidateArray(empty, "item-0001")).toEqual([]);
    for (const bad of ["item-7", "ITEM-0001", "", "case-0001"]) {
      try {
        finalizeProductionCandidateArray(empty, bad);
        throw new Error("expected a rejection");
      } catch (error) {
        expect((error as CandidateAdapterError).code).toBe("MALFORMED_OPAQUE_ITEM_ID");
      }
    }
  });
});

describe("Issue #149 kept population must retain a ranked survivor", () => {
  const realSelection = selectBrandObservationWithCompleteFilterDiagnostics([region(LINES)]);

  it("halts when every kept candidate loses its decision", () => {
    // The gap a per-record schema cannot see: each kept candidate may
    // individually lack a decision because deduplication removed it, but they
    // cannot ALL lack one. Production always ranks at least one survivor.
    const candidates = realSelection.brandDiagnostics!.candidates;
    expect(candidates.some((candidate) => candidate.kept)).toBe(true);

    const stripped = selectionOf(
      candidates.map((candidate) => {
        const clone = { ...candidate };
        delete (clone as { decision?: unknown }).decision;
        return clone;
      }),
    );
    try {
      finalizeProductionCandidateArray(stripped, "item-0001");
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CandidateAdapterError).code).toBe("RANKED_MEMBERSHIP_INCONSISTENT");
      expect((error as CandidateAdapterError).message).toContain("no final ranked member");
    }
  });

  it("accepts an all-rejected selection with no decisions", () => {
    const candidates = realSelection.brandDiagnostics!.candidates;
    const rejectedOnly = selectionOf(candidates.filter((candidate) => !candidate.kept));
    expect(rejectedOnly.brandDiagnostics!.candidates.length).toBeGreaterThan(0);
    const records = finalizeProductionCandidateArray(rejectedOnly, "item-0002");
    expect(records.every((record) => record.rankedPosition === null)).toBe(true);
    expect(records.every((record) => record.selected === false)).toBe(true);
  });

  it("rejects a decision on a rejected candidate", () => {
    const candidates = realSelection.brandDiagnostics!.candidates;
    const tampered = selectionOf(
      candidates.map((candidate) =>
        candidate.kept ? candidate : { ...candidate, decision: "alternate" as const },
      ),
    );
    try {
      finalizeProductionCandidateArray(tampered, "item-0003");
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CandidateAdapterError).code).toBe("RANKED_MEMBERSHIP_INCONSISTENT");
    }
  });

  it("accepts deduplicated kept candidates while another kept candidate survives", () => {
    // The real duplicate probe: two kept candidates, one decision.
    const duplicates = selectBrandObservationWithCompleteFilterDiagnostics([
      region([["RED", "BRICK", "WINERY"]], [], "pass-1-full-image", "full-image-primary"),
      region([["RED", "BRICK", "WINERY"]], [], "pass-2-rot180", "full-image-rot180"),
    ]);
    const candidates = duplicates.brandDiagnostics!.candidates;
    expect(candidates.filter((candidate) => candidate.kept).length).toBeGreaterThan(1);
    expect(candidates.filter((candidate) => candidate.decision !== undefined)).toHaveLength(1);
    expect(() => finalizeProductionCandidateArray(duplicates, "item-0004")).not.toThrow();
  });
});
