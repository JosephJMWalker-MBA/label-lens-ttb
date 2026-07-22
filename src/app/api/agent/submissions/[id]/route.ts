import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireApiRole } from "@/server/auth/guards";
import { isValidSubmissionId } from "@/server/submissions/access";
import { buildSubmissionDetail } from "@/server/submissions/detail";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Agent/admin only. Sellers and anonymous callers never reach agent detail.
  const auth = await requireApiRole(request, ["agent", "admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  // A malformed id and an inaccessible id both return an identical 404.
  if (!isValidSubmissionId(id)) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  const result = await buildSubmissionDetail(id);
  if (!result.ok) {
    if (result.reason === "integrity_failed") {
      // Fail closed without leaking internal tamper details.
      return NextResponse.json(
        {
          error: {
            code: "REVISION_INTEGRITY_FAILED",
            message: "Submission revision integrity failed. Reload or contact an administrator.",
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  return NextResponse.json(result.view);
}
