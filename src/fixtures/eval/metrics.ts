import type { AnalyzerObservationState } from "@/pipeline/analyzer/analyzer.types";

import type { EvalAlcoholTruth, EvalBrandTruth, EvalFailureClass } from "./eval-manifest.types";

/**
 * Pure scoring and failure-classification for the evaluation harness.
 *
 * Nothing here runs OCR or reads the filesystem: it consumes an already-computed
 * observation projection plus bounded diagnostics, so every rule is
 * deterministic and unit-testable with synthetic inputs. The metrics encode the
 * product standard — a correct-or-useful candidate reached the reviewer AND
 * uncertainty was represented honestly — not merely "OCR returned text".
 */

/** Minimal projection of an analyzer field observation the metrics need. */
export interface ObservedField {
  state: AnalyzerObservationState;
  value: string | null;
  confidence: number;
  alternates: { value: string; confidence: number }[];
}

/** Bounded, OCR-derived signals used only to locate where evidence was lost. */
export interface BrandDiagnostics {
  /** An acceptable brand string appears in the raw OCR text of the brand region. */
  ocrContainsAcceptable: boolean;
}

export interface AlcoholDiagnostics {
  /** The expected alcohol number appears somewhere in the OCR text. */
  numberInOcr: boolean;
  /** A "%" token appears somewhere in the OCR text. */
  percentInOcr: boolean;
  /** The number and a "%" were recognized on the same reconstructed line. */
  numberAndPercentSameLine: boolean;
}

// ---------------------------------------------------------------------------
// Text normalization (shared, punctuation/diacritic tolerant).
// ---------------------------------------------------------------------------

