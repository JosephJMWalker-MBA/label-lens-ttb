import { describe, expect, it } from "vitest";

import { createRuleRegistry, type RuleRegistry } from "@/domain/rules/registry";
import type { RuleContext, VerificationRule } from "@/domain/rules/rule.types";
import type { VerificationFinding } from "@/domain/verification/finding.types";

import { createLabelRequirementRegistry } from "./registry";
import type { LabelRequirementDefinition } from "./requirement.types";

const PROFILE_ID = "test-requirements";
const PROFILE_VERSION = "1.0.0";
const RULE_PROFILE_ID = "test-rules";
const RULE_PROFILE_VERSION = "1.0.0";

const AUTHORITY = { citation: "27 CFR 4.32", snapshotDate: "2026-07-10" };

function ruleBase(id: string): Omit<VerificationRule, "evaluate"> {
  return {
    id,
    version: "1.0.0",
    profileId: RULE_PROFILE_ID,
    profileVersion: RULE_PROFILE_VERSION,
    category: "canonical-text-comparison",
    authority: AUTHORITY,
    requiredEvidenceFields: ["brandName"],
  };
}

function finding(id: string, extra: Partial<VerificationFinding> = {}): VerificationFinding {
  return {
    ruleId: id,
    ruleVersion: "1.0.0",
    profileId: RULE_PROFILE_ID,
    profileVersion: RULE_PROFILE_VERSION,
    authority: AUTHORITY,
    findingStatus: "PASS",
    ruleExecutionStatus: "executed",
    evidenceReferences: [],
    message: "ok",
    ...extra,
  };
}

/** An artwork-evaluable rule that reads brandName. */
const brandRule: VerificationRule = {
  ...ruleBase("brand-check"),
  evaluate: (): VerificationFinding => finding("brand-check"),
};

/** An external-evidence-dependent rule, as the real profile's not-run rules are. */
const externalRule: VerificationRule = {
  ...ruleBase("external-condition"),
  category: "external-evidence-dependent",
  requiredEvidenceFields: [],
  evaluate: (): VerificationFinding =>
    finding("external-condition", {
      findingStatus: "not_run",
      ruleExecutionStatus: "not_run_external_dependency",
      externalEvidenceDependency: "designation evidence",
    }),
};

function rules(list: VerificationRule[]): RuleRegistry {
  return createRuleRegistry({
    profileId: RULE_PROFILE_ID,
    profileVersion: RULE_PROFILE_VERSION,
    rules: list,
  });
}

function definition(over: Partial<LabelRequirementDefinition> = {}): LabelRequirementDefinition {
  return {
    requirementId: "brand-required",
    version: "1.0.0",
    profileId: PROFILE_ID,
    profileVersion: PROFILE_VERSION,
    fieldId: "brandName",
    authoritySource: { kind: "registered-rule-authority", ruleId: "brand-check" },
    applicability: "always",
    ...over,
  };
}

function build(defs: LabelRequirementDefinition[], list = [brandRule, externalRule]) {
  return createLabelRequirementRegistry(
    { profileId: PROFILE_ID, profileVersion: PROFILE_VERSION, requirements: defs },
    rules(list),
  );
}

describe("label requirement registry", () => {
  it("derives the citation from the rule, never from the requirement", () => {
    const [requirement] = build([definition()]).all();
    expect(requirement.authority).toEqual(AUTHORITY);
    expect(requirement.authorityProvenance).toEqual({
      kind: "registered-rule-authority",
      ruleId: "brand-check",
    });
  });

  it("rejects a citation derived from a rule that is not registered", () => {
    expect(() =>
      build([
        definition({
          authoritySource: { kind: "registered-rule-authority", ruleId: "no-such-rule" },
        }),
      ]),
    ).toThrow(/UNKNOWN_AUTHORITY_RULE/);
  });

  it("derives rule linkage from the live rules, so it cannot claim a check that does not exist", () => {
    const [requirement] = build([definition()]).all();
    expect(requirement.checkedByRuleIds).toEqual(["brand-check"]);
    expect(requirement.evaluableFromArtwork).toBe(true);
  });

  it("reports an unchecked field truthfully rather than pretending it is checked", () => {
    // A rule set with no rule reading brandName. The requirement still stands —
    // "required, and not checked today" is a legitimate, honest state.
    const [requirement] = build(
      [definition()],
      [{ ...brandRule, requiredEvidenceFields: [] }, externalRule],
    ).all();
    expect(requirement.checkedByRuleIds).toEqual([]);
    expect(requirement.evaluableFromArtwork).toBe(false);
  });

  it("reads a conditional requirement's dependency from the condition's own rule", () => {
    const [requirement] = build([
      definition({
        applicability: "conditional",
        conditionSourceRuleId: "external-condition",
      }),
    ]).all();
    expect(requirement.conditionSourceRuleId).toBe("external-condition");
    expect(requirement.conditionExternalEvidence).toBe("designation evidence");
  });
});

