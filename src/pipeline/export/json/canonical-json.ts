import { createHash } from "node:crypto";

import { canonicalStringify } from "./canonical-stringify";
import type { ExportPayload, PrecheckJsonExport } from "./json-export.types";

/**
 * Canonical, deterministic serialization for the JSON export.
 *
 * `canonicalStringify` now lives in `./canonical-stringify`, which carries no
 * Node-only import, so the browser can share the identical serialization. It is
 * re-exported here so every existing importer is unaffected. There is still
 * exactly one canonical form — that is the whole point of moving it.
 */
export { canonicalStringify };

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
