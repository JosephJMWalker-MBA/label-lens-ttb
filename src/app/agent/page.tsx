import Link from "next/link";

import { PortalHeader } from "@/components/layout/PortalHeader";
import { requireRolePage } from "@/server/auth/guards";
import { coerceQueueFilter, queryAgentQueue, type QueueFilter } from "@/server/submissions/queries";
import {
  INTERNAL_REVIEW_RECORD_NOTICE,
  nextActionForStatus,
  statusLabel,
} from "@/lib/product-language";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const FILTER_TABS: { value: QueueFilter; label: string }[] = [
  { value: "waiting", label: "Waiting for agent review" },
  { value: "in-review", label: "In review" },
  { value: "changes-requested", label: "Changes requested" },
  { value: "completed", label: "Recently completed" },
  { value: "demo", label: "Demo" },
];

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;
}

function ageLabel(fromSeconds: number): string {
  if (fromSeconds < 60) return "just now";
  const minutes = Math.floor(fromSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const user = await requireRolePage(["agent", "admin"]);
  const params = await searchParams;
  const filter = coerceQueueFilter(params.filter);
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);

  const { rows, total } = await queryAgentQueue({ filter, page, pageSize: PAGE_SIZE });
  const now = Date.now();

  return (
    <>
      <PortalHeader user={user} />
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Agent review queue
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Submissions</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{INTERNAL_REVIEW_RECORD_NOTICE}</p>

        <nav aria-label="Queue filters" className="mt-6 flex flex-wrap gap-2">
          {FILTER_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={`/agent?filter=${tab.value}`}
              aria-current={tab.value === filter ? "page" : undefined}
              className="rounded-full border border-border/70 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:bg-primary/10 aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <p className="mt-4 text-sm text-muted-foreground" data-testid="queue-total">
          {total} submission{total === 1 ? "" : "s"}
        </p>

        {rows.length === 0 ? (
          <p className="mt-6 rounded-md border border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            No submissions in this view.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2" data-testid="queue-list">
            {rows.map((row) => (
              <li
                key={row.submissionId}
                className="rounded-md border border-border/70 px-4 py-3 hover:border-border"
              >
                <Link
                  href={`/agent/submissions/${encodeURIComponent(row.submissionId)}`}
                  className="flex flex-wrap items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-mono text-sm">
                      {shortId(row.submissionId)}
                      {row.isDemo ? (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                          Demo submission
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.submitterDisplayName} · {row.profileId} v{row.profileVersion} · rev v
                      {row.revisionNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{statusLabel(row.status)}</p>
                    <p className="text-xs text-muted-foreground">
                      {nextActionForStatus(row.status)} ·{" "}
                      {ageLabel(Math.floor((now - row.createdAt.getTime()) / 1000))} in queue
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
