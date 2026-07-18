import type {
  GuidedPackageWorkflow,
  PackageSaveState,
  PackageWorkflowPhase,
} from "./package-workflow";

const PHASES: readonly { id: PackageWorkflowPhase; label: string }[] = [
  { id: "learn", label: "Learn" },
  { id: "upload", label: "Upload" },
  { id: "mark", label: "Mark" },
  { id: "save", label: "Save + pre-check" },
  { id: "fix", label: "Fix" },
  { id: "prepare", label: "Prepare for agent" },
];

export function PackageProgressHeader({
  packageId,
  workflow,
  saveState,
  analysisRunCount,
  message,
}: {
  packageId: string;
  workflow: GuidedPackageWorkflow;
  saveState: PackageSaveState;
  analysisRunCount: number;
  message: string;
}) {
  return (
    <section
      className="sticky top-0 z-20 min-w-0 rounded-md border border-border bg-background/95 p-3 shadow-sm backdrop-blur sm:p-4"
      aria-labelledby="package-progress-heading"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p id="package-progress-heading" className="break-words text-sm font-semibold">
              Guided package progress
            </p>
            <p className="break-all text-xs text-muted-foreground">Package {packageId}</p>
          </div>
          <p className="rounded border border-primary/40 bg-primary/5 px-2 py-1 text-xs font-semibold">
            Next: {workflow.recommendedAction}
          </p>
        </div>

        <ol className="grid min-w-0 grid-cols-2 gap-1 text-xs sm:grid-cols-3 lg:grid-cols-6">
          {PHASES.map((phase) => {
            const current = phase.id === workflow.phase;
            return (
              <li
                key={phase.id}
                aria-current={current ? "step" : undefined}
                className={`min-w-0 rounded border px-2 py-1.5 ${
                  current
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/20 text-muted-foreground"
                }`}
              >
                <span className="block break-words font-medium">{phase.label}</span>
                {current ? <span className="block">Current phase</span> : null}
              </li>
            );
          })}
        </ol>

        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Panels: {workflow.frontUploaded ? "front ✓" : "front needed"} ·{" "}
            {workflow.backUploaded ? "back ✓" : "back needed"}
          </span>
          <span>
            Categories: {workflow.completedCategoryCount}/{workflow.totalCategoryCount} complete
          </span>
          <span>Local draft: {saveState}</span>
          <span>Pre-check runs: {analysisRunCount}</span>
        </div>
        <p className="break-words text-sm" role="status" aria-live="polite">
          {message}
        </p>
      </div>
    </section>
  );
}
