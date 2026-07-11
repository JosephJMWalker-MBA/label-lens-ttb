import { parseWineAlcoholStatement } from "@/domain/rules/wine-alcohol-parse";
import type {
  AnalyzerAlternate,
  AnalyzerFieldObservation,
  EvidenceGeometry,
} from "@/pipeline/analyzer/analyzer.types";

import type { OcrWord, RegionOcrResult } from "./extractor.types";
import { mapBoxToOriginalGeometry, unionGeometry } from "./geometry";

/**
 * Deterministic candidate selection for the two supported fields. Confidence is
 * never a hidden pass/fail gate: it only sets the observation state and ranks
 * candidates, while the extracted value is always preserved. Nothing here
 * emits a rule outcome — that belongs to the deterministic rules.
 */

/** OCR confidence is on a 0–100 scale; normalize to the analyzer's [0,1]. */
export function normalizeConfidence(rawConfidence: number): number {
  if (!Number.isFinite(rawConfidence) || rawConfidence <= 0) return 0;
  return Math.min(1, rawConfidence / 100);
}

/** Mean of token confidences; the field confidence when several tokens combine. */
function aggregateConfidence(words: OcrWord[]): number {
  if (words.length === 0) return 0;
  const sum = words.reduce((acc, w) => acc + normalizeConfidence(w.rawConfidence), 0);
  return sum / words.length;
}

/** Below this normalized confidence, a present value is LOW_CONFIDENCE, not absent. */
const LOW_CONFIDENCE_THRESHOLD = 0.6;
/** Two candidates within this confidence margin are treated as competing. */
const AMBIGUITY_MARGIN = 0.2;

interface Candidate {
  value: string;
  rawText: string;
  confidence: number;
  geometry: EvidenceGeometry;
  words: OcrWord[];
  regionName: string;
}

/** An observation plus the region the selected value came from (for provenance). */
export interface FieldSelection {
  observation: AnalyzerFieldObservation;
  sourceRegion: string | null;
}

/** Normalized comparison key; used to decide if two candidates materially differ. */
function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Two values are corroborating (not competing) when one contains the other. */
function corroborates(a: string, b: string): boolean {
  const ka = key(a);
  const kb = key(b);
  return ka.length > 0 && kb.length > 0 && (ka.includes(kb) || kb.includes(ka));
}

/** Sort words into reading order within a region (top-to-bottom, left-to-right). */
function readingOrder(words: OcrWord[]): OcrWord[] {
  return [...words].sort((a, b) => {
    const ay = (a.bbox.y0 + a.bbox.y1) / 2;
    const by = (b.bbox.y0 + b.bbox.y1) / 2;
    if (Math.abs(ay - by) > 20) return ay - by;
    return a.bbox.x0 - b.bbox.x0;
  });
}

/** Group region words into lines by vertical proximity in processed space. */
function lines(words: OcrWord[]): OcrWord[][] {
  const ordered = readingOrder(words);
  const out: OcrWord[][] = [];
  for (const w of ordered) {
    const wy = (w.bbox.y0 + w.bbox.y1) / 2;
    const line = out.find((l) => {
      const ly = (l[0].bbox.y0 + l[0].bbox.y1) / 2;
      return Math.abs(ly - wy) <= 20;
    });
    if (line) line.push(w);
    else out.push([w]);
  }
  return out.map((l) => [...l].sort((a, b) => a.bbox.x0 - b.bbox.x0));
}

function geometryFor(words: OcrWord[], result: RegionOcrResult): EvidenceGeometry {
  return unionGeometry(words.map((w) => mapBoxToOriginalGeometry(w.bbox, result.transform)));
}

/**
 * Rank candidates and build an observation. A single clear candidate is
 * OBSERVED (or LOW_CONFIDENCE when weak); two materially different candidates of
 * comparable confidence are AMBIGUOUS with ordered alternates; no candidate over
 * processed regions is NOT_OBSERVED.
 */
