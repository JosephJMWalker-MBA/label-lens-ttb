import { describe, expect, it } from "vitest";

import {
  alcoholPercentsInTranscript,
  brandPresentInTranscript,
  brandValueMatches,
  summarizeBoundedBrand,
  summarizeWholeLabel,
  type WholeLabelCaseResult,
} from "./vision-reader-eval";

describe("brandPresentInTranscript", () => {
  it("matches whole words across line breaks, case, punctuation, and accents", () => {
    expect(
      brandPresentInTranscript(["Luigi &", "GIOVANNI", "Primitivo"], ["Luigi & Giovanni"]),
    ).toBe(true);
    expect(brandPresentInTranscript(["CHÂTEAU DE LAVILLE"], ["Chateau de Laville"])).toBe(true);
  });

  it("does not count a brand glued inside a longer token (the #223 failure mode)", () => {
    expect(brandPresentInTranscript(["www.avagardner.org"], ["Ava Gardner"])).toBe(false);
    expect(brandPresentInTranscript(["importedbymyinvenvyamuninnivini"], ["Amuninni"])).toBe(false);
  });
});

describe("alcoholPercentsInTranscript", () => {
  it("finds statements in either order, including split across two lines", () => {
    expect(alcoholPercentsInTranscript(["750 ML 13.5% ALC/VOL"])).toEqual([1350]);
    expect(alcoholPercentsInTranscript(["ALC. 14% BY VOL."])).toEqual([1400]);
    expect(alcoholPercentsInTranscript(["ALCOHOL 12.5%", "BY VOLUME"])).toEqual([1250]);
    expect(alcoholPercentsInTranscript(["12% ABV"])).toEqual([1200]);
  });

  it("ignores percentages that are not alcohol statements", () => {
    expect(alcoholPercentsInTranscript(["100% Cabernet Sauvignon", "Contains sulfites"])).toEqual(
      [],
    );
  });
});

describe("brandValueMatches", () => {
  it("uses the package workflow's equivalence", () => {
    expect(brandValueMatches("STONE'S THROW", ["Stone's Throw"])).toBe(true);
    expect(brandValueMatches("CELLARS", ["M Cellars"])).toBe(false);
    expect(brandValueMatches(null, ["M Cellars"])).toBe(false);
  });
});

describe("summaries", () => {
  it("reports present-case recall, absent-case false positives, and latency", () => {
    const base: WholeLabelCaseResult = {
      caseId: "a",
      ok: true,
      errorCode: null,
      latencyMs: 1000,
      legibility: "clear",
      lineCount: 5,
      brand: { presence: "present", observed: true },
      alcohol: {
        presence: "present",
        expectedBasisPoints: [1350],
        foundBasisPoints: [1350],
        correct: true,
        falsePositive: null,
      },
    };
    const summary = summarizeWholeLabel([
      base,
      { ...base, caseId: "b", latencyMs: 3000, brand: { presence: "present", observed: false } },
      {
        ...base,
        caseId: "c",
        alcohol: { ...base.alcohol, presence: "absent", correct: null, falsePositive: true },
      },
      { ...base, caseId: "d", ok: false, errorCode: "TIMEOUT", latencyMs: null },
    ]);
    expect(summary).toMatchObject({
      cases: 4,
      readerFailures: 1,
      brandObserved: "2/3 (66.7%)",
      alcoholCorrectPercentObserved: "2/2 (100.0%)",
      alcoholFalsePositivesOnAbsent: "1/1 (100.0%)",
      latencyMedianMs: 1000,
      latencyP95Ms: 3000,
    });
  });

  it("separates reliable-and-correct from reliable-but-wrong", () => {
    const summary = summarizeBoundedBrand([
      {
        caseId: "a",
        occurrence: "x",
        ok: true,
        errorCode: null,
        latencyMs: 500,
        observedValue: "M CELLARS",
        evidenceState: "OBSERVED",
        reliable: true,
        matchesTruth: true,
      },
      {
        caseId: "b",
        occurrence: "x",
        ok: true,
        errorCode: null,
        latencyMs: 700,
        observedValue: "CELLARS",
        evidenceState: "OBSERVED",
        reliable: true,
        matchesTruth: false,
      },
    ]);
    expect(summary.reliableAndCorrect).toBe("1/2 (50.0%)");
    expect(summary.reliableButWrong).toBe("1/2 (50.0%)");
  });
});
