/**
 * Conservative canonical normalization for brand-name comparison.
 *
 * This is deliberately NOT fuzzy matching: no edit distance, embeddings, token
 * similarity, word reordering, arbitrary word removal, acronym inference, or
 * translation. It only folds human-obvious presentation differences and removes
 * at most one approved terminal legal-entity suffix.
 */

/** Approved terminal legal-entity suffixes, compared with punctuation removed. */
const APPROVED_SUFFIXES: ReadonlySet<string> = new Set(
  [
    "LLC",
    "L.L.C.",
    "INC",
    "INC.",
    "INCORPORATED",
    "CORP",
    "CORP.",
    "CORPORATION",
    "CO",
    "CO.",
    "COMPANY",
    "LTD",
    "LTD.",
    "LIMITED",
    "LLP",
    "L.L.P.",
    "LP",
    "L.P.",
    "PLC",
    "P.L.C.",
  ].map((s) => s.replace(/\./g, "").toLowerCase()),
);

export interface CanonicalBrand {
  original: string;
  /** Case/whitespace/punctuation-folded form, no suffix removed. */
  base: string;
  /** `base` after removing one approved terminal suffix, if any. */
  stripped: string;
  /** The terminal suffix token that was removed, or null. */
  suffixRemoved: string | null;
}

function foldBase(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[‘’ʼ′]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeBrand(value: string): CanonicalBrand {
  const base = foldBase(value);

  // Find a terminal token preceded by a comma/whitespace separator. Requiring a
  // separator means a leading or embedded token (e.g. "co cellars") is untouched.
  const match = base.replace(/[.,\s]+$/, "").match(/[\s,]+([a-z.]+)$/);
  if (match) {
    const candidate = match[1].replace(/\./g, "");
    if (APPROVED_SUFFIXES.has(candidate)) {
      const stripped = base.slice(0, match.index).replace(/[.,\s]+$/, "");
      if (stripped.length > 0) {
        return { original: value, base, stripped, suffixRemoved: match[1] };
      }
    }
  }

  return { original: value, base, stripped: base, suffixRemoved: null };
}
