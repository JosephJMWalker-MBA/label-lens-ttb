export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { releaseSubmissionClaim } from "@/server/agent-review/actions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return releaseSubmissionClaim(request, id);
}
