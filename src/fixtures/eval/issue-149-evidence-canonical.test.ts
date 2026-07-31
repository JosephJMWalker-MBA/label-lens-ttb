/**
 * Issue #149 — canonical evidence schemas, fingerprints and byte integrity.
 *
 * Non-OCR. Every record here is synthetic and built in this file. No fixture,
 * no governed truth, no acquisition run.
 *
 * The implementation under test lives in `scripts/eval/lib/`, outside
 * `src/fixtures/**`, because the Stage 2 acquisition runner is required to use
 * it and is prohibited from importing anything under `src/fixtures/**`. This
 * test may live here: a test is not the runner, and nothing imports it.
 */
import { describe, expect, it } from "vitest";

import {
  BRAND_FILTER_CHECK_ORDER,
  CANDIDATE_CANONICALIZATION_VERSION,
  CANDIDATE_EVIDENCE_REQUIRED_KEYS,
  CANDIDATE_FINALIZED_KEYS,
  CandidateCanonicalizationError,
  CandidateRecordError,
  PassRecordError,
  REGION_OCR_RESULT_KEYS,
  SEMANTIC_PASS_EXCLUDED_KEYS,
  assertCompleteCandidateEvidenceRecord,
  assertRegionOcrResultRecord,
  canonicalRecordDigest,
  canonicalRecordSha256,
  canonicalize,
  finalizeCandidateRecord,
  fingerprintPreimage,
  semanticOrderedPassArrayFingerprint,
  semanticPassFingerprint,
  sha256Bytes,
  stableCandidateId,
} from "../../../scripts/eval/lib/issue-149-evidence-canonical";

/** Every ladder rule, in frozen order, with the named rules marked failed. */
function ladder(failed: readonly string[] = []): Array<{ check: string; failed: boolean }> {
  return BRAND_FILTER_CHECK_ORDER.map((check) => ({ check, failed: failed.includes(check) }));
}

/**
 * A COMPLETE synthetic candidate evidence record: exactly the required keys, with
 * production optionals normalized to explicit null and every cross-field
 * invariant satisfied.
 */
function record(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    canonicalizationVersion: CANDIDATE_CANONICALIZATION_VERSION,
    opaqueItemId: "item-0007",
    candidateOrdinal: 3,
    completeCandidateArrayLength: 42,
    rawText: "PRODUCED AND BOTTLED BY RED BRICK WINERY",
    cleanedValue: "PRODUCED AND BOTTLED BY RED BRICK WINERY",
    confidence: 0.87,
    ocrEvidenceScore: 0.87,
    ocrConfidence: {
      aggregation: "mean",
      rawScale: "0-100",
      rawTokenConfidences: [91, 84, 87],
      rawMean: 87,
      rawMin: 84,
      rawMax: 91,
    },
    prominence: 61,
    regionName: "full-image",
    passId: "pass-1-full-image",
    passKind: "full-image-primary",
    supportPassIds: ["pass-1-full-image"],
    candidateProvenance: {
      passId: "pass-1-full-image",
      passKind: "full-image-primary",
      triggerReasons: ["primary-pass"],
      preprocessing: ["grayscale"],
      regionName: "full-image",
      supportingPassIds: ["pass-1-full-image"],
      supportingPassKinds: ["full-image-primary"],
      recoveryPassUsed: false,
    },
    assembly: "whole-line",
    lineIndexes: [4],
    kept: false,
    filterReason: "producer-line",
    decision: null,
    score: null,
    ranking: null,
    filterChecks: ladder(["producer-line", "too-many-words"]),
    activeRejectionReasons: ["producer-line", "too-many-words"],
    rankingEligible: false,
    rankingScore: null,
    rankedPosition: null,
    selected: false,
    ...over,
  };
}

