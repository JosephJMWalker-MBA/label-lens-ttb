/* eslint-disable @typescript-eslint/no-explicit-any -- deliberate deep mutation of a cloned manifest to construct invalid candidates */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateFixtureManifest } from "./fixture-manifest.schema";
import type { FixtureDerivativeProvenance, FixtureManifest } from "./fixture-manifest.types";

// Vitest runs from the repository root, so resolve the fixture from cwd.
const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/precheck/m-cellars-24205001000905");
const MANIFEST_PATH = join(FIXTURE_DIR, "manifest.json");

const rawManifest = readFileSync(MANIFEST_PATH, "utf8");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Read width/height straight from a PNG IHDR header (no image library). */
function pngDimensions(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.subarray(0, 8).equals(signature)).toBe(true);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Read width/height from the first JPEG SOF marker (no image library). */
function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  let offset = 2; // skip SOI
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry dimensions.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("no JPEG SOF marker found");
}

function manifest(): FixtureManifest {
  const result = validateFixtureManifest(JSON.parse(rawManifest));
  if (!result.ok) throw new Error(`manifest invalid: ${JSON.stringify(result.error)}`);
  return result.value;
}

function derivative(role: string): FixtureDerivativeProvenance {
  return manifest().sourceChain.derivatives.find((d) => d.role === role)!;
}

