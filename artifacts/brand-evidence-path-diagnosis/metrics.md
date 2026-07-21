# Brand baseline and failure distribution

Governed fixed corpus, unmodified production code at `a9fe943`. All figures are
re-derivable from `cases.json` and `failure-taxonomy.json`.

## Denominators

| | |
|---|---|
| Governed corpus size | **115** |
| Brand-present | **105** |
| Brand-absent | **10** |
| of the present cases, `knownAmbiguous` | 4 |

## A. Candidate usefulness — did the right answer survive?

| Stage | Count | % of 105 present |
|---|---|---|
| Truth appears in raw OCR text | **81** | 77.1 % |
| Truth appears on a reconstructed line | **80** | 76.2 % |
| Truth survives as a **kept candidate** | **37** | 35.2 % |
| Truth appears in top 3 | **33** | 31.4 % |
| Truth is **ranked first** | **29** | 27.6 % |

Selected-value accuracy: **exact 27 / 105 (25.7 %)**, **normalized 29 / 105
(27.6 %)**, **top-3 recall 33 / 105 (31.4 %)**.

**The dominant loss is between line reconstruction and candidate generation: 80 →
37, i.e. 43 cases (41 % of the corpus).** Ranking loses almost nothing: of the 37
cases where truth survives as a candidate, 33 are top-3 and 29 are first.

## B. Authority certainty — measured separately

| | Count |
|---|---|
| `OBSERVED` | **4** |
| `AMBIGUOUS` | **101** |
| `NOT_OBSERVED` | **10** |
| `LOW_CONFIDENCE` | **0** — brand never assigns it |

| | Count |
|---|---|
| Absent-brand false positives | **0 / 10** |
| Wrong value marked `OBSERVED` (false certainty) | **0** |
| Correct value **not** `OBSERVED` | **25** |
| Truth ranked first but state ≠ `OBSERVED` | **25 of 29** |
| Truth selected **and** `OBSERVED` | **4 / 105 (3.8 %)** |

The four `OBSERVED` cases are `three-steves-winery`, `approved-wine-086`
(both "3 STEVES WINERY"), `wine-multi-artifact-09` ("DUCK WALK VINEYARDS"), and
`approved-wine-073` ("Mike's Farm, Inc."). All four are correct. **Every one of
them contains either a `BRAND_DESIGNATOR` token or a possessive.**

**These two axes are not the same measurement and must not be reported as one.**
Candidate usefulness is 27.6 % correct-selected; authority certainty is 3.8 %.
The gap is 25 cases where the machine already holds the right answer at rank 1
and declines to assert it.

## Failure-class distribution (n = 115, mutually exclusive, first stage of loss)

| Class | Count | % of corpus |
|---|---|---|
| `CANDIDATE_GENERATION_MISS` | **43** | 37.4 % |
| `CORRECT_TOP_CANDIDATE_AUTHORITY_ABSTENTION` | **25** | 21.7 % |
| `OCR_RECOGNITION_MISS` | **24** | 20.9 % |
| `CORRECT` (4 present + 10 correct absences) | 14 | 12.2 % |
| `WRONG_SELECTED_CANDIDATE` | 7 | 6.1 % |
| `RANKING_MISS` | 1 | 0.9 % |
| `RECONSTRUCTION_MISS` | 1 | 0.9 % |
| `WRONG_ACCEPTED_CANDIDATE` | **0** | — |
| `POSSIBLE_TRUTH_PROBLEM` | 0 assigned (see below) | — |
| `UNATTRIBUTED` | **0** | — |

Sum = 115. Every case is attributed; nothing fell through to `UNATTRIBUTED`.

`POSSIBLE_TRUTH_PROBLEM` is deliberately **not** assigned as a primary class.
Each such case also has a concrete earlier mechanical loss, and classifying it as
a truth problem on my own reading would substitute my judgement for a human
reader's. The candidates are listed in `possible-truth-audit.md` instead.

## Where candidate generation loses the truth (43 cases)

First filter reason that rejected a span containing the truth (a case may list
more than one, from different spans):

| Reason | Cases |
|---|---|
| `too-many-words` | **23** |
| `producer-line` | 9 |
| `domain-like` | 8 |
| `non-brand-keyword` | 6 |
| `sentence-fragment` | 5 |
| no candidate built at all | 2 |

## Most common gate responsible for loss

Across the 101 `AMBIGUOUS` present cases (reasons co-occur):

| Gate | Cases |
|---|---|
| **`no-positive-brand-signal`** | **96** |
| `competing-prominence-rival` | 61 |
| `weak-contested-lead` | 20 |
| `below-confidence-floor` | 1 |

For the 25 correct-but-abstained cases specifically: `no-positive-brand-signal`
is present in **all 25**; it is the *sole* reason in 11. Their OCR evidence
scores run 0.55–0.96, median ≈ 0.90 — these are not weak readings.

**Single largest contributor to loss of authority: the requirement that the
leading candidate carry a `BRAND_DESIGNATOR` token or a possessive.** See
`authority-gates.md` before drawing any conclusion from that sentence.
