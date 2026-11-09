/**
 * Stacked-Heading Brand Candidate Formation
 *
 * Deterministic, same-pass candidate formation rule for stacked brand headings
 * (e.g. "CHATEAU" + "BONNEAU", "DOMAINE" + "LEROY", "BODEGA" + "CATENA").
 *
 * Evaluated under Phase 2G as an authentic single-pass alternative to
 * synthetic multi-pass focus crops. Preserves original token confidences,
 * exact pixel bounding boxes, and pass provenance (no artificial second pass,
 * no invented confidence, no multi-pass consensus fabrication).
 */

import type { EvidenceGeometry } from "@/pipeline/analyzer/analyzer.types";

export const STACKED_HEADING_BRAND_PREFIXES = new Set([
  "CHATEAU",
  "CHÂTEAU",
  "DOMAINE",
  "BODEGA",
  "BODEGAS",
  "MAISON",
  "VILLA",
  "CASALE",
  "TENUTA",
  "CASTELLO",
]);

export const GENERIC_WINE_EXCLUSIONS = new Set([
  "WINE",
  "RED",
  "WHITE",
  "ROSE",
  "ROSÉ",
  "ROUGE",
  "DRY",
  "SWEET",
  "BRUT",
  "EXTRA",
  "RESERVE",
  "RESERVA",
  "VINTAGE",
  "TABLE",
  "PRODUCT",
  "PRODUCE",
  "ESTATE",
  "BOTTLED",
  "BOTTLE",
  "PRODUCED",
  "ALC",
  "VOL",
  "ML",
  "750ML",
  "CONTAINS",
  "SULFITES",
  "SULPHITES",
]);

export const VARIETAL_EXCLUSIONS = new Set([
  "CABERNET",
  "SAUVIGNON",
  "MERLOT",
  "CHARDONNAY",
  "PINOT",
  "NOIR",
  "GRIGIO",
  "GRIS",
  "BLANC",
  "SYRAH",
  "SHIRAZ",
  "MALBEC",
  "ZINFANDEL",
  "TEMPRANILLO",
  "MENCIA",
  "NEBBIOLO",
  "SANGIOVESE",
  "GARNACHA",
  "GRENACHE",
  "RIESLING",
  "VIOGNIER",
  "CHENIN",
  "MOSCATO",
  "MUSCAT",
  "PROSECCO",
  "GLERA",
  "ALBARINO",
  "ALBARIÑO",
  "VERMENTINO",
  "ARNEIS",
  "TREBBIANO",
  "NEGROAMARO",
  "PRIMITIVO",
  "CORVINA",
  "RONDINELLA",
]);

export const APPELLATION_EXCLUSIONS = new Set([
  "PAESTUM",
  "BORDEAUX",
  "RIOJA",
  "NAPA",
  "SONOMA",
  "BURGUNDY",
  "BOURGOGNE",
  "CHAMPAGNE",
  "CHIANTI",
  "BAROLO",
  "BARBARESCO",
  "TUSCANY",
  "TOSCANA",
  "VALPOLICELLA",
  "PRIORAT",
  "MENDOZA",
  "COLCHAGUA",
  "CORTON",
  "ALOXECORTON",
  "BEAUJOLAIS",
  "CHABLIS",
  "MEDOC",
  "GRAVES",
  "POMEROL",
  "SAINTEMILION",
]);

/**
 * Normalize an uppercase text token by stripping diacritics and non-letter characters.
 */
