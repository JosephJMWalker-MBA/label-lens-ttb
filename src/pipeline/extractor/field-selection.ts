import { parseWineAlcoholStatement } from "@/domain/rules/wine-alcohol-parse";
import type {
  AnalyzerAlternate,
  AnalyzerCandidateProvenance,
  AnalyzerCandidateRanking,
  AnalyzerFieldObservation,
  AnalyzerOcrConfidence,
  EvidenceGeometry,
} from "@/pipeline/analyzer/analyzer.types";

import type {
  OcrPassKind,
  OcrPassTriggerReason,
  OcrWord,
  RegionOcrResult,
  SelectionProvenance,
} from "./extractor.types";
import { unionGeometry } from "./geometry";

/**
 * Deterministic candidate selection for the two supported fields. Confidence is
 * never a hidden pass/fail gate: it only sets the observation state and ranks
 * candidates, while the extracted value is always preserved. Nothing here
 * emits a rule outcome — that belongs to the deterministic rules.
 */

/** OCR confidence is on a 0–100 scale; normalize to the analyzer's [0,1]. */
export function normalizeConfidence(rawConfidence: number | null | undefined): number {
  if (typeof rawConfidence !== "number" || !Number.isFinite(rawConfidence) || rawConfidence <= 0) {
    return 0;
  }
  return Math.min(1, rawConfidence / 100);
}

function rawConfidenceOf(word: OcrWord): number | null {
  return Number.isFinite(word.rawConfidence) ? word.rawConfidence : null;
}

function ocrConfidenceOf(words: OcrWord[]): AnalyzerOcrConfidence {
  const rawTokenConfidences = words.map(rawConfidenceOf);
  const observed = rawTokenConfidences.filter((value): value is number => value !== null);
  const rawMean =
    observed.length === 0
      ? null
      : observed.reduce((sum, value) => sum + value, 0) / observed.length;
  return {
    aggregation: "mean",
    rawScale: "0-100",
    rawTokenConfidences,
    rawMean,
    rawMin: observed.length === 0 ? null : Math.min(...observed),
    rawMax: observed.length === 0 ? null : Math.max(...observed),
    missingTokenCount: rawTokenConfidences.length - observed.length,
  };
}

/** Mean of present token confidences; missing raw OCR confidence stays explicit. */
function aggregateOcrEvidenceScore(words: OcrWord[]): number {
  const observed = words.map(rawConfidenceOf).filter((value): value is number => value !== null);
  if (observed.length === 0) return 0;
  const sum = observed.reduce((acc, rawConfidence) => acc + normalizeConfidence(rawConfidence), 0);
  return sum / observed.length;
}

/** Below this normalized confidence, a present value is LOW_CONFIDENCE, not absent. */
const LOW_CONFIDENCE_THRESHOLD = 0.6;
/** Two candidates within this confidence margin are treated as competing. */
const AMBIGUITY_MARGIN = 0.2;

interface Candidate {
  id?: string;
  value: string;
  rawText: string;
  ocrEvidenceScore: number;
  ocrConfidence: AnalyzerOcrConfidence;
  geometry: EvidenceGeometry;
  words: OcrWord[];
  passId: string;
  passKind: OcrPassKind;
  triggerReasons: OcrPassTriggerReason[];
  preprocessing: string[];
  supportPassIds: string[];
  supportPassKinds: OcrPassKind[];
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
  ranking?: AnalyzerCandidateRanking;
}

/** An observation plus the region the selected value came from (for provenance). */
export interface FieldSelection {
  observation: AnalyzerFieldObservation;
  sourceRegion: string | null;
  source: SelectionProvenance | null;
  supportingPassIds: string[];
  recoveryPassUsed: boolean;
  brandDiagnostics?: BrandSelectionDiagnostics;
  alcoholDiagnostics?: AlcoholSelectionDiagnostics;
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
  passId: string;
  passKind: OcrPassKind;
  kept: boolean;
  reason: BrandLineReason;
}

export interface BrandCandidateScore {
  positiveSignal: number;
  meaningfulChars: number;
  structure: number;
  ocrEvidenceScore: number;
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
  ocrEvidenceScore: number;
  ocrConfidence: AnalyzerOcrConfidence;
  prominence: number;
  regionName: string;
  passId: string;
  passKind: OcrPassKind;
  supportPassIds: string[];
  candidateProvenance: AnalyzerCandidateProvenance;
  assembly: BrandCandidateAssembly;
  lineIndexes: number[];
  kept: boolean;
  filterReason: BrandLineReason;
  decision?: BrandCandidateDecision;
  score?: BrandCandidateScore;
  ranking?: AnalyzerCandidateRanking;
}

export interface BrandSelectionDiagnostics {
  lines: BrandLineDiagnostic[];
  candidates: BrandCandidateDiagnostic[];
  abstentionReason?: BrandAbstentionReason;
}

export const ALCOHOL_ABSTENTION_REASONS = [
  "no-alcohol-like-text",
  "unsupported-candidates-only",
] as const;
export type AlcoholAbstentionReason = (typeof ALCOHOL_ABSTENTION_REASONS)[number];

export const ALCOHOL_CANDIDATE_ASSEMBLIES = ["same-line-window", "adjacent-line-window"] as const;
export type AlcoholCandidateAssembly = (typeof ALCOHOL_CANDIDATE_ASSEMBLIES)[number];

export const ALCOHOL_CANDIDATE_DECISIONS = ["selected", "alternate", "ambiguous-rival"] as const;
export type AlcoholCandidateDecision = (typeof ALCOHOL_CANDIDATE_DECISIONS)[number];

export const ALCOHOL_ACCEPTANCE_REASONS = [
  "explicit-percent-by-volume",
  "explicit-percent-alc-vol",
  "explicit-percentless-alcohol-by-volume",
] as const;
export type AlcoholAcceptanceReason = (typeof ALCOHOL_ACCEPTANCE_REASONS)[number];

export const ALCOHOL_NORMALIZATION_OPERATIONS = [
  "comma-decimal",
  "split-decimal-merge",
  "implicit-decimal-recovery",
  "ocr-zero-normalized",
  "ocr-one-normalized",
  "marker-ocr-normalized",
  "split-fused-alcohol-prefix",
  "split-percent-by",
  "split-byvol",
  "collapse-marker-slash",
  "percent-before-number-reordered",
] as const;
export type AlcoholNormalizationOperation = (typeof ALCOHOL_NORMALIZATION_OPERATIONS)[number];

export const ALCOHOL_REJECTION_REASONS = [
  "proof-only",
  "no-supported-number",
  "missing-volume-marker",
  "missing-explicit-alcohol-marker",
  "bare-volume-marker-too-weak",
  "unsupported-pattern",
  "parser-rejected",
] as const;
export type AlcoholRejectionReason = (typeof ALCOHOL_REJECTION_REASONS)[number];

