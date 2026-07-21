# Hypothesis — brand evidence-path diagnosis

**Diagnosis only. No production code was modified.** Branch
`research/brand-evidence-path-diagnosis`, base `a9fe943` (`git-sha.txt`).

## Research question

For each brand extraction failure in the governed fixed corpus, at which exact
stage does the truth stop surviving — raw OCR recognition, word reconstruction,
candidate generation, ranking, selected-candidate choice, or authority-state
assignment?

## Prior expectation (recorded before the probe ran)

Brand exact-match sits at roughly a quarter of present cases while alcohol
detection is near 70 %, and the repository's own comments describe a deliberately
conservative brand gate. The plausible explanations were (a) OCR simply not
reading brand marks, (b) ranking preferring prominent non-brand text, or
(c) the authority gate withholding correct answers.

## What the probe found

All three occur, but not in the expected proportions:

- **(a) is real but second**: 24 of 105 present cases never have the truth in raw
  OCR at all.
- **(c) is real and total**: 25 correct values sit at rank 1 and are still not
  `OBSERVED` — and only **4** cases in the entire corpus are `OBSERVED`.
- **(b) is almost nil**: ranking loses at most 8 cases and completely loses 1.
- **The dominant loss was none of the three: candidate *generation*.** 80 cases
  have the truth on a reconstructed line; only 37 keep it as a candidate. 43 are
  lost in between, because a line rejected as a whole is never decomposed into
  sub-spans.

## Method

`probe.ts` runs the real extractor through `runCaseArtifacts`, which receives only
the image bytes and their digest. Fixture ids, filenames, and expected answers are
read **only** in the classification block, after the production candidate path has
completed. Truth is used for evaluation and classification, never for extraction.

Selected-candidate correctness and authority state are recorded as two separate
fields and reported as two separate axes throughout.
