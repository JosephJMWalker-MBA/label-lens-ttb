import { describe, expect, it } from "vitest";

import type { OcrWord, RegionOcrResult, RegionTransform } from "./extractor.types";
import { planRecoveryOcrPasses, planSellerRegionOcrPass, sellerRegionCrop } from "./regions";

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

describe("planRecoveryOcrPasses", () => {
  it("does not schedule focus-region recovery when only brand is unresolved", () => {
    const primary = region([
      word("SAKER", 120, 120),
      word("CELLARS", 180, 120),
      word("RESERVE", 260, 120),
      word("ALPHA", 620, 520),
      word("BLOCK", 690, 520),
      word("ESTATE", 760, 520),
      word("MERLOT", 820, 620),
    ]);

    const planned = planRecoveryOcrPasses({
      primary,
      needsBrandRecovery: true,
      needsAlcoholRecovery: false,
    });

    expect(planned).toEqual([]);
  });

  it("keeps focus recovery alcohol-only when alcohol remains unresolved", () => {
    const clusterWords: OcrWord[] = [];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 6; col++) {
        clusterWords.push(word(`W${row}${col}`, 90 + col * 85, 110 + row * 30));
      }
    }
    const primary = region([...clusterWords, word("PANEL", 620, 640), word("DETAIL", 700, 640)]);

    const planned = planRecoveryOcrPasses({
      primary,
      needsBrandRecovery: false,
      needsAlcoholRecovery: true,
    });
    const focus = planned.find((pass) => pass.passKind === "focus-crop");

    expect(focus).toBeDefined();
    expect(focus?.fieldEligibility).toEqual({ brand: false, alcohol: true });
  });

  it("preserves the bounded 180-degree fallback for low-text unresolved cases", () => {
    const primary = region([word("M", 200, 120), word("CELLARS", 260, 120), word("13%", 840, 720)]);

    const planned = planRecoveryOcrPasses({
      primary,
      needsBrandRecovery: true,
      needsAlcoholRecovery: false,
    });

    expect(planned.map((pass) => pass.passKind)).toEqual(["full-image-rot180"]);
  });

  it("never expands an edge strip beyond the source crop height on small images", () => {
    const primary: RegionOcrResult = {
      ...region([word("13%", 12, 12), word("ALC", 18, 36)]),
      transform: {
        ...TRANSFORM,
        crop: { left: 0, top: 0, width: 64, height: 64 },
        originalWidth: 64,
        originalHeight: 64,
      },
    };

    const planned = planRecoveryOcrPasses({
      primary,
      needsBrandRecovery: false,
      needsAlcoholRecovery: true,
    });

    for (const pass of planned.filter((entry) => entry.passKind.includes("edge-strip"))) {
      expect(pass.transform.crop.height).toBe(64);
    }
  });
});

describe("seller-region OCR planning", () => {
  const target = {
    categoryId: "brandName" as const,
    regionId: "brand-a",
    panelId: "front",
    region: {
      unit: "normalized-panel-relative" as const,
      provenance: "seller-selected-region" as const,
      x: 0.1,
      y: 0.2,
      width: 0.25,
      height: 0.1,
    },
  };

  it("maps normalized seller geometry to a deterministic padded original-pixel crop", () => {
    expect(sellerRegionCrop(target, 1000, 800)).toEqual({
      left: 92,
      top: 156,
      width: 266,
      height: 88,
    });
  });

  it("plans a category-specific bounded OCR pass without changing full-panel eligibility", () => {
    const pass = planSellerRegionOcrPass(
      { ...target, categoryId: "alcoholStatement" },
      1000,
      800,
      7,
    );

    expect(pass).toMatchObject({
      passId: "pass-7-seller-region-alcoholStatement-brand-a",
      passKind: "seller-region",
      triggerReasons: ["seller-region-target"],
      fieldEligibility: { brand: false, alcohol: true },
      transform: { crop: { left: 92, top: 156, width: 266, height: 88 } },
    });
  });

  it("rejects invalid seller regions before OCR", () => {
    expect(
      sellerRegionCrop({ ...target, region: { ...target.region, x: 0.95, width: 0.1 } }, 1000, 800),
    ).toBeNull();
  });
});
