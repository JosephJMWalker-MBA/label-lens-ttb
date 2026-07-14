import {
  createLabelRequirementRegistry,
  type LabelRequirementRegistry,
} from "@/domain/requirements/registry";
import type { LabelRequirementDefinition } from "@/domain/requirements/requirement.types";

import {
  WINE_PRECHECK_PROFILE_ID,
  WINE_PRECHECK_PROFILE_VERSION,
  winePrecheckRegistry,
} from "./wine-precheck.profile";

/**
 * The wine label-requirements profile.
 *
 * It contains **exactly two requirements**, because exactly two fields in this
 * repository have a reviewed authority behind them. Both derive their citation
 * from a rule that already cites it, so nothing new is asserted here and no
 * citation is hand-typed.
 *
 * What is deliberately absent, and why:
 *
 *   Net contents · class/type · name and address · country of origin ·
 *   distribution market
 *
 * No reviewed citation for any of these exists in this repository. They are not
 * registered, not stubbed, and not placeholdered. Their absence is a truthful
 * statement of what the system knows — **"the system has no cited requirement
 * for this field"** — and that is a different claim from "this field is not
 * required". Surfaces must not collapse the two.
 *
 * To add one: a human reads the source, authors the citation and snapshot date,
 * puts their name to it via a `human-authored` authority source, and adds the
 * field id to `LABEL_REQUIREMENT_FIELD_IDS`. That is the only route in.
 */
export const WINE_REQUIREMENTS_PROFILE_ID = "wine-label-requirements";
export const WINE_REQUIREMENTS_PROFILE_VERSION = "1.0.0";

/**
 * Seeded requirements.
 *
 * Both use `registered-rule-authority`: the citation is read at construction
 * from the named rule's own reviewed `AuthorityVersion`. No citation string
 * appears in this file, which is the point — it cannot be fabricated or drift.
 */
const WINE_REQUIREMENTS: readonly LabelRequirementDefinition[] = [
  {
    // Brand name. Citation derived from the registered brand rule, which the
    // repository already asserts against 27 CFR 4.32 / 4.33.
    requirementId: "wine-brand-name-required",
    version: "1.0.0",
    profileId: WINE_REQUIREMENTS_PROFILE_ID,
    profileVersion: WINE_REQUIREMENTS_PROFILE_VERSION,
    fieldId: "brandName",
    authoritySource: {
      kind: "registered-rule-authority",
      ruleId: "brand-name-canonical-comparison",
    },
    // No registered rule establishes a condition relaxing this obligation.
    // That is a statement about the rule set, not about the whole regulation.
    applicability: "always",
  },
  {
    // Alcohol statement. Citation derived from the registered wine-alcohol rule,
    // which the repository already asserts against 27 CFR 4.36.
    //
    // This obligation is conditional, and that is not our inference: the profile
    // registers `wine-alcohol-omission-eligibility`, an external-evidence-
    // dependent rule that exists precisely because the statement may be omitted
    // subject to a designation the artwork cannot establish. The registry reads
    // that dependency from the rule itself.
    requirementId: "wine-alcohol-statement-required",
    version: "1.0.0",
    profileId: WINE_REQUIREMENTS_PROFILE_ID,
    profileVersion: WINE_REQUIREMENTS_PROFILE_VERSION,
    fieldId: "alcoholStatement",
    authoritySource: {
      kind: "registered-rule-authority",
      ruleId: "wine-alcohol-syntax",
    },
    applicability: "conditional",
    conditionSourceRuleId: "wine-alcohol-omission-eligibility",
  },
] as const;

/**
 * The composed registry. Requirements are resolved against the live wine rule
 * registry, so every citation, condition, and rule link is grounded in rules
 * that are actually registered.
 */
export const wineRequirementsRegistry: LabelRequirementRegistry = createLabelRequirementRegistry(
  {
    profileId: WINE_REQUIREMENTS_PROFILE_ID,
    profileVersion: WINE_REQUIREMENTS_PROFILE_VERSION,
    // Declared, not inferred: these requirements are only meaningful against the
    // wine rule profile. Resolving them against another category's rules is
    // rejected rather than silently deriving citations from the wrong rules.
    ruleProfileId: WINE_PRECHECK_PROFILE_ID,
    ruleProfileVersion: WINE_PRECHECK_PROFILE_VERSION,
    requirements: WINE_REQUIREMENTS,
  },
  winePrecheckRegistry,
);

/** The rule profile these requirements are resolved against. */
export const WINE_REQUIREMENTS_RULE_PROFILE = {
  id: WINE_PRECHECK_PROFILE_ID,
  version: WINE_PRECHECK_PROFILE_VERSION,
} as const;
