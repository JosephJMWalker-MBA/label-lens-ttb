/**
 * Issue #149 — the public API owns the extractor invocation.
 *
 * Non-OCR. `extractLabelEvidenceDetailed` is mocked, so no recognizer runs and no
 * image is read. The ordinary repository tests keep the real extractor.
 *
 * Each earlier signature closed the route it named and left an adjacent one open:
 * a bare candidate array, then a caller-supplied `FieldSelection`, then a
 * caller-supplied `ExtractionDebug` — which a helper could still construct with
 * filtered or reordered passes plus matching selections. Owning the extractor
 * call removes the class: there is no caller-supplied evidence at all.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import { extractLabelEvidenceDetailed, type ExtractionDebug } from "@/pipeline/extractor/extractor";
import type { ExtractionInput } from "@/pipeline/extractor/extractor.types";
import type { OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import { selectBrandObservation } from "@/pipeline/extractor/field-selection";

import {
  CandidateAdapterError,
  acquireProductionBrandEvidence,
} from "../../../scripts/eval/lib/issue-149-candidate-adapter";

vi.mock("@/pipeline/extractor/extractor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pipeline/extractor/extractor")>()),
  extractLabelEvidenceDetailed: vi.fn(),
}));

function word(text: string, index: number): OcrWord {
  const width = Math.max(text.length, 1) * 20;
  const x0 = 40 + index * 220;
  return {
    text,
    rawConfidence: 92,
    bbox: { x0, y0: 100, x1: x0 + width, y1: 160 },
    originalGeometry: {
      imageIndex: 0,
      x: x0,
      y: 100,
      width,
      height: 60,
      imageWidth: 1600,
      imageHeight: 1200,
    },
  };
}

function region(words: string[]): RegionOcrResult {
  const ocrWords = words.map((text, index) => word(text, index));
  return {
    passId: "pass-1-full-image",
    regionName: "full-image",
    passKind: "full-image-primary",
    triggerReasons: [],
    preprocessing: [],
    fieldEligibility: { brand: true, alcohol: true },
    pageSegMode: 11,
    transform: {
      crop: { left: 0, top: 0, width: 1600, height: 1200 },
      rotate: 0,
      scale: 1,
      originalWidth: 1600,
      originalHeight: 1200,
    },
    transformedSize: { width: 1600, height: 1200 },
    rawWordCount: ocrWords.length,
    discardedWordCount: 0,
    words: ocrWords,
    timings: { preprocessMs: 0, ocrMs: 0, inverseMappingMs: 0, totalMs: 0 },
  } as unknown as RegionOcrResult;
}

/** A real ExtractionDebug, assembled the way the extractor does. */
function validDebug(): ExtractionDebug {
  const passes = [region(["RED", "BRICK", "WINERY"])];
  const primaryBrand = selectBrandObservation([passes[0]]);
  const brand =
    primaryBrand.observation.state === "OBSERVED" ? primaryBrand : selectBrandObservation(passes);
  return {
    decoded: { width: 1600, height: 1200, format: "png" },
    passes,
    primarySelections: { brand: primaryBrand, alcohol: primaryBrand },
    finalSelections: { brand, alcohol: primaryBrand },
  } as unknown as ExtractionDebug;
}

const inputFor = (artifactRef: string): ExtractionInput =>
  ({
    artifactRef,
    imageBytes: new Uint8Array([1, 2, 3]),
    derivativeSha256: "a".repeat(64),
    processedAt: "2026-07-12T00:00:00Z",
    extractionAdapterId: "local-two-field-extractor",
    extractionAdapterVersion: "1.0.0",
    ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  }) as unknown as ExtractionInput;

beforeEach(() => {
  vi.mocked(extractLabelEvidenceDetailed).mockReset();
});

