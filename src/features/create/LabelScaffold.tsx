import { PROJECT_FACTS, type ProjectFacts } from "./facts";

/**
 * A bounded, non-authoritative starter scaffold.
 *
 * This is the surface most able to lie. A label-shaped box with text placed in
 * it *looks* like a layout that someone checked — and nothing in this system
 * checks placement, size, contrast, or typography, because no rule in this
 * repository evaluates any of them.
 *
 * The safeguards are therefore structural, not decorative:
 *
 *  - the disclaimer is rendered unconditionally, before the artwork, and is not
 *    collapsible, dismissible, or conditional on any state;
 *  - slots appear in a fixed reading order and are labelled as *slots*, not as
 *    positions — the order is not a recommendation;
 *  - nothing is styled to look finished: no type scale is implied, no colour
 *    encodes status, and there is no tick, score, or "looks good" of any kind;
 *  - a fact with no value shows "Not provided yet" rather than being hidden, so
 *    the scaffold never quietly looks complete.
 */

/** The fixed order slots are listed in. Reading order only — not a layout. */
const SLOT_ORDER = [
  "brandName",
  "classType",
  "alcoholStatement",
  "netContents",
  "producerBottler",
  "country",
] as const;

export const SCAFFOLD_DISCLAIMER_HEADING = "Starting point only. This is not a compliant layout.";

export function LabelScaffold({ facts }: { facts: ProjectFacts }) {
  return (
    <section aria-labelledby="scaffold-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="scaffold-heading" className="text-2xl font-semibold tracking-tight">
          Here is a starter scaffold
        </h2>
        <p className="max-w-2xl text-muted-foreground">
          A place to begin from, built only from what you told us.
        </p>
      </div>

      {/* Rendered before the artwork, unconditionally. Never collapsible. */}
      <div className="max-w-2xl rounded-md border border-alert-foreground/30 bg-alert p-4 text-sm text-alert-foreground">
        <p className="font-semibold">{SCAFFOLD_DISCLAIMER_HEADING}</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          <li>Nothing here has been checked. This system does not evaluate a layout.</li>
          <li>
            Placement, size, contrast, and typography are not checked by anything in this system,
            and no rule in it evaluates them.
          </li>
          <li>The order of the slots below is a reading order, not a recommended position.</li>
          <li>
            Fields with no cited requirement in this system may still be required. Their presence or
            absence here means nothing.
          </li>
        </ul>
      </div>

      <figure className="flex max-w-md flex-col gap-2">
        <div className="proof-card flex flex-col gap-4 p-8">
          {SLOT_ORDER.map((id) => {
            const definition = PROJECT_FACTS.find((fact) => fact.id === id);
            if (!definition) return null;
            const value = facts[id];
            return (
              <div key={id} className="flex flex-col gap-0.5 border-l-2 border-dashed pl-3">
                <span className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                  {definition.label} slot
                </span>
                {value === null ? (
                  <span className="text-sm italic text-muted-foreground">Not provided yet</span>
                ) : (
                  <span className="break-words text-sm font-medium">{value}</span>
                )}
              </div>
            );
          })}
        </div>
        <figcaption className="text-xs text-muted-foreground">
          Slots, in reading order. A dashed edge marks each slot as a placeholder, not a placement.
        </figcaption>
      </figure>
    </section>
  );
}
