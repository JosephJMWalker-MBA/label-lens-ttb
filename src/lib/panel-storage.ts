import fs from "node:fs";
import path from "node:path";

/**
 * Durable panel-asset storage boundary.
 *
 * The finalize route persists verified panel bytes here in the same bounded
 * operation that issues a review-queue receipt. The storage key is always
 * server-owned and derived from the authenticated package + server-recomputed
 * checksum; a client-supplied storage reference is never trusted.
 *
 * Truthful durability boundary:
 *   - Development/test: bytes are written to a clearly non-production local
 *     directory under the project (`.local/storage`). This is NOT durable
 *     object storage and must never be presented as such.
 *   - Production: a durable storage backend must be explicitly configured via
 *     `LABEL_LENS_STORAGE_DIR` (or a future object-store adapter). If none is
 *     configured, storage FAILS CLOSED — the route must not issue a receipt that
 *     points at assets it could not durably persist. We do not claim R2 (or any
 *     object-store) durability unless it is actually configured.
 */

const LOCAL_DEV_STORAGE_DIR = ".local/storage";

export const PANEL_STORAGE_UNAVAILABLE = "PANEL_STORAGE_UNAVAILABLE" as const;

export type PanelStorageResult =
  | { ok: true; storageKey: string; durability: "local-non-production" | "configured-durable" }
  | { ok: false; error: typeof PANEL_STORAGE_UNAVAILABLE };

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Resolve the storage root, or fail closed in production when none is configured.
 * The returned `durability` label is truthful about what was actually used.
 */
function resolveStorageRoot():
  | { ok: true; root: string; durability: "local-non-production" | "configured-durable" }
  | { ok: false } {
  const configured = process.env.LABEL_LENS_STORAGE_DIR;
  if (configured && configured.trim() !== "") {
    return { ok: true, root: configured, durability: "configured-durable" };
  }
  if (isProduction()) {
    // Fail closed: never write review assets to an ephemeral local path in production.
    return { ok: false };
  }
  return {
    ok: true,
    root: path.join(process.cwd(), LOCAL_DEV_STORAGE_DIR),
    durability: "local-non-production",
  };
}

/**
 * Compute the server-owned durable storage key for a panel. Never derived from
 * any client-supplied path.
 */
export function panelStorageKey(
  packageId: string,
  panelId: string,
  checksumSha256: string,
): string {
  return `submissions/${packageId}/panels/${panelId}-${checksumSha256}`;
}

/** Persist verified panel bytes under a server-owned storage key. */
export function persistPanelAsset(storageKey: string, bytes: Buffer): PanelStorageResult {
  const resolved = resolveStorageRoot();
  if (!resolved.ok) {
    return { ok: false, error: PANEL_STORAGE_UNAVAILABLE };
  }
  const filePath = path.join(resolved.root, storageKey);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, bytes);
  } catch {
    return { ok: false, error: PANEL_STORAGE_UNAVAILABLE };
  }
  return { ok: true, storageKey, durability: resolved.durability };
}
