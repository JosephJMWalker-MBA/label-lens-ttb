import { describe, expect, it } from "vitest";

import type { OcrWord, RegionOcrResult, RegionTransform } from "./extractor.types";
import {
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
  return { text, rawConfidence: conf, bbox: { x0, y0: y, x1: x0 + 18, y1: y + 12 } };
}

function region(words: OcrWord[], name = "full-image"): RegionOcrResult {
  return { regionName: name, transform: TRANSFORM, words };
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
        ["80%", 90],
        ["proof", 90],
      ],
      10,
    );
    const { observation } = selectAlcoholObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
    expect(observation.value).toBeNull();
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
});

// A tall brand-art line and, optionally, a short bottler line beneath it.
function tallLine(texts: [string, number][], y: number, height: number): OcrWord[] {
  cursor = 0;
  return texts.map(([t, c]) => {
    const x0 = cursor;
    cursor += 20;
    return { text: t, rawConfidence: c, bbox: { x0, y0: y, x1: x0 + 18, y1: y + height } };
  });
}

describe("selectBrandObservation", () => {
  it("selects a prominent brand-facing line and never the BOTTLED BY producer entity", () => {
    const brandArt = tallLine(
      [
        ["ACME", 92],
        ["RESERVE", 93],
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
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("ACME RESERVE");
    expect(sourceRegion).toBe("full-image");
    // The bottler entity must never surface as the brand or an alternate value.
    const allValues = [observation.value, ...observation.alternates.map((a) => a.value)];
    expect(allValues).not.toContain("OTHER WINERY");
  });

  it("reads pixel words, not any answer key: a different brand line yields that brand", () => {
    const words = tallLine(
      [
        ["ZEPHYR", 92],
        ["HILLS", 92],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("ZEPHYR HILLS");
  });

  it("keeps a single clean brand-region candidate selectable", () => {
    const words = tallLine(
      [
        ["STONE'S", 90],
        ["THROW", 91],
      ],
      10,
      40,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("STONE'S THROW");
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

  it("ignores brand candidates outside the front-label region (mandatory strip)", () => {
    const words = tallLine(
      [
        ["ACME", 92],
        ["RESERVE", 93],
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
