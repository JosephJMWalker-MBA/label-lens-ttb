import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- Drizzle's SQLite and MySQL transaction handles expose different sync/async execution surfaces behind the runtime dialect switch. */

import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, isSQLite, schema } from "@/db/client";
import { verifyRevision } from "@/lib/integrity";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import { requireApiRole, type Role, type SessionUser } from "@/server/auth/guards";
import { isValidSubmissionId } from "@/server/submissions/access";

type AgentReviewAction = "claim" | "release" | "request_changes" | "internal_accept";
type DecisionType = "changes_requested" | "internally_accepted";
type ClaimState = "active" | "released" | "force_released" | "decided";

interface SubmissionRow {
  id: string;
  currentStatus: string;
  version: number;
}

interface RevisionRow {
  id: string;
  revisionNumber: number;
  canonicalJson: string;
  integritySignature: string;
}

interface ClaimRow {
  id: string;
  submissionId: string;
  revisionId: string;
  revisionNumber: number;
  reviewerId: string;
  reviewerRole: Role;
  state: ClaimState;
  activeSubmissionId: string | null;
  claimedSubmissionVersion: number;
  claimedAt: Date;
}

interface DecisionRow {
  id: string;
  revisionId: string;
  decisionType: DecisionType;
}

interface ReviewContext {
  submission: SubmissionRow;
  revision: RevisionRow;
  activeClaim: ClaimRow | null;
  decision: DecisionRow | null;
}

interface ParsedRequest {
  body: Record<string, unknown>;
  requestHash: string;
}

interface IdempotencyRecord {
  requestHash: string;
  responsePayload: string;
}

interface MutationResponse {
  action: AgentReviewAction;
  submissionId: string;
  currentStatus: string;
  submissionVersion: number;
  claim?: {
    id: string;
    state: ClaimState;
    revisionId: string;
    revisionNumber: number;
    claimedAt?: string;
    releasedAt?: string;
  };
  decision?: {
    id: string;
    type: DecisionType;
    reviewedRevisionId: string;
    reviewedRevisionNumber: number;
    recordedAt: string;
  };
}

class ReviewActionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseJsonRequest(
  request: Request,
  action: AgentReviewAction,
  submissionId: string,
): Promise<ParsedRequest | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  if (!isObject(body)) {
    return errorResponse(400, "INVALID_JSON", "Request body must be a JSON object.");
  }

  return {
    body,
    requestHash: createHash("sha256")
      .update(canonicalStringify({ action, submissionId, body }))
      .digest("hex"),
  };
}

function requireIdempotencyKey(
  request: Request,
  action: AgentReviewAction,
  user: SessionUser,
): string | NextResponse {
  const key = request.headers.get("X-Idempotency-Key")?.trim();
  if (!key) {
    return errorResponse(400, "IDEMPOTENCY_KEY_REQUIRED", "X-Idempotency-Key header is required.");
  }
  if (key.length > 120 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    return errorResponse(
      400,
      "IDEMPOTENCY_KEY_INVALID",
      "X-Idempotency-Key must be a bounded path-safe token.",
    );
  }
  return `agent-review:${action}:${user.id}:${key}`;
}

function readExpectedSubmissionVersion(body: Record<string, unknown>): number {
  const value = body.expectedSubmissionVersion;
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new ReviewActionError(
      400,
      "EXPECTED_VERSION_REQUIRED",
      "expectedSubmissionVersion must be a positive integer.",
    );
  }
  return Number(value);
}

