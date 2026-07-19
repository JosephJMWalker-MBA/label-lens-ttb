/**
 * Validate a client-supplied `returnTo` value so it can only ever point at an
 * internal, same-origin path — never an open redirect.
 *
 * Accepts only paths that start with a single "/" followed by a non-"/"
 * character (so "//evil.com" and "/\evil.com" are rejected), contain no
 * scheme/authority (":"), no backslashes, and no whitespace or control
 * characters. Everything else — absolute URLs, protocol-relative URLs,
 * `javascript:` URLs, encoded external URLs, and malformed input — falls back
 * to the caller's default landing path.
 */

// Backslash, whitespace/space (<= U+0020), or DEL (U+007F).
const UNSAFE_PATH_CHARS = /[\u0000-\u0020\u007f\\]/;

export function safeInternalPath(candidate: unknown, fallback: string): string {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 512) {
    return fallback;
  }

  // Decode once to catch percent-encoded schemes/authorities (e.g. %2F%2Fevil).
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return fallback;
  }

  for (const value of [candidate, decoded]) {
    // Must be a rooted path: exactly one leading slash, then a non-slash/backslash.
    if (!/^\/[^/\\]/.test(value)) return fallback;
    if (UNSAFE_PATH_CHARS.test(value)) return fallback;
    // No scheme/authority markers (blocks javascript:, data:, http:, etc.).
    if (value.includes(":")) return fallback;
  }

  return candidate;
}
