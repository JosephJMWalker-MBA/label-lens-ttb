/**
 * Experiment A — reachability of the Alcohol reselection treatment.
 *
 * The treatment under test replaces the final Alcohol call site
 *
 *     alcohol = primaryAlcohol.state === "NOT_OBSERVED"
 *       ? selectAlcoholObservation(passes) : primaryAlcohol
 *
 * with a form that reselects whenever recovery passes exist. Control and
 * treatment can therefore only diverge when BOTH hold at once:
 *
 *   1. `recoveryPasses.length > 0`, and
 *   2. primary Alcohol is not `NOT_OBSERVED` (otherwise control already
 *      reselects and the two forms agree).
 *
 * Condition 2 means `needsAlcoholRecovery` is false. These tests characterize
 * what `planRecoveryOcrPasses` can produce in exactly that state — that is, the
 * complete set of inputs on which the treatment could possibly change an
 * outcome. They assert current behavior and are expected to pass on `main`;
 * they exist to bound the experiment, not to encode a defect.
 *
 * `regions.test.ts` already covers the >6-word brand-only case (no passes at
 * all). What is uncovered, and what decides reachability, is the <=6-word case.
 */
import { describe, expect, it } from "vitest";

import type { OcrWord, RegionOcrResult, RegionTransform } from "./extractor.types";
import { planRecoveryOcrPasses } from "./regions";

const TRANSFORM: RegionTransform = {
  crop: { left: 0, top: 0, width: 1000, height: 800 },
  rotate: 0,
  scale: 1,
  originalWidth: 1000,
  originalHeight: 800,
};

function word(text: string, x: number, y: number): OcrWord {
  return {
    text,
    rawConfidence: 92,
    bbox: { x0: x, y0: y, x1: x + 40, y1: y + 18 },
    originalGeometry: {
      imageIndex: 0,
      x,
      y,
      width: 40,
      height: 18,
      imageWidth: 1000,
      imageHeight: 800,
    },
  };
}

function region(words: OcrWord[]): RegionOcrResult {
  return {
    passId: "pass-0-full-image",
    regionName: "full-image",
    passKind: "full-image-primary",
    triggerReasons: ["primary-pass"],
    preprocessing: ["grayscale", "normalise", "scale:1.5"],
    fieldEligibility: { brand: true, alcohol: true },
    transform: TRANSFORM,
    transformedSize: { width: 1000, height: 800 },
    pageSegMode: 11,
    rawWordCount: words.length,
    discardedWordCount: 0,
    timings: { preprocessMs: 0, ocrMs: 0, inverseMappingMs: 0, totalMs: 0 },
    words,
  };
}

/** A primary pass carrying `count` words, spread so no edge heuristic dominates. */
function primaryWithWordCount(count: number): RegionOcrResult {
  const words: OcrWord[] = [];
  for (let index = 0; index < count; index++) {
    words.push(word(`WORD${index}`, 300 + (index % 4) * 60, 200 + Math.floor(index / 4) * 40));
  }
  return region(words);
}

describe("Experiment A reachability — brand-only recovery (needsAlcoholRecovery = false)", () => {
  it("plans no alcohol-bearing pass at any word count: only rot180 is ever scheduled", () => {
    // The complete word-count sweep across the rot180 threshold. Every planned
    // pass in the brand-only state is recorded, so a future change that adds an
    // alcohol-bearing pass here fails this test rather than passing silently.
    const observed = new Map<number, string[]>();
    for (let count = 0; count <= 12; count++) {
      const planned = planRecoveryOcrPasses({
        primary: primaryWithWordCount(count),
        needsBrandRecovery: true,
        needsAlcoholRecovery: false,
      });
      observed.set(
        count,
        planned.map((pass) => pass.regionName),
      );
    }

    for (const [count, regionNames] of observed) {
      // No edge strip and no focus crop may appear: both are gated on
      // needsAlcoholRecovery, and they are the only passes that re-read the
      // side and centre panels where alcohol statements live.
      expect(
        regionNames.some((name) => /edge|focus/i.test(name)),
        `word count ${count} scheduled an alcohol-bearing pass: ${regionNames.join(", ")}`,
      ).toBe(false);
      expect(regionNames.length, `word count ${count} planned ${regionNames.join(", ")}`).toBeLessThanOrEqual(1);
    }

    // The threshold itself: at most a single rot180 pass, and only at <= 6 words.
    expect(observed.get(6)?.length).toBe(1);
    expect(observed.get(6)?.[0]).toMatch(/rot180/i);
    expect(observed.get(7)).toEqual([]);
    expect(observed.get(12)).toEqual([]);
  });

  it("schedules the rot180 pass for the orientation-fallback reason only", () => {
    const planned = planRecoveryOcrPasses({
      primary: primaryWithWordCount(3),
      needsBrandRecovery: true,
      needsAlcoholRecovery: false,
    });

    expect(planned).toHaveLength(1);
    expect(planned[0]?.triggerReasons).toContain("orientation-fallback");
    // "alcohol-not-observed" must not appear: alcohol was observed on the
    // primary pass, so no alcohol-driven reason may justify this pass.
    expect(planned[0]?.triggerReasons).not.toContain("alcohol-not-observed");
  });

  it("plans nothing at all when neither field needs recovery", () => {
    expect(
      planRecoveryOcrPasses({
        primary: primaryWithWordCount(3),
        needsBrandRecovery: false,
        needsAlcoholRecovery: false,
      }),
    ).toEqual([]);
  });
});
