import type { VerificationFinding } from "./finding.types";
import type { VerificationStatus } from "./status";

/**
 * The complete, exportable outcome of verifying one label.
 *
 * The report is the stable contract between the pipeline, the UI, and any
 * exported artifact; it preserves the reasoning shown to the reviewer.
 */
export interface VerificationReport {
  /** Aggregate status derived from the individual findings. */
  overallStatus: VerificationStatus;
  findings: VerificationFinding[];
  /** End-to-end processing time in milliseconds. */
  processingMs: number;
  /** Assumptions the pipeline made (e.g. beverage type defaults). */
  assumptions: string[];
  /** Known limitations affecting confidence (e.g. bold type unverifiable). */
  limitations: string[];
  /** ISO-8601 timestamp of when the report was produced. */
  createdAt: string;
}
