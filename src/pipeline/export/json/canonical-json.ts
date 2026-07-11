import { createHash } from "node:crypto";

import type { ExportPayload, PrecheckJsonExport } from "./json-export.types";

/**
 * Canonical, deterministic serialization for the JSON export.
 *
 * Keys are sorted, arrays preserve order (findings, rule manifest, alternates,
 * disposition history), and no whitespace, current time, randomness, or
 * environment value is ever introduced. This is the single serialization used
 * for hashing and for the canonical export text.
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

/** SHA-256 (lowercase hex) over the canonical serialization of the payload. */
export function payloadHash(payload: ExportPayload): string {
  return createHash("sha256").update(canonicalStringify(payload)).digest("hex");
}

/** Canonical UTF-8 JSON text of the complete export (integrity block included). */
export function serializeExportCanonical(exportObject: PrecheckJsonExport): string {
  return canonicalStringify(exportObject);
}

/**
 * A human-readable, explicitly NON-canonical rendering. It parses to the same
 * data but must never be used for hashing.
 */
export function serializeExportPrettyNoncanonical(exportObject: PrecheckJsonExport): string {
  return JSON.stringify(exportObject, null, 2);
}
