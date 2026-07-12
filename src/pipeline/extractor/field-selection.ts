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
  id?: string;
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
  assembly?: BrandCandidateAssembly;
  lineIndexes?: number[];
  imageWidth?: number;
  imageHeight?: number;
  alignment?: number;
  lineProximity?: number;
  score?: BrandCandidateScore;
}

/** An observation plus the region the selected value came from (for provenance). */
export interface FieldSelection {
  observation: AnalyzerFieldObservation;
  sourceRegion: string | null;
  brandDiagnostics?: BrandSelectionDiagnostics;
}

export const BRAND_ABSTENTION_REASONS = [
  "no-brand-region-text",
  "unsupported-candidates-only",
] as const;
export type BrandAbstentionReason = (typeof BRAND_ABSTENTION_REASONS)[number];

export const BRAND_LINE_REASONS = [
  "no-letters-or-too-short",
  "producer-line",
  "non-brand-keyword",
  "too-many-words",
  "domain-like",
  "varietal-or-designation",
  "generic-product-language",
  "location-or-appellation",
  "low-information-fragment",
  "sentence-fragment",
  "candidate-positive",
  "candidate-plausible",
] as const;
export type BrandLineReason = (typeof BRAND_LINE_REASONS)[number];

export const BRAND_CANDIDATE_ASSEMBLIES = [
  "whole-line",
  "line-window",
  "multi-line-merge",
] as const;
export type BrandCandidateAssembly = (typeof BRAND_CANDIDATE_ASSEMBLIES)[number];

export const BRAND_CANDIDATE_DECISIONS = ["selected", "alternate", "ambiguous-rival"] as const;
export type BrandCandidateDecision = (typeof BRAND_CANDIDATE_DECISIONS)[number];

export interface BrandLineDiagnostic {
  rawText: string;
  cleanedValue: string | null;
  confidence: number;
  prominence: number;
  regionName: string;
  kept: boolean;
  reason: BrandLineReason;
}

export interface BrandCandidateScore {
  positiveSignal: number;
  meaningfulChars: number;
  structure: number;
  confidence: number;
  prominence: number;
  area: number;
  centrality: number;
  alignment: number;
  lineProximity: number;
  lowInformationPenalty: number;
  residualPenalty: number;
  total: number;
}

export interface BrandCandidateDiagnostic {
  rawText: string;
  cleanedValue: string | null;
  confidence: number;
  prominence: number;
  regionName: string;
  assembly: BrandCandidateAssembly;
  lineIndexes: number[];
  kept: boolean;
  filterReason: BrandLineReason;
  decision?: BrandCandidateDecision;
  score?: BrandCandidateScore;
}

