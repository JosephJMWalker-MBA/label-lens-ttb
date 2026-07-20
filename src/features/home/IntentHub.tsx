import Link from "next/link";

import { INTENTS, type AvailableIntent, type UnavailableIntent } from "./intents";

/**
 * The intent hub: the product's front door.
 *
 * It asks what the visitor wants to do before assuming they arrived with a
 * finished label — the assumption the previous single-page upload form made of
 * everyone. Two intents lead somewhere; three say plainly that they do not.
 *
 * The hub asserts nothing about any label. It carries no status, no score, and
 * no readiness indicator, because at this point the product has seen nothing.
 */
export function IntentHub() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What would you like to do today?
        </h1>
        <p className="text-lg text-foreground">
          Upload your label — or, if you do not have one yet, build it here.
        </p>
        <p className="max-w-2xl text-muted-foreground">
          Four of these paths work today. The rest are named so you can see what Label Lens is for,
          and told plainly what it cannot do yet.
        </p>
      </div>

      <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {INTENTS.map((intent) =>
          intent.status === "available" ? (
            <AvailableCard key={intent.id} intent={intent} />
          ) : (
            <UnavailableCard key={intent.id} intent={intent} />
          ),
        )}
      </ul>

      <p className="max-w-2xl rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        This tool supports preparation and review. It does not approve or reject a label, and it is
        not a TTB approval or legal determination.
      </p>
    </div>
  );
}

/** An intent that leads somewhere. The whole card is one link. */
function AvailableCard({ intent }: { intent: AvailableIntent }) {
  return (
    <li className="proof-card flex">
      <Link
        href={intent.href}
        className="group flex w-full flex-col gap-2 rounded-md p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="text-base font-semibold group-hover:underline">{intent.title}</span>
        <span className="text-sm text-muted-foreground">{intent.summary}</span>
        <span className="mt-auto pt-2 text-sm font-medium">
          {intent.action}
          <span aria-hidden="true"> →</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * An intent that does not work. It renders no control — no button, no link, no
 * disabled affordance — because there is nothing to activate. The status is
 * plain text, so it is announced, not merely styled.
 */
function UnavailableCard({ intent }: { intent: UnavailableIntent }) {
  return (
    <li className="proof-card proof-card--inert flex flex-col gap-2 p-5">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-base font-semibold text-muted-foreground">{intent.title}</span>
        <span className="rounded border border-border px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          Not available yet
        </span>
      </p>
      <p className="text-sm text-muted-foreground">{intent.summary}</p>
      <p className="text-sm text-muted-foreground">{intent.absence}</p>
      <p className="mt-auto pt-2 text-sm text-muted-foreground">{intent.instead}</p>
    </li>
  );
}
