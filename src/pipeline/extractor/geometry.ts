import type { EvidenceGeometry } from "@/pipeline/analyzer/analyzer.types";

import type { OcrWord, RegionTransform } from "./extractor.types";

/**
 * Map an OCR box from preprocessed (rotated + scaled) crop space back to the
 * original image coordinate system. Pure and deterministic: the same box and
 * transform always yield the same geometry, so a rotated-crop observation still
 * reports a box in the original 2404×834-style frame.
 *
 * 90° rotations preserve axis-alignment, so transforming the two opposite
 * corners and taking their min/max reconstructs the axis-aligned original box.
 */
function invRotate(
  rx: number,
  ry: number,
  rotate: 0 | 90 | 270,
  cropWidth: number,
  cropHeight: number,
): { cx: number; cy: number } {
  switch (rotate) {
    case 0:
      return { cx: rx, cy: ry };
    // sharp rotate(90) is clockwise: crop (cx,cy) -> rotated (Hc-cy, cx).
    case 90:
      return { cx: ry, cy: cropHeight - rx };
    // rotate(270) is 90° counter-clockwise: crop (cx,cy) -> rotated (cy, Wc-cx).
    case 270:
      return { cx: cropWidth - ry, cy: rx };
  }
}

export function mapBoxToOriginalGeometry(
  box: OcrWord["bbox"],
  transform: RegionTransform,
  imageIndex = 0,
): EvidenceGeometry {
  const { crop, rotate, scale } = transform;

  // 1. Undo the uniform scale to return to rotated-crop space.
  const rx0 = box.x0 / scale;
  const ry0 = box.y0 / scale;
  const rx1 = box.x1 / scale;
  const ry1 = box.y1 / scale;

  // 2. Undo rotation to crop space (both corners).
  const a = invRotate(rx0, ry0, rotate, crop.width, crop.height);
  const b = invRotate(rx1, ry1, rotate, crop.width, crop.height);

  // 3. Offset by the crop origin into original-image coordinates.
  const left = crop.left + Math.min(a.cx, b.cx);
  const right = crop.left + Math.max(a.cx, b.cx);
  const top = crop.top + Math.min(a.cy, b.cy);
  const bottom = crop.top + Math.max(a.cy, b.cy);

  // 4. Clamp to the image and guarantee a positive area (schema requires it).
  const x = clamp(Math.round(left), 0, transform.originalWidth - 1);
  const y = clamp(Math.round(top), 0, transform.originalHeight - 1);
  const width = clamp(Math.round(right - left), 1, transform.originalWidth - x);
  const height = clamp(Math.round(bottom - top), 1, transform.originalHeight - y);

  return {
    imageIndex,
    x,
    y,
    width,
    height,
    imageWidth: transform.originalWidth,
    imageHeight: transform.originalHeight,
  };
}

/** Union of several boxes' geometry into one bounding geometry (same frame). */
export function unionGeometry(geometries: EvidenceGeometry[]): EvidenceGeometry {
  if (geometries.length === 0) throw new Error("unionGeometry requires at least one geometry");
  const first = geometries[0];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const g of geometries) {
    x0 = Math.min(x0, g.x);
    y0 = Math.min(y0, g.y);
    x1 = Math.max(x1, g.x + g.width);
    y1 = Math.max(y1, g.y + g.height);
  }
  return {
    imageIndex: first.imageIndex,
    x: x0,
    y: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
    imageWidth: first.imageWidth,
    imageHeight: first.imageHeight,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
