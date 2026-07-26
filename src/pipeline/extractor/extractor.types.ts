import type { AnalyzerOcrEngine, EvidenceGeometry } from "@/pipeline/analyzer/analyzer.types";
import type { PrecheckDiagnosticTrace } from "@/shared/precheck-diagnostics";

/**
 * Deterministic input to the local extractor. Every mutable or environment
 * value (timestamps, engine identity, adapter identity) is supplied by the
 * caller — the extraction function never generates a current time or a random
 * id, so identical bytes and metadata produce an identical response.
 */
export interface ExtractionInput {
  /** Raw image bytes of the sanitized derivative. */
  imageBytes: Uint8Array;
  artifactRef: string;
  /** Expected SHA-256 of `imageBytes`; verified before any OCR runs. */
  derivativeSha256: string;
  /** Supplied observation timestamp; never generated inside extraction. */
  processedAt: string;
  extractionAdapterId: string;
  extractionAdapterVersion: string;
  /** OCR engine/model identity, or an explicit not_applicable. */
  ocrEngine: AnalyzerOcrEngine;
  parserId: string;
  parserVersion: string;
  sellerRegionTargets?: SellerRegionOcrTarget[];
  diagnostics?: PrecheckDiagnosticTrace;
}

export type SellerRegionTargetCategoryId = "brandName" | "alcoholStatement";

export interface SellerRegionOcrTarget {
  categoryId: SellerRegionTargetCategoryId;
  regionId: string;
  panelId: string;
  region: {
    unit: "normalized-panel-relative";
    provenance: "seller-selected-region";
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type ExtractionErrorCode =
  | "HASH_MISMATCH"
  | "EMPTY_IMAGE"
  | "UNSUPPORTED_FORMAT"
  | "CORRUPT_IMAGE"
  | "DIMENSIONS_OUT_OF_BOUNDS"
  | "IMAGE_DIMENSIONS_EXCEEDED"
  | "IMAGE_PIXEL_BUDGET_EXCEEDED"
  | "MULTI_FRAME_IMAGE_UNSUPPORTED"
  | "OCR_UNAVAILABLE"
  | "OCR_FAILED"
  | "INVALID_RESPONSE";

export interface ExtractionError {
  code: ExtractionErrorCode;
  message: string;
  issues: string[];
}

export const OCR_PASS_KINDS = [
  "full-image-primary",
  "full-image-rot180",
  "left-edge-strip-rot270",
  "right-edge-strip-rot90",
  "focus-crop",
  "focus-edge-strip-rot270",
  "focus-edge-strip-rot90",
  "seller-region",
] as const;
export type OcrPassKind = (typeof OCR_PASS_KINDS)[number];

export const OCR_PASS_TRIGGER_REASONS = [
  "primary-pass",
  "brand-not-observed",
  "alcohol-not-observed",
  "low-text-density",
  "edge-text-heuristic",
  "focus-crop-distinct",
  "orientation-fallback",
  "seller-region-target",
] as const;
export type OcrPassTriggerReason = (typeof OCR_PASS_TRIGGER_REASONS)[number];

export type RotationDegrees = 0 | 90 | 180 | 270;

/** One geometric transform describing how a preprocessed crop maps to the original. */
export interface RegionTransform {
  /** Crop taken from the original image, in original-image coordinates. */
  crop: { left: number; top: number; width: number; height: number };
  /** Clockwise rotation applied to the crop before OCR (0, 90, 180, or 270). */
  rotate: RotationDegrees;
  /** Uniform scale factor applied after rotation. */
  scale: number;
  /** Original image dimensions, the reference frame for mapped geometry. */
  originalWidth: number;
  originalHeight: number;
}

/** One OCR token in preprocessed (rotated + scaled) coordinate space. */
export interface OcrWord {
  text: string;
  /** Raw OCR confidence on the engine's 0–100 scale. */
  rawConfidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  /** Present once a pass has mapped the token back to the original image frame. */
  originalGeometry?: EvidenceGeometry;
}

export interface OcrPassTimings {
  preprocessMs: number;
  ocrMs: number;
  inverseMappingMs: number;
  totalMs: number;
}

export interface OcrFieldEligibility {
  brand: boolean;
  alcohol: boolean;
}

/** OCR output for one region candidate, with the transform to map it back. */
export interface RegionOcrResult {
  passId: string;
  regionName: string;
  passKind: OcrPassKind;
  triggerReasons: OcrPassTriggerReason[];
  preprocessing: string[];
  fieldEligibility: OcrFieldEligibility;
  transform: RegionTransform;
  transformedSize: { width: number; height: number };
  pageSegMode: number;
  rawWordCount: number;
  discardedWordCount: number;
  timings: OcrPassTimings;
  words: OcrWord[];
}

export const SELLER_REGION_READING_STATES = [
  "OBSERVED",
  "LOW_CONFIDENCE",
  "AMBIGUOUS",
  "NOT_OBSERVED",
  "INVALID_REGION",
  "UNREADABLE",
] as const;
export type SellerRegionReadingState = (typeof SELLER_REGION_READING_STATES)[number];

export interface SellerRegionMachineReading {
  categoryId: SellerRegionTargetCategoryId;
  regionId: string;
  panelId: string;
  sellerRegion: SellerRegionOcrTarget["region"];
  cropGeometry: RegionTransform["crop"] & { imageWidth: number; imageHeight: number };
  rawTranscript: string;
  observedValue: string | null;
  normalizedValue?: string | null;
  ocrEvidenceScore: number;
  evidenceState: SellerRegionReadingState;
  failureReason?: string;
  observationState?: string;
  selectedGeometry?: EvidenceGeometry;
  passProvenance: {
    passId: string;
    passKind: OcrPassKind;
    regionName: string;
    triggerReasons: OcrPassTriggerReason[];
    preprocessing: string[];
    pageSegMode: number;
    transform: RegionTransform;
    transformedSize: { width: number; height: number };
    timings: OcrPassTimings;
  } | null;
  extractionProvenance: {
    extractionAdapterId: string;
    extractionAdapterVersion: string;
    ocrEngine: AnalyzerOcrEngine;
    parserId: string;
    parserVersion: string;
    processedAt: string;
  };
}

/** Records how a selected field was obtained, for honest provenance. */
export interface SelectionProvenance {
  passId: string;
  passKind: OcrPassKind;
  regionName: string;
  triggerReasons: OcrPassTriggerReason[];
  preprocessing: string[];
  geometry: EvidenceGeometry;
}
