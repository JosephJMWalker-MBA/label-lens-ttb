import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema, isSQLite } from "@/db/client";
import { auth } from "@/lib/auth";
import { canonicalizeJson } from "@/lib/canonical";
import { signRevision } from "@/lib/integrity";

export async function POST(request: Request) {
  // 1. Authenticate the user and verify role
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || !session.user || session.user.role !== "seller") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate Idempotency header
  const idempotencyKey = request.headers.get("X-Idempotency-Key");
  if (!idempotencyKey) {
    return NextResponse.json({ error: "X-Idempotency-Key header is required" }, { status: 400 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 3. Validate minimal payload constraints
  if (!payload.packageId || !payload.profileId || !payload.profileVersion) {
    return NextResponse.json(
      { error: "Missing required fields: packageId, profileId, profileVersion" },
      { status: 400 }
    );
  }

  const canonicalString = canonicalizeJson(payload);
  const requestHash = createHash("sha256").update(canonicalString).digest("hex");
  const scopedKey = `${session.user.id}:finalize:${idempotencyKey}`;

  try {
    // 4. Check idempotency records
    const existing = await db
      .select()
      .from(schema.idempotencyRecords)
      .where(eq(schema.idempotencyRecords.key, scopedKey))
      .limit(1);

    if (existing.length > 0) {
      if (existing[0].requestHash !== requestHash) {
        return NextResponse.json(
          { error: "Bad Request: Idempotency key reused with different request payload" },
          { status: 400 }
        );
      }
      return NextResponse.json(JSON.parse(existing[0].responsePayload));
    }

    const submittedAtDate = new Date();
    const signature = signRevision(canonicalString);
    const revisionId = randomUUID();

    const receiptPayload = {
      receiptId: revisionId,
      submissionId: payload.packageId,
      revisionNumber: 1,
      submittedAt: submittedAtDate.toISOString(),
      integritySignature: signature,
      status: "waiting_for_agent_review",
    };

    // 5. Execute transaction (durable commit before receipt is returned)
    if (isSQLite) {
      // Local SQLite Synchronous Transaction
      db.transaction((tx: any) => {
        // 5.a Check if submission ID exists
        const existingSub = tx
          .select()
          .from(schema.submissions)
          .where(eq(schema.submissions.id, payload.packageId))
          .all();

        if (existingSub.length > 0) {
          throw new Error("SUBMISSION_ALREADY_EXISTS");
        }

        // 5.b Create Submission record
        tx.insert(schema.submissions).values({
          id: payload.packageId,
          creatorId: session.user.id,
          currentStatus: "waiting_for_agent_review",
          isDemo: false,
          version: 1,
          createdAt: submittedAtDate,
          updatedAt: submittedAtDate,
        }).run();

        // 5.c Create SubmissionRevision record
        tx.insert(schema.submissionRevisions).values({
          id: revisionId,
          submissionId: payload.packageId,
          revisionNumber: 1,
          profileId: payload.profileId,
          profileVersion: payload.profileVersion,
          submittedBy: session.user.email,
          submittedAt: submittedAtDate,
          canonicalJson: canonicalString,
          integritySignature: signature,
        }).run();

        // 5.d Create SubmittedPanel records
        if (Array.isArray(payload.panels)) {
          for (const panel of payload.panels) {
            tx.insert(schema.submittedPanels).values({
              id: panel.panelId || randomUUID(),
              revisionId: revisionId,
              role: panel.role,
              displayName: panel.displayName,
              mediaType: panel.mediaType,
              byteSize: panel.byteSize,
              checksumSha256: panel.checksumSha256,
              width: panel.width,
              height: panel.height,
              rotation: panel.rotation,
              storageKey: panel.storageKey,
            }).run();
          }
        }

        // 5.e Create SellerEvidenceSnapshot records
        if (Array.isArray(payload.evidence)) {
          for (const ev of payload.evidence) {
            tx.insert(schema.sellerEvidenceSnapshots).values({
              id: ev.evidenceId || randomUUID(),
              revisionId: revisionId,
              categoryId: ev.categoryId,
              decision: ev.decision,
              expectedValue: ev.expectedValue,
              regions: JSON.stringify(ev.regions || []),
            }).run();
          }
        }

        // 5.f Create MachineAnalysisSnapshot records
        if (Array.isArray(payload.machineRuns)) {
          for (const run of payload.machineRuns) {
            tx.insert(schema.machineAnalysisSnapshots).values({
              id: run.analysisSnapshotId || randomUUID(),
              revisionId: revisionId,
              analysisRunId: run.analysisRunId,
              sequence: run.sequence || 1,
              panelRuns: JSON.stringify(run.panelRuns || []),
              categories: JSON.stringify(run.categories || []),
              readiness: run.readiness,
              recordedAt: new Date(run.recordedAt || Date.now()),
            }).run();
          }
        }

        // 5.g Create SubmissionStatusEvent record
        tx.insert(schema.submissionStatusEvents).values({
          id: randomUUID(),
          submissionId: payload.packageId,
          status: "waiting_for_agent_review",
          actorId: session.user.id,
          actorRole: session.user.role,
          reasonComment: "Seller finalized workspace submission",
          recordedAt: submittedAtDate,
        }).run();

        // 5.h Save Idempotency Record
        tx.insert(schema.idempotencyRecords).values({
          key: scopedKey,
          requestHash: requestHash,
          responsePayload: JSON.stringify(receiptPayload),
          createdAt: submittedAtDate,
        }).run();
      });
    } else {
      // Production MySQL Asynchronous Transaction
      await db.transaction(async (tx: any) => {
        // 5.a Check if submission ID exists
        const existingSub = await tx
          .select()
          .from(schema.submissions)
          .where(eq(schema.submissions.id, payload.packageId))
          .limit(1);

        if (existingSub.length > 0) {
          throw new Error("SUBMISSION_ALREADY_EXISTS");
        }

        // 5.b Create Submission record
        await tx.insert(schema.submissions).values({
          id: payload.packageId,
          creatorId: session.user.id,
          currentStatus: "waiting_for_agent_review",
          isDemo: false,
          version: 1,
          createdAt: submittedAtDate,
          updatedAt: submittedAtDate,
        });

        // 5.c Create SubmissionRevision record
        await tx.insert(schema.submissionRevisions).values({
          id: revisionId,
          submissionId: payload.packageId,
          revisionNumber: 1,
          profileId: payload.profileId,
          profileVersion: payload.profileVersion,
          submittedBy: session.user.email,
          submittedAt: submittedAtDate,
          canonicalJson: canonicalString,
          integritySignature: signature,
        });

        // 5.d Create SubmittedPanel records
        if (Array.isArray(payload.panels)) {
          for (const panel of payload.panels) {
            await tx.insert(schema.submittedPanels).values({
              id: panel.panelId || randomUUID(),
              revisionId: revisionId,
              role: panel.role,
              displayName: panel.displayName,
              mediaType: panel.mediaType,
              byteSize: panel.byteSize,
              checksumSha256: panel.checksumSha256,
              width: panel.width,
              height: panel.height,
              rotation: panel.rotation,
              storageKey: panel.storageKey,
            });
          }
        }

        // 5.e Create SellerEvidenceSnapshot records
        if (Array.isArray(payload.evidence)) {
          for (const ev of payload.evidence) {
            await tx.insert(schema.sellerEvidenceSnapshots).values({
              id: ev.evidenceId || randomUUID(),
              revisionId: revisionId,
              categoryId: ev.categoryId,
              decision: ev.decision,
              expectedValue: ev.expectedValue,
              regions: JSON.stringify(ev.regions || []),
            });
          }
        }

        // 5.f Create MachineAnalysisSnapshot records
        if (Array.isArray(payload.machineRuns)) {
          for (const run of payload.machineRuns) {
            await tx.insert(schema.machineAnalysisSnapshots).values({
              id: run.analysisSnapshotId || randomUUID(),
              revisionId: revisionId,
              analysisRunId: run.analysisRunId,
              sequence: run.sequence || 1,
              panelRuns: JSON.stringify(run.panelRuns || []),
              categories: JSON.stringify(run.categories || []),
              readiness: run.readiness,
              recordedAt: new Date(run.recordedAt || Date.now()),
            });
          }
        }

        // 5.g Create SubmissionStatusEvent record
        await tx.insert(schema.submissionStatusEvents).values({
          id: randomUUID(),
          submissionId: payload.packageId,
          status: "waiting_for_agent_review",
          actorId: session.user.id,
          actorRole: session.user.role,
          reasonComment: "Seller finalized workspace submission",
          recordedAt: submittedAtDate,
        });

        // 5.h Save Idempotency Record
        await tx.insert(schema.idempotencyRecords).values({
          key: scopedKey,
          requestHash: requestHash,
          responsePayload: JSON.stringify(receiptPayload),
          createdAt: submittedAtDate,
        });
      });
    }

    return NextResponse.json(receiptPayload);
  } catch (err: any) {
    console.error("[Finalize Route Error]", err);
    if (err.message === "SUBMISSION_ALREADY_EXISTS") {
      return NextResponse.json({ error: "Conflict: Submission already finalized" }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal server error during finalization commit" }, { status: 500 });
  }
}
