// @vitest-environment node
import { describe, expect, it } from "vitest";

import { loadEvalManifest } from "./eval-loader";
import {
  loadBenchmarkCases,
  normalizedToPixels,
  rotationForOrientation,
  validateBenchmarkAnnotations,
} from "./ocr-region-benchmark";

describe("ocr region benchmark annotations", () => {
  const manifest = loadEvalManifest();
  const cases = loadBenchmarkCases(manifest);

  it("reference only included evaluation cases and valid normalized boxes", () => {
    expect(cases.length).toBeGreaterThan(0);
    expect(() => validateBenchmarkAnnotations(cases)).not.toThrow();
  });

  it("cover the bounded challenge slices required by the experiment brief", () => {
    const slices = new Set(
      cases.flatMap((benchmarkCase) => benchmarkCase.annotation.challengeSlices),
    );
    for (const required of [
      "correct-control",
      "candidate-filtering",
      "candidate-ranking",
      "ocr-recognition",
      "bottom-alcohol",
      "side-or-edge-alcohol",
      "rotated-text",
      "vertical-mandatory-strip",
      "low-contrast",
      "multi-artifact",
      "absent-brand",
      "absent-alcohol",
      "genuinely-ambiguous",
      "low-resolution",
    ]) {
      expect(slices.has(required), `missing benchmark slice ${required}`).toBe(true);
    }
  });

  it("omit human target geometry only when the evaluation truth says the field is absent", () => {
    for (const benchmarkCase of cases) {
      const brandAnnotation = benchmarkCase.annotation.fields.brand;
      const alcoholAnnotation = benchmarkCase.annotation.fields.alcohol;
      if (!benchmarkCase.evalCase.brand.present) expect(brandAnnotation).toBeUndefined();
      if (!benchmarkCase.evalCase.alcohol.present) expect(alcoholAnnotation).toBeUndefined();
    }
  });
});

describe("ocr region benchmark geometry helpers", () => {
  it("maps normalized boxes into bounded pixel crops", () => {
    expect(normalizedToPixels({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, 1000, 500)).toEqual({
      left: 100,
      top: 100,
      width: 300,
      height: 201,
    });
  });

  it("chooses only deterministic canonical rotations", () => {
    expect(rotationForOrientation("horizontal")).toBeNull();
    expect(rotationForOrientation("vertical-clockwise")).toBe(270);
    expect(rotationForOrientation("vertical-counterclockwise")).toBe(90);
    expect(rotationForOrientation("rotated-180")).toBe(180);
    expect(rotationForOrientation("mixed")).toBeNull();
  });
});