export interface AlcoholCandidateDiagnostic {
  rawText: string;
  normalizedValue: string | null;
  normalizedParsingText: string | null;
  confidence: number;
  ocrEvidenceScore: number;
  ocrConfidence: AnalyzerOcrConfidence;
  prominence: number;
  regionName: string;
  passId: string;
  passKind: OcrPassKind;
  supportPassIds: string[];
  candidateProvenance: AnalyzerCandidateProvenance;
  assembly: AlcoholCandidateAssembly;
  lineIndexes: number[];
  sourceTokens: string[];
  sourceBoxes: { x0: number; y0: number; x1: number; y1: number }[];
  sourceOriginalBoxes: EvidenceGeometry[];
  kept: boolean;
  acceptanceReason?: AlcoholAcceptanceReason;
  positiveMarkers: string[];
  normalizationOperations: AlcoholNormalizationOperation[];
  parsedPercent: number | null;
  rejectionReason?: AlcoholRejectionReason;
  decision?: AlcoholCandidateDecision;
  ranking?: AnalyzerCandidateRanking;
}

export interface AlcoholSelectionDiagnostics {
  candidates: AlcoholCandidateDiagnostic[];
  abstentionReason?: AlcoholAbstentionReason;
  numberInOcr: boolean;
  percentInOcr: boolean;
  alcoholMarkerInOcr: boolean;
  volumeMarkerInOcr: boolean;
  sameLineEvidenceCluster: boolean;
  adjacentLineEvidenceCluster: boolean;
  filterRejectedCandidate: boolean;
  parserRejectedCandidate: boolean;
  candidateAccepted: boolean;
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

function geometryFor(words: OcrWord[]): EvidenceGeometry {
  const geometries = words
    .map((word) => word.originalGeometry)
    .filter((geometry): geometry is EvidenceGeometry => geometry !== undefined);
  if (geometries.length === 0) {
    throw new Error("geometryFor requires words with original-frame geometry");
  }
  return unionGeometry(geometries);
}

function originalGeometryOf(word: OcrWord): EvidenceGeometry {
  if (!word.originalGeometry) {
    throw new Error("missing original-frame OCR geometry");
  }
  return word.originalGeometry;
}

function candidateProvenanceOf(candidate: Candidate): AnalyzerCandidateProvenance {
  return {
    passId: candidate.passId,
    passKind: candidate.passKind,
    triggerReasons: candidate.triggerReasons,
    preprocessing: candidate.preprocessing,
    regionName: candidate.regionName,
    supportingPassIds: candidate.supportPassIds,
    supportingPassKinds: candidate.supportPassKinds,
    recoveryPassUsed: candidate.passKind !== "full-image-primary",
  };
}

function alternateFrom(c: Candidate): AnalyzerAlternate {
  if (!c.ranking) {
    throw new Error("alternateFrom requires ranking semantics");
  }
  return {
    value: c.value,
    confidence: c.ocrEvidenceScore,
    ocrEvidenceScore: c.ocrEvidenceScore,
    ocrConfidence: c.ocrConfidence,
    candidateProvenance: candidateProvenanceOf(c),
    ranking: c.ranking,
    geometry: c.geometry,
  };
}

function observationFromCandidate(
  candidate: Candidate,
  state: AnalyzerFieldObservation["state"],
  alternates: AnalyzerAlternate[],
  ambiguityReason?: AnalyzerFieldObservation["ambiguityReason"],
): AnalyzerFieldObservation {
  if (!candidate.ranking) {
    throw new Error("observationFromCandidate requires ranking semantics");
  }
  return {
    state,
    value: candidate.value,
    normalizedValue: candidate.value,
    rawText: candidate.rawText,
    confidence: candidate.ocrEvidenceScore,
    ocrEvidenceScore: candidate.ocrEvidenceScore,
    ocrConfidence: candidate.ocrConfidence,
    candidateProvenance: candidateProvenanceOf(candidate),
    ranking: candidate.ranking,
    geometry: candidate.geometry,
    alternates,
    ...(ambiguityReason ? { ambiguityReason } : {}),
  };
}

function provenanceOf(candidate: Candidate): SelectionProvenance {
  return {
    passId: candidate.passId,
    passKind: candidate.passKind,
    regionName: candidate.regionName,
    triggerReasons: candidate.triggerReasons,
    preprocessing: candidate.preprocessing,
    geometry: candidate.geometry,
  };
}

function mergeDistinct<T>(left: T[], right: T[]): T[] {
  return [...new Set([...left, ...right])];
}

function mergeCandidateSupport(preferred: Candidate, duplicate: Candidate): Candidate {
  return {
    ...preferred,
    supportPassIds: mergeDistinct(preferred.supportPassIds, duplicate.supportPassIds),
    supportPassKinds: mergeDistinct(preferred.supportPassKinds, duplicate.supportPassKinds),
  };
}

// ---------------------------------------------------------------------------
// Alcohol statement: assemble bounded OCR windows into explicit alcohol-by-
// volume candidates. This supports split percent markers, adjacent-line
// assembly, percent-less "ALCOHOL 14 BY VOLUME" wording, and narrow OCR
// normalization (e.g. V0L, comma decimals, fused ALC135%) without using any
// declared/application value.
// ---------------------------------------------------------------------------

const MAX_ALCOHOL_WINDOW_WORDS = 7;
const MAX_ALCOHOL_ADJACENT_LINE_GAP_RATIO = 1.8;
const MAX_ALCOHOL_ADJACENT_CENTER_OFFSET = 0.9;

interface AlcoholCandidateDiagnosticInternal extends AlcoholCandidateDiagnostic {
  id: string;
}

interface AlcoholSelectionDiagnosticsInternal {
  candidates: AlcoholCandidateDiagnosticInternal[];
  abstentionReason: AlcoholAbstentionReason;
  numberInOcr: boolean;
  percentInOcr: boolean;
  alcoholMarkerInOcr: boolean;
  volumeMarkerInOcr: boolean;
  sameLineEvidenceCluster: boolean;
  adjacentLineEvidenceCluster: boolean;
  filterRejectedCandidate: boolean;
  parserRejectedCandidate: boolean;
  candidateAccepted: boolean;
}

interface AlcoholWindow {
  id: string;
  words: OcrWord[];
  result: RegionOcrResult;
  assembly: AlcoholCandidateAssembly;
  lineIndexes: number[];
}

interface AlcoholMatch {
  normalizedText: string;
  normalizedValue: string;
  parsedPercent: number | null;
  acceptanceReason: AlcoholAcceptanceReason;
  positiveMarkers: string[];
  normalizationOperations: AlcoholNormalizationOperation[];
}

const ALCOHOL_NUMBER = String.raw`([0-9oOil]{1,4}(?:\.[0-9oOil]{1,2})?)`;
const ALCOHOL_RANGE = String.raw`([0-9oOil]{1,4}(?:\.[0-9oOil]{1,2})?)\s*%?\s*(?:to|through|-|–|—)\s*([0-9oOil]{1,4}(?:\.[0-9oOil]{1,2})?)\s*%`;
const BY_VOLUME_RE = new RegExp(`^${ALCOHOL_NUMBER}\\s*%\\s+by\\s+vol(?:ume)?\\.?$`);
const ALC_BY_VOLUME_RE = new RegExp(
  `^(?:alcohol|alc\\.?)\\s+${ALCOHOL_NUMBER}\\s*%\\s+by\\s+vol(?:ume)?\\.?$`,
);
const REORDERED_PERCENT_RE = new RegExp(
  `^(?:alcohol|alc\\.?)\\s+%\\s+${ALCOHOL_NUMBER}\\s+by\\s+vol(?:ume)?\\.?$`,
);
const ALC_SLASH_VOL_RE = new RegExp(
  `^${ALCOHOL_NUMBER}\\s*%\\s+alc\\.?\\s*(?:\\/|by)\\s*vol(?:ume)?\\.?$`,
);
const PREFIX_ALC_VOL_RE = new RegExp(
  `^(?:alcohol|alc\\.?)\\s+${ALCOHOL_NUMBER}\\s*%\\s+vol(?:ume)?\\.?$`,
);
const PERCENTLESS_BY_VOLUME_RE = new RegExp(
  `^(?:alcohol|alc\\.?)\\s+${ALCOHOL_NUMBER}\\s+by\\s+vol(?:ume)?\\.?$`,
);
const PERCENTLESS_BARE_VOL_RE = new RegExp(
  `^(?:alcohol|alc\\.?)\\s+${ALCOHOL_NUMBER}\\s+vol(?:ume)?\\.?$`,
);
const RANGE_BY_VOLUME_RE = new RegExp(`^${ALCOHOL_RANGE}\\s+by\\s+vol(?:ume)?\\.?$`);
const RANGE_ALC_BY_VOLUME_RE = new RegExp(
  `^(?:alcohol|alc\\.?)\\s+${ALCOHOL_RANGE}\\s+by\\s+vol(?:ume)?\\.?$`,
);

function pushUniqueOp(
  ops: AlcoholNormalizationOperation[],
  op: AlcoholNormalizationOperation,
): AlcoholNormalizationOperation[] {
  if (!ops.includes(op)) ops.push(op);
  return ops;
}

function alcoholMarkerToken(text: string): boolean {
  return /\b(?:alcohol|a[l1i]c)(?=\b|\d)/i.test(text);
}

function alcoholVolumeToken(text: string): boolean {
  return (
    /\b(?:by\s*)?v[o0][l1i](?:ume)?\b/i.test(text) ||
    /\ba[l1i]c[./]*\s*\/\s*v[o0][l1i]/i.test(text) ||
    /\ba[l1i]c[./]*v[o0][l1i]/i.test(text)
  );
}

function alcoholProofToken(text: string): boolean {
  return /\bproof\b/i.test(text);
}

function alcoholHasDigits(text: string): boolean {
  return /\d/.test(text);
}

function alcoholSignalWindow(words: OcrWord[]): boolean {
  const text = words.map((word) => word.text).join(" ");
  const hasNumber = words.some((word) => alcoholHasDigits(word.text));
  const hasMarker =
    text.includes("%") ||
    alcoholMarkerToken(text) ||
    alcoholVolumeToken(text) ||
    alcoholProofToken(text);
  return hasNumber && hasMarker;
}

function lineCenterY(words: OcrWord[]): number {
  const top = Math.min(...words.map((word) => word.bbox.y0));
  const bottom = Math.max(...words.map((word) => word.bbox.y1));
  return (top + bottom) / 2;
}

function lineHeight(words: OcrWord[]): number {
  return Math.max(
    1,
    Math.max(...words.map((word) => word.bbox.y1)) - Math.min(...words.map((word) => word.bbox.y0)),
  );
}

function lineCenterX(words: OcrWord[]): number {
  const left = Math.min(...words.map((word) => word.bbox.x0));
  const right = Math.max(...words.map((word) => word.bbox.x1));
  return (left + right) / 2;
}

function canMergeAlcoholLines(upper: OcrWord[], lower: OcrWord[]): boolean {
  const gap = Math.max(
    0,
    Math.min(...lower.map((word) => word.bbox.y0)) - Math.max(...upper.map((word) => word.bbox.y1)),
  );
  const averageHeight = (lineHeight(upper) + lineHeight(lower)) / 2;
  const centerOffset =
    Math.abs(lineCenterX(upper) - lineCenterX(lower)) / Math.max(1, averageHeight * 6);
  return (
    gap <= averageHeight * MAX_ALCOHOL_ADJACENT_LINE_GAP_RATIO &&
    centerOffset <= MAX_ALCOHOL_ADJACENT_CENTER_OFFSET
  );
}

function canonicalizeAlcoholWindowText(rawText: string): {
  text: string;
  ops: AlcoholNormalizationOperation[];
} {
  let text = rawText.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  const ops: AlcoholNormalizationOperation[] = [];
  const apply = (next: string, op: AlcoholNormalizationOperation) => {
    if (next !== text) {
      text = next;
      pushUniqueOp(ops, op);
    }
  };

  apply(text.replace(/\ba[1il]c(?=[0-9oOil])/g, "alc "), "split-fused-alcohol-prefix");
  apply(text.replace(/\ba[1il]c(?=\b|\d)/g, "alc"), "marker-ocr-normalized");
  apply(text.replace(/\bv[o0][l1i]ume\b/g, "volume"), "marker-ocr-normalized");
  apply(text.replace(/\bv[o0][l1i]\b/g, "vol"), "marker-ocr-normalized");
  apply(text.replace(/%\s*by\b/g, "% by"), "split-percent-by");
  apply(
    text.replace(/\bbyvol(?:ume)?\b/g, (value) => (value.includes("ume") ? "by volume" : "by vol")),
    "split-byvol",
  );
  apply(
    text.replace(/\balc\s*[.]*\s*\/\s*vol(?:ume)?\.?\b/g, "alc / vol"),
    "collapse-marker-slash",
  );

  const commaOrSplitDecimal = /(\d{1,3})\s*,\s*(\d{1,2})/g;
  if (commaOrSplitDecimal.test(text)) {
    text = text.replace(commaOrSplitDecimal, "$1.$2");
    pushUniqueOp(ops, "comma-decimal");
    pushUniqueOp(ops, "split-decimal-merge");
  }

  const splitDotDecimal = /(\d{1,3})\s*\.\s*(\d{1,2})/g;
  if (splitDotDecimal.test(text)) {
    text = text.replace(splitDotDecimal, "$1.$2");
    pushUniqueOp(ops, "split-decimal-merge");
  }

  text = text.replace(/\s+/g, " ").trim();
  return { text, ops };
}

function canonicalizeAlcoholNumber(
  rawNumber: string,
  allowImplicitDecimal: boolean,
): { value: string | null; ops: AlcoholNormalizationOperation[] } {
  if (!/^[0-9oOil.,]+$/i.test(rawNumber.trim())) return { value: null, ops: [] };

  let value = rawNumber.trim();
  const ops: AlcoholNormalizationOperation[] = [];

  if (/[o]/i.test(value)) {
    value = value.replace(/[o]/gi, "0");
    pushUniqueOp(ops, "ocr-zero-normalized");
  }
  if (/[il]/i.test(value)) {
    value = value.replace(/[il]/gi, "1");
    pushUniqueOp(ops, "ocr-one-normalized");
  }
  if (value.includes(",")) {
    value = value.replace(/,/g, ".");
    pushUniqueOp(ops, "comma-decimal");
  }

  if (/^\d{1,2}(?:\.\d{1,2})?$/.test(value)) return { value, ops };
  if (allowImplicitDecimal && /^\d{3}$/.test(value)) {
    value = `${value.slice(0, -1)}.${value.slice(-1)}`;
    pushUniqueOp(ops, "implicit-decimal-recovery");
    return { value, ops };
  }

  return { value: null, ops: [] };
}

function alcoholParsedPercent(normalizedText: string): number | null {
  const parsed = parseWineAlcoholStatement(normalizedText);
  if (parsed.kind === "direct") return parsed.basisPoints / 100;
  if (parsed.kind === "range") return parsed.lowerBasisPoints / 100;
  return null;
}

function alcoholSemanticKey(value: string): string {
  const parsed = parseWineAlcoholStatement(value);
  if (parsed.kind === "direct") return `direct:${parsed.basisPoints}`;
  if (parsed.kind === "range") {
    return `range:${parsed.lowerBasisPoints}-${parsed.upperBasisPoints}`;
  }
  return key(value);
}

function alcoholCorroborates(a: string, b: string): boolean {
  return alcoholSemanticKey(a) === alcoholSemanticKey(b) || corroborates(a, b);
}

function alcoholCanonicalPreference(candidate: Candidate): number {
  if (candidate.value.includes("ALC./VOL.")) return 2;
  if (candidate.value.includes("BY VOL.")) return 1;
  return 0;
}

function dedupeAlcoholCandidates(candidates: Candidate[]): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const semanticKey = alcoholSemanticKey(candidate.value);
    const existing = byKey.get(semanticKey);
    if (!existing) {
      byKey.set(semanticKey, candidate);
      continue;
    }
    const existingPreference = alcoholCanonicalPreference(existing);
    const candidatePreference = alcoholCanonicalPreference(candidate);
    if (
      candidate.ocrEvidenceScore > existing.ocrEvidenceScore ||
      (candidate.ocrEvidenceScore === existing.ocrEvidenceScore &&
        (candidatePreference > existingPreference ||
          (candidatePreference === existingPreference &&
            key(candidate.value).localeCompare(key(existing.value)) < 0)))
    ) {
      byKey.set(semanticKey, mergeCandidateSupport(candidate, existing));
    } else {
      byKey.set(semanticKey, mergeCandidateSupport(existing, candidate));
    }
  }
  return [...byKey.values()];
}

