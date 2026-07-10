import type { FindingStatus, RuleExecutionStatus } from "@/domain/run/run-status";
import type { AuthorityVersion } from "@/domain/run/version-manifest.types";

import type { EvidenceReference } from "./evidence-reference";

/**
 * The explainable, reproducible result of one rule against one check.
 *
 * A finding copies the exact rule, profile, and authority versions that
 * produced it, so it can be audited and reproduced without consulting the run.
 * It carries no timestamps, timings, logs, disposition, or overall status —
 * those are not deterministic evidence.
 */
export interface VerificationFinding {
  ruleId: string;
  ruleVersion: string;
  profileId: string;
  profileVersion: string;
  /** Authority in the run-manifest convention: citation + snapshot/effective date. */
  authority: AuthorityVersion;
  findingStatus: FindingStatus;
  ruleExecutionStatus: RuleExecutionStatus;
  evidenceReferences: EvidenceReference[];
  /** Deterministic explanation or reason code for a reviewer. */
  message: string;
  /** Required when execution is not_run_external_dependency: what is missing. */
  externalEvidenceDependency?: string;
}
