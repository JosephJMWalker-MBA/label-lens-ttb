// @vitest-environment node
import { createHash } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  MAX_DECODED_HEIGHT,
  MAX_DECODED_PIXELS,
  MAX_DECODED_WIDTH,
} from "@/server/resource-policy";

import { checkDecodedBudget, verifyAndDecode } from "./image-integrity";

function ok(overrides: Partial<Parameters<typeof checkDecodedBudget>[0]> = {}) {
  return { format: "jpeg", width: 2404, height: 979, pages: 1, ...overrides };
}

describe("checkDecodedBudget — decoded-image resource budget", () => {
  it("accepts the committed M Cellars 2404×979 dimensions", () => {
    expect(checkDecodedBudget(ok()).ok).toBe(true);
  });

  it("accepts an image at the width limit within the pixel budget", () => {
    expect(checkDecodedBudget(ok({ width: MAX_DECODED_WIDTH, height: 100, pages: 1 })).ok).toBe(
      true,
    );
  });

  const rejects: [string, Partial<Parameters<typeof checkDecodedBudget>[0]>, string][] = [
    ["excessive width", { width: MAX_DECODED_WIDTH + 1 }, "IMAGE_DIMENSIONS_EXCEEDED"],
    ["excessive height", { height: MAX_DECODED_HEIGHT + 1 }, "IMAGE_DIMENSIONS_EXCEEDED"],
    ["excessive pixels within edges", { width: 9000, height: 9000 }, "IMAGE_PIXEL_BUDGET_EXCEEDED"],
    ["missing dimensions", { width: undefined }, "CORRUPT_IMAGE"],
    ["unsafe-integer dimensions", { width: Number.MAX_SAFE_INTEGER + 2 }, "CORRUPT_IMAGE"],
    ["multi-frame image", { pages: 3 }, "MULTI_FRAME_IMAGE_UNSUPPORTED"],
    ["unsupported decoded format", { format: "webp" }, "UNSUPPORTED_FORMAT"],
  ];
  it.each(rejects)("rejects %s", (_label, patch, code) => {
    const out = checkDecodedBudget(ok(patch));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe(code);
  });

  it("confirms 9000×9000 exceeds the pixel budget while staying within edges", () => {
    expect(9000 * 9000).toBeGreaterThan(MAX_DECODED_PIXELS);
    expect(9000).toBeLessThan(MAX_DECODED_WIDTH);
  });
});

describe("verifyAndDecode — real synthetic images", () => {
  async function pngBytes(width: number, height: number) {
    const buf = await sharp({
      create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const bytes = new Uint8Array(buf);
    return { bytes, sha: createHash("sha256").update(bytes).digest("hex") };
  }

  it("accepts a small valid decodable image", async () => {
    const { bytes, sha } = await pngBytes(64, 64);
    const out = await verifyAndDecode(bytes, sha);
    expect(out.ok).toBe(true);
  });

  it("rejects a tiny-compressed but oversized-pixel image (bytes are small)", async () => {
    // A uniform 9000×9000 PNG compresses to a small file yet exceeds the pixel
    // budget — proving compressed byte size alone cannot gate the workload.
    const { bytes, sha } = await pngBytes(9000, 9000);
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
    const out = await verifyAndDecode(bytes, sha);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("IMAGE_PIXEL_BUDGET_EXCEEDED");
  });
});
