# Issue #149 — where Brand truth disappears between raw OCR and the candidate set

**Result: `FILTER_LOSS = 0`. The 42-case "candidate-construction loss" is almost
entirely window/span formation, not filter policy.**

Diagnosis only. No production module was modified and no production behaviour
changed. No filter, window width, OCR, ranking, selection or authority was touched.

## Identity

| | |
| --- | --- |
| Base SHA | `2818505bc8f6a40141e268c0568dcd557d96db44` (current `main`, includes PR #223) |
| Branch | `research/brand-candidate-window-diagnosis` |
| Frozen definitions | `deed0705e41db544d65bb60ecafdf10e6602b4745c31a66a6745f1c52e23a9ea`, frozen before counting |
| Upstream authority | PR #223 fresh raw-OCR truth presence, reused unchanged |
| Diagnostic surfaces | `selectBrandObservationWithCompleteFilterDiagnostics` (#220) and `classifyRawOcrMatch` (#223), both already in `main` |

## Instrumentation completeness — observed, not assumed

Committed diagnostics were insufficient, and the fresh run proves it:

| | |
| --- | --- |
| Cases where rejected candidates are visible | **115 / 115** |
| Max candidates in one case | **72** (harness caps committed output at 24) |
| Cases exceeding that 24-cap | **41** |
| Max lines in one case | **67** (harness caps at 12) |
| Cases exceeding that 12-cap | **108** |
| Rejected candidates missing reason sets | **0** |

Because both surfaces already exist in `main`, no production module was touched
and there is no default-path parity gap to prove.

## The 42-case classification

| Class | Cases |
| --- | --- |
| **A** — exact candidate generated then filtered | **0** |
| **B** — overwide window | **39** |
| **C** — partial window | 0 |
| **D** — truth spans multiple generation units | 1 |
| **E** — window not enumerated | 1 |
| **F** — normalization / tokenization mismatch | 1 |
| G / H | 0 / 0 |

**Roll-up:** filter loss **0** · window/span-formation loss **40** · structural
segmentation **1** · value construction **1**.

Not one case had a candidate *equal to* the Brand generated and then rejected.

## Class B divides into two mechanisms with different repairs

**12 kept-overwide** — an overwide candidate survives filtering and is surfaced,
so the pipeline answers with a near miss (2–4 extra words):

| Brand | Kept candidate |
| --- | --- |
| Vino Alpino | `Vino Alpino LLC` |
| Cooley Bay | `Cooley Bay Winery` |
| Pacheca | `PACHECA DOURO D.O.C` |
| Curious | `Red Wine Blend Curious` |

**27 rejected-only** — line grouping merged the Brand into unrelated text and the
filters then removed it (median 5 extra words, max 12):

| Brand | Widest rejected span | Reasons |
| --- | --- | --- |
| Luigi & Giovanni | `GOVERMENT WARNING 1 ACCORDING TO THE SURGEON GENERAL, LUIGI & GIOVANNI` | non-brand-keyword, too-many-words |
| Patricia Green Cellars | `or more information about this wine website and Patricia Green Cellars` | too-many-words, sentence-fragment |

## Representative traces for the singleton classes

- **D** `chateau-bonneau` — the truth run is in raw OCR but not contiguous within
  any single reconstructed line.
- **E** `approved-wine-054` — `Henri Dufreres` sits inside a line, yet no
  generated candidate equals, contains or partially matches it.
- **F** `approved-wine-024` — the span `CHATEAU dé LAVILLE` was emitted covering
  exactly the truth run, but value construction produced `CHATEAU d LAVILLE`.

## `too-many-words` reconciliation — tested, not assumed

| | |
| --- | --- |
| Cases with an **exact** candidate rejected by `too-many-words` | **0** |
| Class-B cases where `too-many-words` rejected only an **overwide** span | **35** |

This is why 23 blocker cases, 17 sole-blocker cases and 0 recovered by global
removal coexist without contradiction. The earlier decomposition attributed the
loss to whichever filter rejected *a span containing the truth*. The frozen rule
asks whether a candidate *equal to* the truth ever existed. It never did — so
removing the filter admits the longer span and recovers nothing, exactly as the
counterfactual measured.

## Architecture implication by demonstrated failure class

| Failure class | Cases | Smallest plausible lever |
| --- | --- | --- |
| exact candidate generated + filtered | **0** | filter-policy research — **not earned** |
| kept-overwide window | 12 | candidate-window enumeration (trailing-suffix trimming) |
| rejected-only overwide + E + D | 29 | line/region/layout **segmentation** research |
| normalization mismatch | 1 | candidate value construction |
| raw OCR truth absent (outside these 42) | 26 | perception / OCR research |

Segmentation is now the largest demonstrated bloc, and it is the first class in
this programme that genuinely implicates better localization: the Brand is
spatially distinct on the label but is grouped into one OCR line with warning or
marketing text. That is the condition under which vision-based layout research
would earn its cost — and it is still unproven.

## Next smallest discriminating experiment (proposed, not started)

A read-only geometric measurement over the 27 rejected-only cases: are the Brand
tokens separable from the rest of their line by a horizontal gap materially
larger than the intra-Brand gaps? It changes no window rule and discriminates
"line segmentation could recover this" from "it could not" — the precise test of
whether vision-based layout localization is warranted.

## Verification

- Determinism: primary and repeat byte-identical on both artifacts.
- Definitions frozen and hashed before any count.
- Every classification traces to a case-level row with provenance, generated
  spans and complete rejection reasons.
- Production behaviour changed: **no**; production modules modified: **0**.
