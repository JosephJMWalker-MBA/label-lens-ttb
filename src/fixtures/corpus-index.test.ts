import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateFixtureManifest } from "./fixture-manifest.schema";
import { validateFixtureCorpusIndex } from "./corpus-index.schema";
import { CORPUS_DIR, CORPUS_INDEX_PATH, loadCorpusIndex } from "./corpus-index.load";
import { TRUTH_LABEL_PROHIBITION } from "./corpus-index.types";

const rawIndex = readFileSync(CORPUS_INDEX_PATH, "utf8");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.subarray(0, 8).equals(signature)).toBe(true);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("no JPEG SOF marker found");
}

function imageDimensions(bytes: Buffer, mediaType: string): { width: number; height: number } {
  return mediaType === "image/png" ? pngDimensions(bytes) : jpegDimensions(bytes);
}

describe("fixture corpus index — schema and integrity", () => {
  it("parses through the strict corpus schema", () => {
    expect(validateFixtureCorpusIndex(JSON.parse(rawIndex)).ok).toBe(true);
  });

  it("has unique fixture ids", () => {
    const ids = loadCorpusIndex().entries.map((e) => e.fixtureId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique committed image paths", () => {
    const paths = loadCorpusIndex()
      .entries.filter((e) => e.imageFilename && e.fixtureDir)
      .map((e) => `${e.fixtureDir}/${e.imageFilename}`);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("resolves every committed asset and manifest path on disk", () => {
    for (const e of loadCorpusIndex().entries) {
      if (e.availability !== "available" || e.domainOnlySynthetic) continue;
      expect(e.fixtureDir).not.toBeNull();
      const dir = join(CORPUS_DIR, e.fixtureDir!);
      if (e.imageFilename) expect(existsSync(join(dir, e.imageFilename))).toBe(true);
      if (e.manifestFilename) expect(existsSync(join(dir, e.manifestFilename))).toBe(true);
    }
  });

  it("matches every committed image hash, size, media type, and dimensions to its manifest", () => {
    for (const e of loadCorpusIndex().entries) {
      if (!e.imageFilename || !e.manifestFilename || !e.fixtureDir) continue;
      const dir = join(CORPUS_DIR, e.fixtureDir);
      const manifestResult = validateFixtureManifest(
        JSON.parse(readFileSync(join(dir, e.manifestFilename), "utf8")),
      );
      expect(manifestResult.ok).toBe(true);
      if (!manifestResult.ok) continue;
      const derivative = manifestResult.value.sourceChain.derivatives.find(
        (d) => d.filename === e.imageFilename,
      );
      expect(derivative, `manifest names ${e.imageFilename}`).toBeDefined();
      if (!derivative) continue;

      const bytes = readFileSync(join(dir, e.imageFilename));
      expect(sha256(bytes)).toBe(derivative.sha256);
      expect(statSync(join(dir, e.imageFilename)).size).toBe(derivative.byteSize);
      const { width, height } = imageDimensions(bytes, derivative.mediaType);
      expect(width).toBe(derivative.pixelWidth);
      expect(height).toBe(derivative.pixelHeight);
    }
  });

  it("validates every referenced fixture manifest through the strict manifest schema", () => {
    for (const e of loadCorpusIndex().entries) {
      if (!e.manifestFilename || !e.fixtureDir) continue;
      const raw = readFileSync(join(CORPUS_DIR, e.fixtureDir, e.manifestFilename), "utf8");
      expect(validateFixtureManifest(JSON.parse(raw)).ok).toBe(true);
    }
  });

  it("carries the exact, unaltered truth-label prohibition on every entry", () => {
    for (const e of loadCorpusIndex().entries) {
      expect(e.truthLabelProhibition).toBe(TRUTH_LABEL_PROHIBITION);
    }
  });

  it("keeps disabled and unavailable fixtures out of the real-OCR set", () => {
    for (const e of loadCorpusIndex().entries) {
      if (e.availability === "unavailable" || e.domainOnlySynthetic) {
        expect(e.enabledForRealOcr).toBe(false);
      }
    }
  });

  it("commits no asset for unavailable fixtures and records why", () => {
    for (const e of loadCorpusIndex().entries) {
      if (e.availability !== "unavailable") continue;
      expect(e.imageFilename).toBeNull();
      expect(e.manifestFilename).toBeNull();
      expect(e.unavailableReason).toBeTruthy();
    }
  });
});

describe("fixture corpus index — privacy controls", () => {
  it("commits only screened images, manifests, and index in the corpus tree", () => {
    const allowed = /\.(jpe?g|png|json)$/i;
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
      );
    for (const file of walk(CORPUS_DIR)) {
      expect(file, `unexpected corpus file ${file}`).toMatch(allowed);
      // No raw OCR dumps, HTML pages, screenshots-with-EXIF, or PDFs.
      expect(file).not.toMatch(/\.(txt|ocr|csv|pdf|html?|webp|gif)$/i);
    }
  });

  it("contains no email addresses or formatted phone numbers in the index", () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const phone = /(?<!\d)(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/;
    expect(email.test(rawIndex)).toBe(false);
    expect(phone.test(rawIndex)).toBe(false);
  });
});

describe("fixture corpus index — version discipline", () => {
  function tamper(mutate: (m: Record<string, unknown>) => void, code: string) {
    const m = JSON.parse(rawIndex);
    mutate(m);
    const out = validateFixtureCorpusIndex(m);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe(code);
  }

  it("rejects an old or unknown corpus schema version clearly", () => {
    tamper((m) => {
      m.schemaVersion = "label-fixture-corpus.v0";
    }, "UNSUPPORTED_CORPUS_VERSION");
  });

  it("rejects a duplicate fixture id", () => {
    tamper((m) => {
      const entries = m.entries as Record<string, unknown>[];
      entries[1].fixtureId = entries[0].fixtureId;
    }, "INVALID_CORPUS");
  });

  it("rejects an unavailable fixture that claims real-OCR enablement", () => {
    tamper((m) => {
      const entries = m.entries as Record<string, unknown>[];
      const venom = entries.find((e) => e.availability === "unavailable")!;
      venom.enabledForRealOcr = true;
    }, "INVALID_CORPUS");
  });

  it("rejects a synthetic entry missing its evidence lines", () => {
    tamper((m) => {
      const entries = m.entries as Record<string, unknown>[];
      const synthetic = entries.find((e) => e.domainOnlySynthetic)!;
      synthetic.syntheticEvidence = null;
    }, "INVALID_CORPUS");
  });

  it("rejects a mutated truth-label prohibition", () => {
    tamper((m) => {
      const entries = m.entries as Record<string, unknown>[];
      entries[0].truthLabelProhibition = "you may inject truth into the extractor";
    }, "INVALID_SHAPE");
  });
});
