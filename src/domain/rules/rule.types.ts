import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type { EvidenceStatus } from "@/domain/run/run-status";
import type { AuthorityVersion } from "@/domain/run/version-manifest.types";
import type { EvidenceReference } from "@/domain/verification/evidence-reference";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type {
  AnalyzerFieldKey,
  AnalyzerFieldObservation,
} from "@/pipeline/analyzer/analyzer.types";

/**
 * The minimal rule taxonomy for the wine pre-check slice. Kept deliberately
 * narrow — no broad semantic, legal-reasoning, or fuzzy categories.
 */
export const RULE_CATEGORIES = [
  "canonical-text-comparison",
  "syntax-validation",
  "numeric-agreement",
  "external-evidence-dependent",
] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

/** Immutable run/version references a rule may cite, without the full manifest. */
export interface RunVersionReference {
  runId: string;
  ruleProfileId: string;
  ruleProfileVersion: string;
  derivativeSha256: string;
}

/**
 * Deterministic inputs for one rule evaluation. A rule sees declared facts and
 * analyzer observations relevant to it, the per-check evidence status, and
 * traceability references — never UI state, disposition, logs, or aggregate
 * status.
 */
export interface RuleContext {
  declaredFacts: Partial<Record<string, DeclaredFact>>;
  observations: Partial<Record<AnalyzerFieldKey, AnalyzerFieldObservation>>;
  evidenceStatus: EvidenceStatus;
  run: RunVersionReference;
  evidenceReferences: EvidenceReference[];
}

/**
 * A single, pure, versioned rule. Every rule declares the profile it belongs to,
 * its governing authority, and the evidence fields it requires. `evaluate` is
 * deterministic and side-effect free, and returns a finding that copies the
 * rule/profile/authority versions.
 */
export interface VerificationRule {
  id: string;
  version: string;
  profileId: string;
  profileVersion: string;
  category: RuleCategory;
  authority: AuthorityVersion;
  requiredEvidenceFields: readonly AnalyzerFieldKey[];
  evaluate(context: RuleContext): VerificationFinding;
}
