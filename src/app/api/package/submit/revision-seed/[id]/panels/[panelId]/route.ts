import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { readPanelAsset } from "@/lib/panel-storage";
import { readSessionFromHeaders } from "@/server/auth/guards";
import { isValidSubmissionId } from "@/server/submissions/access";
import { resolveRevisionSeedPanelAsset } from "@/server/submissions/revision-seed";

const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function isValidPanelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    /^[A-Za-z0-9._-]+$/.test(value)
  );
}

function conflict(code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status: 409 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; panelId: string }> },
) {
  const user = await readSessionFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }

  const { id, panelId } = await params;
  if (!isValidSubmissionId(id) || !isValidPanelId(panelId)) {
    return new NextResponse(null, { status: 404 });
  }

  const panel = await resolveRevisionSeedPanelAsset({
    submissionId: id,
    sellerId: user.id,
    sellerRole: user.role,
    panelId,
  });
  if (!panel.ok) {
    switch (panel.reason) {
      case "not_found":
        return new NextResponse(null, { status: 404 });
      case "not_seller":
        return NextResponse.json({ error: "Seller access required." }, { status: 403 });
      case "not_changes_requested":
        return conflict("RESUBMISSION_NOT_ALLOWED", "Seller changes are not currently requested.");
      case "integrity_failed":
        return conflict(
          "REVISION_INTEGRITY_FAILED",
          "Submission revision integrity failed. Reload or contact support.",
        );
      case "change_request_missing":
        return conflict(
          "CHANGE_REQUEST_NOT_FOUND",
          "No requested-change decision is available for the latest revision.",
        );
      case "change_request_already_answered":
        return conflict(
          "CHANGE_REQUEST_ALREADY_ANSWERED",
          "The latest requested-change decision already has a seller response.",
        );
    }
  }

  const contentType = ALLOWED_CONTENT_TYPES.has(panel.mediaType)
    ? panel.mediaType
    : "application/octet-stream";
  const read = readPanelAsset(panel.storageKey);
  if (!read.ok) {
    return new NextResponse(null, {
      status: read.error === "PANEL_STORAGE_UNAVAILABLE" ? 500 : 404,
    });
  }

  return new NextResponse(new Uint8Array(read.bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(read.bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
