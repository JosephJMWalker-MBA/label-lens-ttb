import sharp from "sharp";

import type { OcrEngine } from "./ocr-engine";
import { PAGE_SEG } from "./ocr-engine";
import type { RegionOcrResult, RegionTransform } from "./extractor.types";

/**
 * Bounded, explainable region strategy. Candidates are derived proportionally
 * from the image dimensions — never from the fixture hash, filename, or the
 * expected words. Vertical text is handled with 90° and 270° rotations so the
 * selector can pick the correctly-oriented reading deterministically.
 */

interface RegionSpec {
  name: string;
  /** Proportional crop [leftFrac, topFrac, widthFrac, heightFrac]. */
  crop: [number, number, number, number];
  rotate: 0 | 90 | 270;
  scale: number;
  pageSegMode: number;
  preprocessing: string[];
}

const REGION_SPECS: RegionSpec[] = [
  {
    name: "full-image",
    crop: [0, 0, 1, 1],
    rotate: 0,
    scale: 1.5,
    pageSegMode: PAGE_SEG.SPARSE_TEXT,
    preprocessing: ["grayscale", "normalise", "scale:1.5"],
  },
  {
    name: "vertical-mandatory-strip-rot90",
    crop: [0.55, 0, 0.12, 1],
    rotate: 90,
    scale: 2,
    pageSegMode: PAGE_SEG.SPARSE_TEXT,
    preprocessing: ["crop:proportional", "rotate:90", "grayscale", "normalise", "scale:2"],
  },
  {
    name: "vertical-mandatory-strip-rot270",
    crop: [0.55, 0, 0.12, 1],
    rotate: 270,
    scale: 2,
    pageSegMode: PAGE_SEG.SPARSE_TEXT,
    preprocessing: ["crop:proportional", "rotate:270", "grayscale", "normalise", "scale:2"],
  },
];

/**
 * Bounded region-strategy metrics, exported so the resource policy can assert
 * the fixed pass count and scale multipliers stay within budget. The set is
 * static, so these are compile-time-constant ceilings, not per-request values.
 */
export const REGION_COUNT = REGION_SPECS.length;
export const MAX_REGION_SCALE = Math.max(...REGION_SPECS.map((s) => s.scale));
/** Worst-case intermediate pixel count for a decoded image at the pixel budget. */
export function worstCaseIntermediatePixels(maxDecodedPixels: number): number {
  return Math.max(
    ...REGION_SPECS.map((s) => s.crop[2] * s.crop[3] * maxDecodedPixels * s.scale * s.scale),
  );
}

function toPixelCrop(
  [lf, tf, wf, hf]: [number, number, number, number],
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const left = Math.round(lf * width);
  const top = Math.round(tf * height);
  return {
    left,
    top,
    width: Math.max(1, Math.min(Math.round(wf * width), width - left)),
    height: Math.max(1, Math.min(Math.round(hf * height), height - top)),
  };
}

async function preprocess(
  bytes: Uint8Array,
  spec: RegionSpec,
  crop: { left: number; top: number; width: number; height: number },
): Promise<Buffer> {
  let pipeline = sharp(Buffer.from(bytes)).extract(crop);
  if (spec.rotate) {
    const rotated = await pipeline.rotate(spec.rotate).toBuffer();
    pipeline = sharp(rotated);
  }
  const meta = await pipeline.metadata();
  const targetWidth = Math.max(1, Math.round((meta.width ?? crop.width) * spec.scale));
  return pipeline
    .resize({ width: targetWidth, kernel: "cubic" })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();
}

/** Preprocessing labels for a region, used for honest provenance. */
export function regionPreprocessing(regionName: string): string[] {
  return REGION_SPECS.find((s) => s.name === regionName)?.preprocessing ?? [];
}

/** Run OCR over every deterministic region candidate, in stable order. */
export async function runRegionOcr(
  bytes: Uint8Array,
  originalWidth: number,
  originalHeight: number,
  engine: OcrEngine,
): Promise<RegionOcrResult[]> {
  const results: RegionOcrResult[] = [];
  for (const spec of REGION_SPECS) {
    const crop = toPixelCrop(spec.crop, originalWidth, originalHeight);
    const png = await preprocess(bytes, spec, crop);
    const words = await engine.recognizeWords(png, spec.pageSegMode);
    const transform: RegionTransform = {
      crop,
      rotate: spec.rotate,
      scale: spec.scale,
      originalWidth,
      originalHeight,
    };
    results.push({ regionName: spec.name, transform, words });
  }
  return results;
}
