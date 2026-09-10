# Issue #149 — why the Brand ranker prefers the wrong candidate

Diagnosis only. **Production behaviour changed: no.** No scoring, ranking, family
key, filter, candidate generation, OCR or authority behaviour was modified.

## Identity and dependency

| | |
| --- | --- |
| Branch | `research/brand-ranking-loss-diagnosis` |
| Evaluation dependency | oracle checkpoint `8de5b9fc` — needed for the oracle-correct candidates. **Ancestry is an evaluation dependency only**, not a claim the oracle seam belongs in production |
| Frozen inventory | `d30bf6f8f7887e46bb54c1f58e6cd00c075b5a2db022c7efba162df20cca04fb`, frozen before classification |
| Population | the 37 `ENUMERATION_PLUS_RANKING` cases |

## The answer in one sentence

**The ranker rewards physical size and text length, not brand-likeness** — at
three independent stages, so the exact Brand loses even when it scores higher
than the winner.

## All 37 cases accounted for

| Primary class | Cases |
| --- | --- |
| **FAMILY_SUPPRESSION** — never reached the comparator | **14** |
| **ELIGIBILITY_GATE** — reached it, gated out before any score compare | **14** |
| **SCORE_ORDERING** — genuine comparator loss on `score.total` | **9** |
| TIE_BREAK · OTHER · UNDETERMINABLE | 0 · 0 · 0 |

Oracle reached the comparator pool in **23**, was removed before it in **14**.
Every one of the 37 winners was `scoreEligible: true`.

**Only 9 of 37 are a scoring-weight question.** Fourteen never reach the
comparator; fourteen more are decided by a boolean gate before any score is
compared. Weight tuning could address at most a quarter of this population.

## Stage 1 — family suppression: the overwide superset outscores the exact Brand

12 of the 14 were eliminated by a **same-family sibling**, and the sibling is
almost always the *overwide* candidate containing the Brand:

| Brand (oracle) | score | Same-family winner | score |
| --- | --- | --- | --- |
| Vino Alpino | 4.186 | `Vino Alpino LLC` | 4.907 |
| Cooley Bay | 3.780 | `Cooley Bay Winery` | 6.716 |
| Curious | 3.335 | `Red Wine Blend Curious` | 5.478 |

This is structural, not incidental. `score.total` rises with `meaningfulChars`
(+1.6, alphaChars/14), `structure` (+1.2, informative token count) and `area`
(+0.6). **Adding words to a brand raises its score**, so an exact Brand can
essentially never beat its own overwide superset inside the same family — and
`bestFamilyCandidates` keeps only the higher `score.total`.

Note `candidateFamilyKey` is `line:${lineIndexes[0]}` — line index only, not pass
id — so candidates from the same line index of *different passes* also compete in
one family.

The remaining 2 were removed at the `dedupeBestCandidates` stage by an
equal-valued candidate. **Limitation, stated rather than glossed:** in those two
the correct *value* survived in another instance and then lost downstream, so
they are instance-level suppression, not suppression of the correct evidence.
`patricia-green-cellars` is one: the oracle won its own family at 6.974 and was
absorbed by an equal-valued duplicate.

## Stage 2 — the eligibility gate: glyph height decides before score does

`score-eligibility` is the **primary** comparator:

```
scoreEligible = prominence > maxProminence × 0.4 + 1px
```

`prominence` is glyph height; `maxProminence` is the maximum over the whole kept
pool. **The tallest text anywhere on the label sets the floor for every
candidate.** Every eligible candidate outranks every ineligible one regardless of
score, and the two arms even use different comparator chains.

`alfredos-wine` is the clean demonstration:

| | value | eligible | score | prominence |
| --- | --- | --- | --- | --- |
| oracle | `ALFREDO'S WINE` | **false** | **6.002** | 18 |
| winner | `HLTRE` | true | 3.085 | 158 |

Floor 64.2 from `maxProminence` 158. OCR garbage from large display text beats the
correct Brand, which scored nearly twice as well, purely on height.

## Stage 3 — score ordering: area dominates

For the 9 genuine comparator losses, median score delta **0.402**, decisive term
frequency: `area` 6, `prominence` 4, `structure` 4, `residualPenalty` 4,
`ocrEvidenceScore` 3, `meaningfulChars` 3, `lowInformationPenalty` 3.

Winners sit near `area` 1.0 against the Brand's 0.14–0.63:
`MARQUES vo NAVARRO`, `BUTA DISTRIBUTORS INC`, `2024 SOUTH COAST PRIMITIVO`,
`Strumica - Radovish Region`.

## Winning-candidate archetypes

short token 18 · long phrase (3+ tokens) 13 · producer/estate phrase 4 ·
contains digits 2. Failures are **not** heterogeneous: all three stages express
the same size-and-length preference.

## Authority boundary

The single correctly selected oracle candidate that remained `AMBIGUOUS`
(`approved-wine-042`, `DOMAINE QUIVY`) is recorded as a **downstream authority**
observation. It is not used to explain any of the 37 ranking losses.

## Smallest next discriminating experiment (proposed, not started)

A read-only measurement, changing no weight: for each of the 37, compute whether
the exact Brand would outrank the winner under each of three isolated
counterfactual conditions considered **separately** — (a) family key made
pass-aware, (b) the eligibility gate removed, (c) length/area terms neutralized.
Reporting how many cases each condition alone would fix discriminates whether one
stage dominates or all three must move together. It is a scoring simulation over
already-captured features and needs no production change.

Until that runs, note what this diagnosis already implies for enumeration: adding
exact windows is actively futile while the exact Brand is outscored by its own
overwide superset in the same family.

## Verification

- Determinism: primary and repeat byte-identical on both artifacts.
- Feature inventory traced from code and frozen before classification; pass
  provenance confirmed **not** an ordering input.
- Family-vs-comparator separation rests on a fact in the data: `decision` is
  assigned only while iterating the post-family `ranked` pool.
- 37 of 37 classified, zero undeterminable.