/** A complete KEPT, ranked, selected candidate — the other side of the ladder. */
function keptRecord(over: Record<string, unknown> = {}): Record<string, unknown> {
  return record({
    kept: true,
    filterReason: "candidate-positive",
    filterChecks: ladder(),
    activeRejectionReasons: [],
    rawText: "RED BRICK WINERY",
    cleanedValue: "RED BRICK WINERY",
    decision: "selected",
    selected: true,
    rankedPosition: 0,
    rankingEligible: true,
    rankingScore: 12.5,
    ranking: {
      strategy: "brand-mixed-prominence-score",
      orderingMode: "score-first",
      comparator: [{ id: "ranking-score", direction: "desc", value: 12.5 }],
      rankingScore: 12.5,
      scoreFactors: [
        { id: "positive-signal", value: 3, contribution: 3, direction: "benefit" },
        { id: "residual-penalty", value: 1, contribution: -1, direction: "penalty" },
      ],
    },
    score: {
      positiveSignal: 3,
      meaningfulChars: 14,
      structure: 2,
      ocrEvidenceScore: 0.87,
      prominence: 61,
      area: 1200,
      centrality: 0.4,
      alignment: 0.9,
      lineProximity: 0.2,
      lowInformationPenalty: 0,
      residualPenalty: 1,
      total: 12.5,
    },
    ...over,
  });
}

/** Drop one own property, to prove each required key is individually enforced. */
function without(key: string): Record<string, unknown> {
  const partial = record();
  delete partial[key];
  return partial;
}

/** A synthetic RegionOcrResult with all thirteen real fields and real values. */
function pass(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    passId: "pass-1-full-image",
    regionName: "full-image",
    passKind: "full-image-primary",
    triggerReasons: ["primary-pass"],
    preprocessing: ["grayscale", "otsu"],
    fieldEligibility: { brand: true, alcohol: true },
    transform: {
      crop: { left: 0, top: 0, width: 1200, height: 1600 },
      rotate: 0,
      scale: 1,
      originalWidth: 1200,
      originalHeight: 1600,
    },
    transformedSize: { width: 1200, height: 1600 },
    pageSegMode: 11,
    rawWordCount: 41,
    discardedWordCount: 2,
    timings: { preprocessMs: 12.5, ocrMs: 830.25, inverseMappingMs: 1.75, totalMs: 844.5 },
    words: [
      {
        text: "RED",
        rawConfidence: 91,
        bbox: { x0: 10, y0: 20, x1: 60, y1: 44 },
        originalGeometry: {
          imageIndex: 0,
          x: 10,
          y: 20,
          width: 50,
          height: 24,
          imageWidth: 1200,
          imageHeight: 1600,
        },
      },
      // The second word was never mapped back to the original frame, so
      // `originalGeometry` is OMITTED — not null.
      { text: "BRICK", rawConfidence: 84, bbox: { x0: 64, y0: 20, x1: 150, y1: 44 } },
    ],
    ...over,
  };
}

