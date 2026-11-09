import { describe, expect, it } from "vitest";
import { detectDegenerateRepetition, detectDegenerateTranscript } from "./repetition-detector";

describe("detectDegenerateRepetition", () => {
  describe("legitimate label text (must NOT be rejected)", () => {
    it("accepts valid, non-repeating brand names", () => {
      expect(detectDegenerateRepetition("La FATTORIA")).toEqual({ isDegenerate: false });
      expect(detectDegenerateRepetition("Podere don Cataldo")).toEqual({ isDegenerate: false });
      expect(detectDegenerateRepetition("THE GOLDEN Girls")).toEqual({ isDegenerate: false });
      expect(detectDegenerateRepetition("Dry Cellar Reserve Cabernet Sauvignon")).toEqual({
        isDegenerate: false,
      });
      expect(detectDegenerateRepetition("Château Cheval Blanc")).toEqual({ isDegenerate: false });
    });

    it("accepts valid doubled words or short repetitions in brand names", () => {
      expect(detectDegenerateRepetition("Bella Bella Wine")).toEqual({ isDegenerate: false });
      expect(detectDegenerateRepetition("Chant Chant")).toEqual({ isDegenerate: false });
      expect(detectDegenerateRepetition("Bulleit Rye Bulleit")).toEqual({ isDegenerate: false });
      expect(detectDegenerateRepetition("Three Three Three Wine Co.")).toEqual({
        isDegenerate: false,
      });
    });

    it("accepts legitimate standard government warnings", () => {
      const warningText =
        "GOVERNMENT WARNING: (1) ACCORDING TO THE SURGEON GENERAL, WOMEN SHOULD NOT DRINK ALCOHOLIC BEVERAGES DURING PREGNANCY BECAUSE OF THE RISK OF BIRTH DEFECTS. (2) CONSUMPTION OF ALCOHOLIC BEVERAGES IMPAIRS YOUR ABILITY TO DRIVE A CAR OR OPERATE MACHINERY, AND MAY CAUSE HEALTH PROBLEMS.";
      expect(detectDegenerateRepetition(warningText)).toEqual({ isDegenerate: false });
    });

    it("accepts legitimate repeated appellations and geographic designations", () => {
      const appellationText =
        "Napa Valley Red Wine, Grown in Napa Valley, Bottled by Napa Cellars, Napa California";
      expect(detectDegenerateRepetition(appellationText)).toEqual({ isDegenerate: false });
    });

    it("accepts legitimate technical statements with repeated units", () => {
      const statement = "750 mL Net Contents 750 mL Alc. 14.5% by Vol. 14.5%";
      expect(detectDegenerateRepetition(statement)).toEqual({ isDegenerate: false });
    });
  });

  describe("degenerate repetition artifacts (fail-closed rejection)", () => {
    it("rejects synthetic degenerate unigram repetition loops (>= 4 consecutive repeats)", () => {
      const syntheticUnigramLoop = "BrandName BRAND BRAND BRAND BRAND BRAND";
      const result = detectDegenerateRepetition(syntheticUnigramLoop);
      expect(result.isDegenerate).toBe(true);
      expect(result.reason).toBe("CONSECUTIVE_UNIGRAM");
      expect(result.repeatedToken).toBe("brand");
    });

    it("rejects synthetic degenerate bigram repetition loops (>= 3 consecutive bigrams)", () => {
      const syntheticBigramLoop = "Red Wine Red Wine Red Wine";
      const result = detectDegenerateRepetition(syntheticBigramLoop);
      expect(result.isDegenerate).toBe(true);
      expect(result.reason).toBe("CONSECUTIVE_NGRAM");
      expect(result.repeatedToken).toBe("red wine");
    });

    it("rejects synthetic degenerate trigram repetition loops (>= 3 consecutive trigrams)", () => {
      const syntheticTrigramLoop =
        "Estate Bottled Vintage Estate Bottled Vintage Estate Bottled Vintage";
      const result = detectDegenerateRepetition(syntheticTrigramLoop);
      expect(result.isDegenerate).toBe(true);
      expect(result.reason).toBe("CONSECUTIVE_NGRAM");
      expect(result.repeatedToken).toBe("estate bottled vintage");
    });

    it("rejects synthetic low-diversity runaway generation", () => {
      const syntheticRunaway =
        "Chateau Chateau Margaux Chateau Chateau Margaux Chateau Chateau Margaux Chateau";
      const result = detectDegenerateRepetition(syntheticRunaway);
      expect(result.isDegenerate).toBe(true);
    });

    it("identifies the untruncated approved-wine-035 artifact pattern", () => {
      // Prior to 400-char line truncation, model outputs a runaway repeating sequence
      const testPattern =
        "Hubert Lamy EYEBROW EYEBROW EYEBROW EYEBROW EYEBROW EYEBROW EYEBROW EYEBROW EYEBROW EYEBROW EYEBROW EYEBROW";
      const result = detectDegenerateRepetition(testPattern);
      expect(result.isDegenerate).toBe(true);
      expect(result.reason).toBe("CONSECUTIVE_UNIGRAM");
      expect(result.repeatedToken).toBe("eyebrow");
    });
  });

  describe("detectDegenerateTranscript (multiline & whole-transcript checks)", () => {
    it("accepts legitimate multiline label transcripts", () => {
      const validLines = [
        "Napa Valley Red Wine",
        "Vintage 2021",
        "Estate Bottled by Acme Cellars",
        "Oakville, California",
        "Alcohol 14.5% by volume",
        "Contains Sulfites",
        "750 mL",
      ];
      expect(detectDegenerateTranscript(validLines)).toEqual({ isDegenerate: false });
    });

    it("rejects multiline identical phrase loops (e.g. approved-wine-006 pattern)", () => {
      const repeatedLine = "Contains Sulfites - Canned by Dark Horse";
      const degenerateLines = Array(60).fill(repeatedLine);
      const result = detectDegenerateTranscript(degenerateLines);
      expect(result.isDegenerate).toBe(true);
      expect(result.reason).toBe("CONSECUTIVE_NGRAM");
    });

    it("rejects transcripts with low multiline diversity (runaway generation across lines)", () => {
      const lowDiversityLines = [
        "Chateau Margaux",
        "Grand Vin",
        "Chateau Margaux",
        "Chateau Margaux",
        "Chateau Margaux",
        "Grand Vin",
        "Chateau Margaux",
        "Chateau Margaux",
      ];
      const result = detectDegenerateTranscript(lowDiversityLines);
      expect(result.isDegenerate).toBe(true);
    });

    it("rejects transcript if any single line is degenerate", () => {
      const lines = [
        "Vino Rosso",
        "Hubert Lamy EYEBROW EYEBROW EYEBROW EYEBROW EYEBROW",
        "Product of France",
      ];
      const result = detectDegenerateTranscript(lines);
      expect(result.isDegenerate).toBe(true);
      expect(result.reason).toBe("CONSECUTIVE_UNIGRAM");
    });
  });
});
