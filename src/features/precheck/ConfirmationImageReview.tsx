"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  normalizedHumanGeometryFromMachine,
  resolveMachineAlternates,
} from "@/pipeline/result/field-confirmation";
import type {
  HumanFieldConfirmationDecisionType,
  HumanFieldGeometry,
  ReviewableFieldId,
  ResolvedFieldReviews,
} from "@/pipeline/result/result.types";

import { normalizedOverlayStyle, overlayStyle } from "./evidence-geometry";

interface PreviewImage {
  url: string;
  name: string;
}

const FIELD_LABEL: Record<ReviewableFieldId, string> = {
  brandName: "Brand",
  alcoholStatement: "Alcohol",
};

const DRAW_MIN_DIMENSION = 0.005;
const PAN_STEP = 48;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hasDrawnMinimum(geometry: HumanFieldGeometry): boolean {
  return geometry.width >= DRAW_MIN_DIMENSION && geometry.height >= DRAW_MIN_DIMENSION;
}

export function ConfirmationImageReview({
  previewImage,
  reviews,
  activeField,
  onActiveFieldChange,
  activeDecisionType,
  activeAlternateId,
  activeHumanGeometry,
  onHumanGeometryChange,
}: {
  previewImage?: PreviewImage | null;
  reviews: ResolvedFieldReviews;
  activeField: ReviewableFieldId;
  onActiveFieldChange: (fieldId: ReviewableFieldId) => void;
  activeDecisionType: HumanFieldConfirmationDecisionType | "";
  activeAlternateId: string;
  activeHumanGeometry: HumanFieldGeometry | null;
  onHumanGeometryChange: (geometry: HumanFieldGeometry | null) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drawingStartRef = useRef<{ x: number; y: number } | null>(null);
  const latestGeometryRef = useRef<HumanFieldGeometry | null>(activeHumanGeometry);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drawing, setDrawing] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const brandGeometry = reviews.brandName.machineObservation.geometry;
  const alcoholGeometry = reviews.alcoholStatement.machineObservation.geometry;
  const supportsPointerEvents =
    typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";

  useEffect(() => {
    latestGeometryRef.current = activeHumanGeometry;
  }, [activeHumanGeometry]);

  const activeMachineReferenceGeometry = (() => {
    if (activeDecisionType === "selected-alternate" && activeAlternateId.trim() !== "") {
      const alternates = resolveMachineAlternates(
        activeField,
        activeField === "brandName"
          ? reviews.brandName.machineObservation
          : reviews.alcoholStatement.machineObservation,
      );
      return (
        alternates.find((alternate) => alternate.alternateId === activeAlternateId)?.geometry ??
        null
      );
    }
    return activeField === "brandName" ? (brandGeometry ?? null) : (alcoholGeometry ?? null);
  })();

  const clampPan = useCallback(
    (next: { x: number; y: number }, nextZoom = zoom) => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content || nextZoom <= 1) return { x: 0, y: 0 };
      const viewportRect = viewport.getBoundingClientRect();
      const scaledWidth = content.offsetWidth * nextZoom;
      const scaledHeight = content.offsetHeight * nextZoom;
      const minX = Math.min(0, viewportRect.width - scaledWidth);
      const minY = Math.min(0, viewportRect.height - scaledHeight);
      return {
        x: Math.min(0, Math.max(minX, next.x)),
        y: Math.min(0, Math.max(minY, next.y)),
      };
    },
    [zoom],
  );

  useEffect(() => {
    setPan((current) => clampPan(current, zoom));
  }, [clampPan, zoom]);

  if (!previewImage) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">No image review is available for this run</p>
        <p className="mt-1">
          The bundled sample runs entirely server-side. You can still confirm the field values, but
          drawing or revising a human review region requires a local image preview.
        </p>
      </div>
    );
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDrawing(false);
    setLiveMessage("Image view reset.");
  }

  function zoomBy(delta: number) {
    setZoom((current) => {
      const next = Math.min(4, Math.max(1, Number((current + delta).toFixed(2))));
      setLiveMessage(`Zoom set to ${next.toFixed(2)}×.`);
      return next;
    });
  }

  function panBy(dx: number, dy: number) {
    setPan((current) => {
      const next = clampPan({ x: current.x + dx, y: current.y + dy });
      setLiveMessage(`Image panned for ${FIELD_LABEL[activeField].toLowerCase()} review.`);
      return next;
    });
  }

  function pointInContent(clientX: number, clientY: number) {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }

  function beginDraw(clientX: number, clientY: number) {
    const point = pointInContent(clientX, clientY);
    if (!point) return;
    drawingStartRef.current = point;
    const nextGeometry = {
      unit: "normalized-image-relative",
      provenance: "human-selected-region",
      imageIndex: 0,
      x: point.x,
      y: point.y,
      width: DRAW_MIN_DIMENSION,
      height: DRAW_MIN_DIMENSION,
    } as const satisfies HumanFieldGeometry;
    latestGeometryRef.current = nextGeometry;
    onHumanGeometryChange(nextGeometry);
  }

  function updateDraw(clientX: number, clientY: number) {
    const start = drawingStartRef.current;
    const point = pointInContent(clientX, clientY);
    if (!start || !point) return;
    const x = Math.min(start.x, point.x);
    const y = Math.min(start.y, point.y);
    const width = Math.abs(point.x - start.x);
    const height = Math.abs(point.y - start.y);
    const nextGeometry = {
      unit: "normalized-image-relative",
      provenance: "human-selected-region",
      imageIndex: 0,
      x,
      y,
      width,
      height,
    } as const satisfies HumanFieldGeometry;
    latestGeometryRef.current = nextGeometry;
    onHumanGeometryChange(nextGeometry);
  }

  function endDraw() {
    drawingStartRef.current = null;
    const finalGeometry = latestGeometryRef.current;
    if (!finalGeometry || !hasDrawnMinimum(finalGeometry)) {
      latestGeometryRef.current = null;
      onHumanGeometryChange(null);
      setLiveMessage("Draw a larger region to save a human review box.");
      return;
    }
    setDrawing(false);
    setLiveMessage(`${FIELD_LABEL[activeField]} review region updated.`);
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold">Image review</h4>
            <p className="text-sm text-muted-foreground">
              Active field:{" "}
              <span className="font-medium text-foreground">{FIELD_LABEL[activeField]}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => zoomBy(-0.25)}>
              Zoom out
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => zoomBy(0.25)}>
              Zoom in
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={resetView}>
              Reset view
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={zoom <= 1}
            onClick={() => panBy(PAN_STEP, 0)}
          >
            Pan left
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={zoom <= 1}
            onClick={() => panBy(-PAN_STEP, 0)}
          >
            Pan right
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={zoom <= 1}
            onClick={() => panBy(0, PAN_STEP)}
          >
            Pan up
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={zoom <= 1}
            onClick={() => panBy(0, -PAN_STEP)}
          >
            Pan down
          </Button>
          <Button
            type="button"
            variant={drawing ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setDrawing((current) => !current);
              setLiveMessage(
                drawing
                  ? "Region drawing cancelled."
                  : `Draw a region for the ${FIELD_LABEL[activeField].toLowerCase()} field.`,
              );
            }}
          >
            {drawing ? "Cancel drawing" : "Draw region"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!activeMachineReferenceGeometry}
            onClick={() => {
              if (!activeMachineReferenceGeometry) return;
              const nextGeometry = normalizedHumanGeometryFromMachine(
                activeMachineReferenceGeometry,
              );
              latestGeometryRef.current = nextGeometry;
              onHumanGeometryChange(nextGeometry);
              setLiveMessage(
                `${FIELD_LABEL[activeField]} machine region copied for human confirmation.`,
              );
            }}
          >
            Use machine region
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!activeHumanGeometry}
            onClick={() => {
              latestGeometryRef.current = null;
              onHumanGeometryChange(null);
              setLiveMessage(`${FIELD_LABEL[activeField]} human region cleared.`);
            }}
          >
            Clear region
          </Button>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      <div
        ref={viewportRef}
        className="relative overflow-hidden rounded-md border border-border bg-muted/20"
      >
        <div
          ref={contentRef}
          className="relative touch-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "top left",
          }}
          onPointerDown={
            supportsPointerEvents
              ? (event) => {
                  if (!drawing || event.button !== 0) return;
                  beginDraw(event.clientX, event.clientY);
                }
              : undefined
          }
          onPointerMove={
            supportsPointerEvents
              ? (event) => {
                  if (!drawingStartRef.current) return;
                  updateDraw(event.clientX, event.clientY);
                }
              : undefined
          }
          onPointerUp={supportsPointerEvents ? () => endDraw() : undefined}
          onPointerCancel={supportsPointerEvents ? () => endDraw() : undefined}
          onMouseDown={
            !supportsPointerEvents
              ? (event) => {
                  if (!drawing || event.button !== 0) return;
                  beginDraw(event.clientX, event.clientY);
                }
              : undefined
          }
          onMouseMove={
            !supportsPointerEvents
              ? (event) => {
                  if (!drawingStartRef.current) return;
                  updateDraw(event.clientX, event.clientY);
                }
              : undefined
          }
          onMouseUp={!supportsPointerEvents ? () => endDraw() : undefined}
          onMouseLeave={
            !supportsPointerEvents
              ? () => {
                  if (drawingStartRef.current) endDraw();
                }
              : undefined
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImage.url}
            alt={`Confirmation review image: ${previewImage.name}`}
            className="block h-auto w-full object-contain"
          />

          {(
            [
              ["brandName", brandGeometry],
              ["alcoholStatement", alcoholGeometry],
            ] as const
          ).map(([fieldId, geometry]) => {
            if (!geometry) return null;
            return (
              <button
                key={fieldId}
                type="button"
                className="evidence-overlay"
                data-active={activeField === fieldId}
                style={overlayStyle(geometry)}
                aria-label={`${FIELD_LABEL[fieldId]} machine evidence region`}
                onClick={() => onActiveFieldChange(fieldId)}
              >
                <span aria-hidden="true" className="evidence-chip">
                  {FIELD_LABEL[fieldId]}
                </span>
              </button>
            );
          })}

          {activeHumanGeometry ? (
            <span
              className="pointer-events-none absolute border-2 border-amber-500 bg-amber-200/20"
              style={normalizedOverlayStyle(activeHumanGeometry)}
              role="img"
              aria-label={`${FIELD_LABEL[activeField]} human review region`}
            >
              <span className="absolute left-0 top-0 rounded-br bg-amber-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Human
              </span>
            </span>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Machine regions stay blue. Human-selected regions are shown in amber and are stored in
        normalized image-relative coordinates.
      </p>
    </section>
  );
}
