/* eslint-disable @typescript-eslint/no-explicit-any -- route uses shared Drizzle code across sync SQLite and async MySQL transaction handles */
import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, isSQLite, schema } from "@/db/client";
import {
  AGENT_REVIEW_TRANSMISSION,
  LOCAL_DOWNLOAD_ONLY_TRANSMISSION,
  parseAgentReviewSubmission,
} from "@/features/package-preparation/agent-submission-contract";
import {
  latestAnalysisIsCurrent,
  packageReadyForAgentReview,
} from "@/features/package-preparation/package-model";
import {
  parseRevisionResponseContext,
  type RevisionResponseContext,
} from "@/features/package-preparation/revision-context";
import { detectImage } from "@/lib/image-signature";
import { signRevision, verifyRevision } from "@/lib/integrity";
import {
  deletePanelAsset,
  persistPanelAsset,
  resubmissionPanelStorageKey,
} from "@/lib/panel-storage";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import { verifyAppendToken } from "@/server/append-token";
import { readSessionFromHeaders, type SessionUser } from "@/server/auth/guards";
import { validatePanelIdentityList } from "@/server/submissions/panel-identity";
import { isValidSubmissionId } from "@/server/submissions/access";

const MAX_PANEL_BYTES = 15 * 1024 * 1024;
const MAX_PANEL_DIMENSION = 20000;

interface IdempotencyRecord {
  requestHash: string;
  responsePayload: string;
}

interface VerifiedPanel {
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
}

interface ResubmitResponse {
  action: "resubmit_revision";
  submissionId: string;
  parentRevisionId: string;
  parentRevisionNumber: number;
  revisionId: string;
  revisionNumber: number;
  respondedToDecisionId: string;
  currentStatus: "waiting_for_agent_review";
  submissionVersion: number;
  recordedAt: string;
}

class ResubmitError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function mutationCount(result: unknown): number {
  const value = Array.isArray(result) ? result[0] : result;
  const candidate = value as { affectedRows?: number; rowsAffected?: number; changes?: number };
  return Number(candidate?.affectedRows ?? candidate?.rowsAffected ?? candidate?.changes ?? 0);
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const e = current as { code?: string; errno?: number; message?: string; cause?: unknown };
    if (
      e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      e.code === "ER_DUP_ENTRY" ||
      e.errno === 1062 ||
      (e.message?.includes("UNIQUE constraint failed") ?? false) ||
      (e.message?.includes("Duplicate entry") ?? false)
    ) {
      return true;
    }
    current = e.cause;
  }
  return false;
}

function isConcurrentTransactionRace(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const e = current as { code?: string; errno?: number; message?: string; cause?: unknown };
    if (
      e.code === "ER_LOCK_DEADLOCK" ||
      e.code === "ER_LOCK_WAIT_TIMEOUT" ||
      e.errno === 1213 ||
      e.errno === 1205 ||
      (e.message?.includes("Deadlock found") ?? false) ||
      (e.message?.includes("Lock wait timeout exceeded") ?? false)
    ) {
      return true;
    }
    current = e.cause;
  }
  return false;
}

function mightBeCommittedReplay(error: ResubmitError): boolean {
  return (
    error.code === "IDEMPOTENT_RESPONSE_NOT_VISIBLE" ||
    error.code === "RESUBMISSION_NOT_ALLOWED" ||
    error.code === "STALE_SUBMISSION_VERSION" ||
    error.code === "STALE_REVISION_CONTEXT" ||
    error.code === "CHANGE_REQUEST_ALREADY_ANSWERED"
  );
}

function requireIdempotencyKey(request: Request, user: SessionUser, submissionId: string) {
  const rawKey = request.headers.get("X-Idempotency-Key")?.trim();
  if (!rawKey) {
    return errorResponse(400, "IDEMPOTENCY_KEY_REQUIRED", "X-Idempotency-Key header is required.");
  }
  if (rawKey.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(rawKey)) {
    return errorResponse(
      400,
      "IDEMPOTENCY_KEY_INVALID",
      "X-Idempotency-Key must be a bounded path-safe token.",
    );
  }
  return `resubmit:${user.id}:${submissionId}:${rawKey}`;
}

