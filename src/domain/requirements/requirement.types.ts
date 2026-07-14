import type { AuthorityVersion } from "@/domain/run/version-manifest.types";

/**
 * The label-requirements contract.
 *
 * A requirement is a statement that a cited authority imposes an obligation on a
 * label field. It is **not** a rule: it does not evaluate anything, it produces
 * no finding, and it renders no verdict. The layering it completes is:
 *
 *   UI presents · Registry states · Rules evaluate · Evidence supports ·
 *   Humans author authority
 *
 * The central invariant is that **no layer may invent authority**. A citation
 * cannot be hand-typed into this registry: it either derives from a rule whose
 * authority the repository already asserts and has reviewed, or it is authored
 * by a named human reviewer on a named date. There is no third way to obtain
 * one, and `RequirementAuthoritySource` is what makes that a type-level fact
 * rather than a convention.
 *
 * This registry deliberately states nothing about net contents, class/type,
 * name and address, country of origin, or distribution market. No reviewed
 * citation for those exists in this repository, so no requirement for them
 * exists here. Their absence is a truthful statement about what is known — not
 * an omission to be filled with a placeholder.
 */

/**
 * The fields a requirement may concern.
 *
 * Deliberately exactly the fields the system can currently reason about. This is
 * NOT an aspirational field list — the repository already carries one of those
 * in `src/domain/label/label.types.ts`, which is dead code that no module
 * imports, and which must not be resurrected here.
 *
 * Adding an id is a governed change: it may only accompany a human-authored
 * citation for that field. An empty field id would be a claim with no authority
 * behind it.
 */
export const LABEL_REQUIREMENT_FIELD_IDS = ["brandName", "alcoholStatement"] as const;
export type LabelRequirementFieldId = (typeof LABEL_REQUIREMENT_FIELD_IDS)[number];

/**
 * Where a requirement's citation comes from. This is the anti-invention gate.
 *
 * - `registered-rule-authority` — the citation is *derived* from a rule already
 *   registered in the live rule registry. The rule's `AuthorityVersion` was
 *   reviewed when the rule was reviewed, so nothing new is asserted. The
 *   registry resolves the citation at construction; it is never copied by hand,
 *   so it cannot drift from the rule and cannot be fabricated.
 *
 * - `human-authored` — a person read the source, wrote the citation and the
 *   snapshot date, and put their name to it. This is the only path by which a
 *   *new* authority may enter the system, and it is deliberately the only one
 *   that requires a named reviewer.
 *
 * A model may not author authority. There is no variant for it.
 */
export type RequirementAuthoritySource =
  | { kind: "registered-rule-authority"; ruleId: string }
  | {
      kind: "human-authored";
      authority: AuthorityVersion;
      /** The person accountable for this citation. Never a tool or a model. */
      reviewedBy: string;
      /** ISO YYYY-MM-DD. When the citation was read and accepted. */
      reviewedAt: string;
    };

/**
 * Whether the obligation always applies, or applies subject to a condition.
 *
 * Read these precisely — they are statements about *this repository's* rule set,
 * not claims to have read the whole of the cited part:
 *
 * - `always` — **no registered rule establishes a condition** that relaxes this
 *   obligation. It does not assert that no such condition exists anywhere in the
 *   regulation; it asserts that the system knows of none. Surfaces must present
 *   it that way.
 *
 * - `conditional` — a registered rule establishes a condition, and it must be
 *   named in `conditionSourceRuleId`. The registry rejects a conditional
 *   requirement whose condition has no rule behind it, so an obligation can
 *   never be softened by this registry's own reasoning.
 */
export type RequirementApplicability = "always" | "conditional";

/** One authored requirement, before the registry resolves and derives from it. */
export interface LabelRequirementDefinition {
  requirementId: string;
  version: string;
  profileId: string;
  profileVersion: string;
  fieldId: LabelRequirementFieldId;
  authoritySource: RequirementAuthoritySource;
  applicability: RequirementApplicability;
  /**
   * Required when `applicability` is `conditional`: the registered rule that
   * establishes the condition. The condition's own external-evidence dependency
   * is read from that rule — never restated here.
   */
  conditionSourceRuleId?: string;
}

/**
 * A requirement after the registry has resolved its citation and derived its
 * links against the live rule registry. Every derived field is computed, never
 * authored, so the registry cannot claim a check or a dependency that does not
 * exist in the rules.
 */
export interface ResolvedLabelRequirement {
  requirementId: string;
  version: string;
  profileId: string;
  profileVersion: string;
  fieldId: LabelRequirementFieldId;

  /** Resolved from the authority source. Always present; enforced at construction. */
  authority: AuthorityVersion;
  /** How the citation entered the system, for provenance display. */
  authorityProvenance: RequirementAuthoritySource;

  applicability: RequirementApplicability;
  /**
   * For a conditional requirement: the evidence the condition depends on, read
   * from the condition's rule. Null when the requirement always applies.
   */
  conditionExternalEvidence: string | null;
  /** The rule that establishes the condition, if any. */
  conditionSourceRuleId: string | null;

  /**
   * Rules in the live registry that actually check this field today, derived by
   * matching each rule's own `requiredEvidenceFields`. Empty is a legitimate
   * and truthful answer: a field may be required and not yet checked.
   */
  checkedByRuleIds: string[];
  /**
   * Whether any registered rule can evaluate this field from artwork. Derived
   * from the rules, not asserted here.
   */
  evaluableFromArtwork: boolean;
}

export type RequirementRegistryErrorCode =
  | "DUPLICATE_REQUIREMENT_ID"
  | "DUPLICATE_REQUIREMENT_ID_VERSION"
  | "PROFILE_MISMATCH"
  | "UNKNOWN_AUTHORITY_RULE"
  | "MISSING_CITATION"
  | "MISSING_SNAPSHOT_DATE"
  | "MISSING_HUMAN_REVIEWER"
  | "MISSING_CONDITION_SOURCE"
  | "UNKNOWN_CONDITION_RULE"
  | "CONDITION_RULE_NOT_EXTERNAL"
  | "UNEXPECTED_CONDITION_SOURCE";
