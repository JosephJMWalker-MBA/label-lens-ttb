import { createHash } from "node:crypto";

import sharp from "sharp";

import { err, ok, type Result } from "@/shared/result";

import type { ExtractionError } from "./extractor.types";

/**
 * Image integrity gate. The input bytes are hashed and compared to the supplied
 * derivative SHA-256 before any OCR, and the image is decoded to confirm a
 * supported format and safe dimensions. A hash mismatch is never silently
 * continued past — extraction stops with a typed failure.
 */

const SUPPORTED_FORMATS = new Set(["png", "jpeg"]);
const MIN_DIMENSION = 8;
const MAX_DIMENSION = 20000;

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

  const format = metadata.format ?? "";
  if (!SUPPORTED_FORMATS.has(format)) {
    return fail("UNSUPPORTED_FORMAT", `Unsupported image format: ${format || "unknown"}.`);
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    width < MIN_DIMENSION ||
    height < MIN_DIMENSION ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION
  ) {
    return fail(
      "DIMENSIONS_OUT_OF_BOUNDS",
      `Image dimensions ${width}×${height} are outside the safe bound [${MIN_DIMENSION}, ${MAX_DIMENSION}].`,
    );
  }

  return ok({ width, height, format });
}
