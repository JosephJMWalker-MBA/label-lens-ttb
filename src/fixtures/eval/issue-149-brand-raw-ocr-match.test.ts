import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { classifyRawOcrMatch, isPresent, normToken } from "./issue-149-brand-raw-ocr-match";
import { normalizedIncludes } from "./metrics";

/**
 * The frozen rule, and the specific way it differs from the inherited
 * `brandOcrContainsAcceptable` diagnostic that produced `truthInRawOcr`.
 */
describe("frozen raw-OCR match rule", () => {
  it("EXACT_RAW_MATCH when contiguous tokens reproduce the brand", () => {
    const words = ["ESTATE", "Luigi", "&", "Giovanni", "RESERVE", "2019"];
    const match = classifyRawOcrMatch(words, "Luigi & Giovanni");
    // "&" normalizes away, so the truth tokens are ["luigi","giovanni"] and the
    // OCR run ["luigi","","giovanni"] collapses to the same contiguous pair.
    expect(match.tier).toBe("EXACT_RAW_MATCH");
    expect(match.matchedTokens).toEqual(["luigi", "giovanni"]);
  });

  it("NORMALIZED_RAW_MATCH when OCR splits or merges the brand's own words", () => {
    expect(classifyRawOcrMatch(["LUIGIGIOVANNI", "WINE"], "Luigi Giovanni").tier).toBe(
      "NORMALIZED_RAW_MATCH",
    );
    expect(classifyRawOcrMatch(["LUI", "GIGIO", "VANNI"], "Luigi Giovanni").tier).toBe(
      "NORMALIZED_RAW_MATCH",
    );
  });

  it("NOT_PRESENT when the glyphs are simply absent", () => {
    const match = classifyRawOcrMatch(["CHATEAU", "BONNEAU", "2018"], "Luigi Giovanni");
    expect(match.tier).toBe("NOT_PRESENT");
    expect(isPresent(match.tier)).toBe(false);
  });

  describe("the divergence from the inherited rule", () => {
    // The inherited diagnostic is:
    //   normalizedIncludes(allWords.join(" "), acceptable)
    // and normalizeKey strips the joining spaces, so the haystack is a
    // separator-free concatenation and the test is String.includes.
    const inherited = (words: string[], acceptable: string): boolean =>
      normalizedIncludes(words.join(" "), [acceptable]);

    it("fires the inherited rule but NOT the frozen rule when the brand is glued inside other text", () => {
      // No OCR token is the brand; the letters only line up once separators are
      // stripped across unrelated neighbours.
      const words = ["IMPORTEDBYLUIGI", "GIOVANNIIMPORTS", "LLC"];
      expect(inherited(words, "Luigi Giovanni")).toBe(true);
      const match = classifyRawOcrMatch(words, "Luigi Giovanni");
      expect(match.tier).toBe("PARTIAL_INSUFFICIENT");
      expect(isPresent(match.tier)).toBe(false);
    });

    it("fires the inherited rule across a boundary between two unrelated words", () => {
      // "…CARLO" + "SANTINI…" concatenates to contain "carlosantini".
      const words = ["MONTECARLO", "SANTINIVINEYARD"];
      expect(inherited(words, "Carlo Santini")).toBe(true);
      expect(isPresent(classifyRawOcrMatch(words, "Carlo Santini").tier)).toBe(false);
    });

    it("agrees with the inherited rule when the brand really is a clean token run", () => {
      const words = ["RESERVE", "CARLO", "SANTINI", "2019"];
      expect(inherited(words, "Carlo Santini")).toBe(true);
      expect(isPresent(classifyRawOcrMatch(words, "Carlo Santini").tier)).toBe(true);
    });

    it("never counts present where the inherited rule says absent", () => {
      // The frozen rule is strictly more conservative: it is a refinement of the
      // inherited substring test, so it cannot manufacture presence.
      const cases: Array<[string[], string]> = [
        [["CHATEAU", "BONNEAU"], "Luigi Giovanni"],
        [["ALC", "13.8%", "BY", "VOL"], "Carlo Santini"],
        [["LUIGI"], "Luigi Giovanni"],
      ];
      for (const [words, acceptable] of cases) {
        if (!inherited(words, acceptable)) {
          expect(isPresent(classifyRawOcrMatch(words, acceptable).tier)).toBe(false);
        }
      }
    });
  });

  it("normalizes per token, not across the joined pass", () => {
    expect(normToken("Château")).toBe("chateau");
    expect(normToken("&")).toBe("");
  });
});

describe("contamination boundary", () => {
  // Comments are stripped: the guarantee is about executable code. The module's
  // own docstring names the downstream fields precisely to say it ignores them.
  const source = readFileSync("src/fixtures/eval/issue-149-brand-raw-ocr-match.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("the rule module never references any downstream Brand field", () => {
    // The classifier must decide raw-OCR presence from OCR word text alone.
    // Candidate survival, filtering, ranking and selection are later stages,
    // and the inherited field is what this experiment exists to re-derive.
    const forbidden = [
      "truthInRawOcr",
      "brandOcrContainsAcceptable",
      "rankedCandidates",
      "truthReachedCandidate",
      "truthAmongKeptCandidates",
      "truthFilterReasons",
      "truthRank",
      "truthInTop1",
      "truthInTop3",
      "selectedValue",
      "selectedNormalizedMatch",
      "filterReason",
      "lineTexts",
      "kept",
    ];
    for (const name of forbidden) {
      expect(source.includes(name), `rule module references downstream field ${name}`).toBe(false);
    }
  });

  it("accepts only OCR word text and an acceptable string", () => {
    // A structural guarantee: there is no parameter through which a downstream
    // field could reach the classifier.
    expect(classifyRawOcrMatch.length).toBe(2);
    expect(() => classifyRawOcrMatch(["ANY", "WORDS"], "Some Brand")).not.toThrow();
  });
});
