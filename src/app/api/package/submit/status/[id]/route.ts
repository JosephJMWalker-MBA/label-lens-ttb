import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";

export const runtime = "nodejs";
import { verifyRevision } from "@/lib/integrity";
import { requireSubmissionOwnerOrRole } from "@/server/submissions/access";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: submissionId } = await params;

  // Seller owner-only in this slice (no roles are allowed via this route; agent
  // access is served by the separate agent detail route). Missing session → 401;
  // a missing or non-owned submission → an identical 404 (no existence leak).
  const access = await requireSubmissionOwnerOrRole(request, submissionId, []);
  if (!access.ok) return access.response;
  const submission = access.submission;

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
        {
          error:
            "Internal Server Error: Database integrity check failed. Submission data has been tampered with or corrupted.",
        },
        { status: 500 },
      );
    }
  }

  // Map revisions to exclude canonicalJson from client response
  const revisions = revisionsFromDb.map((rev: (typeof revisionsFromDb)[number]) => ({
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
