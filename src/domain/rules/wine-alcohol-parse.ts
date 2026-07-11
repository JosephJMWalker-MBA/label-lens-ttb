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
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [intPart, fracPart = ""] = trimmed.split(".");
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

// A recognized "by volume" marker justified by § 4.36. The bare word "alcohol"
// alone is NOT a marker, so arbitrary prose containing a percentage is rejected.
const VOL_MARKER = /alc\.?\s*\/\s*vol\.?|alc\.?\s+by\s+vol\.?|by\s+vol(?:ume)?\.?/;
const PERCENT_TOKEN = /(\d+(?:\.\d+)?)\s*%/g;
const RANGE_TOKENS = /(\d+(?:\.\d+)?)\s*%?\s*(?:to|through|-|–|—)\s*(\d+(?:\.\d+)?)\s*%/;

/**
 * Parse a wine alcohol statement into a bounded, deterministic form. Only the
 * direct-percentage and bounded-range forms with a permitted volume marker are
 * recognized; everything else is `proof` or `malformed`.
 */
export function parseWineAlcoholStatement(raw: string): WineAlcoholParse {
  const norm = normalizeStatement(raw);

  // Proof is a distilled-spirits construct and is never a valid wine statement.
  if (/\bproof\b/.test(norm)) return { kind: "proof" };

  // A permitted "by volume" marker is mandatory: this rejects unitless numbers,
  // unsupported abbreviations, and arbitrary prose containing a percentage.
  if (!VOL_MARKER.test(norm)) return { kind: "malformed" };

  const rangeMatch = norm.match(RANGE_TOKENS);
  if (rangeMatch) {
    const lower = decimalToBasisPoints(rangeMatch[1]);
    const upper = decimalToBasisPoints(rangeMatch[2]);
    if (lower === null || upper === null) return { kind: "malformed" };
    if (lower > upper) return { kind: "malformed" }; // reversed range
    return { kind: "range", lowerBasisPoints: lower, upperBasisPoints: upper };
  }

  // Direct form: exactly one percentage. Two or more is contradictory and is
  // never an automatic pass.
  const percents = [...norm.matchAll(PERCENT_TOKEN)];
  if (percents.length !== 1) return { kind: "malformed" };
  const basisPoints = decimalToBasisPoints(percents[0][1]);
  if (basisPoints === null) return { kind: "malformed" };
  return { kind: "direct", basisPoints };
}
