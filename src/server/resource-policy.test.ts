import { describe, expect, it } from "vitest";

import {
  MAX_REGION_SCALE,
  REGION_COUNT,
  worstCaseIntermediatePixels,
} from "@/pipeline/extractor/regions";

import {
  MAX_DECODED_HEIGHT,
  MAX_DECODED_PIXELS,
  MAX_DECODED_WIDTH,
  MAX_INTERMEDIATE_PIXELS,
  MAX_OCR_REGIONS,
  MAX_SCALE_MULTIPLIER,
} from "./resource-policy";

describe("resource policy — preprocessing/OCR budgets", () => {
  it("keeps the committed region strategy within the OCR-pass ceiling", () => {
    expect(REGION_COUNT).toBeGreaterThan(0);
    expect(REGION_COUNT).toBeLessThanOrEqual(MAX_OCR_REGIONS);
  });

  it("keeps every region scale within the scale ceiling", () => {
    expect(MAX_REGION_SCALE).toBeLessThanOrEqual(MAX_SCALE_MULTIPLIER);
  });

  it("bounds the worst-case intermediate image below the intermediate pixel budget", () => {
    expect(worstCaseIntermediatePixels(MAX_DECODED_PIXELS)).toBeLessThanOrEqual(
      MAX_INTERMEDIATE_PIXELS,
    );
  });

  it("admits the committed M Cellars fixture dimensions", () => {
    expect(2404).toBeLessThanOrEqual(MAX_DECODED_WIDTH);
    expect(979).toBeLessThanOrEqual(MAX_DECODED_HEIGHT);
    expect(2404 * 979).toBeLessThanOrEqual(MAX_DECODED_PIXELS);
  });
});
