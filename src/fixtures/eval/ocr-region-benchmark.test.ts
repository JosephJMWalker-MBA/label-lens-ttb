// @vitest-environment node
import { describe, expect, it } from "vitest";

import type {
  ExtractionInput,
  OcrPassKind,
  OcrWord,
  RegionOcrResult,
} from "@/pipeline/extractor/extractor.types";
import { ok } from "@/shared/result";

import { buildCaseReport } from "./eval-harness";
import { loadEvalManifest } from "./eval-loader";
import {
  buildSyntheticDetailedResult,
  loadBenchmarkCases,
  normalizedToPixels,
  rawOcrSummary,
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

describe("ocr region benchmark phrase metrics", () => {
  const manifest = loadEvalManifest();
  const evalCase = manifest.cases.find((candidate) => candidate.caseId === "luigi-giovanni-live");

  it("treats partial fragments as similarity/token recovery rather than phrase recovery", () => {
    expect(evalCase).toBeDefined();
    const summary = rawOcrSummary("brand", evalCase!, [
      makeWord("Luigi", 0, 0),
      makeWord("Giovani", 40, 0),
    ]);

    expect(summary).not.toBeNull();
    expect(summary!.expectedPhrasePresent).toBe(false);
    expect(summary!.expectedTokenPresenceCount).toBeGreaterThan(0);
    expect(summary!.normalizedPhraseSimilarity).toBeGreaterThan(0);
  });
});

describe("ocr region benchmark synthetic hybrid safeguards", () => {
  const manifest = loadEvalManifest();
  const evalCase = manifest.cases.find(
    (candidate) =>
      candidate.brand.present && candidate.alcohol.present && !candidate.brand.knownAmbiguous,
  );

  function extraction(evalCaseId: string): ExtractionInput {
    return {
      imageBytes: new Uint8Array(),
      artifactRef: evalCaseId,
      derivativeSha256: "test-sha",
      processedAt: "2026-07-13T00:00:00Z",
      extractionAdapterId: "test-adapter",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
    };
  }

  it("appends targeted evidence without mutating the production pass array", () => {
    expect(evalCase).toBeDefined();
    const baselinePass = makePass({
      passId: "baseline",
      passKind: "full-image-primary",
      triggerReasons: ["primary-pass"],
      fieldEligibility: { brand: true, alcohol: true },
      words: [makeWord(evalCase!.brand.acceptable[0], 0, 0)],
    });
    const targetedPass = makePass({
      passId: "targeted",
      passKind: "focus-crop",
      triggerReasons: ["focus-crop-distinct"],
      fieldEligibility: { brand: true, alcohol: false },
      words: [makeWord(evalCase!.brand.acceptable[0], 0, 20)],
    });

    const baselinePasses = [baselinePass];
    const detailed = buildSyntheticDetailedResult({
      extraction: extraction(evalCase!.caseId),
      decoded: { width: 1000, height: 1000, format: "jpeg" },
      passes: [...baselinePasses, targetedPass],
    });

    expect(baselinePasses).toHaveLength(1);
    expect(detailed.debug.passes).toHaveLength(2);
    expect(detailed.debug.passes[0].passId).toBe("baseline");
    expect(detailed.debug.passes[1].passId).toBe("targeted");
  });

  it("honors field eligibility when additive targeted evidence is appended", () => {
    expect(evalCase).toBeDefined();
    const brandOnlyBaseline = buildCaseReport(
      evalCase!,
      ok(
        buildSyntheticDetailedResult({
          extraction: extraction(evalCase!.caseId),
          decoded: { width: 1000, height: 1000, format: "jpeg" },
          passes: [
            makePass({
              passId: "baseline-brand",
              passKind: "full-image-primary",
              triggerReasons: ["primary-pass"],
              fieldEligibility: { brand: true, alcohol: true },
              words: [makeWord(evalCase!.brand.acceptable[0], 0, 0)],
            }),
            makePass({
              passId: "targeted-brand",
              passKind: "focus-crop",
              triggerReasons: ["focus-crop-distinct"],
              fieldEligibility: { brand: true, alcohol: false },
              words: [makeWord("99% BY VOL", 0, 20)],
            }),
          ],
        }),
      ),
      10,
    );

    expect(brandOnlyBaseline.alcohol.state).toBe("NOT_OBSERVED");

    const alcoholOnlyBaseline = buildCaseReport(
      evalCase!,
      ok(
        buildSyntheticDetailedResult({
          extraction: extraction(evalCase!.caseId),
          decoded: { width: 1000, height: 1000, format: "jpeg" },
          passes: [
            makePass({
              passId: "baseline-alcohol",
              passKind: "full-image-primary",
              triggerReasons: ["primary-pass"],
              fieldEligibility: { brand: true, alcohol: true },
              words: [makeWord(`${evalCase!.alcohol.acceptablePercents[0]}% BY VOL`, 0, 0)],
            }),
            makePass({
              passId: "targeted-alcohol",
              passKind: "focus-crop",
              triggerReasons: ["focus-crop-distinct"],
              fieldEligibility: { brand: false, alcohol: true },
              words: [makeWord(evalCase!.brand.acceptable[0], 0, 20)],
            }),
          ],
        }),
      ),
      10,
    );

    expect(alcoholOnlyBaseline.brand.state).toBe("NOT_OBSERVED");
  });
});

function makeWord(text: string, x0: number, y0: number): OcrWord {
  return {
    text,
    rawConfidence: 95,
    bbox: { x0, y0, x1: x0 + 10, y1: y0 + 10 },
    originalGeometry: {
      imageIndex: 0,
      x: x0,
      y: y0,
      width: 10,
      height: 10,
      imageWidth: 1000,
      imageHeight: 1000,
    },
  };
}

function makePass(input: {
  passId: string;
  passKind: OcrPassKind;
  triggerReasons: RegionOcrResult["triggerReasons"];
  fieldEligibility: RegionOcrResult["fieldEligibility"];
  words: OcrWord[];
}): RegionOcrResult {
  return {
    passId: input.passId,
    regionName: input.passId,
    passKind: input.passKind,
    triggerReasons: input.triggerReasons,
    preprocessing: ["grayscale"],
    fieldEligibility: input.fieldEligibility,
    transform: {
      crop: { left: 0, top: 0, width: 1000, height: 1000 },
      rotate: 0,
      scale: 1,
      originalWidth: 1000,
      originalHeight: 1000,
    },
    transformedSize: { width: 1000, height: 1000 },
    pageSegMode: 11,
    rawWordCount: input.words.length,
    discardedWordCount: 0,
    timings: { preprocessMs: 1, ocrMs: 1, inverseMappingMs: 1, totalMs: 3 },
    words: input.words,
  };
}
