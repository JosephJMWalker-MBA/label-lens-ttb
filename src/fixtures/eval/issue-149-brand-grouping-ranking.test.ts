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
  selectAlcoholObservation,
  selectBrandObservation,
  selectBrandObservationLegacyGroupingControl,
  selectBrandObservationWithCoherentLineMergeTreatment,
} from "@/pipeline/extractor/field-selection";
import { selectGovernmentWarningObservation } from "@/pipeline/extractor/government-warning";
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

function result(
  words: OcrWord[],
  fieldEligibility: RegionOcrResult["fieldEligibility"] = { brand: true, alcohol: false },
): RegionOcrResult {
  return {
    passId: "seller-region-1",
    regionName: "seller-region",
    passKind: "seller-region",
    triggerReasons: ["seller-region-target"],
    preprocessing: ["crop:seller-region", "grayscale", "normalise", "scale:3"],
    fieldEligibility,
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
  it("uses identical OCR input and output between legacy control and production", () => {
    const boundedOcr = result([word("NORTH", 91, 110, 140, 150), word("STAR", 90, 118, 204, 120)]);
    const before = JSON.stringify(boundedOcr);

    selectBrandObservation([boundedOcr]);
    selectBrandObservationLegacyGroupingControl([boundedOcr]);

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

  it("does not pass seller-entered text into production Brand selection", () => {
    const selectorSource = readFileSync(
      join(process.cwd(), "src/pipeline/extractor/field-selection.ts"),
      "utf8",
    );
    const productionFunction = selectorSource.slice(
      selectorSource.indexOf("export function selectBrandObservation("),
      selectorSource.indexOf(
        "export function selectBrandObservationWithCoherentLineMergeTreatment",
      ),
    );
    const evalSource = readFileSync(
      join(process.cwd(), "src/fixtures/eval/issue-149-brand-grouping-ranking.ts"),
      "utf8",
    );

    expect(productionFunction).not.toMatch(/expectedSellerValue|expectedBrand|seller/i);
    expect(evalSource).toMatch(/expectedSellerValue/);
  });

  it("enables coherent multi-line likely-candidate ranking without producing OBSERVED", () => {
    const boundedOcr = result([word("NORTH", 91, 110, 140, 150), word("STAR", 90, 118, 204, 120)]);

    const control = selectBrandObservationLegacyGroupingControl([boundedOcr]).observation;
    const production = selectBrandObservation([boundedOcr]).observation;
    const treatment = selectBrandObservationWithCoherentLineMergeTreatment([
      boundedOcr,
    ]).observation;

    expect(control.value).toBe("NORTH");
    expect(production.value).toBe("NORTH STAR");
    expect(production.state).toBe("AMBIGUOUS");
    expect(treatment).toMatchObject(production);
  });

  it("forms the Garden City Beach adjacent-line candidate in production", () => {
    const boundedOcr = result([
      word("GARDEN", 91, 110, 140, 170),
      word("CITY", 90, 118, 204, 110),
      word("BEACH", 92, 250, 204, 150),
    ]);

    const production = selectBrandObservation([boundedOcr]).observation;

    expect(production.value).toBe("GARDEN CITY BEACH");
    expect(production.state).toBe("AMBIGUOUS");
  });

  it("forms the North Star adjacent-line candidate in production", () => {
    const boundedOcr = result([word("NORTH", 91, 110, 140, 150), word("STAR", 90, 118, 204, 120)]);

    const production = selectBrandObservation([boundedOcr]).observation;

    expect(production.value).toBe("NORTH STAR");
    expect(production.state).toBe("AMBIGUOUS");
  });

  it.each([
    ["M CELLARS", [word("M", 74, 110, 140, 44), word("CELLARS", 96, 176, 140, 180)], "CELLARS"],
    [
      "NORTH STAR WINERY",
      [
        word("NORTH", 92, 110, 140, 150),
        word("STAR", 93, 280, 140, 120),
        word("WINERY", 96, 420, 140, 170),
        word("•", 40, 606, 140, 24),
        word("™", 40, 652, 140, 24),
      ],
      "WINERY",
    ],
    [
      "BLUE RIDGE ESTATE",
      [
        word("BLUE", 92, 110, 140, 120),
        word("RIDGE", 93, 252, 140, 150),
        word("ESTATE", 96, 424, 140, 170),
        word("•", 40, 612, 140, 24),
        word("™", 40, 658, 140, 24),
      ],
      "ESTATE",
    ],
  ])("prefers the fuller Brand over designator-only %s", (expected, words, designator) => {
    const selection = selectBrandObservation([result(words)]);
    const designatorOnlyCandidate = selection.brandDiagnostics?.candidates.find(
      (candidate) =>
        candidate.kept &&
        candidate.cleanedValue === designator &&
        candidate.assembly === "line-window",
    );

    expect(selection.observation.value).toBe(expected);
    expect(designatorOnlyCandidate?.cleanedValue).toBe(designator);
    expect(designatorOnlyCandidate?.decision).not.toBe("selected");
  });

  it("leaves a designator-only Brand candidate eligible when no fuller candidate exists", () => {
    const selection = selectBrandObservation([
      result([word("WINERY", 95, 110, 140, 170)]),
    ]).observation;

    expect(selection.value).toBe("WINERY");
    expect(selection.state).toBe("OBSERVED");
  });

  it("does not merge distant adjacent plausible lines", () => {
    const boundedOcr = result([word("NORTH", 91, 110, 120, 150), word("STAR", 90, 118, 340, 120)]);

    const production = selectBrandObservation([boundedOcr]).observation;

    expect(production.value).not.toBe("NORTH STAR");
  });

  it("does not merge unrelated prose into a Brand candidate", () => {
    const boundedOcr = result([
      word("NORTH", 91, 110, 140, 150),
      word("crafted", 88, 118, 204, 140),
      word("daily", 88, 280, 204, 100),
    ]);

    const production = selectBrandObservation([boundedOcr]).observation;

    expect(production.value).toBe("NORTH");
    expect(production.value).not.toMatch(/crafted|daily/i);
  });

  it("keeps existing single-line Brand selection unchanged", () => {
    const boundedOcr = result([
      word("GARDEN", 91, 110, 140, 170),
      word("CITY", 90, 300, 140, 110),
      word("BEACH", 92, 430, 140, 150),
    ]);

    const legacy = selectBrandObservationLegacyGroupingControl([boundedOcr]).observation;
    const production = selectBrandObservation([boundedOcr]).observation;

    expect(production).toMatchObject(legacy);
    expect(production.value).toBe("GARDEN CITY BEACH");
    expect(production.state).toBe("AMBIGUOUS");
  });

  it("does not promote product designation text over a coherent Brand line", () => {
    const boundedOcr = result([
      word("RIDGE", 93, 110, 140, 150),
      word("CELLARS", 94, 278, 140, 180),
      word("CABERNET", 95, 116, 210, 200),
      word("SAUVIGNON", 95, 338, 210, 220),
    ]);

    const treatment = selectBrandObservation([boundedOcr]).observation;

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

    const treatment = selectBrandObservation([boundedOcr]).observation;

    expect(treatment.value).toBe("HARBOR CELLARS");
    expect(treatment.value).not.toMatch(/NAPA|VALLEY/);
  });

  it("leaves Alcohol selection unchanged", () => {
    const alcohol = selectAlcoholObservation([
      result([word("12.5%", 94, 110, 140, 120), word("ALC./VOL.", 93, 250, 140, 180)], {
        brand: false,
        alcohol: true,
      }),
    ]).observation;

    expect(alcohol.state).toBe("OBSERVED");
    expect(alcohol.value).toBe("12.5% ALC./VOL.");
  });

  it("leaves Government Warning selection on the dedicated selector", () => {
    const warning = selectGovernmentWarningObservation("back", [
      {
        ...result([
          word("GOVERNMENT", 94, 110, 140, 190),
          word("WARNING:", 94, 322, 140, 180),
          word("ACCORDING", 94, 524, 140, 190),
          word("TO", 94, 110, 204, 60),
          word("THE", 94, 190, 204, 80),
          word("SURGEON", 94, 290, 204, 150),
          word("GENERAL", 94, 462, 204, 150),
        ]),
        passKind: "full-image-primary",
        regionName: "full-image",
        triggerReasons: ["primary-pass"],
        fieldEligibility: { brand: false, alcohol: true },
      },
    ]);

    expect(warning.evidenceState).toBe("partial");
    expect(warning.rawTranscript).toMatch(/^GOVERNMENT WARNING/);
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