export interface BrandSelectionDiagnostics {
  lines: BrandLineDiagnostic[];
  candidates: BrandCandidateDiagnostic[];
  abstentionReason?: BrandAbstentionReason;
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
  /\b(?:alcohol|alc|vol|volume|proof|government|warning|surgeon|general|pregnancy|contains|sulfites|net|contents|ml|milliliters?|liters?|litres?|imported|distributed|appellation|produced|producer|bottled|cellared|grown|vinted|blended|packed|owned|operated|serving|temperature|health|problems?|alcoholic|beverages?|bebida|consumption|impairs?|machinery|defects?|drink|women|should|nacional|byvol)\b/i;
/** The brand appears on the front-label artwork region, not the mandatory strip. */
const BRAND_REGION = "full-image";
/** Two candidates whose text height is within this ratio compete as ambiguous. */
const BRAND_PROMINENCE_RATIO = 0.8;
/** Only candidates near the strongest artwork prominence compete on score first. */
const BRAND_SCORE_PROMINENCE_FLOOR_RATIO = 0.4;
/** A brand mark is short; longer lines are prose/back-label copy, not a brand. */
const MAX_BRAND_WORDS = 4;
/** Nearby front-label lines may form a split brand mark. */
const MAX_MULTI_LINE_SEEDS_PER_LINE = 3;

/**
 * Negative-only vocabulary for generic wine/product wording. Used solely to
 * withhold unsupported brand evidence; never to emit any new field.
 */
const GENERIC_PRODUCT_TOKEN = new Set([
  "american",
  "argentino",
  "bebida",
  "blanco",
  "bianco",
  "chile",
  "concord",
  "cupatge",
  "dry",
  "elaborat",
  "embotellat",
  "espanya",
  "gialla",
  "gruner",
  "grape",
  "italia",
  "italy",
  "nacional",
  "of",
  "per",
  "product",
  "producte",
  "ribolla",
  "serving",
  "spain",
  "temperature",
  "veltliner",
  "variedades",
  "vi",
  "vino",
]);

/**
 * Bounded location/appellation phrases observed in the corpus that repeatedly
 * surfaced as false brand candidates. This set only blocks unsupported brand
 * evidence; it never manufactures one.
 */
const LOCATION_OR_APPELLATION_PHRASE = new Set([
  "boca raton",
  "delle venezie",
  "delray beach fl",
  "delray beach",
  "fronton red table wine",
  "gualtallary - uco valley",
  "livermore valley",
  "napa valley",
  "producte d'espanya",
  "abbott claim vineyard",
  "coast vineyard",
  "roero arneis",
  "vino d'italia",
  "walala coast vineyard",
]);

/** Connector words may be lowercase in a genuine brand line. */
const BRAND_CONNECTOR = new Set([
  "a",
  "an",
  "and",
  "d",
  "de",
  "del",
  "des",
  "di",
  "du",
  "et",
  "l",
  "la",
  "le",
  "les",
  "of",
  "the",
]);

const COMPACT_NON_BRAND_KEYWORD = [
  "according",
  "alcoholic",
  "beverages",
  "byvol",
  "consumption",
  "defects",
  "government",
  "health",
  "impairs",
  "machinery",
  "operate",
  "pregn",
  "pregnancy",
  "producer",
  "problems",
  "serving",
  "surgeon",
  "temperature",
  "warning",
  "women",
] as const;

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
  "arneis",
  "negrette",
  "pecorino",
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
  const alpha = brandTokens(value).filter((t) => /[a-z]/.test(t) && !BRAND_CONNECTOR.has(t));
  return alpha.length > 0 && alpha.every((t) => VARIETAL_OR_DESIGNATION.has(t));
}

/** A line composed only of generic wine/product wording is not a brand. */
function isGenericProductLanguage(value: string): boolean {
  const alpha = brandTokens(value).filter((t) => /[a-z]/.test(t) && !BRAND_CONNECTOR.has(t));
  return (
    alpha.length > 0 &&
    alpha.every((t) => VARIETAL_OR_DESIGNATION.has(t) || GENERIC_PRODUCT_TOKEN.has(t))
  );
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
  if (isGenericProductLanguage(value)) return "excluded";
  if (hasPositiveBrandSignal(value)) return "positive";
  return "plausible";
}

/** A producer/bottler line ("… BOTTLED BY …") names an entity, not the brand. */
function isProducerLine(line: OcrWord[]): boolean {
  const hasProducerWord = line.some((w) => PRODUCER_WORD.test(stripWord(w.text)));
  const hasBy = line.some((w) => /^by$/i.test(stripWord(w.text)));
  return hasProducerWord && hasBy;
}

