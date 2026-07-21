# E1b metrics

## Phase 1 — brand-absent safety screen (10 governed cases)

| | Baseline | E1b treatment |
|---|---|---|
| Cases emitting a selected value | **0** | **8** |
| Cases producing any alternate candidate | 0 | **0** |
| Cases reaching `OBSERVED` | 0 | **2** |
| Cases remaining `NOT_OBSERVED` | 10 | 2 |

The eight emitting cases, with the value the treatment selected:

| Case | Selected value | State | Eligible lines | Rejected lines | Spans | Kept generated candidates |
|---|---|---|---|---|---|---|
| `approved-wine-075` | `Baltana Vella vineyard` | **`OBSERVED`** | 14 | **0** | 396 | 49 |
| `approved-wine-082` | `OPENED THEIR WINERY AND` | **`OBSERVED`** | 10 | **0** | 168 | 133 |
| `approved-wine-022` | `MARBLE CREEK ACRES` | AMBIGUOUS | 1 | 0 | 22 | 15 |
| `approved-wine-058` | `STILL WHITE WINE` | AMBIGUOUS | 6 | 0 | 120 | 38 |
| `approved-wine-062` | `BECAUSE OF THE RIS` | AMBIGUOUS | 5 | 0 | 72 | 26 |
| `approved-wine-096` | `OFFICE PALAZZOLO DISONA -` | AMBIGUOUS | 5 | 0 | 90 | 52 |
| `approved-wine-097` | `OFFICE PALAZZOLO DISONA -` | AMBIGUOUS | 5 | 0 | 90 | 52 |
| `approved-wine-101` | `PEPPEE This very` | AMBIGUOUS | 6 | 0 | 120 | 9 |
| `approved-wine-095` | — | NOT_OBSERVED | 2 | 0 | 0 | 0 |
| `approved-wine-098` | — | NOT_OBSERVED | 2 | 0 | 18 | 0 |

**`Rejected lines` is 0 in every row.** The prominence gate filtered out nothing
on brand-absent labels. The two `NOT_OBSERVED` survivors were saved by the filter
ladder, not by the gate.

These are the same eight cases, with the same eight values, that E1a produced.
**The gate changed nothing about the outcome it was introduced to prevent.**

### Generated-span filter outcomes (brand-absent cases only)

| Outcome | Count |
|---|---|
| `sentence-fragment` (rejected) | 496 |
| **`KEPT` — `candidate-plausible`** | **364** |
| `low-information-fragment` | 116 |
| `generic-product-language` | 47 |
| `varietal-or-designation` | 26 |
| `no-letters-or-too-short` | 22 |
| `location-or-appellation` | 12 |
| **`KEPT` — `candidate-positive`** | **10** |
| `domain-like` | 4 |

374 of 1 097 candidate diagnostics from generated spans were kept — on labels
that have no brand at all.

## Phase 2 — **not run**

The immediate kill condition fired in Phase 1, so no brand-present treatment arm
was computed and no gain metric exists. `baseline.json`, `treatment.json`,
`changed-cases.json` and `candidate-volume.json` are deliberately absent; see
`specification.md`.

**Changed cases:** the only changed cases measured are the eight brand-absent
regressions above. No brand-present case was evaluated under treatment.

## Prominence analysis (diagnostic only — no threshold may be chosen from it)

478 `too-many-words` lines corpus-wide. **347 (72.6 %) pass eligibility;
131 (27.4 %) are rejected.** The gate admits nearly three quarters of exactly the
material it was meant to screen, and would still generate **9 150** spans.

Ratio = line prominence ÷ maximum label prominence.

| Population | n | Eligible | min | median | p95 | max |
|---|---|---|---|---|---|---|
| All `too-many-words` lines | 478 | 347 | 0.15 | 0.561 | 1.70 | 3.64 |
| **Lines containing fixture truth** | 36 | 24 | 0.174 | **0.492** | 1.82 | 2.50 |
| **Lines producing E1a regressions** | 27 | 22 | 0.20 | **0.530** | 0.871 | 0.871 |
| Lines from brand-absent cases | 56 | **56** | — | — | — | — |
| Producer/bottler prose | 7 | 5 | 0.213 | 1.263 | 2.00 | 2.00 |
| Designation/appellation text | 20 | 16 | 0.20 | 0.714 | 1.70 | 1.70 |

Two observations, both fatal to the hypothesis:

1. **The truth-bearing and regression-producing distributions overlap completely,
   and they are ordered the wrong way** — regression lines have a *higher* median
   ratio (0.530) than truth-bearing lines (0.492). No threshold on this axis
   separates them, in either direction.
2. **The brand-absent rows have no ratio at all.** `maxLabelProminence` is **0**
   for all 56 of them, because those passes produced no kept candidates. The floor
   collapses to the 1-pixel buffer while the lines are 18–52 px tall, so
   everything qualifies. By contrast, 0 of the 422 brand-present lines had a zero
   maximum.

Among the 347 eligible lines: 24 contain fixture truth, 22 carry a value that
caused an E1a regression, 16 are designation/appellation text, 5 are
producer/bottler prose, and **56 come from labels with no brand at all**.
