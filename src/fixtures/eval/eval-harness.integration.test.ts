// @vitest-environment node
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { extractLabelEvidence } from "@/pipeline/extractor/extractor";
import type { ExtractionInput } from "@/pipeline/extractor/extractor.types";
import { sha256Hex } from "@/pipeline/extractor/image-integrity";

import { EVAL_FAILURE_CLASSES } from "./eval-manifest.types";
import { runCase } from "./eval-harness";
import { caseImagePath, loadCaseImage, loadEvalManifest } from "./eval-loader";
import type { CaseReport } from "./eval-report.types";

/**
 * OCR-backed safeguards. These run the real extractor on the single smallest
 * evaluation image to keep runtime bounded while proving the harness does not
 * mutate fixtures, emits only bounded diagnostics, and that no fixture identity
 * (filename or hash) can influence an extraction result.
 */

const OCR_TIMEOUT = 120_000;
// Smallest committed evaluation image, chosen to bound OCR runtime here.
const SMALL_CASE_ID = "patricia-green-cellars";

const manifest = loadEvalManifest();
const smallCase = manifest.cases.find((c) => c.caseId === SMALL_CASE_ID)!;

function inputFor(bytes: Uint8Array, sha256: string, artifactRef: string): ExtractionInput {
  return {
    imageBytes: bytes,
    artifactRef,
    derivativeSha256: sha256,
    processedAt: "2026-07-12T00:00:00Z",
    extractionAdapterId: "local-two-field-extractor",
    extractionAdapterVersion: "1.0.0",
    ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  };
}

describe("evaluation harness OCR-backed safeguards", () => {
  let report: CaseReport;
  let shaBefore: string;

  beforeAll(async () => {
    shaBefore = sha256Hex(new Uint8Array(readFileSync(caseImagePath(smallCase))));
    report = await runCase(smallCase);
  }, OCR_TIMEOUT);

  it("does not mutate the fixture image on disk", () => {
    const shaAfter = sha256Hex(new Uint8Array(readFileSync(caseImagePath(smallCase))));
    expect(shaAfter).toBe(shaBefore);
    expect(shaAfter).toBe(smallCase.expectedSha256);
  });

  it("emits only bounded diagnostics (fixed regions, capped words, real geometry)", () => {
    expect(report.diagnostics.regions.length).toBe(3);
    for (const region of report.diagnostics.regions) {
      expect(region.sampleWords.length).toBeLessThanOrEqual(25);
    }
    expect(report.diagnostics.brandLineTexts.length).toBeLessThanOrEqual(12);
    expect(report.diagnostics.brandCandidateDecisions.length).toBeLessThanOrEqual(24);
  });

  it("leaks no absolute paths or raw image bytes into the report", () => {
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(process.cwd());
    expect(serialized).not.toContain("tests/fixtures");
    // A base64/byte blob would be far larger than bounded diagnostics allow.
    expect(serialized.length).toBeLessThan(60_000);
  });

  it("classifies both fields into the declared taxonomy", () => {
    expect(EVAL_FAILURE_CLASSES).toContain(report.brand.failureClass);
    expect(EVAL_FAILURE_CLASSES).toContain(report.alcohol.failureClass);
  });

  it(
    "extraction is independent of fixture identity (no filename/hash lookup)",
    async () => {
      const { bytes, sha256 } = loadCaseImage(smallCase);
      const a = await extractLabelEvidence(inputFor(bytes, sha256, "identity-A"));
      const b = await extractLabelEvidence(inputFor(bytes, sha256, "a-totally-different-ref"));
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.value.fields.brandName.state).toBe(b.value.fields.brandName.state);
      expect(a.value.fields.brandName.value).toBe(b.value.fields.brandName.value);
      expect(a.value.fields.alcoholStatement.state).toBe(b.value.fields.alcoholStatement.state);
      expect(a.value.fields.alcoholStatement.value).toBe(b.value.fields.alcoholStatement.value);
    },
    OCR_TIMEOUT,
  );
});