/** Fold case and collapse whitespace; punctuation preserved. */
export function foldExact(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Compact comparison key: strip diacritics and all non-alphanumerics. Makes
 * "Château Bonneau", "CHATEAU  BONNEAU", and "chateau-bonneau" compare equal,
 * and tolerates a dropped "&" or apostrophe from OCR. Used for top-k matching.
 */
export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Exact (case/whitespace-folded) match against any acceptable answer. */
export function brandExactMatch(value: string | null, acceptable: string[]): boolean {
  if (!value) return false;
  const folded = foldExact(value);
  return acceptable.some((a) => foldExact(a) === folded);
}

/** Normalized (punctuation/diacritic-tolerant) match against any acceptable answer. */
export function brandNormalizedMatch(value: string | null, acceptable: string[]): boolean {
  if (!value) return false;
  const key = normalizeKey(value);
  if (key.length === 0) return false;
  return acceptable.some((a) => normalizeKey(a) === key);
}

/**
 * Whether any acceptable brand appears as a normalized substring of the text —
 * e.g. "LUIGI & GIOVANNI" embedded in a longer merged OCR line. Used only for
 * diagnostics (did OCR read the brand at all?), never for the match metric.
 */
export function normalizedIncludes(text: string, acceptable: string[]): boolean {
  const hay = normalizeKey(text);
  return acceptable.some((a) => {
    const needle = normalizeKey(a);
    return needle.length > 0 && hay.includes(needle);
  });
}

/**
 * Whether an acceptable brand appears among the top-k candidates (selected value
 * first, then alternates in order). Uses normalized matching so punctuation and
 * accents do not cause a false miss.
 */
export function brandInTopK(observed: ObservedField, acceptable: string[], k: number): boolean {
  const ranked = [observed.value, ...observed.alternates.map((a) => a.value)]
    .filter((v): v is string => typeof v === "string")
    .slice(0, k);
  return ranked.some((v) => brandNormalizedMatch(v, acceptable));
}

// ---------------------------------------------------------------------------
// Alcohol parsing.
// ---------------------------------------------------------------------------

/** First percentage-like number in an observed alcohol value (comma or dot). */
export function parseObservedPercent(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/(\d{1,2}(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number.parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Parsed alcohol value matches an acceptable percent within a small tolerance. */
export function alcoholParsedAccurate(value: string | null, acceptable: number[]): boolean {
  const parsed = parseObservedPercent(value);
  if (parsed === null) return false;
  return acceptable.some((a) => Math.abs(a - parsed) < 0.05);
}

/** Alcohol detected = a present observation of any confidence (not NOT_OBSERVED). */
export function alcoholDetected(observed: ObservedField): boolean {
  return observed.state !== "NOT_OBSERVED" && observed.value !== null;
}

// ---------------------------------------------------------------------------
// Failure classification (one class per field; never a single "incorrect").
// ---------------------------------------------------------------------------

export function classifyBrand(
  truth: EvalBrandTruth,
  observed: ObservedField,
  diag: BrandDiagnostics,
): EvalFailureClass {
  const selectedAcceptable =
    brandExactMatch(observed.value, truth.acceptable) ||
    brandNormalizedMatch(observed.value, truth.acceptable);

  if (truth.knownAmbiguous) {
    // The label has no single objectively-correct brand from the artwork.
    if (observed.state === "AMBIGUOUS" || observed.state === "LOW_CONFIDENCE") {
      return "correct-uncertainty";
    }
    if (observed.state === "OBSERVED") {
      // A confident single pick hides real ambiguity, even if plausible.
      return "false-certainty";
    }
    return "candidate-generation-failure"; // NOT_OBSERVED: nothing surfaced for review
  }

  // A single correct brand exists.
  if (selectedAcceptable) {
    return observed.state === "AMBIGUOUS" ? "correct-uncertainty" : "correct";
  }

  // A confident but wrong brand is the worst outcome: certainty without support.
  if (observed.state === "OBSERVED") return "false-certainty";

  // Wrong (or deferred) primary: locate where the correct answer was lost.
  if (brandInTopK(observed, truth.acceptable, 3)) return "candidate-ranking-failure";
  if (diag.ocrContainsAcceptable) return "candidate-filtering-failure";
  if (observed.state === "NOT_OBSERVED") return "candidate-generation-failure";
  return "ocr-recognition-failure";
}

export function classifyAlcohol(
  truth: EvalAlcoholTruth,
  observed: ObservedField,
  diag: AlcoholDiagnostics,
): EvalFailureClass {
  if (!truth.present) {
    // Correct absence is a success; any emitted value is a false positive.
    return alcoholDetected(observed) ? "false-certainty" : "correct";
  }

  if (alcoholDetected(observed)) {
    return alcoholParsedAccurate(observed.value, truth.acceptablePercents)
      ? "correct"
      : "parser-failure";
  }

  // Present on the label but NOT_OBSERVED: locate where detection was lost.
  if (!diag.numberInOcr) return "ocr-recognition-failure";
  if (diag.percentInOcr && !diag.numberAndPercentSameLine) return "line-reconstruction-failure";
  // Number recognized (with "%" absent or on the same line as a separate token),
  // yet no candidate formed — the digit-and-"%"-in-one-token gate rejected it.
  return "candidate-generation-failure";
}

// ---------------------------------------------------------------------------
// Aggregation.
// ---------------------------------------------------------------------------

export interface FieldCaseScore {
  caseId: string;
  brandClass: EvalFailureClass;
  alcoholClass: EvalFailureClass;
  brandKnownAmbiguous: boolean;
  alcoholPresent: boolean;
  brandExact: boolean;
  brandNormalized: boolean;
  brandTop3: boolean;
  alcoholDetected: boolean;
  alcoholParsedAccurate: boolean;
  latencyMs: number;
}

export interface AggregateMetrics {
  caseCount: number;
  /** Denominator for brand accuracy = cases with a single correct brand. */
  determinateBrandCount: number;
  brandExactMatchRate: number;
  brandNormalizedAcceptableRate: number;
  brandTop3Recall: number;
  presentAlcoholCount: number;
  alcoholDetectionRecall: number;
  alcoholParsedValueAccuracy: number;
  absentAlcoholCount: number;
  absentFieldFalsePositiveRate: number;
  ambiguousBrandCount: number;
  /** Of genuinely-ambiguous labels, the share the extractor honestly deferred. */
  ambiguityHonestyRate: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  brandFailureCounts: Record<EvalFailureClass, number>;
  alcoholFailureCounts: Record<EvalFailureClass, number>;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Deterministic percentile via nearest-rank on a sorted copy (no interpolation). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function emptyClassCounts(): Record<EvalFailureClass, number> {
  return {
    correct: 0,
    "correct-uncertainty": 0,
    "ocr-recognition-failure": 0,
    "region-coverage-failure": 0,
    "line-reconstruction-failure": 0,
    "candidate-generation-failure": 0,
    "candidate-filtering-failure": 0,
    "candidate-ranking-failure": 0,
    "parser-failure": 0,
    "false-certainty": 0,
  };
}

export function aggregate(scores: FieldCaseScore[]): AggregateMetrics {
  const determinate = scores.filter((s) => !s.brandKnownAmbiguous);
  const ambiguous = scores.filter((s) => s.brandKnownAmbiguous);
  const present = scores.filter((s) => s.alcoholPresent);
  const absent = scores.filter((s) => !s.alcoholPresent);

  const brandFailureCounts = emptyClassCounts();
  const alcoholFailureCounts = emptyClassCounts();
  for (const s of scores) {
    brandFailureCounts[s.brandClass] += 1;
    alcoholFailureCounts[s.alcoholClass] += 1;
  }

  const latencies = scores.map((s) => s.latencyMs);

  return {
    caseCount: scores.length,
    determinateBrandCount: determinate.length,
    brandExactMatchRate: rate(determinate.filter((s) => s.brandExact).length, determinate.length),
    brandNormalizedAcceptableRate: rate(
      determinate.filter((s) => s.brandNormalized).length,
      determinate.length,
    ),
    brandTop3Recall: rate(determinate.filter((s) => s.brandTop3).length, determinate.length),
    presentAlcoholCount: present.length,
    alcoholDetectionRecall: rate(present.filter((s) => s.alcoholDetected).length, present.length),
    alcoholParsedValueAccuracy: rate(
      present.filter((s) => s.alcoholParsedAccurate).length,
      present.length,
    ),
    absentAlcoholCount: absent.length,
    absentFieldFalsePositiveRate: rate(
      absent.filter((s) => s.alcoholDetected).length,
      absent.length,
    ),
    ambiguousBrandCount: ambiguous.length,
    ambiguityHonestyRate: rate(
      ambiguous.filter((s) => s.brandClass === "correct-uncertainty" || s.brandClass === "correct")
        .length,
      ambiguous.length,
    ),
    medianLatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    brandFailureCounts,
    alcoholFailureCounts,
  };
}
