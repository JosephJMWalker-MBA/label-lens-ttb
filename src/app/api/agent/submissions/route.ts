import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireApiRole } from "@/server/auth/guards";
import { coerceQueueFilter, queryAgentQueue } from "@/server/submissions/queries";
import { nextActionForStatus } from "@/lib/product-language";

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 25;

export async function GET(request: Request) {
  // Agent/admin only. Sellers and anonymous callers never reach the queue.
  const auth = await requireApiRole(request, ["agent", "admin"]);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const filter = coerceQueueFilter(url.searchParams.get("filter"));

  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "0", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 0;

  const rawPageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "", 10);
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const { rows, total } = await queryAgentQueue({ filter, page, pageSize });
  const now = Date.now();

  // A controlled view model only: no canonical JSON, storage keys, filesystem
  // paths, integrity secrets, or signatures are ever included.
  const items = rows.map((row) => ({
    submissionId: row.submissionId,
    revisionId: row.revisionId,
    revisionNumber: row.revisionNumber,
    status: row.status,
    isDemo: row.isDemo,
    submitter: { displayName: row.submitterDisplayName },
    profile: { id: row.profileId, version: row.profileVersion },
    submittedAt: row.submittedAt.toISOString(),
    ageSeconds: Math.max(0, Math.floor((now - row.createdAt.getTime()) / 1000)),
    nextAction: nextActionForStatus(row.status),
  }));

  return NextResponse.json({ items, page, pageSize, total, filter });
}
