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

describe("selectBrandObservation", () => {
  it("extracts the entity after a generic BOTTLED/PRODUCED BY anchor", () => {
    const words = line(
      [
        ["PRODUCED", 90],
        ["&", 90],
        ["BOTTLED", 92],
        ["BY", 92],
        ["M", 92],
        ["CELLARS", 94],
      ],
      10,
    );
    const { observation, sourceRegion } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("OBSERVED");
    expect(observation.value).toBe("M CELLARS");
    expect(sourceRegion).toBe("full-image");
  });

  it("returns AMBIGUOUS with ordered alternates for two materially different entities", () => {
    const a = line(
      [
        ["BOTTLED", 90],
        ["BY", 90],
        ["ALPHA", 90],
        ["WINES", 90],
      ],
      10,
    );
    const b = line(
      [
        ["PRODUCED", 90],
        ["BY", 90],
        ["BETA", 90],
        ["ESTATE", 90],
      ],
      60,
    );
    const { observation } = selectBrandObservation([region([...a, ...b])]);
    expect(observation.state).toBe("AMBIGUOUS");
    expect(observation.alternates.length).toBeGreaterThanOrEqual(1);
  });

  it("returns NOT_OBSERVED when no producer anchor is present", () => {
    const words = line(
      [
        ["LAKE", 95],
        ["ERIE", 95],
      ],
      10,
    );
    const { observation } = selectBrandObservation([region(words)]);
    expect(observation.state).toBe("NOT_OBSERVED");
  });
});