async function readIdempotentResponse(
  scopedKey: string,
  requestHash: string,
  waitForCommit = false,
): Promise<NextResponse | null> {
  const attempts = waitForCommit ? 12 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rows = (await db
      .select({
        requestHash: schema.idempotencyRecords.requestHash,
        responsePayload: schema.idempotencyRecords.responsePayload,
      })
      .from(schema.idempotencyRecords)
      .where(eq(schema.idempotencyRecords.key, scopedKey))
      .limit(1)) as IdempotencyRecord[];

    const existing = rows[0];
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return errorResponse(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key was reused with a different canonical request hash.",
        );
      }
      try {
        return NextResponse.json(JSON.parse(existing.responsePayload), {
          headers: { "X-Idempotent-Replay": "true" },
        });
      } catch {
        return null;
      }
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return null;
}

function validatePackagePayload(rawPayload: unknown) {
  const rawBoundary = (rawPayload as { boundary?: { transmission?: unknown } })?.boundary;
  if (rawBoundary?.transmission === LOCAL_DOWNLOAD_ONLY_TRANSMISSION) {
    throw new ResubmitError(
      400,
      "INVALID_TRANSMISSION",
      `Transmission type must be '${AGENT_REVIEW_TRANSMISSION}' for server resubmission.`,
    );
  }

  const parsed = parseAgentReviewSubmission(rawPayload);
  if (!parsed.ok) {
    throw new ResubmitError(400, "INVALID_PACKAGE_SCHEMA", "packageExport failed validation.");
  }

  const exportPayload = parsed.value;
  const payloadForIntegrity = { ...(rawPayload as Record<string, unknown>) };
  delete payloadForIntegrity.integrity;
  const canonicalString = canonicalStringify(payloadForIntegrity);
  const recomputedHash = createHash("sha256").update(canonicalString).digest("hex");
  if (recomputedHash !== exportPayload.integrity.value) {
    throw new ResubmitError(400, "PACKAGE_INTEGRITY_MISMATCH", "Package integrity value mismatch.");
  }

  const draft = exportPayload.package;
  if (!latestAnalysisIsCurrent(draft)) {
    throw new ResubmitError(
      400,
      "STALE_ANALYSIS",
      "Analysis must be run on the latest revision draft before resubmission.",
    );
  }
  const latestRun = draft.analysisRuns.at(-1);
  if (!latestRun || !packageReadyForAgentReview(draft)) {
    throw new ResubmitError(
      400,
      "PACKAGE_NOT_READY",
      "Package is not ready for internal agent review.",
    );
  }

  const panelIdentityCheck = validatePanelIdentityList(draft.panels.map((panel) => panel.panelId));
  if (!panelIdentityCheck.ok) {
    throw new ResubmitError(400, panelIdentityCheck.code, panelIdentityCheck.message);
  }

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
      throw new ResubmitError(
        400,
        "INVALID_MACHINE_EXPORT",
        "Panel run exportJson is invalid JSON.",
      );
    }

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
      throw new ResubmitError(
        400,
        "MACHINE_RESULT_MISMATCH",
        "Analysis record is internally inconsistent.",
      );
    }
    const tokenCheck = verifyAppendToken(parsedExport.appendToken, panelRun.machineResultId);
    if (!tokenCheck.ok) {
      throw new ResubmitError(
        400,
        "MACHINE_PROVENANCE_INVALID",
        "Invalid server provenance token.",
      );
    }
  }

  return { exportPayload, draft, latestRun, canonicalString };
}

