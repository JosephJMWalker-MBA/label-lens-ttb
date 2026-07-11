import type { AnalyzerOcrEngine, EvidenceGeometry } from "@/pipeline/analyzer/analyzer.types";

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
}

export type ExtractionErrorCode =
  | "HASH_MISMATCH"
  | "EMPTY_IMAGE"
  | "UNSUPPORTED_FORMAT"
  | "CORRUPT_IMAGE"
  | "DIMENSIONS_OUT_OF_BOUNDS"
  | "OCR_UNAVAILABLE"
  | "INVALID_RESPONSE";

export interface ExtractionError {
  code: ExtractionErrorCode;
  message: string;
  issues: string[];
}

/** One geometric transform describing how a preprocessed crop maps to the original. */
export interface RegionTransform {
  /** Crop taken from the original image, in original-image coordinates. */
  crop: { left: number; top: number; width: number; height: number };
  /** Clockwise rotation applied to the crop before OCR (0, 90, or 270). */
  rotate: 0 | 90 | 270;
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
}

/** OCR output for one region candidate, with the transform to map it back. */
export interface RegionOcrResult {
  regionName: string;
  transform: RegionTransform;
  words: OcrWord[];
}

/** Records how a selected field was obtained, for honest provenance. */
export interface SelectionProvenance {
  regionName: string;
  preprocessing: string[];
  geometry: EvidenceGeometry;
}
