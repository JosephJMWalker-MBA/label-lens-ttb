/**
 * Issue #149 — the frozen "Brand truth is present in raw OCR" rule.
 *
 * EVALUATION ONLY. Nothing in production imports this. The rule is frozen in
 * `artifacts/issue-149-brand-raw-ocr-rederivation/matching-rule.md`; this module
 * is the single executable copy of it, shared by the corpus runner and its
 * tests so the two cannot drift.
 *
 * It reads OCR word text and a governed acceptable list. It never reads
 * candidates, filter reasons, reconstructed lines, ranks, selected values, or
 * the inherited `truthInRawOcr`.
 */

/** Governed normalization, applied PER TOKEN — never to a joined pass. */
export function normToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function truthTokens(acceptable: string): string[] {
  return acceptable
    .split(/\s+/)
    .map(normToken)
    .filter((token) => token.length > 0);
}

export type RawOcrTier =
  | "EXACT_RAW_MATCH"
  | "NORMALIZED_RAW_MATCH"
  | "PARTIAL_INSUFFICIENT"
  | "NOT_PRESENT"
  | "UNDETERMINABLE";

export const TIER_ORDER: RawOcrTier[] = [
  "EXACT_RAW_MATCH",
  "NORMALIZED_RAW_MATCH",
  "PARTIAL_INSUFFICIENT",
  "NOT_PRESENT",
  "UNDETERMINABLE",
];

/** The better (stronger) of two tiers. */
export function betterTier(a: RawOcrTier, b: RawOcrTier): RawOcrTier {
  return TIER_ORDER.indexOf(a) <= TIER_ORDER.indexOf(b) ? a : b;
}

/** Tiers that count as "truth present in raw OCR" for the rebuilt cascade. */
export function isPresent(tier: RawOcrTier): boolean {
  return tier === "EXACT_RAW_MATCH" || tier === "NORMALIZED_RAW_MATCH";
}

export interface RawOcrMatch {
  tier: RawOcrTier;
  matchedTokens: string[] | null;
  detail: string | null;
}

/**
 * Classify one acceptable brand against one pass's ordered OCR word list.
 *
 * `words` is the complete, ordered `pass.words[].text` for a brand-eligible
 * pass — not a sample.
 */
export function classifyRawOcrMatch(words: string[], acceptable: string): RawOcrMatch {
  const truth = truthTokens(acceptable);
  if (truth.length === 0) return { tier: "NOT_PRESENT", matchedTokens: null, detail: null };
  const glued = truth.join("");

  const tokens = words.map(normToken).filter((token) => token.length > 0);

  // Tier 1 — a contiguous run of OCR tokens equals the truth tokens elementwise.
  for (let i = 0; i + truth.length <= tokens.length; i++) {
    let hit = true;
    for (let j = 0; j < truth.length; j++) {
      if (tokens[i + j] !== truth[j]) {
        hit = false;
        break;
      }
    }
    if (hit) {
      return {
        tier: "EXACT_RAW_MATCH",
        matchedTokens: tokens.slice(i, i + truth.length),
        detail: null,
      };
    }
  }

  // Tier 2 — a contiguous run whose concatenation is exactly the glued truth.
  // Admits OCR splitting or merging of the brand's own words; the run must be
  // the brand and nothing else.
  for (let i = 0; i < tokens.length; i++) {
    let acc = "";
    for (let j = i; j < tokens.length; j++) {
      acc += tokens[j];
      if (acc.length > glued.length) break;
      if (acc === glued) {
        return {
          tier: "NORMALIZED_RAW_MATCH",
          matchedTokens: tokens.slice(i, j + 1),
          detail: j > i ? "brand split across OCR tokens" : "brand merged into one OCR token",
        };
      }
    }
  }

  // Tier 3a — the glued truth occurs only INSIDE a contiguous run. This is the
  // mode in which the inherited whole-dump substring rule fires without the
  // brand ever existing as a readable unit.
  for (let i = 0; i < tokens.length; i++) {
    let acc = "";
    for (let j = i; j < tokens.length; j++) {
      acc += tokens[j];
      if (acc.includes(glued)) {
        return {
          tier: "PARTIAL_INSUFFICIENT",
          matchedTokens: tokens.slice(i, j + 1),
          detail: `glued truth "${glued}" occurs only inside run "${acc}"`,
        };
      }
      if (acc.length > glued.length * 3) break;
    }
  }

  // Tier 3b — at least one, but not all, truth tokens present as exact tokens.
  const present = truth.filter((token) => tokens.includes(token));
  if (present.length > 0 && present.length < truth.length) {
    return {
      tier: "PARTIAL_INSUFFICIENT",
      matchedTokens: present,
      detail: `${present.length}/${truth.length} truth tokens present, not contiguous`,
    };
  }

  return { tier: "NOT_PRESENT", matchedTokens: null, detail: null };
}
