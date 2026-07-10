/**
 * Alcohol-content normalization to a canonical ABV percentage.
 *
 * Handles the common presentations — "40% ABV", "40%", "ALC. 40% BY VOL",
 * "80 proof" — by reducing them to a numeric ABV so "40% ABV" and "80 proof"
 * compare as equal. Proof is defined as twice the ABV (US convention).
 */
export interface NormalizedAlcohol {
  original: string;
  /** Alcohol by volume as a percentage, or null when unparseable. */
  abv: number | null;
}

const PERCENT = /(\d+(?:\.\d+)?)\s*%/;
const PROOF = /(\d+(?:\.\d+)?)\s*proof/i;

export function normalizeAlcohol(original: string): NormalizedAlcohol {
  const percentMatch = original.match(PERCENT);
  if (percentMatch) {
    return { original, abv: round(Number(percentMatch[1])) };
  }

  const proofMatch = original.match(PROOF);
  if (proofMatch) {
    return { original, abv: round(Number(proofMatch[1]) / 2) };
  }

  return { original, abv: null };
}

/** Round to two decimals to avoid floating-point noise in comparisons. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
