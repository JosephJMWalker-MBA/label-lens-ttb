import type { AnalysisRunCreationInput } from "@/domain/run/analysis-run.types";
import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type { EvidenceStatus } from "@/domain/run/run-status";
import type { RuleVersionRef } from "@/domain/run/version-manifest.types";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type { AnalyzerEvidenceResponse } from "@/pipeline/analyzer/analyzer.types";

/** The two independent checks the wine pre-check evaluates. Never a global gate. */
export const PRECHECK_CHECK_IDS = ["brand-name-check", "wine-alcohol-check"] as const;
export type PrecheckCheckId = (typeof PRECHECK_CHECK_IDS)[number];

/** Operator-declared application facts consumed by the pre-check. */
export interface PrecheckDeclaredFacts {
  applicationBrandName: DeclaredFact;
  applicationAlcoholValue: DeclaredFact;
}

/**
 * Whether the analyzer affirmatively processed the relevant artifact/region for
 * each check. This is the explicit signal that distinguishes a genuine
 * NOT_OBSERVED (region processed, nothing found) from unprocessed evidence. It
 * is never inferred from confidence.
 */
export interface PrecheckCoverage {
  brandNameProcessed: boolean;
  alcoholStatementProcessed: boolean;
}

/**
 * Advisory-only quality metadata. It lives entirely outside the deterministic
 * evidence-status and finding contracts: it can never overwrite an evidence
 * status, suppress an observation, block execution, or change a finding.
 */
export interface PrecheckAdvisoryQuality {
  imageQualityWarnings?: string[];
  note?: string;
}

/**
 * One bounded check request: a single sanitized derivative, the run-creation
 * input, declared application facts, one analyzer response, and explicit
 * coverage. No ZIPs, batches, submissions, revisions, queues, or UI state.
 */
export interface PrecheckRequest {
  run: AnalysisRunCreationInput;
  sanitizedDerivativeSha256: string;
  declaredFacts: PrecheckDeclaredFacts;
  analyzer: AnalyzerEvidenceResponse;
  coverage: PrecheckCoverage;
  quality?: PrecheckAdvisoryQuality;
}

/** Deterministic per-check evidence assessment with an explanatory reason code. */
export interface EvidenceAssessment {
  checkId: PrecheckCheckId;
  evidenceStatus: EvidenceStatus;
  reasonCode: string;
}

/**
 * The orchestration result: per-check evidence, ordered findings in registry
 * order, the ordered rule manifest, and the profile identity. It is not a
 * user-facing report and carries no timing, logs, timestamps, or disposition.
 */
export interface PrecheckResult {
  profileId: string;
  profileVersion: string;
  ruleManifest: RuleVersionRef[];
  evidenceAssessments: EvidenceAssessment[];
  findings: VerificationFinding[];
}

export type PrecheckErrorCode = "INVALID_INTAKE" | "PROFILE_MISMATCH" | "INVALID_FINDING";

export interface PrecheckError {
  code: PrecheckErrorCode;
  message: string;
  issues: string[];
}