function buildObservation(
  candidates: Candidate[],
  toAlternate: (c: Candidate) => AnalyzerAlternate,
): FieldSelection {
  if (candidates.length === 0) {
    return {
      observation: { state: "NOT_OBSERVED", value: null, confidence: 0, alternates: [] },
      sourceRegion: null,
    };
  }

  const ranked = [...candidates].sort(
    (a, b) => b.confidence - a.confidence || key(a.value).localeCompare(key(b.value)),
  );
  const best = ranked[0];

  const competing = ranked
    .slice(1)
    .filter(
      (c) =>
        !corroborates(best.value, c.value) && best.confidence - c.confidence <= AMBIGUITY_MARGIN,
    );

  if (competing.length > 0) {
    return {
      observation: {
        state: "AMBIGUOUS",
        value: best.value,
        normalizedValue: best.value,
        rawText: best.rawText,
        confidence: best.confidence,
        geometry: best.geometry,
        alternates: competing.map(toAlternate),
      },
      sourceRegion: best.regionName,
    };
  }

  // Any remaining non-competing candidates (e.g. corroborating substrings) are
  // preserved as ordered alternates without changing the selected value.
  const alternates = ranked.slice(1).map(toAlternate);
  return {
    observation: {
      state: best.confidence < LOW_CONFIDENCE_THRESHOLD ? "LOW_CONFIDENCE" : "OBSERVED",
      value: best.value,
      normalizedValue: best.value,
      rawText: best.rawText,
      confidence: best.confidence,
      geometry: best.geometry,
      alternates,
    },
    sourceRegion: best.regionName,
  };
}

function alternateFrom(c: Candidate): AnalyzerAlternate {
  return { value: c.value, confidence: c.confidence, geometry: c.geometry };
}

// ---------------------------------------------------------------------------
// Alcohol statement: a percentage token plus adjacent volume-marker tokens that
// the committed wine-alcohol parser accepts. Proof is recognized and discarded.
// ---------------------------------------------------------------------------

export function selectAlcoholObservation(results: RegionOcrResult[]): FieldSelection {
  const candidates: Candidate[] = [];
  for (const result of results) {
    for (const line of lines(result.words)) {
      for (let i = 0; i < line.length; i++) {
        if (!/\d/.test(line[i].text) || !line[i].text.includes("%")) continue;
        // Grow the window rightward until the parser accepts a supported form.
        for (let j = i; j < Math.min(line.length, i + 5); j++) {
          const window = line.slice(i, j + 1);
          const rawText = window.map((w) => w.text).join(" ");
          const parsed = parseWineAlcoholStatement(rawText);
          if (parsed.kind === "direct" || parsed.kind === "range") {
            candidates.push({
              value: rawText.replace(/\s+/g, " ").trim(),
              rawText,
              confidence: aggregateConfidence(window),
              geometry: geometryFor(window, result),
              words: window,
              regionName: result.regionName,
            });
            break; // shortest accepted window for this start
          }
          // proof (or still-malformed) never becomes a returned value
        }
      }
    }
  }
  return dedupe(candidates, buildObservation);
}

// ---------------------------------------------------------------------------
// Brand: the producer/bottler entity named after a generic "BOTTLED/PRODUCED BY"
// anchor. This keys off the generic phrase, never the expected brand words.
// ---------------------------------------------------------------------------

const PRODUCER_ANCHOR = /^(?:produced|bottled|made|vinted|cellared)$/i;

export function selectBrandObservation(results: RegionOcrResult[]): FieldSelection {
  const candidates: Candidate[] = [];
  for (const result of results) {
    for (const line of lines(result.words)) {
      const hasAnchor = line.some((w) => PRODUCER_ANCHOR.test(w.text.replace(/[^a-z]/gi, "")));
      const byIndex = line.findIndex((w) => /^by$/i.test(w.text.replace(/[^a-z]/gi, "")));
      if (!hasAnchor || byIndex < 0) continue;
      const entity = line
        .slice(byIndex + 1)
        .filter((w) => /[a-z0-9]/i.test(w.text) && !/^[~•·.]+$/.test(w.text));
      if (entity.length === 0) continue;
      const rawText = entity.map((w) => w.text).join(" ");
      const value = rawText
        .replace(/[^A-Za-z0-9 .&'-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (value.length === 0) continue;
      candidates.push({
        value,
        rawText,
        confidence: aggregateConfidence(entity),
        geometry: geometryFor(entity, result),
        words: entity,
        regionName: result.regionName,
      });
    }
  }
  return dedupe(candidates, buildObservation);
}

/** Collapse duplicate candidate values, keeping the highest-confidence instance. */
function dedupe(
  candidates: Candidate[],
  build: (c: Candidate[], toAlt: (c: Candidate) => AnalyzerAlternate) => FieldSelection,
): FieldSelection {
  const byKey = new Map<string, Candidate>();
  for (const c of candidates) {
    const k = key(c.value);
    const existing = byKey.get(k);
    if (!existing || c.confidence > existing.confidence) byKey.set(k, c);
  }
  return build([...byKey.values()], alternateFrom);
}
