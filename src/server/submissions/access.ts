import "server-only";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db/client";
import { readSessionFromHeaders, type Role, type SessionUser } from "@/server/auth/guards";

export interface SubmissionRow {
  id: string;
  creatorId: string;
  currentStatus: string;
  isDemo: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SubmissionAccess =
  | { ok: true; user: SessionUser; submission: SubmissionRow }
  | { ok: false; response: NextResponse };

/** A submission id must be a short, bounded, path-safe token. */
export function isValidSubmissionId(id: unknown): id is string {
  return (
    typeof id === "string" && id.length > 0 && id.length <= 255 && /^[A-Za-z0-9._-]+$/.test(id)
  );
}

/**
 * Authorize access to a single submission. Access is granted when the caller
 * holds one of `allowedRoles` OR is the submission's creator. Missing session →
 * 401. A malformed id, a missing submission, or an unauthorized submission all
 * return an identical 404 so the boundary never reveals whether another party's
 * submission exists.
 */
export async function requireSubmissionOwnerOrRole(
  request: Request,
  submissionId: unknown,
  allowedRoles: readonly Role[],
): Promise<SubmissionAccess> {
  const user = await readSessionFromHeaders(request.headers);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  const notFound = () =>
    ({
      ok: false,
      response: NextResponse.json({ error: "Submission not found." }, { status: 404 }),
    }) as const;

  if (!isValidSubmissionId(submissionId)) return notFound();

  const rows = (await db
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, submissionId))
    .limit(1)) as SubmissionRow[];

  const submission = rows[0];
  if (!submission) return notFound();

  const roleAllowed = allowedRoles.includes(user.role);
  const isOwner = submission.creatorId === user.id;
  if (!roleAllowed && !isOwner) return notFound();

  return { ok: true, user, submission };
}
