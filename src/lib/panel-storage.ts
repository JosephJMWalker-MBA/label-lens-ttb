import fs from "node:fs";
import path from "node:path";

import {
  MAX_PANEL_ID_LENGTH,
  PANEL_IDENTITY_PATTERN,
  PANEL_STORAGE_CHECKSUM_LENGTH,
  PANEL_STORAGE_FILENAME_MAX_ASCII_BYTES,
  PANEL_STORAGE_KEY_MAX_LENGTH,
} from "@/features/package-preparation/panel-identity-constraints";

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
const SUBMISSION_ID_MAX_LENGTH = 255;
const REVISION_ID_MAX_LENGTH = 36;
const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const REVISION_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const PANEL_STORAGE_UNAVAILABLE = "PANEL_STORAGE_UNAVAILABLE" as const;

export type PanelStorageResult =
  | { ok: true; storageKey: string; durability: "local-non-production" | "configured-durable" }
  | { ok: false; error: typeof PANEL_STORAGE_UNAVAILABLE };

export class PanelStorageKeyInvariantError extends Error {
  constructor() {
    super("Generated panel storage key violates storage invariants.");
    this.name = "PanelStorageKeyInvariantError";
  }
}

export type GeneratedPanelStorageKeyValidation =
  { ok: true; kind: "initial" | "resubmission" } | { ok: false };

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

function isAscii(value: string): boolean {
  return Buffer.byteLength(value, "utf8") === value.length;
}

function isToken(
  value: string,
  maxLength: number,
  pattern: RegExp,
  { rejectDotDot }: { rejectDotDot: boolean },
): boolean {
  return (
    value.length > 0 &&
    value.length <= maxLength &&
    isAscii(value) &&
    pattern.test(value) &&
    (!rejectDotDot || !value.includes(".."))
  );
}

function parsePanelFilename(filename: string): { panelId: string; checksumSha256: string } | null {
  if (
    filename.length === 0 ||
    !isAscii(filename) ||
    Buffer.byteLength(filename, "utf8") > PANEL_STORAGE_FILENAME_MAX_ASCII_BYTES
  ) {
    return null;
  }

  const separator = filename.length - PANEL_STORAGE_CHECKSUM_LENGTH - 1;
  if (separator <= 0 || filename[separator] !== "-") return null;

  const panelId = filename.slice(0, separator);
  const checksumSha256 = filename.slice(separator + 1);
  if (
    !isToken(panelId, MAX_PANEL_ID_LENGTH, PANEL_IDENTITY_PATTERN, { rejectDotDot: true }) ||
    !SHA256_PATTERN.test(checksumSha256)
  ) {
    return null;
  }

  return { panelId, checksumSha256 };
}

export function validateGeneratedPanelStorageKey(
  storageKey: string,
): GeneratedPanelStorageKeyValidation {
  if (
    typeof storageKey !== "string" ||
    storageKey.length === 0 ||
    storageKey.length > PANEL_STORAGE_KEY_MAX_LENGTH ||
    !isAscii(storageKey)
  ) {
    return { ok: false };
  }

  const parts = storageKey.split("/");
  if (parts.includes("") || parts[0] !== "submissions") return { ok: false };

  if (
    parts.length === 4 &&
    isToken(parts[1], SUBMISSION_ID_MAX_LENGTH, SUBMISSION_ID_PATTERN, { rejectDotDot: true }) &&
    parts[2] === "panels" &&
    parsePanelFilename(parts[3])
  ) {
    return { ok: true, kind: "initial" };
  }

  if (
    parts.length === 6 &&
    isToken(parts[1], SUBMISSION_ID_MAX_LENGTH, SUBMISSION_ID_PATTERN, { rejectDotDot: true }) &&
    parts[2] === "revisions" &&
    isToken(parts[3], REVISION_ID_MAX_LENGTH, REVISION_ID_PATTERN, { rejectDotDot: true }) &&
    parts[4] === "panels" &&
    parsePanelFilename(parts[5])
  ) {
    return { ok: true, kind: "resubmission" };
  }

  return { ok: false };
}

function assertGeneratedPanelStorageKey(storageKey: string): void {
  if (!validateGeneratedPanelStorageKey(storageKey).ok) {
    throw new PanelStorageKeyInvariantError();
  }
}

function resolveStoragePath(root: string, storageKey: string): string | null {
  const resolvedRoot = path.resolve(root);
  const filePath = path.resolve(resolvedRoot, storageKey);
  if (filePath === resolvedRoot || !filePath.startsWith(resolvedRoot + path.sep)) return null;
  return filePath;
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
  const storageKey = `submissions/${packageId}/panels/${panelId}-${checksumSha256}`;
  assertGeneratedPanelStorageKey(storageKey);
  return storageKey;
}

/**
 * Compute a resubmission storage key with a server-generated child revision
 * namespace. Concurrent losers clean up only their own namespace, so cleanup can
 * never delete another request's committed assets for the same
 * packageId/panelId/checksum.
 */
export function resubmissionPanelStorageKey(
  packageId: string,
  childRevisionId: string,
  panelId: string,
  checksumSha256: string,
): string {
  const storageKey = `submissions/${packageId}/revisions/${childRevisionId}/panels/${panelId}-${checksumSha256}`;
  assertGeneratedPanelStorageKey(storageKey);
  return storageKey;
}

/** Persist verified panel bytes under a server-owned storage key. */
export function persistPanelAsset(storageKey: string, bytes: Buffer): PanelStorageResult {
  if (!validateGeneratedPanelStorageKey(storageKey).ok) {
    return { ok: false, error: PANEL_STORAGE_UNAVAILABLE };
  }
  const resolved = resolveStorageRoot();
  if (!resolved.ok) {
    return { ok: false, error: PANEL_STORAGE_UNAVAILABLE };
  }
  const filePath = resolveStoragePath(resolved.root, storageKey);
  if (!filePath) return { ok: false, error: PANEL_STORAGE_UNAVAILABLE };
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, bytes);
  } catch {
    return { ok: false, error: PANEL_STORAGE_UNAVAILABLE };
  }
  return { ok: true, storageKey, durability: resolved.durability };
}

/** Best-effort deletion for uncommitted assets owned by the current attempt. */
export function deletePanelAsset(storageKey: string): void {
  const resolved = resolveStorageRoot();
  if (!resolved.ok) return;

  const root = path.resolve(resolved.root);
  const filePath = path.resolve(root, storageKey);
  if (filePath === root || !filePath.startsWith(root + path.sep)) return;
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup only; callers must not convert this into a user-visible
    // storage or transaction error.
  }
}

export type PanelReadResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; error: "PANEL_STORAGE_UNAVAILABLE" | "PANEL_NOT_FOUND" | "PANEL_PATH_INVALID" };

/**
 * Read durable panel bytes for a server-owned storage key. The key is resolved
 * strictly under the storage root — a resolved path that escapes the root (path
 * traversal) is rejected, and a missing file is reported without revealing the
 * server filesystem layout.
 */
export function readPanelAsset(storageKey: string): PanelReadResult {
  const resolved = resolveStorageRoot();
  if (!resolved.ok) return { ok: false, error: "PANEL_STORAGE_UNAVAILABLE" };

  const root = path.resolve(resolved.root);
  const filePath = path.resolve(root, storageKey);
  // The resolved path must stay within the storage root.
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return { ok: false, error: "PANEL_PATH_INVALID" };
  }
  try {
    return { ok: true, bytes: fs.readFileSync(filePath) };
  } catch {
    return { ok: false, error: "PANEL_NOT_FOUND" };
  }
}
