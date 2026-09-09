# Frozen matching rule — "Brand truth is present in raw OCR"

Frozen **before** any fresh count was computed. Recorded here so the rule cannot
be tuned after seeing aggregates.

## Inputs, and only these

For each governed case:

- the complete, ordered per-word OCR token list of every **brand-eligible** pass
  (primary and recovery), taken from the extractor debug output — `pass.words[].text`;
- the governed truth `brand.acceptable` string list from the frozen corpus.

A case is **brand-present** iff `truth.present === true`.

### Contamination boundary

The classifier reads `pass.words[].text` and the acceptable list. It never reads
brand candidates, kept/filter reasons, reconstructed lines, ranks, selected
values, state, confidence, or the inherited `truthInRawOcr`. Those fields are
attached to the output only *after* classification, for comparison.

## Normalization

Per token, identical to the repository's governed `normalizeKey`:

    norm(t) = t.normalize("NFD").strip(diacritics).toLowerCase().replace(/[^a-z0-9]/g, "")

Applied **per token**, never to a whole concatenated pass. Tokens that normalize
to the empty string are dropped. An acceptable value is split on whitespace and
each part normalized, giving truth tokens `[a1..ak]` and the glued form
`A = a1+...+ak`.

## Classification, best tier over all acceptables and all brand-eligible passes

1. **EXACT_RAW_MATCH** — a contiguous run of OCR tokens `[wi..wi+k-1]` equals
   `[a1..ak]` elementwise.
2. **NORMALIZED_RAW_MATCH** — a contiguous run `[wi..wj]` whose concatenation
   equals `A` exactly. Admits OCR splitting or merging of the brand's own words,
   but the run must be exactly the brand and nothing else.
3. **PARTIAL_INSUFFICIENT** — `A` occurs only as a **proper substring** of some
   contiguous run's concatenation (glyphs present but glued inside other text),
   or at least one but not all truth tokens appear as exact tokens.
4. **NOT_PRESENT** — none of the above.
5. **UNDETERMINABLE** — no per-word evidence for the case (extraction error).

## Presence for the rebuilt cascade

`freshTruthInRawOcr = (tier is EXACT_RAW_MATCH or NORMALIZED_RAW_MATCH)`.

Tier 3 is deliberately **not** counted as present: it is the mode in which the
inherited rule fires without the brand ever existing as a readable unit. Being
conservative about fuzzy equivalence is a stated requirement of this experiment.

## How this differs from the inherited field

`truthInRawOcr` is byte-identical to the extractor's own diagnostic
`brandOcrContainsAcceptable` in all 115 cases. That diagnostic computes:

    normalizedIncludes(allPrimaryPassWords.join(" "), acceptable)
      || normalizedIncludes(allRecoveryPassWords.join(" "), acceptable)

`normalizeKey` strips **every** non-alphanumeric character, including the spaces
just used to join, so the haystack is a separator-free concatenation of every
OCR token in every pass, and the test is a plain `String.includes`. A match may
therefore span arbitrary word boundaries or sit inside a longer token. The
frozen rule above restores the boundaries before matching.
