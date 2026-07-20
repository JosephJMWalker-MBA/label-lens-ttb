import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireApiRole } from "@/server/auth/guards";
import { isValidSubmissionId } from "@/server/submissions/access";
import { resolvePanelStorageKey } from "@/server/submissions/detail";
import { readPanelAsset } from "@/lib/panel-storage";

const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function isValidId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    /^[A-Za-z0-9._-]+$/.test(value)
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; panelId: string }> },
) {
  // Agent/admin only.
  const auth = await requireApiRole(request, ["agent", "admin"]);
  if (!auth.ok) return auth.response;

  const { id, panelId } = await params;
  // Reject malformed ids/params up front (also blocks path-traversal-shaped input).
  if (!isValidSubmissionId(id) || !isValidId(panelId)) {
    return new NextResponse(null, { status: 404 });
  }

  // Confirm the panel belongs to the requested submission before resolving storage.
  const panel = await resolvePanelStorageKey(id, panelId);
  if (!panel) return new NextResponse(null, { status: 404 });

  const contentType = ALLOWED_CONTENT_TYPES.has(panel.mediaType)
    ? panel.mediaType
    : "application/octet-stream";

  const read = readPanelAsset(panel.storageKey);
  if (!read.ok) {
    // 404 for a missing/invalid path; never reveal the server filesystem layout.
    const status = read.error === "PANEL_STORAGE_UNAVAILABLE" ? 500 : 404;
    return new NextResponse(null, { status });
  }

  return new NextResponse(new Uint8Array(read.bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(read.bytes.byteLength),
      // Private review asset: do not let shared caches store it.
      "Cache-Control": "private, no-store",
    },
  });
}
