/**
 * Issue #149 — canonical evidence record schema and fingerprint.
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
  CANDIDATE_CANONICALIZATION_VERSION,
  CANDIDATE_EVIDENCE_REQUIRED_KEYS,
  CandidateCanonicalizationError,
  CandidateRecordError,
  SEMANTIC_PASS_EXCLUDED_KEYS,
  assertCompleteCandidateEvidenceRecord,
  canonicalRecordSha256,
  canonicalize,
  finalizeCandidateRecord,
  fingerprintPreimage,
  fullRecordIntegritySha256,
  semanticOrderedPassArrayFingerprint,
  semanticPassFingerprint,
  stableCandidateId,
} from "../../../scripts/eval/lib/issue-149-evidence-canonical";

/**
 * A COMPLETE synthetic candidate evidence record: every required key present as
 * an own property, with production optionals normalized to explicit null.
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
    passKind: "primary",
    supportPassIds: ["pass-1-full-image"],
    candidateProvenance: {
      passId: "pass-1-full-image",
      passKind: "primary",
      triggerReasons: [],
      preprocessing: ["grayscale"],
      regionName: "full-image",
      supportingPassIds: ["pass-1-full-image"],
      supportingPassKinds: ["primary"],
      recoveryPassUsed: false,
    },
    assembly: "whole-line",
    lineIndexes: [4],
    kept: false,
    filterReason: "producer-line",
    decision: null,
    score: null,
    ranking: {
      strategy: "brand-composite",
      orderingMode: "descending-total",
      comparator: [],
      rankingScore: null,
      scoreFactors: [],
    },
    filterChecks: [
      { check: "producer-line", failed: true },
      { check: "no-letters-or-too-short", failed: false },
      { check: "too-many-words", failed: true },
    ],
    activeRejectionReasons: ["producer-line", "too-many-words"],
    rankingEligible: false,
    rankingScore: null,
    rankedPosition: null,
    selected: false,
    ...over,
  };
}

/** Drop one own property, to prove each required key is individually enforced. */
function without(key: string): Record<string, unknown> {
  const partial = record();
  delete partial[key];
  return partial;
}

