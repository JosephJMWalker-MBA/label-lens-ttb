import "server-only";

import {
  MAX_PANEL_ID_LENGTH,
  PANEL_IDENTITY_PATTERN,
} from "@/features/package-preparation/panel-identity-constraints";

export const PANEL_IDENTITY_MAX_LENGTH = MAX_PANEL_ID_LENGTH;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type PanelIdentityValidation =
  { ok: true } | { ok: false; code: "INVALID_PANEL_ID" | "DUPLICATE_PANEL_ID"; message: string };

export function validatePanelIdentity(value: unknown): PanelIdentityValidation {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > PANEL_IDENTITY_MAX_LENGTH ||
    !PANEL_IDENTITY_PATTERN.test(value) ||
    value.includes("..")
  ) {
    return {
      ok: false,
      code: "INVALID_PANEL_ID",
      message: "Panel IDs must be bounded path-safe tokens.",
    };
  }
  return { ok: true };
}

export function validatePanelIdentityList(panelIds: unknown[]): PanelIdentityValidation {
  const seen = new Set<string>();
  for (const panelId of panelIds) {
    const valid = validatePanelIdentity(panelId);
    if (!valid.ok) return valid;
    const value = panelId as string;
    if (seen.has(value)) {
      return { ok: false, code: "DUPLICATE_PANEL_ID", message: "Panel IDs must be unique." };
    }
    seen.add(value);
  }
  return { ok: true };
}

export type PanelSourceIdentityResult =
  | { ok: true; panelId: string; assetPanelId: string }
  | { ok: false; reason: "panel_identity_inconsistent" };

export function reconcilePanelSourceIdentity(args: {
  submissionId: string;
  revisionId: string;
  revisionNumber: number;
  storedPanelId: string;
  storageKey: string;
  checksumSha256: string;
}): PanelSourceIdentityResult {
  if (!validatePanelIdentity(args.storedPanelId).ok || !SHA256_PATTERN.test(args.checksumSha256)) {
    return { ok: false, reason: "panel_identity_inconsistent" };
  }

  const checksumSuffix = `-${args.checksumSha256}`;
  if (!args.storageKey.endsWith(checksumSuffix)) {
    return { ok: false, reason: "panel_identity_inconsistent" };
  }

  const prefix =
    args.revisionNumber === 1
      ? `submissions/${args.submissionId}/panels/`
      : `submissions/${args.submissionId}/revisions/${args.revisionId}/panels/`;
  if (!args.storageKey.startsWith(prefix)) {
    return { ok: false, reason: "panel_identity_inconsistent" };
  }

  const panelId = args.storageKey.slice(prefix.length, -checksumSuffix.length);
  if (!validatePanelIdentity(panelId).ok) {
    return { ok: false, reason: "panel_identity_inconsistent" };
  }

  return { ok: true, panelId, assetPanelId: args.storedPanelId };
}
