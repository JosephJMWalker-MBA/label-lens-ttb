import { describe, expect, it } from "vitest";

import { createRuleRegistry, type RuleProfile } from "./registry";
import type { RuleCategory, VerificationRule } from "./rule.types";

const AUTHORITY = { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" };

function stubRule(
  id: string,
  category: RuleCategory,
  opts: { version?: string; profileVersion?: string } = {},
): VerificationRule {
  const version = opts.version ?? "1.0.0";
  const profileVersion = opts.profileVersion ?? "1.0.0";
  return {
    id,
    version,
    profileId: "wine-precheck",
    profileVersion,
    category,
    authority: AUTHORITY,
    requiredEvidenceFields: ["alcoholStatement"],
    evaluate: () => ({
      ruleId: id,
      ruleVersion: version,
      profileId: "wine-precheck",
      profileVersion,
      authority: AUTHORITY,
      findingStatus: "PASS",
      ruleExecutionStatus: "executed",
      evidenceReferences: [],
      message: "stub",
    }),
  };
}

function profile(rules: VerificationRule[]): RuleProfile {
  return { profileId: "wine-precheck", profileVersion: "1.0.0", rules };
}

describe("createRuleRegistry", () => {
  it("orders rules by category, then id, deterministically", () => {
    const registry = createRuleRegistry(
      profile([
        stubRule("brand", "canonical-text-comparison"),
        stubRule("alcohol-numeric", "numeric-agreement"),
        stubRule("alcohol-syntax", "syntax-validation"),
      ]),
    );
    expect(registry.all().map((r) => r.id)).toEqual(["alcohol-syntax", "brand", "alcohol-numeric"]);
    expect(registry.all().map((r) => r.id)).toEqual(registry.all().map((r) => r.id));
  });

  it("derives an ordered rule id/version manifest matching evaluation order", () => {
    const registry = createRuleRegistry(
      profile([
        stubRule("brand", "canonical-text-comparison", { version: "2.1.0" }),
        stubRule("alcohol-syntax", "syntax-validation", { version: "1.0.0" }),
      ]),
    );
    expect(registry.ruleManifest()).toEqual([
      { ruleId: "alcohol-syntax", version: "1.0.0" },
      { ruleId: "brand", version: "2.1.0" },
    ]);
  });

  it("carries profile identity and version", () => {
    const registry = createRuleRegistry(profile([stubRule("brand", "canonical-text-comparison")]));
    expect(registry.profileId).toBe("wine-precheck");
    expect(registry.profileVersion).toBe("1.0.0");
  });

  it("rejects a duplicate rule id/version", () => {
    expect(() =>
      createRuleRegistry(
        profile([
          stubRule("brand", "canonical-text-comparison"),
          stubRule("brand", "canonical-text-comparison"),
        ]),
      ),
    ).toThrow(/duplicate rule id\/version/i);
  });

  it("rejects the same rule id at different versions", () => {
    expect(() =>
      createRuleRegistry(
        profile([
          stubRule("brand", "canonical-text-comparison", { version: "1.0.0" }),
          stubRule("brand", "canonical-text-comparison", { version: "2.0.0" }),
        ]),
      ),
    ).toThrow(/duplicate rule id/i);
  });

  it("rejects a rule that does not belong to the profile", () => {
    const foreign = stubRule("brand", "canonical-text-comparison", { profileVersion: "9.9.9" });
    expect(() => createRuleRegistry(profile([foreign]))).toThrow(/does not belong to profile/i);
  });

  it("does not expose internal mutation via all()", () => {
    const registry = createRuleRegistry(profile([stubRule("brand", "canonical-text-comparison")]));
    registry.all().pop();
    expect(registry.all()).toHaveLength(1);
  });
});
