import { describe, expect, it } from "vitest";

import type { OcrWord, RegionOcrResult, RegionTransform } from "./extractor.types";
import {
  compareCandidateRanking,
  normalizeConfidence,
  selectAlcoholObservation,
  selectBrandObservation,
} from "./field-selection";

const TRANSFORM: RegionTransform = {
  crop: { left: 0, top: 0, width: 200, height: 200 },
  rotate: 0,
  scale: 1,
  originalWidth: 200,
  originalHeight: 200,
};

let cursor = 0;
function word(text: string, conf: number, y = 10): OcrWord {
  const x0 = cursor;
  cursor += 20;
  return {
    text,
    rawConfidence: conf,
    bbox: { x0, y0: y, x1: x0 + 18, y1: y + 12 },
    originalGeometry: {
      imageIndex: 0,
      x: x0,
      y,
      width: 18,
      height: 12,
      imageWidth: 200,
      imageHeight: 200,
    },
  };
}

function region(words: OcrWord[], name = "full-image"): RegionOcrResult {
  return {
    passId: `pass-${name}`,
    regionName: name,
    passKind: "full-image-primary",
    triggerReasons: ["primary-pass"],
    preprocessing: ["grayscale", "normalise", "scale:1.5"],
    fieldEligibility: { brand: true, alcohol: true },
    transform: TRANSFORM,
    transformedSize: { width: 200, height: 200 },
    pageSegMode: 11,
    rawWordCount: words.length,
    discardedWordCount: 0,
    timings: { preprocessMs: 0, ocrMs: 0, inverseMappingMs: 0, totalMs: 0 },
    words,
  };
}

function line(texts: [string, number][], y: number): OcrWord[] {
  cursor = 0;
  return texts.map(([t, c]) => word(t, c, y));
}

describe("normalizeConfidence", () => {
  it("maps the 0–100 scale to [0,1] and floors invalid values", () => {
    expect(normalizeConfidence(92)).toBeCloseTo(0.92);
    expect(normalizeConfidence(0)).toBe(0);
    expect(normalizeConfidence(-5)).toBe(0);
    expect(normalizeConfidence(150)).toBe(1);
  });
});

function rankedCandidate(ranking: Record<string, unknown>) {
  return { ranking } as unknown as Parameters<typeof compareCandidateRanking>[0];
}

describe("compareCandidateRanking", () => {
  it("lets the primary comparator decide before strategy-specific comparator order diverges", () => {
    const scoreFirst = rankedCandidate({
      strategy: "brand-mixed-prominence-score",
      orderingMode: "score-first",
      comparator: [
        { id: "score-eligibility", direction: "desc", value: true },
        { id: "ranking-score", direction: "desc", value: 5.2 },
        { id: "prominence", direction: "desc", value: 30 },
        { id: "ocr-evidence-score", direction: "desc", value: 0.8 },
        { id: "normalized-value-key", direction: "asc", value: "alpha" },
      ],
    });
    const prominenceFirst = rankedCandidate({
      strategy: "brand-mixed-prominence-score",
      orderingMode: "prominence-first",
      comparator: [
        { id: "score-eligibility", direction: "desc", value: false },
        { id: "prominence", direction: "desc", value: 90 },
        { id: "ocr-evidence-score", direction: "desc", value: 0.99 },
        { id: "ranking-score", direction: "desc", value: 9.1 },
        { id: "normalized-value-key", direction: "asc", value: "omega" },
      ],
    });

    expect(compareCandidateRanking(scoreFirst, prominenceFirst)).toBeLessThan(0);
  });

  it("rejects comparator identifier drift once the primary comparator ties", () => {
    const left = rankedCandidate({
      strategy: "brand-mixed-prominence-score",
      orderingMode: "score-first",
      comparator: [
        { id: "score-eligibility", direction: "desc", value: true },
        { id: "ranking-score", direction: "desc", value: 5.2 },
        { id: "prominence", direction: "desc", value: 30 },
        { id: "ocr-evidence-score", direction: "desc", value: 0.8 },
        { id: "normalized-value-key", direction: "asc", value: "alpha" },
      ],
    });
    const right = rankedCandidate({
      strategy: "brand-mixed-prominence-score",
      orderingMode: "score-first",
      comparator: [
        { id: "score-eligibility", direction: "desc", value: true },
        { id: "prominence", direction: "desc", value: 29 },
        { id: "ranking-score", direction: "desc", value: 5.1 },
        { id: "ocr-evidence-score", direction: "desc", value: 0.7 },
        { id: "normalized-value-key", direction: "asc", value: "beta" },
      ],
    });

    expect(() => compareCandidateRanking(left, right)).toThrow(/matching comparator semantics/);
  });

  it("rejects comparator length drift once the primary comparator ties", () => {
    const left = rankedCandidate({
      strategy: "alcohol-ocr-evidence-comparator",
      orderingMode: "ocr-evidence-first",
      comparator: [
        { id: "ocr-evidence-score", direction: "desc", value: 0.8 },
        { id: "normalized-value-key", direction: "asc", value: "125alcvol" },
      ],
    });
    const right = rankedCandidate({
      strategy: "alcohol-ocr-evidence-comparator",
      orderingMode: "ocr-evidence-first",
      comparator: [{ id: "ocr-evidence-score", direction: "desc", value: 0.8 }],
    });

    expect(() => compareCandidateRanking(left, right)).toThrow(/matching comparator lengths/);
  });

  it("rejects mixed comparator value types", () => {
    const left = rankedCandidate({
      strategy: "alcohol-ocr-evidence-comparator",
      orderingMode: "ocr-evidence-first",
      comparator: [
        { id: "ocr-evidence-score", direction: "desc", value: 0.8 },
        { id: "normalized-value-key", direction: "asc", value: "125alcvol" },
      ],
    });
    const right = rankedCandidate({
      strategy: "alcohol-ocr-evidence-comparator",
      orderingMode: "ocr-evidence-first",
      comparator: [
        { id: "ocr-evidence-score", direction: "desc", value: 0.8 },
        { id: "normalized-value-key", direction: "asc", value: 125 },
      ],
    });

    expect(() => compareCandidateRanking(left, right)).toThrow(/identical value types/);
  });
});

