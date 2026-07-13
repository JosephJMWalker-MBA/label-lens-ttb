// @vitest-environment node
import { createHash } from "node:crypto";

import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { OcrWord } from "./extractor.types";

// Control the OCR engine so the worker boundary can be instrumented. Sharp
// decode/preprocess still runs for real on the tiny synthetic image.
const createLocalOcrEngine = vi.fn();
vi.mock("./ocr-engine", () => ({
  createLocalOcrEngine: () => createLocalOcrEngine(),
  PAGE_SEG: { SPARSE_TEXT: 11, SINGLE_LINE: 7 },
}));

const { extractLabelEvidence } = await import("./extractor");

let bytes: Uint8Array;
let sha: string;

beforeAll(async () => {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();
  bytes = new Uint8Array(png);
  sha = createHash("sha256").update(bytes).digest("hex");
});

afterEach(() => {
  createLocalOcrEngine.mockReset();
});

function input() {
  return {
    imageBytes: bytes,
    artifactRef: "a",
    derivativeSha256: sha,
    processedAt: "2026-07-11T00:00:00Z",
    extractionAdapterId: "local-two-field-extractor",
    extractionAdapterVersion: "1.0.0",
    ocrEngine: { kind: "ocr" as const, engineId: "tesseract.js", engineVersion: "7.0.0" },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  };
}

function recognizedWord(text: string, x0: number, y0: number, x1: number, y1: number): OcrWord {
  return { text, rawConfidence: 90, bbox: { x0, y0, x1, y1 } };
}

/** A fake worker whose termination is counted. */
function fakeWorker(recognize: (png: Buffer, mode: number) => Promise<OcrWord[]>) {
  const terminate = vi.fn().mockResolvedValue(undefined);
  return {
    worker: { recognizeWords: recognize, terminate },
    terminate,
  };
}

describe("extractor worker lifecycle", () => {
  it("terminates the worker exactly once on success", async () => {
    const { worker, terminate } = fakeWorker(async () => [
      recognizedWord("ACME", 4, 4, 28, 20),
      recognizedWord("ESTATE", 32, 4, 60, 20),
    ]);
    createLocalOcrEngine.mockResolvedValue(worker);

    const out = await extractLabelEvidence(input());
    expect(out.ok).toBe(true);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("terminates the worker exactly once when recognition throws", async () => {
    const { worker, terminate } = fakeWorker(async () => {
      throw new Error("recognize boom");
    });
    createLocalOcrEngine.mockResolvedValue(worker);

    const out = await extractLabelEvidence(input());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("OCR_FAILED");
    // No stack trace / path leaks into the typed error message.
    if (!out.ok) expect(out.error.message).not.toMatch(/\/Users\/|at Object|\.ts:\d+/);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("terminates the worker exactly once when a later validation step rejects the response", async () => {
    // An over-long token makes the constructed observation exceed the bounded
    // schema, so response validation fails AFTER the worker was created.
    const huge = "A".repeat(5000);
    const { worker, terminate } = fakeWorker(async () => [
      recognizedWord(huge, 4, 4, 28, 20),
      recognizedWord("ESTATE", 32, 4, 60, 20),
    ]);
    createLocalOcrEngine.mockResolvedValue(worker);

    const out = await extractLabelEvidence(input());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_RESPONSE");
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("creates and terminates one worker per call with no monotonic growth", async () => {
    const terminates: number[] = [];
    createLocalOcrEngine.mockImplementation(async () => {
      const { worker, terminate } = fakeWorker(async () => [
        recognizedWord("ACME", 4, 4, 28, 20),
        recognizedWord("ESTATE", 32, 4, 60, 20),
      ]);
      terminate.mockImplementation(async () => {
        terminates.push(1);
      });
      return worker;
    });

    for (let i = 0; i < 5; i += 1) {
      const out = await extractLabelEvidence(input());
      expect(out.ok).toBe(true);
    }
    // One creation and one termination per call — no leaked/growing workers.
    expect(createLocalOcrEngine).toHaveBeenCalledTimes(5);
    expect(terminates.length).toBe(5);
  });
});
