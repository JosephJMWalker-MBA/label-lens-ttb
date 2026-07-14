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
 */
function resolveAuthority(
  requirementId: string,
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

    const authority = resolveAuthority(requirementId, definition.authoritySource, ruleById);

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
