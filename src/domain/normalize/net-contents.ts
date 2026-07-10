/**
 * Net-contents normalization to canonical milliliters.
 *
 * Handles "750 mL", "750ml", "1 L", "1.75 L", "50 mL" and centiliters so that
 * equivalent volumes expressed in different units compare as equal. Non-metric
 * units are out of scope for the prototype and return null.
 */
export interface NormalizedNetContents {
  original: string;
  /** Volume in milliliters, or null when unparseable. */
  milliliters: number | null;
}

const UNIT_TO_ML: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  cl: 10,
  centiliter: 10,
  centiliters: 10,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
};

const QUANTITY = /(\d+(?:\.\d+)?)\s*(ml|milliliters?|cl|centiliters?|l|li(?:ter|tre)s?)\b/i;

export function normalizeNetContents(original: string): NormalizedNetContents {
  const match = original.match(QUANTITY);
  if (!match) {
    return { original, milliliters: null };
  }

  const amount = Number(match[1]);
  const factor = UNIT_TO_ML[match[2].toLowerCase()];
  return { original, milliliters: round(amount * factor) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
