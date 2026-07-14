import type { RuleRegistry } from "@/domain/rules/registry";
import type { VerificationRule } from "@/domain/rules/rule.types";
import type { AuthorityVersion } from "@/domain/run/version-manifest.types";

import type {
  LabelRequirementDefinition,
  LabelRequirementFieldId,
  RequirementAuthoritySource,
  ResolvedLabelRequirement,
} from "./requirement.types";

/**
 * The label-requirements registry.
 *
 * It states what a cited authority requires of a label field. It evaluates
 * nothing, produces no finding, and issues no verdict, score, or readiness
 * figure.
 *
 * Construction is the enforcement point. A requirement that cannot be fully
 * grounded is rejected rather than degraded: a citation that resolves to no
 * reviewed authority, a conditional obligation with no rule establishing the
 * condition, or a human-authored citation with no named reviewer will all throw
 * here rather than reach a user as a soft claim.
 *
 * Ordering is deterministic (field id, then requirement id). No dynamic
 * discovery, no runtime plugin loading — the same discipline as
 * `src/domain/rules/registry.ts`.
 */

export interface LabelRequirementProfile {
  profileId: string;
  profileVersion: string;
  /**
   * The rule profile these requirements are resolved against, declared by the
   * profile rather than inferred from whatever registry is injected.
   *
   * Without this, a requirements profile could be resolved against a rule
   * registry for a different beverage category and derive citations from the
   * wrong body of rules — a correct-looking citation from the wrong domain.
   */
  ruleProfileId: string;
  ruleProfileVersion: string;
  requirements: readonly LabelRequirementDefinition[];
}

export interface LabelRequirementRegistry {
  profileId: string;
  profileVersion: string;
  /** All requirements in deterministic order. */
  all(): ResolvedLabelRequirement[];
  get(requirementId: string): ResolvedLabelRequirement | undefined;
  /** Requirements concerning one field. Empty when the field has no cited authority. */
  forField(fieldId: LabelRequirementFieldId): ResolvedLabelRequirement[];
}

