import { Button } from "@/components/ui/button";

import {
  labelForCategory,
  type PackageCategoryId,
  type PanelRole,
  type SellerPackageDraft,
} from "./package-model";
import type { GuidedPackageWorkflow } from "./package-workflow";

const ROLE_LABEL: Record<PanelRole, string> = {
  front: "Front",
  back: "Back",
  neck: "Neck",
  side: "Side",
  other: "Other",
};

const PHASE_LABEL = {
  upload: "Upload panels",
  mark: "Mark evidence",
  save: "Save and pre-check",
  fix: "Correct flagged evidence",
  prepare: "Prepare local package",
} as const;

export function PackageWorkstationControls({
  draft,
  workflow,
  activePanelId,
  activeCategoryId,
  guideOpen,
  editingPanels,
  reviewingEvidence,
  message,
  showCategoryControls,
  onSelectPanel,
  onSelectMissingPanel,
  onSelectCategory,
  onToggleGuide,
  onTogglePanels,
  onToggleEvidence,
}: {
  draft: SellerPackageDraft;
  workflow: GuidedPackageWorkflow;
  activePanelId: string | null;
  activeCategoryId: PackageCategoryId;
  guideOpen: boolean;
  editingPanels: boolean;
  reviewingEvidence: boolean;
  message: string;
  showCategoryControls: boolean;
  onSelectPanel: (panelId: string) => void;
  onSelectMissingPanel: (role: "front" | "back") => void;
  onSelectCategory: (categoryId: PackageCategoryId) => void;
  onToggleGuide: () => void;
  onTogglePanels: () => void;
  onToggleEvidence: () => void;
}) {
  const phaseDetail =
    workflow.phase === "upload"
      ? "Resolve the panel choices shown in the workspace."
      : workflow.phase === "mark" || workflow.phase === "fix" || reviewingEvidence
        ? `Current task: ${labelForCategory(activeCategoryId)}`
        : `Next: ${workflow.recommendedAction}`;

  return (
    <aside
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto"
      aria-labelledby="workstation-controls-heading"
      data-testid="workstation-controls"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Current phase</p>
        <h2 id="workstation-controls-heading" className="text-lg font-semibold">
          {PHASE_LABEL[workflow.phase]}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{phaseDetail}</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Panel</p>
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Package panels">
          {(["front", "back"] as const).map((role) => {
            const panel = draft.panels.find((candidate) => candidate.role === role);
            return (
              <Button
                key={role}
                type="button"
                size="sm"
                variant={panel?.panelId === activePanelId ? "default" : "outline"}
                aria-pressed={panel?.panelId === activePanelId}
                aria-label={panel ? ROLE_LABEL[role] : `${ROLE_LABEL[role]} — add image`}
                onClick={() => (panel ? onSelectPanel(panel.panelId) : onSelectMissingPanel(role))}
              >
                {ROLE_LABEL[role]}
              </Button>
            );
          })}
          {[...draft.panels]
            .filter((panel) => panel.role !== "front" && panel.role !== "back")
            .sort((left, right) => left.order - right.order)
            .map((panel) => (
              <Button
                key={panel.panelId}
                type="button"
                size="sm"
                variant={panel.panelId === activePanelId ? "default" : "outline"}
                aria-pressed={panel.panelId === activePanelId}
                onClick={() => onSelectPanel(panel.panelId)}
              >
                {panel.displayName}
              </Button>
            ))}
        </div>
      </div>

      {workflow.phase !== "upload" ? (
        <Button type="button" size="sm" variant="outline" onClick={onTogglePanels}>
          {editingPanels ? "Return to current task" : "Edit panel decisions"}
        </Button>
      ) : null}

      {reviewingEvidence && !editingPanels ? (
        <Button type="button" size="sm" variant="outline" onClick={onToggleEvidence}>
          Return to current phase
        </Button>
      ) : null}

      {showCategoryControls ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Category
          </p>
          <div className="mt-2 grid gap-2" aria-label="Category progress">
            {workflow.categoryStatuses.map((status) => (
              <Button
                key={status.categoryId}
                type="button"
                size="sm"
                variant={status.categoryId === activeCategoryId ? "default" : "outline"}
                className="justify-between"
                aria-pressed={status.categoryId === activeCategoryId}
                onClick={() => onSelectCategory(status.categoryId)}
              >
                <span>{labelForCategory(status.categoryId)}</span>
                <span aria-hidden="true">
                  {status.complete ? "✓" : status.needsAttention ? "!" : "○"}
                </span>
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant={guideOpen ? "default" : "outline"}
            className="mt-2 w-full"
            aria-pressed={guideOpen}
            onClick={onToggleGuide}
          >
            {guideOpen ? "Close Guide" : "Open Guide"}
          </Button>
        </div>
      ) : null}

      <p
        className="rounded-md border border-border bg-background p-3 text-xs"
        role="status"
        aria-live="polite"
      >
        {message}
      </p>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Package details</summary>
        <p className="mt-2 break-all">Package {draft.packageId}</p>
        <p>
          Profile {draft.profile.id} v{draft.profile.version}
        </p>
      </details>
    </aside>
  );
}
