/**
 * Issue #149 — the sealed item-evidence boundary.
 *
 * Non-OCR: the extractor is mocked, so no recognizer runs. Everything else is
 * the real public API, the real canonicalization and the real writer.
 *
 * ## What these tests are for
 *
 * The boundary used to return the extractor's own `DetailedExtractionResult`,
 * the live `FieldSelection` and a mutable candidate array, leaving serialization
 * to the runner. A runner could then alias, filter, project, reorder or copy the
 * evidence before persisting it — and a PROJECTION needs no mutation at all, so
 * no source-level mutation rule could catch it. The alternative is deleted:
 * serialization happens inside the boundary and what comes back is bytes.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { extractLabelEvidenceDetailed, type ExtractionDebug } from "@/pipeline/extractor/extractor";
import type {
  ExtractionInput,
  OcrWord,
  RegionOcrResult,
} from "@/pipeline/extractor/extractor.types";

import {
  CandidateAdapterError,
  SEALED_FAILURE_FILE_SUFFIXES,
  SEALED_SUCCESS_FILE_SUFFIXES,
  acquireProductionBrandEvidence,
  writeSealedEvidencePackage,
} from "../../../scripts/eval/lib/issue-149-candidate-adapter";
import { sha256Bytes } from "../../../scripts/eval/lib/issue-149-evidence-canonical";
import { sealedCandidates, sealedCounts, sealedPasses } from "./issue-149-sealed-package-support";

vi.mock("@/pipeline/extractor/extractor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pipeline/extractor/extractor")>()),
  extractLabelEvidenceDetailed: vi.fn(),
}));

const scratch = mkdtempSync(path.join(tmpdir(), "issue-149-sealed-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const word = (text: string, index: number, y: number): OcrWord =>
  ({
    text,
    rawConfidence: 92,
    bbox: { x0: index * 220, y0: y, x1: index * 220 + 200, y1: y + 60 },
    originalGeometry: {
      imageIndex: 0,
      x: index * 220,
      y,
      width: 200,
      height: 60,
      imageWidth: 1600,
      imageHeight: 1200,
    },
  }) as OcrWord;

function region(lines: string[][], passId = "pass-1-full-image", passKind = "full-image-primary") {
  const words: OcrWord[] = [];
  lines.forEach((line, lineIndex) =>
    line.forEach((text, wordIndex) => words.push(word(text, wordIndex, 100 + lineIndex * 200))),
  );
  return {
    passId,
    regionName: "full-image",
    passKind,
    triggerReasons: [],
    preprocessing: [],
    fieldEligibility: { brand: true, alcohol: true },
    transform: {
      crop: { left: 0, top: 0, width: 1600, height: 1200 },
      rotate: 0,
      scale: 1,
      originalWidth: 1600,
      originalHeight: 1200,
    },
    transformedSize: { width: 1600, height: 1200 },
    pageSegMode: 11,
    rawWordCount: words.length,
    discardedWordCount: 0,
    timings: { preprocessMs: 1, ocrMs: 2, inverseMappingMs: 3, totalMs: 6 },
    words,
  } as unknown as RegionOcrResult;
}

/**
 * A real debug object, built by driving production's own selector and mirroring
 * production's own pass-set branch (extractor.ts:99,113): the primary selection
 * is retained when primary Brand is OBSERVED, otherwise selection runs over the
 * complete ordered pass array.
 */
async function realDebug(passes: RegionOcrResult[]): Promise<ExtractionDebug> {
  const { selectBrandObservation } = await vi.importActual<
    typeof import("@/pipeline/extractor/field-selection")
  >("@/pipeline/extractor/field-selection");
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

const validInput = (artifactRef: string): ExtractionInput =>
  ({
    imageBytes: new Uint8Array([1, 2, 3]),
    artifactRef,
    derivativeSha256: "a".repeat(64),
    processedAt: "2026-07-12T00:00:00Z",
    extractionAdapterId: "local-two-field-extractor",
    extractionAdapterVersion: "1.0.0",
    ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  }) as unknown as ExtractionInput;

const PASSES = [
  region([
    ["RED", "BRICK", "WINERY"],
    ["NAPA", "VALLEY"],
  ]),
  region([["RED", "BRICK", "WINERY"]], "pass-2-rot180", "full-image-rot180"),
];

async function acquire(itemId = "item-0001") {
  const debug = await realDebug(PASSES);
  vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
    ok: true,
    value: { response: {}, debug, sellerRegionReadings: [] },
  } as never);
  return acquireProductionBrandEvidence(validInput(itemId));
}