function readStringField(
  body: Record<string, unknown>,
  field: string,
  options: { required?: boolean; max: number },
): string | null {
  const raw = body[field];
  if (raw === undefined || raw === null) {
    if (options.required) {
      throw new ReviewActionError(400, "FIELD_REQUIRED", `${field} is required.`);
    }
    return null;
  }
  if (typeof raw !== "string") {
    throw new ReviewActionError(400, "FIELD_INVALID", `${field} must be a string.`);
  }
  const normalized = raw.replace(/\r\n?/g, "\n").trim();
  if (options.required && normalized.length === 0) {
    throw new ReviewActionError(400, "FIELD_REQUIRED", `${field} is required.`);
  }
  if (normalized.length > options.max) {
    throw new ReviewActionError(400, "FIELD_TOO_LONG", `${field} exceeds ${options.max} chars.`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) {
    throw new ReviewActionError(
      400,
      "FIELD_INVALID",
      `${field} contains unsupported control characters.`,
    );
  }
  return normalized;
}

function requireClaimId(body: Record<string, unknown>): string {
  const claimId = readStringField(body, "claimId", { required: true, max: 36 });
  if (!claimId || !/^[0-9a-fA-F-]{36}$/.test(claimId)) {
    throw new ReviewActionError(400, "CLAIM_ID_INVALID", "claimId must be a UUID.");
  }
  return claimId;
}

function requireReviewedRevision(body: Record<string, unknown>): {
  reviewedRevisionId: string;
  reviewedRevisionNumber: number;
} {
  const reviewedRevisionId = readStringField(body, "reviewedRevisionId", {
    required: true,
    max: 36,
  });
  if (!reviewedRevisionId || !/^[0-9a-fA-F-]{36}$/.test(reviewedRevisionId)) {
    throw new ReviewActionError(
      400,
      "REVIEWED_REVISION_INVALID",
      "reviewedRevisionId must be a UUID.",
    );
  }
  const reviewedRevisionNumber = body.reviewedRevisionNumber;
  if (!Number.isInteger(reviewedRevisionNumber) || Number(reviewedRevisionNumber) < 1) {
    throw new ReviewActionError(
      400,
      "REVIEWED_REVISION_INVALID",
      "reviewedRevisionNumber must be a positive integer.",
    );
  }
  return { reviewedRevisionId, reviewedRevisionNumber: Number(reviewedRevisionNumber) };
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

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  return null;
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

function mutationCount(result: unknown): number {
  const value = Array.isArray(result) ? result[0] : result;
  const candidate = value as { affectedRows?: number; rowsAffected?: number; changes?: number };
  return Number(candidate?.affectedRows ?? candidate?.rowsAffected ?? candidate?.changes ?? 0);
}

function validateContext(context: ReviewContext, expectedSubmissionVersion: number): void {
  if (context.submission.version !== expectedSubmissionVersion) {
    throw new ReviewActionError(
      409,
      "VERSION_CONFLICT",
      "Submission version changed. Reload before retrying this action.",
    );
  }
  if (!verifyRevision(context.revision.canonicalJson, context.revision.integritySignature)) {
    throw new ReviewActionError(
      409,
      "REVISION_INTEGRITY_FAILED",
      "The reviewed revision failed integrity verification.",
    );
  }
}

function ensureNoPriorDecision(context: ReviewContext): void {
  if (context.decision) {
    throw new ReviewActionError(
      409,
      "REVISION_ALREADY_DECIDED",
      "This exact revision already has an immutable decision.",
    );
  }
}

function ensureClaimOwner(claim: ClaimRow, user: SessionUser): void {
  if (claim.reviewerId !== user.id) {
    throw new ReviewActionError(
      403,
      "CLAIM_OWNED_BY_ANOTHER_REVIEWER",
      "Only the active reviewer can decide this claim.",
    );
  }
}

function assertActiveClaim(context: ReviewContext, claimId: string, user: SessionUser): ClaimRow {
  const claim = context.activeClaim;
  if (!claim || claim.id !== claimId) {
    throw new ReviewActionError(409, "CLAIM_NOT_ACTIVE", "The referenced claim is not active.");
  }
  ensureClaimOwner(claim, user);
  return claim;
}

function assertReviewedIdentity(
  context: ReviewContext,
  claim: ClaimRow,
  reviewedRevisionId: string,
  reviewedRevisionNumber: number,
): void {
  if (
    context.revision.id !== reviewedRevisionId ||
    context.revision.revisionNumber !== reviewedRevisionNumber ||
    claim.revisionId !== reviewedRevisionId ||
    claim.revisionNumber !== reviewedRevisionNumber
  ) {
    throw new ReviewActionError(
      409,
      "REVIEWED_REVISION_CONFLICT",
      "The reviewed revision identity no longer matches the active claim.",
    );
  }
}

function formatDate(value: Date): string {
  return value.toISOString();
}

function makeClaimResponse(args: {
  submissionId: string;
  submissionVersion: number;
  claimId: string;
  revisionId: string;
  revisionNumber: number;
  claimedAt: Date;
}): MutationResponse {
  return {
    action: "claim",
    submissionId: args.submissionId,
    currentStatus: "in_agent_review",
    submissionVersion: args.submissionVersion,
    claim: {
      id: args.claimId,
      state: "active",
      revisionId: args.revisionId,
      revisionNumber: args.revisionNumber,
      claimedAt: formatDate(args.claimedAt),
    },
  };
}

function makeReleaseResponse(args: {
  submissionId: string;
  submissionVersion: number;
  claim: ClaimRow;
  state: "released" | "force_released";
  releasedAt: Date;
}): MutationResponse {
  return {
    action: "release",
    submissionId: args.submissionId,
    currentStatus: "waiting_for_agent_review",
    submissionVersion: args.submissionVersion,
    claim: {
      id: args.claim.id,
      state: args.state,
      revisionId: args.claim.revisionId,
      revisionNumber: args.claim.revisionNumber,
      releasedAt: formatDate(args.releasedAt),
    },
  };
}

function makeDecisionResponse(args: {
  action: "request_changes" | "internal_accept";
  submissionId: string;
  submissionVersion: number;
  decisionId: string;
  decisionType: DecisionType;
  revisionId: string;
  revisionNumber: number;
  recordedAt: Date;
}): MutationResponse {
  return {
    action: args.action,
    submissionId: args.submissionId,
    currentStatus: args.decisionType,
    submissionVersion: args.submissionVersion,
    decision: {
      id: args.decisionId,
      type: args.decisionType,
      reviewedRevisionId: args.revisionId,
      reviewedRevisionNumber: args.revisionNumber,
      recordedAt: formatDate(args.recordedAt),
    },
  };
}

function loadContextSync(tx: any, submissionId: string): ReviewContext {
  const submission = tx
    .select({
      id: schema.submissions.id,
      currentStatus: schema.submissions.currentStatus,
      version: schema.submissions.version,
    })
    .from(schema.submissions)
    .where(eq(schema.submissions.id, submissionId))
    .limit(1)
    .all()[0] as SubmissionRow | undefined;
  if (!submission) {
    throw new ReviewActionError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");
  }

  const revision = tx
    .select({
      id: schema.submissionRevisions.id,
      revisionNumber: schema.submissionRevisions.revisionNumber,
      canonicalJson: schema.submissionRevisions.canonicalJson,
      integritySignature: schema.submissionRevisions.integritySignature,
    })
    .from(schema.submissionRevisions)
    .where(eq(schema.submissionRevisions.submissionId, submissionId))
    .orderBy(desc(schema.submissionRevisions.revisionNumber))
    .limit(1)
    .all()[0] as RevisionRow | undefined;
  if (!revision) {
    throw new ReviewActionError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");
  }

  const activeClaim =
    (tx
      .select()
      .from(schema.reviewerClaims)
      .where(eq(schema.reviewerClaims.activeSubmissionId, submissionId))
      .limit(1)
      .all()[0] as ClaimRow | undefined) ?? null;

  const decision =
    (tx
      .select({
        id: schema.agentDecisions.id,
        revisionId: schema.agentDecisions.revisionId,
        decisionType: schema.agentDecisions.decisionType,
      })
      .from(schema.agentDecisions)
      .where(eq(schema.agentDecisions.revisionId, revision.id))
      .limit(1)
      .all()[0] as DecisionRow | undefined) ?? null;

  return { submission, revision, activeClaim, decision };
}

async function loadContextAsync(tx: any, submissionId: string): Promise<ReviewContext> {
  const submissionRows = (await tx
    .select({
      id: schema.submissions.id,
      currentStatus: schema.submissions.currentStatus,
      version: schema.submissions.version,
    })
    .from(schema.submissions)
    .where(eq(schema.submissions.id, submissionId))
    .limit(1)) as SubmissionRow[];
  const submission = submissionRows[0];
  if (!submission) {
    throw new ReviewActionError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");
  }

  const revisionRows = (await tx
    .select({
      id: schema.submissionRevisions.id,
      revisionNumber: schema.submissionRevisions.revisionNumber,
      canonicalJson: schema.submissionRevisions.canonicalJson,
      integritySignature: schema.submissionRevisions.integritySignature,
    })
    .from(schema.submissionRevisions)
    .where(eq(schema.submissionRevisions.submissionId, submissionId))
    .orderBy(desc(schema.submissionRevisions.revisionNumber))
    .limit(1)) as RevisionRow[];
  const revision = revisionRows[0];
  if (!revision) {
    throw new ReviewActionError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");
  }

  const activeClaimRows = (await tx
    .select()
    .from(schema.reviewerClaims)
    .where(eq(schema.reviewerClaims.activeSubmissionId, submissionId))
    .limit(1)) as ClaimRow[];

  const decisionRows = (await tx
    .select({
      id: schema.agentDecisions.id,
      revisionId: schema.agentDecisions.revisionId,
      decisionType: schema.agentDecisions.decisionType,
    })
    .from(schema.agentDecisions)
    .where(eq(schema.agentDecisions.revisionId, revision.id))
    .limit(1)) as DecisionRow[];

  return {
    submission,
    revision,
    activeClaim: activeClaimRows[0] ?? null,
    decision: decisionRows[0] ?? null,
  };
}

function insertIdempotencySync(
  tx: any,
  scopedKey: string,
  requestHash: string,
  response: MutationResponse,
  recordedAt: Date,
): void {
  tx.insert(schema.idempotencyRecords)
    .values({
      key: scopedKey,
      requestHash,
      responsePayload: JSON.stringify(response),
      createdAt: recordedAt,
    })
    .run();
}

async function insertIdempotencyAsync(
  tx: any,
  scopedKey: string,
  requestHash: string,
  response: MutationResponse,
  recordedAt: Date,
): Promise<void> {
  await tx.insert(schema.idempotencyRecords).values({
    key: scopedKey,
    requestHash,
    responsePayload: JSON.stringify(response),
    createdAt: recordedAt,
  });
}

function assertSubmissionCasApplied(result: unknown): void {
  if (mutationCount(result) !== 1) {
    throw new ReviewActionError(
      409,
      "VERSION_CONFLICT",
      "Submission version changed. Reload before retrying this action.",
    );
  }
}

function updateSubmissionProjectionSync(
  tx: any,
  submissionId: string,
  expectedSubmissionVersion: number,
  status: string,
  updatedAt: Date,
): void {
  const cas = tx
    .update(schema.submissions)
    .set({
      currentStatus: status,
      version: sql`${schema.submissions.version} + 1`,
      updatedAt,
    })
    .where(
      and(
        eq(schema.submissions.id, submissionId),
        eq(schema.submissions.version, expectedSubmissionVersion),
      ),
    )
    .run();
  assertSubmissionCasApplied(cas);
}

async function updateSubmissionProjectionAsync(
  tx: any,
  submissionId: string,
  expectedSubmissionVersion: number,
  status: string,
  updatedAt: Date,
): Promise<void> {
  const cas = await tx
    .update(schema.submissions)
    .set({
      currentStatus: status,
      version: sql`${schema.submissions.version} + 1`,
      updatedAt,
    })
    .where(
      and(
        eq(schema.submissions.id, submissionId),
        eq(schema.submissions.version, expectedSubmissionVersion),
      ),
    );
  assertSubmissionCasApplied(cas);
}

function claimSync(
  tx: any,
  args: {
    user: SessionUser;
    submissionId: string;
    expectedSubmissionVersion: number;
    scopedKey: string;
    requestHash: string;
  },
): MutationResponse {
  const context = loadContextSync(tx, args.submissionId);
  validateContext(context, args.expectedSubmissionVersion);
  ensureNoPriorDecision(context);

  if (context.submission.currentStatus !== "waiting_for_agent_review") {
    throw new ReviewActionError(
      409,
      "INVALID_STATUS_TRANSITION",
      "Only waiting submissions can be claimed.",
    );
  }
  if (context.activeClaim) {
    throw new ReviewActionError(
      409,
      "CLAIM_ALREADY_ACTIVE",
      "Submission already has an active claim.",
    );
  }

  const now = new Date();
  const nextVersion = context.submission.version + 1;
  const claimId = randomUUID();

  tx.insert(schema.reviewerClaims)
    .values({
      id: claimId,
      submissionId: args.submissionId,
      revisionId: context.revision.id,
      revisionNumber: context.revision.revisionNumber,
      reviewerId: args.user.id,
      reviewerRole: args.user.role,
      state: "active",
      activeSubmissionId: args.submissionId,
      claimedSubmissionVersion: args.expectedSubmissionVersion,
      claimedAt: now,
      createdAt: now,
    })
    .run();

  tx.insert(schema.submissionStatusEvents)
    .values({
      id: randomUUID(),
      submissionId: args.submissionId,
      status: "in_agent_review",
      actorId: args.user.id,
      actorRole: args.user.role,
      reasonComment: "Reviewer claimed submission for internal review.",
      recordedAt: now,
    })
    .run();

  const response = makeClaimResponse({
    submissionId: args.submissionId,
    submissionVersion: nextVersion,
    claimId,
    revisionId: context.revision.id,
    revisionNumber: context.revision.revisionNumber,
    claimedAt: now,
  });
  insertIdempotencySync(tx, args.scopedKey, args.requestHash, response, now);
  updateSubmissionProjectionSync(
    tx,
    args.submissionId,
    args.expectedSubmissionVersion,
    "in_agent_review",
    now,
  );
  return response;
}

async function claimAsync(
  tx: any,
  args: Parameters<typeof claimSync>[1],
): Promise<MutationResponse> {
  const context = await loadContextAsync(tx, args.submissionId);
  validateContext(context, args.expectedSubmissionVersion);
  ensureNoPriorDecision(context);

  if (context.submission.currentStatus !== "waiting_for_agent_review") {
    throw new ReviewActionError(
      409,
      "INVALID_STATUS_TRANSITION",
      "Only waiting submissions can be claimed.",
    );
  }
  if (context.activeClaim) {
    throw new ReviewActionError(
      409,
      "CLAIM_ALREADY_ACTIVE",
      "Submission already has an active claim.",
    );
  }

  const now = new Date();
  const nextVersion = context.submission.version + 1;
  const claimId = randomUUID();

  await tx.insert(schema.reviewerClaims).values({
    id: claimId,
    submissionId: args.submissionId,
    revisionId: context.revision.id,
    revisionNumber: context.revision.revisionNumber,
    reviewerId: args.user.id,
    reviewerRole: args.user.role,
    state: "active",
    activeSubmissionId: args.submissionId,
    claimedSubmissionVersion: args.expectedSubmissionVersion,
    claimedAt: now,
    createdAt: now,
  });

  await tx.insert(schema.submissionStatusEvents).values({
    id: randomUUID(),
    submissionId: args.submissionId,
    status: "in_agent_review",
    actorId: args.user.id,
    actorRole: args.user.role,
    reasonComment: "Reviewer claimed submission for internal review.",
    recordedAt: now,
  });

  const response = makeClaimResponse({
    submissionId: args.submissionId,
    submissionVersion: nextVersion,
    claimId,
    revisionId: context.revision.id,
    revisionNumber: context.revision.revisionNumber,
    claimedAt: now,
  });
  await insertIdempotencyAsync(tx, args.scopedKey, args.requestHash, response, now);
  await updateSubmissionProjectionAsync(
    tx,
    args.submissionId,
    args.expectedSubmissionVersion,
    "in_agent_review",
    now,
  );
  return response;
}

function releaseSync(
  tx: any,
  args: {
    user: SessionUser;
    submissionId: string;
    expectedSubmissionVersion: number;
    scopedKey: string;
    requestHash: string;
    claimId: string;
    force: boolean;
    reason: string | null;
  },
): MutationResponse {
  const context = loadContextSync(tx, args.submissionId);
  validateContext(context, args.expectedSubmissionVersion);
  if (context.submission.currentStatus !== "in_agent_review") {
    throw new ReviewActionError(
      409,
      "INVALID_STATUS_TRANSITION",
      "Only in-review submissions can be released.",
    );
  }
  const claim = context.activeClaim;
  if (!claim || claim.id !== args.claimId) {
    throw new ReviewActionError(409, "CLAIM_NOT_ACTIVE", "The referenced claim is not active.");
  }
  if (args.force) {
    if (args.user.role !== "admin") {
      throw new ReviewActionError(403, "ADMIN_REQUIRED", "Only admins can force-release a claim.");
    }
    if (!args.reason) {
      throw new ReviewActionError(
        400,
        "RELEASE_REASON_REQUIRED",
        "Admin force-release requires an explicit reason.",
      );
    }
  } else if (claim.reviewerId !== args.user.id) {
    throw new ReviewActionError(
      403,
      "CLAIM_OWNED_BY_ANOTHER_REVIEWER",
      "Only the active reviewer or an admin force-release can release this claim.",
    );
  }

  const now = new Date();
  const nextVersion = context.submission.version + 1;
  const nextClaimState = args.force ? "force_released" : "released";
  const releaseReason = args.force ? args.reason : args.reason || "Reviewer released active claim.";

  const claimUpdate = tx
    .update(schema.reviewerClaims)
    .set({
      state: nextClaimState,
      activeSubmissionId: null,
      releasedAt: now,
      releasedBy: args.user.id,
      releasedByRole: args.user.role,
      releaseReason,
    })
    .where(and(eq(schema.reviewerClaims.id, claim.id), eq(schema.reviewerClaims.state, "active")))
    .run();
  if (mutationCount(claimUpdate) !== 1) {
    throw new ReviewActionError(409, "CLAIM_NOT_ACTIVE", "The referenced claim is not active.");
  }

  tx.insert(schema.submissionStatusEvents)
    .values({
      id: randomUUID(),
      submissionId: args.submissionId,
      status: "waiting_for_agent_review",
      actorId: args.user.id,
      actorRole: args.user.role,
      reasonComment: args.force ? `Admin force-release: ${releaseReason}` : releaseReason,
      recordedAt: now,
    })
    .run();

  const response = makeReleaseResponse({
    submissionId: args.submissionId,
    submissionVersion: nextVersion,
    claim,
    state: nextClaimState,
    releasedAt: now,
  });
  insertIdempotencySync(tx, args.scopedKey, args.requestHash, response, now);
  updateSubmissionProjectionSync(
    tx,
    args.submissionId,
    args.expectedSubmissionVersion,
    "waiting_for_agent_review",
    now,
  );
  return response;
}

async function releaseAsync(
  tx: any,
  args: Parameters<typeof releaseSync>[1],
): Promise<MutationResponse> {
  const context = await loadContextAsync(tx, args.submissionId);
  validateContext(context, args.expectedSubmissionVersion);
  if (context.submission.currentStatus !== "in_agent_review") {
    throw new ReviewActionError(
      409,
      "INVALID_STATUS_TRANSITION",
      "Only in-review submissions can be released.",
    );
  }
  const claim = context.activeClaim;
  if (!claim || claim.id !== args.claimId) {
    throw new ReviewActionError(409, "CLAIM_NOT_ACTIVE", "The referenced claim is not active.");
  }
  if (args.force) {
    if (args.user.role !== "admin") {
      throw new ReviewActionError(403, "ADMIN_REQUIRED", "Only admins can force-release a claim.");
    }
    if (!args.reason) {
      throw new ReviewActionError(
        400,
        "RELEASE_REASON_REQUIRED",
        "Admin force-release requires an explicit reason.",
      );
    }
  } else if (claim.reviewerId !== args.user.id) {
    throw new ReviewActionError(
      403,
      "CLAIM_OWNED_BY_ANOTHER_REVIEWER",
      "Only the active reviewer or an admin force-release can release this claim.",
    );
  }

  const now = new Date();
  const nextVersion = context.submission.version + 1;
  const nextClaimState = args.force ? "force_released" : "released";
  const releaseReason = args.force ? args.reason : args.reason || "Reviewer released active claim.";

  const claimUpdate = await tx
    .update(schema.reviewerClaims)
    .set({
      state: nextClaimState,
      activeSubmissionId: null,
      releasedAt: now,
      releasedBy: args.user.id,
      releasedByRole: args.user.role,
      releaseReason,
    })
    .where(and(eq(schema.reviewerClaims.id, claim.id), eq(schema.reviewerClaims.state, "active")));
  if (mutationCount(claimUpdate) !== 1) {
    throw new ReviewActionError(409, "CLAIM_NOT_ACTIVE", "The referenced claim is not active.");
  }

  await tx.insert(schema.submissionStatusEvents).values({
    id: randomUUID(),
    submissionId: args.submissionId,
    status: "waiting_for_agent_review",
    actorId: args.user.id,
    actorRole: args.user.role,
    reasonComment: args.force ? `Admin force-release: ${releaseReason}` : releaseReason,
    recordedAt: now,
  });

  const response = makeReleaseResponse({
    submissionId: args.submissionId,
    submissionVersion: nextVersion,
    claim,
    state: nextClaimState,
    releasedAt: now,
  });
  await insertIdempotencyAsync(tx, args.scopedKey, args.requestHash, response, now);
  await updateSubmissionProjectionAsync(
    tx,
    args.submissionId,
    args.expectedSubmissionVersion,
    "waiting_for_agent_review",
    now,
  );
  return response;
}

function decisionSync(
  tx: any,
  args: {
    user: SessionUser;
    submissionId: string;
    expectedSubmissionVersion: number;
    scopedKey: string;
    requestHash: string;
    claimId: string;
    reviewedRevisionId: string;
    reviewedRevisionNumber: number;
    decisionType: DecisionType;
    rationale: string;
  },
): MutationResponse {
  const context = loadContextSync(tx, args.submissionId);
  validateContext(context, args.expectedSubmissionVersion);
  ensureNoPriorDecision(context);
  if (context.submission.currentStatus !== "in_agent_review") {
    throw new ReviewActionError(
      409,
      "INVALID_STATUS_TRANSITION",
      "Only in-review submissions can receive an agent decision.",
    );
  }
  const claim = assertActiveClaim(context, args.claimId, args.user);
  assertReviewedIdentity(context, claim, args.reviewedRevisionId, args.reviewedRevisionNumber);

  const now = new Date();
  const nextVersion = context.submission.version + 1;
  const decisionId = randomUUID();

  tx.insert(schema.agentDecisions)
    .values({
      id: decisionId,
      submissionId: args.submissionId,
      revisionId: args.reviewedRevisionId,
      revisionNumber: args.reviewedRevisionNumber,
      claimId: claim.id,
      reviewerId: args.user.id,
      reviewerRole: args.user.role,
      decisionType: args.decisionType,
      priorStatus: context.submission.currentStatus,
      resultingStatus: args.decisionType,
      rationale: args.rationale,
      submissionVersionBefore: args.expectedSubmissionVersion,
      submissionVersionAfter: nextVersion,
      idempotencyRecordKey: args.scopedKey,
      recordedAt: now,
    })
    .run();

  const claimUpdate = tx
    .update(schema.reviewerClaims)
    .set({
      state: "decided",
      activeSubmissionId: null,
      decidedAt: now,
    })
    .where(and(eq(schema.reviewerClaims.id, claim.id), eq(schema.reviewerClaims.state, "active")))
    .run();
  if (mutationCount(claimUpdate) !== 1) {
    throw new ReviewActionError(409, "CLAIM_NOT_ACTIVE", "The referenced claim is not active.");
  }

  tx.insert(schema.submissionStatusEvents)
    .values({
      id: randomUUID(),
      submissionId: args.submissionId,
      status: args.decisionType,
      actorId: args.user.id,
      actorRole: args.user.role,
      reasonComment:
        args.decisionType === "changes_requested"
          ? "Reviewer requested bounded seller changes."
          : "Reviewer recorded internal acceptance rationale.",
      recordedAt: now,
    })
    .run();

  const response = makeDecisionResponse({
    action: args.decisionType === "changes_requested" ? "request_changes" : "internal_accept",
    submissionId: args.submissionId,
    submissionVersion: nextVersion,
    decisionId,
    decisionType: args.decisionType,
    revisionId: args.reviewedRevisionId,
    revisionNumber: args.reviewedRevisionNumber,
    recordedAt: now,
  });
  insertIdempotencySync(tx, args.scopedKey, args.requestHash, response, now);
  updateSubmissionProjectionSync(
    tx,
    args.submissionId,
    args.expectedSubmissionVersion,
    args.decisionType,
    now,
  );
  return response;
}

async function decisionAsync(
  tx: any,
  args: Parameters<typeof decisionSync>[1],
): Promise<MutationResponse> {
  const context = await loadContextAsync(tx, args.submissionId);
  validateContext(context, args.expectedSubmissionVersion);
  ensureNoPriorDecision(context);
  if (context.submission.currentStatus !== "in_agent_review") {
    throw new ReviewActionError(
      409,
      "INVALID_STATUS_TRANSITION",
      "Only in-review submissions can receive an agent decision.",
    );
  }
  const claim = assertActiveClaim(context, args.claimId, args.user);
  assertReviewedIdentity(context, claim, args.reviewedRevisionId, args.reviewedRevisionNumber);

  const now = new Date();
  const nextVersion = context.submission.version + 1;
  const decisionId = randomUUID();

  await tx.insert(schema.agentDecisions).values({
    id: decisionId,
    submissionId: args.submissionId,
    revisionId: args.reviewedRevisionId,
    revisionNumber: args.reviewedRevisionNumber,
    claimId: claim.id,
    reviewerId: args.user.id,
    reviewerRole: args.user.role,
    decisionType: args.decisionType,
    priorStatus: context.submission.currentStatus,
    resultingStatus: args.decisionType,
    rationale: args.rationale,
    submissionVersionBefore: args.expectedSubmissionVersion,
    submissionVersionAfter: nextVersion,
    idempotencyRecordKey: args.scopedKey,
    recordedAt: now,
  });

  const claimUpdate = await tx
    .update(schema.reviewerClaims)
    .set({
      state: "decided",
      activeSubmissionId: null,
      decidedAt: now,
    })
    .where(and(eq(schema.reviewerClaims.id, claim.id), eq(schema.reviewerClaims.state, "active")));
  if (mutationCount(claimUpdate) !== 1) {
    throw new ReviewActionError(409, "CLAIM_NOT_ACTIVE", "The referenced claim is not active.");
  }

  await tx.insert(schema.submissionStatusEvents).values({
    id: randomUUID(),
    submissionId: args.submissionId,
    status: args.decisionType,
    actorId: args.user.id,
    actorRole: args.user.role,
    reasonComment:
      args.decisionType === "changes_requested"
        ? "Reviewer requested bounded seller changes."
        : "Reviewer recorded internal acceptance rationale.",
    recordedAt: now,
  });

  const response = makeDecisionResponse({
    action: args.decisionType === "changes_requested" ? "request_changes" : "internal_accept",
    submissionId: args.submissionId,
    submissionVersion: nextVersion,
    decisionId,
    decisionType: args.decisionType,
    revisionId: args.reviewedRevisionId,
    revisionNumber: args.reviewedRevisionNumber,
    recordedAt: now,
  });
  await insertIdempotencyAsync(tx, args.scopedKey, args.requestHash, response, now);
  await updateSubmissionProjectionAsync(
    tx,
    args.submissionId,
    args.expectedSubmissionVersion,
    args.decisionType,
    now,
  );
  return response;
}

async function runMutation(
  action: AgentReviewAction,
  request: Request,
  submissionId: string,
  mutate: (args: {
    user: SessionUser;
    body: Record<string, unknown>;
    scopedKey: string;
    requestHash: string;
  }) => Promise<MutationResponse>,
): Promise<NextResponse> {
  const auth = await requireApiRole(request, ["agent", "admin"]);
  if (!auth.ok) return auth.response;
  if (!isValidSubmissionId(submissionId)) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  const parsed = await parseJsonRequest(request, action, submissionId);
  if (parsed instanceof NextResponse) return parsed;

  const scopedKey = requireIdempotencyKey(request, action, auth.user);
  if (scopedKey instanceof NextResponse) return scopedKey;

  const existing = await readIdempotentResponse(scopedKey, parsed.requestHash);
  if (existing) return existing;

  try {
    const response = await mutate({
      user: auth.user,
      body: parsed.body,
      scopedKey,
      requestHash: parsed.requestHash,
    });
    return NextResponse.json(response);
  } catch (err) {
    const replay = await readIdempotentResponse(scopedKey, parsed.requestHash, true);
    if (replay) return replay;

    if (err instanceof ReviewActionError) {
      return errorResponse(err.status, err.code, err.message);
    }
    if (isUniqueViolation(err)) {
      return errorResponse(
        409,
        "CONCURRENT_REVIEW_CONFLICT",
        "A concurrent review action already changed this submission. Reload before retrying.",
      );
    }
    console.error("[Agent Review Action Error]", {
      action,
      submissionId,
      name: (err as { name?: string })?.name,
      code: (err as { code?: string })?.code,
      errno: (err as { errno?: number })?.errno,
    });
    return errorResponse(500, "AGENT_REVIEW_ACTION_FAILED", "Agent review action failed.");
  }
}

export async function claimSubmission(
  request: Request,
  submissionId: string,
): Promise<NextResponse> {
  return runMutation(
    "claim",
    request,
    submissionId,
    async ({ user, body, scopedKey, requestHash }) => {
      const expectedSubmissionVersion = readExpectedSubmissionVersion(body);
      const args = { user, submissionId, expectedSubmissionVersion, scopedKey, requestHash };
      if (isSQLite) {
        return db.transaction((tx: any) => claimSync(tx, args));
      }
      return db.transaction((tx: any) => claimAsync(tx, args));
    },
  );
}

export async function releaseSubmissionClaim(
  request: Request,
  submissionId: string,
): Promise<NextResponse> {
  return runMutation(
    "release",
    request,
    submissionId,
    async ({ user, body, scopedKey, requestHash }) => {
      const expectedSubmissionVersion = readExpectedSubmissionVersion(body);
      const claimId = requireClaimId(body);
      const force = body.force === true;
      const reason = readStringField(body, "reason", { required: force, max: 1000 });
      const args = {
        user,
        submissionId,
        expectedSubmissionVersion,
        scopedKey,
        requestHash,
        claimId,
        force,
        reason,
      };
      if (isSQLite) {
        return db.transaction((tx: any) => releaseSync(tx, args));
      }
      return db.transaction((tx: any) => releaseAsync(tx, args));
    },
  );
}

export async function requestSubmissionChanges(
  request: Request,
  submissionId: string,
): Promise<NextResponse> {
  return runDecisionMutation("request_changes", "changes_requested", request, submissionId);
}

export async function internallyAcceptSubmission(
  request: Request,
  submissionId: string,
): Promise<NextResponse> {
  return runDecisionMutation("internal_accept", "internally_accepted", request, submissionId);
}

function runDecisionMutation(
  action: "request_changes" | "internal_accept",
  decisionType: DecisionType,
  request: Request,
  submissionId: string,
): Promise<NextResponse> {
  return runMutation(
    action,
    request,
    submissionId,
    async ({ user, body, scopedKey, requestHash }) => {
      const expectedSubmissionVersion = readExpectedSubmissionVersion(body);
      const claimId = requireClaimId(body);
      const { reviewedRevisionId, reviewedRevisionNumber } = requireReviewedRevision(body);
      const rationale = readStringField(body, "rationale", { required: true, max: 2000 });
      if (!rationale) {
        throw new ReviewActionError(400, "RATIONALE_REQUIRED", "rationale is required.");
      }
      const args = {
        user,
        submissionId,
        expectedSubmissionVersion,
        scopedKey,
        requestHash,
        claimId,
        reviewedRevisionId,
        reviewedRevisionNumber,
        decisionType,
        rationale,
      };
      if (isSQLite) {
        return db.transaction((tx: any) => decisionSync(tx, args));
      }
      return db.transaction((tx: any) => decisionAsync(tx, args));
    },
  );
}
