# Frozen production ranking-loss taxonomy

Frozen **before** aggregate interpretation. Census and diagnosis of the **real
deployed algorithmic regime**. No ranking, filter, candidate enumeration,
authority, OCR or vision is changed, and no counterfactual is run.

## Clean base — experimental ancestry deliberately abandoned

Branched fresh from `origin/main` at
`195182c5ccef51e4a15767801d184d12ab07e52a` (verified). `field-selection.ts` is
**byte-identical to `origin/main`**, and all six counterfactual seams are absent:
`oracleExactWindows`, `counterfactualDisableTooManyWords`,
`counterfactualGeographyForms`, `counterfactualProducerForms`, and both treatment
entry points. No E/S/S′ evaluator, no G/P suppression, and **no treatment
population inherited from those regimes**.

Two diagnostic surfaces are used, and both are ordinary parts of `main`:
`selectBrandObservationWithCompleteFilterDiagnostics` (PR #220, documented
selection-identical) and `classifyRawOcrMatch` (PR #223). Neither alters selection.

## Why the reset

The G/P experiment derived its treatment population from winners observed under
`E+S′` and then evaluated it under production ranking, where several of those
cases had different winners. **No E+S′ winner identity is carried into this
census.** Every population here is recomputed from current `main` against current
frozen truth.

The direct-production G/P measurement remains valid and is the only prior result
reused as context: 13 candidates suppressed, 0 production cases improved, 0
regressed.

## Population definition

For each Brand-present case, the primary census population is:

> the correct exact/normalized Brand candidate **reaches the real final ranking
> pool**, and production still does not select it correctly.

A correct candidate removed by family or dedupe **before** the comparator is a
**pre-comparator loss**, recorded separately and never counted as a
comparator-ranking failure. Membership of the final pool is decided by a fact in
the data — `decision` is assigned only while iterating the post-family,
post-dedupe `ranked` pool — not by inference.

## Frozen primary taxonomy, assigned by code-path evidence

Assigned in pipeline order, by the earliest stage at which the correct candidate
is actually lost. Winner semantics are **never** used to assign the primary
mechanism.

1. `CANDIDATE_NOT_GENERATED` — no exact/normalized correct candidate exists pre-filter.
2. `FILTER_LOSS` — a correct candidate exists pre-filter and is rejected by a filter.
3. `FAMILY_OR_DEDUPE_SUPPRESSION` — kept, but removed before the comparator.
4. `ELIGIBILITY_GATE` — reaches the comparator, `scoreEligible: false` while the
   winner is `true`, so it loses on the primary comparator before any score compare.
5. `SCORE_ORDERING` — both share eligibility and the correct candidate loses on `score.total`.
6. `TIE_BREAK` — `score.total` ties and a later comparator entry decides.
7. `CORRECT_SELECTED_BUT_AUTHORITY_RESTRAINED` — the correct Brand **is** selected,
   but the observation state is not `OBSERVED`. Kept strictly separate from
   selection failure.
8. `OTHER` · `UNDETERMINABLE`.

## Authority vocabulary

Reported using the repository's actual states: `OBSERVED`, `LOW_CONFIDENCE`,
`AMBIGUOUS`, `NOT_OBSERVED`. Selection failure and restrained authority are
reported as separate populations and never merged.

## Controls

Production ranking-loss cases are compared against **correctly selected**
production cases using the identical procedure. Any feature offered as
explanatory must be shown to **distinguish** the populations, not merely to occur
in memorable failures.

## Semantic audit ordering

Winner roles are classified **only after** the causal stage is known, and
observationally. The G/P vocabulary is **not** imported; a form counts here only
if it independently appears in this production population.