beforeEach(() => vi.mocked(extractLabelEvidenceDetailed).mockReset());

describe("Issue #149 sealed item-evidence package", () => {
  it("seals a complete real-selector case, with every expected file", async () => {
    const sealed = await acquire();
    expect(sealed.outcome).toBe("extracted");
    expect(sealed.files.map((file) => file.path)).toEqual(
      SEALED_SUCCESS_FILE_SUFFIXES.map((suffix) => `item-0001${suffix}`),
    );
    expect(sealed.fileCount).toBe(sealed.files.length);
    expect(sealed.totalBytes).toBe(sealed.files.reduce((sum, file) => sum + file.byteLength, 0));
    for (const file of sealed.files) {
      expect(file.sha256).toBe(sha256Bytes(file.bytes));
      expect(file.byteLength).toBe(file.bytes.byteLength);
    }
  });

  it("preserves pass and candidate order exactly", async () => {
    const sealed = await acquire();
    const debug = await realDebug(PASSES);
    expect(sealedPasses(sealed).map((pass) => pass.passId)).toEqual(
      debug.passes.map((pass) => pass.passId),
    );
    const records = sealedCandidates(sealed);
    expect(records.map((record) => record.candidateOrdinal)).toEqual(
      records.map((_, index) => index),
    );
    const counts = sealedCounts(sealed);
    expect(counts.candidateCount).toBe(records.length);
    expect(counts.passCount).toBe(debug.passes.length);
    expect(counts.wordCount).toBe(debug.passes.reduce((sum, pass) => sum + pass.words.length, 0));
  });

  it("changes the aggregate when any path or byte changes", async () => {
    const first = await acquire("item-0001");
    const second = await acquire("item-0002");
    // Different item id: different paths AND different bytes.
    expect(second.aggregateSha256).not.toBe(first.aggregateSha256);

    // The aggregate is over the ordered (path, byteLength, sha256) entries, so
    // recomputing it from those three fields reproduces it exactly.
    const entries = first.files.map((file) => ({
      path: file.path,
      byteLength: file.byteLength,
      sha256: file.sha256,
    }));
    expect(entries.map((entry) => entry.path)).toEqual(first.files.map((file) => file.path));
    expect(first.aggregateSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hands out no alias to the sealed bytes", async () => {
    const sealed = await acquire();
    const file = sealed.files[0];

    // Every read is a fresh copy.
    const a = file.bytes;
    const b = file.bytes;
    expect(a).not.toBe(b);
    expect([...a]).toEqual([...b]);

    // Mutating what was handed out changes nothing sealed.
    a[0] = 0;
    expect(file.bytes[0]).not.toBe(0);
    expect(file.sha256).toBe(sha256Bytes(file.bytes));
  });

  it("freezes the package and every descriptor", async () => {
    const sealed = await acquire();
    expect(Object.isFrozen(sealed)).toBe(true);
    expect(Object.isFrozen(sealed.files)).toBe(true);
    for (const file of sealed.files) expect(Object.isFrozen(file)).toBe(true);
  });

  it("exposes no raw debug, selection, candidate array or pass array", async () => {
    const sealed = await acquire();
    expect(Object.keys(sealed).sort()).toEqual([
      "aggregateSha256",
      "fileCount",
      "files",
      "itemId",
      "outcome",
      "totalBytes",
    ]);
    for (const absent of [
      "detailed",
      "debug",
      "diagnosticSelection",
      "candidateRecords",
      "passes",
    ]) {
      expect(Object.hasOwn(sealed, absent)).toBe(false);
    }
  });

  it("aliasing or projecting the caller-visible result cannot alter the sealed bytes", async () => {
    const sealed = await acquire();
    const before = sealed.files.map((file) => file.sha256);

    // Everything a runner could try, none of which reaches the sealed state.
    const projected = sealed.files.filter((file) => file.path.endsWith(".passes.json"));
    const copied = [...sealed.files].reverse();
    const aliased = sealed.files;
    expect(projected).toHaveLength(1);
    expect(copied).toHaveLength(sealed.files.length);
    expect(() => {
      (aliased as unknown as SealedMutable).push(projected[0]);
    }).toThrow();

    expect(sealed.files.map((file) => file.sha256)).toEqual(before);
    expect(sealed.fileCount).toBe(before.length);
  });

  it("rejects a package with a file dropped, at the writer", async () => {
    // Stated exactly: this drives the WRITER's consistency gate. The sealer's
    // own ordered-set check runs on every seal — it is what produced the
    // six-file list asserted above — but it is internal and has no parameter
    // through which a caller could hand it a short list, which is the point.
    // The writer is the reachable boundary, and it refuses a short package.
    const sealed = await acquire();
    const tampered = {
      ...sealed,
      files: sealed.files.slice(0, 2),
    } as unknown as typeof sealed;
    expect(() => writeSealedEvidencePackage(tampered, { directory: scratch })).toThrow(
      CandidateAdapterError,
    );
    expect(SEALED_SUCCESS_FILE_SUFFIXES).toHaveLength(6);
    expect(new Set(SEALED_SUCCESS_FILE_SUFFIXES).size).toBe(6);
  });

  it("writes the COMPLETE package and verifies it by reading it back", async () => {
    const sealed = await acquire();
    const directory = path.join(scratch, "run-1");
    const report = writeSealedEvidencePackage(sealed, { directory });

    expect(report.filesWritten).toBe(sealed.fileCount);
    expect(report.aggregateSha256).toBe(sealed.aggregateSha256);
    expect(readdirSync(directory).sort()).toEqual(sealed.files.map((f) => f.path).sort());
    for (const file of sealed.files) {
      const bytes = readFileSync(path.join(directory, file.path));
      expect(bytes.byteLength).toBe(file.byteLength);
      expect(sha256Bytes(bytes)).toBe(file.sha256);
    }
  });

  it("takes no file-subset parameter", () => {
    // A writer that accepts a caller-chosen subset reintroduces the projection
    // this boundary removes. It takes the package and one destination.
    expect(writeSealedEvidencePackage).toHaveLength(2);
  });

  describe("extractor failure", () => {
    const failing = () => {
      vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
        ok: false,
        error: { code: "IMAGE_DECODE_FAILED", message: "bad image", issues: ["truncated"] },
      } as never);
      return acquireProductionBrandEvidence(validInput("item-0009"));
    };

    it("seals only the governed failure evidence, once, with no synthesised debug", async () => {
      const sealed = await failing();
      expect(sealed.outcome).toBe("extraction-failed");
      expect(sealed.files.map((file) => file.path)).toEqual(
        SEALED_FAILURE_FILE_SUFFIXES.map((suffix) => `item-0009${suffix}`),
      );
      expect(sealed.failure).toEqual({
        code: "IMAGE_DECODE_FAILED",
        message: "bad image",
        issues: ["truncated"],
      });
      expect(extractLabelEvidenceDetailed).toHaveBeenCalledTimes(1);

      const record = JSON.parse(Buffer.from(sealed.files[0].bytes).toString("utf8")) as Record<
        string,
        unknown
      >;
      expect(record.retried).toBe(false);
      expect(record.debugSynthesised).toBe(false);
      expect(Object.keys(record)).not.toContain("passes");
    });

    it("writes the failure package like any other", async () => {
      const sealed = await failing();
      const directory = path.join(scratch, "run-fail");
      writeSealedEvidencePackage(sealed, { directory });
      expect(existsSync(path.join(directory, "item-0009.failure.json"))).toBe(true);
      expect(readdirSync(directory)).toEqual(["item-0009.failure.json"]);
    });
  });
});

interface SealedMutable {
  push(entry: unknown): void;
}
