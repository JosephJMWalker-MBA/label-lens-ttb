import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { isValidSubmissionId } from "@/server/submissions/access";
import { readSessionFromHeaders } from "@/server/auth/guards";
import { buildRevisionSeedForSeller } from "@/server/submissions/revision-seed";

function controlledConflict(code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status: 409 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const request = _request;
  const user = await readSessionFromHeaders(request.headers);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "seller") {
    return NextResponse.json({ error: "Seller access required." }, { status: 403 });
  }

  const { id } = await params;
  if (!isValidSubmissionId(id)) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  const result = await buildRevisionSeedForSeller({
    submissionId: id,
    sellerId: user.id,
    sellerRole: user.role,
  });

  if (result.ok) return NextResponse.json(result.seed);
  switch (result.reason) {
    case "not_found":
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    case "not_seller":
      return NextResponse.json({ error: "Seller access required." }, { status: 403 });
    case "not_changes_requested":
      return controlledConflict(
        "RESUBMISSION_NOT_ALLOWED",
        "This submission is not currently waiting on seller changes.",
      );
    case "integrity_failed":
      return controlledConflict(
        "REVISION_INTEGRITY_FAILED",
        "Submission revision integrity failed. Reload or contact support.",
      );
    case "change_request_missing":
      return controlledConflict(
        "CHANGE_REQUEST_NOT_FOUND",
        "No requested-change decision is available for the latest revision.",
      );
    case "change_request_already_answered":
      return controlledConflict(
        "CHANGE_REQUEST_ALREADY_ANSWERED",
        "The latest requested-change decision already has a seller response.",
      );
    case "panel_identity_inconsistent":
      return controlledConflict(
        "PANEL_IDENTITY_INCONSISTENT",
        "A stored panel identity could not be reconciled safely. No revision draft was created.",
      );
  }
}
