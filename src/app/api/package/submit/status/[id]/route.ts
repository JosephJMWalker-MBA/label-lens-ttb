import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
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
    .where(eq(schema.submissionRevisions.submissionId, submissionId))
    .orderBy(asc(schema.submissionRevisions.revisionNumber));

  // 5. Verify revision HMAC signature to guarantee database integrity
  for (const rev of revisionsFromDb) {
    const isValid = verifyRevision(rev.canonicalJson, rev.integritySignature);
    if (!isValid) {
      return NextResponse.json(
        {
          error: {
            code: "REVISION_INTEGRITY_FAILED",
            message: "Submission revision integrity failed. Reload or contact support.",
          },
        },
        { status: 409 },
      );
    }
  }

  // Map revisions to exclude canonicalJson and integrity signatures from the
  // seller-facing response. Signatures remain server-side verification material,
  // not seller workflow data.
  const revisions = revisionsFromDb.map((rev: (typeof revisionsFromDb)[number]) => ({
    id: rev.id,
    revisionNumber: rev.revisionNumber,
    profileId: rev.profileId,
    profileVersion: rev.profileVersion,
    submittedBy: rev.submittedBy,
    submittedAt: rev.submittedAt,
  }));

  // 6. Fetch Submission Status Events
  const events = await db
    .select({
      status: schema.submissionStatusEvents.status,
      recordedAt: schema.submissionStatusEvents.recordedAt,
    })
    .from(schema.submissionStatusEvents)
    .where(eq(schema.submissionStatusEvents.submissionId, submissionId))
    .orderBy(asc(schema.submissionStatusEvents.recordedAt));

  const latestRevision = revisions.at(-1);
  const changeRequestRows =
    submission.currentStatus === "changes_requested" && latestRevision
      ? ((await db
          .select({
            revisionNumber: schema.agentDecisions.revisionNumber,
            rationale: schema.agentDecisions.rationale,
            recordedAt: schema.agentDecisions.recordedAt,
          })
          .from(schema.agentDecisions)
          .where(
            and(
              eq(schema.agentDecisions.submissionId, submissionId),
              eq(schema.agentDecisions.revisionId, latestRevision.id),
              eq(schema.agentDecisions.decisionType, "changes_requested"),
            ),
          )
          .limit(1)) as {
          revisionNumber: number;
          rationale: string;
          recordedAt: Date;
        }[])
      : [];

  const changeRequest = changeRequestRows[0] ?? null;

  return NextResponse.json({
    submissionId: submission.id,
    currentStatus: submission.currentStatus,
    submissionVersion: submission.version,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    revisions,
    events,
    feedback: {
      changesRequested: changeRequest
        ? {
            revisionNumber: changeRequest.revisionNumber,
            rationale: changeRequest.rationale,
            recordedAt: changeRequest.recordedAt,
          }
        : null,
    },
  });
}
