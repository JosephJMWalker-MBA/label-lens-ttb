/**
 * The single canonical server-side resource policy for the one-label pre-check.
 *
 * These are DEFENSIVE operational/availability limits for this prototype — not
 * TTB rules and not regulatory maximums. They are sized to comfortably admit the
 * committed M Cellars 2404×979 JPEG while rejecting disproportionate work. One
 * policy object is reused by the route, the service, image integrity, the region
 * strategy, and the tests, so no divergent numbers drift between them.
 */

/** Maximum total HTTP request bytes (multipart overhead + file). */
export const MAX_REQUEST_BYTES = 20 * 1024 * 1024;

/** Maximum actual uploaded image-file bytes (checked after buffering). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Media types the upload path accepts. */
export const ALLOWED_MEDIA_TYPES = ["image/png", "image/jpeg"] as const;

/** Form content-types the route will parse (files require multipart). */
export const ALLOWED_REQUEST_CONTENT_TYPES = ["multipart/form-data"] as const;

/** Smallest decoded edge that can carry legible label text. */
export const MIN_DECODED_DIMENSION = 8;
/** Largest decoded width/height accepted before preprocessing/OCR. */
export const MAX_DECODED_WIDTH = 10000;
export const MAX_DECODED_HEIGHT = 10000;
/** Largest decoded pixel count (guards a small compressed file expanding hugely). */
export const MAX_DECODED_PIXELS = 40_000_000;
/** The one-image contract accepts a single frame; animated/multipage is rejected. */
export const MAX_IMAGE_FRAMES = 1;

/** Fixed ceiling on OCR passes/regions per request. */
export const MAX_OCR_REGIONS = 6;
/** Ceiling on any single preprocessing scale multiplier. */
export const MAX_SCALE_MULTIPLIER = 4;
/**
 * Ceiling on any single intermediate (cropped + scaled) image's pixel count.
 * With decoded pixels bounded and scale bounded, the largest intermediate is the
 * full-image region: MAX_DECODED_PIXELS × (fullImageScale²) stays well under this.
 */
export const MAX_INTERMEDIATE_PIXELS = 160_000_000;

/** Defensive cap on raw OCR text carried into a bounded observation. */
export const MAX_RAW_OCR_TEXT = 4096;