async function persistVerifiedPanels(args: {
  formData: FormData;
  packageId: string;
  childRevisionId: string;
  panels: ReturnType<typeof validatePackagePayload>["draft"]["panels"];
}): Promise<{ panels: VerifiedPanel[]; storageKeys: string[] }> {
  const panels: VerifiedPanel[] = [];
  const storageKeys: string[] = [];

  try {
    for (const panel of args.panels) {
      const file = args.formData.get(panel.panelId);
      if (!file || !(file instanceof Blob)) {
        throw new ResubmitError(
          400,
          "PANEL_FILE_MISSING",
          `Missing uploaded file for panel ID ${panel.panelId}.`,
        );
      }

      const fileBytes = Buffer.from(await file.arrayBuffer());
      if (fileBytes.byteLength > MAX_PANEL_BYTES) {
        throw new ResubmitError(400, "PANEL_TOO_LARGE", "Panel exceeds the maximum allowed size.");
      }
      if (fileBytes.byteLength !== panel.byteSize) {
        throw new ResubmitError(400, "PANEL_SIZE_MISMATCH", "Panel byte size mismatch.");
      }

      const detected = detectImage(fileBytes);
      if (!detected) {
        throw new ResubmitError(400, "PANEL_UNSUPPORTED_TYPE", "Panel is not a supported image.");
      }
      if (detected.mediaType !== panel.mediaType) {
        throw new ResubmitError(400, "PANEL_MEDIA_TYPE_MISMATCH", "Panel media type mismatch.");
      }
      if (detected.width !== undefined && detected.height !== undefined) {
        if (detected.width > MAX_PANEL_DIMENSION || detected.height > MAX_PANEL_DIMENSION) {
          throw new ResubmitError(
            400,
            "PANEL_DIMENSION_TOO_LARGE",
            "Panel dimensions are too large.",
          );
        }
        if (detected.width !== panel.width || detected.height !== panel.height) {
          throw new ResubmitError(400, "PANEL_DIMENSION_MISMATCH", "Panel dimensions mismatch.");
        }
      }

      const checksum = createHash("sha256").update(fileBytes).digest("hex");
      if (checksum !== panel.checksumSha256) {
        throw new ResubmitError(400, "PANEL_CHECKSUM_MISMATCH", "Panel checksum mismatch.");
      }

      const storageKey = resubmissionPanelStorageKey(
        args.packageId,
        args.childRevisionId,
        panel.panelId,
        checksum,
      );
      const stored = persistPanelAsset(storageKey, fileBytes);
      if (!stored.ok) {
        throw new ResubmitError(
          500,
          "PANEL_STORAGE_UNAVAILABLE",
          "Durable panel storage is unavailable.",
        );
      }
      storageKeys.push(storageKey);
      panels.push({
        panelId: panel.panelId,
        role: panel.role,
        displayName: panel.displayName,
        mediaType: panel.mediaType,
        byteSize: panel.byteSize,
        checksumSha256: checksum,
        width: panel.width,
        height: panel.height,
        rotation: panel.rotation,
        storageKey,
      });
    }
  } catch (error) {
    for (const storageKey of storageKeys) {
      deletePanelAsset(storageKey);
    }
    throw error;
  }

  return { panels, storageKeys };
}

function insertRevisionRowsSync(
  tx: any,
  args: {
    responseId: string;
    childRevisionId: string;
    signature: string;
    canonicalString: string;
    panels: VerifiedPanel[];
    user: SessionUser;
    requestHash: string;
    scopedKey: string;
    revisionContext: RevisionResponseContext;
    response: ResubmitResponse;
    recordedAt: Date;
    exportPayload: ReturnType<typeof validatePackagePayload>["exportPayload"];
    latestRun: ReturnType<typeof validatePackagePayload>["latestRun"];
  },
) {
  const context = loadAndValidateContextSync(tx, args);
  insertRowsSync(tx, { ...args, context });
}

async function insertRevisionRowsAsync(
  tx: any,
  args: Parameters<typeof insertRevisionRowsSync>[1],
) {
  const context = await loadAndValidateContextAsync(tx, args);
  await insertRowsAsync(tx, { ...args, context });
}

