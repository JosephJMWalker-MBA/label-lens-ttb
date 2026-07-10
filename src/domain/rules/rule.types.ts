import type { VerificationFinding } from "@/domain/verification/finding.types";

/**
 * The compliance categories from the stakeholder-derived taxonomy. The category
 * signals how strict a rule is and drives deterministic evaluation ordering.
 */
export type RuleCategory =
  "semantic-equivalence" | "exact-statutory" | "layout-formatting" | "image-quality";

/** The evidence a rule evaluates: one expected value against one observation. */
export interface RuleContext {
  field: string;
  /** Expected application value, or null when the field has none. */
  expected: string | null;
  /** Observed value from the label, or null when nothing was recovered. */
  observed: string | null;
}

/**
 * A single, pure, versioned compliance rule.
 *
 * `evaluate` must be deterministic and side-effect free, and every finding it
 * returns must carry a human-readable reason. Rules never perform OCR, I/O, or
 * policy discovery — they apply fixed, approved logic to provided evidence.
 */
export interface VerificationRule {
  id: string;
  version: string;
  title: string;
  category: RuleCategory;
  evaluate(context: RuleContext): VerificationFinding;
}
