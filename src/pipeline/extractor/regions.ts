import sharp from "sharp";

import type { EvidenceGeometry } from "@/pipeline/analyzer/analyzer.types";
import type { PrecheckDiagnosticTrace } from "@/shared/precheck-diagnostics";

import { mapBoxToOriginalGeometry, unionGeometry } from "./geometry";
import type { OcrEngine } from "./ocr-engine";
import { PAGE_SEG } from "./ocr-engine";
import type {
  OcrFieldEligibility,
  OcrPassKind,
  OcrPassTriggerReason,
  RegionOcrResult,
  RegionTransform,
  RotationDegrees,
} from "./extractor.types";

/**
 * Bounded, explainable OCR pass strategy.
 *
 * The extractor now stages OCR instead of always scanning one static center
 * strip: it runs a primary full-image pass, then conditionally adds a small
 * number of rotated/region passes only when the primary extractor leaves brand
 * or alcohol unresolved. Every pass still maps its word geometry back into the
 * original uploaded image frame before selection or reporting.
 */

interface PassTemplate {
  regionName: string;
  passKind: OcrPassKind;
  rotate: RotationDegrees;
  scale: number;
  pageSegMode: number;
  preprocessing: string[];
  fieldEligibility: OcrFieldEligibility;
}

export interface PlannedOcrPass {
  passId: string;
  regionName: string;
  passKind: OcrPassKind;
  triggerReasons: OcrPassTriggerReason[];
  preprocessing: string[];
  fieldEligibility: OcrFieldEligibility;
  pageSegMode: number;
  transform: RegionTransform;
}

interface WordComponent {
  words: MappedWord[];
  geometry: EvidenceGeometry;
}

type MappedWord = RegionOcrResult["words"][number] & { originalGeometry: EvidenceGeometry };

interface FocusCropDecision {
  crop: RegionTransform["crop"];
  preferredEdge: "left" | "right" | null;
}

const FULL_IMAGE_SCALE = 1.5;
const EDGE_STRIP_SCALE = 3;
const FOCUS_CROP_SCALE = 2;
const FULL_SIDE_STRIP_WIDTH_FRACTION = 0.44;
const FOCUS_EDGE_STRIP_WIDTH_FRACTION = 0.22;
const MIN_EDGE_STRIP_WIDTH_PX = 72;
const MAX_TOTAL_PASSES = 5;
const LOW_TEXT_DENSITY_WORD_COUNT = 18;
const FOCUS_MIN_WORDS = 4;
const FOCUS_MIN_AREA_RATIO = 0.08;
const FOCUS_MAX_AREA_RATIO = 0.82;
const FOCUS_PADDING_RATIO = 0.08;
const FOCUS_MIN_PADDING_PX = 24;

const PRIMARY_TEMPLATE: PassTemplate = {
  regionName: "full-image",
  passKind: "full-image-primary",
  rotate: 0,
  scale: FULL_IMAGE_SCALE,
  pageSegMode: PAGE_SEG.SPARSE_TEXT,
  preprocessing: ["grayscale", "normalise", "scale:1.5"],
  fieldEligibility: { brand: true, alcohol: true },
};

const ROT180_TEMPLATE: PassTemplate = {
  regionName: "full-image-rot180",
  passKind: "full-image-rot180",
  rotate: 180,
  scale: FULL_IMAGE_SCALE,
  pageSegMode: PAGE_SEG.SPARSE_TEXT,
  preprocessing: ["rotate:180", "grayscale", "normalise", "scale:1.5"],
  fieldEligibility: { brand: true, alcohol: true },
};

const LEFT_EDGE_TEMPLATE: PassTemplate = {
  regionName: "left-edge-strip-rot270",
  passKind: "left-edge-strip-rot270",
  rotate: 270,
  scale: EDGE_STRIP_SCALE,
  pageSegMode: PAGE_SEG.SPARSE_TEXT,
  preprocessing: ["crop:edge-strip", "rotate:270", "grayscale", "normalise", "scale:3"],
  fieldEligibility: { brand: false, alcohol: true },
};