describe("Issue #149 canonicalization", () => {
  it("declares the frozen canonicalization version", () => {
    expect(CANDIDATE_CANONICALIZATION_VERSION).toBe("issue-149-candidate-canonical-v1");
  });

  it("is unaffected by key insertion order", () => {
    const a = record();
    const reversed: Record<string, unknown> = {};
    for (const key of Object.keys(a).reverse()) reversed[key] = a[key];
    expect(Object.keys(reversed)).not.toEqual(Object.keys(a));
    expect(canonicalRecordSha256(reversed)).toBe(canonicalRecordSha256(a));
  });

  it("changes when array order changes", () => {
    const a = keptRecord();
    const b = keptRecord({ supportPassIds: ["pass-2", "pass-1-full-image"] });
    expect(canonicalRecordSha256(b)).not.toBe(canonicalRecordSha256(a));
  });

  it("omits undefined object properties rather than emitting null", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("fails closed on an undefined array value", () => {
    expect(() => canonicalize({ list: [1, undefined, 3] })).toThrow(CandidateCanonicalizationError);
    try {
      canonicalize({ list: [1, undefined, 3] });
    } catch (error) {
      expect((error as CandidateCanonicalizationError).code).toBe("UNDEFINED_ARRAY_VALUE");
    }
  });

  it("fails closed on NaN and Infinity", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => canonicalize({ n: value })).toThrow(CandidateCanonicalizationError);
      try {
        canonicalize({ n: value });
      } catch (error) {
        expect((error as CandidateCanonicalizationError).code).toBe("NON_FINITE_NUMBER");
      }
    }
  });

  it("emits a lowercase 64-character digest and no formatting whitespace", () => {
    expect(canonicalRecordSha256(record())).toMatch(/^[0-9a-f]{64}$/);
    // "No whitespace" governs the SEPARATORS, not the contents of a string value:
    // a raw OCR transcript legitimately contains spaces.
    expect(canonicalize({ b: 2, a: [1, { d: 4, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":4}],"b":2}');
    expect(canonicalize({ z: 1, a: 2 })).not.toContain(", ");
    expect(canonicalize({ z: 1, a: 2 })).not.toContain(": ");
  });

  it("excludes both derived fields from the preimage", () => {
    const base = canonicalRecordSha256(record());
    expect(canonicalRecordSha256({ ...record(), canonicalRecordSha256: "f".repeat(64) })).toBe(
      base,
    );
    expect(canonicalRecordSha256({ ...record(), stableCandidateId: "item-9999:0:x" })).toBe(base);
    const preimage = fingerprintPreimage({
      ...record(),
      canonicalRecordSha256: "f".repeat(64),
      stableCandidateId: "x",
    });
    expect(Object.hasOwn(preimage, "canonicalRecordSha256")).toBe(false);
    expect(Object.hasOwn(preimage, "stableCandidateId")).toBe(false);
  });
});

describe("Issue #149 closed candidate evidence schema", () => {
  it("uses the production property name filterReason", () => {
    expect(CANDIDATE_EVIDENCE_REQUIRED_KEYS).toContain("filterReason");
    expect(CANDIDATE_EVIDENCE_REQUIRED_KEYS as readonly string[]).not.toContain(
      "authoritativeFilterReason",
    );
  });

  it("requires the complete ranking object and top-level regionName", () => {
    expect(CANDIDATE_EVIDENCE_REQUIRED_KEYS).toContain("ranking");
    expect(CANDIDATE_EVIDENCE_REQUIRED_KEYS).toContain("regionName");
    expect(() => finalizeCandidateRecord(without("ranking"))).toThrow(CandidateRecordError);
    expect(() => finalizeCandidateRecord(without("regionName"))).toThrow(CandidateRecordError);
  });

  it("rejects a record missing any single required field", () => {
    const accepted: string[] = [];
    for (const key of CANDIDATE_EVIDENCE_REQUIRED_KEYS) {
      try {
        finalizeCandidateRecord(without(key));
        accepted.push(key);
      } catch (error) {
        expect((error as CandidateRecordError).code).toBe("MISSING_REQUIRED_FIELD");
      }
    }
    expect(accepted).toEqual([]);
  });

  it("rejects an unexpected extra key — the schema is closed, not minimal", () => {
    for (const extra of [
      { debugNote: "why this candidate looked odd" },
      { isTruth: false },
      { expectedBrand: "RED BRICK WINERY" },
      { acquisitionRunId: "30604513415" },
    ]) {
      expect(() => finalizeCandidateRecord(record(extra))).toThrow(CandidateRecordError);
      try {
        finalizeCandidateRecord(record(extra));
      } catch (error) {
        expect((error as CandidateRecordError).code).toBe("UNEXPECTED_FIELD");
      }
    }
  });

  it("rejects either derived field before finalization", () => {
    for (const derived of [
      { canonicalRecordSha256: "a".repeat(64) },
      { stableCandidateId: "item-0007:3:x" },
    ]) {
      try {
        assertCompleteCandidateEvidenceRecord(record(derived));
        throw new Error("expected a rejection");
      } catch (error) {
        expect((error as CandidateRecordError).code).toBe("ALREADY_FINALIZED");
      }
    }
  });

  it("leaves exactly the required keys plus the two derived after finalization", () => {
    const finalized = finalizeCandidateRecord(record());
    expect(new Set(Object.keys(finalized))).toEqual(new Set(CANDIDATE_FINALIZED_KEYS));
    expect(CANDIDATE_FINALIZED_KEYS).toHaveLength(CANDIDATE_EVIDENCE_REQUIRED_KEYS.length + 2);
  });

  it("rejects a malformed opaque item id", () => {
    for (const bad of ["item-7", "ITEM-0007", "case-0007", "item-00007", ""]) {
      expect(() => finalizeCandidateRecord(record({ opaqueItemId: bad }))).toThrow(
        CandidateRecordError,
      );
    }
  });

  it("rejects a malformed ordinal, array length or out-of-range ordinal", () => {
    for (const bad of [-1, 1.5, "3", null]) {
      expect(() => finalizeCandidateRecord(record({ candidateOrdinal: bad }))).toThrow(
        CandidateRecordError,
      );
    }
    for (const bad of [0, -4, 2.5, "42", null]) {
      expect(() => finalizeCandidateRecord(record({ completeCandidateArrayLength: bad }))).toThrow(
        CandidateRecordError,
      );
    }
    try {
      finalizeCandidateRecord(record({ candidateOrdinal: 42, completeCandidateArrayLength: 42 }));
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("ORDINAL_OUT_OF_RANGE");
    }
  });

  it("requires real incumbent enum values, not merely strings", () => {
    for (const violation of [
      { passKind: "primary" },
      { passKind: "recovery" },
      { assembly: "whole_line" },
      { assembly: "line-merge" },
      { filterReason: "not-a-reason" },
      { filterReason: null },
      { decision: "chosen" },
      { candidateProvenance: { ...(record().candidateProvenance as object), passKind: "primary" } },
    ]) {
      expect(() => finalizeCandidateRecord(record(violation))).toThrow(CandidateRecordError);
    }
    // The real values are accepted.
    expect(() => finalizeCandidateRecord(record({ passKind: "focus-crop" }))).not.toThrow();
    expect(() => finalizeCandidateRecord(record({ assembly: "multi-line-merge" }))).not.toThrow();
  });

  it("requires complete nested structures, not merely object-shaped values", () => {
    for (const violation of [
      { ocrConfidence: {} },
      { ocrConfidence: { aggregation: "mean", rawScale: "0-100", rawMean: 87 } },
      { ocrConfidence: { ...(record().ocrConfidence as object), extra: 1 } },
      { candidateProvenance: { passId: "pass-1-full-image" } },
      { score: { total: 1 } },
    ]) {
      expect(() => finalizeCandidateRecord(record(violation))).toThrow(CandidateRecordError);
    }
    for (const violation of [
      { ranking: {} },
      { ranking: { strategy: "brand-mixed-prominence-score", orderingMode: "score-first" } },
      {
        ranking: {
          strategy: "unknown-strategy",
          orderingMode: "score-first",
          comparator: [],
          rankingScore: 12.5,
          scoreFactors: [],
        },
      },
      {
        ranking: {
          strategy: "brand-mixed-prominence-score",
          orderingMode: "score-first",
          comparator: [{ id: "not-a-comparator", direction: "desc", value: 1 }],
          rankingScore: 12.5,
          scoreFactors: [],
        },
      },
    ]) {
      expect(() => finalizeCandidateRecord(keptRecord(violation))).toThrow(CandidateRecordError);
    }
    expect(() => finalizeCandidateRecord(keptRecord())).not.toThrow();
  });

  describe("filter ladder invariants", () => {
    it("requires exactly all ten checks, once each, in frozen order", () => {
      expect(() => finalizeCandidateRecord(record({ filterChecks: ladder().slice(0, 9) }))).toThrow(
        CandidateRecordError,
      );
      expect(() =>
        finalizeCandidateRecord(record({ filterChecks: [...ladder(), ladder()[0]] })),
      ).toThrow(CandidateRecordError);
      const reordered = ladder(["producer-line", "too-many-words"]);
      [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
      try {
        finalizeCandidateRecord(record({ filterChecks: reordered }));
      } catch (error) {
        expect((error as CandidateRecordError).code).toBe("FILTER_LADDER_INVARIANT_VIOLATED");
      }
    });

    it("requires activeRejectionReasons to equal the failed checks in order", () => {
      expect(() =>
        finalizeCandidateRecord(record({ activeRejectionReasons: ["too-many-words"] })),
      ).toThrow(CandidateRecordError);
      expect(() =>
        finalizeCandidateRecord(
          record({ activeRejectionReasons: ["too-many-words", "producer-line"] }),
        ),
      ).toThrow(CandidateRecordError);
    });

    it("requires a rejected candidate's first active reason to be its filterReason", () => {
      try {
        finalizeCandidateRecord(record({ filterReason: "too-many-words" }));
      } catch (error) {
        expect((error as CandidateRecordError).code).toBe("FILTER_LADDER_INVARIANT_VIOLATED");
      }
      expect(() =>
        finalizeCandidateRecord(
          record({ filterChecks: ladder(), activeRejectionReasons: [], kept: false }),
        ),
      ).toThrow(CandidateRecordError);
    });

    it("requires a kept candidate to have no active reason and no failed check", () => {
      expect(() =>
        finalizeCandidateRecord(
          keptRecord({
            filterChecks: ladder(["producer-line"]),
            activeRejectionReasons: ["producer-line"],
          }),
        ),
      ).toThrow(CandidateRecordError);
      expect(() => finalizeCandidateRecord(keptRecord({ filterReason: "producer-line" }))).toThrow(
        CandidateRecordError,
      );
      expect(() =>
        finalizeCandidateRecord(keptRecord({ filterReason: "candidate-plausible" })),
      ).not.toThrow();
    });
  });

  describe("derived fields must be derivable", () => {
    it("requires rankingEligible to equal ranking !== null", () => {
      try {
        finalizeCandidateRecord(record({ rankingEligible: true }));
      } catch (error) {
        expect((error as CandidateRecordError).code).toBe("DERIVED_FIELD_INCONSISTENT");
      }
      expect(() => finalizeCandidateRecord(keptRecord({ rankingEligible: false }))).toThrow(
        CandidateRecordError,
      );
    });

    it("requires rankingScore to equal ranking?.rankingScore ?? null", () => {
      expect(() => finalizeCandidateRecord(keptRecord({ rankingScore: 9 }))).toThrow(
        CandidateRecordError,
      );
      expect(() => finalizeCandidateRecord(record({ rankingScore: 9 }))).toThrow(
        CandidateRecordError,
      );
    });

    it("requires selected to equal decision === selected", () => {
      expect(() => finalizeCandidateRecord(record({ selected: true }))).toThrow(
        CandidateRecordError,
      );
      expect(() => finalizeCandidateRecord(keptRecord({ decision: "alternate" }))).toThrow(
        CandidateRecordError,
      );
      expect(() =>
        finalizeCandidateRecord(keptRecord({ decision: "alternate", selected: false })),
      ).not.toThrow();
    });
  });

  it("changes the digest when any required evidence field changes", () => {
    // Two bases, because the ladder invariants make some values mutually
    // exclusive: a kept candidate cannot carry a failed check, and a rejected one
    // cannot carry a ranking. Every required key is covered across the pair.
    const keptBase = canonicalRecordSha256(keptRecord());
    const keptMutations: Array<Record<string, unknown>> = [
      { opaqueItemId: "item-0008" },
      { candidateOrdinal: 4 },
      { completeCandidateArrayLength: 43 },
      { rawText: "OTHER" },
      { cleanedValue: "OTHER" },
      { confidence: 0.88 },
      { ocrEvidenceScore: 0.88 },
      { ocrConfidence: { ...(keptRecord().ocrConfidence as object), rawMean: 86 } },
      { prominence: 62 },
      { regionName: "brand-band" },
      { passId: "pass-2" },
      { passKind: "focus-crop" },
      { supportPassIds: ["pass-2"] },
      {
        candidateProvenance: {
          ...(keptRecord().candidateProvenance as object),
          recoveryPassUsed: true,
        },
      },
      { assembly: "line-window" },
      { lineIndexes: [5] },
      { filterReason: "candidate-plausible" },
      { decision: "alternate", selected: false },
      { score: { ...(keptRecord().score as object), total: 11 } },
      { ranking: { ...(keptRecord().ranking as object), orderingMode: "prominence-first" } },
      { rankingScore: 11, ranking: { ...(keptRecord().ranking as object), rankingScore: 11 } },
      { rankedPosition: 1 },
      { selected: false, decision: "alternate" },
    ];
    for (const mutation of keptMutations) {
      expect(canonicalRecordSha256(keptRecord(mutation))).not.toBe(keptBase);
    }

    const rejectedBase = canonicalRecordSha256(record());
    const rejectedMutations: Array<Record<string, unknown>> = [
      { filterChecks: ladder(["producer-line"]), activeRejectionReasons: ["producer-line"] },
      {
        activeRejectionReasons: ["producer-line"],
        filterChecks: ladder(["producer-line"]),
        filterReason: "producer-line",
      },
      // kept flips the record to the other side of the ladder entirely.
      {
        kept: true,
        filterReason: "candidate-positive",
        filterChecks: ladder(),
        activeRejectionReasons: [],
      },
      { rankingEligible: true, ranking: keptRecord().ranking, rankingScore: 12.5 },
    ];
    for (const mutation of rejectedMutations) {
      expect(canonicalRecordSha256(record(mutation))).not.toBe(rejectedBase);
    }

    const mutated = new Set(
      [...keptMutations, ...rejectedMutations].flatMap((m) => Object.keys(m)),
    );
    for (const key of CANDIDATE_EVIDENCE_REQUIRED_KEYS) {
      if (key === "canonicalizationVersion") continue;
      expect(mutated).toContain(key);
    }
  });
});

describe("Issue #149 candidate identity API is closed", () => {
  it("finalizes a complete record and refuses to re-finalize", () => {
    const finalized = finalizeCandidateRecord(record());
    expect(String(finalized.canonicalRecordSha256)).toMatch(/^[0-9a-f]{64}$/);
    try {
      finalizeCandidateRecord(finalized);
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("ALREADY_FINALIZED");
    }
  });

  it("puts the exact full verified digest in the stable id, never a truncation", () => {
    const finalized = finalizeCandidateRecord(record());
    const [item, ordinal, digest] = String(finalized.stableCandidateId).split(":");
    expect(item).toBe("item-0007");
    expect(ordinal).toBe("3");
    expect(digest).toHaveLength(64);
    expect(digest).toBe(finalized.canonicalRecordSha256);
    expect(stableCandidateId(finalized)).toBe(finalized.stableCandidateId);
  });

  it("rejects a partial record passed straight to stableCandidateId", () => {
    try {
      stableCandidateId({ opaqueItemId: "item-0007", candidateOrdinal: 3 });
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("MISSING_DIGEST");
    }
  });

  it("rejects a PARTIAL record carrying its own correctly computed digest", () => {
    // The Amendment 4 hole. The digest here is genuinely self-consistent — it was
    // computed over exactly this two-field object — so a format-and-recompute
    // check passes. A self-consistent digest over incomplete evidence is still
    // incomplete evidence, so the schema must be validated too.
    const partial = { opaqueItemId: "item-0001", candidateOrdinal: 0 };
    const supplied = { ...partial, canonicalRecordSha256: canonicalRecordSha256(partial) };
    expect(supplied.canonicalRecordSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalRecordSha256(supplied)).toBe(supplied.canonicalRecordSha256);
    try {
      stableCandidateId(supplied);
      throw new Error("expected a rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CandidateRecordError);
      expect((error as CandidateRecordError).code).toBe("MISSING_REQUIRED_FIELD");
    }
  });

  it("rejects a finalized-looking record carrying an undeclared extra key", () => {
    const finalized = finalizeCandidateRecord(record());
    const tampered = { ...finalized, expectedBrand: "RED BRICK WINERY" };
    try {
      stableCandidateId(tampered);
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("UNEXPECTED_FIELD");
    }
  });

  it("rejects a malformed or truncated digest", () => {
    const finalized = finalizeCandidateRecord(record());
    for (const bad of [
      String(finalized.canonicalRecordSha256).slice(0, 16),
      String(finalized.canonicalRecordSha256).toUpperCase(),
      "not-hex",
      "",
    ]) {
      expect(() => stableCandidateId({ ...finalized, canonicalRecordSha256: bad })).toThrow(
        CandidateRecordError,
      );
    }
  });

  it("rejects a well-formed digest taken from a different record", () => {
    const mine = finalizeCandidateRecord(record());
    const other = finalizeCandidateRecord(record({ candidateOrdinal: 9 }));
    try {
      stableCandidateId({ ...mine, canonicalRecordSha256: other.canonicalRecordSha256 });
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("DIGEST_DOES_NOT_MATCH_RECORD");
    }
  });
});

describe("Issue #149 exact RegionOcrResult schema", () => {
  it("declares exactly the thirteen production fields", () => {
    expect(REGION_OCR_RESULT_KEYS).toHaveLength(13);
    expect(() => assertRegionOcrResultRecord(pass())).not.toThrow();
  });

  it("rejects a missing pass field", () => {
    for (const key of REGION_OCR_RESULT_KEYS) {
      const partial = pass();
      delete partial[key];
      try {
        assertRegionOcrResultRecord(partial);
        throw new Error(`expected ${key} to be required`);
      } catch (error) {
        expect((error as PassRecordError).code).toBe("PASS_RECORD_KEY_SET_MISMATCH");
      }
    }
  });

  it("rejects an extra pass field, including run metadata", () => {
    for (const extra of [
      { workflowRunId: "30604513415" },
      { artifactId: "4711" },
      { runnerIdentity: "ubuntu-24.04/x64" },
      { startedAt: "2026-07-31T00:00:00Z" },
      { cropPixelSha256: "a".repeat(64) },
      { warningsAndErrors: [] },
    ]) {
      try {
        assertRegionOcrResultRecord(pass(extra));
        throw new Error("expected a rejection");
      } catch (error) {
        expect((error as PassRecordError).code).toBe("PASS_RECORD_KEY_SET_MISMATCH");
      }
    }
  });

  it("requires real enum values and real nested shapes", () => {
    for (const violation of [
      { passKind: "primary" },
      { triggerReasons: ["because"] },
      { transform: { ...(pass().transform as object), rotate: 45 } },
      { transform: { rotate: 0, scale: 1, originalWidth: 1, originalHeight: 1 } },
      { transform: { ...(pass().transform as object), crop: null } },
      { fieldEligibility: { brand: true } },
      { transformedSize: { width: 1 } },
      { timings: { preprocessMs: 1, ocrMs: 1, totalMs: 1 } },
      { pageSegMode: 11.5 },
      { rawWordCount: -1 },
    ]) {
      expect(() => assertRegionOcrResultRecord(pass(violation))).toThrow(PassRecordError);
    }
  });

  it("keeps an absent originalGeometry absent, and rejects null", () => {
    const record = pass();
    const words = record.words as Array<Record<string, unknown>>;
    expect(Object.hasOwn(words[0], "originalGeometry")).toBe(true);
    expect(Object.hasOwn(words[1], "originalGeometry")).toBe(false);

    // Omission survives serialization and parsing, which is what a replay reads.
    const roundTripped = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
    const parsedWords = roundTripped.words as Array<Record<string, unknown>>;
    expect(Object.hasOwn(parsedWords[1], "originalGeometry")).toBe(false);
    expect(() => assertRegionOcrResultRecord(roundTripped)).not.toThrow();

    // An explicit null is a present-but-empty property where production had no
    // property at all. That is not an exact RegionOcrResult.
    const nulled = pass({
      words: [
        {
          text: "BRICK",
          rawConfidence: 84,
          bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
          originalGeometry: null,
        },
      ],
    });
    try {
      assertRegionOcrResultRecord(nulled);
      throw new Error("expected a rejection");
    } catch (error) {
      expect((error as PassRecordError).code).toBe("PASS_WORD_ORIGINAL_GEOMETRY_NULL");
    }
  });

  it("rejects a malformed word", () => {
    for (const words of [
      [{ text: "RED", rawConfidence: 91 }],
      [{ text: "RED", rawConfidence: 91, bbox: { x0: 0, y0: 0, x1: 1 } }],
      [{ text: "RED", rawConfidence: "high", bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }],
      [{ text: "RED", rawConfidence: 91, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 }, extra: 1 }],
      [
        {
          text: "RED",
          rawConfidence: 91,
          bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
          originalGeometry: { x: 1, y: 2 },
        },
      ],
    ]) {
      expect(() => assertRegionOcrResultRecord(pass({ words }))).toThrow(PassRecordError);
    }
  });
});

describe("Issue #149 exact-byte integrity versus semantic fingerprints", () => {
  it("excludes exactly timings from the semantic preimage", () => {
    expect(SEMANTIC_PASS_EXCLUDED_KEYS).toEqual(["timings"]);
  });

  it("hashes exact bytes, so whitespace and a terminal newline matter", () => {
    const compact = JSON.stringify(pass());
    const pretty = JSON.stringify(pass(), null, 2);
    const trailing = `${compact}\n`;
    expect(sha256Bytes(pretty)).not.toBe(sha256Bytes(compact));
    expect(sha256Bytes(trailing)).not.toBe(sha256Bytes(compact));
    expect(sha256Bytes(Buffer.from(compact, "utf8"))).toBe(sha256Bytes(compact));
    expect(sha256Bytes(compact)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives the same semantic fingerprint after a formatting-only change", () => {
    const compact = JSON.parse(JSON.stringify(pass())) as Record<string, unknown>;
    const pretty = JSON.parse(JSON.stringify(pass(), null, 2)) as Record<string, unknown>;
    expect(semanticPassFingerprint(pretty)).toBe(semanticPassFingerprint(compact));
  });

  it("changes byte integrity but not semantic equality when only timings change", () => {
    const a = pass();
    const b = pass({
      timings: { preprocessMs: 13.9, ocrMs: 902.1, inverseMappingMs: 2.2, totalMs: 918.2 },
    });
    expect(sha256Bytes(JSON.stringify(b))).not.toBe(sha256Bytes(JSON.stringify(a)));
    expect(semanticPassFingerprint(b)).toBe(semanticPassFingerprint(a));
    expect(semanticOrderedPassArrayFingerprint([b])).toBe(semanticOrderedPassArrayFingerprint([a]));
  });

  it("changes the semantic digest when any other RegionOcrResult field changes", () => {
    const base = semanticPassFingerprint(pass());
    for (const mutation of [
      { passId: "pass-2" },
      { regionName: "brand-band" },
      { passKind: "focus-crop" },
      { triggerReasons: ["brand-not-observed"] },
      { preprocessing: ["grayscale"] },
      { preprocessing: ["otsu", "grayscale"] },
      { fieldEligibility: { brand: false, alcohol: true } },
      { transform: { ...(pass().transform as object), rotate: 90 } },
      { transformedSize: { width: 600, height: 800 } },
      { pageSegMode: 7 },
      { rawWordCount: 40 },
      { discardedWordCount: 3 },
      { words: [(pass().words as unknown[])[1]] },
    ]) {
      expect(semanticPassFingerprint(pass(mutation))).not.toBe(base);
    }
  });

  it("rejects run metadata on a pass rather than silently hashing it", () => {
    // Amendment 4's test stripped metadata by hand before calling the helper, so
    // the helper itself never enforced the boundary.
    const withMetadata = pass({ workflowRunId: "30604513415", runnerIdentity: "ubuntu-24.04/x64" });
    expect(() => semanticPassFingerprint(withMetadata)).toThrow(PassRecordError);
    expect(() => semanticOrderedPassArrayFingerprint([withMetadata])).toThrow(PassRecordError);
  });

  it("makes pass order part of the ordered-array digest", () => {
    const a = pass();
    const b = pass({ passId: "pass-2-brand-band", regionName: "brand-band" });
    expect(semanticOrderedPassArrayFingerprint([b, a])).not.toBe(
      semanticOrderedPassArrayFingerprint([a, b]),
    );
    expect(() => semanticOrderedPassArrayFingerprint(pass())).toThrow(PassRecordError);
  });

  it("keeps the canonical object digest distinct from byte integrity", () => {
    const compact = JSON.parse(JSON.stringify(pass())) as Record<string, unknown>;
    const reordered: Record<string, unknown> = {};
    for (const key of Object.keys(compact).reverse()) reordered[key] = compact[key];
    // A canonical digest deliberately cannot see key order or formatting, which
    // is exactly why it is not an artifact-integrity proof.
    expect(canonicalRecordDigest(reordered)).toBe(canonicalRecordDigest(compact));
    expect(sha256Bytes(JSON.stringify(reordered))).not.toBe(sha256Bytes(JSON.stringify(compact)));
  });
});
