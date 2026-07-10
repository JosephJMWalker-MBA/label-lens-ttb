import type { RuleVersionRef } from "@/domain/run/version-manifest.types";

import type { RuleCategory, VerificationRule } from "./rule.types";

/**
 * A read-only, deterministically ordered rule profile.
 *
 * Ordering is stable (category, then id). Duplicate rule ids and duplicate
 * id+version pairs are rejected, and every rule must belong to the profile.
 * No dynamic plugin loading or runtime discovery.
 */
export interface RuleProfile {
  profileId: string;
  profileVersion: string;
  rules: readonly VerificationRule[];
}

export interface RuleRegistry {
  profileId: string;
  profileVersion: string;
  /** All rules in deterministic evaluation order. */
  all(): VerificationRule[];
  get(id: string): VerificationRule | undefined;
  /** Ordered id/version manifest, matching evaluation order. */
  ruleManifest(): RuleVersionRef[];
}

const CATEGORY_ORDER: Record<RuleCategory, number> = {
  "syntax-validation": 0,
  "canonical-text-comparison": 1,
  "numeric-agreement": 2,
  "external-evidence-dependent": 3,
};

export function createRuleRegistry(profile: RuleProfile): RuleRegistry {
  const byId = new Map<string, VerificationRule>();
  const idVersions = new Set<string>();

  for (const rule of profile.rules) {
    if (rule.profileId !== profile.profileId || rule.profileVersion !== profile.profileVersion) {
      throw new Error(`Rule ${rule.id} does not belong to profile ${profile.profileId}.`);
    }
    const idVersion = `${rule.id}@${rule.version}`;
    if (idVersions.has(idVersion)) {
      throw new Error(`Duplicate rule id/version: ${idVersion}`);
    }
    if (byId.has(rule.id)) {
      throw new Error(`Duplicate rule id: ${rule.id}`);
    }
    byId.set(rule.id, rule);
    idVersions.add(idVersion);
  }

  const ordered = [...profile.rules].sort(
    (a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.id.localeCompare(b.id),
  );

  return {
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    all: () => [...ordered],
    get: (id) => byId.get(id),
    ruleManifest: () => ordered.map((rule) => ({ ruleId: rule.id, version: rule.version })),
  };
}
