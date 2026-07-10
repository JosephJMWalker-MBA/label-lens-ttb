/**
 * Canonical text normalization for human-obvious equivalence.
 *
 * Normalization never discards the original: callers keep the raw evidence and
 * use the canonical form only for comparison. The transform is intentionally
 * conservative — case, whitespace, apostrophe style, and surrounding
 * punctuation — so it recognizes equivalence without hiding real differences.
 */
export interface NormalizedText {
  /** The unmodified input, preserved as evidence. */
  original: string;
  /** Lowercased, whitespace-collapsed, punctuation-stripped comparison form. */
  canonical: string;
}

/** Map curly/typographic apostrophes and quotes to their ASCII equivalents. */
function standardizeApostrophes(value: string): string {
  return value.replace(/[‘’ʼ′]/g, "'").replace(/[“”]/g, '"');
}

export function normalizeText(original: string): NormalizedText {
  const canonical = standardizeApostrophes(original)
    .toLowerCase()
    // Drop punctuation except intra-word apostrophes and hyphens.
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { original, canonical };
}
