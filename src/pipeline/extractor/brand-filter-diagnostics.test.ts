/**
 * Complete Brand filter diagnostics — evaluation-only.
 *
 * These tests use synthetic OCR words constructed here. No fixture, no governed
 * corpus, no Brand truth and no expected answer is loaded: every assertion is
 * about the filter's own reported reasons, never about whether a value is the
 * "right" brand.
 */
import { describe, expect, it } from "vitest";

import type { OcrWord, RegionOcrResult } from "./extractor.types";
import {
  assertBrandFilterDiagnosticInvariants,
  BRAND_FILTER_CHECK_ORDER,
  selectBrandObservation,
  selectBrandObservationWithCompleteFilterDiagnostics,
  type BrandCandidateDiagnostic,
  type BrandFilterCheck,
  type BrandFilterCheckName,
} from "./field-selection";

/** One synthetic word. Geometry is uniform so prominence never decides anything. */
function word(text: string, index: number, y = 100): OcrWord {
  const width = Math.max(text.length, 1) * 20;
  const x0 = 40 + index * 220;
  return {
    text,
    rawConfidence: 92,
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
  };
}

/** One synthetic single-pass region result containing the given lines. */
function region(lines: string[][]): RegionOcrResult {
  const words: OcrWord[] = [];
  lines.forEach((line, lineIndex) => {
    line.forEach((text, wordIndex) => words.push(word(text, wordIndex, 100 + lineIndex * 200)));
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
    words,
    warnings: [],
    timings: { preprocessMs: 0, ocrMs: 0, inverseMappingMs: 0, totalMs: 0 },
  } as unknown as RegionOcrResult;
}

function diagnosticsOf(lines: string[][]): BrandCandidateDiagnostic[] {
  const selection = selectBrandObservationWithCompleteFilterDiagnostics([region(lines)]);
  return selection.brandDiagnostics?.candidates ?? [];
}

/** The candidate whose raw text is exactly this line, if the pipeline built one. */
function candidateFor(
  candidates: BrandCandidateDiagnostic[],
  rawText: string,
): BrandCandidateDiagnostic | undefined {
  return candidates.find((candidate) => candidate.rawText === rawText);
}

describe("complete Brand filter diagnostics", () => {
  describe("invariants across every candidate the pipeline builds", () => {
    const lines = [
      ["PRODUCED", "AND", "BOTTLED", "BY", "RED", "BRICK", "WINERY"],
      ["www.example-winery.com", "and", "more", "prose", "here"],
      ["Fattoria"],
      ["CONTAINS", "SULFITES", "12%", "ALC"],
      ["cabernet", "sauvignon"],
    ];

    it("reports every check exactly once, in the authoritative ladder order", () => {
      const candidates = diagnosticsOf(lines);
      expect(candidates.length).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(candidate.filterChecks).toBeDefined();
        const order = candidate.filterChecks!.map((entry) => entry.check);
        expect(order).toEqual([...BRAND_FILTER_CHECK_ORDER]);
        expect(new Set(order).size).toBe(BRAND_FILTER_CHECK_ORDER.length);
      }
    });

    it("gives every rejected candidate at least one active reason", () => {
      for (const candidate of diagnosticsOf(lines).filter((entry) => !entry.kept)) {
        expect(candidate.activeRejectionReasons!.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("makes the first active reason the authoritative filterReason", () => {
      for (const candidate of diagnosticsOf(lines).filter((entry) => !entry.kept)) {
        expect(candidate.activeRejectionReasons![0]).toBe(candidate.filterReason);
      }
    });

    it("gives every kept candidate no active reasons", () => {
      const kept = diagnosticsOf(lines).filter((entry) => entry.kept);
      expect(kept.length).toBeGreaterThan(0);
      for (const candidate of kept) {
        expect(candidate.activeRejectionReasons).toEqual([]);
        expect(candidate.filterChecks!.every((entry) => !entry.failed)).toBe(true);
      }
    });

    it("lists active reasons in ladder order", () => {
      for (const candidate of diagnosticsOf(lines).filter((entry) => !entry.kept)) {
        const positions = candidate.activeRejectionReasons!.map((reason) =>
          BRAND_FILTER_CHECK_ORDER.indexOf(reason),
        );
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }
    });
  });

  describe("representative multi-rule combinations", () => {
    it("reports producer-line together with a later rule", () => {
      // "PRODUCED ... BY ..." trips producer-line first; the same seven-word line
      // also exceeds the four-word limit and carries non-brand keywords.
      const raw = "PRODUCED AND BOTTLED BY RED BRICK WINERY";
      const candidate = candidateFor(diagnosticsOf([raw.split(" ")]), raw);
      expect(candidate).toBeDefined();
      expect(candidate!.filterReason).toBe("producer-line");
      expect(candidate!.activeRejectionReasons![0]).toBe("producer-line");
      expect(candidate!.activeRejectionReasons!.length).toBeGreaterThan(1);
      expect(candidate!.activeRejectionReasons).toContain("too-many-words");
    });

    it("reports too-many-words together with a later rule", () => {
      // Five lowercase prose words: too-many-words fires first, and the line is
      // also a sentence fragment.
      const raw = "our family has been growing";
      const candidate = candidateFor(diagnosticsOf([raw.split(" ")]), raw);
      expect(candidate).toBeDefined();
      expect(candidate!.filterReason).toBe("too-many-words");
      expect(candidate!.activeRejectionReasons![0]).toBe("too-many-words");
      expect(candidate!.activeRejectionReasons).toContain("sentence-fragment");
    });

    it("reports domain-like together with another rule", () => {
      // A bare lowercase domain: domain-like fires first, and the same text is
      // also a sentence fragment because its only content word is lowercase.
      const raw = "aa.com";
      const candidate = candidateFor(diagnosticsOf([[raw]]), raw);
      expect(candidate).toBeDefined();
      expect(candidate!.filterReason).toBe("domain-like");
      expect(candidate!.activeRejectionReasons![0]).toBe("domain-like");
      expect(candidate!.activeRejectionReasons!.length).toBeGreaterThan(1);
      expect(candidate!.activeRejectionReasons).toContain("sentence-fragment");
    });

    it("reports exactly one reason for a single-rule failure", () => {
      // A clean five-word title-case name: only the word limit is exceeded.
      const raw = "Alpha Beta Gamma Delta Epsilon";
      const candidate = candidateFor(diagnosticsOf([raw.split(" ")]), raw);
      expect(candidate).toBeDefined();
      expect(candidate!.activeRejectionReasons).toEqual(["too-many-words"]);
      expect(candidate!.filterReason).toBe("too-many-words");
    });
  });

  describe("production output is unchanged", () => {
    const lines = [
      ["PRODUCED", "AND", "BOTTLED", "BY", "RED", "BRICK", "WINERY"],
      ["www.example-winery.com"],
      ["Fattoria"],
      ["CONTAINS", "SULFITES"],
      ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"],
    ];

    it("omits the diagnostics by default", () => {
      const candidates = selectBrandObservation([region(lines)]).brandDiagnostics?.candidates ?? [];
      expect(candidates.length).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(candidate.filterChecks).toBeUndefined();
        expect(candidate.activeRejectionReasons).toBeUndefined();
      }
    });

    it("includes the diagnostics under the evaluation-only entry point", () => {
      const candidates = diagnosticsOf(lines);
      expect(candidates.length).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(candidate.filterChecks).toBeDefined();
        expect(candidate.activeRejectionReasons).toBeDefined();
      }
    });

    it("produces an identical observation with diagnostics disabled and enabled", () => {
      const off = selectBrandObservation([region(lines)]);
      const on = selectBrandObservationWithCompleteFilterDiagnostics([region(lines)]);

      expect(on.observation.value).toEqual(off.observation.value);
      expect(on.observation.state).toEqual(off.observation.state);
      expect(on.observation.confidence).toEqual(off.observation.confidence);
      expect(on.observation.alternates).toEqual(off.observation.alternates);
      expect(on.brandDiagnostics?.abstentionReason).toEqual(off.brandDiagnostics?.abstentionReason);
    });

    it("produces an identical ranked order, kept status and authoritative reason", () => {
      const off = selectBrandObservation([region(lines)]).brandDiagnostics?.candidates ?? [];
      const on = diagnosticsOf(lines);

      expect(on.length).toBe(off.length);
      expect(on.map((c) => c.rawText)).toEqual(off.map((c) => c.rawText));
      expect(on.map((c) => c.kept)).toEqual(off.map((c) => c.kept));
      expect(on.map((c) => c.filterReason)).toEqual(off.map((c) => c.filterReason));
      expect(on.map((c) => c.decision)).toEqual(off.map((c) => c.decision));
      expect(on.map((c) => c.ranking?.rankingScore)).toEqual(
        off.map((c) => c.ranking?.rankingScore),
      );
      expect(on.map((c) => c.score)).toEqual(off.map((c) => c.score));
    });

    it("leaves the line-level diagnostics untouched", () => {
      const off = selectBrandObservation([region(lines)]).brandDiagnostics?.lines ?? [];
      const on = selectBrandObservationWithCompleteFilterDiagnostics([region(lines)])
        .brandDiagnostics?.lines;
      expect(on).toEqual(off);
    });
  });

  describe("default in-memory object shape", () => {
    const lines = [
      ["PRODUCED", "AND", "BOTTLED", "BY", "RED", "BRICK", "WINERY"],
      ["Fattoria"],
      ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"],
    ];

    it("gives default candidates neither key as an OWN property", () => {
      const candidates = selectBrandObservation([region(lines)]).brandDiagnostics?.candidates ?? [];
      expect(candidates.length).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(Object.hasOwn(candidate, "filterChecks")).toBe(false);
        expect(Object.hasOwn(candidate, "activeRejectionReasons")).toBe(false);
      }
    });

    it("gives evaluation-only candidates both keys as OWN properties", () => {
      const candidates = diagnosticsOf(lines);
      expect(candidates.length).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(Object.hasOwn(candidate, "filterChecks")).toBe(true);
        expect(Object.hasOwn(candidate, "activeRejectionReasons")).toBe(true);
      }
    });

    it("leaves default Object.keys free of any diagnostics key", () => {
      const candidates = selectBrandObservation([region(lines)]).brandDiagnostics?.candidates ?? [];
      for (const candidate of candidates) {
        const keys = Object.keys(candidate);
        expect(keys).not.toContain("filterChecks");
        expect(keys).not.toContain("activeRejectionReasons");
      }
    });

    it("leaves default JSON serialization unchanged", () => {
      const candidates = selectBrandObservation([region(lines)]).brandDiagnostics?.candidates ?? [];
      for (const candidate of candidates) {
        const serialized = JSON.stringify(candidate);
        expect(serialized).not.toContain("filterChecks");
        expect(serialized).not.toContain("activeRejectionReasons");
      }
    });

    it("serializes the diagnostics only on the evaluation-only path", () => {
      const serialized = JSON.stringify(diagnosticsOf(lines));
      expect(serialized).toContain("filterChecks");
      expect(serialized).toContain("activeRejectionReasons");
    });
  });

  describe("runtime invariant enforcement", () => {
    const PREFIX = "BRAND_FILTER_DIAGNOSTIC_INVARIANT_FAILURE";
    const allChecks = (failed: BrandFilterCheckName[] = []): BrandFilterCheck[] =>
      BRAND_FILTER_CHECK_ORDER.map((check) => ({ check, failed: failed.includes(check) }));
    const diag = (over: Partial<BrandCandidateDiagnostic> = {}) =>
      ({
        rawText: "x",
        kept: false,
        filterReason: "too-many-words",
        ...over,
      }) as BrandCandidateDiagnostic;

    it("accepts a well-formed rejected candidate", () => {
      expect(() =>
        assertBrandFilterDiagnosticInvariants(diag(), allChecks(["too-many-words"]), [
          "too-many-words",
        ]),
      ).not.toThrow();
    });

    it("accepts a well-formed kept candidate", () => {
      expect(() =>
        assertBrandFilterDiagnosticInvariants(
          diag({ kept: true, filterReason: "candidate-positive" }),
          allChecks(),
          [],
        ),
      ).not.toThrow();
    });

    it("rejects a wrong number of checks", () => {
      expect(() =>
        assertBrandFilterDiagnosticInvariants(diag(), allChecks().slice(0, 9), []),
      ).toThrow(new RegExp(`^${PREFIX}`));
    });

    it("rejects a duplicated check", () => {
      const checks = allChecks();
      checks[1] = { check: "producer-line", failed: false };
      expect(() => assertBrandFilterDiagnosticInvariants(diag(), checks, [])).toThrow(
        new RegExp(`^${PREFIX}`),
      );
    });

    it("rejects checks out of ladder order", () => {
      const checks = allChecks();
      [checks[0], checks[1]] = [checks[1], checks[0]];
      expect(() => assertBrandFilterDiagnosticInvariants(diag(), checks, [])).toThrow(
        new RegExp(`^${PREFIX}`),
      );
    });

    it("rejects active reasons that do not equal the failed checks in order", () => {
      expect(() =>
        assertBrandFilterDiagnosticInvariants(
          diag(),
          allChecks(["producer-line", "too-many-words"]),
          ["too-many-words", "producer-line"],
        ),
      ).toThrow(new RegExp(`^${PREFIX}`));
    });

    it("rejects a rejected candidate with no active reason", () => {
      expect(() => assertBrandFilterDiagnosticInvariants(diag(), allChecks(), [])).toThrow(
        new RegExp(`^${PREFIX}`),
      );
    });

    it("rejects a first active reason that is not the authoritative filterReason", () => {
      expect(() =>
        assertBrandFilterDiagnosticInvariants(
          diag({ filterReason: "domain-like" }),
          allChecks(["too-many-words"]),
          ["too-many-words"],
        ),
      ).toThrow(new RegExp(`^${PREFIX}`));
    });

    it("rejects a kept candidate carrying an active reason", () => {
      expect(() =>
        assertBrandFilterDiagnosticInvariants(
          diag({ kept: true, filterReason: "candidate-positive" }),
          allChecks(["too-many-words"]),
          ["too-many-words"],
        ),
      ).toThrow(new RegExp(`^${PREFIX}`));
    });

    it("rejects a kept candidate carrying a failed check", () => {
      const checks = allChecks(["too-many-words"]);
      expect(() =>
        assertBrandFilterDiagnosticInvariants(
          diag({ kept: true, filterReason: "candidate-positive" }),
          checks,
          [],
        ),
      ).toThrow(new RegExp(`^${PREFIX}`));
    });

    it("holds for every candidate the pipeline actually builds", () => {
      // The enabled path asserts on every candidate; reaching this point without
      // a throw is the proof.
      expect(() =>
        diagnosticsOf([
          ["PRODUCED", "AND", "BOTTLED", "BY", "RED", "BRICK", "WINERY"],
          ["www.example-winery.com", "and", "more", "prose", "here"],
          ["Fattoria"],
          ["CONTAINS", "SULFITES", "12%", "ALC"],
          ["cabernet", "sauvignon"],
          ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"],
        ]),
      ).not.toThrow();
    });
  });
});