function alcoholPositiveMarkers(
  hasPercent: boolean,
  hasAlcoholMarker: boolean,
  hasByVolume: boolean,
  usesAlcVol: boolean,
): string[] {
  const markers: string[] = [];
  if (hasPercent) markers.push("percent");
  if (hasAlcoholMarker) markers.push("alcohol-marker");
  if (hasByVolume) markers.push("by-volume-marker");
  if (usesAlcVol) markers.push("alc-vol-marker");
  return markers;
}

function matchAlcoholWindow(rawText: string): AlcoholMatch | { rejection: AlcoholRejectionReason } {
  const { text, ops } = canonicalizeAlcoholWindowText(rawText);
  const hasProof = /\bproof\b/.test(text);
  const hasNumber = /[0-9oOil]/i.test(text);
  const hasPercent = text.includes("%");
  const hasAlcohol = /\b(?:alcohol|alc)\b/.test(text);
  const hasByVolume = /\bby\s+vol(?:ume)?\b/.test(text);
  const hasAlcVol = /\balc\s*(?:\/|by)\s*vol(?:ume)?\b/.test(text);
  const hasBareVol = /\bvol(?:ume)?\b/.test(text);

  if (!hasNumber) return { rejection: "no-supported-number" };
  if (hasProof && !hasByVolume && !hasAlcVol && !hasBareVol) return { rejection: "proof-only" };
  if (!hasByVolume && !hasAlcVol && !hasBareVol) return { rejection: "missing-volume-marker" };

  const tryMatch = (
    regex: RegExp,
    acceptanceReason: AlcoholAcceptanceReason,
    buildValue: (number: string) => string,
    options?: {
      percentBeforeNumber?: boolean;
      allowImplicitDecimal?: boolean;
      percentless?: boolean;
    },
  ): AlcoholMatch | null => {
    const match = text.match(regex);
    if (!match) return null;
    const number = canonicalizeAlcoholNumber(match[1], options?.allowImplicitDecimal ?? true);
    if (!number.value) return null;
    const normalizedOps = [...ops];
    for (const op of number.ops) pushUniqueOp(normalizedOps, op);
    if (options?.percentBeforeNumber)
      pushUniqueOp(normalizedOps, "percent-before-number-reordered");
    const normalizedText = buildValue(number.value);
    const parsed = parseWineAlcoholStatement(normalizedText);
    if (parsed.kind !== "direct" && parsed.kind !== "range") {
      return {
        normalizedText,
        normalizedValue: normalizedText,
        parsedPercent: null,
        acceptanceReason,
        positiveMarkers: [],
        normalizationOperations: [...normalizedOps, "percent-before-number-reordered"].filter(
          (value, index, all) =>
            value !== "percent-before-number-reordered" || all.indexOf(value) === index,
        ) as AlcoholNormalizationOperation[],
      };
    }
    return {
      normalizedText,
      normalizedValue: normalizedText,
      parsedPercent: alcoholParsedPercent(normalizedText),
      acceptanceReason,
      positiveMarkers: alcoholPositiveMarkers(
        !options?.percentless,
        acceptanceReason !== "explicit-percent-by-volume" || hasAlcohol,
        normalizedText.includes("BY VOL"),
        normalizedText.includes("ALC./VOL."),
      ),
      normalizationOperations: normalizedOps,
    };
  };

  const tryRangeMatch = (
    regex: RegExp,
    acceptanceReason: AlcoholAcceptanceReason,
  ): AlcoholMatch | null => {
    const match = text.match(regex);
    if (!match) return null;
    const lower = canonicalizeAlcoholNumber(match[1], true);
    const upper = canonicalizeAlcoholNumber(match[2], true);
    if (!lower.value || !upper.value) return null;
    const normalizedOps = [...ops];
    for (const op of [...lower.ops, ...upper.ops]) pushUniqueOp(normalizedOps, op);
    const normalizedText = `${lower.value}% - ${upper.value}% BY VOL.`;
    const parsed = parseWineAlcoholStatement(normalizedText);
    if (parsed.kind !== "range") return null;
    return {
      normalizedText,
      normalizedValue: normalizedText,
      parsedPercent: alcoholParsedPercent(normalizedText),
      acceptanceReason,
      positiveMarkers: alcoholPositiveMarkers(true, hasAlcohol, true, false),
      normalizationOperations: normalizedOps,
    };
  };

  const byVol =
    tryRangeMatch(RANGE_ALC_BY_VOLUME_RE, "explicit-percent-by-volume") ??
    tryRangeMatch(RANGE_BY_VOLUME_RE, "explicit-percent-by-volume") ??
    tryMatch(BY_VOLUME_RE, "explicit-percent-by-volume", (number) => `${number}% BY VOL.`) ??
    tryMatch(ALC_BY_VOLUME_RE, "explicit-percent-alc-vol", (number) => `${number}% ALC./VOL.`) ??
    tryMatch(REORDERED_PERCENT_RE, "explicit-percent-alc-vol", (number) => `${number}% ALC./VOL.`, {
      percentBeforeNumber: true,
    }) ??
    tryMatch(ALC_SLASH_VOL_RE, "explicit-percent-alc-vol", (number) => `${number}% ALC./VOL.`) ??
    tryMatch(PREFIX_ALC_VOL_RE, "explicit-percent-alc-vol", (number) => `${number}% ALC./VOL.`) ??
    tryMatch(
      PERCENTLESS_BY_VOLUME_RE,
      "explicit-percentless-alcohol-by-volume",
      (number) => `ALCOHOL ${number} BY VOLUME`,
      { percentless: true },
    ) ??
    tryMatch(
      PERCENTLESS_BARE_VOL_RE,
      "explicit-percentless-alcohol-by-volume",
      (number) => `ALCOHOL ${number} BY VOLUME`,
      { percentless: true },
    );

  if (byVol) {
    const parsed = parseWineAlcoholStatement(byVol.normalizedText);
    if (parsed.kind === "direct" || parsed.kind === "range") return byVol;
    return { rejection: parsed.kind === "proof" ? "proof-only" : "parser-rejected" };
  }

  if (hasProof) return { rejection: "proof-only" };
  if (!hasPercent && !hasAlcohol) return { rejection: "missing-explicit-alcohol-marker" };
  if (hasBareVol && !hasByVolume && !hasAlcVol && !hasAlcohol) {
    return { rejection: "bare-volume-marker-too-weak" };
  }
  return { rejection: "unsupported-pattern" };
}

