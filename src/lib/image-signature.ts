/**
 * Minimal, dependency-free image content detection for the finalize boundary.
 *
 * The server must not trust a client-declared MIME type or seller-declared
 * dimensions on their own. This reads the actual byte signature (magic bytes)
 * to determine the real media type, and — for PNG, whose dimensions live in a
 * fixed-offset IHDR header — the true pixel dimensions, without decoding pixels
 * or pulling in an image library.
 */

export interface DetectedImage {
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  width?: number;
  height?: number;
}

export function detectImage(bytes: Buffer): DetectedImage | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A, then IHDR with width@16, height@20 (big-endian).
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      mediaType: "image/png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  // JPEG: FF D8 FF.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mediaType: "image/jpeg" };
  }

  // WebP: "RIFF"...."WEBP".
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mediaType: "image/webp" };
  }

  return null;
}
