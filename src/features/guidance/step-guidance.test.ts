import { describe, expect, it } from "vitest";

import { GOVERNMENT_WARNING_AUTHORITY } from "@/domain/rules/government-warning.rule";
import { RULE_SUMMARY } from "@/features/learn/rule-guide";
import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

import { officialSource, regulationSourcesForCitation } from "./official-sources";
import record from "./official-sources.verification.json";
import { GUIDANCE_RULE_IDS, allGuidance, guidanceFor, sourcesFor } from "./step-guidance";

type QuoteRecord = { text: string; found: boolean };

function recordedQuotes(sourceId: string): QuoteRecord[] {
  const entry = record.sources.find((candidate) => candidate.sourceId === sourceId) as
    { quotes?: QuoteRecord[] } | undefined;
  return entry?.quotes ?? [];
}

const APPROVAL_CLAIM =
  /\b(approved|is compliant|compliance (?:verified|confirmed)|certified|guarantee[ds]?|meets (?:all|every) requirement)/i;

describe("applicant step guidance", () => {
  it("abstains for any step without recorded guidance", () => {
    expect(guidanceFor("category:netContents")).toBeNull();
    expect(guidanceFor("")).toBeNull();
    expect(guidanceFor("toString")).toBeNull();
    expect(guidanceFor("__proto__")).toBeNull();
  });

  it("shows only text that was verified verbatim on the cited official page", () => {
    for (const guidance of allGuidance()) {
      for (const quote of [...guidance.fromTheSource, ...guidance.sourceQuestions]) {
        const source = officialSource(quote.sourceId);
        expect(source?.publisher, quote.text).toBe("TTB");
        const recorded = recordedQuotes(quote.sourceId).find((item) => item.text === quote.text);
        expect(recorded, `${guidance.contextId}: "${quote.text}"`).toEqual({
          text: quote.text,
          found: true,
        });
      }
    }
  });

  it("cites exactly the sections the underlying rules cite, so pointers cannot drift", () => {
    for (const guidance of allGuidance()) {
      const expected = GUIDANCE_RULE_IDS[guidance.contextId].flatMap((ruleId) => {
        const citation =
          winePrecheckRegistry.get(ruleId)?.authority.citation ??
          (ruleId.startsWith("government-warning") ? GOVERNMENT_WARNING_AUTHORITY.citation : null);
        expect(citation, ruleId).not.toBeNull();
        return regulationSourcesForCitation(citation!).map((source) => source.sourceId);
      });
      expect([...guidance.regulationSourceIds].sort(), guidance.contextId).toEqual(
        [...new Set(expected)].sort(),
      );
    }
    expect(guidanceFor("category:brandName")?.regulationSourceIds).toEqual([
      "ecfr-27-4.32",
      "ecfr-27-4.33",
    ]);
  });

  it("describes Label Lens's own checks with the rule guide's summaries, not new wording", () => {
    expect(guidanceFor("category:brandName")?.labelLensChecks).toEqual([
      RULE_SUMMARY["brand-name-canonical-comparison"],
    ]);
    expect(guidanceFor("category:alcoholStatement")?.labelLensChecks).toEqual([
      RULE_SUMMARY["wine-alcohol-syntax"],
      RULE_SUMMARY["wine-alcohol-declared-comparison"],
    ]);
    expect(guidanceFor("category:alcoholStatement")?.labelLensDoesNotCheck).toEqual(
      expect.arrayContaining([
        RULE_SUMMARY["wine-alcohol-actual-content-tolerance"],
        RULE_SUMMARY["wine-alcohol-omission-eligibility"],
      ]),
    );
  });

  it("names its limits and never claims approval or compliance", () => {
    for (const guidance of allGuidance()) {
      expect(guidance.labelLensDoesNotCheck.length, guidance.contextId).toBeGreaterThan(0);
      const ownText = [
        guidance.title,
        ...guidance.labelLensChecks,
        ...guidance.labelLensDoesNotCheck,
        ...guidance.haveReady,
      ].join(" ");
      expect(ownText, guidance.contextId).not.toMatch(APPROVAL_CLAIM);
    }
    const submit = guidanceFor("step:submit")!;
    expect(submit.labelLensDoesNotCheck.join(" ")).toMatch(/does not file anything with TTB/);
    expect(submit.labelLensDoesNotCheck.join(" ")).toMatch(/not a TTB approval/);
  });

  it("points other label items to TTB's pages instead of implying they are optional", () => {
    const submit = guidanceFor("step:submit")!;
    expect(submit.furtherReadingSourceIds).toEqual([
      "ttb-wine-net-contents",
      "ttb-wine-name-and-address",
      "ttb-labeling",
    ]);
    expect(submit.labelLensDoesNotCheck.join(" ")).toMatch(/still need your attention/);
  });

  it("resolves every source a step shows, and cannot be changed at run time", () => {
    for (const guidance of allGuidance()) {
      expect(sourcesFor(guidance).length, guidance.contextId).toBeGreaterThan(0);
      expect(Object.isFrozen(guidance)).toBe(true);
      expect(Object.isFrozen(guidance.fromTheSource)).toBe(true);
      expect(() => {
        (guidance.labelLensChecks as string[]).push("Approved.");
      }).toThrow();
    }
  });
});
