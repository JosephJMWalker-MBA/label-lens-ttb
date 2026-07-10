import { normalizeText } from "@/domain/normalize/text";

import { similarity } from "./levenshtein";

/**
 * Explainable comparison of two text values.
 *
 * This layer classifies *equivalence*, not compliance. It answers "are these the
 * same value a human would accept?" and explains why — it never returns a
 * pass/fail status. Rules decide policy; this only reports evidence.
 *
 * - exact:      identical as written.
 * - equivalent: identical after conservative normalization (case, spacing,
 *               apostrophe style, surrounding punctuation).
 * - different:  not equivalent. `similarity` is included so a rule may choose to
 *               warn on a near-miss, but this layer never hides the difference.
 */
export type Equivalence = "exact" | "equivalent" | "different";

export interface ComparisonResult {
  equivalence: Equivalence;
  normalizedExpected: string;
  normalizedObserved: string;
  /** Character similarity of the normalized forms, in [0, 1]. */
  similarity: number;
  /** Human-readable explanation of the classification. */
  reason: string;
}

export function compareText(expected: string, observed: string): ComparisonResult {
  const normExpected = normalizeText(expected);
  const normObserved = normalizeText(observed);
  const score = round(similarity(normExpected.canonical, normObserved.canonical));

  const base = {
    normalizedExpected: normExpected.canonical,
    normalizedObserved: normObserved.canonical,
    similarity: score,
  };

  if (expected === observed) {
    return { ...base, equivalence: "exact", reason: "Values are identical." };
  }

  if (normExpected.canonical === normObserved.canonical) {
    return {
      ...base,
      equivalence: "equivalent",
      reason: "Values differ only by case, spacing, apostrophe style, or punctuation.",
    };
  }

  return {
    ...base,
    equivalence: "different",
    reason: `Values differ (similarity ${score}); expected "${expected}", observed "${observed}".`,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