const RIGHT_EDGE_TEMPLATE: PassTemplate = {
  regionName: "right-edge-strip-rot90",
  passKind: "right-edge-strip-rot90",
  rotate: 90,
  scale: EDGE_STRIP_SCALE,
  pageSegMode: PAGE_SEG.SPARSE_TEXT,
  preprocessing: ["crop:edge-strip", "rotate:90", "grayscale", "normalise", "scale:3"],
  fieldEligibility: { brand: false, alcohol: true },
};

const FOCUS_TEMPLATE: PassTemplate = {
  regionName: "focus-crop",
  passKind: "focus-crop",
  rotate: 0,
  scale: FOCUS_CROP_SCALE,
  pageSegMode: PAGE_SEG.SPARSE_TEXT,
  preprocessing: ["crop:focus", "grayscale", "normalise", "scale:2"],
  fieldEligibility: { brand: false, alcohol: true },
};

const FOCUS_LEFT_EDGE_TEMPLATE: PassTemplate = {
  regionName: "focus-edge-strip-rot270",
  passKind: "focus-edge-strip-rot270",
  rotate: 270,
  scale: EDGE_STRIP_SCALE,
  pageSegMode: PAGE_SEG.SPARSE_TEXT,
  preprocessing: ["crop:focus-edge-strip", "rotate:270", "grayscale", "normalise", "scale:3"],
  fieldEligibility: { brand: false, alcohol: true },
};

const FOCUS_RIGHT_EDGE_TEMPLATE: PassTemplate = {
  regionName: "focus-edge-strip-rot90",
  passKind: "focus-edge-strip-rot90",
  rotate: 90,
  scale: EDGE_STRIP_SCALE,
  pageSegMode: PAGE_SEG.SPARSE_TEXT,
  preprocessing: ["crop:focus-edge-strip", "rotate:90", "grayscale", "normalise", "scale:3"],
  fieldEligibility: { brand: false, alcohol: true },
};

const TEMPLATE_BY_REGION = new Map(
  [
    PRIMARY_TEMPLATE,
    ROT180_TEMPLATE,
    LEFT_EDGE_TEMPLATE,
    RIGHT_EDGE_TEMPLATE,
    FOCUS_TEMPLATE,
    FOCUS_LEFT_EDGE_TEMPLATE,
    FOCUS_RIGHT_EDGE_TEMPLATE,
  ].map((template) => [template.regionName, template]),
);

/**
 * Worst-case pass count / scale ceilings exported for the resource policy.
 * These are maxima for the staged planner, not the count used on every image.
 */
export const REGION_COUNT = MAX_TOTAL_PASSES;
export const MAX_REGION_SCALE = Math.max(
  ...[...TEMPLATE_BY_REGION.values()].map((template) => template.scale),
);

export function worstCaseIntermediatePixels(maxDecodedPixels: number): number {
  return Math.max(
    maxDecodedPixels * FULL_IMAGE_SCALE * FULL_IMAGE_SCALE,
    maxDecodedPixels * FULL_SIDE_STRIP_WIDTH_FRACTION * EDGE_STRIP_SCALE * EDGE_STRIP_SCALE,
  );
}

function passId(index: number, regionName: string): string {
  return `pass-${index}-${regionName}`;
}

