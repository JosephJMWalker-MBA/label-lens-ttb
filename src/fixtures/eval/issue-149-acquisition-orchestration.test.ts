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
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  sealedCandidates,
  sealedCounts,
  sealedJson,
  sealedPasses,
} from "./issue-149-sealed-package-support";

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

/** A mutable input carrying exactly the frozen incumbent identities. */
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

/** A mocked extractor whose resolution the test controls. */
function deferredExtractor(debug: ExtractionDebug) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(extractLabelEvidenceDetailed).mockImplementation(async () => {
    await gate;
    return { ok: true, value: { response: {}, debug, sellerRegionReadings: [] } } as never;
  });
  return { release };
}

beforeEach(() => {
  vi.mocked(extractLabelEvidenceDetailed).mockReset();
});

describe("Issue #149 extractor-owning acquisition", () => {
  it("calls the extractor exactly once, with a deeply frozen SNAPSHOT", async () => {
    const debug = validDebug();
    vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
      ok: true,
      value: { response: {}, debug, sellerRegionReadings: [] },
    } as never);

    const input = inputFor("item-0001");
    const result = await acquireProductionBrandEvidence(input);

    expect(extractLabelEvidenceDetailed).toHaveBeenCalledTimes(1);
    const passed = vi.mocked(extractLabelEvidenceDetailed).mock.calls[0][0];

    // NOT the caller's object. An earlier version asserted identity, which is
    // exactly what left the caller able to mutate it mid-flight.
    expect(passed).not.toBe(input);
    expect(Object.isFrozen(passed)).toBe(true);
    expect(Object.isFrozen(passed.ocrEngine)).toBe(true);
    expect(passed.imageBytes).not.toBe(input.imageBytes);

    // Same initial values.
    expect(passed.artifactRef).toBe("item-0001");
    expect(passed.derivativeSha256).toBe(input.derivativeSha256);
    expect(passed.processedAt).toBe("2026-07-12T00:00:00Z");
    expect([...passed.imageBytes]).toEqual([...input.imageBytes]);
    expect(passed.ocrEngine).toEqual(input.ocrEngine);
    expect(result.outcome).toBe("extracted");
  });

  describe("the input's own-key set is EXACT, not merely enumerable", () => {
    // `Object.keys` returns only enumerable string keys, so the previous
    // "closed key set" check could not see either of the first two cases.
    it("rejects a NON-ENUMERABLE unexpected own property", async () => {
      const input = inputFor("item-0001");
      Object.defineProperty(input, "governedTruth", {
        value: { present: true },
        enumerable: false,
        writable: true,
        configurable: true,
      });
      expect(Object.keys(input)).not.toContain("governedTruth");
      await expect(acquireProductionBrandEvidence(input)).rejects.toMatchObject({
        code: "MALFORMED_EXTRACTION_INPUT",
      });
      expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
    });

    it("rejects a SYMBOL-keyed own property", async () => {
      const input = inputFor("item-0001");
      (input as unknown as Record<symbol, unknown>)[Symbol("historicalCaseId")] = "brand-023";
      await expect(acquireProductionBrandEvidence(input)).rejects.toMatchObject({
        code: "MALFORMED_EXTRACTION_INPUT",
      });
      expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
    });

    it("rejects a Proxy input, whose descriptors are not evidence of its values", async () => {
      // A Proxy over a plain target satisfies every structural test and presents
      // ordinary data descriptors, then returns whatever it likes from `get`.
      let reads = 0;
      const target = inputFor("item-0001");
      const proxy = new Proxy(target, {
        get(receiver, property, ...rest) {
          if (property === "artifactRef") {
            reads += 1;
            return reads === 1 ? "item-0001" : "item-0042";
          }
          return Reflect.get(receiver, property, ...rest);
        },
      });
      await expect(
        acquireProductionBrandEvidence(proxy as unknown as ExtractionInput),
      ).rejects.toMatchObject({ code: "MALFORMED_EXTRACTION_INPUT" });
      expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
    });

    it("rejects a Proxy ocrEngine", async () => {
      const input = inputFor("item-0001");
      input.ocrEngine = new Proxy(
        { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
        {},
      ) as unknown as ExtractionInput["ocrEngine"];
      await expect(acquireProductionBrandEvidence(input)).rejects.toMatchObject({
        code: "MALFORMED_EXTRACTION_INPUT",
      });
      expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
    });

    it("captures each own property once, and cannot be re-read afterwards", async () => {
      // Stated exactly. Once accessors and Proxies are BOTH refused, a data
      // property's value cannot change between two reads, so "read once" is not
      // observable from outside — refusing the two ways a value could change is
      // what carries the guarantee. What is checkable is that the capture
      // happens in exactly one place and that nothing downstream re-reads the
      // caller's object, so that is what is asserted.
      const source = readFileSync(
        path.join(process.cwd(), "scripts/eval/lib/issue-149-candidate-adapter.ts"),
        "utf8",
      );
      expect(source.match(/captured\[key\] = descriptor\.value;/g)).toHaveLength(1);

      // After the capture, `raw` and `engine` are plain value records. The
      // parameter `input` must not be read again anywhere below the capture.
      const body = source.slice(source.indexOf("function snapshotAcquisitionInput"));
      const afterCapture = body
        .slice(body.indexOf("captureOwnDataValues(input,"))
        // Error messages NAME the caller's properties; naming one is not
        // reading it, so string and template literals are removed first.
        .replace(/`(?:[^`\\]|\\.)*`/g, "``")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''");
      expect(afterCapture).not.toContain("input.");
      expect(afterCapture).not.toContain("input[");

      // And the observable consequence: what the extractor receives is a
      // different object whose values match the ones present at call time.
      const debug = validDebug();
      vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
        ok: true,
        value: { response: {}, debug, sellerRegionReadings: [] },
      } as never);
      const input = inputFor("item-0001");
      await acquireProductionBrandEvidence(input);
      const passed = vi.mocked(extractLabelEvidenceDetailed).mock.calls[0][0];
      expect(passed).not.toBe(input);
      expect(passed.artifactRef).toBe("item-0001");
    });

    it("states imageBytes isolation as a private copy, not as freezing", async () => {
      // A nonempty typed array cannot be frozen in current JavaScript runtimes,
      // so claiming the snapshot is "recursively frozen" would be false. What
      // protects the bytes is that no caller holds a reference to the copy.
      const debug = validDebug();
      vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
        ok: true,
        value: { response: {}, debug, sellerRegionReadings: [] },
      } as never);
      const input = inputFor("item-0001");
      await acquireProductionBrandEvidence(input);
      const passed = vi.mocked(extractLabelEvidenceDetailed).mock.calls[0][0];

      expect(Object.isFrozen(passed)).toBe(true);
      expect(Object.isFrozen(passed.ocrEngine)).toBe(true);
      // Honest about the bytes: NOT frozen, and no caller alias.
      expect(Object.isFrozen(passed.imageBytes)).toBe(false);
      expect(passed.imageBytes).not.toBe(input.imageBytes);
      expect(() => Object.freeze(new Uint8Array([1]))).toThrow(TypeError);

      const source = readFileSync(
        path.join(process.cwd(), "scripts/eval/lib/issue-149-candidate-adapter.ts"),
        "utf8",
      );
      const prose = source.replace(/\s*\n\s*\*?\s*/g, " ");
      expect(prose).toContain("private copied `Uint8Array` with no caller-held alias");
      expect(prose).toContain('is therefore **not** "recursively frozen"');
    });
  });

  describe("the caller cannot mutate the input mid-flight", () => {
    it("ignores an artifactRef changed while the extractor is pending", async () => {
      const debug = validDebug();
      const { release } = deferredExtractor(debug);
      const input = inputFor("item-0001");

      const pending = acquireProductionBrandEvidence(input);
      // The window an earlier boundary left open: validated, awaited, re-read.
      input.artifactRef = "item-0042";
      release();

      const result = await pending;
      expect(result.outcome).toBe("extracted");
      expect(vi.mocked(extractLabelEvidenceDetailed).mock.calls[0][0].artifactRef).toBe(
        "item-0001",
      );
      expect(result.itemId).toBe("item-0001");
      expect(sealedCandidates(result).every((record) => record.opaqueItemId === "item-0001")).toBe(
        true,
      );
      expect(input.artifactRef).toBe("item-0042");
    });

    it("ignores imageBytes mutated after the call begins", async () => {
      const debug = validDebug();
      const { release } = deferredExtractor(debug);
      const input = inputFor("item-0001");
      const original = [...input.imageBytes];

      const pending = acquireProductionBrandEvidence(input);
      input.imageBytes[0] = 99;
      input.imageBytes = new Uint8Array([7, 7, 7]);
      release();
      await pending;

      expect([...vi.mocked(extractLabelEvidenceDetailed).mock.calls[0][0].imageBytes]).toEqual(
        original,
      );
    });

    it("ignores nested ocrEngine mutation", async () => {
      const debug = validDebug();
      const { release } = deferredExtractor(debug);
      const input = inputFor("item-0001");

      const pending = acquireProductionBrandEvidence(input);
      (input.ocrEngine as { engineVersion: string }).engineVersion = "9.9.9";
      release();
      await pending;

      const engine = vi.mocked(extractLabelEvidenceDetailed).mock.calls[0][0]
        .ocrEngine as unknown as Record<string, unknown>;
      expect(engine.engineVersion).toBe("7.0.0");
    });
  });

  describe("the input schema is closed and identity-checked", () => {
    it("rejects accessor-backed properties before invoking the extractor", async () => {
      const input = inputFor("item-0001") as unknown as Record<string, unknown>;
      let reads = 0;
      Object.defineProperty(input, "artifactRef", {
        configurable: true,
        enumerable: true,
        get() {
          reads += 1;
          return reads === 1 ? "item-0001" : "item-0042";
        },
      });
      await expect(
        acquireProductionBrandEvidence(input as unknown as ExtractionInput),
      ).rejects.toMatchObject({ code: "MALFORMED_EXTRACTION_INPUT" });
      expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
    });

    it("rejects extra fields, sellerRegionTargets and diagnostics", async () => {
      for (const extra of [
        { sellerRegionTargets: [] },
        { diagnostics: {} },
        { somethingElse: 1 },
      ]) {
        const input = { ...inputFor("item-0001"), ...extra } as unknown as ExtractionInput;
        await expect(acquireProductionBrandEvidence(input)).rejects.toMatchObject({
          code: "MALFORMED_EXTRACTION_INPUT",
        });
      }
      expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
    });

    it("rejects a missing field, a bad digest or non-Uint8Array bytes", async () => {
      const missing = { ...inputFor("item-0001") } as unknown as Record<string, unknown>;
      delete missing.parserId;
      for (const broken of [
        missing,
        { ...inputFor("item-0001"), derivativeSha256: "NOTHEX" },
        { ...inputFor("item-0001"), derivativeSha256: "a".repeat(64).toUpperCase() },
        { ...inputFor("item-0001"), imageBytes: [1, 2, 3] },
      ]) {
        await expect(
          acquireProductionBrandEvidence(broken as unknown as ExtractionInput),
        ).rejects.toMatchObject({ code: "MALFORMED_EXTRACTION_INPUT" });
      }
      expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
    });

    it("halts on a frozen-identity mismatch before any OCR", async () => {
      for (const drift of [
        { processedAt: "2026-01-01T00:00:00.000Z" },
        { extractionAdapterId: "some-other-adapter" },
        { extractionAdapterVersion: "2.0.0" },
        { parserId: "other-parser" },
        { parserVersion: "9.9.9" },
        {
          ocrEngine: {
            kind: "ocr",
            engineId: "tesseract.js",
            engineVersion: "6.0.0",
            modelId: "eng",
          },
        },
      ]) {
        const input = { ...inputFor("item-0001"), ...drift } as unknown as ExtractionInput;
        await expect(acquireProductionBrandEvidence(input)).rejects.toMatchObject({
          code: "EXTRACTION_INPUT_IDENTITY_MISMATCH",
        });
      }
      expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
    });

    it("uses the frozen identities the incumbent configuration records", async () => {
      // The literals in the adapter must equal the governed artifact, or
      // "frozen from the incumbent" is an unchecked assertion.
      const incumbent = JSON.parse(
        readFileSync(
          path.join(
            process.cwd(),
            "artifacts/issue-149-brand-complete-evidence-acquisition/incumbent-configuration-freeze.json",
          ),
          "utf8",
        ),
      ) as { extractionInputIdentities: Record<string, unknown> };
      const frozen = incumbent.extractionInputIdentities;
      const accepted = inputFor("item-0001") as unknown as Record<string, unknown>;
      for (const key of [
        "processedAt",
        "extractionAdapterId",
        "extractionAdapterVersion",
        "parserId",
        "parserVersion",
      ]) {
        expect(accepted[key]).toBe(frozen[key]);
      }
      expect(accepted.ocrEngine).toEqual(frozen.ocrEngine);
    });
  });

  it("binds the returned passes and candidates to the same detailed result", async () => {
    const debug = validDebug();
    vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
      ok: true,
      value: { response: {}, debug, sellerRegionReadings: [] },
    } as never);

    const result = await acquireProductionBrandEvidence(inputFor("item-0001"));
    expect(result.outcome).toBe("extracted");

    // Pass evidence comes from the detailed result the API itself obtained, and
    // is now readable only as sealed bytes.
    const passes = sealedPasses(result);
    expect(passes).toHaveLength(debug.passes.length);
    expect(passes.map((pass) => pass.passId)).toEqual(debug.passes.map((pass) => pass.passId));

    // Candidate evidence comes from the internally derived selection.
    const counts = sealedCounts(result);
    const candidates = sealedCandidates(result);
    expect(candidates).toHaveLength(counts.candidateCount as number);
    expect(candidates.every((record) => record.opaqueItemId === "item-0001")).toBe(true);
  });

  it("returns the extractor's typed failure unchanged, with no evidence", async () => {
    const failure = {
      ok: false as const,
      error: { code: "IMAGE_DECODE_FAILED", message: "bad image", issues: ["truncated"] },
    };
    vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue(failure as never);

    const result = await acquireProductionBrandEvidence(inputFor("item-0001"));

    expect(result.outcome).toBe("extraction-failed");
    expect(result.failure).toEqual({
      code: "IMAGE_DECODE_FAILED",
      message: "bad image",
      issues: ["truncated"],
    });
    // Exactly one governed failure file. No partial debug is synthesised, so no
    // pass, line, candidate, selection or counts file exists.
    expect(result.files.map((file) => file.path)).toEqual(["item-0001.failure.json"]);
    const record = sealedJson(result, ".failure.json");
    expect(record.errorCode).toBe("IMAGE_DECODE_FAILED");
    expect(record.retried).toBe(false);
    expect(record.debugSynthesised).toBe(false);
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
    expect(result.itemId).toBe("item-0042");
    expect(sealedCandidates(result).every((record) => record.opaqueItemId === "item-0042")).toBe(
      true,
    );
    // The function takes exactly one argument, so no second identifier can
    // disagree with artifactRef.
    expect(acquireProductionBrandEvidence).toHaveLength(1);
  });

  it("exposes exactly the error class and the acquisition API at runtime", async () => {
    const namespace = await import("../../../scripts/eval/lib/issue-149-candidate-adapter");
    expect(Object.keys(namespace).sort()).toEqual([
      "CandidateAdapterError",
      "SEALED_FAILURE_FILE_SUFFIXES",
      "SEALED_SUCCESS_FILE_SUFFIXES",
      "acquireProductionBrandEvidence",
      "writeSealedEvidencePackage",
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
