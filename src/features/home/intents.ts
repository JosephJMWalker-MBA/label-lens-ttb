/**
 * The five entry intents offered on the home page, and — honestly — which of
 * them the product can actually serve today.
 *
 * Two capabilities exist: reviewing a finished label, and learning what the
 * system checks. The other three are named because the product should tell a
 * visitor what it is *for*, not because they are implemented. Their copy states
 * plainly what is missing, never "coming soon", never a waitlist, never a
 * disabled control that implies a working one is a click away.
 *
 * An unavailable intent renders no interactive control at all. Availability is
 * carried in text so it survives a screen reader, high-contrast mode, and a
 * stylesheet failure — it is never signalled by colour or dimming alone.
 */

export interface AvailableIntent {
  id: string;
  title: string;
  /** What choosing this does, in the visitor's language. */
  summary: string;
  status: "available";
  href: string;
  /** The label of the control that enters this path. */
  action: string;
}

export interface UnavailableIntent {
  id: string;
  title: string;
  summary: string;
  status: "unavailable";
  /** Exactly what the product cannot do. Stated as fact, not as a roadmap. */
  absence: string;
  /** The honest thing the visitor can do instead, if there is one. */
  instead: string;
}

export type Intent = AvailableIntent | UnavailableIntent;

export const INTENTS: readonly Intent[] = [
  {
    id: "create",
    title: "Create a new label",
    summary:
      "Start from your product facts, without any artwork. See the requirements this system can cite, and take away a starter scaffold.",
    status: "available",
    href: "/create",
    action: "Start from facts",
  },
  {
    id: "improve",
    title: "Improve an existing draft",
    summary: "Work on a label you have already started.",
    status: "unavailable",
    absence:
      "Label Lens cannot edit artwork, and it cannot compare a draft against an earlier version — nothing is stored between runs.",
    instead: "You can run a draft through the review flow to see what the system reads from it.",
  },
  {
    id: "review",
    title: "Review a label before submission",
    summary:
      "Upload finished artwork. The system reads it, compares it with the facts you state, and shows you the evidence.",
    status: "available",
    href: "/review",
    action: "Review a label",
  },
  {
    id: "learn",
    title: "Learn labeling requirements",
    summary:
      "See every check the system performs, the source each check cites, and what it cannot determine from artwork alone.",
    status: "available",
    href: "/learn",
    action: "See what is checked",
  },
  {
    id: "help",
    title: "Find professional help",
    summary: "Designers, printers, packaging vendors, regulatory specialists, distributors.",
    status: "unavailable",
    absence:
      "There is no provider directory. Label Lens does not list, recommend, or refer any designer, printer, packaging vendor, regulatory specialist, or distributor.",
    instead:
      "The review result names each unresolved item, which is the part a professional would need from you.",
  },
] as const;

/** The intents a visitor can actually enter today. */
export function availableIntents(): AvailableIntent[] {
  return INTENTS.filter((intent): intent is AvailableIntent => intent.status === "available");
}

/** The intents named on the page but not implemented. */
export function unavailableIntents(): UnavailableIntent[] {
  return INTENTS.filter((intent): intent is UnavailableIntent => intent.status === "unavailable");
}
