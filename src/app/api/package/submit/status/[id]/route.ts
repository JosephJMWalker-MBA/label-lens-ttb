import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // 1. Authenticate user
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: submissionId } = await params;

  if (!submissionId) {
    return NextResponse.json({ error: "Submission ID is required" }, { status: 400 });
  }

  // 2. Fetch Submission details
  const result = await db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, submissionId))
    .limit(1);

  if (result.length === 0) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const submission = result[0];

  // 3. Enforce Owner-Only Access for Sellers
  // If the authenticated user is a seller, they can only read their own submissions.
  if (session.user.role === "seller" && submission.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden: Access restricted to owner" }, { status: 403 });
  }

  // 4. Fetch Submission Revisions
  const revisions = await db
    .select({
      id: schema.submissionRevisions.id,
      revisionNumber: schema.submissionRevisions.revisionNumber,
      profileId: schema.submissionRevisions.profileId,
      profileVersion: schema.submissionRevisions.profileVersion,
      submittedBy: schema.submissionRevisions.submittedBy,
      submittedAt: schema.submissionRevisions.submittedAt,
      integritySignature: schema.submissionRevisions.integritySignature,
    })
    .from(schema.submissionRevisions)
    .where(eq(schema.submissionRevisions.submissionId, submissionId));

  // 5. Fetch Submission Status Events
  const events = await db
    .select({
      id: schema.submissionStatusEvents.id,
      status: schema.submissionStatusEvents.status,
      actorRole: schema.submissionStatusEvents.actorRole,
      reasonComment: schema.submissionStatusEvents.reasonComment,
      recordedAt: schema.submissionStatusEvents.recordedAt,
    })
    .from(schema.submissionStatusEvents)
    .where(eq(schema.submissionStatusEvents.submissionId, submissionId));

  return NextResponse.json({
    submissionId: submission.id,
    currentStatus: submission.currentStatus,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    revisions,
    events,
  });
}
