"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

import { ExportPanel } from "./ExportPanel";
import { emptyProjectFacts, type ProjectFacts } from "./facts";
import { GuidedFacts } from "./GuidedFacts";
import { LabelScaffold } from "./LabelScaffold";
import { buildRequirementsSummary } from "./requirements-summary";
import { RequirementsSummaryView } from "./RequirementsSummaryView";

/**
 * The maker-first journey, as one route.
 *
 * Facts → Summary → Scaffold → Export. It is a single route holding the session
 * in React state on purpose: this slice adds no persistence, so a multi-route
 * flow would silently need a store to survive navigation, and a store is the one
 * thing the maintainer decision has not yet authorized.
 *
 * The stages are always reachable in both directions and nothing is gated on
 * completeness. A maker who knows none of their facts can still walk the whole
 * journey and export what little they have — that is the point of the slice.
 */

const STAGES = [
  { id: "facts", label: "Your product" },
  { id: "summary", label: "What you told us" },
  { id: "scaffold", label: "Starter scaffold" },
  { id: "export", label: "Export" },
] as const;

type StageId = (typeof STAGES)[number]["id"];

export function CreateWorkspace() {
  const [facts, setFacts] = useState<ProjectFacts>(emptyProjectFacts);
  const [stage, setStage] = useState<StageId>("facts");

  const summary = useMemo(() => buildRequirementsSummary(facts), [facts]);
  const index = STAGES.findIndex((s) => s.id === stage);

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Project stages">
        <ol className="flex list-none flex-wrap gap-1.5 p-0">
          {STAGES.map((s, i) => (
            <li key={s.id}>
              <Button
                type="button"
                variant={s.id === stage ? "default" : "outline"}
                size="sm"
                aria-current={s.id === stage ? "step" : undefined}
                onClick={() => setStage(s.id)}
              >
                <span aria-hidden="true" className="mr-1.5 text-xs opacity-70">
                  {i + 1}
                </span>
                {s.label}
              </Button>
            </li>
          ))}
        </ol>
      </nav>

      {stage === "facts" ? <GuidedFacts facts={facts} onChange={setFacts} /> : null}
      {stage === "summary" ? <RequirementsSummaryView summary={summary} /> : null}
      {stage === "scaffold" ? <LabelScaffold facts={facts} /> : null}
      {stage === "export" ? <ExportPanel facts={facts} /> : null}

      <div className="flex flex-wrap gap-3 border-t border-border pt-6">
        {index > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStage(STAGES[index - 1].id)}>
            Back
          </Button>
        ) : null}
        {index < STAGES.length - 1 ? (
          <Button type="button" onClick={() => setStage(STAGES[index + 1].id)}>
            Continue
          </Button>
        ) : null}
      </div>

      <p className="max-w-2xl rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        This tool supports preparation. It does not approve or reject a label, and it is not a TTB
        approval or legal determination.
      </p>
    </div>
  );
}
