import type { PrecheckResult } from "@/pipeline/result/result.types";

/**
 * A bounded, human-readable projection of an assembled `PrecheckResult`.
 *
 * The report is a faithful rendering of an already-validated result: it
 * re-executes no rules, resolves nothing external, and carries no image bytes,
 * model bytes, OCR token dumps, local paths, logs, timings, or any overall
 * compliance status/percentage/score. It references the canonical JSON export's
 * integrity checksum rather than recomputing evidence.
 */
export const REPORT_SCHEMA_VERSION = "wine-precheck-readable-report.v1" as const;

export interface ReadableReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  /** Deterministic filename derived only from the stable machine-result id. */
  filename: string;
  /** Self-contained UTF-8 HTML document text. */
  html: string;
}

export type ReportErrorCode = "INVALID_REPORT_IDENTITY";

export interface ReportError {
  code: ReportErrorCode;
  message: string;
  issues: string[];
}

/** Inputs the builder needs beyond the result: the canonical JSON checksum. */
export interface ReadableReportInput {
  result: PrecheckResult;
  /** The canonical JSON export integrity checksum this report corresponds to. */
  jsonChecksum: string;
}