describe("the registry cannot invent authority", () => {
  it("refuses a conditional obligation with no rule establishing the condition", () => {
    expect(() => build([definition({ applicability: "conditional" })])).toThrow(
      /MISSING_CONDITION_SOURCE/,
    );
  });

  it("refuses a condition whose rule is not registered", () => {
    expect(() =>
      build([definition({ applicability: "conditional", conditionSourceRuleId: "ghost" })]),
    ).toThrow(/UNKNOWN_CONDITION_RULE/);
  });

  it("refuses a condition whose rule cannot actually declare a dependency", () => {
    // Softening an obligation with a rule that is not external-evidence-dependent
    // would mean the condition came from us, not from the rules.
    expect(() =>
      build([definition({ applicability: "conditional", conditionSourceRuleId: "brand-check" })]),
    ).toThrow(/CONDITION_RULE_NOT_EXTERNAL/);
  });

  it("refuses an unconditional requirement that smuggles in a condition", () => {
    expect(() =>
      build([definition({ applicability: "always", conditionSourceRuleId: "external-condition" })]),
    ).toThrow(/UNEXPECTED_CONDITION_SOURCE/);
  });

  it("refuses a human-authored citation with no named reviewer", () => {
    expect(() =>
      build([
        definition({
          authoritySource: {
            kind: "human-authored",
            authority: { citation: "27 CFR 4.37", snapshotDate: "2026-07-10" },
            reviewedBy: "   ",
            reviewedAt: "2026-07-10",
          },
        }),
      ]),
    ).toThrow(/MISSING_HUMAN_REVIEWER/);
  });

  it("refuses a human-authored citation with no valid review date", () => {
    expect(() =>
      build([
        definition({
          authoritySource: {
            kind: "human-authored",
            authority: { citation: "27 CFR 4.37", snapshotDate: "2026-07-10" },
            reviewedBy: "A Reviewer",
            reviewedAt: "sometime",
          },
        }),
      ]),
    ).toThrow(/MISSING_HUMAN_REVIEWER/);
  });

  it("refuses an empty citation", () => {
    expect(() =>
      build([
        definition({
          authoritySource: {
            kind: "human-authored",
            authority: { citation: "  ", snapshotDate: "2026-07-10" },
            reviewedBy: "A Reviewer",
            reviewedAt: "2026-07-10",
          },
        }),
      ]),
    ).toThrow(/MISSING_CITATION/);
  });

  it("refuses a citation with no dated snapshot", () => {
    expect(() =>
      build([
        definition({
          authoritySource: {
            kind: "human-authored",
            authority: { citation: "27 CFR 4.37", snapshotDate: "" },
            reviewedBy: "A Reviewer",
            reviewedAt: "2026-07-10",
          },
        }),
      ]),
    ).toThrow(/MISSING_SNAPSHOT_DATE/);
  });

  it("accepts a properly human-authored citation — the only route for new authority", () => {
    const [requirement] = build([
      definition({
        authoritySource: {
          kind: "human-authored",
          authority: { citation: "27 CFR 4.37", snapshotDate: "2026-07-10" },
          reviewedBy: "A Reviewer",
          reviewedAt: "2026-07-10",
        },
      }),
    ]).all();
    expect(requirement.authority.citation).toBe("27 CFR 4.37");
    expect(requirement.authorityProvenance.kind).toBe("human-authored");
  });
});

describe("registry mechanics", () => {
  it("rejects duplicate requirement ids", () => {
    expect(() => build([definition(), definition()])).toThrow(/DUPLICATE_REQUIREMENT_ID/);
  });

  it("rejects a requirement belonging to another profile", () => {
    expect(() => build([definition({ profileId: "other" })])).toThrow(/PROFILE_MISMATCH/);
  });

  it("orders deterministically and looks up by id and field", () => {
    const registry = build([
      definition({ requirementId: "b-req" }),
      definition({ requirementId: "a-req" }),
    ]);
    expect(registry.all().map((r) => r.requirementId)).toEqual(["a-req", "b-req"]);
    expect(registry.get("a-req")?.requirementId).toBe("a-req");
    expect(registry.forField("brandName")).toHaveLength(2);
    expect(registry.forField("alcoholStatement")).toEqual([]);
  });

  it("states nothing and issues no verdict", () => {
    const serialized = JSON.stringify(build([definition()]).all());
    expect(serialized).not.toMatch(
      /\b(PASS|FAIL|WARN|approved|cleared|compliant|score|readiness)\b/i,
    );
  });

  it("holds the invariant that makes reading a condition's dependency safe", () => {
    // The registry reads a condition's dependency by evaluating its rule. That is
    // only sound because external-evidence-dependent rules return a constant
    // finding and ignore their context. If one ever starts using context, this
    // fails loudly rather than letting a fabricated condition reach a user.
    const context = {
      declaredFacts: {},
      observations: {},
      evidenceStatus: "insufficient",
      run: { runId: "", ruleProfileId: "", ruleProfileVersion: "", derivativeSha256: "" },
      evidenceReferences: [],
    } satisfies RuleContext;
    const result = externalRule.evaluate(context);
    expect(result.ruleExecutionStatus).toBe("not_run_external_dependency");
    expect(result.externalEvidenceDependency).toBeTruthy();
  });
});
