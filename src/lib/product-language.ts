/**
 * Truthful product language for the internal review portal. This portal is an
 * internal package-preparation and review workflow. It never issues, and must
 * never imply, a TTB, COLA, government, legal, or regulatory approval.
 */

export const PORTAL_DISCLAIMER =
  "This portal supports internal package preparation and review. It does not provide TTB, COLA, government, legal, or regulatory approval.";

export const INTERNAL_REVIEW_RECORD_NOTICE =
  "Internal review record. This is not a TTB, COLA, government, legal, or regulatory determination.";

/** Human-readable, non-approval labels for the internal workflow states. */
const STATUS_LABELS: Record<string, string> = {
  waiting_for_agent_review: "Waiting for agent review",
  in_agent_review: "In review",
  changes_requested: "Changes requested",
  internally_accepted: "Internally accepted for next step",
  agent_review_complete: "Agent review complete",
  withdrawn: "Withdrawn",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** The internal next action an agent would take for a given status. */
export function nextActionForStatus(status: string): string {
  switch (status) {
    case "waiting_for_agent_review":
      return "Begin internal review";
    case "in_agent_review":
      return "Continue internal review";
    case "changes_requested":
      return "Awaiting seller changes";
    case "internally_accepted":
      return "Internally accepted for next step";
    case "agent_review_complete":
      return "Agent review complete";
    default:
      return "Review";
  }
}
