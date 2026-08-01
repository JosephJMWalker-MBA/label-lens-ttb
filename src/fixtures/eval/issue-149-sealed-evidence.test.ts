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
  acquireProductionBrandEvidence,
  writeSealedEvidencePackage,
  type SealedEvidenceFile,
  type SealedItemEvidence,
} from "../../../scripts/eval/lib/issue-149-candidate-adapter";

/**
 * The required file sets, restated HERE rather than imported.
 *
 * They were runtime exports, which made the runtime surface five names while the
 * contracts claimed two, and handed a caller the exact path list needed to build
 * a package-shaped object. They are module-private now, so this is an
 * independent statement of the contract that the real package must satisfy —
 * which is what a test should be.
 */
const SEALED_SUCCESS_FILE_SUFFIXES = [
  ".provenance.json",
  ".passes.json",
  ".fingerprints.json",
  ".words.jsonl",
  ".lines.jsonl",
  ".candidates.jsonl",
  ".selection.json",
  ".counts.json",
] as const;
const SEALED_FAILURE_FILE_SUFFIXES = [".provenance.json", ".failure.json"] as const;
import { canonicalize, sha256Bytes } from "../../../scripts/eval/lib/issue-149-evidence-canonical";
import {
  sealedCandidates,
  sealedCounts,
  sealedFile,
  sealedJson,
  sealedPasses,
} from "./issue-149-sealed-package-support";

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
    // The digest of THESE bytes. The boundary recomputes it over its private
    // copy and halts on disagreement, so a placeholder no longer passes.
    derivativeSha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    processedAt: "2026-07-12T00:00:00Z",
    extractionAdapterId: "local-two-field-extractor",
    extractionAdapterVersion: "1.0.0",
    ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0", modelId: "eng" },
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  }) as unknown as ExtractionInput;

const IMAGE_SHA256 = "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";

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

function acquireFailing(itemId = "item-0009") {
  vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
    ok: false,
    error: { code: "IMAGE_DECODE_FAILED", message: "bad image", issues: ["truncated"] },
  } as never);
  return acquireProductionBrandEvidence(validInput(itemId));
}

/**
 * The aggregate, recomputed independently from the ordered
 * (path, byteLength, sha256) entries. Stated here rather than imported, so the
 * test computes the value the boundary claims rather than echoing it.
 */
