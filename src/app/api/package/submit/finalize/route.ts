import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
import { db, schema, isSQLite } from "@/db/client";
import { auth } from "@/lib/auth";
import { canonicalizeJson } from "@/lib/canonical";
import { signRevision } from "@/lib/integrity";
import { verifyAppendToken } from "@/server/append-token";
import { latestAnalysisIsCurrent } from "@/features/package-preparation/package-model";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";

// 1. Zod Schema Definitions for seller-agent-package.v1 validation
const PanelRoleSchema = z.enum(["front", "back", "neck", "side", "other"]);
const PanelRotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

const PackagePanelMetadataSchema = z.object({
  panelId: z.string().min(1),
  order: z.number().int().nonnegative(),
  role: PanelRoleSchema,
  displayName: z.string().min(1),
  mediaType: z.string().min(1),
  byteSize: z.number().int().positive(),
  checksumSha256: z.string().length(64),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  rotation: PanelRotationSchema,
  storageKey: z.string().min(1),
});

const SellerEvidenceRegionSchema = z.object({
  regionId: z.string().min(1),
  categoryId: z.string().min(1),
  panelId: z.string().min(1),
  unit: z.literal("normalized-panel-relative"),
  provenance: z.literal("seller-selected-region"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

const PackageCategoryDraftSchema = z.object({
  categoryId: z.string().min(1),
  decision: z.enum(["provided", "unresolved", "not_present"]),
  expectedValue: z.string(),
  regions: z.array(SellerEvidenceRegionSchema),
});

const PackagePanelMachineRunSchema = z.object({
  panelId: z.string().min(1),
  machineResultId: z.string().min(1),
  exportJson: z.string(),
  observations: z.record(z.any()),
});

const PackageCategoryAnalysisSchema = z.object({
  categoryId: z.string().min(1),
  state: z.enum(["clearly_readable", "needs_review", "not_found", "not_applicable"]),
  observedValue: z.string().nullable(),
  supportingPanelIds: z.array(z.string()),
  supportingRegionIds: z.array(z.string()),
  reason: z.string(),
});

const PackageAnalysisRunSchema = z.object({
  analysisRunId: z.string().min(1),
  sequence: z.number().int().positive(),
  sellerChangeSequence: z.number().int().nonnegative(),
  recordedAt: z.string(),
  panelRuns: z.array(PackagePanelMachineRunSchema),
  categories: z.array(PackageCategoryAnalysisSchema),
  readiness: z.enum(["needs_seller_review", "ready_for_agent_submission"]),
});

const SellerPackageChangeSchema = z.object({
  changeId: z.string().min(1),
  sequence: z.number().int().positive(),
  recordedAt: z.string(),
  action: z.string(),
  categoryId: z.string().optional(),
  panelId: z.string().optional(),
  regionId: z.string().optional(),
  detail: z.string(),
});

const SellerPackageDraftSchema = z.object({
  schemaVersion: z.literal("seller-package-draft.v1"),
  packageId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  profile: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
  }),
  panelDecisions: z.object({
    back: z.enum(["unresolved", "upload", "absent"]),
    additional: z.enum(["unresolved", "add", "none"]),
  }).optional(),
  panels: z.array(PackagePanelMetadataSchema),
  categories: z.array(PackageCategoryDraftSchema),
  sellerChangeHistory: z.array(SellerPackageChangeSchema),
  analysisRuns: z.array(PackageAnalysisRunSchema),
});

const SellerPackageExportSchema = z.object({
  exportSchemaVersion: z.literal("seller-agent-package.v1"),
  exportType: z.literal("seller-prepared-agent-package"),
  boundary: z.object({
    transmission: z.string().min(1),
    governmentApproval: z.literal(false),
    statement: z.string().min(1),
  }),
  submittedBy: z.string().email(),
  submittedAt: z.string(),
  receivingAgent: z.string().min(1),
  package: SellerPackageDraftSchema,
  readiness: z.literal("ready_for_agent_submission"),
  applicationBuild: z.any(),
  integrity: z.object({
    algorithm: z.literal("sha256"),
    scope: z.literal("canonical-package-payload"),
    value: z.string().length(64),
  }),
});

export async function POST(request: Request) {
  // 1. Authenticate user
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

  let rawBody: any;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 3. Schema validation using Zod
  const validationResult = SellerPackageExportSchema.safeParse(rawBody);
  if (!validationResult.success) {
    return NextResponse.json(
      { error: "Invalid schema validation", details: validationResult.error.issues },
      { status: 400 }
    );
  }

  const exportPayload = validationResult.data;

  // 4. Validate payload integrity signature
  const payloadWithoutIntegrity = { ...exportPayload } as any;
  delete payloadWithoutIntegrity.integrity;
  const canonicalString = canonicalizeJson(payloadWithoutIntegrity);
  const recomputedHash = createHash("sha256").update(canonicalString).digest("hex");

  if (recomputedHash !== exportPayload.integrity.value) {
    return NextResponse.json(
      { error: "Bad Request: Integrity value mismatch. Payload has been tampered with or corrupted." },
      { status: 400 }
    );
  }

  // 5. Enforce package currentness and readiness
  const draft = exportPayload.package as any;
  if (!latestAnalysisIsCurrent(draft)) {
    return NextResponse.json(
      { error: "Bad Request: Stale package. Analysis must be run on the latest draft before finalizing." },
      { status: 400 }
    );
  }

  const latestRun = draft.analysisRuns.at(-1);
  if (!latestRun || latestRun.readiness !== "ready_for_agent_submission") {
    return NextResponse.json(
      { error: "Bad Request: Package is not ready. Analysis status must be ready_for_agent_submission." },
      { status: 400 }
    );
  }

  // 6. Validate server provenance for all panel machine runs in the latest analysis run
  for (const panelRun of latestRun.panelRuns) {
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(panelRun.exportJson);
    } catch {
      return NextResponse.json(
        { error: "Bad Request: Panel run exportJson is invalid JSON." },
        { status: 400 }
      );
    }

    // Verify HMAC signature matches the machine result ID
    const verifyResult = verifyAppendToken(parsedJson.appendToken, panelRun.machineResultId);
    if (!verifyResult.ok) {
      return NextResponse.json(
        { error: "Bad Request: Invalid server provenance token on analysis panel run." },
        { status: 400 }
      );
    }

    // Recompute machineResultId to prove payload consistency
    const machinePayload = {
      schemaVersion: "package-panel-machine-record.v1",
      packageId: draft.packageId,
      panel: parsedJson.panel,
      sourceSha256: parsedJson.sourceSha256,
      observations: parsedJson.observations,
      versionManifest: parsedJson.versionManifest,
    };
    const recomputedId = createHash("sha256")
      .update(canonicalStringify(machinePayload))
      .digest("hex");

    if (recomputedId !== panelRun.machineResultId) {
      return NextResponse.json(
        { error: "Bad Request: Recomputed panel run ID mismatch." },
        { status: 400 }
      );
    }
  }

  const requestHash = createHash("sha256").update(canonicalizeJson(exportPayload)).digest("hex");
  const scopedKey = `${session.user.id}:finalize:${idempotencyKey}`;

  // Helper to parse idempotency key error
  const handleIdempotencyConflict = async () => {
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
    return null;
  };

  // Pre-transaction lookup to handle standard sequential retries
  const cachedResponse = await handleIdempotencyConflict();
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const submittedAtDate = new Date();
    const signature = signRevision(canonicalString);
    const revisionId = randomUUID();

    const receiptPayload = {
      receiptId: revisionId,
      submissionId: draft.packageId,
      revisionNumber: 1,
      submittedAt: submittedAtDate.toISOString(),
      integritySignature: signature,
      status: "waiting_for_agent_review",
    };

    // 7. Atomic transaction commit
    if (isSQLite) {
      db.transaction((tx: any) => {
        // Ensure submission doesn't already exist
        const existingSub = tx
          .select()
          .from(schema.submissions)
          .where(eq(schema.submissions.id, draft.packageId))
          .all();

        if (existingSub.length > 0) {
          throw new Error("SUBMISSION_ALREADY_EXISTS");
        }

        // Save Idempotency Record first to trigger unique constraint check concurrently
        tx.insert(schema.idempotencyRecords).values({
          key: scopedKey,
          requestHash: requestHash,
          responsePayload: JSON.stringify(receiptPayload),
          createdAt: submittedAtDate,
        }).run();

        // Create Submission record
        tx.insert(schema.submissions).values({
          id: draft.packageId,
          creatorId: session.user.id,
          currentStatus: "waiting_for_agent_review",
          isDemo: false,
          version: 1,
          createdAt: submittedAtDate,
          updatedAt: submittedAtDate,
        }).run();

        // Create SubmissionRevision record
        tx.insert(schema.submissionRevisions).values({
          id: revisionId,
          submissionId: draft.packageId,
          revisionNumber: 1,
          profileId: draft.profile.id,
          profileVersion: draft.profile.version,
          submittedBy: session.user.email,
          submittedAt: submittedAtDate,
          canonicalJson: canonicalString,
          integritySignature: signature,
        }).run();

        // Create SubmittedPanel records
        for (const panel of draft.panels) {
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

        // Create SellerEvidenceSnapshot records
        for (const ev of draft.categories) {
          tx.insert(schema.sellerEvidenceSnapshots).values({
            id: ev.evidenceId || randomUUID(),
            revisionId: revisionId,
            categoryId: ev.categoryId,
            decision: ev.decision,
            expectedValue: ev.expectedValue,
            regions: JSON.stringify(ev.regions || []),
          }).run();
        }

        // Create MachineAnalysisSnapshot records
        for (const run of latestRun.panelRuns) {
          tx.insert(schema.machineAnalysisSnapshots).values({
            id: randomUUID(),
            revisionId: revisionId,
            analysisRunId: latestRun.analysisRunId,
            sequence: latestRun.sequence,
            panelRuns: JSON.stringify(run.panelRuns || []),
            categories: JSON.stringify(latestRun.categories || []),
            readiness: latestRun.readiness,
            recordedAt: new Date(latestRun.recordedAt || Date.now()),
          }).run();
        }

        // Create SubmissionStatusEvent record
        tx.insert(schema.submissionStatusEvents).values({
          id: randomUUID(),
          submissionId: draft.packageId,
          status: "waiting_for_agent_review",
          actorId: session.user.id,
          actorRole: session.user.role,
          reasonComment: "Seller finalized workspace submission",
          recordedAt: submittedAtDate,
        }).run();
      });
    } else {
      await db.transaction(async (tx: any) => {
        const existingSub = await tx
          .select()
          .from(schema.submissions)
          .where(eq(schema.submissions.id, draft.packageId))
          .limit(1);

        if (existingSub.length > 0) {
          throw new Error("SUBMISSION_ALREADY_EXISTS");
        }

        // Save Idempotency Record
        await tx.insert(schema.idempotencyRecords).values({
          key: scopedKey,
          requestHash: requestHash,
          responsePayload: JSON.stringify(receiptPayload),
          createdAt: submittedAtDate,
        });

        // Create Submission record
        await tx.insert(schema.submissions).values({
          id: draft.packageId,
          creatorId: session.user.id,
          currentStatus: "waiting_for_agent_review",
          isDemo: false,
          version: 1,
          createdAt: submittedAtDate,
          updatedAt: submittedAtDate,
        });

        // Create SubmissionRevision record
        await tx.insert(schema.submissionRevisions).values({
          id: revisionId,
          submissionId: draft.packageId,
          revisionNumber: 1,
          profileId: draft.profile.id,
          profileVersion: draft.profile.version,
          submittedBy: session.user.email,
          submittedAt: submittedAtDate,
          canonicalJson: canonicalString,
          integritySignature: signature,
        });

        // Create SubmittedPanel records
        for (const panel of draft.panels) {
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

        // Create SellerEvidenceSnapshot records
        for (const ev of draft.categories) {
          await tx.insert(schema.sellerEvidenceSnapshots).values({
            id: ev.evidenceId || randomUUID(),
            revisionId: revisionId,
            categoryId: ev.categoryId,
            decision: ev.decision,
            expectedValue: ev.expectedValue,
            regions: JSON.stringify(ev.regions || []),
          });
        }

        // Create MachineAnalysisSnapshot records
        for (const run of latestRun.panelRuns) {
          await tx.insert(schema.machineAnalysisSnapshots).values({
            id: randomUUID(),
            revisionId: revisionId,
            analysisRunId: latestRun.analysisRunId,
            sequence: latestRun.sequence,
            panelRuns: JSON.stringify(run.panelRuns || []),
            categories: JSON.stringify(latestRun.categories || []),
            readiness: latestRun.readiness,
            recordedAt: new Date(latestRun.recordedAt || Date.now()),
          });
        }

        // Create SubmissionStatusEvent record
        await tx.insert(schema.submissionStatusEvents).values({
          id: randomUUID(),
          submissionId: draft.packageId,
          status: "waiting_for_agent_review",
          actorId: session.user.id,
          actorRole: session.user.role,
          reasonComment: "Seller finalized workspace submission",
          recordedAt: submittedAtDate,
        });
      });
    }

    return NextResponse.json(receiptPayload);
  } catch (err: any) {
    // 8. Catch unique key conflicts for concurrent idempotency safety
    const isDuplicate =
      err.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      err.code === "ER_DUP_ENTRY" ||
      err.errno === 1062 ||
      (err.message && err.message.includes("UNIQUE constraint failed"));

    if (isDuplicate) {
      const cachedResponse = await handleIdempotencyConflict();
      if (cachedResponse) return cachedResponse;
    }

    console.error("[Finalize Route Error]", err);
    if (err.message === "SUBMISSION_ALREADY_EXISTS") {
      return NextResponse.json({ error: "Conflict: Submission already finalized" }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal server error during finalization commit" }, { status: 500 });
  }
}
