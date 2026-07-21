# E3 — `OCR_RECOGNITION_MISS` classification

**Measurement only.** Base `a4a0fd9`. No production code, OCR configuration,
candidate generation, matching behaviour, ranking, authority state, fixture, test,
schema, UI or package was modified. **No production change is proposed or
authorized by this record.**

## Headline

| Category | Count | % of 24 | % of corpus |
|---|---|---|---|
| `BOUNDED_NEAR_MISS` | **2** | 8.3 % | 1.7 % |
| `PARTIAL_RECOGNITION` | **9** | 37.5 % | 7.8 % |
| `TRUE_NON_RECOGNITION` | **13** | 54.2 % | 11.3 % |

**A bounded matching tolerance is the smallest of the three families.** More than
half the class is text the engine never meaningfully read: 12 of 24 have no
4-character fragment of the brand anywhere in the OCR output, and 7 of the 9
`decorative-or-script-brand` cases are true non-recognitions.

## Start here

**`decision.md`** — the completed conclusions in one place: the 2 / 9 / 13 split,
why the matching-tolerance family is closed, why partial composition is secondary,
why true non-recognition is next, and how the three borderline cases are treated.

## Reading order

0. **`decision.md`** — the decision record (read first).
1. **`hypothesis.md`** — the question, the prior expectation, and how it was wrong.
2. **`specification.md`** — the pre-registered definitions, fixed before the run.
3. **`metrics.md`** — counts and every required distribution.
4. **`edit-distance-analysis.md`** — the two near misses, the distance
   distribution, and the span-window sensitivity check.
5. **`partial-recognition-analysis.md`** — the 9 partial cases and their shapes.
6. **`layout-analysis.md`** — the dominant signal: presentation, not matching.
7. **`borderline-review.md`** — the 3 classifications needing human judgment.
8. **`limitations.md`** — what this does not establish.
9. **`next-experiments.md`** — which research family the evidence supports, and
   the constraints carried into it.

## Data and reproduction

`cases.json` (per-case record) · `classifications.json` (aggregates) ·
`probe.ts` + `classify.mjs` + `commands.sh` (reproduction) ·
`borderline-crops/` (6 images, borderline cases only) · `git-sha.txt`.

No full OCR dumps are preserved: `relevantOcrLines` is capped at 6 per case and
`allOcrLineCount` records how many existed.

## Relationship to earlier rounds

The 24 cases come from the brand evidence-path diagnosis preserved in
`artifacts/brand-evidence-path-diagnosis/`. That round closed the arbitrary
contiguous sub-span-generation family (E1a and E1b, both killed). **E3 does not
reopen it**, and `next-experiments.md` states the constraint explicitly.
