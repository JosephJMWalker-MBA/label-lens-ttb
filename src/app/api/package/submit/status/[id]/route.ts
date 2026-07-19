import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
import { verifyRevision } from "@/lib/integrity";

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

  // 3. Strictly owner-only authorization check
  if (submission.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden: Access restricted to owner" }, { status: 403 });
  }

  // 4. Fetch Submission Revisions (including canonicalJson for integrity check)
  const revisionsFromDb = await db
    .select({
      id: schema.submissionRevisions.id,
      revisionNumber: schema.submissionRevisions.revisionNumber,
      profileId: schema.submissionRevisions.profileId,
      profileVersion: schema.submissionRevisions.profileVersion,
      submittedBy: schema.submissionRevisions.submittedBy,
      submittedAt: schema.submissionRevisions.submittedAt,
      canonicalJson: schema.submissionRevisions.canonicalJson,
      integritySignature: schema.submissionRevisions.integritySignature,
    })
    .from(schema.submissionRevisions)
    .where(eq(schema.submissionRevisions.submissionId, submissionId));

  // 5. Verify revision HMAC signature to guarantee database integrity
  for (const rev of revisionsFromDb) {
    const isValid = verifyRevision(rev.canonicalJson, rev.integritySignature);
    if (!isValid) {
      return NextResponse.json(
        { error: "Internal Server Error: Database integrity check failed. Submission data has been tampered with or corrupted." },
        { status: 500 }
      );
    }
  }

  // Map revisions to exclude canonicalJson from client response
  const revisions = revisionsFromDb.map((rev) => ({
    id: rev.id,
    revisionNumber: rev.revisionNumber,
    profileId: rev.profileId,
    profileVersion: rev.profileVersion,
    submittedBy: rev.submittedBy,
    submittedAt: rev.submittedAt,
    integritySignature: rev.integritySignature,
  }));

  // 6. Fetch Submission Status Events
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
