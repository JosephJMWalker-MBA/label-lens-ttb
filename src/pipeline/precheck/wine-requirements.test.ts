// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LABEL_REQUIREMENT_FIELD_IDS } from "@/domain/requirements/requirement.types";

import { winePrecheckRegistry } from "./wine-precheck.profile";
import { wineRequirementsRegistry } from "./wine-requirements.profile";

const PROFILE_SOURCE = readFileSync(
  join(process.cwd(), "src/pipeline/precheck/wine-requirements.profile.ts"),
  "utf8",
);

/** Strip block and line comments so explanatory prose is not mistaken for code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * The seed policy, enforced (#100).
 *
 * Only requirements already backed by reviewed repository authority may be
 * registered. These tests exist so that a future change cannot quietly add an
 * uncited requirement, a placeholder, or a field the system has no authority
 * for — the failure mode this registry was created to prevent.
 */
describe("wine label-requirements seed policy", () => {
  const requirements = wineRequirementsRegistry.all();

  it("registers exactly the two requirements with reviewed authority behind them", () => {
    expect(requirements.map((r) => r.requirementId)).toEqual([
      "wine-alcohol-statement-required",
      "wine-brand-name-required",
    ]);
  });

  it("registers no requirement for a field with no cited authority", () => {
    // The uncited fields. Their absence is the point: the system has no cited
    // requirement for them, which is a different claim from "not required".
    const uncited = [
      "netContents",
      "classType",
      "nameAndAddress",
      "countryOfOrigin",
      "distributionMarket",
      "governmentWarning",
    ];
    const registeredFields = new Set<string>(requirements.map((r) => r.fieldId));
    for (const field of uncited) {
      expect(registeredFields.has(field)).toBe(false);
      // And the field vocabulary itself must not have grown to accommodate one.
      expect(LABEL_REQUIREMENT_FIELD_IDS as readonly string[]).not.toContain(field);
    }
  });

  it("every registered requirement carries a citation and a snapshot date", () => {
    expect(requirements.length).toBeGreaterThan(0);
    for (const requirement of requirements) {
      expect(requirement.authority.citation.trim()).not.toBe("");
      expect(requirement.authority.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("derives every seeded citation from a rule the repository already reviewed", () => {
    // No citation string is authored in the wine profile. Each is read from a
    // registered rule's own authority, so none can be fabricated or drift.
    const ruleIds = new Set(winePrecheckRegistry.all().map((rule) => rule.id));
    for (const requirement of requirements) {
      expect(requirement.authorityProvenance.kind).toBe("registered-rule-authority");
      if (requirement.authorityProvenance.kind === "registered-rule-authority") {
        expect(ruleIds.has(requirement.authorityProvenance.ruleId)).toBe(true);
      }
    }
  });

  it("derives each citation from a rule that actually concerns that field", () => {
    // Existence of the source rule is not enough: a rule about another field
    // would yield a citation that is valid, and about the wrong thing.
    for (const requirement of requirements) {
      if (requirement.authorityProvenance.kind !== "registered-rule-authority") continue;
      const rule = winePrecheckRegistry.get(requirement.authorityProvenance.ruleId);
      expect(rule).toBeDefined();
      expect(rule!.requiredEvidenceFields).toContain(requirement.fieldId);
    }
  });

  it("softens an obligation only by a condition under the same authority", () => {
    for (const requirement of requirements) {
      if (!requirement.conditionSourceRuleId) continue;
      const conditionRule = winePrecheckRegistry.get(requirement.conditionSourceRuleId);
      expect(conditionRule).toBeDefined();
      expect(conditionRule!.authority).toEqual(requirement.authority);
    }
  });

  it("matches each requirement's citation to the rule it was derived from", () => {
    for (const requirement of requirements) {
      if (requirement.authorityProvenance.kind !== "registered-rule-authority") continue;
      const rule = winePrecheckRegistry.get(requirement.authorityProvenance.ruleId);
      expect(rule).toBeDefined();
      expect(requirement.authority).toEqual(rule!.authority);
    }
  });

  it("links each requirement only to rules that actually check its field", () => {
    for (const requirement of requirements) {
      for (const ruleId of requirement.checkedByRuleIds) {
        const rule = winePrecheckRegistry.get(ruleId);
        expect(rule, `requirement claims a check by unregistered rule ${ruleId}`).toBeDefined();
        expect(rule!.requiredEvidenceFields).toContain(requirement.fieldId);
      }
    }
  });

  it("states the brand-name requirement as one no registered rule conditions", () => {
    const brand = wineRequirementsRegistry.get("wine-brand-name-required");
    expect(brand?.fieldId).toBe("brandName");
    expect(brand?.applicability).toBe("always");
    expect(brand?.conditionSourceRuleId).toBeNull();
    expect(brand?.conditionExternalEvidence).toBeNull();
    expect(brand?.checkedByRuleIds).toContain("brand-name-canonical-comparison");
    expect(brand?.evaluableFromArtwork).toBe(true);
  });

  it("states the alcohol requirement as conditional, on the condition the rules declare", () => {
    const alcohol = wineRequirementsRegistry.get("wine-alcohol-statement-required");
    expect(alcohol?.fieldId).toBe("alcoholStatement");
    // The conditionality is not our inference: the profile registers a rule for
    // omission eligibility, and the dependency is read from that rule.
    expect(alcohol?.applicability).toBe("conditional");
    expect(alcohol?.conditionSourceRuleId).toBe("wine-alcohol-omission-eligibility");
    expect(alcohol?.conditionExternalEvidence).toBe("table/light-wine designation evidence");
    expect(alcohol?.checkedByRuleIds).toEqual(
      expect.arrayContaining(["wine-alcohol-syntax", "wine-alcohol-declared-comparison"]),
    );
    expect(alcohol?.evaluableFromArtwork).toBe(true);
  });

  it("authors no citation string anywhere in the wine requirements profile", () => {
    // A CFR citation appearing literally in the code would mean a requirement
    // asserted an authority instead of deriving one. That is the invented-
    // compliance failure mode, and it must be impossible to merge. Comments may
    // explain which citation a rule carries; the code may not restate one.
    expect(stripComments(PROFILE_SOURCE)).not.toMatch(/\d+\s*CFR/i);
  });

  it("resurrects no field from the dead aspirational label contract", () => {
    expect(PROFILE_SOURCE).not.toMatch(/domain\/label/);
  });
});