function fail(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

/** ISO YYYY-MM-DD. Mirrors the AuthorityVersion contract. */
function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Resolve a requirement's citation.
 *
 * This is the only place a citation can enter the registry, and neither branch
 * lets one be invented: it is either read from a rule the repository already
 * reviewed, or it carries a named human reviewer who authored it.
 *
 * Existence of the source rule is not enough. A rule that exists but concerns a
 * different field would yield a citation that is perfectly valid — and about the
 * wrong thing. That mistake is invisible on inspection precisely because the
 * citation looks well-formed, so the rule must also be *relevant* to the field
 * it authorizes.
 */
function resolveAuthority(
  requirementId: string,
  fieldId: LabelRequirementFieldId,
  source: RequirementAuthoritySource,
  ruleById: Map<string, VerificationRule>,
): AuthorityVersion {
  if (source.kind === "registered-rule-authority") {
    const rule = ruleById.get(source.ruleId);
    if (!rule) {
      fail(
        "UNKNOWN_AUTHORITY_RULE",
        `requirement ${requirementId} derives its citation from rule ${source.ruleId}, which is not in the rule registry.`,
      );
    }
    // Relevance: the rule must declare the very field this requirement is about.
    // A rule's `requiredEvidenceFields` is its own statement of which fields it
    // concerns, so this is read from the rule rather than asserted here.
    //
    // Note this also excludes external-evidence-dependent rules as authority
    // sources: they declare no evidence fields, so they declare no domain, and
    // nothing about them could be checked for relevance. Deriving authority from
    // an undeclared domain is exactly the hole this guard closes.
    if (!rule.requiredEvidenceFields.includes(fieldId)) {
      fail(
        "AUTHORITY_RULE_FIELD_MISMATCH",
        `requirement ${requirementId} is about "${fieldId}", but derives its citation from rule ${rule.id}, which declares no evidence for that field (it declares: ${
          rule.requiredEvidenceFields.length === 0 ? "none" : rule.requiredEvidenceFields.join(", ")
        }). The citation would be valid for the wrong field.`,
      );
    }
    // Copied out of the rule at construction, so it can never drift from the
    // authority the rule itself cites and was reviewed against.
    return rule.authority;
  }

  if (source.reviewedBy.trim() === "") {
    fail(
      "MISSING_HUMAN_REVIEWER",
      `requirement ${requirementId} is human-authored but names no reviewer. A citation must be attributable to a person.`,
    );
  }
  if (!isIsoDate(source.reviewedAt)) {
    fail(
      "MISSING_HUMAN_REVIEWER",
      `requirement ${requirementId} is human-authored but has no valid review date (expected YYYY-MM-DD).`,
    );
  }
  return source.authority;
}

export function createLabelRequirementRegistry(
  profile: LabelRequirementProfile,
  ruleRegistry: RuleRegistry,
): LabelRequirementRegistry {
  // The requirements profile declares which rule profile it is resolved against.
  // Resolving it against another category's rules would derive citations from
  // the wrong body of rules — right shape, wrong domain.
  if (
    ruleRegistry.profileId !== profile.ruleProfileId ||
    ruleRegistry.profileVersion !== profile.ruleProfileVersion
  ) {
    fail(
      "RULE_PROFILE_MISMATCH",
      `requirements profile ${profile.profileId}@${profile.profileVersion} expects rule profile ${profile.ruleProfileId}@${profile.ruleProfileVersion}, but was given ${ruleRegistry.profileId}@${ruleRegistry.profileVersion}.`,
    );
  }

  const rules = ruleRegistry.all();
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]));

  const byId = new Map<string, ResolvedLabelRequirement>();
  const idVersions = new Set<string>();

  for (const definition of profile.requirements) {
    const { requirementId } = definition;

    if (
      definition.profileId !== profile.profileId ||
      definition.profileVersion !== profile.profileVersion
    ) {
      fail(
        "PROFILE_MISMATCH",
        `requirement ${requirementId} does not belong to profile ${profile.profileId}@${profile.profileVersion}.`,
      );
    }
    if (byId.has(requirementId)) {
      fail("DUPLICATE_REQUIREMENT_ID", requirementId);
    }
    const idVersion = `${requirementId}@${definition.version}`;
    if (idVersions.has(idVersion)) {
      fail("DUPLICATE_REQUIREMENT_ID_VERSION", idVersion);
    }

    const authority = resolveAuthority(
      requirementId,
      definition.fieldId,
      definition.authoritySource,
      ruleById,
    );

    // A requirement with no citation, or a citation with no dated snapshot, is
    // an unsupported claim. It never reaches a user.
    if (authority.citation.trim() === "") {
      fail("MISSING_CITATION", `requirement ${requirementId} has an empty citation.`);
    }
    if (!isIsoDate(authority.snapshotDate)) {
      fail(
        "MISSING_SNAPSHOT_DATE",
        `requirement ${requirementId} has no valid authority snapshot date (expected YYYY-MM-DD).`,
      );
    }

    // A conditional obligation may only be softened by a registered rule that
    // establishes the condition — never by this registry's own reasoning.
    let conditionExternalEvidence: string | null = null;
    let conditionSourceRuleId: string | null = null;

    if (definition.applicability === "conditional") {
      if (!definition.conditionSourceRuleId) {
        fail(
          "MISSING_CONDITION_SOURCE",
          `requirement ${requirementId} is conditional but names no rule establishing the condition.`,
        );
      }
      const conditionRule = ruleById.get(definition.conditionSourceRuleId);
      if (!conditionRule) {
        fail(
          "UNKNOWN_CONDITION_RULE",
          `requirement ${requirementId} names condition rule ${definition.conditionSourceRuleId}, which is not in the rule registry.`,
        );
      }
      if (conditionRule.category !== "external-evidence-dependent") {
        fail(
          "CONDITION_RULE_NOT_EXTERNAL",
          `requirement ${requirementId} names condition rule ${conditionRule.id}, which is not external-evidence-dependent; the condition it declares could not be read.`,
        );
      }
      // Relevance, for the condition. An external-evidence-dependent rule
      // declares no evidence fields, so it declares no field domain and the
      // field check above cannot apply to it. Its authority can be checked
      // instead: an obligation imposed by one citation may only be softened by a
      // condition arising under that same citation. Otherwise a §X obligation
      // could be relaxed by an unrelated §Y rule — the same wrong-domain mistake
      // as the authority hole, one layer down.
      //
      // This is deliberately strict. If a real condition is ever found to arise
      // under a different section, relaxing it is a human decision, made with a
      // citation — not something this registry may infer.
      if (
        conditionRule.authority.citation !== authority.citation ||
        conditionRule.authority.snapshotDate !== authority.snapshotDate
      ) {
        fail(
          "CONDITION_AUTHORITY_MISMATCH",
          `requirement ${requirementId} is imposed by "${authority.citation}" (snapshot ${authority.snapshotDate}), but its condition rule ${conditionRule.id} arises under "${conditionRule.authority.citation}" (snapshot ${conditionRule.authority.snapshotDate}). An obligation may not be softened by a condition from an unrelated authority.`,
        );
      }
      conditionSourceRuleId = conditionRule.id;
      // Read the dependency from the rule itself rather than restating it, so
      // the wording can never drift from the rule that owns it.
      conditionExternalEvidence = readExternalDependency(conditionRule);
    } else if (definition.conditionSourceRuleId) {
      fail(
        "UNEXPECTED_CONDITION_SOURCE",
        `requirement ${requirementId} always applies but names a condition rule.`,
      );
    }

    // Derived from the live rules: which of them actually read this field. A
    // requirement can therefore never claim a check that is not registered, and
    // an empty list is a truthful "required, and not checked today".
    const checking = rules.filter((rule) =>
      rule.requiredEvidenceFields.includes(definition.fieldId),
    );
    const checkedByRuleIds = checking.map((rule) => rule.id);
    const evaluableFromArtwork = checking.some(
      (rule) => rule.category !== "external-evidence-dependent",
    );

    byId.set(requirementId, {
      requirementId,
      version: definition.version,
      profileId: definition.profileId,
      profileVersion: definition.profileVersion,
      fieldId: definition.fieldId,
      authority,
      authorityProvenance: definition.authoritySource,
      applicability: definition.applicability,
      conditionExternalEvidence,
      conditionSourceRuleId,
      checkedByRuleIds,
      evaluableFromArtwork,
    });
    idVersions.add(idVersion);
  }

  const ordered = [...byId.values()].sort(
    (a, b) => a.fieldId.localeCompare(b.fieldId) || a.requirementId.localeCompare(b.requirementId),
  );

  return {
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    all: () => [...ordered],
    get: (requirementId) => byId.get(requirementId),
    forField: (fieldId) => ordered.filter((requirement) => requirement.fieldId === fieldId),
  };
}

/**
 * Read the external evidence an external-evidence-dependent rule declares it
 * requires, from the rule itself.
 *
 * Such rules return a constant finding and ignore their context entirely, which
 * is what makes this safe: it reads a declaration, it evaluates nothing. The
 * context below carries no run identity — the empty `runId` and
 * `derivativeSha256` are deliberate, so it can never be mistaken for a real run
 * — and it is never persisted, exported, or hashed. `registry.test.ts` asserts
 * the invariant that makes this sound.
 */
function readExternalDependency(rule: VerificationRule): string | null {
  const finding = rule.evaluate({
    declaredFacts: {},
    observations: {},
    evidenceStatus: "insufficient",
    run: {
      runId: "",
      ruleProfileId: rule.profileId,
      ruleProfileVersion: rule.profileVersion,
      derivativeSha256: "",
    },
    evidenceReferences: [],
  });
  return finding.externalEvidenceDependency ?? null;
}
