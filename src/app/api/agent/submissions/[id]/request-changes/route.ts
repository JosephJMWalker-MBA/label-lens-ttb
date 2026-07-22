export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requestSubmissionChanges } from "@/server/agent-review/actions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return requestSubmissionChanges(request, id);
}