describe("Issue #149 candidate fingerprint", () => {
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
    const a = record();
    const b = record({ activeRejectionReasons: ["too-many-words", "producer-line"] });
    expect(canonicalRecordSha256(b)).not.toBe(canonicalRecordSha256(a));
  });

  it("changes when any complete evidence field changes", () => {
    const base = canonicalRecordSha256(record());
    const mutations: Array<Record<string, unknown>> = [
      { opaqueItemId: "item-0008" },
      { candidateOrdinal: 4 },
      { completeCandidateArrayLength: 43 },
      { rawText: "OTHER" },
      { cleanedValue: "OTHER" },
      { confidence: 0.88 },
      { ocrEvidenceScore: 0.88 },
      { ocrConfidence: { aggregation: "mean", rawScale: "0-100", rawMean: 86 } },
      { prominence: 62 },
      { regionName: "brand-band" },
      { passId: "pass-2" },
      { passKind: "recovery" },
      { supportPassIds: ["pass-2"] },
      { candidateProvenance: { recoveryPassUsed: true } },
      { assembly: "line-window" },
      { lineIndexes: [5] },
      { kept: true },
      { filterReason: "too-many-words" },
      { decision: "alternate" },
      { score: { total: 1 } },
      { ranking: { strategy: "brand-composite", orderingMode: "descending-total" } },
      { filterChecks: [{ check: "producer-line", failed: false }] },
      { activeRejectionReasons: [] },
      { rankingEligible: true },
      { rankingScore: 12 },
      { rankedPosition: 1 },
      { selected: true },
    ];
    for (const mutation of mutations) {
      expect(canonicalRecordSha256(record(mutation))).not.toBe(base);
    }
    // Every required evidence key except the frozen version string is covered.
    const mutated = new Set(mutations.flatMap((m) => Object.keys(m)));
    for (const key of CANDIDATE_EVIDENCE_REQUIRED_KEYS) {
      if (key === "canonicalizationVersion") continue;
      expect(mutated).toContain(key);
    }
  });

  it("includes the ordinal and the complete array length in the preimage", () => {
    const preimage = fingerprintPreimage(record());
    expect(Object.hasOwn(preimage, "candidateOrdinal")).toBe(true);
    expect(Object.hasOwn(preimage, "completeCandidateArrayLength")).toBe(true);
  });

  it("is unaffected by either excluded derived field", () => {
    const base = canonicalRecordSha256(record());
    expect(canonicalRecordSha256(record({ canonicalRecordSha256: "f".repeat(64) }))).toBe(base);
    expect(canonicalRecordSha256(record({ stableCandidateId: "item-9999:0:deadbeef" }))).toBe(base);
    const preimage = fingerprintPreimage(
      record({ canonicalRecordSha256: "f".repeat(64), stableCandidateId: "x" }),
    );
    expect(Object.hasOwn(preimage, "canonicalRecordSha256")).toBe(false);
    expect(Object.hasOwn(preimage, "stableCandidateId")).toBe(false);
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
    const digest = canonicalRecordSha256(record());
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    // "No whitespace" governs the SEPARATORS, not the contents of a string value:
    // a raw OCR transcript legitimately contains spaces.
    expect(canonicalize({ b: 2, a: [1, { d: 4, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":4}],"b":2}');
    expect(canonicalize({ z: 1, a: 2 })).not.toContain(", ");
    expect(canonicalize({ z: 1, a: 2 })).not.toContain(": ");
  });
});

describe("Issue #149 complete candidate evidence record", () => {
  it("uses the production property name filterReason", () => {
    // Amendment 3's contract named the persisted field authoritativeFilterReason
    // while the real BrandCandidateDiagnostic property and the fingerprint
    // record both used filterReason. One name, and it is production's.
    expect(CANDIDATE_EVIDENCE_REQUIRED_KEYS).toContain("filterReason");
    expect(CANDIDATE_EVIDENCE_REQUIRED_KEYS as readonly string[]).not.toContain(
      "authoritativeFilterReason",
    );
  });

  it("requires the complete ranking object, not only its score", () => {
    expect(CANDIDATE_EVIDENCE_REQUIRED_KEYS).toContain("ranking");
    expect(CANDIDATE_EVIDENCE_REQUIRED_KEYS).toContain("rankingScore");
    expect(() => finalizeCandidateRecord(without("ranking"))).toThrow(CandidateRecordError);
  });

  it("requires top-level regionName", () => {
    expect(CANDIDATE_EVIDENCE_REQUIRED_KEYS).toContain("regionName");
    expect(() => finalizeCandidateRecord(without("regionName"))).toThrow(CandidateRecordError);
    try {
      finalizeCandidateRecord(without("regionName"));
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("MISSING_REQUIRED_FIELD");
    }
  });

  it("rejects an identity-only record outright", () => {
    // The Amendment 3 defect: this finalized successfully, producing a
    // well-formed identity over no evidence at all.
    const identityOnly = { opaqueItemId: "item-0001", candidateOrdinal: 0 };
    expect(() => finalizeCandidateRecord(identityOnly)).toThrow(CandidateRecordError);
    try {
      finalizeCandidateRecord(identityOnly);
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("MISSING_REQUIRED_FIELD");
    }
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

  it("rejects a malformed opaque item id", () => {
    for (const bad of ["item-7", "ITEM-0007", "case-0007", "item-00007", ""]) {
      expect(() => finalizeCandidateRecord(record({ opaqueItemId: bad }))).toThrow(
        CandidateRecordError,
      );
    }
  });

  it("rejects a malformed ordinal or array length", () => {
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
  });

  it("rejects an ordinal at or beyond the complete array length", () => {
    expect(() =>
      finalizeCandidateRecord(record({ candidateOrdinal: 42, completeCandidateArrayLength: 42 })),
    ).toThrow(CandidateRecordError);
    try {
      finalizeCandidateRecord(record({ candidateOrdinal: 99, completeCandidateArrayLength: 42 }));
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("ORDINAL_OUT_OF_RANGE");
    }
  });

  it("rejects a field whose type violates the frozen schema", () => {
    const violations: Array<Record<string, unknown>> = [
      { rawText: 12 },
      { cleanedValue: 12 },
      { confidence: "high" },
      { ocrConfidence: [] },
      { prominence: Number.NaN },
      { regionName: "" },
      { passId: "" },
      { supportPassIds: [1] },
      { candidateProvenance: null },
      { lineIndexes: [1.5] },
      { kept: "false" },
      { filterChecks: [{ check: "producer-line" }] },
      { activeRejectionReasons: [null] },
      { rankingEligible: null },
      { rankingScore: "12" },
      { rankedPosition: -1 },
      { selected: 1 },
      { ranking: [] },
      { score: [] },
    ];
    for (const violation of violations) {
      expect(() => finalizeCandidateRecord(record(violation))).toThrow(CandidateRecordError);
    }
  });

  it("rejects a wrong canonicalization version", () => {
    expect(() => finalizeCandidateRecord(record({ canonicalizationVersion: "v2" }))).toThrow(
      CandidateRecordError,
    );
  });

  it("finalizes a complete record and refuses to re-finalize", () => {
    const finalized = finalizeCandidateRecord(record());
    expect(String(finalized.canonicalRecordSha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => finalizeCandidateRecord(finalized)).toThrow(CandidateRecordError);
    try {
      finalizeCandidateRecord(finalized);
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("ALREADY_FINALIZED");
    }
  });

  it("recomputes to the persisted digest", () => {
    const finalized = finalizeCandidateRecord(record());
    expect(canonicalRecordSha256(finalized)).toBe(finalized.canonicalRecordSha256);
    expect(stableCandidateId(finalized)).toBe(finalized.stableCandidateId);
  });

  it("puts the exact full verified digest in the stable id, never a truncation", () => {
    const finalized = finalizeCandidateRecord(record());
    const [item, ordinal, digest] = String(finalized.stableCandidateId).split(":");
    expect(item).toBe("item-0007");
    expect(ordinal).toBe("3");
    expect(digest).toHaveLength(64);
    expect(digest).toBe(finalized.canonicalRecordSha256);
  });

  it("rejects a partial record passed straight to stableCandidateId", () => {
    expect(() => stableCandidateId({ opaqueItemId: "item-0007", candidateOrdinal: 3 })).toThrow(
      CandidateRecordError,
    );
    try {
      stableCandidateId({ opaqueItemId: "item-0007", candidateOrdinal: 3 });
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("MISSING_DIGEST");
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
    expect(() =>
      stableCandidateId({ ...mine, canonicalRecordSha256: other.canonicalRecordSha256 }),
    ).toThrow(CandidateRecordError);
    try {
      stableCandidateId({ ...mine, canonicalRecordSha256: other.canonicalRecordSha256 });
    } catch (error) {
      expect((error as CandidateRecordError).code).toBe("DIGEST_DOES_NOT_MATCH_RECORD");
    }
  });

  it("accepts an explicit null for a normalized production optional", () => {
    // `decision`, `score`, `ranking`, `rankingScore` and `rankedPosition` are
    // optional in production. The acquisition normalizes absence to null so the
    // canonical key set is stable; null is valid, omission is not.
    expect(() =>
      assertCompleteCandidateEvidenceRecord(
        record({ decision: null, score: null, ranking: null, rankingScore: null }),
      ),
    ).not.toThrow();
    expect(() => assertCompleteCandidateEvidenceRecord(without("decision"))).toThrow(
      CandidateRecordError,
    );
  });
});

/** A synthetic RegionOcrResult carrying all thirteen real fields. */
function pass(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    passId: "pass-1-full-image",
    regionName: "full-image",
    passKind: "primary",
    triggerReasons: [],
    preprocessing: ["grayscale", "otsu"],
    fieldEligibility: { brand: true, alcohol: true },
    transform: { crop: null, rotate: 0, scale: 1, originalWidth: 1200, originalHeight: 1600 },
    transformedSize: { width: 1200, height: 1600 },
    pageSegMode: 11,
    rawWordCount: 41,
    discardedWordCount: 2,
    timings: { preprocessMs: 12.5, ocrMs: 830.25, inverseMappingMs: 1.75, totalMs: 844.5 },
    words: [
      { text: "RED", rawConfidence: 91, bbox: { x0: 10, y0: 20, x1: 60, y1: 44 } },
      { text: "BRICK", rawConfidence: 84, bbox: { x0: 64, y0: 20, x1: 150, y1: 44 } },
    ],
    ...over,
  };
}

describe("Issue #149 semantic versus integrity fingerprints", () => {
  it("excludes exactly timings from the semantic preimage", () => {
    expect(SEMANTIC_PASS_EXCLUDED_KEYS).toEqual(["timings"]);
  });

  it("changing only timings changes the integrity hash but not the semantic digest", () => {
    const a = pass();
    const b = pass({
      timings: { preprocessMs: 13.9, ocrMs: 902.1, inverseMappingMs: 2.2, totalMs: 918.2 },
    });
    expect(fullRecordIntegritySha256(b)).not.toBe(fullRecordIntegritySha256(a));
    expect(semanticPassFingerprint(b)).toBe(semanticPassFingerprint(a));
    expect(semanticOrderedPassArrayFingerprint([b])).toBe(semanticOrderedPassArrayFingerprint([a]));
  });

  it("changing a word changes the semantic digest", () => {
    const base = semanticPassFingerprint(pass());
    const mutations: Array<Record<string, unknown>> = [
      { words: [{ text: "RED", rawConfidence: 91, bbox: { x0: 10, y0: 20, x1: 60, y1: 44 } }] },
      {
        words: [
          { text: "REO", rawConfidence: 91, bbox: { x0: 10, y0: 20, x1: 60, y1: 44 } },
          { text: "BRICK", rawConfidence: 84, bbox: { x0: 64, y0: 20, x1: 150, y1: 44 } },
        ],
      },
      {
        words: [
          { text: "RED", rawConfidence: 90, bbox: { x0: 10, y0: 20, x1: 60, y1: 44 } },
          { text: "BRICK", rawConfidence: 84, bbox: { x0: 64, y0: 20, x1: 150, y1: 44 } },
        ],
      },
    ];
    for (const mutation of mutations) {
      expect(semanticPassFingerprint(pass(mutation))).not.toBe(base);
    }
  });

  it("changing transform, preprocessing or pageSegMode changes the semantic digest", () => {
    const base = semanticPassFingerprint(pass());
    for (const mutation of [
      {
        transform: { crop: null, rotate: 90, scale: 1, originalWidth: 1200, originalHeight: 1600 },
      },
      { preprocessing: ["grayscale"] },
      { preprocessing: ["otsu", "grayscale"] },
      { pageSegMode: 7 },
      { transformedSize: { width: 600, height: 800 } },
      { rawWordCount: 40 },
      { discardedWordCount: 3 },
      { fieldEligibility: { brand: false, alcohol: true } },
      { triggerReasons: ["brand-not-observed"] },
      { regionName: "brand-band" },
      { passKind: "recovery" },
      { passId: "pass-2" },
    ]) {
      expect(semanticPassFingerprint(pass(mutation))).not.toBe(base);
    }
  });

  it("changing pass order changes the ordered-array digest", () => {
    const a = pass();
    const b = pass({ passId: "pass-2-brand-band", regionName: "brand-band" });
    expect(semanticOrderedPassArrayFingerprint([b, a])).not.toBe(
      semanticOrderedPassArrayFingerprint([a, b]),
    );
  });

  it("does not let run metadata affect semantic equality", () => {
    // Run metadata is provenance, not OCR output. It rides alongside the
    // evidence, is persisted and reported, and never enters the equality gate.
    const runMetadata = {
      startedAt: "2026-07-31T00:00:00Z",
      workflowRunId: "30602260862",
      artifactId: "4711",
      artifactExpiresAt: "2026-10-29T00:00:00Z",
      runnerIdentity: "ubuntu-24.04/x64",
    };
    const withMetadata = { ...pass(), ...runMetadata };
    const otherRun = {
      ...pass(),
      startedAt: "2026-08-01T09:15:00Z",
      workflowRunId: "30799991111",
      artifactId: "4712",
      artifactExpiresAt: "2026-10-30T09:15:00Z",
      runnerIdentity: "ubuntu-24.04/x64",
    };
    // Metadata is not part of RegionOcrResult, so it is stripped before the
    // semantic digest is taken rather than silently hashed in.
    const strip = (record: Record<string, unknown>): Record<string, unknown> => {
      const clean: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (Object.hasOwn(runMetadata, key)) continue;
        clean[key] = value;
      }
      return clean;
    };
    expect(semanticPassFingerprint(strip(otherRun))).toBe(
      semanticPassFingerprint(strip(withMetadata)),
    );
    expect(fullRecordIntegritySha256(otherRun)).not.toBe(fullRecordIntegritySha256(withMetadata));
  });
});