function loadAndValidateContextSync(tx: any, args: Parameters<typeof insertRevisionRowsSync>[1]) {
  const revisionContext = args.revisionContext;
  const submissionRows = tx
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, revisionContext.submissionId))
    .limit(1)
    .all();
  return validateLoadedContext({
    submission: submissionRows[0],
    revisionRows: tx
      .select()
      .from(schema.submissionRevisions)
      .where(eq(schema.submissionRevisions.submissionId, revisionContext.submissionId))
      .orderBy(desc(schema.submissionRevisions.revisionNumber))
      .limit(1)
      .all(),
    decisionRows: tx
      .select()
      .from(schema.agentDecisions)
      .where(
        and(
          eq(schema.agentDecisions.id, revisionContext.respondedToDecisionId),
          eq(schema.agentDecisions.submissionId, revisionContext.submissionId),
          eq(schema.agentDecisions.revisionId, revisionContext.baseRevisionId),
          eq(schema.agentDecisions.decisionType, "changes_requested"),
        ),
      )
      .limit(1)
      .all(),
    responseRows: tx
      .select({
        id: schema.submissionRevisionResponses.id,
        idempotencyRecordKey: schema.submissionRevisionResponses.idempotencyRecordKey,
      })
      .from(schema.submissionRevisionResponses)
      .where(
        eq(
          schema.submissionRevisionResponses.respondedToDecisionId,
          revisionContext.respondedToDecisionId,
        ),
      )
      .limit(1)
      .all(),
    claimRows: tx
      .select()
      .from(schema.reviewerClaims)
      .where(eq(schema.reviewerClaims.activeSubmissionId, revisionContext.submissionId))
      .limit(1)
      .all(),
    panelConflictRows:
      args.panels.length === 0
        ? []
        : tx
            .select({ id: schema.submittedPanels.id })
            .from(schema.submittedPanels)
            .where(
              inArray(
                schema.submittedPanels.id,
                args.panels.map((panel) => panel.panelId),
              ),
            )
            .all(),
    user: args.user,
    scopedKey: args.scopedKey,
    expectedSubmissionVersion: revisionContext.expectedSubmissionVersion,
    baseRevisionId: revisionContext.baseRevisionId,
    baseRevisionNumber: revisionContext.baseRevisionNumber,
  });
}

async function loadAndValidateContextAsync(
  tx: any,
  args: Parameters<typeof insertRevisionRowsSync>[1],
) {
  const revisionContext = args.revisionContext;
  const submissionRows = await tx
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, revisionContext.submissionId))
    .limit(1);
  const revisionRows = await tx
    .select()
    .from(schema.submissionRevisions)
    .where(eq(schema.submissionRevisions.submissionId, revisionContext.submissionId))
    .orderBy(desc(schema.submissionRevisions.revisionNumber))
    .limit(1);
  const decisionRows = await tx
    .select()
    .from(schema.agentDecisions)
    .where(
      and(
        eq(schema.agentDecisions.id, revisionContext.respondedToDecisionId),
        eq(schema.agentDecisions.submissionId, revisionContext.submissionId),
        eq(schema.agentDecisions.revisionId, revisionContext.baseRevisionId),
        eq(schema.agentDecisions.decisionType, "changes_requested"),
      ),
    )
    .limit(1);
  const responseRows = await tx
    .select({
      id: schema.submissionRevisionResponses.id,
      idempotencyRecordKey: schema.submissionRevisionResponses.idempotencyRecordKey,
    })
    .from(schema.submissionRevisionResponses)
    .where(
      eq(
        schema.submissionRevisionResponses.respondedToDecisionId,
        revisionContext.respondedToDecisionId,
      ),
    )
    .limit(1);
  const claimRows = await tx
    .select()
    .from(schema.reviewerClaims)
    .where(eq(schema.reviewerClaims.activeSubmissionId, revisionContext.submissionId))
    .limit(1);
  const panelConflictRows =
    args.panels.length === 0
      ? []
      : await tx
          .select({ id: schema.submittedPanels.id })
          .from(schema.submittedPanels)
          .where(
            inArray(
              schema.submittedPanels.id,
              args.panels.map((panel) => panel.panelId),
            ),
          );

  return validateLoadedContext({
    submission: submissionRows[0],
    revisionRows,
    decisionRows,
    responseRows,
    claimRows,
    panelConflictRows,
    user: args.user,
    scopedKey: args.scopedKey,
    expectedSubmissionVersion: revisionContext.expectedSubmissionVersion,
    baseRevisionId: revisionContext.baseRevisionId,
    baseRevisionNumber: revisionContext.baseRevisionNumber,
  });
}