describe("selectAlcoholObservation", () => {
  it("extracts a direct statement and keeps the value with OBSERVED state", () => {
    const words = line(
      [
        ["750ML", 90],
        ["12.5%", 92],
        ["ALC./VOL.", 91],
        ["CONTAINS", 93],
        ["SULFITES", 90],
      ],
      10,
    );
    const { observation } = selectAlcoholObservation([region(words)]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("12.5% ALC./VOL.");
  });

  it("assembles a split percent marker on one line", () => {
    const words = line(
      [
        ["13.5", 94],
        ["%", 94],
        ["BY", 93],
        ["VOL", 92],
      ],
      10,
    );
    const { observation, alcoholDiagnostics } = selectAlcoholObservation([region(words)]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("13.5% BY VOL.");
    expect(alcoholDiagnostics?.candidates.some((candidate) => candidate.kept)).toBe(true);
  });

  it("assembles explicit percent-less alcohol-by-volume wording", () => {
    const words = line(
      [
        ["ALC", 93],
        ["14", 93],
        ["BY", 93],
        ["VOL", 92],
      ],
      10,
    );
    const { observation, alcoholDiagnostics } = selectAlcoholObservation([region(words)]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("ALCOHOL 14 BY VOLUME");
    expect(
      alcoholDiagnostics?.candidates.find((candidate) => candidate.kept)?.acceptanceReason,
    ).toBe("explicit-percentless-alcohol-by-volume");
  });

  it("assembles alcohol wording across tightly adjacent lines", () => {
    const upper = line(
      [
        ["ALC", 93],
        ["%", 92],
      ],
      10,
    );
    const lower = line(
      [
        ["13,5", 93],
        ["BY", 92],
        ["VOL", 92],
      ],
      32,
    );
    const { observation, alcoholDiagnostics } = selectAlcoholObservation([
      region([...upper, ...lower]),
    ]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("13.5% ALC./VOL.");
    expect(alcoholDiagnostics?.candidates.find((candidate) => candidate.kept)?.assembly).toBe(
      "adjacent-line-window",
    );
  });

  it("merges a split decimal across OCR tokens", () => {
    const words = line(
      [
        ["13", 92],
        [".", 92],
        ["5", 92],
        ["%", 92],
        ["BY", 91],
        ["VOL", 91],
      ],
      10,
    );
    const { observation, alcoholDiagnostics } = selectAlcoholObservation([region(words)]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("13.5% BY VOL.");
    expect(
      alcoholDiagnostics?.candidates.find((candidate) => candidate.kept)?.normalizationOperations,
    ).toContain("split-decimal-merge");
  });

  it("normalizes fused OCR alcohol markers and missing decimal punctuation narrowly", () => {
    const words = line(
      [
        ["A1C135%", 91],
        ["BY", 90],
        ["V0L", 90],
      ],
      10,
    );
    const { observation, alcoholDiagnostics } = selectAlcoholObservation([region(words)]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("13.5% ALC./VOL.");
    expect(
      alcoholDiagnostics?.candidates.find((candidate) => candidate.kept)?.normalizationOperations,
    ).toEqual(
      expect.arrayContaining([
        "split-fused-alcohol-prefix",
        "marker-ocr-normalized",
        "implicit-decimal-recovery",
      ]),
    );
  });

  it("preserves a low-confidence value rather than dropping it", () => {
    const words = line(
      [
        ["12.5%", 40],
        ["ALC./VOL.", 42],
      ],
      10,
    );
    const { observation } = selectAlcoholObservation([region(words)]);
    expect(observation.state).toBe("LOW_CONFIDENCE");
    expect(observation.value).toBe("12.5% ALC./VOL.");
  });

  it("never returns a proof statement as a value", () => {
    const words = line(
      [
        ["80", 90],
        ["proof", 90],
      ],
      10,
    );
    const { observation, alcoholDiagnostics } = selectAlcoholObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
    expect(alcoholDiagnostics?.candidates[0]?.rejectionReason).toBe("proof-only");
  });

  it("returns NOT_OBSERVED when a processed region has no supported candidate", () => {
    const words = line(
      [
        ["HELLO", 95],
        ["WORLD", 95],
      ],
      10,
    );
    const { observation } = selectAlcoholObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
  });

  it("rejects a year-shaped number even with alcohol wording", () => {
    const words = line(
      [
        ["ALCOHOL", 95],
        ["2021", 95],
        ["BY", 95],
        ["VOLUME", 95],
      ],
      10,
    );
    const { observation, alcoholDiagnostics } = selectAlcoholObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(
      alcoholDiagnostics?.candidates.some(
        (candidate) =>
          candidate.rejectionReason === "unsupported-pattern" ||
          candidate.rejectionReason === "no-supported-number",
      ),
    ).toBe(true);
  });

  it("preserves ambiguity when two plausible alcohol statements compete", () => {
    const top = line(
      [
        ["12.5%", 92],
        ["ALC./VOL.", 92],
      ],
      10,
    );
    const bottom = line(
      [
        ["13%", 91],
        ["ALC./VOL.", 91],
      ],
      50,
    );
    const { observation } = selectAlcoholObservation([region([...top, ...bottom])]);
    expect(observation.state).toBe("AMBIGUOUS");
    expect(observation.alternates.length).toBeGreaterThan(0);
  });
});

// A tall brand-art line and, optionally, a short bottler line beneath it.
function tallLine(texts: [string, number][], y: number, height: number): OcrWord[] {
  cursor = 0;
  return texts.map(([t, c]) => {
    const x0 = cursor;
    cursor += 20;
    return {
      text: t,
      rawConfidence: c,
      bbox: { x0, y0: y, x1: x0 + 18, y1: y + height },
      originalGeometry: {
        imageIndex: 0,
        x: x0,
        y,
        width: 18,
        height,
        imageWidth: 200,
        imageHeight: 200,
      },
    };
  });
}

describe("selectBrandObservation", () => {
  it("selects a positively-signalled brand line and never the BOTTLED BY producer entity", () => {
    const brandArt = tallLine(
      [
        ["ACME", 92],
        ["ESTATE", 93],
      ],
      10,
      40,
    );
    const bottler = tallLine(
      [
        ["BOTTLED", 90],
        ["BY", 90],
        ["OTHER", 90],
        ["WINERY", 90],
      ],
      120,
      12,
    );
    const { observation, sourceRegion } = selectBrandObservation([
      region([...brandArt, ...bottler]),
    ]);
    // "ESTATE" is an explicit brand-entity designator, so this line is
    // positively distinguishable brand presentation.
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("ACME ESTATE");
    expect(sourceRegion).toBe("full-image");
    // The bottler entity must never surface as the brand or an alternate value.
    const allValues = [observation.value, ...observation.alternates.map((a) => a.value)];
    expect(allValues).not.toContain("OTHER WINERY");
  });

  it("reads pixel words, not any answer key: a different brand line yields that value", () => {
    const words = tallLine(
      [
        ["ZEPHYR", 92],
        ["HILLS", 92],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    // No positive brand signal (no possessive or designator), so the value is
    // preserved but the line is not authoritative brand evidence.
    expect(observation.state).toBe("AMBIGUOUS");
    expect(observation.value).toBe("ZEPHYR HILLS");
  });

  it("keeps a single clean possessive brand-region candidate selectable", () => {
    const words = tallLine(
      [
        ["STONE'S", 90],
        ["THROW", 91],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    // A possessive mark is an explicit positive brand-presentation signal.
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("STONE'S THROW");
  });

  it("does not reject a positively-signalled brand just because it ends with punctuation", () => {
    const brand = tallLine(
      [
        ["Mike's", 96],
        ["Farm,", 80],
        ["Inc.", 95],
      ],
      10,
      40,
    );
    const backLabelNoise = tallLine(
      [
        ["HINNANT", 92],
        ["FARMS", 96],
        ["VINEYARD", 96],
      ],
      120,
      18,
    );
    const { observation } = selectBrandObservation([region([...brand, ...backLabelNoise])]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("Mike's Farm, Inc.");
  });

  it("promotes a coherent brand window over short surviving noise", () => {
    const noise = tallLine(
      [
        ["Pan", 32],
        ["J", 62],
        ["1", 27],
        ["ON", 31],
      ],
      10,
      36,
    );
    const brand = tallLine(
      [
        ["CAYWOOD", 59],
        ["VINEYARD", 96],
        [">", 56],
        ["usc", 0],
      ],
      120,
      60,
    );
    const { observation, brandDiagnostics } = selectBrandObservation([
      region([...noise, ...brand]),
    ]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("CAYWOOD VINEYARD");
    const selected = brandDiagnostics?.candidates.find(
      (c) => c.cleanedValue === "CAYWOOD VINEYARD",
    );
    const demotedNoise = brandDiagnostics?.candidates.find((c) => c.cleanedValue === "Pan J 1 ON");
    expect(selected?.assembly).toBe("line-window");
    expect(selected?.decision).toBe("selected");
    expect(demotedNoise?.decision).toBe("alternate");
    expect((selected?.score?.total ?? 0) > (demotedNoise?.score?.total ?? 0)).toBe(true);
  });

  it("does not let a low-prominence appellation outrank the dominant brand on one-pixel geometry jitter", () => {
    const brand = tallLine([["BLAZIC", 91]], 10, 64);
    const sideName = tallLine([["Collio", 91]], 90, 60);
    const appellation = tallLine(
      [
        ["Denominazione", 91],
        ["di", 91],
        ["Origine", 91],
        ["Controllata", 93],
      ],
      150,
      26,
    );
    const { observation, brandDiagnostics } = selectBrandObservation([
      region([...brand, ...sideName, ...appellation]),
    ]);

    expect(observation.state).toBe("AMBIGUOUS");
    expect(observation.value).toBe("BLAZIC");
    const selected = brandDiagnostics?.candidates.find(
      (candidate) => candidate.decision === "selected",
    );
    expect(selected?.cleanedValue).toBe("BLAZIC");
  });

  it("assembles a split multi-line brand and keeps it selected", () => {
    const upper = tallLine(
      [
        ["DUCK", 92],
        ["WALK", 93],
      ],
      10,
      40,
    );
    const lower = tallLine([["VINEYARDS", 94]], 65, 40);
    const { observation, brandDiagnostics } = selectBrandObservation([
      region([...upper, ...lower]),
    ]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("DUCK WALK VINEYARDS");
    const merged = brandDiagnostics?.candidates.find(
      (c) => c.cleanedValue === "DUCK WALK VINEYARDS",
    );
    expect(merged?.assembly).toBe("multi-line-merge");
    expect(merged?.decision).toBe("selected");
  });

  it("keeps a positively-signalled brand when the selected reconstruction ends with a period", () => {
    const words = tallLine(
      [
        ["STONE'S", 92],
        ["THROW.", 92],
        ["2021", 40],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("STONE'S THROW.");
  });

  it("does not turn a sole prominent wine varietal line into brand evidence", () => {
    const words = tallLine(
      [
        ["CABERNET", 93],
        ["SAUVIGNON", 92],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("does not turn a sole prominent marketing slogan into OBSERVED brand evidence", () => {
    const words = tallLine(
      [
        ["LIVE", 93],
        ["BOLDLY", 92],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    // A slogan is plausible but not positively distinguishable as a brand.
    expect(observation.state).toBe("AMBIGUOUS");
    expect(observation.value).toBe("LIVE BOLDLY");
  });

  it("does not turn a sole prominent website into brand evidence", () => {
    const words = tallLine([["ACME.COM", 93]], 10, 40);
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("does not turn vintage-only text into brand evidence", () => {
    const words = tallLine([["2019", 95]], 10, 40);
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("does not turn a sole prominent appellation line into OBSERVED brand evidence", () => {
    const words = tallLine(
      [
        ["NAPA", 93],
        ["VALLEY", 92],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("a marketing slogan cannot outrank a genuine positively-signalled brand", () => {
    const slogan = tallLine(
      [
        ["LIVE", 90],
        ["BOLDLY", 90],
      ],
      120,
      18,
    );
    const brand = tallLine(
      [
        ["BETA", 92],
        ["CELLARS", 92],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region([...brand, ...slogan])]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("BETA CELLARS");
    expect(observation.value).not.toBe("LIVE BOLDLY");
  });

  it("a varietal line cannot outrank a genuine possessive brand", () => {
    const varietal = tallLine(
      [
        ["CABERNET", 90],
        ["SAUVIGNON", 90],
      ],
      120,
      18,
    );
    const brand = tallLine(
      [
        ["STONE'S", 92],
        ["THROW", 92],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region([...brand, ...varietal])]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("STONE'S THROW");
  });

  it("a website line cannot outrank a genuine designator brand", () => {
    const site = tallLine([["ACME.COM", 90]], 120, 18);
    const brand = tallLine(
      [
        ["ACME", 92],
        ["ESTATE", 92],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region([...brand, ...site])]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("ACME ESTATE");
    const allValues = [observation.value, ...observation.alternates.map((a) => a.value)];
    expect(allValues).not.toContain("ACME.COM");
  });

  it("returns NOT_OBSERVED for producer-only text with no readable brand", () => {
    const words = tallLine(
      [
        ["PRODUCED", 90],
        ["BY", 90],
        ["OTHER", 90],
        ["WINERY", 90],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for a location/address line with no defensible brand", () => {
    const words = tallLine(
      [
        ["DELRAY", 95],
        ["BEACH", 95],
        ["FL", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for a country-suffixed location line", () => {
    const words = tallLine(
      [
        ["FONT-RUBI", 95],
        ["-", 95],
        ["SPAIN", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for generic wine/product wording with no defensible brand", () => {
    const words = tallLine(
      [
        ["AMERICAN", 95],
        ["GRAPE", 95],
        ["WINE", 95],
        ["CONCORD", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for generic translated product wording", () => {
    const words = tallLine(
      [
        ["VARIEDADES", 95],
        ["CUPATGE", 95],
        ["BLEND", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for a translated product-of-country line", () => {
    const words = tallLine(
      [
        ["PRODUCTE", 95],
        ["D'ESPANYA", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for connector-linked generic product wording", () => {
    const words = tallLine(
      [
        ["VINO", 95],
        ["D'ITALIA", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for serving-temperature prose", () => {
    const words = tallLine(
      [
        ["Serving", 95],
        ["temperature:", 95],
        ["52-54°F", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for appellation-varietal wording with no defensible brand", () => {
    const words = tallLine(
      [
        ["ROERO", 95],
        ["ARNEIS", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for blend-composition varietal wording", () => {
    const words = tallLine(
      [
        ["80", 95],
        ["NEGRETTE,", 95],
        ["20", 95],
        ["CABERNET", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for a vineyard-site phrase with no defensible brand", () => {
    const words = tallLine(
      [
        ["ABBOTT", 95],
        ["CLAIM", 95],
        ["VINEYARD", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for low-information OCR fragments", () => {
    const words = tallLine(
      [
        ["JI", 75],
        ["II", 74],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for split government-warning fragments", () => {
    const words = tallLine(
      [
        ["BE", 95],
        ["VERAGES", 95],
        ["IM", 95],
        ["PAIRS", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("returns NOT_OBSERVED for split pregnancy-warning fragments", () => {
    const words = tallLine(
      [
        ["NG", 95],
        ["PREGN", 95],
        ["ANC", 95],
        ["OT", 95],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
  });

  it("is AMBIGUOUS when two brand-art lines rival each other in prominence", () => {
    const a = tallLine(
      [
        ["ALPHA", 90],
        ["ESTATE", 90],
      ],
      10,
      40,
    );
    const b = tallLine(
      [
        ["BETA", 90],
        ["CELLARS", 90],
      ],
      120,
      40,
    );
    const { observation } = selectBrandObservation([region([...a, ...b])]);
    expect(observation.state).toBe("AMBIGUOUS");
    expect(observation.alternates.length).toBeGreaterThanOrEqual(1);
  });

  it("does not fabricate a brand from rotated mandatory-strip text", () => {
    const words = tallLine(
      [
        ["GOVERNMENT", 92],
        ["WARNING", 93],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([
      region(words, "vertical-mandatory-strip-rot90"),
    ]);
    expect(observation.state).toBe("NOT_OBSERVED");
  });
});
