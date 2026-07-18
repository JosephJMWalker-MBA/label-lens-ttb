import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type {
  PackageCategoryAnalysis,
  PackageCategoryDefinition,
  PackageCategoryDraft,
} from "./package-model";
import type { PackageCategoryInstruction } from "./package-profile";

const ANALYSIS_LABEL = {
  clearly_readable: "Clearly readable",
  needs_review: "Needs review",
  not_found: "Not found",
  not_applicable: "Not applicable",
} as const;

export function GuidedCategoryTask({
  definition,
  instruction,
  category,
  analysis,
  taskPosition,
  taskCount,
  workingValue,
  pendingRegionAvailable,
  accepting,
  onWorkingValueChange,
  onAccept,
  onNeedsAttention,
  onBack,
  onNext,
}: {
  definition: PackageCategoryDefinition;
  instruction: PackageCategoryInstruction;
  category: PackageCategoryDraft;
  analysis: PackageCategoryAnalysis | undefined;
  taskPosition: number;
  taskCount: number;
  workingValue: string;
  pendingRegionAvailable: boolean;
  accepting: boolean;
  onWorkingValueChange: (value: string) => void;
  onAccept: () => void;
  onNeedsAttention: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const committedRegions = category.regions.length;
  const canAccept =
    (!definition.requiresValue || workingValue.trim() !== "") &&
    (pendingRegionAvailable || committedRegions > 0) &&
    !accepting;

  return (
    <aside
      className="flex min-w-0 flex-col gap-4 rounded-md border border-border bg-card p-4 lg:sticky lg:top-52"
      aria-labelledby={`guided-task-${definition.categoryId}`}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Focused task {taskPosition} of {taskCount}
        </p>
        <h3 id={`guided-task-${definition.categoryId}`} className="text-xl font-semibold">
          {definition.label}
        </h3>
        <p className="mt-1 text-sm">{instruction.plainLanguageQuestion}</p>
        <p className="mt-1 text-xs text-muted-foreground">{instruction.placementHint}</p>
      </div>

      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <p className="font-semibold">Starter box</p>
        <p>
          Move or resize the starter box to enclose the printed text. Draw a replacement if the
          suggested area is wrong. Nothing enters seller history until you accept this category.
        </p>
      </div>

      <div>
        <Label htmlFor="seller-expected-value">What the label says</Label>
        <Input
          id="seller-expected-value"
          value={workingValue}
          placeholder={instruction.exampleValue}
          onChange={(event) => onWorkingValueChange(event.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Seller-provided context never overwrites machine-observed text.
        </p>
      </div>

      <div className="rounded-md border border-border p-3 text-sm">
        <p className="font-semibold">Evidence for this category</p>
        <p className="text-muted-foreground">
          {committedRegions} accepted region{committedRegions === 1 ? "" : "s"}
          {pendingRegionAvailable ? " · 1 uncommitted working box" : ""}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" disabled={!canAccept} onClick={onAccept}>
          {accepting ? "Saving accepted category…" : `Accept ${definition.label}`}
        </Button>
        <Button type="button" variant="outline" disabled={accepting} onClick={onNeedsAttention}>
          Mark as needs attention
        </Button>
        {instruction.notPresentAllowed ? (
          <Button type="button" variant="outline" disabled={accepting}>
            Mark not present
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
        <Button type="button" size="sm" variant="outline" onClick={onBack}>
          Back category
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onNext}>
          Next category
        </Button>
      </div>

      <details className="rounded-md border border-border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Technical details</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Registry requirement {definition.requirementId} v{definition.requirementVersion} ·{" "}
          {definition.applicability}. Coordinates remain normalized to the selected panel only.
        </p>
        <p className="mt-2">
          Latest pre-check: {analysis ? ANALYSIS_LABEL[analysis.state] : "Not run"}
        </p>
        {analysis ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Observed: {analysis.observedValue ?? "No observed value"}. {analysis.reason}
          </p>
        ) : null}
      </details>
    </aside>
  );
}
