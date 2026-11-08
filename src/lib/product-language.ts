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

/**
 * The official-filing handoff. Label Lens never files anything with TTB; a
 * seller who wants label approval applies separately through TTB's own online
 * system. The URL is the official COLAs Online page named in the owner's
 * product direction (issue #226). It is a pointer to the official process, not
 * a claim that Label Lens is connected to it.
 */
export const OFFICIAL_FILING_HANDOFF = {
  label: "TTB COLAs Online",
  url: "https://www.ttb.gov/online-services/colas-online/",
  statement:
    "Label Lens does not file anything with TTB. To apply for label approval, you file your own application through TTB's COLAs Online.",
} as const;

export interface SellerNextStep {
  /** One short instruction, in the seller's language. */
  title: string;
  /** What is happening and who acts next. Never an approval claim. */
  detail: string;
  /** Whether the seller has something to do right now. */
  sellerActionRequired: boolean;
}

/** What the seller should do next for a server-recorded internal-review status. */
export function sellerNextStepForStatus(status: string): SellerNextStep {
  switch (status) {
    case "waiting_for_agent_review":
      return {
        title: "Nothing to do right now",
        detail: "Your package is waiting for a Label Lens reviewer to pick it up.",
        sellerActionRequired: false,
      };
    case "in_agent_review":
      return {
        title: "Nothing to do right now",
        detail: "A Label Lens reviewer is checking your package.",
        sellerActionRequired: false,
      };
    case "changes_requested":
      return {
        title: "Respond to the requested changes",
        detail:
          "A reviewer asked for changes. Your submitted revision stays on record; you send a corrected revision.",
        sellerActionRequired: true,
      };
    case "internally_accepted":
      return {
        title: "File officially when you are ready",
        detail: `The internal review is complete. This is not a TTB approval. ${OFFICIAL_FILING_HANDOFF.statement}`,
        sellerActionRequired: true,
      };
    case "agent_review_complete":
      return {
        title: "Internal review complete",
        detail: `This is not a TTB approval. ${OFFICIAL_FILING_HANDOFF.statement}`,
        sellerActionRequired: false,
      };
    case "withdrawn":
      return {
        title: "No further action",
        detail: "This submission was withdrawn from internal review.",
        sellerActionRequired: false,
      };
    default:
      return {
        title: "Check the submission details",
        detail: "Open the submission to see its recorded status history.",
        sellerActionRequired: false,
      };
  }
}
