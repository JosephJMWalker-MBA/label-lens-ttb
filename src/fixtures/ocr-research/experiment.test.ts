import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import type { OcrEngine } from "@/pipeline/extractor/ocr-engine";

import {
  PRODUCTION_BOUNDED_BRAND_CONTROL,
  binarizeGrayscaleWithOtsu,
  binarizeRgbOrRgbaWithOtsu,
  encodeChannelPreservingOtsuPng,
  runOcrExperiment,
  selectOtsuThreshold,
  validateConfigurationIsolation,
  wilson95,
  type OcrExecutionInput,
  type OcrExecutionResult,
} from "./experiment";
import { parseResearchManifest } from "./fixture-corpus";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "label-lens-ocr-experiment-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function manifest(root: string) {
  const imagePath = path.join(root, "fixture.png");
  writeFileSync(imagePath, "fake deterministic image bytes");
  return parseResearchManifest({
    schemaVersion: "ocr-research-manifest.v1",
    description: "Test manifest",
    fixtures: [
      {
        schemaVersion: "ocr-research-fixture.v1",
        fixtureId: "test-brand-fixture",
        displayName: "Test Brand",
        mode: "committable",
        image: {
          path: imagePath,
          ownership: "fixture-original",
          sha256: "a".repeat(64),
          byteSize: 30,
          width: 100,
          height: 50,
          mimeType: "image/png",
        },
        provenance: {
          sourceDescription: "Generated test input",
          sourceReference: "test://input",
          acquisitionMethod: "test",
          acquiredBy: "test",
          acquiredAt: "2026-07-27",
        },
        redistribution: {
          status: "approved-for-repository",
          license: "test",
          notes: "Generated test input.",
        },
        regions: {
          brand: [
            {
              unit: "normalized-panel-relative",
              provenance: "human-approved-region",
              x: 0.1,
              y: 0.1,
              width: 0.8,
              height: 0.7,
              label: "Brand",
            },
          ],
        },
        truth: {
          brand: {
            acceptableValues: ["TEST BRAND"],
            evidenceSource: {
              kind: "human-approved-region",
              description: "Fixed test truth",
              reference: "test://truth",
              wholeLabelReviewed: false,
            },
          },
          warning: null,
          alcohol: null,
        },
      },
    ],
  });
}

function fakeEngine(): Promise<OcrEngine> {
  return Promise.resolve({
    recognizeWords: async () => [],
    terminate: async () => {},
  });
}

const seenExecutionInputs: OcrExecutionInput[] = [];

async function fakeExecutor(input: OcrExecutionInput): Promise<OcrExecutionResult> {
  seenExecutionInputs.push(input);
  const word = {
    text: "TEST",
    rawConfidence: 95,
    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
    originalGeometry: {
      imageIndex: 0,
      x: 10,
      y: 10,
      width: 10,
      height: 10,
      imageWidth: 100,
      imageHeight: 50,
    },
  };
  const brandWord = {
    ...word,
    text: "BRAND",
    bbox: { x0: 12, y0: 0, x1: 25, y1: 10 },
    originalGeometry: { ...word.originalGeometry, x: 22, width: 13 },
  };
  return {
    caseId: input.caseId,
    fixtureId: input.fixtureId,
    rawTranscript: "TEST BRAND",
    rawWords: [word, brandWord],
    rawWordCount: 2,
    meanConfidence: 95,
    crop: { left: 10, top: 5, width: 80, height: 35 },
    transformedSize: { width: 240, height: 105 },
    preprocessing: ["test"],
    selection: {
      state: "OBSERVED",
      value: "TEST BRAND",
      ocrEvidenceScore: 0.95,
      reliable: true,
      candidateTrace: [{ value: "TEST BRAND" }],
      warningAnchorTrace: null,
      warningResult: null,
    },
    latencyMs: { preprocess: 1, ocr: 2, selection: 1, total: 4 },
    memory: { rssBefore: 100, rssAfter: 110, rssDelta: 10 },
    artifacts: { cropPng: Buffer.from("crop"), preprocessedPng: Buffer.from("processed") },
  };
}

function noOpDefinition() {
  return {
    schemaVersion: "ocr-research-experiment.v1",
    experimentId: "deterministic-no-op",
    design: "one-variable-at-a-time",
    declaredVariable: "none",
    control: PRODUCTION_BOUNDED_BRAND_CONTROL,
    treatment: PRODUCTION_BOUNDED_BRAND_CONTROL,
  };
}