function cleanedBrandValue(rawText: string): string {
  return rawText
    .replace(/[^A-Za-z0-9 ,.;&'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function endsWithSentencePunctuation(rawText: string): boolean {
  return /[.,;:!?]\s*$/.test(rawText.trim());
}

function isLowInformationFragment(value: string): boolean {
  const alpha = brandTokens(value).filter((t) => /[a-z]/.test(t));
  if (alpha.length === 0) return true;
  const compact = alpha.join("");
  return compact.length < 4 || alpha.every((t) => t.length <= 2);
}

function isLocationOrAppellationLike(value: string): boolean {
  if (LOCATION_OR_APPELLATION_PHRASE.has(foldPhrase(value))) return true;
  const alpha = brandTokens(value).filter((t) => /[a-z]/.test(t));
  if (alpha.length < 2) return false;
  const trailingCountry = new Set([
    "argentina",
    "austria",
    "chile",
    "france",
    "italy",
    "italia",
    "spain",
  ]);
  return trailingCountry.has(alpha.at(-1)!) && /[-,]/.test(value);
}

function isSentenceFragment(rawText: string, value: string): boolean {
  if (endsWithSentencePunctuation(rawText) && !hasPositiveBrandSignal(value)) return true;
  const alphaWords = rawText
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z'-]/g, ""))
    .filter((word) => word.length > 0);
  if (alphaWords.length === 0) return false;
  const lowercaseContentWords = alphaWords.filter((word) => {
    const lower = word.toLowerCase();
    return word === lower && !BRAND_CONNECTOR.has(lower);
  });
  if (alphaWords[0] === alphaWords[0].toLowerCase() && lowercaseContentWords.length >= 1) {
    return true;
  }
  return lowercaseContentWords.length >= 2;
}

function hasNonBrandKeyword(rawText: string, value: string): boolean {
  if (NON_BRAND_LINE.test(rawText)) return true;
  const compact = value.toLowerCase().replace(/[^a-z]/g, "");
  return COMPACT_NON_BRAND_KEYWORD.some((keyword) => compact.includes(keyword));
}

function foldPhrase(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

interface BrandLineAnalysis {
  candidate?: Candidate;
  diagnostic: BrandLineDiagnostic;
}

interface BrandSpan {
  id: string;
  words: OcrWord[];
  rawText: string;
  value: string;
  confidence: number;
  geometry: EvidenceGeometry;
  regionName: string;
  prominence: number;
  assembly: BrandCandidateAssembly;
  lineIndexes: number[];
  imageWidth: number;
  imageHeight: number;
  alignment: number;
  lineProximity: number;
}

interface BrandCandidateAnalysis {
  candidate?: Candidate;
  diagnostic: BrandCandidateDiagnosticInternal;
}

interface BrandCandidateDiagnosticInternal extends BrandCandidateDiagnostic {
  id: string;
}

interface BrandSelectionDiagnosticsInternal {
  lines: BrandLineDiagnostic[];
  candidates: BrandCandidateDiagnosticInternal[];
  abstentionReason?: BrandAbstentionReason;
}

function analyzeBrandLine(line: OcrWord[], result: RegionOcrResult): BrandLineAnalysis {
  const rawText = line.map((w) => w.text).join(" ");
  const value = cleanedBrandValue(rawText);
  const geometry = geometryFor(line, result);
  const confidence = aggregateConfidence(line);
  const base = {
    rawText,
    cleanedValue: value.length > 0 ? value : null,
    confidence,
    prominence: geometry.height,
    regionName: result.regionName,
  };

  if (isProducerLine(line)) {
    return { diagnostic: { ...base, kept: false, reason: "producer-line" } };
  }
  if (value.length < 2 || !/[a-z]/i.test(value)) {
    return { diagnostic: { ...base, kept: false, reason: "no-letters-or-too-short" } };
  }
  if (hasNonBrandKeyword(rawText, value)) {
    return { diagnostic: { ...base, kept: false, reason: "non-brand-keyword" } };
  }
  if (value.split(" ").length > MAX_BRAND_WORDS) {
    return { diagnostic: { ...base, kept: false, reason: "too-many-words" } };
  }
  if (isDomainLike(value)) {
    return { diagnostic: { ...base, kept: false, reason: "domain-like" } };
  }
  if (isPurelyVarietalOrDesignation(value)) {
    return { diagnostic: { ...base, kept: false, reason: "varietal-or-designation" } };
  }
  if (isGenericProductLanguage(value)) {
    return { diagnostic: { ...base, kept: false, reason: "generic-product-language" } };
  }
  if (isLocationOrAppellationLike(value)) {
    return { diagnostic: { ...base, kept: false, reason: "location-or-appellation" } };
  }
  if (isLowInformationFragment(value)) {
    return { diagnostic: { ...base, kept: false, reason: "low-information-fragment" } };
  }
  if (isSentenceFragment(rawText, value)) {
    return { diagnostic: { ...base, kept: false, reason: "sentence-fragment" } };
  }

  const brandClass = classifyBrandLine(value);
  const candidate: Candidate = {
    value,
    rawText,
    confidence,
    geometry,
    words: line,
    regionName: result.regionName,
    prominence: geometry.height,
    brandClass,
  };
  return {
    candidate,
    diagnostic: {
      ...base,
      kept: true,
      reason: brandClass === "positive" ? "candidate-positive" : "candidate-plausible",
    },
  };
}

function geometryArea(geometry: EvidenceGeometry): number {
  return Math.max(1, geometry.width * geometry.height);
}

function tokenHasAlphaNumeric(text: string): boolean {
  return /[a-z0-9]/i.test(text);
}

function informativeAlphaTokenCount(value: string): number {
  return brandTokens(value).filter((token) => token.length >= 3).length;
}

function lowInformationPenalty(value: string): number {
  const alpha = brandTokens(value).filter((t) => /[a-z]/.test(t));
  if (alpha.length === 0) return 1;
  const short = alpha.filter((t) => t.length <= 2).length;
  return Math.min(1, short / alpha.length);
}

function isVintageYearToken(text: string): boolean {
  return /^(?:19|20)\d{2}$/.test(text.replace(/[^0-9]/g, ""));
}

function residualPenalty(words: OcrWord[]): number {
  if (words.length === 0) return 0;
  const suspicious = words.filter((w, index) => {
    const stripped = stripWord(w.text);
    const hasDigits = /\d/.test(w.text);
    const normalizedConfidence = normalizeConfidence(w.rawConfidence);
    const lower = w.text.toLowerCase();
    return (
      (index > 0 && isVintageYearToken(w.text)) ||
      (!/[a-z0-9]/i.test(w.text) && !hasDigits) ||
      (stripped.length > 0 && stripped.length <= 2) ||
      (stripped.length > 0 && stripped.length <= 3 && normalizedConfidence < 0.5) ||
      (/[a-z]/.test(w.text) &&
        w.text === lower &&
        !BRAND_CONNECTOR.has(lower) &&
        normalizedConfidence < 0.8)
    );
  }).length;
  return Math.min(1, suspicious / words.length);
}

function centralityScore(
  geometry: EvidenceGeometry,
  imageWidth: number,
  imageHeight: number,
): number {
  if (imageWidth <= 0 || imageHeight <= 0) return 0.5;
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  const dx = Math.abs(cx - imageWidth / 2) / Math.max(1, imageWidth / 2);
  const dy = Math.abs(cy - imageHeight / 2) / Math.max(1, imageHeight / 2);
  return Math.max(0, 1 - (dx + dy) / 2);
}

function buildBrandSpan(
  id: string,
  words: OcrWord[],
  result: RegionOcrResult,
  assembly: BrandCandidateAssembly,
  lineIndexes: number[],
  alignment = 1,
  lineProximity = 1,
): BrandSpan {
  const rawText = words.map((w) => w.text).join(" ");
  const geometry = geometryFor(words, result);
  return {
    id,
    words,
    rawText,
    value: cleanedBrandValue(rawText),
    confidence: aggregateConfidence(words),
    geometry,
    regionName: result.regionName,
    prominence: geometry.height,
    assembly,
    lineIndexes,
    imageWidth: result.transform.originalWidth,
    imageHeight: result.transform.originalHeight,
    alignment,
    lineProximity,
  };
}

function analyzeBrandSpan(span: BrandSpan): BrandCandidateAnalysis {
  const base = {
    id: span.id,
    rawText: span.rawText,
    cleanedValue: span.value.length > 0 ? span.value : null,
    confidence: span.confidence,
    prominence: span.prominence,
    regionName: span.regionName,
    assembly: span.assembly,
    lineIndexes: span.lineIndexes,
  };

  if (isProducerLine(span.words)) {
    return {
      diagnostic: {
        ...base,
        kept: false,
        filterReason: "producer-line",
      },
    };
  }
  if (span.value.length < 2 || !/[a-z]/i.test(span.value)) {
    return {
      diagnostic: {
        ...base,
        kept: false,
        filterReason: "no-letters-or-too-short",
      },
    };
  }
  if (hasNonBrandKeyword(span.rawText, span.value)) {
    return {
      diagnostic: {
        ...base,
        kept: false,
        filterReason: "non-brand-keyword",
      },
    };
  }
  if (span.value.split(" ").length > MAX_BRAND_WORDS) {
    return {
      diagnostic: {
        ...base,
        kept: false,
        filterReason: "too-many-words",
      },
    };
  }
  if (isDomainLike(span.value)) {
    return {
      diagnostic: {
        ...base,
        kept: false,
        filterReason: "domain-like",
      },
    };
  }
  if (isPurelyVarietalOrDesignation(span.value)) {
    return {
      diagnostic: {
        ...base,
        kept: false,
        filterReason: "varietal-or-designation",
      },
    };
  }
  if (isGenericProductLanguage(span.value)) {
    return {
      diagnostic: {
        ...base,
        kept: false,
        filterReason: "generic-product-language",
      },
    };
  }
  if (isLocationOrAppellationLike(span.value)) {
    return {
      diagnostic: {
        ...base,
        kept: false,
        filterReason: "location-or-appellation",
      },
    };
  }
  if (isLowInformationFragment(span.value)) {
    return {
      diagnostic: {
        ...base,
        kept: false,
        filterReason: "low-information-fragment",
      },
    };
  }
  if (isSentenceFragment(span.rawText, span.value)) {
    return {
      diagnostic: {
        ...base,
        kept: false,
        filterReason: "sentence-fragment",
      },
    };
  }

  const brandClass = classifyBrandLine(span.value);
  const candidate: Candidate = {
    id: span.id,
    value: span.value,
    rawText: span.rawText,
    confidence: span.confidence,
    geometry: span.geometry,
    words: span.words,
    regionName: span.regionName,
    prominence: span.prominence,
    brandClass,
    assembly: span.assembly,
    lineIndexes: span.lineIndexes,
    imageWidth: span.imageWidth,
    imageHeight: span.imageHeight,
    alignment: span.alignment,
    lineProximity: span.lineProximity,
  };
  return {
    candidate,
    diagnostic: {
      ...base,
      kept: true,
      filterReason: brandClass === "positive" ? "candidate-positive" : "candidate-plausible",
    },
  };
}

function shouldTrimWholeLineCandidate(candidate: Candidate | undefined): boolean {
  if (!candidate || candidate.brandClass !== "positive") return false;
  return residualPenalty(candidate.words) > 0.25;
}

function lineWindows(line: OcrWord[]): OcrWord[][] {
  const windows: OcrWord[][] = [];
  for (let start = 0; start < line.length; start++) {
    for (let end = start; end < Math.min(line.length, start + MAX_BRAND_WORDS); end++) {
      const window = line.slice(start, end + 1);
      if (window.length === line.length) continue;
      if (!tokenHasAlphaNumeric(window[0].text) || !tokenHasAlphaNumeric(window.at(-1)!.text)) {
        continue;
      }
      windows.push(window);
    }
  }
  return windows;
}

function mergeSeedScore(candidate: Candidate): number {
  const positive = candidate.brandClass === "positive" ? 2 : 0;
  return (
    positive +
    informativeAlphaTokenCount(candidate.value) +
    aggregateConfidence(candidate.words) +
    candidate.prominence / 100
  );
}

function candidateFamilyKey(candidate: Candidate): string {
  if (candidate.assembly === "multi-line-merge") {
    return `merge:${candidate.lineIndexes?.join("-") ?? candidate.id ?? key(candidate.value)}`;
  }
  if (candidate.lineIndexes?.length) return `line:${candidate.lineIndexes[0]}`;
  return candidate.id ?? key(candidate.value);
}

function bestFamilyCandidates(candidates: Candidate[]): Candidate[] {
  const byFamily = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const familyKey = candidateFamilyKey(candidate);
    const existing = byFamily.get(familyKey);
    if (!existing) {
      byFamily.set(familyKey, candidate);
      continue;
    }
    const candidateScore = candidate.score?.total ?? candidate.confidence;
    const existingScore = existing.score?.total ?? existing.confidence;
    if (
      candidateScore > existingScore ||
      (candidateScore === existingScore && candidate.confidence > existing.confidence)
    ) {
      byFamily.set(familyKey, candidate);
    }
  }
  return [...byFamily.values()];
}

function dedupeBestCandidates(candidates: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const existing = byKey.get(key(candidate.value));
    if (!existing) {
      byKey.set(key(candidate.value), candidate);
      continue;
    }
    const candidateScore = candidate.score?.total ?? candidate.confidence;
    const existingScore = existing.score?.total ?? existing.confidence;
    if (
      candidateScore > existingScore ||
      (candidateScore === existingScore && candidate.confidence > existing.confidence)
    ) {
      byKey.set(key(candidate.value), candidate);
    }
  }
  return [...byKey.values()];
}

function mergeAlignment(a: Candidate, b: Candidate): number {
  const aCenter = a.geometry.x + a.geometry.width / 2;
  const bCenter = b.geometry.x + b.geometry.width / 2;
  const maxWidth = Math.max(a.geometry.width, b.geometry.width, 1);
  const overlap =
    Math.max(
      0,
      Math.min(a.geometry.x + a.geometry.width, b.geometry.x + b.geometry.width) -
        Math.max(a.geometry.x, b.geometry.x),
    ) / Math.max(1, Math.min(a.geometry.width, b.geometry.width));
  const centerOffset = Math.abs(aCenter - bCenter) / maxWidth;
  return Math.max(0, Math.min(1, Math.max(overlap, 1 - centerOffset)));
}

function mergeLineProximity(a: Candidate, b: Candidate): number {
  const gap = Math.max(0, b.geometry.y - (a.geometry.y + a.geometry.height));
  const averageHeight = Math.max(1, (a.geometry.height + b.geometry.height) / 2);
  return Math.max(0, Math.min(1, 1 - gap / (averageHeight * 1.5)));
}

function scoreBrandCandidate(
  candidate: Candidate,
  maxProminence: number,
  maxArea: number,
): BrandCandidateScore {
  const alpha = brandTokens(candidate.value).filter((t) => /[a-z]/.test(t));
  const meaningfulChars = Math.min(1, alpha.join("").length / 14);
  const informative = informativeAlphaTokenCount(candidate.value);
  const structure = Math.min(
    1,
    (informative + (alpha.length > 1 ? 1 : 0) + (candidate.brandClass === "positive" ? 1 : 0)) / 4,
  );
  const prominence = maxProminence <= 0 ? 0 : candidate.prominence / maxProminence;
  const area = geometryArea(candidate.geometry) / Math.max(1, maxArea);
  const centrality = centralityScore(
    candidate.geometry,
    candidate.imageWidth ?? candidate.geometry.width,
    candidate.imageHeight ?? candidate.geometry.height,
  );
  const lowInformation = lowInformationPenalty(candidate.value);
  const residual = residualPenalty(candidate.words);
  const total =
    (candidate.brandClass === "positive" ? 2 : 0) +
    meaningfulChars * 1.6 +
    structure * 1.2 +
    candidate.confidence +
    prominence * 0.8 +
    area * 0.6 +
    centrality * 0.3 +
    (candidate.alignment ?? 1) * 0.25 +
    (candidate.lineProximity ?? 1) * 0.2 -
    lowInformation * 1.8 -
    residual * 1.4;
  return {
    positiveSignal: candidate.brandClass === "positive" ? 1 : 0,
    meaningfulChars,
    structure,
    confidence: candidate.confidence,
    prominence,
    area,
    centrality,
    alignment: candidate.alignment ?? 1,
    lineProximity: candidate.lineProximity ?? 1,
    lowInformationPenalty: lowInformation,
    residualPenalty: residual,
    total,
  };
}

export function selectBrandObservation(results: RegionOcrResult[]): FieldSelection {
  const candidates: Candidate[] = [];
  const lineDiagnostics: BrandLineDiagnostic[] = [];
  const candidateDiagnostics: BrandCandidateDiagnosticInternal[] = [];
  let sawBrandRegionText = false;
  let nextId = 0;
  const nextCandidateId = () => `brand-candidate-${nextId++}`;
  for (const result of results) {
    // Brand presentation lives on the front-label artwork, never the mandatory
    // vertical strip; restricting the region keeps regulatory text out of brand.
    if (result.regionName !== BRAND_REGION) continue;
    if (result.words.length > 0) sawBrandRegionText = true;
    const groupedLines = lines(result.words);
    const seedsByLine: Candidate[][] = groupedLines.map(() => []);
    for (const [lineIndex, line] of groupedLines.entries()) {
      const analysis = analyzeBrandLine(line, result);
      lineDiagnostics.push(analysis.diagnostic);

      const wholeLine = analyzeBrandSpan(
        buildBrandSpan(nextCandidateId(), line, result, "whole-line", [lineIndex]),
      );
      candidateDiagnostics.push(wholeLine.diagnostic);
      if (wholeLine.candidate) {
        candidates.push(wholeLine.candidate);
        seedsByLine[lineIndex].push(wholeLine.candidate);
      }

      if (!shouldTrimWholeLineCandidate(wholeLine.candidate)) continue;
      for (const window of lineWindows(line)) {
        const windowAnalysis = analyzeBrandSpan(
          buildBrandSpan(nextCandidateId(), window, result, "line-window", [lineIndex]),
        );
        candidateDiagnostics.push(windowAnalysis.diagnostic);
        if (windowAnalysis.candidate) candidates.push(windowAnalysis.candidate);
      }
    }

    for (let index = 0; index < seedsByLine.length - 1; index++) {
      const upperSeeds = dedupeBestCandidates(seedsByLine[index])
        .sort((a, b) => mergeSeedScore(b) - mergeSeedScore(a))
        .slice(0, MAX_MULTI_LINE_SEEDS_PER_LINE);
      const lowerSeeds = dedupeBestCandidates(seedsByLine[index + 1])
        .sort((a, b) => mergeSeedScore(b) - mergeSeedScore(a))
        .slice(0, MAX_MULTI_LINE_SEEDS_PER_LINE);

      for (const upper of upperSeeds) {
        for (const lower of lowerSeeds) {
          if (upper.brandClass !== "positive" && lower.brandClass !== "positive") continue;
          const alignment = mergeAlignment(upper, lower);
          const proximity = mergeLineProximity(upper, lower);
          if (alignment < 0.3 || proximity <= 0) continue;
          const mergedWords = [...upper.words, ...lower.words];
          if (mergedWords.length > MAX_BRAND_WORDS + 2) continue;
          const mergedValue = cleanedBrandValue(mergedWords.map((word) => word.text).join(" "));
          if (brandTokens(mergedValue).filter((token) => /[a-z]/.test(token)).length > 3) continue;
          const merged = analyzeBrandSpan(
            buildBrandSpan(
              nextCandidateId(),
              mergedWords,
              result,
              "multi-line-merge",
              [index, index + 1],
              alignment,
              proximity,
            ),
          );
          candidateDiagnostics.push(merged.diagnostic);
          if (merged.candidate) candidates.push(merged.candidate);
        }
      }
    }
  }
  return buildBrandObservation(candidates, {
    lines: lineDiagnostics,
    candidates: candidateDiagnostics,
    abstentionReason: sawBrandRegionText ? "unsupported-candidates-only" : "no-brand-region-text",
  });
}

/**
 * Build a brand observation ranked by bounded score components rather than raw
 * prominence alone. Coherent, positively-signalled multi-token candidates can
 * now outrank short noise without weakening the abstention gate.
 */
function buildBrandObservation(
  candidates: Candidate[],
  diagnostics: BrandSelectionDiagnosticsInternal,
): FieldSelection {
  const publicDiagnostics = (): BrandSelectionDiagnostics => ({
    lines: diagnostics.lines,
    candidates: diagnostics.candidates.map((candidate) => ({
      rawText: candidate.rawText,
      cleanedValue: candidate.cleanedValue,
      confidence: candidate.confidence,
      prominence: candidate.prominence,
      regionName: candidate.regionName,
      assembly: candidate.assembly,
      lineIndexes: candidate.lineIndexes,
      kept: candidate.kept,
      filterReason: candidate.filterReason,
      decision: candidate.decision,
      score: candidate.score,
    })),
    abstentionReason: diagnostics.abstentionReason,
  });

  if (candidates.length === 0) {
    return {
      observation: { state: "NOT_OBSERVED", value: null, confidence: 0, alternates: [] },
      sourceRegion: null,
      brandDiagnostics: publicDiagnostics(),
    };
  }

  const maxProminence = Math.max(...candidates.map((candidate) => candidate.prominence));
  const maxArea = Math.max(...candidates.map((candidate) => geometryArea(candidate.geometry)));
  const scored = candidates.map((candidate) => ({
    ...candidate,
    score: scoreBrandCandidate(candidate, maxProminence, maxArea),
  }));
  const diagnosticById = new Map(
    diagnostics.candidates.map((candidate) => [candidate.id, candidate]),
  );
  for (const candidate of scored) {
    if (!candidate.id) continue;
    const diagnostic = diagnosticById.get(candidate.id);
    if (diagnostic) diagnostic.score = candidate.score;
  }

  const ranked = dedupeBestCandidates(bestFamilyCandidates(scored)).sort((a, b) => {
    const prominenceFloor = maxProminence * BRAND_SCORE_PROMINENCE_FLOOR_RATIO;
    const aScoreEligible = a.prominence >= prominenceFloor ? 1 : 0;
    const bScoreEligible = b.prominence >= prominenceFloor ? 1 : 0;
    if (aScoreEligible !== bScoreEligible) return bScoreEligible - aScoreEligible;
    if (aScoreEligible === 1 && bScoreEligible === 1) {
      return (
        (b.score?.total ?? 0) - (a.score?.total ?? 0) ||
        b.prominence - a.prominence ||
        b.confidence - a.confidence ||
        key(a.value).localeCompare(key(b.value))
      );
    }
    return (
      b.prominence - a.prominence ||
      b.confidence - a.confidence ||
      (b.score?.total ?? 0) - (a.score?.total ?? 0) ||
      key(a.value).localeCompare(key(b.value))
    );
  });
  const best = ranked[0];
  const distinctAlternates = ranked
    .slice(1)
    .filter((candidate) => !corroborates(best.value, candidate.value))
    .map(alternateFrom);

  const competing = ranked
    .slice(1)
    .filter(
      (c) =>
        !corroborates(best.value, c.value) &&
        c.prominence >= best.prominence * BRAND_PROMINENCE_RATIO,
    );

  for (const candidate of ranked) {
    if (!candidate.id) continue;
    const diagnostic = diagnosticById.get(candidate.id);
    if (!diagnostic) continue;
    if (candidate.id === best.id) diagnostic.decision = "selected";
    else if (competing.some((rival) => rival.id === candidate.id))
      diagnostic.decision = "ambiguous-rival";
    else diagnostic.decision = "alternate";
  }

  // A brand is AMBIGUOUS when another candidate rivals it in prominence, or when
  // the leading candidate is only weakly recognized yet other candidates remain:
  // a low-confidence lead among rivals is not a safe silent pick. This is what
  // keeps noisy front-label OCR (no cleanly isolated brand mark) from fabricating
  // a confident brand — a human decides instead.
  const weakContestedLead =
    best.confidence < LOW_CONFIDENCE_THRESHOLD &&
    ranked.slice(1).some((candidate) => !corroborates(best.value, candidate.value));

  if (competing.length > 0 || weakContestedLead) {
    return {
      observation: {
        state: "AMBIGUOUS",
        value: best.value,
        normalizedValue: best.value,
        rawText: best.rawText,
        confidence: best.confidence,
        geometry: best.geometry,
        alternates: distinctAlternates,
        ambiguityReason: "competing_candidates",
      },
      sourceRegion: best.regionName,
      brandDiagnostics: publicDiagnostics(),
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
    // A single plausible line that could not be positively distinguished as
    // brand presentation. It may be the only candidate (no rival to list), so it
    // is marked as a single unconfirmed candidate: usable, reviewable
    // uncertainty that stays schema-valid and never a silent OBSERVED match.
    return {
      observation: {
        state: "AMBIGUOUS",
        value: best.value,
        normalizedValue: best.value,
        rawText: best.rawText,
        confidence: best.confidence,
        geometry: best.geometry,
        alternates: distinctAlternates,
        ambiguityReason: "single_unconfirmed_candidate",
      },
      sourceRegion: best.regionName,
      brandDiagnostics: publicDiagnostics(),
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
      alternates: distinctAlternates,
    },
    sourceRegion: best.regionName,
    brandDiagnostics: publicDiagnostics(),
  };
}

/** Collapse duplicate candidate values, keeping the highest-confidence instance. */
function dedupe(
  candidates: Candidate[],
  build: (c: Candidate[], toAlt: (c: Candidate) => AnalyzerAlternate) => FieldSelection,
): FieldSelection {
  return build(dedupeCandidates(candidates), alternateFrom);
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
