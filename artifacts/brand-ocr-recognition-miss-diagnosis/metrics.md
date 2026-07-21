# E3 metrics

24 `OCR_RECOGNITION_MISS` cases, from a 115-case corpus (105 brand-present).
Machine form: `classifications.json`; per-case detail: `cases.json`.

## Primary categories

| Category | Count | % of the 24 | % of the 115-case corpus |
|---|---|---|---|
| `BOUNDED_NEAR_MISS` | **2** | 8.3 % | 1.7 % |
| `PARTIAL_RECOGNITION` | **9** | 37.5 % | 7.8 % |
| `TRUE_NON_RECOGNITION` | **13** | 54.2 % | 11.3 % |
| **Total** | **24** | 100 % | — |

## Partial-recognition sub-shapes (9)

| Shape | Count |
|---|---|
| complete distinctive token found | 4 |
| multiple partial tokens | 3 |
| prefix fragment (apparent truncation) | 1 |
| suffix fragment (apparent truncation) | 1 |
| internal fragment | 0 |
| **apparent truncation** (subset of the above) | **2** |

Qualifying rule: **A** (complete substantive token) 7 · **B** (shared substring
≥ 4 chars and ≥ 50 % coverage) 2.

## Nearest edit distance, all 24

| Distance | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Cases | **2** | 5 | 2 | 1 | 2 | 1 | 4 | 2 | 2 | 3 |

Median nearest distance is **5**. Only 7 of 24 sit at distance ≤ 2 — and 4 of
those 7 are already `PARTIAL_RECOGNITION` on token evidence, so widening the bound
to 2 would newly reclassify at most **3** cases.

## Headline counts

| | Count |
|---|---|
| Any distinctive truth token present in OCR | **9 / 24** |
| More than half the brand visible (coverage > 50 %) | **9 / 24** |
| **No distinctive fragment at all** (LCS < 4 chars and no token) | **12 / 24** |
| Cases where the algorithmic category required human judgment | **3 / 24** |

## Distribution by expected-brand length (normalized characters)

| Length | NEAR_MISS | PARTIAL | TRUE_NON |
|---|---|---|---|
| < 8 | 0 | 0 | 1 |
| 8–11 | 0 | 5 | 8 |
| 12–15 | 2 | 3 | 3 |
| 16+ | 0 | 1 | 1 |

Both near misses are in the 12–15 band. Short brands are not easier — the single
sub-8 case is a true non-recognition, and a 1-edit bound is proportionally very
tight on a 4-character brand (see `borderline-review.md`).

## Distribution by expected-brand token count

| Tokens | NEAR_MISS | PARTIAL | TRUE_NON |
|---|---|---|---|
| 1 | 0 | 1 | 3 |
| 2 | 1 | 7 | 6 |
| 3 | 1 | 1 | 3 |
| 4 | 0 | 0 | 1 |

## Distribution by OCR confidence of the best diagnostic span

| Mean confidence | NEAR_MISS | PARTIAL | TRUE_NON |
|---|---|---|---|
| ≥ 80 | 0 | 7 | 8 |
| 60–79 | 2 | 2 | 1 |
| < 60 | 0 | 0 | 4 |

**Confidence does not separate the categories.** 8 of 13 true non-recognitions
have a *high-confidence* best span — the engine read something clearly; it simply
was not the brand. Confidence is a property of what was read, not of whether the
right thing was read.

## Distribution by OCR pass

| Pass | Cases |
|---|---|
| primary (full-image, upright) | **24** |
| recovery | 0 |

Every best diagnostic span came from the primary pass. Recovery passes contributed
nothing to this class — consistent with recovery being planned only when brand is
`NOT_OBSERVED`, which these cases are not.

## Recognition mechanism (inferred from the evidence, not from truth)

| Shape | Cases |
|---|---|
| recognition | 8 |
| truncation | 8 |
| complete omission | 7 |
| segmentation | 1 |

## Where the truth text sits

| | Cases |
|---|---|
| A single reconstructed line carries a ≥ 4-char fragment of the truth | 5 |
| Two or more lines each carry a fragment (visually split) | 7 |
| **No line carries even a 4-character fragment** | **12** |
