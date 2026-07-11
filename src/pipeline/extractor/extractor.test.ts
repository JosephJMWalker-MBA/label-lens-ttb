// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { validateAnalyzerEvidenceResponse } from "@/pipeline/analyzer/analyzer.schema";
import type { AnalyzerEvidenceResponse } from "@/pipeline/analyzer/analyzer.types";

import { extractLabelEvidence } from "./extractor";
import type { ExtractionInput } from "./extractor.types";

const FIXTURE = join(
  process.cwd(),
  "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
);
const FIXTURE_SHA = "0b0ccec13bf6c533ec7928b017b140a0213fb4555812fea81d71872adb453713";
const OCR_TIMEOUT = 120_000;

function inputFrom(bytes: Uint8Array, sha = FIXTURE_SHA): ExtractionInput {
  return {
    imageBytes: bytes,
    artifactRef: "m-cellars-24205001000905",
    derivativeSha256: sha,
    processedAt: "2026-07-10T00:00:00Z",
    extractionAdapterId: "local-two-field-extractor",
    extractionAdapterVersion: "1.0.0",
    ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  };
}

describe("extractLabelEvidence (real OCR on the M Cellars benchmark)", () => {
  let response: AnalyzerEvidenceResponse;

  beforeAll(async () => {
    const bytes = readFileSync(FIXTURE);
    const result = await extractLabelEvidence(inputFrom(bytes));
    if (!result.ok) throw new Error(`extraction failed: ${JSON.stringify(result.error)}`);
    response = result.value;
  }, OCR_TIMEOUT);

  it("does not fabricate a confident brand from noisy artwork or the bottler line", () => {
    // The stylized "M CELLARS" brand mark is not cleanly recoverable by this
    // bounded OCR, and the only clean "M CELLARS" text sits on the producer/
    // bottler line, which is never brand evidence. Honest pixel evidence is
    // therefore AMBIGUOUS (rival short candidates, weak lead) — never a confident
    // OBSERVED brand and never the bottler entity.
    expect(response.fields.brandName.state).toBe("AMBIGUOUS");
    expect(response.fields.brandName.alternates.length).toBeGreaterThan(0);
  });

  it("extracts 12.5% ALC./VOL. from the vertical mandatory strip", () => {
    expect(response.fields.alcoholStatement.value).toBe("12.5% ALC./VOL.");
    expect(["OBSERVED", "LOW_CONFIDENCE"]).toContain(response.fields.alcoholStatement.state);
  });

  it("maps geometry to the original 2404×979 coordinate frame", () => {
    for (const field of [response.fields.brandName, response.fields.alcoholStatement]) {
      expect(field.geometry).toBeDefined();
      const g = field.geometry!;
      expect(g.imageWidth).toBe(2404);
      expect(g.imageHeight).toBe(979);
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.y).toBeGreaterThanOrEqual(0);
      expect(g.x + g.width).toBeLessThanOrEqual(2404);
      expect(g.y + g.height).toBeLessThanOrEqual(979);
    }
  });

  it("preserves raw text, normalized value, and confidence through schema validation", () => {
    expect(validateAnalyzerEvidenceResponse(response).ok).toBe(true);
    expect(response.fields.alcoholStatement.rawText).toMatch(/12\.5%/);
    expect(response.fields.brandName.confidence).toBeGreaterThan(0);
  });

  it("never returns a proof value", () => {
    expect(JSON.stringify(response.fields)).not.toMatch(/proof/i);
  });

  it("records preprocessing provenance for each selected field", () => {
    const joined = response.limitations.join(" ");
    expect(joined).toMatch(/brandName selected from region/);
    expect(joined).toMatch(/alcoholStatement selected from region/);
  });

  it(
    "rejects a hash mismatch before OCR",
    async () => {
      const bytes = readFileSync(FIXTURE);
      const result = await extractLabelEvidence(inputFrom(bytes, "0".repeat(64)));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("HASH_MISMATCH");
    },
    OCR_TIMEOUT,
  );

  it(
    "produces byte-identical serialization for identical input (determinism)",
    async () => {
      const bytes = readFileSync(FIXTURE);
      const a = await extractLabelEvidence(inputFrom(bytes));
      const b = await extractLabelEvidence(inputFrom(bytes));
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) expect(JSON.stringify(a.value)).toBe(JSON.stringify(b.value));
    },
    OCR_TIMEOUT,
  );
});
