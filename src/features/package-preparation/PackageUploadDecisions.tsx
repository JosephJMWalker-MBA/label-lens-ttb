import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  packagePanelDecisions,
  type PackagePanelMetadata,
  type PanelRole,
  type SellerPackageDraft,
} from "./package-model";

const ACCEPTED_IMAGES = "image/png,image/jpeg";
const ROLE_LABEL: Record<PanelRole, string> = {
  front: "Front panel",
  back: "Back panel",
  neck: "Neck panel",
  side: "Side panel",
  other: "Other panel",
};

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PanelSummary({ panel }: { panel: PackagePanelMetadata }) {
  return (
    <details className="mt-2 rounded border border-border p-2 text-xs">
      <summary className="cursor-pointer font-medium">Uploaded: {panel.displayName}</summary>
      <p className="mt-1 break-words text-muted-foreground">
        {panel.width}×{panel.height} · {formatBytes(panel.byteSize)}
        <br />
        <span className="font-mono">SHA-256 {panel.checksumSha256.slice(0, 16)}…</span>
      </p>
    </details>
  );
}

export function PackageUploadDecisions({
  draft,
  optionalRole,
  onOptionalRoleChange,
  onReceivePanel,
  onChooseBack,
  onChooseAdditional,
  onRemoveOptionalPanel,
}: {
  draft: SellerPackageDraft;
  optionalRole: Extract<PanelRole, "neck" | "side" | "other">;
  onOptionalRoleChange: (role: Extract<PanelRole, "neck" | "side" | "other">) => void;
  onReceivePanel: (role: PanelRole, file: File | undefined, panelId?: string) => void;
  onChooseBack: (decision: "upload" | "absent") => void;
  onChooseAdditional: (decision: "add" | "none") => void;
  onRemoveOptionalPanel: (panelId: string) => void;
}) {
  const decisions = packagePanelDecisions(draft);
  const front = draft.panels.find((panel) => panel.role === "front");
  const back = draft.panels.find((panel) => panel.role === "back");
  const optionalPanels = draft.panels.filter(
    (panel) => panel.role !== "front" && panel.role !== "back",
  );

  return (
    <section
      className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-5 rounded-lg border border-border bg-card p-4 sm:p-6"
      aria-labelledby="package-panels-heading"
      data-testid="upload-workspace"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Upload</p>
        <h2 id="package-panels-heading" className="text-2xl font-semibold">
          Resolve the label panels
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every choice is explicit. An absent panel creates no image, checksum, evidence, or fake
          coordinate frame.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0 rounded-md border border-border p-4">
          <h3 className="font-semibold">Front label</h3>
          <p className="mb-3 text-xs text-muted-foreground">Required for this reviewed profile.</p>
          <Label htmlFor="package-panel-front">Upload front label</Label>
          <Input
            id="package-panel-front"
            type="file"
            accept={ACCEPTED_IMAGES}
            onChange={(event) => onReceivePanel("front", event.target.files?.[0])}
          />
          {front ? (
            <PanelSummary panel={front} />
          ) : (
            <p className="mt-2 text-xs text-red-700">Required upload missing</p>
          )}
        </div>

        <div className="min-w-0 rounded-md border border-border p-4">
          <h3 className="font-semibold">Back label</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Choose one. “No back label” records absence without creating an artifact.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Back label decision">
            <Button
              type="button"
              size="sm"
              variant={decisions.back === "upload" || back ? "default" : "outline"}
              aria-pressed={decisions.back === "upload" || Boolean(back)}
              onClick={() => onChooseBack("upload")}
            >
              Upload back label
            </Button>
            <Button
              type="button"
              size="sm"
              variant={decisions.back === "absent" ? "default" : "outline"}
              aria-pressed={decisions.back === "absent"}
              onClick={() => onChooseBack("absent")}
            >
              No back label
            </Button>
          </div>
          {decisions.back === "upload" || back ? (
            <div className="mt-3">
              <Label htmlFor="package-panel-back">Back label image</Label>
              <Input
                id="package-panel-back"
                type="file"
                accept={ACCEPTED_IMAGES}
                onChange={(event) => onReceivePanel("back", event.target.files?.[0])}
              />
            </div>
          ) : null}
          {back ? <PanelSummary panel={back} /> : null}
          {decisions.back === "absent" ? (
            <p className="mt-3 rounded border border-emerald-700/40 bg-emerald-50 p-2 text-xs text-emerald-950">
              Back-panel question resolved: this package has no back label.
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 rounded-md border border-border p-4">
        <h3 className="font-semibold">Additional panels</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Choose whether this package has a neck, side, or other label panel.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Additional panel decision">
          <Button
            type="button"
            size="sm"
            variant={decisions.additional === "none" ? "default" : "outline"}
            aria-pressed={decisions.additional === "none"}
            onClick={() => onChooseAdditional("none")}
          >
            No additional panels
          </Button>
          <Button
            type="button"
            size="sm"
            variant={decisions.additional === "add" ? "default" : "outline"}
            aria-pressed={decisions.additional === "add"}
            onClick={() => onChooseAdditional("add")}
          >
            Add additional panel
          </Button>
        </div>

        {decisions.additional === "add" ? (
          <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div>
              <Label htmlFor="optional-panel-role">Panel role</Label>
              <select
                id="optional-panel-role"
                className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={optionalRole}
                onChange={(event) =>
                  onOptionalRoleChange(
                    event.target.value as Extract<PanelRole, "neck" | "side" | "other">,
                  )
                }
              >
                <option value="neck">Neck</option>
                <option value="side">Side</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label htmlFor="optional-panel-image">Additional panel image</Label>
              <Input
                id="optional-panel-image"
                type="file"
                accept={ACCEPTED_IMAGES}
                onChange={(event) => onReceivePanel(optionalRole, event.target.files?.[0])}
              />
            </div>
          </div>
        ) : null}

        {optionalPanels.length > 0 ? (
          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
            {optionalPanels.map((panel) => (
              <div key={panel.panelId} className="min-w-0 rounded border border-border p-3">
                <p className="break-words text-sm font-semibold">
                  {ROLE_LABEL[panel.role]} · {panel.displayName}
                </p>
                <Label htmlFor={`replace-${panel.panelId}`} className="mt-2 block text-xs">
                  Replace image
                </Label>
                <Input
                  id={`replace-${panel.panelId}`}
                  type="file"
                  accept={ACCEPTED_IMAGES}
                  onChange={(event) =>
                    onReceivePanel(panel.role, event.target.files?.[0], panel.panelId)
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => onRemoveOptionalPanel(panel.panelId)}
                >
                  Remove optional panel
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