function analyzeAlcoholWindow(window: AlcoholWindow): {
  candidate?: Candidate;
  diagnostic: AlcoholCandidateDiagnosticInternal;
  filterRejected: boolean;
  parserRejected: boolean;
} {
  const rawText = window.words.map((word) => word.text).join(" ");
  const geometry = geometryFor(window.words);
  const match = matchAlcoholWindow(rawText);
  const diagnostic: AlcoholCandidateDiagnosticInternal = {
    id: window.id,
    rawText,
    normalizedValue: "normalizedValue" in match ? match.normalizedValue : null,
    normalizedParsingText: "normalizedText" in match ? match.normalizedText : null,
    confidence: aggregateOcrEvidenceScore(window.words),
    ocrEvidenceScore: aggregateOcrEvidenceScore(window.words),
    ocrConfidence: ocrConfidenceOf(window.words),
    prominence: geometry.height,
    regionName: window.result.regionName,
    passId: window.result.passId,
    passKind: window.result.passKind,
    supportPassIds: [window.result.passId],
    candidateProvenance: {
      passId: window.result.passId,
      passKind: window.result.passKind,
      triggerReasons: window.result.triggerReasons,
      preprocessing: window.result.preprocessing,
      regionName: window.result.regionName,
      supportingPassIds: [window.result.passId],
      supportingPassKinds: [window.result.passKind],
      recoveryPassUsed: window.result.passKind !== "full-image-primary",
    },
    assembly: window.assembly,
    lineIndexes: window.lineIndexes,
    sourceTokens: window.words.map((word) => word.text),
    sourceBoxes: window.words.map((word) => word.bbox),
    sourceOriginalBoxes: window.words.map((word) => originalGeometryOf(word)),
    kept: false,
    acceptanceReason: "acceptanceReason" in match ? match.acceptanceReason : undefined,
    positiveMarkers: "positiveMarkers" in match ? match.positiveMarkers : [],
    normalizationOperations:
      "normalizationOperations" in match ? match.normalizationOperations : [],
    parsedPercent: "parsedPercent" in match ? match.parsedPercent : null,
    rejectionReason: "rejection" in match ? match.rejection : undefined,
  };

  if (!("normalizedText" in match)) {
    return {
      diagnostic,
      filterRejected: match.rejection !== "parser-rejected",
      parserRejected: match.rejection === "parser-rejected",
    };
  }

  diagnostic.kept = true;
  const candidate: Candidate = {
    id: window.id,
    value: match.normalizedValue,
    rawText,
    ocrEvidenceScore: aggregateOcrEvidenceScore(window.words),
    ocrConfidence: ocrConfidenceOf(window.words),
    geometry,
    words: window.words,
    passId: window.result.passId,
    passKind: window.result.passKind,
    triggerReasons: window.result.triggerReasons,
    preprocessing: window.result.preprocessing,
    supportPassIds: [window.result.passId],
    supportPassKinds: [window.result.passKind],
    regionName: window.result.regionName,
    prominence: geometry.height,
  };
  return { candidate, diagnostic, filterRejected: false, parserRejected: false };
}

