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
  /** Original-space text height; a typographic prominence proxy for brand art. */
  prominence: number;
  /**
   * Conservative brand classification of the line (brand selection only).
   * "excluded" lines are never brand evidence; "positive" lines carry an
   * explicit brand-presentation signal; "plausible" lines are front-facing but
   * not positively distinguishable as a brand. Undefined for non-brand fields.
   */
  brandClass?: BrandClass;
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
            const geometry = geometryFor(window, result);
            candidates.push({
              value: rawText.replace(/\s+/g, " ").trim(),
              rawText,
              confidence: aggregateConfidence(window),
              geometry,
              words: window,
              regionName: result.regionName,
              prominence: geometry.height,
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
// Brand: the most prominent brand-facing artwork line on the front label.
//
// Producer/bottler identity ("PRODUCED & BOTTLED BY …") is deliberately NOT
// treated as brand evidence — the bottler may differ from the label brand — so
// any line naming a producer/bottler entity is excluded outright. Mandatory
// regulatory text (alcohol, government warning, net contents, sulfites) is not
// brand presentation and is likewise excluded. Selection reads only the pixels'
// words and their typographic prominence; it never consults the expected/
// declared brand, the fixture filename, TTB id, hash, or dimensions.
// ---------------------------------------------------------------------------

/** Producer/bottler wording. A line pairing one of these with "by" is not brand. */
const PRODUCER_WORD = /^(?:produced|bottled|made|vinted|cellared|grown|packed|blended)$/i;
/** Non-brand mandatory/regulatory or measurement wording that cannot be a brand. */
const NON_BRAND_LINE =
  /\b(?:alcohol|alc|vol|volume|proof|government|warning|surgeon|general|pregnancy|contains|sulfites|net|contents|ml|milliliters?|liters?|litres?|imported|distributed|appellation)\b/i;
/** The brand appears on the front-label artwork region, not the mandatory strip. */
const BRAND_REGION = "full-image";
/** Two candidates whose text height is within this ratio compete as ambiguous. */
const BRAND_PROMINENCE_RATIO = 0.8;
/** A brand mark is short; longer lines are prose/back-label copy, not a brand. */
const MAX_BRAND_WORDS = 4;

/**
 * Conservative brand-line classification:
 *  - "excluded": positively identifiable as NOT brand presentation (domain/URL
 *    syntax, or a line that is entirely wine varietal/designation wording).
 *  - "positive": carries an explicit brand-presentation signal (a possessive
 *    mark or a recognized brand-entity designator).
 *  - "plausible": a front-facing line that could be a brand but is not
 *    positively distinguishable as one (a slogan, appellation, decorative or
 *    otherwise unclassified short line).
 */
type BrandClass = "excluded" | "positive" | "plausible";

/**
 * Recognized wine varietal and designation wording. A line composed only of
 * these tokens is a varietal/designation statement, not a brand presentation.
 * (Recognition is used solely to withhold brand evidence — it never emits a
 * varietal/designation finding, which is out of this slice's scope.)
 */
const VARIETAL_OR_DESIGNATION = new Set([
  "cabernet",
  "sauvignon",
  "merlot",
  "chardonnay",
  "pinot",
  "noir",
  "grigio",
  "gris",
  "zinfandel",
  "syrah",
  "shiraz",
  "malbec",
  "riesling",
  "semillon",
  "tempranillo",
  "sangiovese",
  "nebbiolo",
  "grenache",
  "viognier",
  "chenin",
  "blanc",
  "rose",
  "moscato",
  "muscat",
  "gewurztraminer",
  "blend",
  "red",
  "white",
  "reserve",
  "reserva",
  "vintage",
  "brut",
  "rouge",
  "wine",
  "table",
]);

/**
 * Recognized brand-entity designators. Their presence is an explicit positive
 * signal that a short front-facing line is a brand presentation rather than a
 * slogan, varietal, or decorative phrase.
 */
const BRAND_DESIGNATOR = new Set([
  "cellars",
  "cellar",
  "estate",
  "estates",
  "vineyard",
  "vineyards",
  "winery",
  "wineries",
]);

function stripWord(text: string): string {
  return text.replace(/[^a-z]/gi, "");
}

/** Word tokens of a cleaned brand value (letters/digits only), lowercased. */
function brandTokens(value: string): string[] {
  return value
    .split(" ")
    .map((t) => t.replace(/[^a-z0-9]/gi, "").toLowerCase())
    .filter((t) => t.length > 0);
}

/** Obvious domain/URL syntax (e.g. ACME.COM, www.acme.wine) is never a brand. */
function isDomainLike(value: string): boolean {
  if (/^(?:https?:\/\/|www\.)/i.test(value.trim())) return true;
  return value
    .split(" ")
    .some((token) => /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(token.trim()));
}

/** A line whose every alphabetic token is varietal/designation wording. */
function isPurelyVarietalOrDesignation(value: string): boolean {
  const alpha = brandTokens(value).filter((t) => /[a-z]/.test(t));
  return alpha.length > 0 && alpha.every((t) => VARIETAL_OR_DESIGNATION.has(t));
}

/** An explicit positive brand signal: a possessive mark or a brand designator. */
function hasPositiveBrandSignal(value: string): boolean {
  if (/[a-z]['’]s\b/i.test(value)) return true;
  return brandTokens(value).some((t) => BRAND_DESIGNATOR.has(t));
}

/** Conservatively classify a cleaned brand-line value. */
function classifyBrandLine(value: string): BrandClass {
  if (isDomainLike(value)) return "excluded";
  if (isPurelyVarietalOrDesignation(value)) return "excluded";
  if (hasPositiveBrandSignal(value)) return "positive";
  return "plausible";
}

/** A producer/bottler line ("… BOTTLED BY …") names an entity, not the brand. */
function isProducerLine(line: OcrWord[]): boolean {
  const hasProducerWord = line.some((w) => PRODUCER_WORD.test(stripWord(w.text)));
  const hasBy = line.some((w) => /^by$/i.test(stripWord(w.text)));
  return hasProducerWord && hasBy;
}

export function selectBrandObservation(results: RegionOcrResult[]): FieldSelection {
  const candidates: Candidate[] = [];
  for (const result of results) {
    // Brand presentation lives on the front-label artwork, never the mandatory
    // vertical strip; restricting the region keeps regulatory text out of brand.
    if (result.regionName !== BRAND_REGION) continue;
    for (const line of lines(result.words)) {
      if (isProducerLine(line)) continue;
      const rawText = line.map((w) => w.text).join(" ");
      if (NON_BRAND_LINE.test(rawText)) continue;
      const value = rawText
        .replace(/[^A-Za-z0-9 .&'-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      // Require at least one real letter so vintages/measurements are not brands.
      if (value.length < 2 || !/[a-z]/i.test(value)) continue;
      // A brand mark is short; longer lines are back-label prose, not a brand.
      if (value.split(" ").length > MAX_BRAND_WORDS) continue;
      // Positively-not-brand lines (domain syntax, pure varietal/designation)
      // are never selectable brand evidence, not even as alternates.
      const brandClass = classifyBrandLine(value);
      if (brandClass === "excluded") continue;
      const geometry = geometryFor(line, result);
      candidates.push({
        value,
        rawText,
        confidence: aggregateConfidence(line),
        geometry,
        words: line,
        regionName: result.regionName,
        prominence: geometry.height,
        brandClass,
      });
    }
  }
  return dedupeBy(candidates, buildBrandObservation);
}

/**
 * Build a brand observation ranked by typographic prominence (largest artwork
 * wins), then confidence. Two non-corroborating candidates of comparable
 * prominence are AMBIGUOUS rather than a silent pick; none is NOT_OBSERVED.
 */
function buildBrandObservation(candidates: Candidate[]): FieldSelection {
  if (candidates.length === 0) {
    return {
      observation: { state: "NOT_OBSERVED", value: null, confidence: 0, alternates: [] },
      sourceRegion: null,
    };
  }

  const ranked = [...candidates].sort(
    (a, b) =>
      b.prominence - a.prominence ||
      b.confidence - a.confidence ||
      key(a.value).localeCompare(key(b.value)),
  );
  const best = ranked[0];

  const competing = ranked
    .slice(1)
    .filter(
      (c) =>
        !corroborates(best.value, c.value) &&
        c.prominence >= best.prominence * BRAND_PROMINENCE_RATIO,
    );

  // A brand is AMBIGUOUS when another candidate rivals it in prominence, or when
  // the leading candidate is only weakly recognized yet other candidates remain:
  // a low-confidence lead among rivals is not a safe silent pick. This is what
  // keeps noisy front-label OCR (no cleanly isolated brand mark) from fabricating
  // a confident brand — a human decides instead.
  const weakContestedLead = best.confidence < LOW_CONFIDENCE_THRESHOLD && ranked.length > 1;

  if (competing.length > 0 || weakContestedLead) {
    const alternates = (competing.length > 0 ? competing : ranked.slice(1)).map(alternateFrom);
    return {
      observation: {
        state: "AMBIGUOUS",
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

  // Conservative authority gate: an uncontested leading candidate becomes
  // authoritative OBSERVED brand evidence only when it carries an explicit
  // positive brand signal and clears the confidence floor. A plausible but not
  // positively distinguishable line (a slogan, appellation, or decorative
  // phrase) stays AMBIGUOUS — its value, geometry, and alternates are preserved
  // for a human, but it never silently drives a brand match.
  const positivelyDistinguished =
    best.brandClass === "positive" && best.confidence >= LOW_CONFIDENCE_THRESHOLD;
  if (!positivelyDistinguished) {
    return {
      observation: {
        state: "AMBIGUOUS",
        value: best.value,
        normalizedValue: best.value,
        rawText: best.rawText,
        confidence: best.confidence,
        geometry: best.geometry,
        alternates: ranked.slice(1).map(alternateFrom),
      },
      sourceRegion: best.regionName,
    };
  }

  return {
    observation: {
      state: "OBSERVED",
      value: best.value,
      normalizedValue: best.value,
      rawText: best.rawText,
      confidence: best.confidence,
      geometry: best.geometry,
      alternates: ranked.slice(1).map(alternateFrom),
    },
    sourceRegion: best.regionName,
  };
}

/** Collapse duplicate candidate values, keeping the highest-confidence instance. */
function dedupe(
  candidates: Candidate[],
  build: (c: Candidate[], toAlt: (c: Candidate) => AnalyzerAlternate) => FieldSelection,
): FieldSelection {
  return build(dedupeCandidates(candidates), alternateFrom);
}

/** As `dedupe`, for a builder that supplies its own alternate mapping. */
function dedupeBy(
  candidates: Candidate[],
  build: (c: Candidate[]) => FieldSelection,
): FieldSelection {
  return build(dedupeCandidates(candidates));
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const c of candidates) {
    const k = key(c.value);
    const existing = byKey.get(k);
    if (!existing || c.confidence > existing.confidence) byKey.set(k, c);
  }
  return [...byKey.values()];
}
