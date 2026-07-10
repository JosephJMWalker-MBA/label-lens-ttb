import { type VerificationStatus } from "@/domain/verification/status";

/**
 * The five independent status dimensions of an analysis run.
 *
 * They are deliberately separate and never collapsed into an overall status or
 * a compliance percentage. Each answers a different question:
 * processing (where the run is), evidence (is a check's input sufficient),
 * rule execution (did a rule run), finding (the deterministic outcome), and
 * human disposition (recorded separately, see analysis-run.types).
 */

export const PROCESSING_STATUSES = [
  "created",
  "extracting",
  "evaluating",
  "completed",
  "failed",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

/** Evaluated per check — never a single global gate for the whole run. */
export const EVIDENCE_STATUSES = ["sufficient", "insufficient"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const RULE_EXECUTION_STATUSES = [
  "executed",
  "not_run_insufficient_evidence",
  "not_run_external_dependency",
  "error",
] as const;
export type RuleExecutionStatus = (typeof RULE_EXECUTION_STATUSES)[number];

/** Deterministic finding outcomes, extending the shared vocabulary with not_run. */
export const FINDING_STATUSES = [
  "PASS",
  "WARN",
  "FAIL",
  "NEEDS_REVIEW",
  "not_run",
] as const satisfies readonly (VerificationStatus | "not_run")[];
export type FindingStatus = (typeof FINDING_STATUSES)[number];