describe("OCR research experiment isolation and reporting", () => {
  it("selects the deterministic lower Otsu threshold for known synthetic histograms", () => {
    expect(selectOtsuThreshold(Uint8Array.from([0, 0, 255, 255]))).toBe(0);
    expect(selectOtsuThreshold(Uint8Array.from([0, 0, 10, 10, 200, 200, 255, 255]))).toBe(10);
    const grayscale = Uint8Array.from([0, 1, 1, 2, 128, 220, 254, 255]);
    expect(selectOtsuThreshold(grayscale)).toBe(selectOtsuThreshold(grayscale));
  });

  it("fails closed for empty or uniform input instead of using a fixed threshold", () => {
    expect(() => selectOtsuThreshold(new Uint8Array())).toThrow(
      /OTSU_REQUIRES_NON_EMPTY_GRAYSCALE/,
    );
    expect(() => selectOtsuThreshold(Uint8Array.from([73, 73, 73]))).toThrow(
      /OTSU_REQUIRES_AT_LEAST_TWO_GRAYSCALE_LEVELS/,
    );
  });

  it("binarizes with the Otsu split boundary into deterministic one-channel bytes", () => {
    const result = binarizeGrayscaleWithOtsu(Uint8Array.from([0, 0, 10, 10, 200, 200, 255, 255]));
    expect(result.threshold).toBe(10);
    expect([...result.data]).toEqual([0, 0, 0, 0, 255, 255, 255, 255]);
    expect(binarizeGrayscaleWithOtsu(Uint8Array.from([0, 0, 255, 255]))).toEqual({
      threshold: 0,
      data: Buffer.from([0, 0, 255, 255]),
    });
  });

  it("preserves RGB layout while changing only RGB values to binary output", () => {
    const source = Uint8Array.from([0, 0, 0, 64, 32, 16, 180, 200, 220, 255, 255, 255]);
    const result = binarizeRgbOrRgbaWithOtsu(source, 2, 2, 3);
    expect(result.data).toHaveLength(source.length);
    expect([...result.data].every((value) => value === 0 || value === 255)).toBe(true);
  });

  it("preserves RGBA alpha bytes exactly and changes only RGB values", () => {
    const source = Uint8Array.from([
      0, 0, 0, 0, 64, 32, 16, 17, 180, 200, 220, 128, 255, 255, 255, 255,
    ]);
    const result = binarizeRgbOrRgbaWithOtsu(source, 2, 2, 4);
    expect([result.data[3], result.data[7], result.data[11], result.data[15]]).toEqual([
      0, 17, 128, 255,
    ]);
    for (let index = 0; index < result.data.length; index += 1) {
      if (index % 4 === 3) {
        expect(result.data[index]).toBe(source[index]);
      } else {
        expect([0, 255]).toContain(result.data[index]);
      }
    }
  });

  it("round-trips a synthetic RGB PNG without adding alpha or changing layout metadata", async () => {
    const source = await sharp(Buffer.from([0, 0, 0, 32, 32, 32, 192, 192, 192, 255, 255, 255]), {
      raw: { width: 2, height: 2, channels: 3 },
    })
      .png()
      .withMetadata({ density: 144 })
      .toBuffer();
    const result = await encodeChannelPreservingOtsuPng(source);
    const sourceMetadata = await sharp(source).metadata();
    const outputMetadata = await sharp(result.png).metadata();
    expect(outputMetadata).toMatchObject({
      width: sourceMetadata.width,
      height: sourceMetadata.height,
      channels: 3,
      hasAlpha: false,
      depth: sourceMetadata.depth,
      space: sourceMetadata.space,
      density: sourceMetadata.density,
      bitsPerSample: sourceMetadata.bitsPerSample,
      hasProfile: sourceMetadata.hasProfile,
    });
    const output = await sharp(result.png).raw().toBuffer({ resolveWithObject: true });
    expect(output.info).toMatchObject({ width: 2, height: 2, channels: 3 });
    expect([...output.data].every((value) => value === 0 || value === 255)).toBe(true);
  });

  it("round-trips a synthetic RGBA PNG with byte-identical alpha and stable dimensions", async () => {
    const originalAlpha = [0, 17, 128, 255];
    const source = await sharp(
      Buffer.from([
        0,
        0,
        0,
        originalAlpha[0],
        32,
        32,
        32,
        originalAlpha[1],
        192,
        192,
        192,
        originalAlpha[2],
        255,
        255,
        255,
        originalAlpha[3],
      ]),
      { raw: { width: 2, height: 2, channels: 4 } },
    )
      .png()
      .withMetadata({ density: 300 })
      .toBuffer();
    const first = await encodeChannelPreservingOtsuPng(source);
    const second = await encodeChannelPreservingOtsuPng(source);
    expect(first.threshold).toBe(second.threshold);
    expect(first.png.equals(second.png)).toBe(true);
    const sourceDecoded = await sharp(source).raw().toBuffer({ resolveWithObject: true });
    const outputDecoded = await sharp(first.png).raw().toBuffer({ resolveWithObject: true });
    expect(outputDecoded.info).toMatchObject({ width: 2, height: 2, channels: 4 });
    for (let pixel = 0; pixel < 4; pixel += 1) {
      const offset = pixel * 4;
      expect(outputDecoded.data[offset + 3]).toBe(sourceDecoded.data[offset + 3]);
      expect([0, 255]).toContain(outputDecoded.data[offset]);
      expect(outputDecoded.data[offset + 1]).toBe(outputDecoded.data[offset]);
      expect(outputDecoded.data[offset + 2]).toBe(outputDecoded.data[offset]);
    }
  });

  it("keeps the Otsu arm free of Sharp thresholding and channel conversion", () => {
    const implementation = readFileSync(
      path.join(process.cwd(), "src/fixtures/ocr-research/experiment.ts"),
      "utf8",
    );
    const otsuBranch = implementation
      .split('if (configuration.thresholdMethod === "otsu") {')
      .at(-1)
      ?.split("\n  return {")[0];
    expect(otsuBranch).toBeDefined();
    expect(otsuBranch).not.toContain(".threshold(");
    expect(otsuBranch).not.toMatch(
      /\.(?:grayscale|removeAlpha|ensureAlpha|flatten|toColourspace)\(/,
    );
    expect(otsuBranch).toContain("encodeChannelPreservingOtsuPng(controlEquivalentPng)");
  });

  it("rejects multiple changed variables and accepts exactly the declared variable", () => {
    expect(() =>
      validateConfigurationIsolation({
        ...noOpDefinition(),
        declaredVariable: "scale",
        treatment: {
          ...PRODUCTION_BOUNDED_BRAND_CONTROL,
          scale: 4,
          psm: 7,
        },
      }),
    ).toThrow(/CONFIG_ISOLATION_VIOLATION/);
    expect(
      validateConfigurationIsolation({
        ...noOpDefinition(),
        declaredVariable: "scale",
        treatment: { ...PRODUCTION_BOUNDED_BRAND_CONTROL, scale: 4 },
      }).isolation.changedVariables,
    ).toEqual(["scale"]);
  });

  it("keeps expected truth out of the OCR execution input", async () => {
    seenExecutionInputs.length = 0;
    const root = temporaryDirectory();
    await runOcrExperiment({
      definition: noOpDefinition(),
      manifest: manifest(root),
      outputRoot: path.join(root, "out"),
      executor: fakeExecutor,
      engineFactory: fakeEngine,
    });
    expect(seenExecutionInputs).toHaveLength(2);
    const serialized = JSON.stringify(seenExecutionInputs);
    expect(serialized).not.toContain("TEST BRAND");
    expect(serialized).not.toMatch(/truth|expectedValues|acceptableValues/);
  });

  it("produces deterministic behavior hashes and a zero-delta no-op report", async () => {
    const root = temporaryDirectory();
    const first = await runOcrExperiment({
      definition: noOpDefinition(),
      manifest: manifest(root),
      outputRoot: path.join(root, "first"),
      executor: fakeExecutor,
      engineFactory: fakeEngine,
    });
    const second = await runOcrExperiment({
      definition: noOpDefinition(),
      manifest: manifest(root),
      outputRoot: path.join(root, "second"),
      executor: fakeExecutor,
      engineFactory: fakeEngine,
    });
    expect(first.control.behaviorHash).toBe(second.control.behaviorHash);
    expect(first.treatment.behaviorHash).toBe(first.control.behaviorHash);
    expect(first.diff).toMatchObject({
      behavioralDeltaCount: 0,
      correctDelta: 0,
      falseCertaintyDelta: 0,
      decision: "NO_OP_CONFIRMED",
    });
    expect(readFileSync(path.join(root, "first/diff/report.json"), "utf8")).toBe(
      readFileSync(path.join(root, "second/diff/report.json"), "utf8"),
    );
  });

  it("reconciles report totals and computes the same Wilson interval every time", async () => {
    const root = temporaryDirectory();
    mkdirSync(root, { recursive: true });
    const result = await runOcrExperiment({
      definition: noOpDefinition(),
      manifest: manifest(root),
      outputRoot: path.join(root, "out"),
      executor: fakeExecutor,
      engineFactory: fakeEngine,
    });
    const metrics = result.control.metrics;
    expect(metrics.correctCount + metrics.failureCount).toBe(metrics.caseCount);
    expect(metrics.falseCertaintyCount).toBeLessThanOrEqual(metrics.caseCount);
    expect(metrics.sliceMetrics["field:brandName"].caseCount).toBe(metrics.caseCount);
    expect(metrics.sliceMetrics["image-orientation:landscape"]).toMatchObject({
      caseCount: 1,
      correctCount: 1,
      falseCertaintyCount: 0,
    });
    expect(wilson95(5, 10)).toEqual(wilson95(5, 10));
    expect(wilson95(5, 10).lower).toBeCloseTo(0.2366, 4);
    expect(wilson95(5, 10).upper).toBeCloseTo(0.7634, 4);
  });

  it("does not add a production import edge to the evaluation-only runner", () => {
    const productionFiles = [
      "src/pipeline/extractor/extractor.ts",
      "src/pipeline/extractor/regions.ts",
      "src/pipeline/extractor/field-selection.ts",
      "src/pipeline/extractor/government-warning.ts",
      "src/app/api/package/analyze/route.ts",
    ];
    for (const filePath of productionFiles) {
      expect(readFileSync(path.join(process.cwd(), filePath), "utf8")).not.toContain(
        "fixtures/ocr-research",
      );
    }
  });
});
