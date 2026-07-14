import { describe, expect, it } from "vitest";

import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

import { buildRuleGuide, RULE_SUMMARY } from "./rule-guide";

/**
 * The Requirements Explorer must be a faithful projection of the committed rule
 * registry. These tests exist so it can never drift from the rules that actually
 * run, and so its honesty claims stay true if the profile changes.
 */
describe("rule guide", () => {
  const guide = buildRuleGuide();
  const rules = winePrecheckRegistry.all();

  it("projects every registered rule, in registry order, with no additions", () => {
    expect(guide.entries.map((e) => e.ruleId)).toEqual(rules.map((r) => r.id));
  });

  it("reads rule identity, version, and authority from the rules themselves", () => {
    for (const rule of rules) {
      const entry = guide.entries.find((e) => e.ruleId === rule.id);
      expect(entry).toBeDefined();
      expect(entry!.ruleVersion).toBe(rule.version);
      expect(entry!.category).toBe(rule.category);
      expect(entry!.authorityCitation).toBe(rule.authority.citation);
      expect(entry!.authoritySnapshotDate).toBe(rule.authority.snapshotDate);
      expect(entry!.requiredEvidenceFields).toEqual(rule.requiredEvidenceFields);
    }
  });

  it("carries the profile identity so the page cannot misstate its scope", () => {
    expect(guide.profileId).toBe(winePrecheckRegistry.profileId);
    expect(guide.profileVersion).toBe(winePrecheckRegistry.profileVersion);
  });

  it("classifies evaluability from the rule category, not from prose", () => {
    for (const entry of guide.entries) {
      const expected =
        entry.category === "external-evidence-dependent"
          ? "requires-external-evidence"
          : "from-artwork";
      expect(entry.evaluability).toBe(expected);
    }
    expect(guide.fromArtworkCount + guide.requiresExternalEvidenceCount).toBe(guide.entries.length);
  });

  it("reads each external dependency from the rule, and only for external checks", () => {
    for (const entry of guide.entries) {
      if (entry.evaluability === "requires-external-evidence") {
        expect(entry.externalEvidenceDependency).toBeTruthy();
      } else {
        expect(entry.externalEvidenceDependency).toBeNull();
      }
    }
  });

  it("holds the invariant that makes reading those dependencies safe", () => {
    // The guide reads an external rule's declared dependency by evaluating it.
    // That is only sound because such rules return a constant finding and ignore
    // their context. If a rule ever starts using context, this fails loudly
    // rather than letting the explorer publish a fabricated reading.
    const external = rules.filter((r) => r.category === "external-evidence-dependent");
    expect(external.length).toBeGreaterThan(0);
    for (const rule of external) {
      const finding = rule.evaluate({
        declaredFacts: {},
        observations: {},
        evidenceStatus: "insufficient",
        run: { runId: "", ruleProfileId: "", ruleProfileVersion: "", derivativeSha256: "" },
        evidenceReferences: [],
      });
      expect(finding.ruleExecutionStatus).toBe("not_run_external_dependency");
      expect(finding.findingStatus).toBe("not_run");
      expect(finding.externalEvidenceDependency).toBeTruthy();
      expect(finding.evidenceReferences).toEqual([]);
    }
  });

  it("never invents a summary for a rule the registry does not have", () => {
    const registeredIds = new Set(rules.map((r) => r.id));
    for (const id of Object.keys(RULE_SUMMARY)) {
      expect(registeredIds.has(id)).toBe(true);
    }
  });

  it("produces no aggregate score, percentage, or overall status", () => {
    const serialized = JSON.stringify(guide);
    expect(serialized).not.toMatch(/\bscore\b|\bpercent\b|\boverall\b|\breadiness\b/i);
    // Counts are facts; grades are not. Only counts are exposed.
    expect(typeof guide.fromArtworkCount).toBe("number");
    expect(typeof guide.requiresExternalEvidenceCount).toBe("number");
  });
});
