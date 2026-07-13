import { describe, expect, it } from "vitest";

import type { EvalAlcoholTruth, EvalBrandTruth } from "./eval-manifest.types";
import {
  aggregate,
  alcoholParsedAccurate,
  brandExactMatch,
  brandInTopK,
  brandNormalizedMatch,
  classifyAlcohol,
  classifyBrand,
  parseObservedPercent,
  percentile,
  type AlcoholDiagnostics,
  type BrandDiagnostics,
  type FieldCaseScore,
  type ObservedField,
} from "./metrics";

const obs = (over: Partial<ObservedField> = {}): ObservedField => ({
  state: "OBSERVED",
  value: null,
  confidence: 0.9,
  alternates: [],
  ...over,
});

describe("brand matching (punctuation/diacritic tolerant)", () => {
  it("matches exact case/whitespace folds", () => {
    expect(brandExactMatch("LUIGI & GIOVANNI", ["Luigi & Giovanni"])).toBe(true);
    expect(brandExactMatch("Luigi   &  Giovanni", ["Luigi & Giovanni"])).toBe(true);
  });

  it("normalized match tolerates accents, punctuation, and a dropped ampersand", () => {
    expect(brandNormalizedMatch("CHATEAU BONNEAU", ["Château Bonneau"])).toBe(true);
    expect(brandNormalizedMatch("chateau-bonneau", ["Château Bonneau"])).toBe(true);
    expect(brandNormalizedMatch("Luigi Giovanni", ["Luigi & Giovanni"])).toBe(true);
    expect(brandNormalizedMatch("Alfredos", ["Alfredo's"])).toBe(true);
  });

  it("does not match a different brand", () => {
    expect(brandExactMatch("Pir", ["Luigi & Giovanni"])).toBe(false);
    expect(brandNormalizedMatch("Pir", ["Luigi & Giovanni"])).toBe(false);
  });

  it("top-k scans selected value then alternates in order, with normalization", () => {
    const o = obs({
      value: "Pir",
      alternates: [
        { value: "VANNI", confidence: 0.9 },
        { value: "chateau  bonneau", confidence: 0.8 },
      ],
    });
    expect(brandInTopK(o, ["Château Bonneau"], 3)).toBe(true);
    expect(brandInTopK(o, ["Château Bonneau"], 2)).toBe(false); // beyond top-2
  });
});

describe("alcohol parsing", () => {
  it("extracts the leading percent (dot or comma)", () => {
    expect(parseObservedPercent("12.5% ALC./VOL.")).toBe(12.5);
    expect(parseObservedPercent("13,5% vol")).toBe(13.5);
    expect(parseObservedPercent(null)).toBeNull();
  });

  it("accuracy tolerates float noise", () => {
    expect(alcoholParsedAccurate("12.5% ALC./VOL.", [12.5])).toBe(true);
    expect(alcoholParsedAccurate("14% ALC", [12.5])).toBe(false);
  });
});

