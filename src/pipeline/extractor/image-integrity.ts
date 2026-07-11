import { createHash } from "node:crypto";

import sharp from "sharp";

import {
  MAX_DECODED_HEIGHT,
  MAX_DECODED_PIXELS,
  MAX_DECODED_WIDTH,
  MAX_IMAGE_FRAMES,
  MIN_DECODED_DIMENSION,
} from "@/server/resource-policy";
import { err, ok, type Result } from "@/shared/result";

import type { ExtractionError } from "./extractor.types";

/**
 * Image integrity gate. The input bytes are hashed and compared to the supplied
 * derivative SHA-256 before any OCR, and the image is decoded to confirm a
 * supported format, a single frame, and safe dimensions within the canonical
 * resource policy. A hash mismatch is never silently continued past, and an
 * oversized decoded workload is rejected before any preprocessing/OCR — a small
 * compressed file cannot expand into a disproportionate pixel budget.
 */

const SUPPORTED_FORMATS = new Set(["png", "jpeg"]);

export interface DecodedImage {
  width: number;
  height: number;
  format: string;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(
  code: ExtractionError["code"],
  message: string,
  issues: string[] = [],
): Result<never, ExtractionError> {
  return err({ code, message, issues });
}

export async function verifyAndDecode(
  bytes: Uint8Array,
  expectedSha256: string,
): Promise<Result<DecodedImage, ExtractionError>> {
  if (bytes.length === 0) {
    return fail("EMPTY_IMAGE", "Image byte buffer is empty.");
  }

  const actual = sha256Hex(bytes);
  if (actual !== expectedSha256) {
    return fail("HASH_MISMATCH", "Image bytes do not match the supplied derivative SHA-256.", [
      `expected ${expectedSha256}, got ${actual}`,
    ]);
  }

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(Buffer.from(bytes)).metadata();
  } catch {
    return fail("CORRUPT_IMAGE", "Image bytes could not be decoded.");
  }

  return checkDecodedBudget({
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    pages: metadata.pages,
  });
}

/** The bounded metadata the budget check needs (from Sharp, or a test stub). */
export interface DecodedMetadata {
  format?: string;
  width?: number;
  height?: number;
  pages?: number;
}

/**
 * Validate decoded image metadata against the canonical resource policy before
 * any preprocessing/OCR. Pure and safe: it never throws, never exposes paths,
 * and computes the pixel count guarding against overflow-like inputs.
 */
export function checkDecodedBudget(
  metadata: DecodedMetadata,
): Result<DecodedImage, ExtractionError> {
  const format = metadata.format ?? "";
  if (!SUPPORTED_FORMATS.has(format)) {
    return fail("UNSUPPORTED_FORMAT", `Unsupported image format: ${format || "unknown"}.`);
  }

  // The one-image contract accepts a single frame; animated/multipage is refused.
  const frames = metadata.pages ?? 1;
  if (!Number.isSafeInteger(frames) || frames > MAX_IMAGE_FRAMES) {
    return fail(
      "MULTI_FRAME_IMAGE_UNSUPPORTED",
      "Multi-frame or animated images are not supported.",
    );
  }

  const width = metadata.width;
  const height = metadata.height;
  if (
    width === undefined ||
    height === undefined ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height)
  ) {
    return fail("CORRUPT_IMAGE", "Image metadata did not report valid dimensions.");
  }

  // Below the minimum legible edge is treated as corrupt input, not a budget breach.
  if (width < MIN_DECODED_DIMENSION || height < MIN_DECODED_DIMENSION) {
    return fail(
      "DIMENSIONS_OUT_OF_BOUNDS",
      `Image dimensions ${width}×${height} are below the minimum ${MIN_DECODED_DIMENSION}px edge.`,
    );
  }

  if (width > MAX_DECODED_WIDTH || height > MAX_DECODED_HEIGHT) {
    return fail(
      "IMAGE_DIMENSIONS_EXCEEDED",
      `Image dimensions ${width}×${height} exceed the ${MAX_DECODED_WIDTH}×${MAX_DECODED_HEIGHT} limit.`,
    );
  }

  // Pixel-count guard, computed safely so overflow-like inputs cannot slip past.
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_DECODED_PIXELS) {
    return fail(
      "IMAGE_PIXEL_BUDGET_EXCEEDED",
      `Image pixel count exceeds the ${MAX_DECODED_PIXELS} budget.`,
    );
  }

  return ok({ width, height, format });
}
