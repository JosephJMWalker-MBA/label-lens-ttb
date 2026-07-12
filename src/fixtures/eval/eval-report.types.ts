import type { AnalyzerObservationState } from "@/pipeline/analyzer/analyzer.types";
import type { BrandAbstentionReason, BrandLineReason } from "@/pipeline/extractor/field-selection";

import type { AggregateMetrics } from "./metrics";
import type { EvalFailureClass, EvalStratum } from "./eval-manifest.types";

/**
 * Machine-readable evaluation report shapes. The report is deterministic given
 * fixed OCR output: it contains no timestamps, no absolute paths, no image
 * bytes, and no unbounded OCR logs — only bounded, inspectable diagnostics.
 */

/** One bounded OCR token kept for inspection (processed-space geometry). */
export interface DiagnosticWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Bounded diagnostics for one region. */
export interface RegionDiagnostics {
  regionName: string;
  wordCount: number;
  /** Capped sample of tokens (never the full unbounded OCR log). */
  sampleWords: DiagnosticWord[];
}

export interface CaseDiagnostics {
  regions: RegionDiagnostics[];
  /** Reconstructed brand-region line texts (capped). */
  brandLineTexts: string[];
  brandLineDecisions: {
    rawText: string;
    cleanedValue: string | null;
    confidence: number;
    prominence: number;
    kept: boolean;
    reason: BrandLineReason;
  }[];
  brandAbstentionReason?: BrandAbstentionReason;
  brandOcrContainsAcceptable: boolean;
  alcoholNumberInOcr: boolean;
  alcoholPercentInOcr: boolean;
  alcoholNumberAndPercentSameLine: boolean;
}

/** The extractor's projected view of one field, plus the harness verdicts. */
export interface FieldReport {
  state: AnalyzerObservationState;
  value: string | null;
  confidence: number;
  alternates: { value: string; confidence: number }[];
  failureClass: EvalFailureClass;
}

export interface CaseReport {
  caseId: string;
  fixtureDir: string;
  strata: EvalStratum[];
  /** Present only when extraction returned a typed error. */
  extractionError: string | null;
  brand: FieldReport & {
    present: boolean;
    acceptable: string[];
    knownAmbiguous: boolean;
    exactMatch: boolean;
    normalizedMatch: boolean;
    top3Recall: boolean;
  };
  alcohol: FieldReport & {
    present: boolean;
    acceptablePercents: number[];
    detected: boolean;
    parsedValue: number | null;
    parsedAccurate: boolean;
  };
  diagnostics: CaseDiagnostics;
  latencyMs: number;
}

export interface EvalAlcoholSliceMetrics {
  key: string;
  label: string;
  presentCaseCount: number;
  detectedCount: number;
  parsedAccurateCount: number;
  detectionRecall: number;
  parsedAccuracy: number;
}

export interface EvalFailureDistributionBucket {
  key: string;
  label: string;
  count: number;
}

export interface EvalReport {
  schemaVersion: "extraction-baseline-report.v2";
  manifestSchemaVersion: string;
  extractorAdapter: { id: string; version: string };
  aggregate: AggregateMetrics;
  breakdowns: {
    alcoholSlices: EvalAlcoholSliceMetrics[];
    failureDistribution: EvalFailureDistributionBucket[];
  };
  cases: CaseReport[];
}
