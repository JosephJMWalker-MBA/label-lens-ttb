import "server-only";

import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/db/client";

export interface OwnedSubmission {
  id: string;
  currentStatus: string;
  version: number;
  isDemo: boolean;
  updatedAt: Date;
  latestRevisionNumber: number | null;
  changesRequestedFeedback: {
    revisionNumber: number;
    rationale: string;
    recordedAt: Date;
  } | null;
}

/** Submissions created by a specific seller. Never returns other sellers' rows. */
export async function listOwnedSubmissions(userId: string): Promise<OwnedSubmission[]> {
  const rows = (await db
    .select({
      id: schema.submissions.id,
      currentStatus: schema.submissions.currentStatus,
      version: schema.submissions.version,
      isDemo: schema.submissions.isDemo,
      updatedAt: schema.submissions.updatedAt,
    })
    .from(schema.submissions)
    .where(eq(schema.submissions.creatorId, userId))) as Omit<
    OwnedSubmission,
    "latestRevisionNumber" | "changesRequestedFeedback"
  >[];

  if (rows.length === 0) return [];

  const submissionIds = rows.map((row) => row.id);
  const revisionRows = (await db
    .select({
      submissionId: schema.submissionRevisions.submissionId,
      revisionNumber: schema.submissionRevisions.revisionNumber,
    })
    .from(schema.submissionRevisions)
    .where(inArray(schema.submissionRevisions.submissionId, submissionIds))
    .orderBy(desc(schema.submissionRevisions.revisionNumber))) as {
    submissionId: string;
    revisionNumber: number;
  }[];

  const latestRevisionBySubmission = new Map<string, number>();
  for (const revision of revisionRows) {
    if (!latestRevisionBySubmission.has(revision.submissionId)) {
      latestRevisionBySubmission.set(revision.submissionId, revision.revisionNumber);
    }
  }

  const changeDecisionRows = (await db
    .select({
      submissionId: schema.agentDecisions.submissionId,
      revisionNumber: schema.agentDecisions.revisionNumber,
      rationale: schema.agentDecisions.rationale,
      recordedAt: schema.agentDecisions.recordedAt,
    })
    .from(schema.agentDecisions)
    .where(
      and(
        inArray(schema.agentDecisions.submissionId, submissionIds),
        eq(schema.agentDecisions.decisionType, "changes_requested"),
      ),
    )
    .orderBy(desc(schema.agentDecisions.recordedAt))) as {
    submissionId: string;
    revisionNumber: number;
    rationale: string;
    recordedAt: Date;
  }[];

  const feedbackBySubmission = new Map<string, OwnedSubmission["changesRequestedFeedback"]>();
  for (const decision of changeDecisionRows) {
    if (!feedbackBySubmission.has(decision.submissionId)) {
      feedbackBySubmission.set(decision.submissionId, {
        revisionNumber: decision.revisionNumber,
        rationale: decision.rationale,
        recordedAt: decision.recordedAt,
      });
    }
  }

  const submissions: OwnedSubmission[] = rows.map((row) => ({
    ...row,
    latestRevisionNumber: latestRevisionBySubmission.get(row.id) ?? null,
    changesRequestedFeedback:
      row.currentStatus === "changes_requested" ? (feedbackBySubmission.get(row.id) ?? null) : null,
  }));

  return submissions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

// ---- Agent queue ----

export const QUEUE_FILTERS = [
  "waiting",
  "in-review",
  "changes-requested",
  "completed",
  "demo",
] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

const STATUS_BY_FILTER: Record<Exclude<QueueFilter, "demo">, string[]> = {
  waiting: ["waiting_for_agent_review"],
  "in-review": ["in_agent_review"],
  "changes-requested": ["changes_requested"],
  completed: ["internally_accepted", "agent_review_complete"],
};

export function coerceQueueFilter(value: unknown): QueueFilter {
  return (QUEUE_FILTERS as readonly string[]).includes(value as string)
    ? (value as QueueFilter)
    : "waiting";
}

export interface QueueRow {
  submissionId: string;
  revisionId: string;
  revisionNumber: number;
  status: string;
  isDemo: boolean;
  submitterDisplayName: string;
  profileId: string;
  profileVersion: string;
  submittedAt: Date;
  createdAt: Date;
}

export interface QueuePage {
  rows: QueueRow[];
  total: number;
}

/**
 * Agent queue: latest revision per submission joined to the submitter's display
 * name. Server-side pagination, a stable oldest-first order with a deterministic
 * tie-breaker, and validated filters (unknown → waiting). Demo rows are
 * identifiable and only included by the explicit `demo` filter.
 */
export async function queryAgentQueue(args: {
  filter: QueueFilter;
  page: number;
  pageSize: number;
}): Promise<QueuePage> {
  const { filter, page, pageSize } = args;

  const conditions =
    filter === "demo"
      ? [eq(schema.submissions.isDemo, true)]
      : [
          eq(schema.submissions.isDemo, false),
          inArray(schema.submissions.currentStatus, STATUS_BY_FILTER[filter]),
        ];
  const whereClause = and(...conditions);

  const totalRows = (await db
    .select({ value: count() })
    .from(schema.submissions)
    .where(whereClause)) as { value: number }[];
  const total = Number(totalRows[0]?.value ?? 0);

  // Oldest waiting first, tie-broken by submission id for determinism.
  const submissionRows = (await db
    .select({
      id: schema.submissions.id,
      currentStatus: schema.submissions.currentStatus,
      isDemo: schema.submissions.isDemo,
      createdAt: schema.submissions.createdAt,
      creatorId: schema.submissions.creatorId,
    })
    .from(schema.submissions)
    .where(whereClause)
    .orderBy(asc(schema.submissions.createdAt), asc(schema.submissions.id))
    .limit(pageSize)
    .offset(page * pageSize)) as {
    id: string;
    currentStatus: string;
    isDemo: boolean;
    createdAt: Date;
    creatorId: string;
  }[];

  if (submissionRows.length === 0) return { rows: [], total };

  const submissionIds = submissionRows.map((r) => r.id);
  const creatorIds = [...new Set(submissionRows.map((r) => r.creatorId))];

  const revisionRows = (await db
    .select({
      submissionId: schema.submissionRevisions.submissionId,
      id: schema.submissionRevisions.id,
      revisionNumber: schema.submissionRevisions.revisionNumber,
      profileId: schema.submissionRevisions.profileId,
      profileVersion: schema.submissionRevisions.profileVersion,
      submittedBy: schema.submissionRevisions.submittedBy,
      submittedAt: schema.submissionRevisions.submittedAt,
    })
    .from(schema.submissionRevisions)
    .where(inArray(schema.submissionRevisions.submissionId, submissionIds))
    .orderBy(desc(schema.submissionRevisions.revisionNumber))) as {
    submissionId: string;
    id: string;
    revisionNumber: number;
    profileId: string;
    profileVersion: string;
    submittedBy: string;
    submittedAt: Date;
  }[];

  // Latest revision per submission (rows are revision-number-desc).
  const latestRevision = new Map<string, (typeof revisionRows)[number]>();
  for (const rev of revisionRows) {
    if (!latestRevision.has(rev.submissionId)) latestRevision.set(rev.submissionId, rev);
  }

  const userRows = (await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.id, creatorIds))) as {
    id: string;
    name: string | null;
    email: string;
  }[];
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const rows: QueueRow[] = submissionRows.flatMap((sub) => {
    const rev = latestRevision.get(sub.id);
    if (!rev) return [];
    const submitter = userById.get(sub.creatorId);
    return [
      {
        submissionId: sub.id,
        revisionId: rev.id,
        revisionNumber: rev.revisionNumber,
        status: sub.currentStatus,
        isDemo: sub.isDemo,
        submitterDisplayName: submitter?.name?.trim() || submitter?.email || "Unknown submitter",
        profileId: rev.profileId,
        profileVersion: rev.profileVersion,
        submittedAt: rev.submittedAt,
        createdAt: sub.createdAt,
      },
    ];
  });

  return { rows, total };
}
