/**
 * Canonicalizes a JSON-compatible value by sorting object keys recursively
 * and producing a minified JSON string with no arbitrary whitespaces.
 * This ensures deterministic hashing for integrity checks and idempotency.
 */
export function canonicalizeJson(val: any): string {
  if (val === null) {
    return "null";
  }
  if (val === undefined) {
    return "";
  }
  if (typeof val !== "object") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return "[" + val.map(canonicalizeJson).join(",") + "]";
  }
  const keys = Object.keys(val).sort();
  const parts = keys.map((key) => `"${key}":${canonicalizeJson(val[key])}`);
  return "{" + parts.join(",") + "}";
}
