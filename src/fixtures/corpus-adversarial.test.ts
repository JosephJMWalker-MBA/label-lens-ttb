import { describe, expect, it } from "vitest";

import {
  selectAlcoholObservation,
  selectBrandObservation,
} from "@/pipeline/extractor/field-selection";
import type {
  OcrWord,
  RegionOcrResult,
  RegionTransform,
} from "@/pipeline/extractor/extractor.types";

import { loadCorpusIndex, syntheticEntries } from "./corpus-index.load";
import type { CorpusEntry } from "./corpus-index.types";

/**
 * Domain-layer adversarial regression driven by the corpus's synthetic,
 * domain-only entries. The synthetic OCR token lines stand in for pixels; the
 * corpus expectations are the truth used only to assert outcomes — they are
 * never passed into the selectors.
 */

const TRANSFORM: RegionTransform = {
  crop: { left: 0, top: 0, width: 400, height: 400 },
  rotate: 0,
  scale: 1,
  originalWidth: 400,
  originalHeight: 400,
};

/** Build OCR words for one line at a given vertical band with a fixed height. */
function lineWords(tokens: string[], y: number, height: number): OcrWord[] {
  let x = 0;
  return tokens.map((text) => {
    const word: OcrWord = {
      text,
      rawConfidence: 92,
      bbox: { x0: x, y0: y, x1: x + 30, y1: y + height },
    };
    x += 34;
    return word;
  });
}

/** Turn synthetic token lines into a single front-image region. */
function region(lines: string[][], height: number): RegionOcrResult {
  const words = lines.flatMap((tokens, i) => lineWords(tokens, 10 + i * 80, height));
  return { regionName: "full-image", transform: TRANSFORM, words };
}

function brandOf(entry: CorpusEntry) {
  const lines = entry.syntheticEvidence?.brandLines ?? [];
  return selectBrandObservation([region(lines, 40)]).observation;
}

function alcoholOf(entry: CorpusEntry) {
  const lines = entry.syntheticEvidence?.alcoholLines ?? [];
  return selectAlcoholObservation([region(lines, 16)]).observation;
}

describe("corpus adversarial regression (synthetic, domain-only)", () => {
  const entries = syntheticEntries(loadCorpusIndex());

  it("covers a synthetic case for every adversarial and alcohol dimension", () => {
    const tags = new Set(entries.flatMap((e) => e.challengeTags));
    for (const required of [
      "producer-brand-confusion",
      "varietal-confusion",
      "slogan-confusion",
      "website-confusion",
      "vintage-confusion",
      "appellation-confusion",
      "alcohol-direct",
      "alcohol-range",
      "alcohol-malformed",
      "insufficient-evidence",
    ] as const) {
      expect(tags.has(required), `missing synthetic coverage for ${required}`).toBe(true);
    }
  });

  for (const entry of syntheticEntries(loadCorpusIndex())) {
    describe(entry.fixtureId, () => {
      // Synthetic entries are always annotated (never null expectations).
      const exp = entry.expectations!;
      it("brand observation state is within the allowed set", () => {
        const obs = brandOf(entry);
        expect(exp.brandStateAllowed).toContain(obs.state);
      });

      it("never selects a forbidden brand candidate", () => {
        const obs = brandOf(entry);
        const selected = [obs.value, ...obs.alternates.map((a) => a.value)].filter(
          (v): v is string => v !== null,
        );
        for (const forbidden of exp.forbiddenBrandCandidates) {
          // A forbidden candidate may never be the OBSERVED value.
          if (obs.state === "OBSERVED") expect(obs.value).not.toBe(forbidden);
          // And a forbidden candidate excluded outright is not present at all.
          if (exp.brandStateAllowed.length === 1 && exp.brandStateAllowed[0] === "NOT_OBSERVED") {
            expect(selected).not.toContain(forbidden);
          }
        }
      });

      it("selects only a permitted brand candidate when OBSERVED", () => {
        const obs = brandOf(entry);
        if (obs.state === "OBSERVED" && exp.permittedBrandCandidates.length > 0) {
          expect(exp.permittedBrandCandidates).toContain(obs.value);
        }
      });

      it("has bounded geometry for any observed brand value", () => {
        const obs = brandOf(entry);
        if (obs.value !== null && obs.geometry) {
          expect(obs.geometry.width).toBeGreaterThan(0);
          expect(obs.geometry.height).toBeGreaterThan(0);
        }
      });

      it("alcohol observation state is within the allowed set", () => {
        const obs = alcoholOf(entry);
        expect(exp.alcoholStateAllowed).toContain(obs.state);
      });

      it("recovers required alcohol tokens and any exact parsed value", () => {
        const obs = alcoholOf(entry);
        for (const token of exp.requiredAlcoholTokens) {
          expect(obs.value ?? "").toContain(token);
        }
        if (exp.alcoholParsedValue !== null) {
          expect(obs.value).toBe(exp.alcoholParsedValue);
        }
      });
    });
  }
});
