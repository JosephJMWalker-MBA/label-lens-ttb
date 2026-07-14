"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { PROJECT_FACTS, WINE_BEVERAGE_TYPE, toStoredValue, type ProjectFacts } from "./facts";

/**
 * Guided intake. It collects; it does not evaluate.
 *
 * Nothing here is marked required, and nothing is blocked on being answered.
 * Every field may be left blank, and a blank field is a recorded state — "not
 * provided yet" — rather than an error. The product must be enterable by someone
 * who does not yet know their own answers; that is the whole reason this slice
 * exists.
 */
export function GuidedFacts({
  facts,
  onChange,
}: {
  facts: ProjectFacts;
  onChange: (facts: ProjectFacts) => void;
}) {
  function setFact(id: keyof ProjectFacts, raw: string) {
    onChange({ ...facts, [id]: toStoredValue(raw) });
  }

  const categoryUnsupported =
    facts.beverageType !== null && facts.beverageType !== WINE_BEVERAGE_TYPE;

  return (
    <section aria-labelledby="facts-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="facts-heading" className="text-2xl font-semibold tracking-tight">
          Tell us about your product
        </h2>
        <p className="max-w-2xl text-muted-foreground">
          Answer what you know. Leave anything you do not know blank — &ldquo;not provided
          yet&rdquo; is a real answer here, and nothing is checked against these values.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {PROJECT_FACTS.map((fact) => {
          const value = facts[fact.id] ?? "";
          const helpId = `${fact.id}-help`;
          return (
            <div key={fact.id} className="flex flex-col gap-1.5">
              <Label htmlFor={fact.id}>{fact.label}</Label>
              <p id={helpId} className="text-xs text-muted-foreground">
                {fact.help}
              </p>
              {fact.options ? (
                <select
                  id={fact.id}
                  aria-describedby={helpId}
                  className="h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  value={value}
                  onChange={(event) => setFact(fact.id, event.target.value)}
                >
                  <option value="">Not provided yet</option>
                  {fact.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={fact.id}
                  aria-describedby={helpId}
                  value={value}
                  onChange={(event) => setFact(fact.id, event.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>

      {categoryUnsupported ? (
        <p
          role="status"
          className="max-w-2xl rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          This system has a requirements profile for wine only. Your facts are still recorded and
          exported, but no cited requirements can be shown for this category — the system holds
          none.
        </p>
      ) : null}
    </section>
  );
}