describe("fixture manifest — source-chain provenance (v2)", () => {
  it("parses through the strict schema", () => {
    expect(validateFixtureManifest(JSON.parse(rawManifest)).ok).toBe(true);
  });

  it("names the public registry authority, TTB ID, and a public URL", () => {
    const src = manifest().sourceChain.externalSource;
    expect(src.authority).toBe("Alcohol and Tobacco Tax and Trade Bureau");
    expect(src.registry).toBe("Public COLA Registry");
    expect(src.ttbId).toBe("24205001000905");
    expect(src.applicationDetailUrl).toMatch(/^https?:\/\//);
  });

  it("represents unknown/not-retained source facts explicitly, never invented", () => {
    const src = manifest().sourceChain.externalSource;
    expect(src.sourceBytesRetained).toBe(false);
    expect(src.sourceSha256).toBe("not_retained");
    expect(src.sourceDimensions).toBe("not_retained");
    expect(src.retrievedAt).toBe("unknown");
    expect(src.sourceMediaType).toBe("unknown");
    expect(src.printableLabelUrl).toBe("unknown");
  });

  it("gives every derivative an explicit parent/source relationship", () => {
    const bench = derivative("ocr-benchmark");
    expect(bench.parent).toEqual({ kind: "external-source", ref: "external-source" });
    const ref = derivative("reference-crop");
    // The relationship between the two derivatives is not proven, stated explicitly.
    expect(ref.parent).toEqual({ kind: "unknown", ref: "relationship_not_proven" });
  });

  it("orders transformation steps and claims no manual pixel/text correction", () => {
    for (const d of manifest().sourceChain.derivatives) {
      expect(d.transformationSteps.length).toBeGreaterThan(0);
      d.transformationSteps.forEach((s, i) => expect(s.order).toBe(i + 1));
      expect(d.manuallyCorrectedPixelsOrText).toBe(false);
      expect(d.privacyExclusions.length).toBeGreaterThan(0);
      expect(d.intendedUse.length).toBeGreaterThan(0);
    }
  });

  it("records the artifact-verified truth, not the earlier transcription", () => {
    const m = manifest();
    expect(m.truthLabels.alcoholStatement).toBe("12.5% ALC./VOL.");
    const note = m.provenanceNotes.find((n) => n.topic === "alcohol-statement-transcription");
    expect(note?.earlierHumanTranscription).toBe("13% ALC./VOL.");
    expect(note?.artifactVerifiedTruth).toBe("12.5% ALC./VOL.");
  });
});

describe("fixture manifest — on-disk identity matches the committed files", () => {
  it("matches the OCR-benchmark JPEG hash, dimensions, bytes, and media type", () => {
    const d = derivative("ocr-benchmark");
    const path = join(FIXTURE_DIR, d.filename);
    const bytes = readFileSync(path);
    expect(d.mediaType).toBe("image/jpeg");
    expect(sha256(bytes)).toBe(d.sha256);
    expect(statSync(path).size).toBe(d.byteSize);
    const { width, height } = jpegDimensions(bytes);
    expect(width).toBe(d.pixelWidth);
    expect(height).toBe(d.pixelHeight);
  });

  it("matches the reference PNG hash, dimensions, bytes, and media type", () => {
    const d = derivative("reference-crop");
    const path = join(FIXTURE_DIR, d.filename);
    const bytes = readFileSync(path);
    expect(d.mediaType).toBe("image/png");
    expect(sha256(bytes)).toBe(d.sha256);
    expect(statSync(path).size).toBe(d.byteSize);
    const { width, height } = pngDimensions(bytes);
    expect(width).toBe(d.pixelWidth);
    expect(height).toBe(d.pixelHeight);
  });
});

describe("fixture manifest — source-chain integrity rejections", () => {
  function tamper(mutate: (m: Record<string, any>) => void, code: string) {
    const m = JSON.parse(rawManifest);
    mutate(m);
    const out = validateFixtureManifest(m);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe(code);
  }

  it("rejects duplicate derivative ids", () => {
    tamper((m) => {
      m.sourceChain.derivatives[1].derivativeId = m.sourceChain.derivatives[0].derivativeId;
    }, "INVALID_PROVENANCE");
  });

  it("rejects duplicate derivative filenames", () => {
    tamper((m) => {
      m.sourceChain.derivatives[1].filename = m.sourceChain.derivatives[0].filename;
    }, "INVALID_PROVENANCE");
  });

  it("rejects an unresolved repository parent", () => {
    tamper((m) => {
      m.sourceChain.derivatives[0].parent = { kind: "repository-derivative", ref: "no-such-id" };
    }, "INVALID_PROVENANCE");
  });

  it("rejects a missing parent relationship", () => {
    tamper((m) => {
      delete m.sourceChain.derivatives[0].parent;
    }, "INVALID_SHAPE");
  });

  it("rejects a missing transformation description", () => {
    tamper((m) => {
      delete m.sourceChain.derivatives[0].transformationSteps[0].description;
    }, "INVALID_SHAPE");
  });

  it("rejects a missing manual-correction declaration", () => {
    tamper((m) => {
      delete m.sourceChain.derivatives[0].manuallyCorrectedPixelsOrText;
    }, "INVALID_SHAPE");
  });

  it("rejects a malformed application URL", () => {
    tamper((m) => {
      m.sourceChain.externalSource.applicationDetailUrl = "not a url";
    }, "INVALID_SHAPE");
  });

  it("rejects a malformed derivative digest", () => {
    tamper((m) => {
      m.sourceChain.derivatives[0].sha256 = "xyz";
    }, "INVALID_SHAPE");
  });

  it("rejects a claimed source hash without retained bytes", () => {
    tamper((m) => {
      m.sourceChain.externalSource.sourceSha256 = "a".repeat(64);
    }, "INVALID_PROVENANCE");
  });

  it("rejects the superseded v1 manifest structure clearly", () => {
    tamper((m) => {
      m.schemaVersion = "label-fixture-manifest.v1";
    }, "UNSUPPORTED_MANIFEST_VERSION");
  });
});

describe("fixture privacy controls", () => {
  it("commits only the two sanitized derivatives and the manifest — no certificate/contact/signature files", () => {
    expect(readdirSync(FIXTURE_DIR).sort()).toEqual([
      "label-ocr-source.jpeg",
      "label.png",
      "manifest.json",
    ]);
  });

  it("retains no whole-document OCR or text dumps", () => {
    const textArtifacts = readdirSync(FIXTURE_DIR).filter((f) => /\.(txt|ocr|csv|pdf)$/i.test(f));
    expect(textArtifacts).toEqual([]);
  });

  it("privacy exclusion records carry only category, check, result, and version", () => {
    for (const d of manifest().sourceChain.derivatives) {
      for (const exclusion of d.privacyExclusions) {
        expect(Object.keys(exclusion).sort()).toEqual([
          "category",
          "check",
          "result",
          "toolOrRuleVersion",
        ]);
        expect(exclusion.result).toBe("excluded");
      }
    }
  });

  it("names contact and signature categories as excluded", () => {
    const categories = derivative("ocr-benchmark").privacyExclusions.map((e) => e.category);
    expect(categories).toContain("applicant-contact-information");
    expect(categories).toContain("signature");
  });

  it("the manifest text contains no email addresses or formatted phone numbers", () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const phone = /(?<!\d)(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/;
    expect(email.test(rawManifest)).toBe(false);
    expect(phone.test(rawManifest)).toBe(false);
  });
});