function validateLoadedContext(args: {
  submission: any;
  revisionRows: any[];
  decisionRows: any[];
  responseRows: Array<{ id: string; idempotencyRecordKey: string }>;
  claimRows: any[];
  panelConflictRows: any[];
  user: SessionUser;
  scopedKey: string;
  expectedSubmissionVersion: number;
  baseRevisionId: string;
  baseRevisionNumber: number;
}) {
  const submission = args.submission;
  if (!submission || submission.creatorId !== args.user.id) {
    throw new ResubmitError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");
  }
  if (submission.currentStatus !== "changes_requested") {
    throw new ResubmitError(
      409,
      "RESUBMISSION_NOT_ALLOWED",
      "This submission is not currently waiting on seller changes.",
    );
  }
  if (submission.version !== args.expectedSubmissionVersion) {
    throw new ResubmitError(
      409,
      "STALE_SUBMISSION_VERSION",
      "Submission version changed. Reload before resubmitting.",
    );
  }

  const latestRevision = args.revisionRows[0];
  if (
    !latestRevision ||
    latestRevision.id !== args.baseRevisionId ||
    latestRevision.revisionNumber !== args.baseRevisionNumber
  ) {
    throw new ResubmitError(
      409,
      "STALE_REVISION_CONTEXT",
      "The requested-change revision is no longer the latest revision.",
    );
  }
  if (!verifyRevision(latestRevision.canonicalJson, latestRevision.integritySignature)) {
    throw new ResubmitError(
      409,
      "REVISION_INTEGRITY_FAILED",
      "The requested-change revision failed integrity verification.",
    );
  }

  const decision = args.decisionRows[0];
  if (!decision) {
    throw new ResubmitError(
      409,
      "CHANGE_REQUEST_NOT_FOUND",
      "No requested-change decision matches the exact base revision identity.",
    );
  }
  const existingResponse = args.responseRows[0];
  if (existingResponse) {
    throw new ResubmitError(
      409,
      existingResponse.idempotencyRecordKey === args.scopedKey
        ? "IDEMPOTENT_RESPONSE_NOT_VISIBLE"
        : "CHANGE_REQUEST_ALREADY_ANSWERED",
      existingResponse.idempotencyRecordKey === args.scopedKey
        ? "The matching idempotent response is not visible yet."
        : "The requested-change decision already has a seller response.",
    );
  }
  if (args.claimRows.length > 0) {
    throw new ResubmitError(
      409,
      "ACTIVE_CLAIM_CONFLICT",
      "An active reviewer claim exists. Reload before resubmitting.",
    );
  }
  if (args.panelConflictRows.length > 0) {
    throw new ResubmitError(
      409,
      "PANEL_ID_CONFLICT",
      "Revision panel IDs must be fresh for the child revision.",
    );
  }

  return {
    submission,
    latestRevision,
    decision,
    childRevisionNumber: latestRevision.revisionNumber + 1,
    nextSubmissionVersion: submission.version + 1,
  };
}

