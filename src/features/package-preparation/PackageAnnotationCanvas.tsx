"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Maximize2, RotateCw, ScanSearch, Trash2, ZoomIn, ZoomOut } from "lucide-react";

import {
  labelForCategory,
  validNormalizedRegion,
  type PackageCategoryId,
  type PackagePanelMetadata,
  type SellerEvidenceRegion,
} from "./package-model";

const MIN_REGION_DIMENSION = 0.005;
const PAN_STEP = 48;

type Tool = "select" | "draw";
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

export function fitPanelToViewport(args: {
  panelWidth: number;
  panelHeight: number;
  rotation: PackagePanelMetadata["rotation"];
  viewportWidth: number;
  viewportHeight: number;
  padding?: number;
}): { width: number; height: number } {
  const padding = args.padding === undefined ? 16 : args.padding;
  const availableWidth = Math.max(1, args.viewportWidth - padding * 2);
  const availableHeight = Math.max(1, args.viewportHeight - padding * 2);
  const quarterTurn = args.rotation === 90 || args.rotation === 270;
  const boundedWidth = quarterTurn ? args.panelHeight : args.panelWidth;
  const boundedHeight = quarterTurn ? args.panelWidth : args.panelHeight;
  const scale = Math.min(1, availableWidth / boundedWidth, availableHeight / boundedHeight);
  return { width: args.panelWidth * scale, height: args.panelHeight * scale };
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
  onWorkingRegionChange: (region: SellerEvidenceRegion) => void;
  onWorkingRegionDiscard: () => void;
  onPanelRotationChange: (rotation: PackagePanelMetadata["rotation"]) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const panelViewsRef = useRef(new Map<string, { zoom: number; pan: { x: number; y: number } }>());
  const previousPanelIdRef = useRef<string | null>(null);
  const taskKeyRef = useRef<string | null>(null);
  const [fitSize, setFitSize] = useState({ width: panel.width, height: panel.height });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [previewRegion, setPreviewRegion] = useState<SellerEvidenceRegion | null>(null);
  const [message, setMessage] = useState(
    `Draw a box around the ${labelForCategory(activeCategoryId).toLowerCase()}.`,
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
    const taskKey = `${panel.panelId}:${activeCategoryId}`;
    if (taskKeyRef.current === taskKey) return;
    taskKeyRef.current = taskKey;
    setPreviewRegion(null);
    gestureRef.current = null;
    const cleanStart = regions.length === 0 && !workingRegion;
    setTool(cleanStart ? "draw" : "select");
    setMessage(
      cleanStart
        ? `Draw a box around the ${labelForCategory(activeCategoryId).toLowerCase()}.`
        : "Seller evidence is selected. Drag it directly to move or resize it.",
    );
  }, [activeCategoryId, panel.panelId, regions.length, workingRegion]);

  useEffect(() => {
    viewRef.current = { zoom, pan };
  }, [pan, zoom]);

  useEffect(() => {
    const previousPanelId = previousPanelIdRef.current;
    if (previousPanelId && previousPanelId !== panel.panelId) {
      panelViewsRef.current.set(previousPanelId, viewRef.current);
    }
    const restored = panelViewsRef.current.get(panel.panelId);
    setZoom(restored?.zoom ?? 1);
    setPan(restored?.pan ?? { x: 0, y: 0 });
    previousPanelIdRef.current = panel.panelId;
  }, [panel.panelId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const fit = () => {
      const bounds = viewport.getBoundingClientRect();
      setFitSize(
        fitPanelToViewport({
          panelWidth: panel.width,
          panelHeight: panel.height,
          rotation: panel.rotation,
          viewportWidth: bounds.width || 800,
          viewportHeight: bounds.height || 640,
        }),
      );
    };
    fit();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", fit);
      return () => window.removeEventListener("resize", fit);
    }
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [panel.height, panel.rotation, panel.width]);

  function fitLabel() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setMessage("The complete label is fitted and centered in the canvas.");
  }

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
    if (kind === "move" && tool === "draw") return;
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
    onWorkingRegionChange(completed);
    onActiveRegionChange(completed.regionId);
    setTool("select");
    setMessage(
      `${labelForCategory(activeCategoryId)} region is ready. Save the category from the footer.`,
    );
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
    onWorkingRegionChange(next);
    setMessage(
      `${labelForCategory(activeCategoryId)} coordinates are ready. Save the category from the footer.`,
    );
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

  function handleShortcut(event: ReactKeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "+" || key === "=") setZoom((value) => Math.min(4, value + 0.25));
    else if (key === "-") setZoom((value) => Math.max(0.5, value - 0.25));
    else if (key === "arrowleft") setPan((value) => ({ ...value, x: value.x + PAN_STEP }));
    else if (key === "arrowright") setPan((value) => ({ ...value, x: value.x - PAN_STEP }));
    else if (key === "arrowup") setPan((value) => ({ ...value, y: value.y + PAN_STEP }));
    else if (key === "arrowdown") setPan((value) => ({ ...value, y: value.y - PAN_STEP }));
    else if (key === "r")
      onPanelRotationChange(((panel.rotation + 90) % 360) as PackagePanelMetadata["rotation"]);
    else if (key === "0") fitLabel();
    else if (key === "d") setTool("draw");
    else if (key === "m" || key === "v") setTool("select");
    else if ((key === "delete" || key === "backspace") && workingRegion) onWorkingRegionDiscard();
    else if (event.key === "?") setShowShortcuts((visible) => !visible);
    else return;
    event.preventDefault();
  }

  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-3"
      tabIndex={0}
      onKeyDown={handleShortcut}
      data-testid="annotation-workspace"
      data-tool={tool}
      data-zoom={zoom.toFixed(2)}
      data-pan-x={pan.x}
      data-pan-y={pan.y}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
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

      <div className="sticky top-0 z-10 grid gap-3 rounded-md border border-border bg-background/95 p-3 shadow-sm backdrop-blur md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold">View controls</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
            >
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
              Zoom out
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
            >
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
              Zoom in
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
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Rotate clockwise
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={fitLabel}>
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
              Fit label
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={fitLabel}>
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
              Reset view
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={showShortcuts}
              onClick={() => setShowShortcuts((visible) => !visible)}
            >
              Shortcuts
            </Button>
          </div>
          {showShortcuts ? (
            <p className="mt-2 text-xs text-muted-foreground" data-testid="canvas-shortcuts">
              +/− zoom · arrows pan · R rotate · 0 fit · D draw · M/V select · Delete removes the
              active edit · ? help
            </p>
          ) : null}
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
              <ScanSearch className="h-4 w-4" aria-hidden="true" />
              Draw region
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!workingRegion}
              onClick={() => {
                if (workingRegion) onWorkingRegionDiscard();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete box
            </Button>
          </div>
          <p className="mt-2 text-sm" aria-live="polite">
            {message}
          </p>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative flex h-[clamp(24rem,58vh,52rem)] min-w-0 items-center justify-center overflow-hidden rounded-md border-2 border-border bg-muted/30"
        data-testid="package-image-viewport"
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) => Math.min(4, Math.max(0.5, value + (event.deltaY < 0 ? 0.1 : -0.1))));
        }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${panel.role} label annotation image`}
          className={`block max-w-full touch-none ${tool === "draw" ? "cursor-crosshair" : "cursor-default"}`}
          style={{
            aspectRatio: `${panel.width} / ${panel.height}`,
            width: `${fitSize.width}px`,
            height: `${fitSize.height}px`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${panel.rotation}deg)`,
            transformOrigin: "center",
          }}
          data-fit-width={fitSize.width.toFixed(2)}
          data-fit-height={fitSize.height.toFixed(2)}
          onPointerDown={startDraw}
          onPointerMove={updateGesture}
          onPointerUp={finishGesture}
          onPointerCancel={finishGesture}
        >
          <image href={imageUrl} x="0" y="0" width="1" height="1" preserveAspectRatio="none" />

          {machineRegions.map((region) => (
            <g
              key={`machine-${region.categoryId}-${region.panelId}`}
              pointerEvents="none"
              data-machine-observation
              aria-label={`Machine observation for ${labelForCategory(region.categoryId)}`}
            >
              <rect
                x={region.x}
                y={region.y}
                width={region.width}
                height={region.height}
                fill="rgba(71,85,105,.04)"
                stroke="rgb(100,116,139)"
                strokeWidth={0.004 / zoom}
                strokeDasharray="0.02 0.012"
                vectorEffect="non-scaling-stroke"
              />
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
                  fill={working ? "rgba(37,99,235,.14)" : "rgba(194,65,12,.14)"}
                  stroke={working ? "rgb(37,99,235)" : "rgb(194,65,12)"}
                  strokeWidth={(active ? 0.009 : 0.006) / zoom}
                  strokeDasharray={working ? "0.018 0.01" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={region.x}
                  y={Math.max(0.025, region.y)}
                  fontSize={0.03 / zoom}
                  fontWeight="700"
                  fill={working ? "rgb(30,64,175)" : "rgb(124,45,18)"}
                >
                  {working ? "Editing" : "Seller"} · {labelForCategory(region.categoryId)}
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
                          stroke={working ? "rgb(30,64,175)" : "rgb(124,45,18)"}
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

      <details className="rounded-md border border-border p-3">
        <summary className="cursor-pointer text-sm font-semibold">Enter coordinates</summary>
        <fieldset className="mt-2" disabled={!activeRegion}>
          <legend className="sr-only">Keyboard coordinate fallback</legend>
          <p className="text-xs text-muted-foreground">
            Percentages are relative only to the active panel. They never share a front/back
            coordinate frame.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["x", "y", "width", "height"] as const).map((key) => (
              <div key={key} className="flex min-w-0 flex-col gap-1">
                <Label htmlFor={`region-${key}`}>
                  {key === "x" ? "Left" : key === "y" ? "Top" : key[0].toUpperCase() + key.slice(1)}{" "}
                  %
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
      </details>
    </section>
  );
}
