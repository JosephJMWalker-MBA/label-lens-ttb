import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateFixtureManifest } from "./fixture-manifest.schema";

// Vitest runs from the repository root, so resolve the fixture from cwd.
const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/precheck/m-cellars-24205001000905");
const MANIFEST_PATH = join(FIXTURE_DIR, "manifest.json");
const DERIVATIVE_PATH = join(FIXTURE_DIR, "label.png");

const rawManifest = readFileSync(MANIFEST_PATH, "utf8");

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Read width/height straight from the PNG IHDR header (no image library). */
function pngDimensions(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.subarray(0, 8).equals(signature)).toBe(true);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("fixture manifest — validation and determinism", () => {
  it("validates the committed M Cellars manifest", () => {
    const result = validateFixtureManifest(JSON.parse(rawManifest));
    expect(result.ok).toBe(true);
  });

  it("parses deterministically and validates to an identical result twice", () => {
    expect(JSON.parse(rawManifest)).toEqual(JSON.parse(rawManifest));
    const a = validateFixtureManifest(JSON.parse(rawManifest));
    const b = validateFixtureManifest(JSON.parse(rawManifest));
    expect(a).toEqual(b);
  });

  it("records the artifact-verified truth labels, not the earlier transcription", () => {
    const result = validateFixtureManifest(JSON.parse(rawManifest));
    if (!result.ok) throw new Error("manifest should be valid");
    expect(result.value.truthLabels.alcoholStatement).toBe("12.5% ALC./VOL.");
    expect(result.value.truthLabels.brand).toBe("M CELLARS");
    const note = result.value.provenanceNotes.find(
      (n) => n.topic === "alcohol-statement-transcription",
    );
    expect(note?.earlierHumanTranscription).toBe("13% ALC./VOL.");
    expect(note?.artifactVerifiedTruth).toBe("12.5% ALC./VOL.");
    expect(note?.resolution).toBe("artifact-controls");
  });
});

describe("fixture manifest — source and derivative integrity", () => {
  const manifest = JSON.parse(rawManifest);

  it("references the certificate without retaining bytes or claiming a source hash", () => {
    expect(manifest.source.sourceBytesRetained).toBe(false);
    expect(manifest.source.sourceSha256).toBeNull();
  });

  it("derivative hash matches the committed file", () => {
    expect(sha256(readFileSync(DERIVATIVE_PATH))).toBe(manifest.derivative.sha256);
  });

  it("derivative byte size and pixel dimensions match the committed file", () => {
    const bytes = readFileSync(DERIVATIVE_PATH);
    expect(statSync(DERIVATIVE_PATH).size).toBe(manifest.derivative.byteSize);
    const { width, height } = pngDimensions(bytes);
    expect(width).toBe(manifest.derivative.pixelWidth);
    expect(height).toBe(manifest.derivative.pixelHeight);
  });

  it("rejects a manifest that claims a source hash without retained bytes", () => {
    const tampered = JSON.parse(rawManifest);
    tampered.source.sourceSha256 = "a".repeat(64);
    const result = validateFixtureManifest(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_PROVENANCE");
  });

  it("rejects a non-contiguous transformation chain", () => {
    const tampered = JSON.parse(rawManifest);
    tampered.transformationChain[0].order = 5;
    const result = validateFixtureManifest(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_PROVENANCE");
  });
});

describe("fixture privacy controls", () => {
  const manifest = JSON.parse(rawManifest);

  it("the fixture directory contains only the sanitized derivative and its manifest", () => {
    expect(readdirSync(FIXTURE_DIR).sort()).toEqual(["label.png", "manifest.json"]);
  });

  it("does not commit certificate bytes or a full-page rendering", () => {
    // Only one image is present, and it is the sanitized label crop by hash.
    const images = readdirSync(FIXTURE_DIR).filter((f) => /\.(png|jpe?g|tiff?|pdf)$/i.test(f));
    expect(images).toEqual(["label.png"]);
    expect(sha256(readFileSync(DERIVATIVE_PATH))).toBe(manifest.derivative.sha256);
  });

  it("does not retain whole-document OCR or text dumps", () => {
    const textArtifacts = readdirSync(FIXTURE_DIR).filter((f) => /\.(txt|ocr|json)$/i.test(f));
    expect(textArtifacts).toEqual(["manifest.json"]);
  });

  it("privacy exclusion records carry only category, check, result, and version", () => {
    for (const exclusion of manifest.privacyExclusions) {
      expect(Object.keys(exclusion).sort()).toEqual([
        "category",
        "check",
        "result",
        "toolOrRuleVersion",
      ]);
    }
  });

  it("names contact and signature categories as excluded", () => {
    const categories = manifest.privacyExclusions.map((e: { category: string }) => e.category);
    expect(categories).toContain("applicant-contact-information");
    expect(categories).toContain("signature");
    for (const exclusion of manifest.privacyExclusions) {
      expect(exclusion.result).toBe("excluded");
    }
  });

  it("the manifest text contains no email addresses or formatted phone numbers", () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const phone = /(?<!\d)(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/;
    expect(email.test(rawManifest)).toBe(false);
    expect(phone.test(rawManifest)).toBe(false);
  });
});
