/**
 * Canonical, deterministic serialization.
 *
 * Extracted from `canonical-json.ts` unchanged, so that surfaces which cannot
 * load `node:crypto` — the browser — can share the *same* canonicalization
 * rather than keeping a second copy of it. Two implementations of a
 * canonical form is an integrity hazard: they can drift, and a checksum computed
 * over a drifted serialization is worse than no checksum at all.
 *
 * Keys are sorted, arrays preserve order, and no whitespace, current time,
 * randomness, or environment value is ever introduced.
 *
 * This module must stay free of Node-only imports.
 */
export function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
