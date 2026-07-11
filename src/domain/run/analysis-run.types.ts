import type { DeclaredFacts } from "./declared-facts.types";
import type {
  EvidenceStatus,
  FindingStatus,
  ProcessingStatus,
  RuleExecutionStatus,
} from "./run-status";
import type { VersionManifest } from "./version-manifest.types";

/**
 * One analysis run: the smallest binding of one product revision, one source
 * artifact, one sanitized derivative, immutable declared facts, an immutable
 * version manifest, the five status dimensions, and an append-only human
 * disposition history. Deliberately not a broad Submission or workflow domain.
 */

export interface ProductRevisionReference {
  productId: string;
  revisionId: string;
}

/** Reference to the original source artifact; hash is null when bytes are not retained. */
export interface SourceArtifactReference {
  artifactId: string;
  sha256: string | null;
}

export interface SanitizedDerivativeReference {
  derivativeId: string;
  path: string;
  sha256: string;
}

/** Per-check status. Carries no image-quality or confidence data by design. */
export interface RunCheck {
  checkId: string;
  evidenceStatus: EvidenceStatus;
  ruleExecutionStatus: RuleExecutionStatus;
  findingStatus: FindingStatus;
  /** Reference to a produced finding, or null before one exists. */
  findingRef: string | null;
}

export const HUMAN_DISPOSITION_OUTCOMES = [
  "CONFIRMED_FINDINGS",
  "CORRECTED_EVIDENCE",
  "ESCALATED_FOR_REVIEW",
] as const;
export type HumanDispositionOutcome = (typeof HUMAN_DISPOSITION_OUTCOMES)[number];

/** One entry in the append-only human disposition history. */
export interface HumanDispositionEntry {
  outcome: HumanDispositionOutcome;
  decidedBy: string;
  decidedAt: string;
  note?: string;
}

export interface AnalysisRun {
  runId: string;
  /** Run creation record. The only run-level timestamp in the contract. */
  createdAt: string;
  product: ProductRevisionReference;
  sourceArtifact: SourceArtifactReference;
  sanitizedDerivative: SanitizedDerivativeReference;
  /** Immutable after creation. */
  declaredFacts: DeclaredFacts;
  /** Immutable after creation. */
  versionManifest: VersionManifest;
  processingStatus: ProcessingStatus;
  checks: RunCheck[];
  dispositionHistory: HumanDispositionEntry[];
}

/** Inputs required to create a run. Statuses and history are derived, not supplied. */
export interface AnalysisRunCreationInput {
  runId: string;
  createdAt: string;
  product: ProductRevisionReference;
  sourceArtifact: SourceArtifactReference;
  sanitizedDerivative: SanitizedDerivativeReference;
  declaredFacts: DeclaredFacts;
  versionManifest: VersionManifest;
  /** Check identifiers to initialize; all begin insufficient / not_run. */
  checkIds: string[];
}

export type AnalysisRunErrorCode = "INVALID_INPUT";

export interface AnalysisRunError {
  code: AnalysisRunErrorCode;
  message: string;
  issues: string[];
}
