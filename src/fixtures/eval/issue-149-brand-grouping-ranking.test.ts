// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  cropPlanForCase,
  normalizedRegion,
  type PixelBox,
} from "@/fixtures/eval/issue-149-bounded-baseline";
import {
  selectBrandObservation,
  selectBrandObservationWithCoherentLineMergeTreatment,
} from "@/pipeline/extractor/field-selection";
import type { OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import { PAGE_SEG } from "@/pipeline/extractor/ocr-engine";
import { planSellerRegionOcrPass } from "@/pipeline/extractor/regions";

import {
  BRAND_GROUPING_CASES,
  stableBrandCaseProjection,
} from "./issue-149-brand-grouping-ranking";

const image = { width: 900, height: 620 };

function word(text: string, rawConfidence: number, x: number, y: number, width = 80): OcrWord {
  return {
    text,
    rawConfidence,
    bbox: { x0: x, y0: y, x1: x + width, y1: y + 42 },
    originalGeometry: {
      imageIndex: 0,
      x,
      y,
      width,
      height: 42,
      imageWidth: image.width,
      imageHeight: image.height,
    },
  };
}

function result(words: OcrWord[]): RegionOcrResult {
  return {
    passId: "seller-region-1",
    regionName: "seller-region",
    passKind: "seller-region",
    triggerReasons: ["seller-region-target"],
    preprocessing: ["crop:seller-region", "grayscale", "normalise", "scale:3"],
    fieldEligibility: { brand: true, alcohol: false },
    transform: {
      crop: { left: 90, top: 100, width: 500, height: 240 },
      rotate: 0,
      scale: 3,
      originalWidth: image.width,
      originalHeight: image.height,
    },
    transformedSize: { width: 1500, height: 720 },
    pageSegMode: PAGE_SEG.SPARSE_TEXT,
    rawWordCount: words.length,
    discardedWordCount: 0,
    timings: { preprocessMs: 1, ocrMs: 2, inverseMappingMs: 1, totalMs: 4 },
    words,
  };
}

describe("Issue #149 Brand grouping/ranking treatment", () => {
  it("uses identical OCR input and output between control and treatment", () => {
    const boundedOcr = result([word("NORTH", 91, 110, 140, 150), word("STAR", 90, 118, 204, 120)]);
    const before = JSON.stringify(boundedOcr);

    selectBrandObservation([boundedOcr]);
    selectBrandObservationWithCoherentLineMergeTreatment([boundedOcr]);

    expect(JSON.stringify(boundedOcr)).toBe(before);
  });

  it("keeps crop geometry, preprocessing, and PSM unchanged for Brand cases", () => {
    for (const definition of BRAND_GROUPING_CASES) {
      const source =
        definition.source.kind === "synthetic"
          ? { width: definition.source.width, height: definition.source.height }
          : { width: 976, height: 1126 };
      const crop = cropPlanForCase(definition, source);
      const pass = planSellerRegionOcrPass(
        {
          categoryId: "brandName",
          regionId: `${definition.caseId}-brandName`,
          panelId: definition.panelId,
          region: normalizedRegion(
            definition.selectedPixelRegion as PixelBox,
            source.width,
            source.height,
          ),
        },
        source.width,
        source.height,
        1,
      );

      expect(pass?.transform.crop).toEqual(crop?.crop);
      expect(pass?.pageSegMode).toBe(PAGE_SEG.SPARSE_TEXT);
      expect(pass?.preprocessing).toEqual([
        "crop:seller-region",
        "grayscale",
        "normalise",
        "scale:3",
      ]);
    }
  });

  it("does not pass seller-entered text into OCR or Brand ranking", () => {
    const source = readFileSync(
      join(process.cwd(), "src/fixtures/eval/issue-149-brand-grouping-ranking.ts"),
      "utf8",
    );
    const treatmentFunction = source.slice(
      source.indexOf("function runSelector"),
      source.indexOf("async function runCaseArm"),
    );

    expect(treatmentFunction).not.toMatch(/expectedSellerValue|expectedBrand|seller/i);
    expect(treatmentFunction).toMatch(/selectBrandObservationWithCoherentLineMergeTreatment/);
  });

  it("improves coherent multi-line likely-candidate ranking without producing OBSERVED", () => {
    const boundedOcr = result([word("NORTH", 91, 110, 140, 150), word("STAR", 90, 118, 204, 120)]);

    const control = selectBrandObservation([boundedOcr]).observation;
    const treatment = selectBrandObservationWithCoherentLineMergeTreatment([
      boundedOcr,
    ]).observation;

    expect(control.value).toBe("NORTH");
    expect(treatment.value).toBe("NORTH STAR");
    expect(treatment.state).toBe("AMBIGUOUS");
  });

  it("does not promote product designation text over a coherent Brand line", () => {
    const boundedOcr = result([
      word("RIDGE", 93, 110, 140, 150),
      word("CELLARS", 94, 278, 140, 180),
      word("CABERNET", 95, 116, 210, 200),
      word("SAUVIGNON", 95, 338, 210, 220),
    ]);

    const treatment = selectBrandObservationWithCoherentLineMergeTreatment([
      boundedOcr,
    ]).observation;

    expect(treatment.value).toBe("RIDGE CELLARS");
    expect(treatment.value).not.toMatch(/CABERNET|SAUVIGNON/);
  });

  it("does not promote location text over a coherent Brand line", () => {
    const boundedOcr = result([
      word("HARBOR", 93, 110, 140, 180),
      word("CELLARS", 94, 310, 140, 190),
      word("NAPA", 95, 116, 210, 120),
      word("VALLEY", 95, 258, 210, 150),
    ]);

    const treatment = selectBrandObservationWithCoherentLineMergeTreatment([
      boundedOcr,
    ]).observation;

    expect(treatment.value).toBe("HARBOR CELLARS");
    expect(treatment.value).not.toMatch(/NAPA|VALLEY/);
  });

  it("keeps multi-word Brand lines intact when appropriate", () => {
    const boundedOcr = result([
      word("GARDEN", 91, 110, 140, 170),
      word("CITY", 90, 300, 140, 110),
      word("BEACH", 92, 430, 140, 150),
    ]);

    const treatment = selectBrandObservationWithCoherentLineMergeTreatment([
      boundedOcr,
    ]).observation;

    expect(treatment.value).toBe("GARDEN CITY BEACH");
    expect(treatment.state).toBe("AMBIGUOUS");
  });

  it("keeps artifact projections deterministic apart from latency", () => {
    const sample = {
      caseId: "brand-north-star-multiline-synthetic",
      selectedLikelyBrand: "NORTH STAR",
      latencyMs: { boundedOcr: 12, selection: 0.25 },
    };

    expect(stableBrandCaseProjection(sample)).toEqual({
      caseId: "brand-north-star-multiline-synthetic",
      selectedLikelyBrand: "NORTH STAR",
    });
  });
});
