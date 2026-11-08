/**
 * Scoring for the private vision reader against the frozen wine corpus.
 *
 * Evaluation-only: this module reads corpus truth and must never be imported by
 * production code. It answers two questions, kept separate on purpose:
 *
 *   1. Whole-label observation — when the reader transcribes the entire label,
 *      is the true brand / alcohol statement present in what it read? This is
 *      the first rung of the evidence-survival ladder (Issue #225) and is
 *      comparable in spirit to the Tesseract "truth in raw OCR" measure from
 *      #223, but word-boundary aware, so a brand glued inside a URL or a longer
 *      token does not count.
 *   2. Bounded production path — given a human-approved region, does the exact
 *      production mapping (sellerRegionReadingFromTranscription) produce a value
 *      the package workflow would treat as matching truth, and is it ever
 *      reliable-but-wrong (false certainty)?
 */

import { compareText } from "@/domain/compare/semantic";
import { decimalToBasisPoints } from "@/domain/rules/wine-alcohol-parse";

/** Lowercase, fold diacritics and typographic quotes, turn punctuation into word breaks. */
export function normalizeForPresence(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** True when any acceptable presentation appears as whole words in the transcript. */
export function brandPresentInTranscript(
  lines: readonly string[],
  acceptablePresentations: readonly string[],
): boolean {
  const haystack = ` ${normalizeForPresence(lines.join(" "))} `;
  return acceptablePresentations.some((presentation) => {
    const needle = normalizeForPresence(presentation);
    return needle.length > 0 && haystack.includes(` ${needle} `);
  });
}

const PERCENT_THEN_MARKER =
  /(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*(?:alc\b|alc\.|alcohol|by\s+vol|vol\b|vol\.|abv)/gi;
const MARKER_THEN_PERCENT =
  /(?:alc\.?|alcohol|abv)\s*(?:by\s+vol(?:ume)?\.?)?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/gi;

/**
 * Alcohol percentages stated anywhere in a whole-label transcript, in basis
 * points. Deliberately broader than the production parser (which requires the
 * whole bounded string to be a permitted statement): this measures whether the
 * statement was *observed*, not whether a selector would pick it.
 */
export function alcoholPercentsInTranscript(lines: readonly string[]): number[] {
  const texts = [...lines];
  for (let index = 0; index + 1 < lines.length; index += 1) {
    texts.push(`${lines[index]} ${lines[index + 1]}`);
  }
  const found = new Set<number>();
  for (const text of texts) {
    for (const pattern of [PERCENT_THEN_MARKER, MARKER_THEN_PERCENT]) {
      for (const match of text.matchAll(pattern)) {
        const basisPoints = decimalToBasisPoints(match[1]);
        if (basisPoints !== null && basisPoints > 0) found.add(basisPoints);
      }
    }
  }
  return [...found].sort((a, b) => a - b);
}

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

/** Same equivalence the package workflow uses for brand comparison. */
export function brandValueMatches(
  observed: string | null,
  acceptablePresentations: readonly string[],
): boolean {
  if (!observed) return false;
  return acceptablePresentations.some(
    (presentation) => compareText(presentation, observed).equivalence !== "different",
  );
}

export interface WholeLabelCaseResult {
  caseId: string;
  ok: boolean;
  errorCode: string | null;
  latencyMs: number | null;
  legibility: string | null;
  lineCount: number;
  brand: { presence: "present" | "absent"; observed: boolean | null };
  alcohol: {
    presence: "present" | "absent";
    expectedBasisPoints: number[];
    foundBasisPoints: number[];
    correct: boolean | null;
    falsePositive: boolean | null;
  };
}

export interface BoundedBrandCaseResult {
  caseId: string;
  occurrence: string;
  ok: boolean;
  errorCode: string | null;
  latencyMs: number | null;
  observedValue: string | null;
  evidenceState: string | null;
  reliable: boolean;
  matchesTruth: boolean;
}

function ratio(numerator: number, denominator: number): string {
  if (denominator === 0) return "n/a";
  return `${numerator}/${denominator} (${((100 * numerator) / denominator).toFixed(1)}%)`;
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function summarizeWholeLabel(results: readonly WholeLabelCaseResult[]) {
  const answered = results.filter((result) => result.ok);
  const brandPresent = answered.filter((result) => result.brand.presence === "present");
  const alcoholPresent = answered.filter((result) => result.alcohol.presence === "present");
  const alcoholAbsent = answered.filter((result) => result.alcohol.presence === "absent");
  const latencies = answered.flatMap((result) =>
    result.latencyMs === null ? [] : [result.latencyMs],
  );
  return {
    cases: results.length,
    readerFailures: results.length - answered.length,
    brandObserved: ratio(
      brandPresent.filter((result) => result.brand.observed).length,
      brandPresent.length,
    ),
    alcoholCorrectPercentObserved: ratio(
      alcoholPresent.filter((result) => result.alcohol.correct).length,
      alcoholPresent.length,
    ),
    alcoholFalsePositivesOnAbsent: ratio(
      alcoholAbsent.filter((result) => result.alcohol.falsePositive).length,
      alcoholAbsent.length,
    ),
    latencyMedianMs: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
  };
}

export function summarizeBoundedBrand(results: readonly BoundedBrandCaseResult[]) {
  const answered = results.filter((result) => result.ok);
  const latencies = answered.flatMap((result) =>
    result.latencyMs === null ? [] : [result.latencyMs],
  );
  return {
    regions: results.length,
    readerFailures: results.length - answered.length,
    matchesTruth: ratio(answered.filter((result) => result.matchesTruth).length, answered.length),
    reliableAndCorrect: ratio(
      answered.filter((result) => result.reliable && result.matchesTruth).length,
      answered.length,
    ),
    reliableButWrong: ratio(
      answered.filter((result) => result.reliable && !result.matchesTruth).length,
      answered.length,
    ),
    latencyMedianMs: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
  };
}
