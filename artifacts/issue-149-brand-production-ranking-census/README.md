# Issue #149 — production Brand ranking census

Census and diagnosis of the **real deployed regime**. **Production behaviour
changed: no.** No ranking, filter, candidate enumeration, authority, OCR or
vision touched; no counterfactual run.

| | |
| --- | --- |
| Base | **`195182c5ccef51e4a15767801d184d12ab07e52a`** (verified) |
| Branch | `research/brand-production-ranking-census` |
| Clean base | `field-selection.ts` **byte-identical to `origin/main`**; all six counterfactual seams absent |
| Frozen taxonomy | `f8bae5a9fd3ecf1f7761ebf5473354c90ce61abf5263bab2ba4d86f31e41dc3f` |
| Diagnostics parity | **EXACT** on value and state, 115/115 |
| Determinism | **PASS**, fail-closed |

## Fresh production cascade (105 Brand-present, recomputed from `main`)

| Stage | Cases | Lost |
| --- | --- | --- |
| Brand-present | 105 | — |
| raw truth present in OCR | 79 | −26 |
| exact candidate generated | **37** | **−42** |
| survives filtering | 37 | **0** |
| survives family / dedupe | 37 | **0** |
| final top-3 | 34 | −3 |
| final top-1 | 29 | −5 |
| correctly selected | 29 | 0 |
| **correctly authoritative** | **4** | **−25** |

## Mechanism counts — every Brand-present case assigned

| Mechanism | Cases |
| --- | --- |
| `CANDIDATE_NOT_GENERATED` | **68** |
| `CORRECT_SELECTED_BUT_AUTHORITY_RESTRAINED` | **25** |
| `SCORE_ORDERING` | 5 |
| `CORRECT_AND_AUTHORITATIVE` | 4 |
| `ELIGIBILITY_GATE` | 3 |
| `FILTER_LOSS` · `FAMILY_OR_DEDUPE_SUPPRESSION` · `TIE_BREAK` · `OTHER` · `UNDETERMINABLE` | **0** |

**True comparator ranking failures: 8. Pre-comparator losses: 0.**

## A correction to earlier work

**`FAMILY_OR_DEDUPE_SUPPRESSION` is 0 in production, and `FILTER_LOSS` is 0.**
The ranking-loss diagnosis reported 14 family-suppression cases — those were an
artifact of the **oracle regime**, where injected exact-window candidates competed
inside existing line families. No production correct candidate is suppressed
before the comparator, and none is rejected by a filter. `correctScoresHigherButEliminatedEarly`
is empty.

## The 8 true ranking failures

| Case | Brand | Mechanism | Correct (elig/score/prom) | Winner (elig/score/prom) |
| --- | --- | --- | --- | --- |
| approved-wine-013 | Afflicted | `ELIGIBILITY_GATE` | false / 3.408 / 24 | `Play ers Heart` true / 5.437 / 63 |
| approved-wine-033 | Haywater Cove | `ELIGIBILITY_GATE` | false / 4.141 / 37 | `COVE` true / 3.434 / **131** |
| approved-wine-057 | Prinsi | `ELIGIBILITY_GATE` | false / 2.112 / 24 | `JI Lill` true / 1.483 / 84 |
| approved-wine-056 | Prinsi | `SCORE_ORDERING` | true / 2.732 / 23 | `CAMP dPIETRU` / 4.310 |
| approved-wine-071 | AltaCima 6.330 | `SCORE_ORDERING` | true / 4.347 / 63 | `LATE HARVEST 2013` / 4.507 |
| approved-wine-079 | Le Caniette | `SCORE_ORDERING` | true / 3.069 / 14 | `OFFIDA` / 3.715 |
| le-caniette | Le Caniette | `SCORE_ORDERING` | true / 2.584 / 14 | `INDICAZIONE GEOGRAFICA PROTETTA` / 5.656 |
| approved-wine-087 | Viridis | `SCORE_ORDERING` | true / 3.273 / 67 | `LANGHE SAUVIGNON Tuga` / 5.232 |

In two eligibility cases the correct candidate **scores higher** than the winner
(4.141 vs 3.434; 2.112 vs 1.483) and still loses, because the boolean gate is the
primary comparator.

Winner roles, classified only after the causal stage: other brand-like short 4,
other brand-like phrase 3, contains digits 1. **No overwide brand superset, no
appellation, no producer entity.** The G/P vocabulary from the `E+S′` residual
population does **not** independently reappear here and is therefore not imported.

## Control — 8 failures vs 29 correctly selected

| Feature of the correct candidate | Failures | Correct cases | Distinguishes? |
| --- | --- | --- | --- |
| `scoreEligible = true` | 0.625 | **1.000** | **Yes** |
| median prominence | **24** | **56** | **Yes** |
| `positiveSignal = 1` | 0.000 | 0.138 | Weakly |

Every correctly selected case had an eligible correct candidate, and its correct
candidate is typically **twice as tall**. Unlike the line-rejection signal in the
earlier semantic diagnosis, these genuinely separate the populations.

## Answers

1. **8** genuine production ranking failures — 7.6% of Brand-present cases.
2. 3 `ELIGIBILITY_GATE`, 5 `SCORE_ORDERING`, 0 tie-break, 0 family/dedupe, 0 filter.
3. **No bounded dominant ranking mechanism.** The whole ranking population is 8.
4. **A production-aligned ranking counterfactual is only marginally earned**:
   maximum upside 8 cases, and 3 of them need the eligibility gate changed, whose
   full-corpus collateral is still unmeasured.
5. **The dominant remaining Brand problem is upstream.** `CANDIDATE_NOT_GENERATED`
   is **68 of 105 (65%)** — 26 with no raw OCR truth at all, and **42 where OCR
   read the Brand but no exact candidate was ever generated**.

## The second-largest population is authority, not ranking

**25 cases select the correct Brand and report `AMBIGUOUS`.** Production asserts
`OBSERVED` only 4 times out of 29 correct selections. That is three times the
ranking population and has never been diagnosed.

## Smallest production-aligned experiment earned

Not ranking. Either **(a)** the 42 read-but-not-generated cases — a
production-aligned candidate-generation census, the largest addressable block; or
**(b)** a read-only authority census over the 25, asking which gate condition
withholds `OBSERVED` from an already-correct Brand. Both are read-only and neither
is started.

## Verification

Fail-closed on missing/empty artifacts, command failure, empty hash, parity
mismatch and determinism mismatch; explicit `PASS`. Diagnostics variant checked
against the real analyzer response on value **and** state.
