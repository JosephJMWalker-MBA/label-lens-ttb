/**
 * Issue #149 — canonical candidate fingerprint contract.
 *
 * Non-OCR. Every record here is synthetic and built in this file. No fixture,
 * no governed truth, no acquisition run.
 */
import { describe, expect, it } from "vitest";

import {
  CANDIDATE_CANONICALIZATION_VERSION,
  CandidateCanonicalizationError,
  canonicalRecordSha256,
  canonicalize,
  fingerprintPreimage,
  stableCandidateId,
} from "./issue-149-candidate-canonical";

/** A representative persisted candidate record. */
function record(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    opaqueItemId: "item-0007",
    candidateOrdinal: 3,
    completeCandidateArrayLength: 42,
    filterChecks: [
      { check: "producer-line", failed: true },
      { check: "no-letters-or-too-short", failed: false },
      { check: "too-many-words", failed: true },
    ],
    activeRejectionReasons: ["producer-line", "too-many-words"],
    filterReason: "producer-line",
    kept: false,
    rawText: "PRODUCED AND BOTTLED BY RED BRICK WINERY",
    cleanedValue: "PRODUCED AND BOTTLED BY RED BRICK WINERY",
    passId: "pass-1-full-image",
    passKind: "full-image-primary",
    supportPassIds: ["pass-1-full-image"],
    candidateProvenance: { regionName: "full-image", recoveryPassUsed: false },
    assembly: "whole-line",
    lineIndexes: [4],
    prominence: 61,
    confidence: 0.87,
    ocrEvidenceScore: 0.87,
    ocrConfidence: { mean: 87, min: 71 },
    rankingEligible: false,
    score: null,
    rankingScore: null,
    rankedPosition: null,
    selected: false,
    decision: null,
    ...over,
  };
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

  it("changes when any evidence field changes", () => {
    const base = canonicalRecordSha256(record());
    const mutations: Array<Record<string, unknown>> = [
      { opaqueItemId: "item-0008" },
      { candidateOrdinal: 4 },
      { completeCandidateArrayLength: 43 },
      { filterReason: "too-many-words" },
      { kept: true },
      { rawText: "OTHER" },
      { cleanedValue: "OTHER" },
      { passId: "pass-2" },
      { lineIndexes: [5] },
      { prominence: 62 },
      { confidence: 0.88 },
      { rankedPosition: 1 },
      { selected: true },
      { filterChecks: [{ check: "producer-line", failed: false }] },
    ];
    for (const mutation of mutations) {
      expect(canonicalRecordSha256(record(mutation))).not.toBe(base);
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

  it("recomputes to the persisted digest", () => {
    const evidence = record();
    const digest = canonicalRecordSha256(evidence);
    const persisted = {
      ...evidence,
      canonicalRecordSha256: digest,
      stableCandidateId: `${evidence.opaqueItemId}:${evidence.candidateOrdinal}:${digest}`,
    };
    expect(canonicalRecordSha256(persisted)).toBe(digest);
    expect(stableCandidateId(persisted as never)).toBe(persisted.stableCandidateId);
  });

  it("builds the stable id from the full digest, never a truncation", () => {
    const evidence = record();
    const id = stableCandidateId(evidence as never);
    const [item, ordinal, digest] = id.split(":");
    expect(item).toBe("item-0007");
    expect(ordinal).toBe("3");
    expect(digest).toHaveLength(64);
  });
});
