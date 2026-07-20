import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

import { db, schema, isSQLite } from "@/db/client";
import { auth } from "@/lib/auth";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import { signRevision } from "@/lib/integrity";
import { verifyAppendToken } from "@/server/append-token";
import {
  latestAnalysisIsCurrent,
  packageReadyForAgentReview,
} from "@/features/package-preparation/package-model";
import {
  parseAgentReviewSubmission,
  LOCAL_DOWNLOAD_ONLY_TRANSMISSION,
  AGENT_REVIEW_TRANSMISSION,
} from "@/features/package-preparation/agent-submission-contract";
import { panelStorageKey, persistPanelAsset } from "@/lib/panel-storage";
import { detectImage } from "@/lib/image-signature";

/** Durable-asset ingest limits enforced server-side. */
const MAX_PANEL_BYTES = 15 * 1024 * 1024;
const MAX_PANEL_DIMENSION = 20000;

interface CachedIdempotencyRecord {
  requestHash: string;
  responsePayload: string;
}

export async function POST(request: Request) {
  // 1. Authenticate: inline session + role check (not middleware). Provisioned seller only.
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || session.user.role !== "seller") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Idempotency key, scoped by authenticated actor + action.
  const idempotencyKey = request.headers.get("X-Idempotency-Key");
  if (!idempotencyKey) {
    return NextResponse.json({ error: "X-Idempotency-Key header is required" }, { status: 400 });
  }
  const scopedKey = `finalize:${session.user.id}:${idempotencyKey}`;

  // 3. Parse the multipart submission (JSON envelope + panel blobs).
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const exportJsonStr = formData.get("packageExport");
  if (typeof exportJsonStr !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid packageExport form data field" },
      { status: 400 },
    );
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(exportJsonStr);
  } catch {
    return NextResponse.json({ error: "packageExport field is not valid JSON" }, { status: 400 });
  }

  // 4. Transmission-truth boundary: refuse the local-only export up front with a
  //    truthful, actionable message before generic schema validation.
  const rawBoundary = (rawPayload as { boundary?: { transmission?: unknown } })?.boundary;
  if (rawBoundary?.transmission === LOCAL_DOWNLOAD_ONLY_TRANSMISSION) {
    return NextResponse.json(
      {
        error:
          `Bad Request: Transmission type must be '${AGENT_REVIEW_TRANSMISSION}' for server submission. ` +
          `A 'local-download-only' export was never transmitted and cannot be uploaded directly.`,
      },
      { status: 400 },
    );
  }

  // 5. Validate against the ONE shared server-safe package parser.
  const parsed = parseAgentReviewSubmission(rawPayload);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Invalid schema validation", details: parsed.issues },
      { status: 400 },
    );
  }
  const exportPayload = parsed.value;
  const draft = exportPayload.package;

  // 6. Verify the client-declared integrity value against the canonical payload,
  //    hashed with the SAME canonicalization the merged model uses to sign it.
  //    Computed over the raw parsed payload (snapshots intact) minus integrity.
  const payloadForIntegrity = { ...(rawPayload as Record<string, unknown>) };
  delete payloadForIntegrity.integrity;
  const canonicalString = canonicalStringify(payloadForIntegrity);
  const recomputedHash = createHash("sha256").update(canonicalString).digest("hex");
  if (recomputedHash !== exportPayload.integrity.value) {
    return NextResponse.json(
      {
        error:
          "Bad Request: Integrity value mismatch. Payload has been tampered with or corrupted.",
      },
      { status: 400 },
    );
  }

  // 7. Enforce package currentness and readiness against the real model helpers.
  if (!latestAnalysisIsCurrent(draft)) {
    return NextResponse.json(
      {
        error:
          "Bad Request: Stale package. Analysis must be run on the latest draft before finalizing.",
      },
      { status: 400 },
    );
  }

  const latestRun = draft.analysisRuns.at(-1);
  if (!latestRun || !packageReadyForAgentReview(draft)) {
    return NextResponse.json(
      {
        error:
          "Bad Request: Package is not ready. Every machine-flagged category must be corrected or explicitly kept for human agent review.",
      },
      { status: 400 },
    );
  }

  // 8. Verify server-issued provenance for every machine result: recompute the
  //    machineResultId from the embedded record and verify the append token that
  //    only this server could have issued for that id.
  for (const panelRun of latestRun.panelRuns) {
    let parsedExport: {
      schemaVersion?: unknown;
      packageId?: unknown;
      panel?: unknown;
      sourceSha256?: unknown;
      observations?: unknown;
      versionManifest?: unknown;
      appendToken?: unknown;
    };
    try {
      parsedExport = JSON.parse(panelRun.exportJson);
    } catch {
      return NextResponse.json(
        { error: "Bad Request: Panel run exportJson is invalid JSON." },
        { status: 400 },
      );
    }

    // Recompute the machine result id to prove the record is internally self-consistent.
    const machinePayload = {
      schemaVersion: parsedExport.schemaVersion,
      packageId: parsedExport.packageId,
      panel: parsedExport.panel,
      sourceSha256: parsedExport.sourceSha256,
      observations: parsedExport.observations,
      versionManifest: parsedExport.versionManifest,
    };
    const recomputedMachineId = createHash("sha256")
      .update(canonicalStringify(machinePayload))
      .digest("hex");
    if (recomputedMachineId !== panelRun.machineResultId) {
      return NextResponse.json(
        {
          error:
            "Bad Request: Recomputed machine-result ID mismatch. Analysis record is inconsistent.",
        },
        { status: 400 },
      );
    }

    // Prove the server actually issued this result (provenance), not just self-consistency.
    const tokenCheck = verifyAppendToken(parsedExport.appendToken, panelRun.machineResultId);
    if (!tokenCheck.ok) {
      return NextResponse.json(
        { error: "Bad Request: Invalid server provenance token. Forged observation run detected." },
        { status: 400 },
      );
    }
  }

  // 9. Verify and durably persist each panel asset. Server owns the storage key;
  //    client-supplied storage references are never trusted. Fail closed if the
  //    durable store is unavailable so a receipt never points at missing assets.
  const verifiedPanels: Array<{
    panelId: string;
    role: string;
    displayName: string;
    mediaType: string;
    byteSize: number;
    checksumSha256: string;
    width: number;
    height: number;
    rotation: number;
    storageKey: string;
  }> = [];

  for (const panel of draft.panels) {
    const file = formData.get(panel.panelId);
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: `Bad Request: Missing uploaded file for panel ID ${panel.panelId}` },
        { status: 400 },
      );
    }

    const fileBytes = Buffer.from(await file.arrayBuffer());

    // Server enforces size limits; the byte length must also match the declared size.
    if (fileBytes.byteLength > MAX_PANEL_BYTES) {
      return NextResponse.json(
        {
          error: `Bad Request: Panel ${panel.displayName} exceeds the maximum allowed size of ${MAX_PANEL_BYTES} bytes.`,
        },
        { status: 400 },
      );
    }
    if (fileBytes.byteLength !== panel.byteSize) {
      return NextResponse.json(
        {
          error: `Bad Request: File size mismatch for panel ${panel.displayName}. Expected ${panel.byteSize} bytes, got ${fileBytes.byteLength}.`,
        },
        { status: 400 },
      );
    }

    // Server verifies the real (decoded) media type from the byte signature, not
    // the client-declared MIME, and enforces dimension limits.
    const detected = detectImage(fileBytes);
    if (!detected) {
      return NextResponse.json(
        {
          error: `Bad Request: Panel ${panel.displayName} is not a supported image (PNG, JPEG, or WebP).`,
        },
        { status: 400 },
      );
    }
    if (detected.mediaType !== panel.mediaType) {
      return NextResponse.json(
        {
          error: `Bad Request: Media type mismatch for panel ${panel.displayName}. Declared ${panel.mediaType}, decoded ${detected.mediaType}.`,
        },
        { status: 400 },
      );
    }
    if (detected.width !== undefined && detected.height !== undefined) {
      if (detected.width > MAX_PANEL_DIMENSION || detected.height > MAX_PANEL_DIMENSION) {
        return NextResponse.json(
          {
            error: `Bad Request: Panel ${panel.displayName} exceeds the maximum dimension of ${MAX_PANEL_DIMENSION}px.`,
          },
          { status: 400 },
        );
      }
      if (detected.width !== panel.width || detected.height !== panel.height) {
        return NextResponse.json(
          {
            error: `Bad Request: Dimension mismatch for panel ${panel.displayName}. Declared ${panel.width}x${panel.height}, decoded ${detected.width}x${detected.height}.`,
          },
          { status: 400 },
        );
      }
    }

    // Server recomputes the checksum; never trusts the client-declared one.
    const recomputedChecksum = createHash("sha256").update(fileBytes).digest("hex");
    if (recomputedChecksum !== panel.checksumSha256) {
      return NextResponse.json(
        {
          error: `Bad Request: Checksum mismatch for panel ${panel.displayName}. Expected ${panel.checksumSha256}, got ${recomputedChecksum}.`,
        },
        { status: 400 },
      );
    }

    // Server-owned storage key derived from authenticated package + recomputed checksum.
    const storageKey = panelStorageKey(draft.packageId, panel.panelId, recomputedChecksum);
    const stored = persistPanelAsset(storageKey, fileBytes);
    if (!stored.ok) {
      return NextResponse.json(
        { error: "Internal server error: durable panel storage is unavailable." },
        { status: 500 },
      );
    }

    verifiedPanels.push({
      panelId: panel.panelId,
      role: panel.role,
      displayName: panel.displayName,
      mediaType: panel.mediaType,
      byteSize: panel.byteSize,
      checksumSha256: recomputedChecksum,
      width: panel.width,
      height: panel.height,
      rotation: panel.rotation,
      storageKey: stored.storageKey,
    });
  }

  // 10. Server-authoritative receipt + revision fields. Nothing here is trusted
  //     from the client: revision id, timestamps, receipt status, and signature
  //     are all generated server-side.
  const requestHash = createHash("sha256").update(canonicalStringify(exportPayload)).digest("hex");
  const revisionId = randomUUID();
  const signature = signRevision(canonicalString);
  const recordedAt = new Date();

  const receiptPayload = {
    submissionId: draft.packageId,
    revisionId,
    revisionNumber: 1,
    status: "waiting_for_agent_review" as const,
    receivingAgent: exportPayload.receivingAgent,
    signature,
    recordedAt: recordedAt.toISOString(),
  };

  // Idempotency lookup: return a committed receipt only after confirming the
  // canonical request hash matches; a reused key with a different payload fails.
  // When recovering from a raced unique-key violation the winning commit may not
  // be visible on this pooled connection for a beat, so allow a bounded re-read.
  async function handleIdempotencyConflict(waitForCommit = false): Promise<NextResponse | null> {
    let existing: CachedIdempotencyRecord[] = [];
    const attempts = waitForCommit ? 12 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      existing = (await db
        .select({
          requestHash: schema.idempotencyRecords.requestHash,
          responsePayload: schema.idempotencyRecords.responsePayload,
        })
        .from(schema.idempotencyRecords)
        .where(eq(schema.idempotencyRecords.key, scopedKey))
        .limit(1)) as CachedIdempotencyRecord[];
      if (existing.length > 0) break;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 25));
    }

    if (existing.length === 0) return null;

    if (existing[0].requestHash !== requestHash) {
      return NextResponse.json(
        { error: "Bad Request: Idempotency key reused with a different request payload." },
        { status: 400 },
      );
    }
    try {
      return NextResponse.json(JSON.parse(existing[0].responsePayload), {
        headers: { "X-Idempotent-Replay": "true" },
      });
    } catch {
      return null;
    }
  }

  // Pre-transaction fast path for sequential retries.
  const preCheckResponse = await handleIdempotencyConflict();
  if (preCheckResponse) return preCheckResponse;

  try {
    if (isSQLite) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db.transaction((tx: any) => {
        const existingSub = tx
          .select()
          .from(schema.submissions)
          .where(eq(schema.submissions.id, draft.packageId))
          .limit(1)
          .all();
        if (existingSub.length > 0) {
          throw new Error("SUBMISSION_ALREADY_EXISTS");
        }

        // Idempotency record first: its unique key is the concurrency boundary.
        tx.insert(schema.idempotencyRecords)
          .values({
            key: scopedKey,
            requestHash,
            responsePayload: JSON.stringify(receiptPayload),
            createdAt: recordedAt,
          })
          .run();

        tx.insert(schema.submissions)
          .values({
            id: draft.packageId,
            creatorId: session.user.id,
            currentStatus: "waiting_for_agent_review",
            isDemo: false,
            version: 1,
            createdAt: recordedAt,
            updatedAt: recordedAt,
          })
          .run();

        tx.insert(schema.submissionRevisions)
          .values({
            id: revisionId,
            submissionId: draft.packageId,
            revisionNumber: 1,
            profileId: draft.profile.id,
            profileVersion: draft.profile.version,
            submittedBy: session.user.email,
            submittedAt: recordedAt,
            canonicalJson: canonicalString,
            integritySignature: signature,
          })
          .run();

        for (const panel of verifiedPanels) {
          tx.insert(schema.submittedPanels)
            .values({
              id: panel.panelId,
              revisionId,
              role: panel.role,
              displayName: panel.displayName,
              mediaType: panel.mediaType,
              byteSize: panel.byteSize,
              checksumSha256: panel.checksumSha256,
              width: panel.width,
              height: panel.height,
              rotation: panel.rotation,
              storageKey: panel.storageKey,
            })
            .run();
        }

        for (const ev of draft.categories) {
          tx.insert(schema.sellerEvidenceSnapshots)
            .values({
              id: randomUUID(),
              revisionId,
              categoryId: ev.categoryId,
              decision: ev.decision,
              expectedValue: ev.expectedValue,
              regions: JSON.stringify(ev.regions ?? []),
            })
            .run();
        }

        // Exactly one machine analysis snapshot, carrying the real panel runs + categories.
        tx.insert(schema.machineAnalysisSnapshots)
          .values({
            id: randomUUID(),
            revisionId,
            analysisRunId: latestRun.analysisRunId,
            sequence: latestRun.sequence,
            panelRuns: JSON.stringify(latestRun.panelRuns),
            categories: JSON.stringify(latestRun.categories),
            readiness: latestRun.readiness,
            recordedAt: new Date(latestRun.recordedAt),
          })
          .run();

        tx.insert(schema.submissionStatusEvents)
          .values({
            id: randomUUID(),
            submissionId: draft.packageId,
            status: "waiting_for_agent_review",
            actorId: session.user.id,
            actorRole: session.user.role,
            reasonComment: "Seller finalized workspace submission",
            recordedAt,
          })
          .run();
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.transaction(async (tx: any) => {
        const existingSub = await tx
          .select()
          .from(schema.submissions)
          .where(eq(schema.submissions.id, draft.packageId))
          .limit(1);
        if (existingSub.length > 0) {
          throw new Error("SUBMISSION_ALREADY_EXISTS");
        }

        await tx.insert(schema.idempotencyRecords).values({
          key: scopedKey,
          requestHash,
          responsePayload: JSON.stringify(receiptPayload),
          createdAt: recordedAt,
        });

        await tx.insert(schema.submissions).values({
          id: draft.packageId,
          creatorId: session.user.id,
          currentStatus: "waiting_for_agent_review",
          isDemo: false,
          version: 1,
          createdAt: recordedAt,
          updatedAt: recordedAt,
        });

        await tx.insert(schema.submissionRevisions).values({
          id: revisionId,
          submissionId: draft.packageId,
          revisionNumber: 1,
          profileId: draft.profile.id,
          profileVersion: draft.profile.version,
          submittedBy: session.user.email,
          submittedAt: recordedAt,
          canonicalJson: canonicalString,
          integritySignature: signature,
        });

        for (const panel of verifiedPanels) {
          await tx.insert(schema.submittedPanels).values({
            id: panel.panelId,
            revisionId,
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

        for (const ev of draft.categories) {
          await tx.insert(schema.sellerEvidenceSnapshots).values({
            id: randomUUID(),
            revisionId,
            categoryId: ev.categoryId,
            decision: ev.decision,
            expectedValue: ev.expectedValue,
            regions: JSON.stringify(ev.regions ?? []),
          });
        }

        await tx.insert(schema.machineAnalysisSnapshots).values({
          id: randomUUID(),
          revisionId,
          analysisRunId: latestRun.analysisRunId,
          sequence: latestRun.sequence,
          panelRuns: JSON.stringify(latestRun.panelRuns),
          categories: JSON.stringify(latestRun.categories),
          readiness: latestRun.readiness,
          recordedAt: new Date(latestRun.recordedAt),
        });

        await tx.insert(schema.submissionStatusEvents).values({
          id: randomUUID(),
          submissionId: draft.packageId,
          status: "waiting_for_agent_review",
          actorId: session.user.id,
          actorRole: session.user.role,
          reasonComment: "Seller finalized workspace submission",
          recordedAt,
        });
      });
    }

    return NextResponse.json(receiptPayload);
  } catch (err) {
    const errorObject = err as { code?: string; errno?: number; message?: string };

    // Drizzle wraps driver errors (e.g. DrizzleQueryError), so the real
    // unique-violation code/errno may live on a nested `cause`. Walk the chain.
    const isUniqueViolation = (): boolean => {
      let current: unknown = err;
      for (let depth = 0; current && depth < 5; depth++) {
        const e = current as { code?: string; errno?: number; message?: string; cause?: unknown };
        if (
          e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
          e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
          e.code === "ER_DUP_ENTRY" ||
          e.errno === 1062 ||
          (e.message?.includes("UNIQUE constraint failed") ?? false)
        ) {
          return true;
        }
        current = e.cause;
      }
      return false;
    };

    // Duplicate-key recovery: the unique constraint is the final concurrency
    // boundary. Return the committed response only after verifying request hash.
    const isDuplicate = isUniqueViolation();

    // Either a raced unique-key violation or the in-transaction existence guard
    // means another commit for this package won. For the same idempotency key
    // that is a successful replay; for a different key it is a genuine conflict.
    if (isDuplicate || errorObject.message === "SUBMISSION_ALREADY_EXISTS") {
      const cachedResponse = await handleIdempotencyConflict(true);
      if (cachedResponse) return cachedResponse;
    }

    if (errorObject.message === "SUBMISSION_ALREADY_EXISTS") {
      return NextResponse.json(
        { error: "Conflict: Submission already finalized" },
        { status: 409 },
      );
    }

    console.error("[Finalize Route Error]", err);
    return NextResponse.json(
      { error: "Internal server error during finalization commit" },
      { status: 500 },
    );
  }
}