describe("brand classification", () => {
  const determinate: EvalBrandTruth = {
    present: true,
    acceptable: ["Luigi & Giovanni"],
    knownAmbiguous: false,
  };
  const ambiguous: EvalBrandTruth = {
    present: true,
    acceptable: ["Amuninni", "Fabio Ferracane"],
    knownAmbiguous: true,
  };
  const absent: EvalBrandTruth = {
    present: false,
    acceptable: [],
    knownAmbiguous: false,
    absenceReason: "No distinct brand appears on the label.",
  };
  const brandDiag = (over: Partial<BrandDiagnostics> = {}) => ({
    ocrContainsAcceptable: false,
    lineContainsAcceptable: false,
    candidateContainsAcceptable: false,
    primaryOcrContainsAcceptable: false,
    recoveryOcrContainsAcceptable: false,
    primaryLineContainsAcceptable: false,
    recoveryLineContainsAcceptable: false,
    primaryCandidateContainsAcceptable: false,
    recoveryCandidateContainsAcceptable: false,
    ...over,
  });

  it("correct when the selected brand is acceptable", () => {
    expect(classifyBrand(determinate, obs({ value: "LUIGI & GIOVANNI" }), brandDiag())).toBe(
      "correct",
    );
  });

  it("false-certainty when confidently wrong", () => {
    expect(classifyBrand(determinate, obs({ state: "OBSERVED", value: "Pir" }), brandDiag())).toBe(
      "false-certainty",
    );
  });

  it("ranking failure when the correct brand is a non-selected alternate", () => {
    const o = obs({
      state: "AMBIGUOUS",
      value: "Pir",
      alternates: [{ value: "Luigi & Giovanni", confidence: 0.3 }],
    });
    expect(classifyBrand(determinate, o, brandDiag({ candidateContainsAcceptable: true }))).toBe(
      "candidate-ranking-failure",
    );
  });

  it("ranking failure when the correct brand survived assembly but fell below top-3", () => {
    const o = obs({
      state: "AMBIGUOUS",
      value: "Pir",
      alternates: [
        { value: "Also Wrong", confidence: 0.4 },
        { value: "Still Wrong", confidence: 0.3 },
        { value: "Yet Wrong", confidence: 0.2 },
      ],
    });
    expect(classifyBrand(determinate, o, brandDiag({ candidateContainsAcceptable: true }))).toBe(
      "candidate-ranking-failure",
    );
  });

  it("filtering failure when a line contained the brand but no acceptable candidate survived", () => {
    const o = obs({ state: "AMBIGUOUS", value: "Something", alternates: [] });
    expect(classifyBrand(determinate, o, brandDiag({ lineContainsAcceptable: true }))).toBe(
      "candidate-filtering-failure",
    );
  });

  it("line-reconstruction failure when OCR saw the brand only before line assembly", () => {
    const o = obs({ state: "AMBIGUOUS", value: "Something", alternates: [] });
    expect(classifyBrand(determinate, o, brandDiag({ ocrContainsAcceptable: true }))).toBe(
      "line-reconstruction-failure",
    );
  });

  it("ocr-recognition failure when OCR never read the brand", () => {
    const o = obs({ state: "AMBIGUOUS", value: "Something", alternates: [] });
    expect(classifyBrand(determinate, o, brandDiag())).toBe("ocr-recognition-failure");
  });

  it("genuine ambiguity: honest deferral is correct-uncertainty, confident pick is false-certainty", () => {
    expect(
      classifyBrand(ambiguous, obs({ state: "AMBIGUOUS", value: "Amuninni" }), brandDiag()),
    ).toBe("correct-uncertainty");
    expect(
      classifyBrand(ambiguous, obs({ state: "OBSERVED", value: "Amuninni" }), brandDiag()),
    ).toBe("false-certainty");
  });

  it("absent brand correctly not observed is a success, while a fabricated brand is false-certainty", () => {
    expect(classifyBrand(absent, obs({ state: "NOT_OBSERVED", value: null }), brandDiag())).toBe(
      "correct",
    );
    expect(
      classifyBrand(absent, obs({ state: "OBSERVED", value: "Marble Creek Acres" }), brandDiag()),
    ).toBe("false-certainty");
  });
});

describe("alcohol classification", () => {
  const present: EvalAlcoholTruth = {
    present: true,
    acceptablePercents: [14],
    acceptableText: ["14%"],
  };
  const absent: EvalAlcoholTruth = { present: false, acceptablePercents: [], acceptableText: [] };
  const diag = (o: Partial<AlcoholDiagnostics>): AlcoholDiagnostics => ({
    numberInOcr: false,
    percentInOcr: false,
    alcoholMarkerInOcr: false,
    volumeMarkerInOcr: false,
    sameLineEvidenceCluster: false,
    adjacentLineEvidenceCluster: false,
    filterRejectedCandidate: false,
    parserRejectedCandidate: false,
    candidateAccepted: false,
    primaryNumberInOcr: false,
    recoveryNumberInOcr: false,
    primarySameLineEvidenceCluster: false,
    recoverySameLineEvidenceCluster: false,
    primaryAdjacentLineEvidenceCluster: false,
    recoveryAdjacentLineEvidenceCluster: false,
    primaryCandidateAccepted: false,
    recoveryCandidateAccepted: false,
    ...o,
  });

  it("correct when detected and parsed accurately", () => {
    expect(classifyAlcohol(present, obs({ value: "14% ALC./VOL." }), diag({}))).toBe("correct");
  });

  it("parser failure when detected but the value is wrong", () => {
    expect(classifyAlcohol(present, obs({ value: "80% ALC" }), diag({}))).toBe("parser-failure");
  });

  it("absent alcohol correctly not observed is a success, not a failure", () => {
    expect(classifyAlcohol(absent, obs({ state: "NOT_OBSERVED", value: null }), diag({}))).toBe(
      "correct",
    );
  });

  it("absent alcohol wrongly observed is a false positive", () => {
    expect(classifyAlcohol(absent, obs({ state: "OBSERVED", value: "13%" }), diag({}))).toBe(
      "false-certainty",
    );
  });

  it("same-line alcohol evidence without a supported candidate → candidate-generation failure", () => {
    const missed = obs({ state: "NOT_OBSERVED", value: null });
    expect(
      classifyAlcohol(
        present,
        missed,
        diag({
          numberInOcr: true,
          percentInOcr: true,
          sameLineEvidenceCluster: true,
          alcoholMarkerInOcr: true,
          volumeMarkerInOcr: true,
        }),
      ),
    ).toBe("candidate-generation-failure");
  });

  it("adjacent-line alcohol evidence without a candidate → line-reconstruction failure", () => {
    const missed = obs({ state: "NOT_OBSERVED", value: null });
    expect(
      classifyAlcohol(
        present,
        missed,
        diag({
          numberInOcr: true,
          percentInOcr: true,
          adjacentLineEvidenceCluster: true,
          alcoholMarkerInOcr: true,
          volumeMarkerInOcr: true,
        }),
      ),
    ).toBe("line-reconstruction-failure");
  });

  it("number never recognized → ocr-recognition failure", () => {
    const missed = obs({ state: "NOT_OBSERVED", value: null });
    expect(classifyAlcohol(present, missed, diag({ numberInOcr: false }))).toBe(
      "ocr-recognition-failure",
    );
  });

  it("filter-rejected candidate paths stay distinct from generation failures", () => {
    const missed = obs({ state: "NOT_OBSERVED", value: null });
    expect(
      classifyAlcohol(
        present,
        missed,
        diag({
          numberInOcr: true,
          alcoholMarkerInOcr: true,
          volumeMarkerInOcr: true,
          filterRejectedCandidate: true,
        }),
      ),
    ).toBe("candidate-filtering-failure");
  });

  it("parser-rejected candidates stay distinct from filtering failures", () => {
    const missed = obs({ state: "NOT_OBSERVED", value: null });
    expect(
      classifyAlcohol(
        present,
        missed,
        diag({
          numberInOcr: true,
          percentInOcr: true,
          alcoholMarkerInOcr: true,
          volumeMarkerInOcr: true,
          parserRejectedCandidate: true,
        }),
      ),
    ).toBe("parser-failure");
  });
});

