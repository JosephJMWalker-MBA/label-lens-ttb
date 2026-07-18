"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  labelForCategory,
  validNormalizedRegion,
  type PackageCategoryId,
  type PackagePanelMetadata,
  type SellerEvidenceRegion,
  type SellerPackageChangeAction,
} from "./package-model";

const MIN_REGION_DIMENSION = 0.005;
const PAN_STEP = 48;

type Tool = "select" | "draw" | "move";
type ResizeCorner = "nw" | "ne" | "sw" | "se";

interface Gesture {
  kind: "draw" | "move" | "resize";
  pointerId: number;
  start: { x: number; y: number };
  original?: SellerEvidenceRegion;
  corner?: ResizeCorner;
}

export interface MachinePackageRegion {
  categoryId: PackageCategoryId;
  panelId: string;
  state: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function PackageAnnotationCanvas({
  panel,
  imageUrl,
  activeCategoryId,
  regions,
  workingRegion,
  machineRegions,
  activeRegionId,
  onActiveRegionChange,
  onRegionCommit,
  onRegionRemove,
  onWorkingRegionChange,
  onWorkingRegionDiscard,
  onPanelRotationChange,
}: {
  panel: PackagePanelMetadata;
  imageUrl: string;
  activeCategoryId: PackageCategoryId;
  regions: SellerEvidenceRegion[];
  workingRegion: SellerEvidenceRegion | null;
  machineRegions: MachinePackageRegion[];
  activeRegionId: string | null;
  onActiveRegionChange: (regionId: string | null) => void;
  onRegionCommit: (
    region: SellerEvidenceRegion,
    action: Extract<SellerPackageChangeAction, "region_added" | "region_moved" | "region_resized">,
  ) => void;
  onRegionRemove: (regionId: string) => void;
  onWorkingRegionChange: (region: SellerEvidenceRegion) => void;
  onWorkingRegionDiscard: () => void;
  onPanelRotationChange: (rotation: PackagePanelMetadata["rotation"]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [previewRegion, setPreviewRegion] = useState<SellerEvidenceRegion | null>(null);
  const [message, setMessage] = useState(
    "Move or resize the starter box, or draw a replacement region.",
  );

  const activeRegion = useMemo(
    () =>
      workingRegion?.regionId === activeRegionId
        ? workingRegion
        : (regions.find((region) => region.regionId === activeRegionId) ?? null),
    [activeRegionId, regions, workingRegion],
  );
  const [coordinates, setCoordinates] = useState({ x: "", y: "", width: "", height: "" });

  useEffect(() => {
    if (!activeRegion) {
      setCoordinates({ x: "", y: "", width: "", height: "" });
      return;
    }
    setCoordinates({
      x: (activeRegion.x * 100).toFixed(2),
      y: (activeRegion.y * 100).toFixed(2),
      width: (activeRegion.width * 100).toFixed(2),
      height: (activeRegion.height * 100).toFixed(2),
    });
  }, [activeRegion]);

  useEffect(() => {
    setPreviewRegion(null);
    gestureRef.current = null;
    setTool("select");
    setMessage("Move or resize the starter box, or draw a replacement region.");
  }, [activeCategoryId, panel.panelId]);

  function pointFromClient(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: Math.min(1, Math.max(0, local.x)), y: Math.min(1, Math.max(0, local.y)) };
  }

  function startDraw(event: ReactPointerEvent<SVGSVGElement>) {
    if (tool !== "draw" || event.button !== 0) return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const region: SellerEvidenceRegion = {
      regionId: `region-${crypto.randomUUID()}`,
      categoryId: activeCategoryId,
      panelId: panel.panelId,
      unit: "normalized-panel-relative",
      provenance: "seller-selected-region",
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    };
    gestureRef.current = { kind: "draw", pointerId: event.pointerId, start: point };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreviewRegion(region);
    setMessage("Drawing seller region. Release when the category evidence is enclosed.");
  }

  function startRegionGesture(
    event: ReactPointerEvent<SVGElement>,
    region: SellerEvidenceRegion,
    kind: "move" | "resize",
    corner?: ResizeCorner,
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    onActiveRegionChange(region.regionId);
    const isWorkingRegion = region.regionId === workingRegion?.regionId;
    if (kind === "move" && tool !== "move" && !isWorkingRegion) return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (!point) return;
    gestureRef.current = {
      kind,
      pointerId: event.pointerId,
      start: point,
      original: region,
      corner,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
    setPreviewRegion(region);
    setMessage(kind === "move" ? "Moving seller region." : "Resizing seller region.");
  }

  function updateGesture(event: ReactPointerEvent<SVGSVGElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = pointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;

    if (gesture.kind === "draw") {
      const current = previewRegion;
      if (!current) return;
      setPreviewRegion({
        ...current,
        x: Math.min(gesture.start.x, point.x),
        y: Math.min(gesture.start.y, point.y),
        width: Math.abs(point.x - gesture.start.x),
        height: Math.abs(point.y - gesture.start.y),
      });
      return;
    }

    const original = gesture.original;
    if (!original) return;
    if (gesture.kind === "move") {
      setPreviewRegion({
        ...original,
        x: Math.min(1 - original.width, Math.max(0, original.x + dx)),
        y: Math.min(1 - original.height, Math.max(0, original.y + dy)),
      });
      return;
    }

    const left = gesture.corner?.includes("w")
      ? Math.min(original.x + original.width - MIN_REGION_DIMENSION, Math.max(0, original.x + dx))
      : original.x;
    const top = gesture.corner?.includes("n")
      ? Math.min(original.y + original.height - MIN_REGION_DIMENSION, Math.max(0, original.y + dy))
      : original.y;
    const right = gesture.corner?.includes("e")
      ? Math.max(original.x + MIN_REGION_DIMENSION, Math.min(1, original.x + original.width + dx))
      : original.x + original.width;
    const bottom = gesture.corner?.includes("s")
      ? Math.max(original.y + MIN_REGION_DIMENSION, Math.min(1, original.y + original.height + dy))
      : original.y + original.height;
    setPreviewRegion({ ...original, x: left, y: top, width: right - left, height: bottom - top });
  }

  function finishGesture(event: ReactPointerEvent<SVGSVGElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const completed = previewRegion;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPreviewRegion(null);
    if (!completed || !validNormalizedRegion(completed)) {
      setMessage("No region was saved. Click and drag a larger non-empty rectangle.");
      return;
    }
    const isWorkingRegion = completed.regionId === workingRegion?.regionId;
    if (gesture.kind === "draw" || isWorkingRegion) {
      onWorkingRegionChange(completed);
      onActiveRegionChange(completed.regionId);
      setTool("select");
      setMessage(
        `${labelForCategory(activeCategoryId)} working box updated. Accept the category to save it.`,
      );
      return;
    }
    const action = gesture.kind === "move" ? "region_moved" : "region_resized";
    onRegionCommit(completed, action);
    onActiveRegionChange(completed.regionId);
    setTool("select");
    setMessage(`${labelForCategory(activeCategoryId)} seller region saved on ${panel.role}.`);
  }

  function applyCoordinates() {
    if (!activeRegion) return;
    const next = {
      ...activeRegion,
      x: Number(coordinates.x) / 100,
      y: Number(coordinates.y) / 100,
      width: Number(coordinates.width) / 100,
      height: Number(coordinates.height) / 100,
    };
    if (!validNormalizedRegion(next)) {
      setMessage("Coordinates were not saved. Use non-empty percentages contained within 0–100.");
      return;
    }
    if (activeRegion.regionId === workingRegion?.regionId) {
      onWorkingRegionChange(next);
      setMessage(
        `${labelForCategory(activeCategoryId)} working coordinates updated. Accept to save them.`,
      );
      return;
    }
    onRegionCommit(next, "region_resized");
    setMessage(`${labelForCategory(activeCategoryId)} coordinates saved.`);
  }

  const baseRegions = workingRegion
    ? [...regions.filter((region) => region.regionId !== workingRegion.regionId), workingRegion]
    : regions;
  const visibleRegions = baseRegions.map((region) =>
    previewRegion?.regionId === region.regionId ? previewRegion : region,
  );
  if (previewRegion && !baseRegions.some((region) => region.regionId === previewRegion.regionId)) {
    visibleRegions.push(previewRegion);
  }

  const handleSize = 0.024 / zoom;
  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-md border border-border bg-card p-4"
      data-testid="annotation-workspace"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Image workspace
          </p>
          <h3 className="text-lg font-semibold">
            {panel.role[0].toUpperCase() + panel.role.slice(1)} · {panel.displayName}
          </h3>
          <p className="text-sm text-muted-foreground">
            Active category:{" "}
            <strong className="text-foreground">{labelForCategory(activeCategoryId)}</strong>
            {" · "}Active tool: <strong className="text-foreground">{tool}</strong>
          </p>
        </div>
        <span className="rounded border border-border px-2 py-1 text-xs">
          Rotation {panel.rotation}° · Zoom {zoom.toFixed(2)}×
        </span>
      </div>

      <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold">Image navigation</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
            >
              Zoom out
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
            >
              Zoom in
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={zoom <= 1}
              onClick={() => setPan((value) => ({ ...value, x: value.x + PAN_STEP }))}
            >
              Pan left
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={zoom <= 1}
              onClick={() => setPan((value) => ({ ...value, x: value.x - PAN_STEP }))}
            >
              Pan right
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={zoom <= 1}
              onClick={() => setPan((value) => ({ ...value, y: value.y + PAN_STEP }))}
            >
              Pan up
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={zoom <= 1}
              onClick={() => setPan((value) => ({ ...value, y: value.y - PAN_STEP }))}
            >
              Pan down
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onPanelRotationChange(
                  ((panel.rotation + 90) % 360) as PackagePanelMetadata["rotation"],
                )
              }
            >
              Rotate clockwise
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
                onPanelRotationChange(0);
              }}
            >
              Reset view
            </Button>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">Evidence editing</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={tool === "draw" ? "default" : "outline"}
              aria-pressed={tool === "draw"}
              onClick={() => {
                setTool("draw");
                setMessage("Draw mode active. Click and drag to add a seller region.");
              }}
            >
              Draw region
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tool === "move" ? "default" : "outline"}
              aria-pressed={tool === "move"}
              disabled={!activeRegion}
              onClick={() => {
                setTool("move");
                setMessage("Move mode active. Drag the selected seller region.");
              }}
            >
              Move selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!activeRegion}
              onClick={() => {
                if (!activeRegion) return;
                if (activeRegion.regionId === workingRegion?.regionId) {
                  onWorkingRegionDiscard();
                  return;
                }
                onRegionRemove(activeRegion.regionId);
              }}
            >
              {activeRegion?.regionId === workingRegion?.regionId
                ? "Discard working box"
                : "Remove selected"}
            </Button>
          </div>
          <p className="mt-2 text-sm" aria-live="polite">
            {message}
          </p>
        </div>
      </div>

      <div
        className="relative flex min-w-0 justify-center overflow-hidden rounded-md border-2 border-border bg-muted/30"
        data-testid="package-image-viewport"
      >
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${panel.role} label annotation image`}
          className={`block max-w-full touch-none ${tool === "draw" ? "cursor-crosshair" : tool === "move" ? "cursor-move" : "cursor-default"}`}
          style={{
            aspectRatio: `${panel.width} / ${panel.height}`,
            width: `min(100%, ${(70 * panel.width) / panel.height}vh)`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${panel.rotation}deg)`,
            transformOrigin: "center",
          }}
          onPointerDown={startDraw}
          onPointerMove={updateGesture}
          onPointerUp={finishGesture}
          onPointerCancel={finishGesture}
        >
          <image href={imageUrl} x="0" y="0" width="1" height="1" preserveAspectRatio="none" />

          {machineRegions.map((region) => (
            <g key={`machine-${region.categoryId}-${region.panelId}`} pointerEvents="none">
              <rect
                x={region.x}
                y={region.y}
                width={region.width}
                height={region.height}
                fill="rgba(37,99,235,.10)"
                stroke="rgb(37,99,235)"
                strokeWidth={0.006 / zoom}
                strokeDasharray="0.02 0.012"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={region.x}
                y={Math.max(0.025, region.y)}
                fontSize={0.03 / zoom}
                fill="rgb(30,64,175)"
              >
                Machine · {labelForCategory(region.categoryId)}
              </text>
            </g>
          ))}

          {visibleRegions.map((region, index) => {
            const active = region.regionId === activeRegionId;
            const working = region.regionId === workingRegion?.regionId;
            const regionLabel = `${labelForCategory(region.categoryId)} seller region ${index + 1}`;
            return (
              <g
                key={region.regionId}
                role="button"
                tabIndex={0}
                aria-label={regionLabel}
                data-region-id={region.regionId}
                data-active={active}
                data-working={working}
                onPointerDown={(event) => startRegionGesture(event, region, "move")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    onActiveRegionChange(region.regionId);
                }}
              >
                <rect
                  x={region.x}
                  y={region.y}
                  width={region.width}
                  height={region.height}
                  fill={working ? "rgba(126,34,206,.12)" : "rgba(194,65,12,.14)"}
                  stroke={working ? "rgb(126,34,206)" : "rgb(194,65,12)"}
                  strokeWidth={(active ? 0.009 : 0.006) / zoom}
                  strokeDasharray={working ? "0.018 0.01" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={region.x}
                  y={Math.max(0.025, region.y)}
                  fontSize={0.03 / zoom}
                  fontWeight="700"
                  fill={working ? "rgb(88,28,135)" : "rgb(124,45,18)"}
                >
                  {working ? "Working" : "Seller"} · {labelForCategory(region.categoryId)}
                </text>
                {active
                  ? (["nw", "ne", "sw", "se"] as const).map((corner) => {
                      const x = corner.includes("w") ? region.x : region.x + region.width;
                      const y = corner.includes("n") ? region.y : region.y + region.height;
                      return (
                        <rect
                          key={corner}
                          x={x - handleSize / 2}
                          y={y - handleSize / 2}
                          width={handleSize}
                          height={handleSize}
                          fill="white"
                          stroke={working ? "rgb(88,28,135)" : "rgb(124,45,18)"}
                          strokeWidth={0.004 / zoom}
                          vectorEffect="non-scaling-stroke"
                          aria-label={`Resize ${regionLabel} from ${corner}`}
                          onPointerDown={(event) =>
                            startRegionGesture(event, region, "resize", corner)
                          }
                        />
                      );
                    })
                  : null}
              </g>
            );
          })}
        </svg>
      </div>

      <fieldset className="rounded-md border border-border p-3" disabled={!activeRegion}>
        <legend className="px-1 text-sm font-semibold">Keyboard coordinate fallback</legend>
        <p className="text-xs text-muted-foreground">
          Percentages are relative only to the active panel. They never share a front/back
          coordinate frame.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <div key={key} className="flex min-w-0 flex-col gap-1">
              <Label htmlFor={`region-${key}`}>
                {key === "x" ? "Left" : key === "y" ? "Top" : key[0].toUpperCase() + key.slice(1)} %
              </Label>
              <Input
                id={`region-${key}`}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={coordinates[key]}
                onChange={(event) =>
                  setCoordinates((value) => ({ ...value, [key]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={!activeRegion}
          onClick={applyCoordinates}
        >
          Apply coordinates
        </Button>
      </fieldset>
    </section>
  );
}
