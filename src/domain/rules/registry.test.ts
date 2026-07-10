import { describe, expect, it } from "vitest";

import type { RuleCategory, VerificationRule } from "./rule.types";
import { createRuleRegistry } from "./registry";

function stubRule(id: string, category: RuleCategory): VerificationRule {
  return {
    id,
    version: "1.0.0",
    title: id,
    category,
    evaluate: () => ({
      field: id,
      status: "PASS",
      expected: null,
      observed: null,
      ruleId: id,
      reason: "stub",
    }),
  };
}

describe("createRuleRegistry", () => {
  it("orders rules by category severity, then id", () => {
    const registry = createRuleRegistry([
      stubRule("brand", "semantic-equivalence"),
      stubRule("warning", "exact-statutory"),
      stubRule("alcohol", "semantic-equivalence"),
    ]);
    expect(registry.all().map((r) => r.id)).toEqual(["warning", "alcohol", "brand"]);
  });

  it("returns the same ordering on repeated calls", () => {
    const registry = createRuleRegistry([
      stubRule("b", "semantic-equivalence"),
      stubRule("a", "semantic-equivalence"),
    ]);
    expect(registry.all().map((r) => r.id)).toEqual(registry.all().map((r) => r.id));
  });

  it("looks up a rule by id", () => {
    const registry = createRuleRegistry([stubRule("warning", "exact-statutory")]);
    expect(registry.get("warning")?.category).toBe("exact-statutory");
    expect(registry.get("missing")).toBeUndefined();
  });

  it("rejects duplicate rule ids", () => {
    expect(() =>
      createRuleRegistry([
        stubRule("warning", "exact-statutory"),
        stubRule("warning", "exact-statutory"),
      ]),
    ).toThrow(/duplicate rule id/i);
  });

  it("does not expose internal mutation via all()", () => {
    const registry = createRuleRegistry([stubRule("a", "semantic-equivalence")]);
    registry.all().pop();
    expect(registry.all()).toHaveLength(1);
  });
});
