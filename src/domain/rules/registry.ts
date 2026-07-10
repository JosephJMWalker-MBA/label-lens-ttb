import type { RuleCategory, VerificationRule } from "./rule.types";

/**
 * A read-only, deterministically ordered collection of versioned rules.
 *
 * Ordering is stable across runs (by category severity, then rule id) so
 * reports and evaluations are reproducible. Duplicate ids are rejected at
 * construction to keep rule provenance unambiguous.
 */
export interface RuleRegistry {
  /** All rules in deterministic evaluation order. */
  all(): VerificationRule[];
  get(id: string): VerificationRule | undefined;
}

// Strictest categories first, so mandatory statutory checks are evaluated early.
const CATEGORY_ORDER: Record<RuleCategory, number> = {
  "exact-statutory": 0,
  "image-quality": 1,
  "semantic-equivalence": 2,
  "layout-formatting": 3,
};

export function createRuleRegistry(rules: readonly VerificationRule[]): RuleRegistry {
  const byId = new Map<string, VerificationRule>();
  for (const rule of rules) {
    if (byId.has(rule.id)) {
      throw new Error(`Duplicate rule id: ${rule.id}`);
    }
    byId.set(rule.id, rule);
  }

  const ordered = [...rules].sort(
    (a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.id.localeCompare(b.id),
  );

  return {
    all: () => [...ordered],
    get: (id) => byId.get(id),
  };
}