function insertRowsSync(
  tx: any,
  args: Parameters<typeof insertRevisionRowsSync>[1] & { context: any },
) {
  const { exportPayload, latestRun, context } = args;
  tx.insert(schema.submissionRevisions)
    .values({
      id: args.childRevisionId,
      submissionId: exportPayload.package.packageId,
      revisionNumber: context.childRevisionNumber,
      profileId: exportPayload.package.profile.id,
      profileVersion: exportPayload.package.profile.version,
      submittedBy: args.user.email,
      submittedAt: args.recordedAt,
      canonicalJson: args.canonicalString,
      integritySignature: args.signature,
    })
    .run();

  for (const panel of args.panels) {
    tx.insert(schema.submittedPanels)
      .values({
        id: panel.panelId,
        revisionId: args.childRevisionId,
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

  for (const evidence of exportPayload.package.categories) {
    tx.insert(schema.sellerEvidenceSnapshots)
      .values({
        id: randomUUID(),
        revisionId: args.childRevisionId,
        categoryId: evidence.categoryId,
        decision: evidence.decision,
        expectedValue: evidence.expectedValue,
        regions: JSON.stringify(evidence.regions ?? []),
      })
      .run();
  }

  tx.insert(schema.machineAnalysisSnapshots)
    .values({
      id: randomUUID(),
      revisionId: args.childRevisionId,
      analysisRunId: latestRun.analysisRunId,
      sequence: latestRun.sequence,
      panelRuns: JSON.stringify(latestRun.panelRuns),
      categories: JSON.stringify(latestRun.categories),
      readiness: latestRun.readiness,
      recordedAt: new Date(latestRun.recordedAt),
    })
    .run();

  tx.insert(schema.submissionRevisionResponses)
    .values({
      id: args.responseId,
      submissionId: exportPayload.package.packageId,
      parentRevisionId: context.latestRevision.id,
      parentRevisionNumber: context.latestRevision.revisionNumber,
      respondedToDecisionId: context.decision.id,
      childRevisionId: args.childRevisionId,
      childRevisionNumber: context.childRevisionNumber,
      sellerId: args.user.id,
      idempotencyRecordKey: args.scopedKey,
      recordedAt: args.recordedAt,
    })
    .run();

  tx.insert(schema.submissionStatusEvents)
    .values({
      id: randomUUID(),
      submissionId: exportPayload.package.packageId,
      status: "waiting_for_agent_review",
      actorId: args.user.id,
      actorRole: args.user.role,
      reasonComment: `Seller submitted revision ${context.childRevisionNumber} in response to requested changes on revision ${context.latestRevision.revisionNumber}.`,
      recordedAt: args.recordedAt,
    })
    .run();

  tx.insert(schema.idempotencyRecords)
    .values({
      key: args.scopedKey,
      requestHash: args.requestHash,
      responsePayload: JSON.stringify(args.response),
      createdAt: args.recordedAt,
    })
    .run();

  const cas = tx
    .update(schema.submissions)
    .set({
      currentStatus: "waiting_for_agent_review",
      version: sql`${schema.submissions.version} + 1`,
      updatedAt: args.recordedAt,
    })
    .where(
      and(
        eq(schema.submissions.id, exportPayload.package.packageId),
        eq(schema.submissions.currentStatus, "changes_requested"),
        eq(schema.submissions.version, args.response.submissionVersion - 1),
      ),
    )
    .run();
  if (mutationCount(cas) !== 1) {
    throw new ResubmitError(409, "STALE_SUBMISSION_VERSION", "Submission version changed.");
  }
}

async function insertRowsAsync(
  tx: any,
  args: Parameters<typeof insertRevisionRowsSync>[1] & { context: any },
) {
  const { exportPayload, latestRun, context } = args;
  await tx.insert(schema.submissionRevisions).values({
    id: args.childRevisionId,
    submissionId: exportPayload.package.packageId,
    revisionNumber: context.childRevisionNumber,
    profileId: exportPayload.package.profile.id,
    profileVersion: exportPayload.package.profile.version,
    submittedBy: args.user.email,
    submittedAt: args.recordedAt,
    canonicalJson: args.canonicalString,
    integritySignature: args.signature,
  });

  for (const panel of args.panels) {
    await tx.insert(schema.submittedPanels).values({
      id: panel.panelId,
      revisionId: args.childRevisionId,
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

  for (const evidence of exportPayload.package.categories) {
    await tx.insert(schema.sellerEvidenceSnapshots).values({
      id: randomUUID(),
      revisionId: args.childRevisionId,
      categoryId: evidence.categoryId,
      decision: evidence.decision,
      expectedValue: evidence.expectedValue,
      regions: JSON.stringify(evidence.regions ?? []),
    });
  }

  await tx.insert(schema.machineAnalysisSnapshots).values({
    id: randomUUID(),
    revisionId: args.childRevisionId,
    analysisRunId: latestRun.analysisRunId,
    sequence: latestRun.sequence,
    panelRuns: JSON.stringify(latestRun.panelRuns),
    categories: JSON.stringify(latestRun.categories),
    readiness: latestRun.readiness,
    recordedAt: new Date(latestRun.recordedAt),
  });

  await tx.insert(schema.submissionRevisionResponses).values({
    id: args.responseId,
    submissionId: exportPayload.package.packageId,
    parentRevisionId: context.latestRevision.id,
    parentRevisionNumber: context.latestRevision.revisionNumber,
    respondedToDecisionId: context.decision.id,
    childRevisionId: args.childRevisionId,
    childRevisionNumber: context.childRevisionNumber,
    sellerId: args.user.id,
    idempotencyRecordKey: args.scopedKey,
    recordedAt: args.recordedAt,
  });

  await tx.insert(schema.submissionStatusEvents).values({
    id: randomUUID(),
    submissionId: exportPayload.package.packageId,
    status: "waiting_for_agent_review",
    actorId: args.user.id,
    actorRole: args.user.role,
    reasonComment: `Seller submitted revision ${context.childRevisionNumber} in response to requested changes on revision ${context.latestRevision.revisionNumber}.`,
    recordedAt: args.recordedAt,
  });

  await tx.insert(schema.idempotencyRecords).values({
    key: args.scopedKey,
    requestHash: args.requestHash,
    responsePayload: JSON.stringify(args.response),
    createdAt: args.recordedAt,
  });

  const cas = await tx
    .update(schema.submissions)
    .set({
      currentStatus: "waiting_for_agent_review",
      version: sql`${schema.submissions.version} + 1`,
      updatedAt: args.recordedAt,
    })
    .where(
      and(
        eq(schema.submissions.id, exportPayload.package.packageId),
        eq(schema.submissions.currentStatus, "changes_requested"),
        eq(schema.submissions.version, args.response.submissionVersion - 1),
      ),
    );
  if (mutationCount(cas) !== 1) {
    throw new ResubmitError(409, "STALE_SUBMISSION_VERSION", "Submission version changed.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await readSessionFromHeaders(request.headers);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "seller")
    return errorResponse(403, "SELLER_REQUIRED", "Seller access required.");

  const { id: submissionId } = await params;
  if (!isValidSubmissionId(submissionId)) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  const scopedKey = requireIdempotencyKey(request, user, submissionId);
  if (scopedKey instanceof NextResponse) return scopedKey;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "INVALID_MULTIPART", "Request body must be multipart form data.");
  }

  const exportJsonStr = formData.get("packageExport");
  const contextJsonStr = formData.get("revisionContext");
  if (typeof exportJsonStr !== "string") {
    return errorResponse(400, "PACKAGE_EXPORT_REQUIRED", "packageExport form field is required.");
  }
  if (typeof contextJsonStr !== "string") {
    return errorResponse(
      400,
      "REVISION_CONTEXT_REQUIRED",
      "revisionContext form field is required.",
    );
  }

  let rawPayload: unknown;
  let rawContext: unknown;
  try {
    rawPayload = JSON.parse(exportJsonStr);
  } catch {
    return errorResponse(400, "INVALID_PACKAGE_JSON", "packageExport must be valid JSON.");
  }
  try {
    rawContext = JSON.parse(contextJsonStr);
  } catch {
    return errorResponse(400, "INVALID_REVISION_CONTEXT", "revisionContext must be valid JSON.");
  }

  const parsedContext = parseRevisionResponseContext(rawContext);
  if (!parsedContext.ok) {
    return errorResponse(400, "INVALID_REVISION_CONTEXT", "revisionContext failed validation.");
  }
  const revisionContext = parsedContext.value;
  if (revisionContext.submissionId !== submissionId) {
    return errorResponse(400, "REVISION_CONTEXT_MISMATCH", "revisionContext submission mismatch.");
  }

  let validated: ReturnType<typeof validatePackagePayload>;
  try {
    validated = validatePackagePayload(rawPayload);
  } catch (error) {
    if (error instanceof ResubmitError) {
      return errorResponse(error.status, error.code, error.message);
    }
    throw error;
  }
  const { exportPayload, draft, latestRun, canonicalString } = validated;
  if (draft.packageId !== submissionId) {
    return errorResponse(400, "PACKAGE_SUBMISSION_MISMATCH", "packageExport submission mismatch.");
  }

  const requestHash = createHash("sha256")
    .update(
      canonicalStringify({
        action: "resubmit_revision",
        submissionId,
        revisionContext,
        rawPayload,
      }),
    )
    .digest("hex");
  const preExisting = await readIdempotentResponse(scopedKey, requestHash);
  if (preExisting) return preExisting;

  const childRevisionId = randomUUID();
  const responseId = randomUUID();
  const recordedAt = new Date();
  const signature = signRevision(canonicalString);

  let persistedStorageKeys: string[] = [];
  try {
    const persisted = await persistVerifiedPanels({
      formData,
      packageId: submissionId,
      childRevisionId,
      panels: draft.panels,
    });
    persistedStorageKeys = persisted.storageKeys;

    const response: ResubmitResponse = {
      action: "resubmit_revision",
      submissionId,
      parentRevisionId: revisionContext.baseRevisionId,
      parentRevisionNumber: revisionContext.baseRevisionNumber,
      revisionId: childRevisionId,
      revisionNumber: revisionContext.baseRevisionNumber + 1,
      respondedToDecisionId: revisionContext.respondedToDecisionId,
      currentStatus: "waiting_for_agent_review",
      submissionVersion: revisionContext.expectedSubmissionVersion + 1,
      recordedAt: recordedAt.toISOString(),
    };

    const txArgs = {
      responseId,
      childRevisionId,
      signature,
      canonicalString,
      panels: persisted.panels,
      user,
      requestHash,
      scopedKey,
      revisionContext,
      response,
      recordedAt,
      exportPayload,
      latestRun,
    };

    if (isSQLite) {
      db.transaction((tx: any) => insertRevisionRowsSync(tx, txArgs));
    } else {
      await db.transaction(async (tx: any) => insertRevisionRowsAsync(tx, txArgs));
    }

    return NextResponse.json(response);
  } catch (error) {
    for (const storageKey of persistedStorageKeys) {
      deletePanelAsset(storageKey);
    }
    if (error instanceof ResubmitError) {
      if (mightBeCommittedReplay(error)) {
        const replay = await readIdempotentResponse(scopedKey, requestHash, true);
        if (replay) return replay;
      }
      return errorResponse(error.status, error.code, error.message);
    }
    if (isUniqueViolation(error) || isConcurrentTransactionRace(error)) {
      const replay = await readIdempotentResponse(scopedKey, requestHash, true);
      if (replay) return replay;
      return errorResponse(
        409,
        "CONCURRENT_RESUBMISSION_CONFLICT",
        "Another resubmission won the concurrent write race. Reload before retrying.",
      );
    }
    console.error("[Resubmit Route Error]", { name: (error as { name?: string }).name });
    return errorResponse(500, "RESUBMISSION_COMMIT_FAILED", "Resubmission commit failed.");
  }
}
