export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { claimSubmission } from "@/server/agent-review/actions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return claimSubmission(request, id);
}