function alcoholWindowsForWords(
  words: OcrWord[],
  result: RegionOcrResult,
  assembly: AlcoholCandidateAssembly,
  lineIndexes: number[],
  nextId: () => string,
): AlcoholWindow[] {
  const windows: AlcoholWindow[] = [];
  for (let start = 0; start < words.length; start++) {
    for (
      let end = start + 1;
      end < Math.min(words.length, start + MAX_ALCOHOL_WINDOW_WORDS);
      end++
    ) {
      const slice = words.slice(start, end + 1);
      if (!alcoholSignalWindow(slice)) continue;
      windows.push({
        id: nextId(),
        words: slice,
        result,
        assembly,
        lineIndexes,
      });
    }
  }
  return windows;
}

function compareRankingValue(
  left: number | string | boolean,
  right: number | string | boolean,
  direction: "asc" | "desc",
): number {
  const base =
    typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right)
      : Number(typeof left === "boolean" ? Number(left) : left) -
        Number(typeof right === "boolean" ? Number(right) : right);
  return direction === "desc" ? -base : base;
}

function compareCandidateRanking(left: Candidate, right: Candidate): number {
  if (!left.ranking || !right.ranking) {
    throw new Error("compareCandidateRanking requires ranking semantics");
  }
  const count = Math.min(left.ranking.comparator.length, right.ranking.comparator.length);
  for (let index = 0; index < count; index += 1) {
    const leftEntry = left.ranking.comparator[index];
    const rightEntry = right.ranking.comparator[index];
    const compared = compareRankingValue(leftEntry.value, rightEntry.value, leftEntry.direction);
    if (compared !== 0) return compared;
  }
  return 0;
}