describe("aggregation and percentiles are deterministic", () => {
  const scores: FieldCaseScore[] = [
    score("a", {
      brandClass: "correct",
      brandPresent: true,
      brandExact: true,
      brandNormalized: true,
      brandTop3: true,
      brandTop5: true,
      brandDetected: true,
      alcoholDetected: true,
      alcoholParsedAccurate: true,
      latencyMs: 100,
    }),
    score("b", {
      brandClass: "false-certainty",
      brandPresent: false,
      brandTop5: true,
      brandDetected: true,
      alcoholClass: "false-certainty",
      alcoholPresent: false,
      alcoholDetected: true,
      latencyMs: 300,
    }),
    score("c", {
      brandClass: "correct-uncertainty",
      brandPresent: true,
      brandKnownAmbiguous: true,
      brandDetected: true,
      alcoholPresent: true,
      alcoholDetected: false,
      latencyMs: 200,
    }),
  ];

  it("produces identical aggregates on repeated runs", () => {
    expect(aggregate(scores)).toEqual(aggregate(scores));
  });

  it("computes denominators and rates from the right subsets", () => {
    const a = aggregate(scores);
    expect(a.caseCount).toBe(3);
    expect(a.determinateBrandCount).toBe(1); // a
    expect(a.absentBrandCount).toBe(1); // b
    expect(a.ambiguousBrandCount).toBe(1); // c
    expect(a.absentBrandFalsePositiveRate).toBe(1); // b detected while absent
    expect(a.absentAlcoholCount).toBe(1); // b
    expect(a.absentFieldFalsePositiveRate).toBe(1); // b detected while absent
    expect(a.brandExactMatchRate).toBe(1); // a of {a}
    expect(a.brandTop5Recall).toBe(1); // a of {a}
    expect(a.brandConfidentCorrectRate).toBe(1); // a of {a}
    expect(a.brandUsefulButDeferredRate).toBe(0); // a is already confident-correct
    expect(a.brandUnnecessaryAmbiguityRate).toBe(0); // no deferred determinate case
    expect(a.brandFalseCertaintyRate).toBe(0); // absent-brand FP tracked separately
    expect(a.brandNotObservedRate).toBe(0); // a observed
    expect(a.alcoholParserFailureRate).toBe(0); // a + c have no parser failures
    expect(a.alcoholFalseCertaintyRate).toBeCloseTo(1 / 3); // only b
  });

  it("nearest-rank percentile is stable", () => {
    expect(percentile([100, 200, 300], 50)).toBe(200);
    expect(percentile([100, 200, 300], 95)).toBe(300);
    expect(percentile([], 50)).toBe(0);
  });
});

function score(caseId: string, over: Partial<FieldCaseScore>): FieldCaseScore {
  return {
    caseId,
    brandClass: "correct",
    alcoholClass: "correct",
    brandPresent: true,
    brandKnownAmbiguous: false,
    alcoholPresent: true,
    brandDetected: false,
    brandExact: false,
    brandNormalized: false,
    brandTop3: false,
    brandTop5: false,
    alcoholDetected: false,
    alcoholParsedAccurate: false,
    latencyMs: 0,
    ...over,
  };
}
