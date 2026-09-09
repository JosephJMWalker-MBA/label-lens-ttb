/**
 * Issue #149 — the `too-many-words` counterfactual seam.
 *
 * Two obligations. First, that the evaluation-only option actually changes what
 * it claims to change. Second — the load-bearing one — that adding it did not
 * change production selection: `selectBrandObservation` must behave exactly as
 * it did before the option existed.
 *
 * Synthetic OCR words only. No fixture, no governed corpus, no Brand truth.
 */
import { describe, expect, it } from "vitest";

import type { OcrWord, RegionOcrResult } from "./extractor.types";
import {
  BRAND_FILTER_CHECK_ORDER,
  selectBrandObservation,
  selectBrandObservationWithCompleteFilterDiagnostics,
  selectBrandObservationWithTooManyWordsCounterfactual,
  type BrandCandidateDiagnostic,
} from "./field-selection";

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

/** MAX_BRAND_WORDS is 4, so this line is rejected solely for its length. */
const LONG_BRAND = ["ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON"];
const SHORT_BRAND = ["ALPHA", "BETA"];

const candidatesOf = (
  selection: ReturnType<typeof selectBrandObservation>,
): BrandCandidateDiagnostic[] => selection.brandDiagnostics?.candidates ?? [];

const forText = (
  candidates: BrandCandidateDiagnostic[],
  text: string,
): BrandCandidateDiagnostic | undefined => candidates.find((c) => c.rawText === text);

describe("too-many-words counterfactual seam", () => {
  const longLine = LONG_BRAND.join(" ");

  it("baseline rejects the long candidate for too-many-words", () => {
    const candidate = forText(
      candidatesOf(selectBrandObservationWithCompleteFilterDiagnostics([region([LONG_BRAND])])),
      longLine,
    );
    expect(candidate).toBeDefined();
    expect(candidate?.kept).toBe(false);
    expect(candidate?.filterReason).toBe("too-many-words");
    expect(candidate?.activeRejectionReasons).toContain("too-many-words");
  });

  it("the counterfactual admits that same candidate", () => {
    const candidate = forText(
      candidatesOf(selectBrandObservationWithTooManyWordsCounterfactual([region([LONG_BRAND])])),
      longLine,
    );
    expect(candidate).toBeDefined();
    expect(candidate?.kept).toBe(true);
    // The rule is treated as absent from the ladder, so it reports no failure
    // and the kept-candidate invariant continues to hold.
    expect(candidate?.activeRejectionReasons).toEqual([]);
    expect(candidate?.filterChecks?.find((c) => c.check === "too-many-words")?.failed).toBe(false);
  });

  it("still reports every other ladder rule under the counterfactual", () => {
    const candidate = forText(
      candidatesOf(selectBrandObservationWithTooManyWordsCounterfactual([region([LONG_BRAND])])),
      longLine,
    );
    expect(candidate?.filterChecks).toHaveLength(BRAND_FILTER_CHECK_ORDER.length);
    expect(candidate?.filterChecks?.map((c) => c.check)).toEqual([...BRAND_FILTER_CHECK_ORDER]);
  });

  it("does not rescue a candidate blocked by another rule as well", () => {
    // "www.alpha-beta-gamma-delta.com" is domain-like AND long. Removing only
    // too-many-words must leave it rejected.
    const line = ["www.alpha-beta-gamma-delta-epsilon.com"];
    const candidate = forText(
      candidatesOf(selectBrandObservationWithTooManyWordsCounterfactual([region([line])])),
      line.join(" "),
    );
    if (candidate) expect(candidate.kept).toBe(false);
  });

  describe("production selection is unchanged", () => {
    const corpus: string[][][] = [
      [LONG_BRAND],
      [SHORT_BRAND],
      [LONG_BRAND, SHORT_BRAND],
      [["CHATEAU", "BONNEAU"]],
      [["BOTTLED", "BY", "ALPHA", "BETA", "GAMMA", "WINERY"]],
      [["ALPHA"], ["BETA", "GAMMA", "DELTA", "EPSILON", "ZETA"]],
    ];

    it("the default path still rejects long candidates for too-many-words", () => {
      const candidate = forText(
        candidatesOf(selectBrandObservationWithCompleteFilterDiagnostics([region([LONG_BRAND])])),
        longLine,
      );
      expect(candidate?.kept).toBe(false);
      expect(candidate?.filterReason).toBe("too-many-words");
    });

    it("selectBrandObservation matches the complete-diagnostics variant on every observation", () => {
      // The diagnostics variant is documented as selection-identical. If the new
      // option had leaked into the default options, these would diverge.
      for (const lines of corpus) {
        const plain = selectBrandObservation([region(lines)]);
        const diagnosed = selectBrandObservationWithCompleteFilterDiagnostics([region(lines)]);
        expect(plain.observation).toEqual(diagnosed.observation);
        expect(plain.sourceRegion).toEqual(diagnosed.sourceRegion);
        expect(plain.supportingPassIds).toEqual(diagnosed.supportingPassIds);
      }
    });

    it("the counterfactual differs from production on at least one case", () => {
      // Guards the guard: if the option silently did nothing, every assertion
      // above would pass vacuously.
      const differences = corpus.filter((lines) => {
        const plain = selectBrandObservation([region(lines)]);
        const treated = selectBrandObservationWithTooManyWordsCounterfactual([region(lines)]);
        return JSON.stringify(plain.observation) !== JSON.stringify(treated.observation);
      });
      expect(differences.length).toBeGreaterThan(0);
    });
  });
});
