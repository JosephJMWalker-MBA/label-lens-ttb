import { Button } from "@/components/ui/button";

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

export interface PackageFooterAction {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  reason?: string;
  pending?: boolean;
}

export function PackageProgressFooter({
  workflow,
  saveState,
  analysisRunCount,
  action,
  elapsedLabel,
}: {
  workflow: GuidedPackageWorkflow;
  saveState: PackageSaveState;
  analysisRunCount: number;
  action: PackageFooterAction;
  elapsedLabel?: string;
}) {
  return (
    <footer
      // Sits at the viewport bottom, but lifts above the sticky account bar when
      // that bar is mounted (globals.css sets --stacked-footer-bottom), so the
      // persistent "Sign in" / account action is never covered.
      className="fixed inset-x-0 z-50 border-t border-border bg-background/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur"
      style={{ bottom: "var(--stacked-footer-bottom, 0px)" }}
      aria-labelledby="package-progress-heading"
      data-testid="package-progress-footer"
    >
      <div className="mx-auto grid max-w-[1600px] min-w-0 gap-3 px-3 py-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="flex min-w-0 flex-col gap-2">
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
        <div
          className="min-w-0 rounded-md border border-blue-600/40 bg-blue-50 p-2.5 shadow-[0_0_18px_rgba(37,99,235,0.12)] lg:w-[20rem]"
          data-testid="footer-stage-action"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-900">
              Complete this stage
            </p>
            {action.pending && elapsedLabel ? (
              <span className="font-mono text-xs text-blue-950">{elapsedLabel}</span>
            ) : null}
          </div>
          <Button
            type="button"
            className="mt-1.5 w-full"
            disabled={action.disabled || action.pending}
            onClick={action.onClick}
            aria-describedby={action.reason ? "footer-action-reason" : undefined}
            data-stage-completion-action
          >
            {action.pending ? (
              <span className="flex items-center justify-center gap-2">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                  aria-hidden="true"
                />
                {action.label}
              </span>
            ) : (
              action.label
            )}
          </Button>
          {action.reason ? (
            <p id="footer-action-reason" className="mt-1.5 text-xs text-blue-950/80">
              {action.reason}
            </p>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {action.pending && elapsedLabel ? `${action.label} ${elapsedLabel}` : action.label}
          </p>
        </div>
      </div>
    </footer>
  );
}