export function normalizeToken(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/**
 * Check if a token is a recognized brand prefix heading.
 */
export function isRecognizedBrandPrefix(text: string): boolean {
  const norm = normalizeToken(text);
  return STACKED_HEADING_BRAND_PREFIXES.has(norm);
}

/**
 * Check if the candidate lower line token contains numbers, generic wine
 * descriptors, varietals, or geographic appellations that disqualify it
 * from being a brand proper noun.
 */
export function isInvalidLowerLine(text: string, rawText?: string): boolean {
  // Reject any token or raw line containing digits (e.g. postal codes, vintages)
  if (/\d/.test(text) || (rawText !== undefined && /\d/.test(rawText))) {
    return true;
  }

  const clean = normalizeToken(text);

  // Proper noun must have at least 3 letters
  if (clean.length < 3) return true;

  if (GENERIC_WINE_EXCLUSIONS.has(clean)) return true;
  if (VARIETAL_EXCLUSIONS.has(clean)) return true;
  if (APPELLATION_EXCLUSIONS.has(clean)) return true;

  // Also check individual sub-tokens if hyphenated or compound
  const subTokens = text
    .split(/[-_\s]+/)
    .map(normalizeToken)
    .filter((t) => t.length > 0);
  if (
    subTokens.some(
      (t) =>
        GENERIC_WINE_EXCLUSIONS.has(t) ||
        VARIETAL_EXCLUSIONS.has(t) ||
        APPELLATION_EXCLUSIONS.has(t),
    )
  ) {
    return true;
  }

  return false;
}

export interface StackedHeadingGeometryResult {
  valid: boolean;
  gap: number;
  averageHeight: number;
  verticalGapRatio: number;
  centerOffset: number;
  reason?: string;
}

/**
 * Evaluate geometric adjacency and horizontal center alignment between
 * an upper prefix line and lower proper noun line.
 *
 * Thresholds:
 * - Upper line must be above lower line (uBottom <= lBottom, lTop >= uGeom.y)
 * - Vertical proximity: gap <= avgH * maxGapRatio (default 1.8)
 * - Horizontal center alignment: centerOffset <= maxCenterOffset (default 0.45)
 */
export function evaluateStackedHeadingGeometry(
  upperGeom: { x: number; y: number; width: number; height: number },
  lowerGeom: { x: number; y: number; width: number; height: number },
  maxGapRatio = 1.8,
  maxCenterOffset = 0.45,
): StackedHeadingGeometryResult {
  const uBottom = upperGeom.y + upperGeom.height;
  const lTop = lowerGeom.y;
  const gap = Math.max(0, lTop - uBottom);
  const avgH = Math.max(1, (upperGeom.height + lowerGeom.height) / 2);
  const verticalGapRatio = gap / avgH;

  // Upper line must be strictly above lower line
  if (lTop < upperGeom.y) {
    return {
      valid: false,
      gap,
      averageHeight: avgH,
      verticalGapRatio,
      centerOffset: 1,
      reason: "upper-line-below-lower-line",
    };
  }

  if (verticalGapRatio > maxGapRatio) {
    return {
      valid: false,
      gap,
      averageHeight: avgH,
      verticalGapRatio,
      centerOffset: 1,
      reason: "excessive-vertical-gap",
    };
  }

  const uCenter = upperGeom.x + upperGeom.width / 2;
  const lCenter = lowerGeom.x + lowerGeom.width / 2;
  const maxW = Math.max(upperGeom.width, lowerGeom.width, 1);
  const centerOffset = Math.abs(uCenter - lCenter) / maxW;

  if (centerOffset > maxCenterOffset) {
    return {
      valid: false,
      gap,
      averageHeight: avgH,
      verticalGapRatio,
      centerOffset,
      reason: "excessive-horizontal-offset",
    };
  }

  return {
    valid: true,
    gap,
    averageHeight: avgH,
    verticalGapRatio,
    centerOffset,
  };
}

/**
 * Predicate to decide whether two vertically adjacent single-line candidates
 * form a legitimate narrow stacked-heading brand pair.
 */
export function isNarrowStackedHeadingPair(
  upper: { words: readonly { text: string }[]; value: string; geometry: EvidenceGeometry },
  lower: { words: readonly { text: string }[]; value: string; geometry: EvidenceGeometry },
): boolean {
  // Upper line must be a single word matching a recognized brand prefix
  if (upper.words.length !== 1) return false;
  if (!isRecognizedBrandPrefix(upper.words[0].text)) return false;

  // Lower line must be a single word proper noun (no digits, no generic wine words, no varietals, no appellations)
  if (lower.words.length !== 1) return false;
  if (isInvalidLowerLine(lower.words[0].text, lower.value)) return false;

  // Geometry checks
  const geomCheck = evaluateStackedHeadingGeometry(upper.geometry, lower.geometry);
  return geomCheck.valid;
}
