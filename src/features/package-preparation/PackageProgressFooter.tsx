import type { GuidedPackageWorkflow, PackageSaveState } from "./package-workflow";

const STATUS_CLASS = {
  current: "border-blue-600 bg-blue-600 text-white",
  complete: "border-emerald-700 bg-emerald-50 text-emerald-950",
  needs_attention: "border-amber-500 bg-amber-50 text-amber-950",
  not_started: "border-border bg-muted/40 text-muted-foreground",
  blocked: "border-red-600 bg-red-50 text-red-950",
} as const;

const STATUS_LABEL = {
  current: "Current",
  complete: "Complete",
  needs_attention: "Needs attention",
  not_started: "Not started",
  blocked: "Blocked",
} as const;

export function PackageProgressFooter({
  workflow,
  saveState,
  analysisRunCount,
}: {
  workflow: GuidedPackageWorkflow;
  saveState: PackageSaveState;
  analysisRunCount: number;
}) {
  return (
    <footer
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur"
      aria-labelledby="package-progress-heading"
      data-testid="package-progress-footer"
    >
      <div className="mx-auto flex max-w-[1600px] min-w-0 flex-col gap-2 px-3 py-2 sm:px-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2 id="package-progress-heading" className="shrink-0 text-xs font-semibold sm:text-sm">
            Package progress
          </h2>
          <p className="truncate text-xs font-medium text-blue-800">
            Next: {workflow.recommendedAction}
          </p>
        </div>
        <ol
          className="flex min-w-0 snap-x gap-2 overflow-x-auto pb-1 text-xs"
          aria-label="Package lifecycle"
        >
          {workflow.progressStages.map((stage) => (
            <li
              key={stage.id}
              className={`min-w-[7.25rem] snap-start rounded-md border px-2 py-1.5 ${STATUS_CLASS[stage.status]}`}
              aria-current={stage.status === "current" ? "step" : undefined}
              data-stage={stage.id}
              data-status={stage.status}
            >
              <span className="block font-semibold">{stage.label}</span>
              <span className="block opacity-80">{STATUS_LABEL[stage.status]}</span>
            </li>
          ))}
        </ol>
        <div className="flex min-w-0 gap-x-4 overflow-x-auto whitespace-nowrap text-[0.7rem] text-muted-foreground sm:text-xs">
          <span>
            Panels: front {workflow.frontUploaded ? "uploaded" : "needed"} · back{" "}
            {workflow.backUploaded ? "uploaded" : workflow.backAbsent ? "absent" : "unresolved"} ·
            additional {workflow.additionalResolved ? "resolved" : "unresolved"}
          </span>
          <span>
            Categories: {workflow.completedCategoryCount}/{workflow.totalCategoryCount}
          </span>
          <span>Draft: {saveState}</span>
          <span>
            Pre-check:{" "}
            {analysisRunCount === 0 ? "not run" : workflow.analysisCurrent ? "current" : "stale"}
          </span>
          <span>Preparation: {workflow.readyForAgentPackage ? "ready" : "not ready"}</span>
        </div>
      </div>
    </footer>
  );
}
