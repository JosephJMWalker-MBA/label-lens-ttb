import { describe, expect, it } from "vitest";

import {
  alcoholCandidateFilteringSubtype,
  alcoholSelectedFieldCorrect,
  brandCandidateFilteringSubtype,
  brandSelectedFieldCorrect,
} from "./diagnostic-attribution";
import type { EvalAlcoholTruth, EvalBrandTruth } from "./eval-manifest.types";

function ocrConfidence(score: number) {
  const raw = Math.round(score * 100);
  return {
    aggregation: "mean" as const,
    rawScale: "0-100" as const,
    rawTokenConfidences: [raw],
    rawMean: raw,
    rawMin: raw,
    rawMax: raw,
    missingTokenCount: 0,
  };
}

function candidateProvenance(passKind: string) {
  return {
    passId: "pass-0-full-image",
    passKind,
    triggerReasons: ["primary-pass"],
    preprocessing: [],
    regionName: "brand",
    supportingPassIds: ["pass-0-full-image"],
    supportingPassKinds: [passKind],
    recoveryPassUsed: false,
  };
}

describe("candidate-filtering subtype attribution", () => {
  it("maps truth-containing rejected brand spans to their filter subtype", () => {
    const truth: EvalBrandTruth = {
      present: true,
      acceptable: ["Meeting of the Minds"],
      knownAmbiguous: false,
    };

    expect(
      brandCandidateFilteringSubtype(truth, {
        brandCandidateDecisions: [
          {
            rawText: "Samson and Delilah, this Meeting of the Minds is fire.",
            cleanedValue: "Samson and Delilah, this Meeting of the Minds is fire.",
            confidence: 0.8,
            ocrEvidenceScore: 0.8,
            ocrConfidence: ocrConfidence(0.8),
            prominence: 14,
            passId: "pass-0-full-image",
            passKind: "full-image-primary",
            supportPassIds: ["pass-0-full-image"],
            candidateProvenance: candidateProvenance("full-image-primary"),
            assembly: "whole-line",
            lineIndexes: [0],
            kept: false,
            filterReason: "too-many-words",
          },
        ],
        brandLineDecisions: [],
      }),
    ).toBe("brand-rejected-too-many-words");
  });

  it("detects a kept overextended brand candidate when no exact acceptable span survives", () => {
    const truth: EvalBrandTruth = {
      present: true,
      acceptable: ["Vino Alpino"],
      knownAmbiguous: false,
    };

    expect(
      brandCandidateFilteringSubtype(truth, {
        brandCandidateDecisions: [
          {
            rawText: "Vino Alpino LLC",
            cleanedValue: "Vino Alpino LLC",
            confidence: 0.9,
            ocrEvidenceScore: 0.9,
            ocrConfidence: ocrConfidence(0.9),
            prominence: 18,
            passId: "pass-0-full-image",
            passKind: "full-image-primary",
            supportPassIds: ["pass-0-full-image"],
            candidateProvenance: candidateProvenance("full-image-primary"),
            assembly: "whole-line",
            lineIndexes: [2],
            kept: true,
            filterReason: "candidate-plausible",
            decision: "selected",
          },
        ],
        brandLineDecisions: [],
      }),
    ).toBe("brand-kept-overextended-candidate");
  });

  it("uses a neutral terminal brand subtype when diagnostics cannot isolate the exact filter path", () => {
    const truth: EvalBrandTruth = {
      present: true,
      acceptable: ["North Ridge"],
      knownAmbiguous: false,
    };

    expect(
      brandCandidateFilteringSubtype(truth, {
        brandCandidateDecisions: [],
        brandLineDecisions: [],
      }),
    ).toBe("brand-filtering-cause-unattributed");
  });

  it("chooses the best alcohol rejection subtype from rejected candidates", () => {
    const truth: EvalAlcoholTruth = {
      present: true,
      acceptablePercents: [13.5],
      acceptableText: ["13.5% ALC./VOL."],
    };

    expect(
      alcoholCandidateFilteringSubtype(truth, {
        alcoholCandidateDecisions: [
          {
            rawText: "13.5%",
            normalizedValue: null,
            normalizedParsingText: null,
            confidence: 0.7,
            ocrEvidenceScore: 0.7,
            ocrConfidence: ocrConfidence(0.7),
            prominence: 10,
            passId: "pass-2-right-edge-strip-rot90",
            passKind: "right-edge-strip-rot90",
            supportPassIds: ["pass-2-right-edge-strip-rot90"],
            candidateProvenance: {
              ...candidateProvenance("right-edge-strip-rot90"),
              passId: "pass-2-right-edge-strip-rot90",
              regionName: "alcohol",
              supportingPassIds: ["pass-2-right-edge-strip-rot90"],
              supportingPassKinds: ["right-edge-strip-rot90"],
            },
            assembly: "same-line-window",
            lineIndexes: [0],
            sourceTokens: ["13.5%"],
            sourceBoxes: [],
            sourceOriginalBoxes: [],
            kept: false,
            positiveMarkers: [],
            normalizationOperations: [],
            parsedPercent: null,
            rejectionReason: "missing-volume-marker",
          },
        ],
        alcoholNumberInOcr: true,
        alcoholPercentInOcr: true,
        alcoholAlcoholMarkerInOcr: false,
        alcoholVolumeMarkerInOcr: false,
      }),
    ).toBe("alcohol-rejected-missing-volume-marker");
  });

  it("falls back to explicit-marker loss when no richer alcohol candidate exists", () => {
    const truth: EvalAlcoholTruth = {
      present: true,
      acceptablePercents: [13],
      acceptableText: ["13% ALC./VOL."],
    };

    expect(
      alcoholCandidateFilteringSubtype(truth, {
        alcoholCandidateDecisions: [],
        alcoholNumberInOcr: true,
        alcoholPercentInOcr: false,
        alcoholAlcoholMarkerInOcr: false,
        alcoholVolumeMarkerInOcr: true,
      }),
    ).toBe("alcohol-rejected-missing-explicit-alcohol-marker");
  });
});

describe("selected-field correctness helpers", () => {
  it("treats normalized acceptable brand matches as correct selections", () => {
    const truth: EvalBrandTruth = {
      present: true,
      acceptable: ["Château Bonneau"],
      knownAmbiguous: false,
    };

    expect(
      brandSelectedFieldCorrect(truth, {
        state: "AMBIGUOUS",
        value: "CHATEAU BONNEAU",
        confidence: 0.4,
        ocrEvidenceScore: 0.4,
        alternates: [],
      }),
    ).toBe(true);
  });

  it("treats parsed accurate alcohol values as correct selections", () => {
    const truth: EvalAlcoholTruth = {
      present: true,
      acceptablePercents: [12.5],
      acceptableText: ["12.5% ALC./VOL."],
    };

    expect(
      alcoholSelectedFieldCorrect(truth, {
        state: "OBSERVED",
        value: "12.5% BY VOL.",
        confidence: 0.8,
        ocrEvidenceScore: 0.8,
        alternates: [],
      }),
    ).toBe(true);
  });
});