function fullCrop(width: number, height: number): RegionTransform["crop"] {
  return { left: 0, top: 0, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizedEdgeWidth(base: RegionTransform["crop"], widthFraction: number): number {
  return clamp(
    Math.round(base.width * widthFraction),
    Math.min(MIN_EDGE_STRIP_WIDTH_PX, base.width),
    base.width,
  );
}

function edgeStripCrop(
  base: RegionTransform["crop"],
  side: "left" | "right",
  widthFraction: number,
): RegionTransform["crop"] {
  const width = normalizedEdgeWidth(base, widthFraction);
  const left = side === "left" ? base.left : base.left + Math.max(0, base.width - width);
  return {
    left,
    top: base.top,
    width,
    height: base.height,
  };
}

function planFromTemplate(
  template: PassTemplate,
  crop: RegionTransform["crop"],
  originalWidth: number,
  originalHeight: number,
  triggerReasons: OcrPassTriggerReason[],
  index: number,
): PlannedOcrPass {
  return {
    passId: passId(index, template.regionName),
    regionName: template.regionName,
    passKind: template.passKind,
    triggerReasons: [...new Set(triggerReasons)],
    preprocessing: template.preprocessing,
    fieldEligibility: template.fieldEligibility,
    pageSegMode: template.pageSegMode,
    transform: {
      crop,
      rotate: template.rotate,
      scale: template.scale,
      originalWidth,
      originalHeight,
    },
  };
}

export function planPrimaryOcrPass(originalWidth: number, originalHeight: number): PlannedOcrPass {
  return planFromTemplate(
    PRIMARY_TEMPLATE,
    fullCrop(originalWidth, originalHeight),
    originalWidth,
    originalHeight,
    ["primary-pass"],
    0,
  );
}

function gapBetween(a0: number, a1: number, b0: number, b1: number): number {
  if (a1 < b0) return b0 - a1;
  if (b1 < a0) return a0 - b1;
  return 0;
}

function mappedWords(words: RegionOcrResult["words"]): MappedWord[] {
  return words.filter((word): word is MappedWord => word.originalGeometry !== undefined);
}

function components(words: RegionOcrResult["words"]): WordComponent[] {
  const pending = mappedWords(words).map((word) => ({ ...word.originalGeometry, word }));
  const seen = new Set<number>();
  const groups: WordComponent[] = [];
  for (const [index] of pending.entries()) {
    if (seen.has(index)) continue;
    const queue = [index];
    seen.add(index);
    const grouped: MappedWord[] = [];
    while (queue.length > 0) {
      const next = queue.shift()!;
      const base = pending[next];
      grouped.push(base.word);
      for (const [otherIndex, other] of pending.entries()) {
        if (seen.has(otherIndex)) continue;
        const xGap = gapBetween(base.x, base.x + base.width, other.x, other.x + other.width);
        const yGap = gapBetween(base.y, base.y + base.height, other.y, other.y + other.height);
        const height = Math.max(base.height, other.height);
        if (xGap <= Math.max(24, height * 2.5) && yGap <= Math.max(24, height * 2)) {
          seen.add(otherIndex);
          queue.push(otherIndex);
        }
      }
    }
    groups.push({
      words: grouped,
      geometry: unionGeometry(grouped.map((word) => word.originalGeometry)),
    });
  }
  return groups;
}

function distinctFocusCrop(primary: RegionOcrResult): FocusCropDecision | null {
  if (primary.words.length < FOCUS_MIN_WORDS) return null;
  const groups = components(primary.words).sort(
    (a, b) =>
      b.words.length - a.words.length ||
      b.geometry.width * b.geometry.height - a.geometry.width * a.geometry.height,
  );
  if (groups.length < 2) return null;

  const best = groups[0];
  const imageArea = primary.transform.originalWidth * primary.transform.originalHeight;
  const bestArea = best.geometry.width * best.geometry.height;
  const areaRatio = bestArea / Math.max(1, imageArea);
  if (areaRatio < FOCUS_MIN_AREA_RATIO || areaRatio > FOCUS_MAX_AREA_RATIO) return null;

  const distinctPeer = groups
    .slice(1)
    .some(
      (group) =>
        gapBetween(
          best.geometry.x,
          best.geometry.x + best.geometry.width,
          group.geometry.x,
          group.geometry.x + group.geometry.width,
        ) >
          primary.transform.originalWidth * 0.12 ||
        gapBetween(
          best.geometry.y,
          best.geometry.y + best.geometry.height,
          group.geometry.y,
          group.geometry.y + group.geometry.height,
        ) >
          primary.transform.originalHeight * 0.12,
    );
  if (!distinctPeer) return null;

  const padX = Math.max(
    FOCUS_MIN_PADDING_PX,
    Math.round(best.geometry.width * FOCUS_PADDING_RATIO),
  );
  const padY = Math.max(
    FOCUS_MIN_PADDING_PX,
    Math.round(best.geometry.height * FOCUS_PADDING_RATIO),
  );
  const cropLeft = clamp(best.geometry.x - padX, 0, primary.transform.originalWidth - 1);
  const cropTop = clamp(best.geometry.y - padY, 0, primary.transform.originalHeight - 1);
  const cropRight = clamp(
    best.geometry.x + best.geometry.width + padX,
    cropLeft + 1,
    primary.transform.originalWidth,
  );
  const cropBottom = clamp(
    best.geometry.y + best.geometry.height + padY,
    cropTop + 1,
    primary.transform.originalHeight,
  );
  const crop = {
    left: cropLeft,
    top: cropTop,
    width: cropRight - cropLeft,
    height: cropBottom - cropTop,
  };

  if (
    crop.width >= primary.transform.originalWidth * 0.92 &&
    crop.height >= primary.transform.originalHeight * 0.92
  ) {
    return null;
  }

  const leftMargin = best.geometry.x - crop.left;
  const rightMargin = crop.left + crop.width - (best.geometry.x + best.geometry.width);
  const preferredEdge =
    Math.max(leftMargin, rightMargin) < crop.width * 0.12
      ? null
      : rightMargin >= leftMargin
        ? "right"
        : "left";

  return { crop, preferredEdge };
}

function primaryEdgeHints(primary: RegionOcrResult): {
  left: boolean;
  right: boolean;
  lowTextDensity: boolean;
} {
  const { originalWidth } = primary.transform;
  const words = mappedWords(primary.words);
  const left = words.some(
    (word) => word.originalGeometry.x + word.originalGeometry.width / 2 <= originalWidth * 0.2,
  );
  const right = words.some(
    (word) => word.originalGeometry.x + word.originalGeometry.width / 2 >= originalWidth * 0.8,
  );
  return { left, right, lowTextDensity: words.length < LOW_TEXT_DENSITY_WORD_COUNT };
}

export function planRecoveryOcrPasses(input: {
  primary: RegionOcrResult;
  needsBrandRecovery: boolean;
  needsAlcoholRecovery: boolean;
}): PlannedOcrPass[] {
  const { primary, needsBrandRecovery, needsAlcoholRecovery } = input;
  if (!needsBrandRecovery && !needsAlcoholRecovery) return [];

  const reasons: OcrPassTriggerReason[] = [];
  if (needsBrandRecovery) reasons.push("brand-not-observed");
  if (needsAlcoholRecovery) reasons.push("alcohol-not-observed");

  const hints = primaryEdgeHints(primary);
  if (hints.lowTextDensity) reasons.push("low-text-density");
  if (hints.left || hints.right) reasons.push("edge-text-heuristic");

  const planned: PlannedOcrPass[] = [];
  let index = 1;
  const push = (
    template: PassTemplate,
    crop: RegionTransform["crop"],
    extraReasons: OcrPassTriggerReason[] = [],
  ) => {
    if (planned.length + 1 >= MAX_TOTAL_PASSES) return;
    planned.push(
      planFromTemplate(
        template,
        crop,
        primary.transform.originalWidth,
        primary.transform.originalHeight,
        [...reasons, ...extraReasons],
        index++,
      ),
    );
  };

  const baseCrop = fullCrop(primary.transform.originalWidth, primary.transform.originalHeight);
  if (needsAlcoholRecovery) {
    push(LEFT_EDGE_TEMPLATE, edgeStripCrop(baseCrop, "left", FULL_SIDE_STRIP_WIDTH_FRACTION));
  }
  if (needsAlcoholRecovery) {
    push(RIGHT_EDGE_TEMPLATE, edgeStripCrop(baseCrop, "right", FULL_SIDE_STRIP_WIDTH_FRACTION));
  }

  const focus = needsAlcoholRecovery ? distinctFocusCrop(primary) : null;
  if (focus) {
    push(FOCUS_TEMPLATE, focus.crop, ["focus-crop-distinct"]);
    if (focus.preferredEdge === "left") {
      push(
        FOCUS_LEFT_EDGE_TEMPLATE,
        edgeStripCrop(focus.crop, "left", FOCUS_EDGE_STRIP_WIDTH_FRACTION),
        ["focus-crop-distinct", "edge-text-heuristic"],
      );
    } else if (focus.preferredEdge === "right") {
      push(
        FOCUS_RIGHT_EDGE_TEMPLATE,
        edgeStripCrop(focus.crop, "right", FOCUS_EDGE_STRIP_WIDTH_FRACTION),
        ["focus-crop-distinct", "edge-text-heuristic"],
      );
    }
  }

  if (planned.length + 1 < MAX_TOTAL_PASSES && primary.words.length <= 6) {
    push(ROT180_TEMPLATE, baseCrop, ["orientation-fallback"]);
  }

  return planned;
}

async function preprocess(
  bytes: Uint8Array,
  pass: PlannedOcrPass,
): Promise<{ png: Buffer; transformedSize: { width: number; height: number } }> {
  const { crop, rotate, scale } = pass.transform;
  let pipeline = sharp(Buffer.from(bytes)).extract(crop);
  if (rotate) {
    const rotated = await pipeline.rotate(rotate).toBuffer();
    pipeline = sharp(rotated);
  }
  const meta = await pipeline.metadata();
  const targetWidth = Math.max(1, Math.round((meta.width ?? crop.width) * scale));
  const targetHeight = Math.max(1, Math.round((meta.height ?? crop.height) * scale));
  const png = await pipeline
    .resize({ width: targetWidth, kernel: "cubic" })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();
  return { png, transformedSize: { width: targetWidth, height: targetHeight } };
}

/** Preprocessing labels for a region, used for honest provenance. */
export function regionPreprocessing(regionName: string): string[] {
  return TEMPLATE_BY_REGION.get(regionName)?.preprocessing ?? [];
}

export async function runOcrPass(
  bytes: Uint8Array,
  pass: PlannedOcrPass,
  engine: OcrEngine,
  diagnostics?: PrecheckDiagnosticTrace,
): Promise<RegionOcrResult> {
  const startedAt = performance.now();
  const preprocessStartedAt = performance.now();
  let png: Buffer;
  let transformedSize: { width: number; height: number };
  try {
    ({ png, transformedSize } = await preprocess(bytes, pass));
  } catch (cause) {
    diagnostics?.fail(
      "preprocessing-completed",
      {
        layer: "extractor",
        code: "PREPROCESSING_FAILED",
        issues: [cause instanceof Error ? cause.message : String(cause)],
      },
      { passId: pass.passId, passKind: pass.passKind },
    );
    throw cause;
  }
  const preprocessMs = performance.now() - preprocessStartedAt;
  diagnostics?.reach(
    "preprocessing-completed",
    { passId: pass.passId, passKind: pass.passKind },
    { once: false },
  );

  const ocrStartedAt = performance.now();
  let rawWords;
  try {
    rawWords = await engine.recognizeWords(png, pass.pageSegMode);
  } catch (cause) {
    diagnostics?.fail(
      "ocr-pass-completed",
      {
        layer: "extractor",
        code: "OCR_PASS_FAILED",
        issues: [cause instanceof Error ? cause.message : String(cause)],
      },
      { passId: pass.passId, passKind: pass.passKind },
    );
    throw cause;
  }
  const ocrMs = performance.now() - ocrStartedAt;

  const mappingStartedAt = performance.now();
  let words;
  try {
    words = rawWords
      .map((word) => {
        const originalGeometry = mapBoxToOriginalGeometry(word.bbox, pass.transform);
        return originalGeometry ? { ...word, originalGeometry } : null;
      })
      .filter((word): word is NonNullable<typeof word> => word !== null);
  } catch (cause) {
    diagnostics?.fail(
      "ocr-pass-completed",
      {
        layer: "extractor",
        code: "OCR_PASS_MAPPING_FAILED",
        issues: [cause instanceof Error ? cause.message : String(cause)],
      },
      { passId: pass.passId, passKind: pass.passKind },
    );
    throw cause;
  }
  const inverseMappingMs = performance.now() - mappingStartedAt;

  const result: RegionOcrResult = {
    passId: pass.passId,
    regionName: pass.regionName,
    passKind: pass.passKind,
    triggerReasons: pass.triggerReasons,
    preprocessing: pass.preprocessing,
    fieldEligibility: pass.fieldEligibility,
    transform: pass.transform,
    transformedSize,
    pageSegMode: pass.pageSegMode,
    rawWordCount: rawWords.length,
    discardedWordCount: rawWords.length - words.length,
    timings: {
      preprocessMs,
      ocrMs,
      inverseMappingMs,
      totalMs: performance.now() - startedAt,
    },
    words,
  };
  diagnostics?.reach(
    "ocr-pass-completed",
    { passId: pass.passId, passKind: pass.passKind },
    { once: false },
  );
  return result;
}
