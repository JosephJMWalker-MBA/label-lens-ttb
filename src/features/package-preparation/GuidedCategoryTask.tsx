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

const COMPARISON_LABEL = {
  AGREEMENT: "Agreement",
  CONFLICT: "Conflict",
  SELLER_REGION_INSUFFICIENT: "Seller-region insufficient",
  MACHINE_DISCOVERY_NOT_FOUND: "Machine discovery not found",
  BOTH_INSUFFICIENT: "Both insufficient",
} as const;

function firstSellerRegionValue(analysis: PackageCategoryAnalysis): string | null {
  return (
    analysis.comparison?.sellerRegionReadings.find((reading) => reading.observedValue !== null)
      ?.observedValue ?? null
  );
}

function formatCrop(crop: { left: number; top: number; width: number; height: number }) {
  return `left ${crop.left}, top ${crop.top}, ${crop.width}x${crop.height}px`;
}

export function GuidedCategoryTask({
  definition,
  instruction,
  category,
  analysis,
  taskPosition,
  taskCount,
  workingValue,
  pendingRegionAvailable,
  editing,
  machineObservationVisible,
  machineRegionAvailable,
  showReviewNavigation,
  onWorkingValueChange,
  onBeginRegionEdit,
  onBeginTextEdit,
  onToggleMachineObservation,
  onUseMachineRegion,
  onNeedsAttention,
  onPrevious,
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
  editing: boolean;
  machineObservationVisible: boolean;
  machineRegionAvailable: boolean;
  showReviewNavigation: boolean;
  onWorkingValueChange: (value: string) => void;
  onBeginRegionEdit: () => void;
  onBeginTextEdit: () => void;
  onToggleMachineObservation: () => void;
  onUseMachineRegion: () => void;
  onNeedsAttention: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const committedRegions = category.regions.length;
  const accepted = category.decision !== "unresolved" && committedRegions > 0;

  return (
    <aside
      className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto"
      aria-labelledby={`guided-task-${definition.categoryId}`}
      data-testid="category-inspector"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {analysis ? "Flagged evidence" : `Category ${taskPosition} of ${taskCount}`}
        </p>
        <h3 id={`guided-task-${definition.categoryId}`} className="text-xl font-semibold">
          {definition.label}
        </h3>
        <p className="mt-1 text-sm">
          {editing
            ? `Draw a box around the ${definition.label.toLowerCase()}, then confirm what the label says.`
            : "Review the seller-confirmed evidence. Editing is optional until you deliberately reopen it."}
        </p>
      </div>

      {analysis ? (
        <div className="grid gap-2 text-sm" data-testid="correction-comparison">
          <div className="rounded-md border border-orange-700/40 bg-orange-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-950">
              Seller says
            </p>
            <p className="mt-1 font-semibold text-orange-950">
              {category.expectedValue || "No seller-confirmed text"}
            </p>
          </div>
          {analysis.comparison ? (
            <>
              {analysis.comparison.outcome === "SELLER_REGION_INSUFFICIENT" ? (
                <div className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-950">
                  Text was detected inside the selected location, but the bounded reading was not
                  reliable enough to compare against the independent machine reading.
                </div>
              ) : null}
              <div className="rounded-md border border-blue-500/50 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-950">
                  Machine read inside selected location
                </p>
                <p className="mt-1 font-semibold text-blue-950">
                  {firstSellerRegionValue(analysis) ?? "No selected-location text recovered"}
                </p>
                <p className="mt-1 text-xs text-blue-950">
                  {analysis.comparison.sellerRegionReadings.length} seller-region reading
                  {analysis.comparison.sellerRegionReadings.length === 1 ? "" : "s"} preserved.
                </p>
              </div>
              <div className="rounded-md border border-slate-400 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Machine independently found
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  {analysis.comparison.machineDiscoveredReading?.observedValue ??
                    "No independent machine text recovered"}
                </p>
              </div>
              <div className="rounded-md border border-amber-500/50 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-950">
                  Comparison state
                </p>
                <p className="mt-1 font-semibold text-amber-950">
                  {COMPARISON_LABEL[analysis.comparison.outcome]}
                </p>
                <p className="mt-1 text-amber-950">{analysis.comparison.reason}</p>
              </div>
              {analysis.comparison.sellerRegionReadings[0] ? (
                <details className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-semibold text-foreground">
                    Bounded pass technical details
                  </summary>
                  <dl className="mt-2 grid gap-1">
                    <div>
                      <dt className="font-medium text-foreground">Selected region</dt>
                      <dd>
                        x {analysis.comparison.sellerRegionReadings[0].sellerRegion.x}, y{" "}
                        {analysis.comparison.sellerRegionReadings[0].sellerRegion.y}, width{" "}
                        {analysis.comparison.sellerRegionReadings[0].sellerRegion.width}, height{" "}
                        {analysis.comparison.sellerRegionReadings[0].sellerRegion.height}
                      </dd>
                    </div>
                    {analysis.comparison.sellerRegionReadings[0].selectedRegionPixelGeometry ? (
                      <div>
                        <dt className="font-medium text-foreground">Selected crop pixels</dt>
                        <dd>
                          {formatCrop(
                            analysis.comparison.sellerRegionReadings[0].selectedRegionPixelGeometry,
                          )}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="font-medium text-foreground">Padded OCR crop</dt>
                      <dd>
                        {formatCrop(analysis.comparison.sellerRegionReadings[0].cropGeometry)}
                      </dd>
                    </div>
                    {analysis.comparison.sellerRegionReadings[0].cropPadding ? (
                      <div>
                        <dt className="font-medium text-foreground">Padding</dt>
                        <dd>
                          left {analysis.comparison.sellerRegionReadings[0].cropPadding.left}, top{" "}
                          {analysis.comparison.sellerRegionReadings[0].cropPadding.top}, right{" "}
                          {analysis.comparison.sellerRegionReadings[0].cropPadding.right}, bottom{" "}
                          {analysis.comparison.sellerRegionReadings[0].cropPadding.bottom}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="font-medium text-foreground">Scale factor</dt>
                      <dd>
                        {analysis.comparison.sellerRegionReadings[0].scaleFactor ?? "Unknown"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Orientation/pass</dt>
                      <dd>
                        {analysis.comparison.sellerRegionReadings[0].passProvenance?.passKind ??
                          "Unknown"}{" "}
                        · rotate{" "}
                        {analysis.comparison.sellerRegionReadings[0].passProvenance?.transform
                          .rotate ?? "unknown"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Preprocessing</dt>
                      <dd>
                        {analysis.comparison.sellerRegionReadings[0].passProvenance?.preprocessing.join(
                          ", ",
                        ) ?? "Unknown"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Raw bounded transcript</dt>
                      <dd>
                        {analysis.comparison.sellerRegionReadings[0].rawTranscript ||
                          "No transcript"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Confidence</dt>
                      <dd>
                        {analysis.comparison.sellerRegionReadings[0].ocrEvidenceScore.toFixed(2)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Reliability</dt>
                      <dd>
                        {analysis.comparison.sellerRegionReliability[0]?.reliabilityState ??
                          analysis.comparison.sellerRegionReadings[0].reliabilityState ??
                          "Unknown"}{" "}
                        ·{" "}
                        {analysis.comparison.sellerRegionReliability[0]?.reason ??
                          analysis.comparison.sellerRegionReadings[0].reliabilityReason ??
                          "No reliability reason recorded."}
                      </dd>
                    </div>
                  </dl>
                </details>
              ) : null}
            </>
          ) : (
            <div className="rounded-md border border-slate-400 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                Machine detected
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {analysis.observedValue ?? "No machine text recovered"}
              </p>
            </div>
          )}
          <div className="rounded-md border border-amber-500/50 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-950">
              Why this was flagged
            </p>
            <p className="mt-1 text-amber-950">{analysis.reason}</p>
          </div>
        </div>
      ) : null}

      <div>
        <Label htmlFor="seller-expected-value">What the label says</Label>
        <Input
          id="seller-expected-value"
          value={workingValue}
          placeholder={instruction.exampleValue}
          readOnly={!editing}
          aria-readonly={!editing}
          onChange={(event) => onWorkingValueChange(event.target.value)}
        />
        {!editing ? (
          <p className="mt-1 text-xs text-muted-foreground">
            This is the accepted seller text. Choose Edit confirmed text to change it.
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-border p-3 text-sm">
        <p className="font-semibold">Evidence status</p>
        <p className="text-muted-foreground">
          {accepted ? "Seller evidence saved" : "Seller evidence not yet saved"}
          <br />
          Regions: {committedRegions} saved · {pendingRegionAvailable ? 1 : 0} being edited
        </p>
      </div>

      {accepted && !editing ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onBeginRegionEdit}>
            Edit my region
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onBeginTextEdit}>
            Edit confirmed text
          </Button>
        </div>
      ) : null}

      {analysis ? (
        <div className="grid gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!machineRegionAvailable}
            onClick={onToggleMachineObservation}
          >
            {machineObservationVisible ? "Hide machine observation" : "Show machine observation"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!machineRegionAvailable}
            onClick={onUseMachineRegion}
          >
            Use machine region
          </Button>
        </div>
      ) : null}

      {editing ? (
        <Button type="button" variant="outline" onClick={onNeedsAttention}>
          Mark as needs attention
        </Button>
      ) : null}

      {showReviewNavigation ? (
        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
          <Button type="button" size="sm" variant="outline" onClick={onPrevious}>
            Previous
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onNext}>
            Next
          </Button>
        </div>
      ) : null}

      <details className="rounded-md border border-border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Technical details</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Registry requirement {definition.requirementId} v{definition.requirementVersion} ·{" "}
          {definition.applicability}. Coordinates remain normalized to the selected panel only.
        </p>
        <p className="mt-2">
          Latest pre-check: {analysis ? ANALYSIS_LABEL[analysis.state] : "Not run"}
        </p>
      </details>
    </aside>
  );
}