function alcoholRanking(candidate: Candidate): AnalyzerCandidateRanking {
  const comparator: AnalyzerCandidateRanking["comparator"] = [
    { id: "ocr-evidence-score", direction: "desc", value: candidate.ocrEvidenceScore },
    { id: "normalized-value-key", direction: "asc", value: key(candidate.value) },
  ];
  return {
    strategy: "alcohol-ocr-evidence-comparator",
    orderingMode: "ocr-evidence-first",
    comparator,
  };
}

function buildAlcoholObservation(
  candidates: Candidate[],
  diagnostics: AlcoholSelectionDiagnosticsInternal,
): FieldSelection {
  const publicDiagnostics = (): AlcoholSelectionDiagnostics => ({
    candidates: diagnostics.candidates.map((candidate) => ({
      rawText: candidate.rawText,
      normalizedValue: candidate.normalizedValue,
      normalizedParsingText: candidate.normalizedParsingText,
      confidence: candidate.confidence,
      ocrEvidenceScore: candidate.ocrEvidenceScore,
      ocrConfidence: candidate.ocrConfidence,
      prominence: candidate.prominence,
      regionName: candidate.regionName,
      passId: candidate.passId,
      passKind: candidate.passKind,
      supportPassIds: candidate.supportPassIds,
      candidateProvenance: candidate.candidateProvenance,
      assembly: candidate.assembly,
      lineIndexes: candidate.lineIndexes,
      sourceTokens: candidate.sourceTokens,
      sourceBoxes: candidate.sourceBoxes,
      sourceOriginalBoxes: candidate.sourceOriginalBoxes,
      kept: candidate.kept,
      acceptanceReason: candidate.acceptanceReason,
      positiveMarkers: candidate.positiveMarkers,
      normalizationOperations: candidate.normalizationOperations,
      parsedPercent: candidate.parsedPercent,
      rejectionReason: candidate.rejectionReason,
      decision: candidate.decision,
      ranking: candidate.ranking,
    })),
    abstentionReason: diagnostics.abstentionReason,
    numberInOcr: diagnostics.numberInOcr,
    percentInOcr: diagnostics.percentInOcr,
    alcoholMarkerInOcr: diagnostics.alcoholMarkerInOcr,
    volumeMarkerInOcr: diagnostics.volumeMarkerInOcr,
    sameLineEvidenceCluster: diagnostics.sameLineEvidenceCluster,
    adjacentLineEvidenceCluster: diagnostics.adjacentLineEvidenceCluster,
    filterRejectedCandidate: diagnostics.filterRejectedCandidate,
    parserRejectedCandidate: diagnostics.parserRejectedCandidate,
    candidateAccepted: diagnostics.candidateAccepted,
  });

  if (candidates.length === 0) {
    return {
      observation: {
        state: "NOT_OBSERVED",
        value: null,
        confidence: 0,
        ocrEvidenceScore: 0,
        alternates: [],
      },
      sourceRegion: null,
      source: null,
      supportingPassIds: [],
      recoveryPassUsed: false,
      alcoholDiagnostics: publicDiagnostics(),
    };
  }

  const diagnosticById = new Map(
    diagnostics.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const rankedInputs = candidates.map((candidate) => ({
    ...candidate,
    ranking: alcoholRanking(candidate),
  }));
  for (const candidate of rankedInputs) {
    if (!candidate.id) continue;
    const diagnostic = diagnosticById.get(candidate.id);
    if (!diagnostic) continue;
    diagnostic.ranking = candidate.ranking;
  }
  const ranked = dedupeAlcoholCandidates(rankedInputs).sort(compareCandidateRanking);
  const best = ranked[0];
  const competing = ranked
    .slice(1)
    .filter(
      (candidate) =>
        !alcoholCorroborates(best.value, candidate.value) &&
        best.ocrEvidenceScore - candidate.ocrEvidenceScore <= AMBIGUITY_MARGIN,
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

  if (competing.length > 0) {
    return {
      observation: observationFromCandidate(
        best,
        "AMBIGUOUS",
        competing.map(alternateFrom),
        "competing_candidates",
      ),
      sourceRegion: best.regionName,
      source: provenanceOf(best),
      supportingPassIds: best.supportPassIds,
      recoveryPassUsed: best.passKind !== "full-image-primary",
      alcoholDiagnostics: publicDiagnostics(),
    };
  }

  return {
    observation: observationFromCandidate(
      best,
      best.ocrEvidenceScore < LOW_CONFIDENCE_THRESHOLD ? "LOW_CONFIDENCE" : "OBSERVED",
      ranked
        .slice(1)
        .filter((candidate) => !alcoholCorroborates(best.value, candidate.value))
        .map(alternateFrom),
    ),
    sourceRegion: best.regionName,
    source: provenanceOf(best),
    supportingPassIds: best.supportPassIds,
    recoveryPassUsed: best.passKind !== "full-image-primary",
    alcoholDiagnostics: publicDiagnostics(),
  };
}

export function selectAlcoholObservation(results: RegionOcrResult[]): FieldSelection {
  const candidates: Candidate[] = [];
  const candidateDiagnostics: AlcoholCandidateDiagnosticInternal[] = [];
  let numberInOcr = false;
  let percentInOcr = false;
  let alcoholMarkerInOcr = false;
  let volumeMarkerInOcr = false;
  let sameLineEvidenceCluster = false;
  let adjacentLineEvidenceCluster = false;
  let filterRejectedCandidate = false;
  let parserRejectedCandidate = false;
  let sawAlcoholLikeText = false;
  let nextIdCounter = 0;
  const nextId = () => `alcohol-candidate-${nextIdCounter++}`;

  for (const result of results) {
    if (!result.fieldEligibility.alcohol) continue;
    for (const word of result.words) {
      if (alcoholHasDigits(word.text)) numberInOcr = true;
      if (word.text.includes("%")) percentInOcr = true;
      if (alcoholMarkerToken(word.text)) alcoholMarkerInOcr = true;
      if (alcoholVolumeToken(word.text)) volumeMarkerInOcr = true;
      if (
        alcoholHasDigits(word.text) ||
        word.text.includes("%") ||
        alcoholMarkerToken(word.text) ||
        alcoholVolumeToken(word.text) ||
        alcoholProofToken(word.text)
      ) {
        sawAlcoholLikeText = true;
      }
    }

    const groupedLines = lines(result.words);
    for (const [lineIndex, line] of groupedLines.entries()) {
      const windows = alcoholWindowsForWords(line, result, "same-line-window", [lineIndex], nextId);
      if (windows.length > 0) sameLineEvidenceCluster = true;
      for (const window of windows) {
        const analyzed = analyzeAlcoholWindow(window);
        candidateDiagnostics.push(analyzed.diagnostic);
        if (analyzed.candidate) {
          candidates.push(analyzed.candidate);
        } else {
          filterRejectedCandidate ||= analyzed.filterRejected;
          parserRejectedCandidate ||= analyzed.parserRejected;
        }
      }
    }

    for (let lineIndex = 0; lineIndex < groupedLines.length - 1; lineIndex++) {
      const upper = groupedLines[lineIndex];
      const lower = groupedLines[lineIndex + 1];
      if (!canMergeAlcoholLines(upper, lower)) continue;
      const mergedWords = [...upper, ...lower].sort((a, b) => {
        const ay = lineCenterY([a]);
        const by = lineCenterY([b]);
        if (Math.abs(ay - by) > 20) return ay - by;
        return a.bbox.x0 - b.bbox.x0;
      });
      const windows = alcoholWindowsForWords(
        mergedWords,
        result,
        "adjacent-line-window",
        [lineIndex, lineIndex + 1],
        nextId,
      );
      if (windows.length > 0) adjacentLineEvidenceCluster = true;
      for (const window of windows) {
        const analyzed = analyzeAlcoholWindow(window);
        candidateDiagnostics.push(analyzed.diagnostic);
        if (analyzed.candidate) {
          candidates.push(analyzed.candidate);
        } else {
          filterRejectedCandidate ||= analyzed.filterRejected;
          parserRejectedCandidate ||= analyzed.parserRejected;
        }
      }
    }
  }

  const keptIds = new Set(
    dedupeAlcoholCandidates(candidates)
      .map((candidate) => candidate.id)
      .filter(Boolean),
  );
  for (const candidate of candidateDiagnostics) {
    if (candidate.id && keptIds.has(candidate.id) && candidate.kept) candidate.kept = true;
  }

  return buildAlcoholObservation(candidates, {
    candidates: candidateDiagnostics,
    abstentionReason: sawAlcoholLikeText ? "unsupported-candidates-only" : "no-alcohol-like-text",
    numberInOcr,
    percentInOcr,
    alcoholMarkerInOcr,
    volumeMarkerInOcr,
    sameLineEvidenceCluster,
    adjacentLineEvidenceCluster,
    filterRejectedCandidate,
    parserRejectedCandidate,
    candidateAccepted: candidates.length > 0,
  });
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
/** Two candidates whose text height is within this ratio compete as ambiguous. */
const BRAND_PROMINENCE_RATIO = 0.8;
/** Only candidates near the strongest artwork prominence compete on score first. */
const BRAND_SCORE_PROMINENCE_FLOOR_RATIO = 0.4;
/** One-pixel inverse-mapping jitter must not flip low-prominence text into score-first ranking. */
const BRAND_SCORE_PROMINENCE_BUFFER_PX = 1;
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
  ocrEvidenceScore: number;
  ocrConfidence: AnalyzerOcrConfidence;
  geometry: EvidenceGeometry;
  passId: string;
  passKind: OcrPassKind;
  triggerReasons: OcrPassTriggerReason[];
  preprocessing: string[];
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
  const geometry = geometryFor(line);
  const ocrEvidenceScore = aggregateOcrEvidenceScore(line);
  const base = {
    rawText,
    cleanedValue: value.length > 0 ? value : null,
    confidence: ocrEvidenceScore,
    prominence: geometry.height,
    regionName: result.regionName,
    passId: result.passId,
    passKind: result.passKind,
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
    ocrEvidenceScore,
    ocrConfidence: ocrConfidenceOf(line),
    geometry,
    words: line,
    passId: result.passId,
    passKind: result.passKind,
    triggerReasons: result.triggerReasons,
    preprocessing: result.preprocessing,
    supportPassIds: [result.passId],
    supportPassKinds: [result.passKind],
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
  const geometry = geometryFor(words);
  return {
    id,
    words,
    rawText,
    value: cleanedBrandValue(rawText),
    ocrEvidenceScore: aggregateOcrEvidenceScore(words),
    ocrConfidence: ocrConfidenceOf(words),
    geometry,
    passId: result.passId,
    passKind: result.passKind,
    triggerReasons: result.triggerReasons,
    preprocessing: result.preprocessing,
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
    confidence: span.ocrEvidenceScore,
    ocrEvidenceScore: span.ocrEvidenceScore,
    ocrConfidence: span.ocrConfidence,
    prominence: span.prominence,
    regionName: span.regionName,
    passId: span.passId,
    passKind: span.passKind,
    supportPassIds: [span.passId],
    candidateProvenance: {
      passId: span.passId,
      passKind: span.passKind,
      triggerReasons: span.triggerReasons,
      preprocessing: span.preprocessing,
      regionName: span.regionName,
      supportingPassIds: [span.passId],
      supportingPassKinds: [span.passKind],
      recoveryPassUsed: span.passKind !== "full-image-primary",
    },
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
    ocrEvidenceScore: span.ocrEvidenceScore,
    ocrConfidence: span.ocrConfidence,
    geometry: span.geometry,
    words: span.words,
    passId: span.passId,
    passKind: span.passKind,
    triggerReasons: span.triggerReasons,
    preprocessing: span.preprocessing,
    supportPassIds: [span.passId],
    supportPassKinds: [span.passKind],
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
    candidate.ocrEvidenceScore +
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
    const candidateScore = candidate.score?.total ?? candidate.ocrEvidenceScore;
    const existingScore = existing.score?.total ?? existing.ocrEvidenceScore;
    if (
      candidateScore > existingScore ||
      (candidateScore === existingScore && candidate.ocrEvidenceScore > existing.ocrEvidenceScore)
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
    const candidateScore = candidate.score?.total ?? candidate.ocrEvidenceScore;
    const existingScore = existing.score?.total ?? existing.ocrEvidenceScore;
    if (
      candidateScore > existingScore ||
      (candidateScore === existingScore && candidate.ocrEvidenceScore > existing.ocrEvidenceScore)
    ) {
      byKey.set(key(candidate.value), mergeCandidateSupport(candidate, existing));
    } else {
      byKey.set(key(candidate.value), mergeCandidateSupport(existing, candidate));
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
    candidate.ocrEvidenceScore +
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
    ocrEvidenceScore: candidate.ocrEvidenceScore,
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

function brandRanking(
  candidate: Candidate,
  maxProminence: number,
  maxArea: number,
): AnalyzerCandidateRanking {
  const score = candidate.score ?? scoreBrandCandidate(candidate, maxProminence, maxArea);
  const prominenceFloor = maxProminence * BRAND_SCORE_PROMINENCE_FLOOR_RATIO;
  const scoreEligible = candidate.prominence > prominenceFloor + BRAND_SCORE_PROMINENCE_BUFFER_PX;
  const comparator: AnalyzerCandidateRanking["comparator"] = scoreEligible
    ? [
        { id: "score-eligibility", direction: "desc", value: scoreEligible },
        { id: "ranking-score", direction: "desc", value: score.total },
        { id: "prominence", direction: "desc", value: candidate.prominence },
        { id: "ocr-evidence-score", direction: "desc", value: candidate.ocrEvidenceScore },
        { id: "normalized-value-key", direction: "asc", value: key(candidate.value) },
      ]
    : [
        { id: "score-eligibility", direction: "desc", value: scoreEligible },
        { id: "prominence", direction: "desc", value: candidate.prominence },
        { id: "ocr-evidence-score", direction: "desc", value: candidate.ocrEvidenceScore },
        { id: "ranking-score", direction: "desc", value: score.total },
        { id: "normalized-value-key", direction: "asc", value: key(candidate.value) },
      ];
  return {
    strategy: "brand-mixed-prominence-score",
    orderingMode: scoreEligible ? "score-first" : "prominence-first",
    comparator,
    rankingScore: score.total,
    scoreFactors: [
      {
        id: "positive-signal",
        value: score.positiveSignal,
        contribution: candidate.brandClass === "positive" ? 2 : 0,
        direction: "benefit",
      },
      {
        id: "meaningful-chars",
        value: score.meaningfulChars,
        contribution: score.meaningfulChars * 1.6,
        direction: "benefit",
      },
      {
        id: "structure",
        value: score.structure,
        contribution: score.structure * 1.2,
        direction: "benefit",
      },
      {
        id: "ocr-evidence-score",
        value: score.ocrEvidenceScore,
        contribution: score.ocrEvidenceScore,
        direction: "benefit",
      },
      {
        id: "prominence",
        value: score.prominence,
        contribution: score.prominence * 0.8,
        direction: "benefit",
      },
      { id: "area", value: score.area, contribution: score.area * 0.6, direction: "benefit" },
      {
        id: "centrality",
        value: score.centrality,
        contribution: score.centrality * 0.3,
        direction: "benefit",
      },
      {
        id: "alignment",
        value: score.alignment,
        contribution: score.alignment * 0.25,
        direction: "benefit",
      },
      {
        id: "line-proximity",
        value: score.lineProximity,
        contribution: score.lineProximity * 0.2,
        direction: "benefit",
      },
      {
        id: "low-information-penalty",
        value: score.lowInformationPenalty,
        contribution: score.lowInformationPenalty * 1.8,
        direction: "penalty",
      },
      {
        id: "residual-penalty",
        value: score.residualPenalty,
        contribution: score.residualPenalty * 1.4,
        direction: "penalty",
      },
    ],
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
    if (!result.fieldEligibility.brand) continue;
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
      ocrEvidenceScore: candidate.ocrEvidenceScore,
      ocrConfidence: candidate.ocrConfidence,
      prominence: candidate.prominence,
      regionName: candidate.regionName,
      passId: candidate.passId,
      passKind: candidate.passKind,
      supportPassIds: candidate.supportPassIds,
      candidateProvenance: candidate.candidateProvenance,
      assembly: candidate.assembly,
      lineIndexes: candidate.lineIndexes,
      kept: candidate.kept,
      filterReason: candidate.filterReason,
      decision: candidate.decision,
      score: candidate.score,
      ranking: candidate.ranking,
    })),
    abstentionReason: diagnostics.abstentionReason,
  });

  if (candidates.length === 0) {
    return {
      observation: {
        state: "NOT_OBSERVED",
        value: null,
        confidence: 0,
        ocrEvidenceScore: 0,
        alternates: [],
      },
      sourceRegion: null,
      source: null,
      supportingPassIds: [],
      recoveryPassUsed: false,
      brandDiagnostics: publicDiagnostics(),
    };
  }

  const maxProminence = Math.max(...candidates.map((candidate) => candidate.prominence));
  const maxArea = Math.max(...candidates.map((candidate) => geometryArea(candidate.geometry)));
  const scored = candidates.map((candidate) => {
    const score = scoreBrandCandidate(candidate, maxProminence, maxArea);
    return {
      ...candidate,
      score,
      ranking: brandRanking({ ...candidate, score }, maxProminence, maxArea),
    };
  });
  const diagnosticById = new Map(
    diagnostics.candidates.map((candidate) => [candidate.id, candidate]),
  );
  for (const candidate of scored) {
    if (!candidate.id) continue;
    const diagnostic = diagnosticById.get(candidate.id);
    if (diagnostic) {
      diagnostic.score = candidate.score;
      diagnostic.ranking = candidate.ranking;
    }
  }

  const ranked = dedupeBestCandidates(bestFamilyCandidates(scored)).sort(compareCandidateRanking);
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
    best.ocrEvidenceScore < LOW_CONFIDENCE_THRESHOLD &&
    ranked.slice(1).some((candidate) => !corroborates(best.value, candidate.value));

  if (competing.length > 0 || weakContestedLead) {
    return {
      observation: observationFromCandidate(
        best,
        "AMBIGUOUS",
        distinctAlternates,
        "competing_candidates",
      ),
      sourceRegion: best.regionName,
      source: provenanceOf(best),
      supportingPassIds: best.supportPassIds,
      recoveryPassUsed: best.passKind !== "full-image-primary",
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
    best.brandClass === "positive" && best.ocrEvidenceScore >= LOW_CONFIDENCE_THRESHOLD;
  if (!positivelyDistinguished) {
    // A single plausible line that could not be positively distinguished as
    // brand presentation. It may be the only candidate (no rival to list), so it
    // is marked as a single unconfirmed candidate: usable, reviewable
    // uncertainty that stays schema-valid and never a silent OBSERVED match.
    return {
      observation: observationFromCandidate(
        best,
        "AMBIGUOUS",
        distinctAlternates,
        "single_unconfirmed_candidate",
      ),
      sourceRegion: best.regionName,
      source: provenanceOf(best),
      supportingPassIds: best.supportPassIds,
      recoveryPassUsed: best.passKind !== "full-image-primary",
      brandDiagnostics: publicDiagnostics(),
    };
  }

  return {
    observation: observationFromCandidate(best, "OBSERVED", distinctAlternates),
    sourceRegion: best.regionName,
    source: provenanceOf(best),
    supportingPassIds: best.supportPassIds,
    recoveryPassUsed: best.passKind !== "full-image-primary",
    brandDiagnostics: publicDiagnostics(),
  };
}