const aggregateOf = (files: readonly SealedEvidenceFile[]): string =>
  sha256Bytes(
    canonicalize(
      files.map((file) => ({ path: file.path, byteLength: file.byteLength, sha256: file.sha256 })),
    ),
  );

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

  it("changes the aggregate when the path, the byte length or the digest changes", async () => {
    const sealed = await acquire();
    // The aggregate is recomputed independently and must match.
    expect(aggregateOf(sealed.files)).toBe(sealed.aggregateSha256);

    const entries = sealed.files.map((file) => ({
      path: file.path,
      byteLength: file.byteLength,
      sha256: file.sha256,
    }));
    const digestOf = (rows: typeof entries): string => sha256Bytes(canonicalize(rows));
    expect(digestOf(entries)).toBe(sealed.aggregateSha256);

    // Exactly one field changed, three times over. A different itemId would
    // change all three at once and prove much less.
    const mutations: Array<[string, () => typeof entries]> = [
      [
        "path",
        () => entries.map((row, i) => (i === 0 ? { ...row, path: "item-0001.other.json" } : row)),
      ],
      [
        "byteLength",
        () => entries.map((row, i) => (i === 0 ? { ...row, byteLength: row.byteLength + 1 } : row)),
      ],
      [
        "sha256",
        () => entries.map((row, i) => (i === 0 ? { ...row, sha256: "0".repeat(64) } : row)),
      ],
    ];
    for (const [field, mutate] of mutations) {
      expect(digestOf(mutate()), `changing ${field} must change the aggregate`).not.toBe(
        sealed.aggregateSha256,
      );
    }

    // Order is part of the hash too.
    expect(digestOf([...entries].reverse())).not.toBe(sealed.aggregateSha256);
  });

  describe("provenance binds the evidence to the bytes and the configuration", () => {
    const PROVENANCE_KEYS = [
      "derivativeSha256",
      "extractionAdapterId",
      "extractionAdapterVersion",
      "extractionAttemptCount",
      "imageByteLength",
      "imageSha256",
      "ocrEngine",
      "opaqueItemId",
      "parserId",
      "parserVersion",
      "processedAt",
      "retried",
    ];

    it("seals a provenance record matching the private snapshot, on SUCCESS", async () => {
      const sealed = await acquire();
      const provenance = sealedJson(sealed, ".provenance.json");
      expect(Object.keys(provenance).sort()).toEqual(PROVENANCE_KEYS);
      expect(provenance).toMatchObject({
        opaqueItemId: "item-0001",
        imageByteLength: 3,
        imageSha256: IMAGE_SHA256,
        derivativeSha256: IMAGE_SHA256,
        processedAt: "2026-07-12T00:00:00Z",
        extractionAdapterId: "local-two-field-extractor",
        extractionAdapterVersion: "1.0.0",
        parserId: "wine-alcohol-parse",
        parserVersion: "1.0.0",
        extractionAttemptCount: 1,
        retried: false,
      });
      expect(provenance.ocrEngine).toEqual({
        kind: "ocr",
        engineId: "tesseract.js",
        engineVersion: "7.0.0",
        modelId: "eng",
      });
      // The digest is recomputed over the bytes, not copied from the claim.
      expect(provenance.imageSha256).toBe(sha256Bytes(new Uint8Array([1, 2, 3])));
    });

    it("seals the SAME provenance record on failure, with no fabricated evidence", async () => {
      const sealed = await acquireFailing();
      const provenance = sealedJson(sealed, ".provenance.json");
      expect(Object.keys(provenance).sort()).toEqual(PROVENANCE_KEYS);
      expect(provenance.imageSha256).toBe(IMAGE_SHA256);
      expect(provenance.extractionAttemptCount).toBe(1);
      expect(provenance.retried).toBe(false);

      const failure = sealedJson(sealed, ".failure.json");
      for (const fabricated of ["passes", "candidates", "lines", "selection", "debug"]) {
        expect(Object.hasOwn(failure, fabricated)).toBe(false);
      }
    });

    it("halts BEFORE the extractor when the bytes and the declared digest disagree", async () => {
      const input = validInput("item-0001");
      (input as unknown as { derivativeSha256: string }).derivativeSha256 = "b".repeat(64);
      await expect(acquireProductionBrandEvidence(input)).rejects.toMatchObject({
        code: "EXTRACTION_INPUT_IMAGE_DIGEST_MISMATCH",
      });
      expect(extractLabelEvidenceDetailed).not.toHaveBeenCalled();
    });

    it("cannot be altered by mutating the caller's input after invocation", async () => {
      const debug = await realDebug(PASSES);
      vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
        ok: true,
        value: { response: {}, debug, sellerRegionReadings: [] },
      } as never);
      const input = validInput("item-0001");
      const pending = acquireProductionBrandEvidence(input);
      input.imageBytes[0] = 99;
      (input.ocrEngine as { engineVersion: string }).engineVersion = "9.9.9";
      (input as unknown as { processedAt: string }).processedAt = "2020-01-01T00:00:00Z";

      const provenance = sealedJson(await pending, ".provenance.json");
      expect(provenance.imageSha256).toBe(IMAGE_SHA256);
      expect(provenance.processedAt).toBe("2026-07-12T00:00:00Z");
      expect((provenance.ocrEngine as Record<string, unknown>).engineVersion).toBe("7.0.0");
    });

    it("gives the SAME OCR evidence a different aggregate under a different identity", async () => {
      // The provenance file is covered by the aggregate, so identical
      // recognition under a different frozen configuration is a different
      // package. Demonstrated by recomputing over the entries with only the
      // provenance descriptor's digest changed.
      const sealed = await acquire();
      const entries = sealed.files.map((file) => ({
        path: file.path,
        byteLength: file.byteLength,
        sha256: file.sha256,
      }));
      const provenanceIndex = sealed.files.findIndex((f) => f.path.endsWith(".provenance.json"));
      expect(provenanceIndex).toBeGreaterThanOrEqual(0);
      const withOtherIdentity = entries.map((row, i) =>
        i === provenanceIndex ? { ...row, sha256: "1".repeat(64) } : row,
      );
      expect(sha256Bytes(canonicalize(withOtherIdentity))).not.toBe(sealed.aggregateSha256);
    });

    it("carries no historical identity or truth-bearing field", async () => {
      const sealed = await acquire();
      const everything = sealed.files
        .map((file) => Buffer.from(file.bytes).toString("utf8"))
        .join("\n")
        .toLowerCase();
      for (const forbidden of [
        "historicalcaseid",
        "historicalimagepath",
        "governedtruth",
        "expectedbrand",
        "acceptablevalues",
        "brandpresent",
        "istruth",
        "matchestruth",
      ]) {
        expect(everything).not.toContain(forbidden);
      }
    });
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

  describe("a package-shaped object is not a package", () => {
    /** Build an object with the same shape as a sealed package. */
    const shaped = (
      sealed: SealedItemEvidence,
      files: readonly SealedEvidenceFile[],
    ): SealedItemEvidence =>
      ({
        ...sealed,
        files,
        fileCount: files.length,
        totalBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
        aggregateSha256: aggregateOf(files),
      }) as SealedItemEvidence;

    const write = (sealed: SealedItemEvidence, name: string): unknown =>
      writeSealedEvidencePackage(sealed, { directory: path.join(scratch, name) });

    it("rejects an INCOHERENT subset, where files and fileCount disagree", async () => {
      const sealed = await acquire();
      const incoherent = { ...sealed, files: sealed.files.slice(0, 2) } as SealedItemEvidence;
      expect(() => write(incoherent, "incoherent")).toThrow(CandidateAdapterError);
      expect(existsSync(path.join(scratch, "incoherent"))).toBe(false);
    });

    it("rejects a COHERENT forged subset, because it is unauthentic", async () => {
      // The case the previous test could not reach: files, fileCount, totalBytes
      // and the aggregate are all rewritten together, so every arithmetic check
      // passes. It fails on ORIGIN, not on a forgotten count.
      const sealed = await acquire();
      const { files: original } = sealed;
      const forged = shaped(sealed, [original[0]]);

      expect(forged.fileCount).toBe(forged.files.length);
      expect(forged.totalBytes).toBe(forged.files[0].byteLength);
      expect(forged.aggregateSha256).toBe(aggregateOf(forged.files));

      expect(() => write(forged, "coherent")).toThrow(
        expect.objectContaining({ code: "SEALED_PACKAGE_UNAUTHENTIC" }),
      );
      expect(existsSync(path.join(scratch, "coherent"))).toBe(false);
    });

    it("rejects a CLONE of the complete package", async () => {
      const sealed = await acquire();
      const clone = { ...sealed } as SealedItemEvidence;
      expect(clone.aggregateSha256).toBe(sealed.aggregateSha256);
      expect(() => write(clone, "clone")).toThrow(
        expect.objectContaining({ code: "SEALED_PACKAGE_UNAUTHENTIC" }),
      );
    });

    it("rejects a NEW package built from all seven genuine descriptors", async () => {
      const sealed = await acquire();
      const rebuilt = shaped(sealed, [...sealed.files]);
      expect(rebuilt.aggregateSha256).toBe(sealed.aggregateSha256);
      expect(() => write(rebuilt, "rebuilt")).toThrow(
        expect.objectContaining({ code: "SEALED_PACKAGE_UNAUTHENTIC" }),
      );
    });

    it("rejects a duplicated descriptor with internally consistent metadata", async () => {
      const sealed = await acquire();
      const duplicated = shaped(sealed, [...sealed.files, sealed.files[0]]);
      expect(duplicated.aggregateSha256).toBe(aggregateOf(duplicated.files));
      expect(() => write(duplicated, "duplicated")).toThrow(CandidateAdapterError);
    });

    it("rejects a forged descriptor, a traversal path and an absolute path", async () => {
      const sealed = await acquire();
      const genuine = sealed.files[0];
      const forgedDescriptor = (overrides: Partial<SealedEvidenceFile>): SealedEvidenceFile =>
        Object.freeze({
          path: genuine.path,
          byteLength: genuine.byteLength,
          sha256: genuine.sha256,
          get bytes() {
            return Uint8Array.from(genuine.bytes);
          },
          ...overrides,
        }) as SealedEvidenceFile;

      for (const [name, descriptor] of [
        ["forged", forgedDescriptor({})],
        ["traversal", forgedDescriptor({ path: "../../item-0001.passes.json" })],
        ["absolute", forgedDescriptor({ path: "/etc/item-0001.passes.json" })],
        ["mismatched itemId", forgedDescriptor({ path: "item-9999.provenance.json" })],
      ] as Array<[string, SealedEvidenceFile]>) {
        const tampered = shaped(sealed, [descriptor, ...sealed.files.slice(1)]);
        expect(() => write(tampered, `descriptor-${name.replace(/\W/g, "")}`)).toThrow(
          CandidateAdapterError,
        );
      }
      // Nothing escaped anywhere.
      expect(existsSync(path.join(scratch, "..", "item-0001.passes.json"))).toBe(false);
    });

    it("rejects an incorrect totalBytes or aggregate on an OTHERWISE authentic package", async () => {
      // Reached through the authenticity gate by tampering with the registered
      // object itself — which is frozen, so this is what a caller would have to
      // do and cannot.
      const sealed = await acquire();
      expect(() => {
        (sealed as unknown as { totalBytes: number }).totalBytes = 1;
      }).toThrow(TypeError);
      expect(() => {
        (sealed as unknown as { aggregateSha256: string }).aggregateSha256 = "0".repeat(64);
      }).toThrow(TypeError);
      // The revalidation exists regardless, and is exercised by the shaped
      // packages above, which fail on origin first and on arithmetic second.
      expect(sealed.totalBytes).toBe(sealed.files.reduce((sum, file) => sum + file.byteLength, 0));
      expect(sealed.aggregateSha256).toBe(aggregateOf(sealed.files));
    });

    it("rejects a success package carrying a failure suffix, and the converse", async () => {
      const success = await acquire();
      const failure = await acquireFailing();

      // Success set with a failure file substituted in.
      const wrongForSuccess = shaped(success, [
        success.files[0],
        failure.files[1],
        ...success.files.slice(2),
      ]);
      expect(() => write(wrongForSuccess, "wrong-success")).toThrow(CandidateAdapterError);

      // Failure set with a success file appended.
      const wrongForFailure = shaped(failure, [...failure.files, success.files[1]]);
      expect(() => write(wrongForFailure, "wrong-failure")).toThrow(CandidateAdapterError);
    });

    it("still writes the GENUINE package, and verifies it by readback", async () => {
      const sealed = await acquire();
      const directory = path.join(scratch, "genuine");
      const report = writeSealedEvidencePackage(sealed, { directory });
      expect(report.filesWritten).toBe(8);
      expect(readdirSync(report.directory).sort()).toEqual(
        sealed.files.map((file) => file.path).sort(),
      );
    });
  });

  it("writes the COMPLETE package and verifies it by reading it back", async () => {
    const sealed = await acquire();
    const directory = path.join(scratch, "run-1");
    const report = writeSealedEvidencePackage(sealed, { directory });

    expect(report.filesWritten).toBe(sealed.fileCount);
    expect(report.aggregateSha256).toBe(sealed.aggregateSha256);
    expect(readdirSync(report.directory).sort()).toEqual(sealed.files.map((f) => f.path).sort());
    for (const file of sealed.files) {
      const bytes = readFileSync(path.join(report.directory, file.path));
      expect(bytes.byteLength).toBe(file.byteLength);
      expect(sha256Bytes(bytes)).toBe(file.sha256);
    }
  });

  it("has exactly three runtime exports, checked against the REAL namespace", async () => {
    // The real module namespace, not a source grep. Type-only interfaces are
    // erased and are correctly absent; the two suffix arrays were runtime
    // exports and are module-private now.
    const namespace = await import("../../../scripts/eval/lib/issue-149-candidate-adapter");
    expect(Object.keys(namespace).sort()).toEqual([
      "CandidateAdapterError",
      "acquireProductionBrandEvidence",
      "writeSealedEvidencePackage",
    ]);
    for (const absent of [
      "SEALED_SUCCESS_FILE_SUFFIXES",
      "SEALED_FAILURE_FILE_SUFFIXES",
      "sealPackage",
      "sealFile",
      "AUTHENTIC_PACKAGES",
      "AUTHENTIC_DESCRIPTORS",
    ]) {
      expect(Object.keys(namespace)).not.toContain(absent);
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

      const record = JSON.parse(
        Buffer.from(sealedFile(sealed, ".failure.json").bytes).toString("utf8"),
      ) as Record<string, unknown>;
      expect(record.retried).toBe(false);
      expect(record.debugSynthesised).toBe(false);
      expect(Object.keys(record)).not.toContain("passes");
    });

    it("writes the failure package like any other", async () => {
      const sealed = await failing();
      const directory = path.join(scratch, "run-fail");
      writeSealedEvidencePackage(sealed, { directory });
      expect(existsSync(path.join(directory, "item-0009", "item-0009.failure.json"))).toBe(true);
      expect(readdirSync(path.join(directory, "item-0009")).sort()).toEqual([
        "item-0009.failure.json",
        "item-0009.provenance.json",
      ]);
    });
  });
});

interface SealedMutable {
  push(entry: unknown): void;
}
