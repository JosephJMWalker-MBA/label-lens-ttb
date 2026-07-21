# E3 specification

Base `a4a0fd9`. Every definition below was fixed **before** the probe was run and
none was altered after seeing results.

## Input

`probe.ts` runs the real extractor over the governed 115-case corpus on
unmodified production code, reproduces the brand first-stage-of-loss attribution
from the preserved evidence-path diagnosis, and isolates the cases whose class is
`OCR_RECOGNITION_MISS`. **Verified: exactly 24**, matching the preserved record.

## Ordering of truth use

Truth is consulted **only after** the production-equivalent OCR output has been
collected and the failure class assigned. Fixture ids, filenames, hashes,
expected text and declared facts never steer OCR, region choice, or span
construction. OCR is **not** re-run and no image is re-processed.

## Source spans

Spans are contiguous OCR-word runs taken from the lines the pipeline had
**already** reconstructed. No cross-line span is built.

Allowed token count: `expectedTokens − 1` through `expectedTokens + 1`, with a
floor of one token.

## Normalization

Both sides pass through the repository's existing brand normalization,
`normalizeKey` (`src/fixtures/eval/metrics.ts`): NFD, diacritics stripped,
lowercased, all non-alphanumerics removed — which also removes spaces and
punctuation, as required.

## `BOUNDED_NEAR_MISS`

Assigned first, when:

- the normalized expected brand has **at least 4** alphanumeric characters; and
- the best qualifying span is at **Damerau–Levenshtein distance exactly 1**.

Implemented as optimal string alignment with an adjacent-transposition rule,
which is identical to unrestricted Damerau–Levenshtein at distance ≤ 1. One
insertion, deletion, substitution or adjacent transposition qualifies.

Distance 2 was **not** tested as a bound, no second bound was tried, the bound was
not altered after results, and phonetic, semantic and abbreviation similarity are
not counted.

## `PARTIAL_RECOGNITION`

Assigned only when the case is not a bounded near miss, and either:

- **Rule A** — at least one complete substantive expected-brand token of length
  ≥ 4 appears exactly in the OCR text; or
- **Rule B** — the longest contiguous shared character sequence is ≥ 4 characters
  **and** covers ≥ 50 % of the normalized expected brand.

The qualifying rule is recorded per case.

Pre-registered generic tokens, **not** sufficient on their own:
`wine`, `red`, `white`, `estate`, `winery`, `vineyard`, `vineyards`, `cellars`.

## `TRUE_NON_RECOGNITION`

Assigned when neither of the above applies.

## Classification order and totality

`BOUNDED_NEAR_MISS` → `PARTIAL_RECOGNITION` → `TRUE_NON_RECOGNITION`. Every case
receives exactly one primary category; the three counts sum to 24 (verified).

## Sensitivity check (diagnostic only)

The span window is anchored on the *expected* token count, so a merged or dropped
OCR word boundary could in principle push the true best evidence outside it. The
probe therefore also records the best distance with the window widened to 1–6
tokens, **purely as a sensitivity measure — it is never used for classification.**

Result: the window excluded a closer span in **1 of 24** cases
(`approved-wine-083`, distance 10 → 9, still far outside any bound), and **no
category would change**. The span rule is not doing hidden work.

## What was not done

No production change of any kind. No fuzzy matching implemented or proposed for
implementation. No fixture truth modified. No re-run of OCR. No connection to the
closed sub-span-generation family.
