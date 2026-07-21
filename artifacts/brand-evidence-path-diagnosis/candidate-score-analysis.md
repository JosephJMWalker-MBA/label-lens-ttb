# Candidate score analysis

## Score composition

```
total = 2·positive + 1.6·meaningfulChars + 1.2·structure + 1·ocrEvidence
      + 0.8·prominence + 0.6·area + 0.3·centrality
      + 0.25·alignment + 0.2·lineProximity
      − 1.8·lowInformationPenalty − 1.4·residualPenalty
```

Maximum attainable benefit ≈ 7.95; `positive` alone is **25 %** of it, and is the
only term a correct-but-plain brand name can never earn.

## Ranking is not the bottleneck

Of the 37 cases where truth survives as a kept candidate:

| | Count | Share of the 37 |
|---|---|---|
| truth ranked 1st | 29 | 78 % |
| truth in top 3 | 33 | 89 % |
| truth ranked but outside top 3 | 3 | 8 % |
| truth kept but absent from selection *and* alternates | 1 | 3 % |

**Ranking loses at most 8 cases in the entire corpus, and only 1 completely**
(`approved-wine-033`, where the kept truth candidate does not appear in the
reported ordering at all). Compare with 43 lost at generation and 24 at OCR.

Tuning the score weights is therefore a low-ceiling intervention: even a perfect
re-ranker over the current candidate set could add at most 8 correct selections,
and would risk the 29 that are already right.

## The 7 wrong selected candidates

| Case | Truth | Selected | Truth rank |
|---|---|---|---|
| `approved-wine-013` | Afflicted | `Play ers Heart` | 2 |
| `approved-wine-056` | Prinsi | `CAMP dPIETRU` | 4 |
| `approved-wine-057` | Prinsi | `JI Lill` | 6 |
| `approved-wine-071` | AltaCima | `LATE HARVEST 2013` | 2 |
| `approved-wine-079` | Le Caniette | `OFFIDA` | 3 |
| `le-caniette` | Le Caniette | `INDICAZIONE GEOGRAFICA PROTETTA` | 4 |
| `approved-wine-087` | Viridis | `LANGHE SAUVIGNON Tuga` | 3 |

All 7 are `AMBIGUOUS`, so **none is asserted as fact** — the wrong value reaches a
human with the truth present among its alternates in every case. This is the
authority gate doing its job.

Two recurring patterns: an appellation/designation phrase outranking the brand
(`OFFIDA`, `INDICAZIONE GEOGRAFICA PROTETTA`, `LANGHE SAUVIGNON`), and a vintage
or style line outranking it (`LATE HARVEST 2013`). Both win on prominence and
area, not on the positive term.

## Why generation, not ranking, is where the value is

`shouldTrimWholeLineCandidate` (`field-selection.ts:1944`) generates line-window
sub-spans **only** when the whole-line candidate exists *and* is `positive` *and*
is noisy. When a line is rejected outright — `too-many-words` (23 cases),
`producer-line` (9), `domain-like` (8), `non-brand-keyword` (6),
`sentence-fragment` (5) — no sub-span of that line is ever scored.

Verified in `cases.json`: in all 23 `too-many-words` cases, every candidate the
run produced carries `assembly: "whole-line"`. Not one line-window candidate
exists on those labels.

Examples where truth is visibly present on a rejected line:

| Case | Truth | Rejection |
|---|---|---|
| `approved-wine-006` | Dark Horse | `too-many-words` |
| `approved-wine-012` | Cooley Bay | `too-many-words` |
| `approved-wine-024` | Chateau de Laville | `too-many-words` |
| `patricia-green-cellars` | Patricia Green **Cellars** | `too-many-words`, `domain-like`, `producer-line` |
| `approved-wine-016` | Marques de Navarro | `too-many-words` |

`patricia-green-cellars` is the sharpest illustration: the truth **carries a
`BRAND_DESIGNATOR`** and would be `positive` — and therefore a genuine `OBSERVED`
candidate under the existing gate — but the line it sits on is discarded before
any sub-span is considered.
