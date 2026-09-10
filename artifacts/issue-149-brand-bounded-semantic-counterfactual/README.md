# Issue #149 — bounded semantic suppression counterfactual (G / P)

**Verdicts: G `COUNTERFACTUAL_KILL` · P `COUNTERFACTUAL_KILL` · combined `COUNTERFACTUAL_KILL`.**
**Predicate-design research is NOT earned.**

Counterfactual only. **Production behaviour changed: no.** No production
vocabulary, predicate, weight, ranking input, candidate generation or authority
threshold was modified.

| | |
| --- | --- |
| Branch | `research/brand-bounded-semantic-counterfactual` |
| Dependency | `6e5fc530` → … → `8de5b9fc`. **Evaluation dependency only** |
| Frozen G/P | `14a3fce976f034e6132ce6a32799d4952d98cfa673b016ba2fca3278c0b13818` |
| Default-path parity | **115/115 byte-identical** |
| Baseline reproduction | **EXACT on value AND state**, 115/115 — authority measured, not simulated |
| Determinism | **PASS**, fail-closed |

## Full-corpus results — zero recovery, zero collateral

| Arm | Correct | Wrong | Correct `OBS` | Wrong `OBS` | `AMBIG` | Absent-positive | Regressed | Improved | Suppressed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `G0P0` | 29 | 76 | 4 | **0** | 101 | 0 | — | — | 0 |
| `G1P0` | **29** | 76 | 4 | **0** | 101 | 0 | **0** | **0** | 8 |
| `G0P1` | **29** | 76 | 4 | **0** | 101 | 0 | **0** | **0** | 5 |
| `G1P1` | **29** | 76 | 4 | **0** | 101 | 0 | **0** | **0** | 13 |

**13 candidates suppressed and not one wrong selection became correct.** Nothing
regressed either: wrong `OBSERVED` stays at 0, Brand-absent positives stay at 0.

## Why: suppression promotes the next wrong candidate

| Case | Brand | Baseline winner | After `G1P1` |
| --- | --- | --- | --- |
| approved-wine-008 | Vino Alpino | `Azienda Agricola Terre Sparse` | `Cascinette d'ivrea Italy` |
| approved-wine-093 | Fontanavecchia | `DELRAY BEACH, FL, USA` | `FALANGHINADELSANNIO` |
| approved-wine-064 | Prinsi | `Prins` | `Prins` (unchanged) |

Removing a wrong candidate hands the position to another wrong candidate. The
Brand does not rise, because nothing in the ranking makes it competitive — the
finding the earlier factorial already established.

## A methodological defect in this experiment, stated plainly

**The treatment population was derived in a different ranking regime than the one
it was tested in.** The 11 targets, and the G/P vocabularies drawn from them, come
from winners observed under the **`E+S′` counterfactual** — eligibility partition
removed and size/length terms neutralized. This experiment correctly runs on
**unmodified production ranking**, where several of those cases have entirely
different winners: `approved-wine-088`'s production winner is
`LA MESMA Yellow Label`, not `GAVI`; `approved-wine-064`'s is `Prins`, not
`AZIENDA AGRICOLA`.

So for several targets the suppressed form was never the production winner, and
suppressing it could not change the outcome. The `KILL` verdicts are correct **as
measured against production**, but they do not test what the vocabulary would do
inside the `E+S′` regime where it was observed. That question is not answered
here and should not be reported as if it were.

## Out-of-target treatment hits — 3, all harmless

| Case | Suppressed | Correct before → after | State |
| --- | --- | --- | --- |
| approved-wine-063 | `AZIENDA AGRICOLA` | false → false | AMBIGUOUS → AMBIGUOUS |
| **approved-wine-104** | `Collio` | **true → true** | AMBIGUOUS → AMBIGUOUS |
| approved-wine-108 | `CALIFORNIA` | false → false | AMBIGUOUS → AMBIGUOUS |

`approved-wine-104` is the real collision the lexical audit predicted: `Collio`
appears as a candidate in a case whose Brand is selected **correctly**.
Suppressing it happened to be harmless here, but it confirms these forms do occur
outside the failure population — lexical zero-collision against governed Brand
*values* did not mean zero occurrence among *candidates*.

## Verdicts

- **G — `COUNTERFACTUAL_KILL`**: 8 suppressions, 0 recovery.
- **P — `COUNTERFACTUAL_KILL`**: 5 suppressions, 0 recovery.
- **Combined — `COUNTERFACTUAL_KILL`**: 13 suppressions, 0 recovery.

None introduced wrong `OBSERVED` or regressed a correct case, so the kill is for
**absence of benefit**, not for harm.

**Predicate-design research is not earned.** Removing wrong candidates does not
make the Brand win; it only changes which wrong candidate wins.

## Smallest next discriminating experiment (proposed, not authorized)

If the semantic direction is to be pursued at all, the honest next step is to
re-derive the treatment population **in the regime it will be tested in** — i.e.
identify production-baseline wrong winners first, then size their vocabulary —
rather than carrying forward a population observed under `E+S′`. Absent that, the
evidence points back to ranking: suppression alone cannot promote a candidate the
ranker does not favour.

## Kept separate, not pulled in to improve coverage

2 OCR fragments · 2 product-descriptor cases · 3 singleton concepts · 2
existing-vocabulary polarity cases · `m-cellars-baseline`, still the only Brand
case with richer semantic/perceptual research earned.

## Carried-forward gap now closed, and one still open

**Closed:** authority state is measured here from the real production path, with
baseline reproduction exact on value and state.
**Still unreported:** full-corpus collateral for the earlier E/S factorial arms.
