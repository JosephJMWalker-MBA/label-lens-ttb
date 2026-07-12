import type {
  AnalyzerFieldObservation,
  EvidenceGeometry,
} from "@/pipeline/analyzer/analyzer.types";

/**
 * Pure presentation math for evidence-region overlays.
 *
 * Server-provided geometry is expressed in the coordinate frame of the analyzed
 * image (`imageWidth` × `imageHeight`). Overlays are positioned as percentages
 * of that frame, so they stay aligned however the rendered image scales —
 * responsive width, browser zoom, or device pixel ratio — as long as the overlay
 * container wraps the rendered image exactly. Nothing here invents coordinates;
 * absent or degenerate geometry simply produces no overlay.
 */

export interface OverlayStyle {
  left: string;
  top: string;
  width: string;
  height: string;
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function pct(value: number): string {
  // Fixed precision keeps styles deterministic across runs.
  return `${Number(value.toFixed(4))}%`;
}

/** True when geometry exists and has a positive, usable reference frame. */
export function hasUsableGeometry(
  geometry: EvidenceGeometry | undefined | null,
): geometry is EvidenceGeometry {
  return (
    !!geometry &&
    geometry.imageWidth > 0 &&
    geometry.imageHeight > 0 &&
    geometry.width > 0 &&
    geometry.height > 0
  );
}

/** Percentage-based absolute-position style for one evidence region. */
export function overlayStyle(geometry: EvidenceGeometry): OverlayStyle {
  const left = clampPct((geometry.x / geometry.imageWidth) * 100);
  const top = clampPct((geometry.y / geometry.imageHeight) * 100);
  // Clamp the far edge too so a slightly out-of-frame box never overflows the image.
  const right = clampPct(((geometry.x + geometry.width) / geometry.imageWidth) * 100);
  const bottom = clampPct(((geometry.y + geometry.height) / geometry.imageHeight) * 100);
  return {
    left: pct(left),
    top: pct(top),
    width: pct(Math.max(0, right - left)),
    height: pct(Math.max(0, bottom - top)),
  };
}

/** The selected observation's geometry, when present and usable. */
export function observationGeometry(obs: AnalyzerFieldObservation): EvidenceGeometry | null {
  return hasUsableGeometry(obs.geometry) ? obs.geometry : null;
}
