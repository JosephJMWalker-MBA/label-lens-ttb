/**
 * Issue #149 — the oracle exact-window seam.
 *
 * Three obligations:
 *   1. the seam emits the exact window it claims to emit;
 *   2. production selection is unchanged when no runs are supplied;
 *   3. the SHAM control — supplying a run that creates no new distinct
 *      candidate leaves selection, ranking and authority untouched, so any
 *      treatment effect is attributable to the newly available candidate and
 *      not to the act of injecting one.
 *
 * Synthetic OCR words only. No fixture, no governed corpus, no Brand truth.
 */
import { describe, expect, it } from "vitest";

import type { OcrWord, RegionOcrResult } from "./extractor.types";
import {
  selectBrandObservation,
  selectBrandObservationWithCompleteFilterDiagnostics,
  selectBrandObservationWithOracleExactWindows,
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

const candidatesOf = (
  selection: ReturnType<typeof selectBrandObservation>,
): BrandCandidateDiagnostic[] => selection.brandDiagnostics?.candidates ?? [];

/** A warning line that carries a brand at its end — the class-E shape. */
const WARNING_LINE = [
  "GOVERNMENT",
  "WARNING",
  "ACCORDING",
  "TO",
  "THE",
  "SURGEON",
  "GENERAL",
  "ALPHA",
  "RIDGE",
];

describe("oracle exact-window seam", () => {
  it("baseline never emits the exact Brand window inside a rejected whole line", () => {
    const candidates = candidatesOf(
      selectBrandObservationWithCompleteFilterDiagnostics([region([WARNING_LINE])]),
    );
    expect(candidates.some((c) => (c.cleanedValue ?? c.rawText) === "ALPHA RIDGE")).toBe(false);
  });

  it("the oracle emits exactly that window, from the line's own words", () => {
    const candidates = candidatesOf(
      selectBrandObservationWithOracleExactWindows([region([WARNING_LINE])], [["alpha", "ridge"]]),
    );
    const oracle = candidates.find((c) => c.rawText === "ALPHA RIDGE");
    expect(oracle).toBeDefined();
    expect(oracle?.assembly).toBe("line-window");
    // Provenance is the true containing pass, not a synthetic one.
    expect(oracle?.passId).toBe("pass-1-full-image");
    expect(oracle?.passKind).toBe("full-image-primary");
    expect(oracle?.regionName).toBe("full-image");
    expect(oracle?.lineIndexes).toEqual([0]);
  });

  it("the oracle candidate is not exempt from the filters", () => {
    // A run that is domain-like must still be rejected once emitted: the seam
    // supplies a window, it does not grant immunity.
    const line = ["VISIT", "WWW.ALPHARIDGE.COM", "TODAY", "FOR", "MORE"];
    const candidates = candidatesOf(
      selectBrandObservationWithOracleExactWindows([region([line])], [["wwwalpharidgecom"]]),
    );
    const oracle = candidates.find((c) => c.rawText === "WWW.ALPHARIDGE.COM");
    if (oracle) {
      expect(oracle.kept).toBe(false);
      expect(oracle.activeRejectionReasons ?? []).toContain("domain-like");
    }
  });

  describe("production default is unchanged", () => {
    const corpus: string[][][] = [
      [WARNING_LINE],
      [["ALPHA", "RIDGE"]],
      [
        ["CHATEAU", "BONNEAU"],
        ["ESTATE", "BOTTLED"],
      ],
      [["ALPHA", "RIDGE", "VINEYARDS", "LLC"]],
      [WARNING_LINE, ["ALPHA", "RIDGE"]],
    ];

    it("an empty run list changes nothing", () => {
      for (const lines of corpus) {
        const plain = selectBrandObservation([region(lines)]);
        const empty = selectBrandObservationWithOracleExactWindows([region(lines)], []);
        expect(empty.observation).toEqual(plain.observation);
        expect(empty.sourceRegion).toEqual(plain.sourceRegion);
        expect(empty.supportingPassIds).toEqual(plain.supportingPassIds);
      }
    });

    it("guards the guard: the oracle DOES change at least one case", () => {
      const differences = corpus.filter((lines) => {
        const plain = selectBrandObservation([region(lines)]);
        const treated = selectBrandObservationWithOracleExactWindows(
          [region(lines)],
          [["alpha", "ridge"]],
        );
        return JSON.stringify(plain.observation) !== JSON.stringify(treated.observation);
      });
      expect(differences.length).toBeGreaterThan(0);
    });
  });

  describe("sham control — injecting a candidate that already exists is inert", () => {
    // The brand stands alone on its own line, so the ordinary whole-line
    // candidate "ALPHA RIDGE" already exists. Supplying the same run creates no
    // new distinct candidate value.
    const shamLines = [
      ["ALPHA", "RIDGE"],
      ["ESTATE", "BOTTLED"],
    ];

    it("selection, provenance and authority are unchanged", () => {
      const plain = selectBrandObservation([region(shamLines)]);
      const sham = selectBrandObservationWithOracleExactWindows(
        [region(shamLines)],
        [["alpha", "ridge"]],
      );
      expect(sham.observation).toEqual(plain.observation);
      expect(sham.sourceRegion).toEqual(plain.sourceRegion);
      expect(sham.supportingPassIds).toEqual(plain.supportingPassIds);
      expect(sham.recoveryPassUsed).toEqual(plain.recoveryPassUsed);
    });

    it("a run absent from every line is inert", () => {
      const plain = selectBrandObservation([region(shamLines)]);
      const absent = selectBrandObservationWithOracleExactWindows(
        [region(shamLines)],
        [["nowhere", "onthislabel"]],
      );
      expect(absent.observation).toEqual(plain.observation);
    });

    it("a whole-line run emits nothing, because that candidate already exists", () => {
      const before = candidatesOf(
        selectBrandObservationWithCompleteFilterDiagnostics([region([["ALPHA", "RIDGE"]])]),
      ).length;
      const after = candidatesOf(
        selectBrandObservationWithOracleExactWindows(
          [region([["ALPHA", "RIDGE"]])],
          [["alpha", "ridge"]],
        ),
      ).length;
      expect(after).toBe(before);
    });
  });
});

describe("oracle window matching across separator tokens", () => {
  // "&" normalizes to the empty string. It must be skipped when MATCHING but
  // kept inside the emitted slice, matching the frozen PR #223 rule. A first
  // implementation of this seam failed to skip it and produced no window for
  // the two "Luigi & Giovanni" cases.
  const line = ["ACCORDING", "TO", "THE", "SURGEON", "GENERAL", "LUIGI", "&", "GIOVANNI"];

  it("emits the window across a separator token", () => {
    const oracle = candidatesOf(
      selectBrandObservationWithOracleExactWindows([region([line])], [["luigi", "giovanni"]]),
    ).find((c) => c.rawText === "LUIGI & GIOVANNI");
    expect(oracle).toBeDefined();
    expect(oracle?.assembly).toBe("line-window");
  });

  it("does not start a window on a separator token", () => {
    const oracle = candidatesOf(
      selectBrandObservationWithOracleExactWindows(
        [region([["ALPHA", "&", "BETA", "GAMMA", "DELTA", "EPSILON"]])],
        [["beta", "gamma"]],
      ),
    ).find((c) => c.rawText === "BETA GAMMA");
    expect(oracle).toBeDefined();
    // The window begins on a character-bearing token, never on "&".
    expect(
      candidatesOf(
        selectBrandObservationWithOracleExactWindows(
          [region([["ALPHA", "&", "BETA", "GAMMA", "DELTA", "EPSILON"]])],
          [["beta", "gamma"]],
        ),
      ).some((c) => c.rawText === "& BETA GAMMA"),
    ).toBe(false);
  });
});