describe("Issue #149 extractor-owning acquisition", () => {
  it("calls the extractor exactly once, with the supplied input object", async () => {
    const debug = validDebug();
    vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
      ok: true,
      value: { response: {}, debug, sellerRegionReadings: [] },
    } as never);

    const input = inputFor("item-0001");
    const result = await acquireProductionBrandEvidence(input);

    expect(extractLabelEvidenceDetailed).toHaveBeenCalledTimes(1);
    // The same object, not a copy: the runner's frozen input flows through.
    expect(vi.mocked(extractLabelEvidenceDetailed).mock.calls[0][0]).toBe(input);
    expect(result.ok).toBe(true);
  });

  it("binds the returned passes and candidates to the same detailed result", async () => {
    const debug = validDebug();
    vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
      ok: true,
      value: { response: {}, debug, sellerRegionReadings: [] },
    } as never);

    const result = await acquireProductionBrandEvidence(inputFor("item-0001"));
    if (!result.ok) throw new Error("expected success");

    // Pass evidence comes from the detailed result the API itself obtained.
    expect(result.value.detailed.debug).toBe(debug);
    expect(result.value.detailed.debug.passes).toBe(debug.passes);
    // Candidate evidence comes from the internally derived selection.
    expect(result.value.candidateRecords).toHaveLength(
      result.value.diagnosticSelection.brandDiagnostics!.candidates.length,
    );
    expect(result.value.candidateRecords.every((r) => r.opaqueItemId === "item-0001")).toBe(true);
  });

  it("returns the extractor's typed failure unchanged, with no evidence", async () => {
    const failure = {
      ok: false as const,
      error: { code: "IMAGE_DECODE_FAILED", message: "bad image", issues: ["truncated"] },
    };
    vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue(failure as never);

    const result = await acquireProductionBrandEvidence(inputFor("item-0001"));

    expect(result).toBe(failure);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("IMAGE_DECODE_FAILED");
    expect(result.error.issues).toEqual(["truncated"]);
    // No diagnostic selection and no candidate record exists on a failure.
    expect(Object.hasOwn(result, "value")).toBe(false);
    expect(extractLabelEvidenceDetailed).toHaveBeenCalledTimes(1);
  });

  it("never retries a failed item", async () => {
    vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
      ok: false,
      error: { code: "OCR_PASS_FAILED", message: "boom", issues: [] },
    } as never);
    await acquireProductionBrandEvidence(inputFor("item-0001"));
    expect(extractLabelEvidenceDetailed).toHaveBeenCalledTimes(1);
  });

  it("halts on a malformed artifactRef BEFORE invoking the extractor", async () => {
    for (const bad of ["item-7", "ITEM-0001", "", "case-0001", undefined]) {
      await expect(
        acquireProductionBrandEvidence(inputFor(bad as unknown as string)),
      ).rejects.toMatchObject({ code: "MALFORMED_ARTIFACT_REF" });
    }
    expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
  });

  it("takes the opaque identity from artifactRef, with no second identifier", async () => {
    const debug = validDebug();
    vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
      ok: true,
      value: { response: {}, debug, sellerRegionReadings: [] },
    } as never);
    const result = await acquireProductionBrandEvidence(inputFor("item-0042"));
    if (!result.ok) throw new Error("expected success");
    expect(result.value.candidateRecords.every((r) => r.opaqueItemId === "item-0042")).toBe(true);
    // The function takes exactly one argument, so no second identifier can
    // disagree with artifactRef.
    expect(acquireProductionBrandEvidence).toHaveLength(1);
  });

  it("exposes exactly the error class and the acquisition API at runtime", async () => {
    const namespace = await import("../../../scripts/eval/lib/issue-149-candidate-adapter");
    expect(Object.keys(namespace).sort()).toEqual([
      "CandidateAdapterError",
      "acquireProductionBrandEvidence",
    ]);
    for (const removed of [
      "finalizeProductionBrandEvidence",
      "finalizeProductionCandidateArray",
      "toCandidateEvidenceRecord",
      "finalizeProductionCandidate",
      "deriveBrandEvidenceFromDebug",
      "TEST_ONLY_candidateAdapterInternals",
    ]) {
      expect(Object.hasOwn(namespace, removed)).toBe(false);
    }
    expect(CandidateAdapterError).toBeDefined();
  });
});
