import { describe, expect, it } from "vitest";

import {
  isRecognizedBrandPrefix,
  isInvalidLowerLine,
  evaluateStackedHeadingGeometry,
  isNarrowStackedHeadingPair,
} from "./stacked-headings";
import type { RegionOcrResult } from "./extractor.types";
import {
  selectBrandObservation,
  selectBrandObservationWithCoherentLineMergeTreatment,
} from "./field-selection";

describe("Stacked-Heading Candidate Formation (Phase 2G)", () => {
  describe("Brand Prefix Recognition & Normalization", () => {
    it("recognizes standard brand prefixes", () => {
      expect(isRecognizedBrandPrefix("CHATEAU")).toBe(true);
      expect(isRecognizedBrandPrefix("DOMAINE")).toBe(true);
      expect(isRecognizedBrandPrefix("BODEGA")).toBe(true);
      expect(isRecognizedBrandPrefix("BODEGAS")).toBe(true);
      expect(isRecognizedBrandPrefix("MAISON")).toBe(true);
      expect(isRecognizedBrandPrefix("VILLA")).toBe(true);
      expect(isRecognizedBrandPrefix("TENUTA")).toBe(true);
      expect(isRecognizedBrandPrefix("CASTELLO")).toBe(true);
    });

    it("handles diacritics and case variations", () => {
      expect(isRecognizedBrandPrefix("CHÂTEAU")).toBe(true);
      expect(isRecognizedBrandPrefix("Château")).toBe(true);
      expect(isRecognizedBrandPrefix("domaine")).toBe(true);
      expect(isRecognizedBrandPrefix("Bodegas")).toBe(true);
    });

    it("rejects non-brand-prefix terms", () => {
      expect(isRecognizedBrandPrefix("RED")).toBe(false);
      expect(isRecognizedBrandPrefix("CABERNET")).toBe(false);
      expect(isRecognizedBrandPrefix("NEBLA")).toBe(false);
      expect(isRecognizedBrandPrefix("WINERY")).toBe(false);
      expect(isRecognizedBrandPrefix("ESTATE")).toBe(false);
    });
  });

  describe("Lower Line Proper Noun Validation", () => {
    it("accepts legitimate brand proper nouns", () => {
      expect(isInvalidLowerLine("BONNEAU")).toBe(false);
      expect(isInvalidLowerLine("LEROY")).toBe(false);
      expect(isInvalidLowerLine("CATENA")).toBe(false);
      expect(isInvalidLowerLine("ROTHSCHILD")).toBe(false);
      expect(isInvalidLowerLine("MARGAUX")).toBe(false);
    });

    it("rejects generic wine descriptors (near misses)", () => {
      expect(isInvalidLowerLine("RED")).toBe(true);
      expect(isInvalidLowerLine("WHITE")).toBe(true);
      expect(isInvalidLowerLine("WINE")).toBe(true);
      expect(isInvalidLowerLine("RESERVE")).toBe(true);
      expect(isInvalidLowerLine("RESERVA")).toBe(true);
      expect(isInvalidLowerLine("VINTAGE")).toBe(true);
      expect(isInvalidLowerLine("BRUT")).toBe(true);
      expect(isInvalidLowerLine("DRY")).toBe(true);
    });

    it("rejects grape varietals", () => {
      expect(isInvalidLowerLine("MENCIA")).toBe(true);
      expect(isInvalidLowerLine("CABERNET")).toBe(true);
      expect(isInvalidLowerLine("SAUVIGNON")).toBe(true);
      expect(isInvalidLowerLine("CHARDONNAY")).toBe(true);
      expect(isInvalidLowerLine("MERLOT")).toBe(true);
      expect(isInvalidLowerLine("PINOT")).toBe(true);
      expect(isInvalidLowerLine("NEBBIOLO")).toBe(true);
      expect(isInvalidLowerLine("TEMPRANILLO")).toBe(true);
    });

    it("rejects geographic appellations", () => {
      expect(isInvalidLowerLine("RIOJA")).toBe(true);
      expect(isInvalidLowerLine("BORDEAUX")).toBe(true);
      expect(isInvalidLowerLine("PAESTUM")).toBe(true);
      expect(isInvalidLowerLine("NAPA")).toBe(true);
      expect(isInvalidLowerLine("CORTON")).toBe(true);
      expect(isInvalidLowerLine("ALOXE-CORTON")).toBe(true);
      expect(isInvalidLowerLine("CHIANTI")).toBe(true);
    });

    it("rejects tokens with digits (postal codes, vintages)", () => {
      expect(isInvalidLowerLine("21420")).toBe(true);
      expect(isInvalidLowerLine("2020")).toBe(true);
      expect(isInvalidLowerLine("750ML")).toBe(true);
      expect(isInvalidLowerLine("ALOXE-CORTON", "21420 ALOXE-CORTON")).toBe(true);
    });

    it("rejects short tokens (< 3 chars)", () => {
      expect(isInvalidLowerLine("DE")).toBe(true);
      expect(isInvalidLowerLine("LE")).toBe(true);
      expect(isInvalidLowerLine("OF")).toBe(true);
    });
  });

  describe("Geometry: Vertical Proximity & Horizontal Alignment", () => {
    const baseUpper = { x: 100, y: 50, width: 200, height: 30 };

    it("accepts vertically adjacent, center-aligned pairs (gap <= 1.8 * avgH)", () => {
      const lower = { x: 95, y: 85, width: 210, height: 40 }; // gap = 5, avgH = 35, ratio = 0.14
      const result = evaluateStackedHeadingGeometry(baseUpper, lower);
      expect(result.valid).toBe(true);
      expect(result.verticalGapRatio).toBeLessThanOrEqual(1.8);
      expect(result.centerOffset).toBeLessThanOrEqual(0.45);
    });

    it("rejects excessive vertical gap (> 1.8 * avgH)", () => {
      const lower = { x: 100, y: 150, width: 200, height: 30 }; // gap = 70, avgH = 30, ratio = 2.33
      const result = evaluateStackedHeadingGeometry(baseUpper, lower);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("excessive-vertical-gap");
      expect(result.verticalGapRatio).toBeGreaterThan(1.8);
    });

    it("rejects excessive horizontal center offset (> 0.45)", () => {
      // baseUpper center = 200, lower center = 50 + 200/2 = 150, maxW = 200, offset = 50/200 = 0.25 (ok)
      // Extreme offset: lower at x=300, center = 400, offset = |200-400|/200 = 1.0 > 0.45
      const lower = { x: 300, y: 85, width: 200, height: 30 };
      const result = evaluateStackedHeadingGeometry(baseUpper, lower);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("excessive-horizontal-offset");
      expect(result.centerOffset).toBeGreaterThan(0.45);
    });

    it("rejects inverted vertical order (upper line below lower line)", () => {
      const lower = { x: 100, y: 20, width: 200, height: 30 }; // lower is above upper
      const result = evaluateStackedHeadingGeometry(baseUpper, lower);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("upper-line-below-lower-line");
    });
  });

  describe("Narrow Stacked-Heading Pair Predicate", () => {
    const makeCandidate = (
      wordTexts: string[],
      geom: { x: number; y: number; width: number; height: number },
    ) => ({
      words: wordTexts.map((text) => ({ text })),
      value: wordTexts.join(" "),
      geometry: { ...geom, imageIndex: 0, imageWidth: 500, imageHeight: 800 },
    });

    it("approves genuine stacked pairs (Chateau Bonneau, Domaine Leroy, Bodega Catena)", () => {
      const chateauUpper = makeCandidate(["CHATEAU"], { x: 120, y: 70, width: 160, height: 25 });
      const bonneauLower = makeCandidate(["BONNEAU"], { x: 50, y: 100, width: 300, height: 46 });
      expect(isNarrowStackedHeadingPair(chateauUpper, bonneauLower)).toBe(true);

      const domaineUpper = makeCandidate(["DOMAINE"], { x: 100, y: 100, width: 180, height: 30 });
      const leroyLower = makeCandidate(["LEROY"], { x: 90, y: 135, width: 200, height: 40 });
      expect(isNarrowStackedHeadingPair(domaineUpper, leroyLower)).toBe(true);

      const bodegaUpper = makeCandidate(["BODEGA"], { x: 100, y: 100, width: 180, height: 30 });
      const catenaLower = makeCandidate(["CATENA"], { x: 90, y: 135, width: 200, height: 40 });
      expect(isNarrowStackedHeadingPair(bodegaUpper, catenaLower)).toBe(true);
    });

    it("rejects generic wine descriptors (Chateau Red, Domaine Wine, Bodega Reserva)", () => {
      const chateauUpper = makeCandidate(["CHATEAU"], { x: 120, y: 70, width: 160, height: 25 });
      const redLower = makeCandidate(["RED"], { x: 140, y: 100, width: 120, height: 25 });
      expect(isNarrowStackedHeadingPair(chateauUpper, redLower)).toBe(false);

      const domaineUpper = makeCandidate(["DOMAINE"], { x: 100, y: 100, width: 180, height: 30 });
      const wineLower = makeCandidate(["WINE"], { x: 120, y: 135, width: 140, height: 30 });
      expect(isNarrowStackedHeadingPair(domaineUpper, wineLower)).toBe(false);

      const bodegaUpper = makeCandidate(["BODEGA"], { x: 100, y: 100, width: 180, height: 30 });
      const reservaLower = makeCandidate(["RESERVA"], { x: 90, y: 135, width: 200, height: 30 });
      expect(isNarrowStackedHeadingPair(bodegaUpper, reservaLower)).toBe(false);
    });

    it("rejects numbers, postal codes, and addresses (Domaine 21420 Aloxe-Corton)", () => {
      const domaineUpper = makeCandidate(["DOMAINE"], { x: 100, y: 100, width: 180, height: 30 });
      const postalLower = makeCandidate(["21420"], { x: 120, y: 135, width: 140, height: 30 });
      expect(isNarrowStackedHeadingPair(domaineUpper, postalLower)).toBe(false);

      const multiWordUpper = makeCandidate(["DOMAINE", "FOLLIN-ARBELET"], {
        x: 100,
        y: 100,
        width: 300,
        height: 30,
      });
      const aloxeLower = makeCandidate(["ALOXE-CORTON"], {
        x: 100,
        y: 135,
        width: 250,
        height: 30,
      });
      expect(isNarrowStackedHeadingPair(multiWordUpper, aloxeLower)).toBe(false);
    });

    it("rejects varietals and appellations (Nebla Mencia, Bodega Rioja)", () => {
      const neblaUpper = makeCandidate(["NEBLA"], { x: 100, y: 100, width: 180, height: 30 });
      const menciaLower = makeCandidate(["MENCIA"], { x: 90, y: 135, width: 200, height: 30 });
      expect(isNarrowStackedHeadingPair(neblaUpper, menciaLower)).toBe(false);

      const bodegaUpper = makeCandidate(["BODEGA"], { x: 100, y: 100, width: 180, height: 30 });
      const riojaLower = makeCandidate(["RIOJA"], { x: 90, y: 135, width: 200, height: 30 });
      expect(isNarrowStackedHeadingPair(bodegaUpper, riojaLower)).toBe(false);
    });
  });

  describe("Authority Gate & Consensus Invariant Audit", () => {
    it("ensures same-pass merged candidate carries single-pass provenance and cannot elevate to OBSERVED with rivals", () => {
      const origW = 400;
      const origH = 600;

      // Synthetic OCR result with CHATEAU + BONNEAU and competing appellation line
      const ocrResult: RegionOcrResult = {
        passId: "pass-0-full-image",
        regionName: "full-image",
        passKind: "full-image-primary",
        triggerReasons: ["primary-pass"],
        preprocessing: [],
        fieldEligibility: { brand: true, alcohol: false },
        transform: {
          crop: { left: 0, top: 0, width: origW, height: origH },
          scale: 1,
          rotate: 0,
          originalWidth: origW,
          originalHeight: origH,
        },
        transformedSize: { width: origW, height: origH },
        pageSegMode: 3,
        rawWordCount: 4,
        discardedWordCount: 0,
        timings: { preprocessMs: 0, ocrMs: 0, inverseMappingMs: 0, totalMs: 0 },
        words: [
          {
            text: "CHATEAU",
            rawConfidence: 96,
            bbox: { x0: 120, y0: 70, x1: 280, y1: 95 },
            originalGeometry: {
              imageIndex: 0,
              x: 120,
              y: 70,
              width: 160,
              height: 25,
              imageWidth: origW,
              imageHeight: origH,
            },
          },
          {
            text: "BONNEAU",
            rawConfidence: 92,
            bbox: { x0: 50, y0: 100, x1: 350, y1: 146 },
            originalGeometry: {
              imageIndex: 0,
              x: 50,
              y: 100,
              width: 300,
              height: 46,
              imageWidth: origW,
              imageHeight: origH,
            },
          },
          // Competing prominent rival line on front label
          {
            text: "MONTAGNE",
            rawConfidence: 90,
            bbox: { x0: 80, y0: 300, x1: 220, y1: 335 },
            originalGeometry: {
              imageIndex: 0,
              x: 80,
              y: 300,
              width: 140,
              height: 35,
              imageWidth: origW,
              imageHeight: origH,
            },
          },
          {
            text: "SAINT-EMILION",
            rawConfidence: 91,
            bbox: { x0: 230, y0: 300, x1: 360, y1: 335 },
            originalGeometry: {
              imageIndex: 0,
              x: 230,
              y: 300,
              width: 130,
              height: 35,
              imageWidth: origW,
              imageHeight: origH,
            },
          },
        ],
      };

      const selection = selectBrandObservationWithCoherentLineMergeTreatment([ocrResult]);

      // Assert true brand is selected
      expect(selection.observation.value).toBe("CHATEAU BONNEAU");

      // INVARIANT 1: Single-pass provenance only
      expect(selection.supportingPassIds).toEqual(["pass-0-full-image"]);
      expect(selection.recoveryPassUsed).toBe(false);

      // INVARIANT 2: Authority gate holds AMBIGUOUS (cannot falsely elevate to OBSERVED)
      expect(selection.observation.state).toBe("AMBIGUOUS");

      // INVARIANT 3: Authentic token confidences are preserved (mean of 96 and 92 is 94%)
      expect(selection.observation.ocrEvidenceScore).toBeCloseTo(0.94, 2);
    });

    it("frozen baseline remains completely unchanged when treatment is not enabled", () => {
      const origW = 400;
      const origH = 600;

      const ocrResult: RegionOcrResult = {
        passId: "pass-0-full-image",
        regionName: "full-image",
        passKind: "full-image-primary",
        triggerReasons: ["primary-pass"],
        preprocessing: [],
        fieldEligibility: { brand: true, alcohol: false },
        transform: {
          crop: { left: 0, top: 0, width: origW, height: origH },
          scale: 1,
          rotate: 0,
          originalWidth: origW,
          originalHeight: origH,
        },
        transformedSize: { width: origW, height: origH },
        pageSegMode: 3,
        rawWordCount: 2,
        discardedWordCount: 0,
        timings: { preprocessMs: 0, ocrMs: 0, inverseMappingMs: 0, totalMs: 0 },
        words: [
          {
            text: "CHATEAU",
            rawConfidence: 96,
            bbox: { x0: 120, y0: 70, x1: 280, y1: 95 },
            originalGeometry: {
              imageIndex: 0,
              x: 120,
              y: 70,
              width: 160,
              height: 25,
              imageWidth: origW,
              imageHeight: origH,
            },
          },
          {
            text: "BONNEAU",
            rawConfidence: 92,
            bbox: { x0: 50, y0: 100, x1: 350, y1: 146 },
            originalGeometry: {
              imageIndex: 0,
              x: 50,
              y: 100,
              width: 300,
              height: 46,
              imageWidth: origW,
              imageHeight: origH,
            },
          },
        ],
      };

      const baseline = selectBrandObservation([ocrResult]);
      // Frozen baseline selects BONNEAU alone (does not merge without positive line)
      expect(baseline.observation.value).toBe("BONNEAU");
    });
  });
});
