// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { sha256Hex, verifyAndDecode } from "./image-integrity";

const FIXTURE = join(
  process.cwd(),
  "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
);
const FIXTURE_SHA = "0b0ccec13bf6c533ec7928b017b140a0213fb4555812fea81d71872adb453713";

describe("verifyAndDecode", () => {
  it("accepts fixture bytes matching the supplied derivative hash", async () => {
    const bytes = readFileSync(FIXTURE);
    expect(sha256Hex(bytes)).toBe(FIXTURE_SHA);
    const result = await verifyAndDecode(bytes, FIXTURE_SHA);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ width: 2404, height: 979, format: "jpeg" });
  });

  it("rejects a hash mismatch without continuing", async () => {
    const bytes = readFileSync(FIXTURE);
    const result = await verifyAndDecode(bytes, "0".repeat(64));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("HASH_MISMATCH");
  });

  it("rejects empty input", async () => {
    const bytes = new Uint8Array(0);
    const result = await verifyAndDecode(bytes, sha256Hex(bytes));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("EMPTY_IMAGE");
  });

  it("rejects corrupt (undecodable) bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const result = await verifyAndDecode(bytes, sha256Hex(bytes));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CORRUPT_IMAGE");
  });

  it("rejects an unsupported image format", async () => {
    const tiff = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .tiff()
      .toBuffer();
    const bytes = new Uint8Array(tiff);
    const result = await verifyAndDecode(bytes, sha256Hex(bytes));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("rejects dimensions outside the safe bound", async () => {
    const tiny = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const bytes = new Uint8Array(tiny);
    const result = await verifyAndDecode(bytes, sha256Hex(bytes));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DIMENSIONS_OUT_OF_BOUNDS");
  });
});
