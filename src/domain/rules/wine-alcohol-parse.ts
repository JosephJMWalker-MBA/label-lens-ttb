/**
 * Bounded, decimal-safe parsing of wine alcohol statements under 27 CFR 4.36.
 *
 * This is deliberately NOT a general alcohol normalizer: it does not handle
 * proof, unitless numbers, or arbitrary prose, and it never applies any
 * actual-content tolerance. Percentages are represented as integer basis points
 * (hundredths of a percent) so comparison is exact and free of floating-point
 * error — `12.5%` is `1250`, `12.50%` is also `1250`.
 */

/** Percent expressed as an exact integer number of basis points (percent × 100). */
export type BasisPoints = number;

export type WineAlcoholParse =
  | { kind: "direct"; basisPoints: BasisPoints }
  | { kind: "range"; lowerBasisPoints: BasisPoints; upperBasisPoints: BasisPoints }
  | { kind: "proof" }
  | { kind: "malformed" };

/** Lowercase, NFC, collapse whitespace. No fuzzy transformation. */
function normalizeStatement(raw: string): string {
  return raw.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Convert a bare decimal string to exact basis points, or null if it is not a
 * plain non-negative decimal in [0, 100] with at most two fractional digits.
 * No floating-point arithmetic and no silent rounding.
 */
export function decimalToBasisPoints(raw: string): BasisPoints | null {
  const trimmed = raw.trim();
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return null;
  const [intPart, fracPart = ""] = trimmed.replace(",", ".").split(".");
  if (fracPart.length > 2) return null; // refuse to silently round finer precision
  const frac2 = (fracPart + "00").slice(0, 2);
  const basisPoints = Number(intPart) * 100 + Number(frac2);
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) return null;
  return basisPoints;
}

/** Parse an operator-declared application alcohol value (a bare percentage). */
export function parseDeclaredAlcoholValue(raw: string): BasisPoints | null {
  // Tolerate a single trailing percent sign; nothing else.
  const stripped = raw.trim().replace(/%$/, "").trim();
  return decimalToBasisPoints(stripped);
}

const VOL_WORD = String.raw`vol(?:ume)?\.?`;
const ALC_PREFIX = String.raw`(?:alcohol|alc\.?)\s+`;
const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const PERCENT = `${NUMBER}\\s*%`;
const RANGE_PERCENTS = String.raw`(\d+(?:[.,]\d+)?)\s*%?\s*(?:to|through|-|–|—)\s*(\d+(?:[.,]\d+)?)\s*%`;
const VOL_MARKER_BY = String.raw`by\s+${VOL_WORD}`;
const VOL_MARKER_ALC_SLASH = String.raw`alc\.?\s*/\s*${VOL_WORD}`;
const VOL_MARKER_ALC_BY = String.raw`alc\.?\s+by\s+${VOL_WORD}`;

// The COMPLETE normalized statement must be one permitted form, anchored at
// both ends. This keeps lawful markers from being accepted when embedded in
// unrelated prose and lets the extractor normalize only the narrow supported
// alcohol-by-volume forms it can justify from OCR evidence.
const DIRECT_STATEMENTS = [
  new RegExp(`^${PERCENT}\\s*${VOL_MARKER_BY}$`),
  new RegExp(`^${PERCENT}\\s*${VOL_MARKER_ALC_SLASH}$`),
  new RegExp(`^${PERCENT}\\s*${VOL_MARKER_ALC_BY}$`),
  new RegExp(`^${ALC_PREFIX}${PERCENT}\\s*${VOL_MARKER_BY}$`),
  new RegExp(`^${ALC_PREFIX}${PERCENT}\\s*${VOL_WORD}$`),
  new RegExp(`^${ALC_PREFIX}${NUMBER}\\s*${VOL_MARKER_BY}$`),
  new RegExp(`^${ALC_PREFIX}${NUMBER}\\s*${VOL_WORD}$`),
] as const;
const RANGE_STATEMENT = new RegExp(
  `^(?:${ALC_PREFIX})?${RANGE_PERCENTS}\\s*(?:${VOL_MARKER_ALC_SLASH}|${VOL_MARKER_ALC_BY}|${VOL_MARKER_BY})$`,
);

/**
 * Parse a wine alcohol statement into a bounded, deterministic form. Only the
 * direct-percentage and bounded-range forms with a permitted volume marker are
 * recognized, and the whole statement must match with no surrounding prose;
 * everything else is `proof` or `malformed`.
 */
export function parseWineAlcoholStatement(raw: string): WineAlcoholParse {
  const norm = normalizeStatement(raw);

  // Proof is a distilled-spirits construct and is never a valid wine statement.
  if (/\bproof\b/.test(norm)) return { kind: "proof" };

  const rangeMatch = norm.match(RANGE_STATEMENT);
  if (rangeMatch) {
    const lower = decimalToBasisPoints(rangeMatch[1]);
    const upper = decimalToBasisPoints(rangeMatch[2]);
    if (lower === null || upper === null) return { kind: "malformed" };
    if (lower > upper) return { kind: "malformed" }; // reversed range
    return { kind: "range", lowerBasisPoints: lower, upperBasisPoints: upper };
  }

  for (const directStatement of DIRECT_STATEMENTS) {
    const directMatch = norm.match(directStatement);
    if (!directMatch) continue;
    const basisPoints = decimalToBasisPoints(directMatch[1]);
    if (basisPoints === null) return { kind: "malformed" };
    return { kind: "direct", basisPoints };
  }

  return { kind: "malformed" };
}
