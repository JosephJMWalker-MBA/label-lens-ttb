# Preregistration — Brand `too-many-words` counterfactual cost

Frozen and hashed **before** any treatment result was computed.
Evaluation-only. Production selection behaviour is not changed.

## Question

If `too-many-words` stopped rejecting Brand candidates, how much true Brand
evidence is recovered, and how much bad candidate volume, ranking disruption or
false certainty enters the pipeline?

## Causal treatment — exactly this and nothing else

For each generated Brand candidate:

    baseline_reasons        = existing rejection reasons
    counterfactual_reasons  = baseline_reasons - {"too-many-words"}
    candidate is eligible  <=>  counterfactual_reasons is empty

Everything else is frozen: image, OCR, candidate-window generation, every other
filter, ranking, selection, authority state. No new candidate windows, no OCR
change, no ranking-weight change, no truth change, no other filter weakened, no
authority threshold moved.

## Why a fresh instrumented run is required

Committed evidence is insufficient and this was verified, not assumed:

- `brandCandidateDecisions` is capped at 24 per case by the eval harness;
  **49 of 115 cases sit at that cap**.
- **0 of 115** committed cases carry `filterChecks` / `activeRejectionReasons`,
  so the complete rejection-reason set is absent from committed artifacts.

The missing population is therefore not inferred. A fresh run captures every
generated Brand candidate before filtering, with text/value, provenance and
window, the complete rejection-reason set, ranking inputs, and the downstream
counterfactual outcome.

## Why a treatment seam is required

A rejected span never becomes a `Candidate`, so it carries no score or ranking.
`maxProminence` and `maxArea` — the scoring normalization — are computed from the
kept set alone, so admitting candidates shifts the scoring baseline for every
candidate. Ranking, selection and authority effects therefore cannot be derived
by arithmetic over diagnostics; they must be produced by real selection.

The seam is a default-off evaluation-only option,
`counterfactualDisableTooManyWords`, on the existing `BrandSelectionOptions`,
reached only through an exported
`selectBrandObservationWithTooManyWordsCounterfactual`. This mirrors the two
evaluation-only options already in that file. Production `selectBrandObservation`
continues to use `DEFAULT_BRAND_SELECTION_OPTIONS` and is unchanged; a guard test
asserts default selection is identical across the corpus with the option present.

## Frozen candidate-level truth classification

Decided before aggregate counting; not tuned afterwards. It uses the candidate's
own value and the governed acceptable list **only** — never rank, score,
selection, state, or the baseline/counterfactual outcome.

Per candidate, using the repository's governed matchers in `metrics.ts`:

1. `TRUTH_EXACT`      — `brandExactMatch(candidateValue, acceptable)`
2. `TRUTH_NORMALIZED` — `brandNormalizedMatch(candidateValue, acceptable)`
3. `NON_TRUTH`        — neither

`candidateValue` is the candidate's `cleanedValue` when present, else its
`rawText`. **Truth-bearing** = `TRUTH_EXACT` or `TRUTH_NORMALIZED`. For
Brand-absent cases the acceptable list is empty, so every candidate is
`NON_TRUTH` by construction.

## Primary effects

1. **True evidence recovery** — of the 17 `too-many-words` sole-blocker cases:
   how many become eligible, reach top-3, reach top-1, become the selected
   Brand, and how many remain blocked downstream despite admission.
2. **Admission cost** — additional candidates admitted across all 115 cases;
   split truth-bearing vs non-truth; per-case and overall inflation; word-length
   distribution of admitted candidates.
3. **Ranking disruption** — currently correct cases displaced from top-3, top-1
   or selected; currently correct cases unchanged; currently incorrect or
   withheld cases improved; Brand-absent cases where admitted candidates rise
   into consequential ranks.
4. **Authority / false certainty** — correct `OBSERVED` before vs after; wrong
   `OBSERVED` before vs after; previously withheld cases becoming wrongly
   authoritative; any change to the zero-wrong-`OBSERVED` property.

## Strata

- Brand truth present / Brand absent
- currently correct / currently incorrect / currently withheld
- `too-many-words` sole blocker / `too-many-words` with other blockers
- truth-bearing admitted candidate / non-truth admitted candidate

Case-level evidence is preserved for every behavioural change.

## Decision rules — fixed before results

- **GLOBAL RELAXATION — KILL** if removal introduces any new wrong `OBSERVED`,
  displaces a currently correct selected Brand without compensating evidence, or
  admits substantial candidate noise without meaningful truth recovery.
- **CONTINUE TO NARROWER RULE DESIGN** if meaningful true evidence is recovered
  but global removal also admits harmful candidates. Characterize what separates
  beneficial from harmful admissions; do not implement the narrower rule.
- **GLOBAL RELAXATION — CANDIDATE** only if meaningful true evidence is
  recovered, currently correct behaviour is preserved, and false certainty stays
  at zero wrong `OBSERVED`.
- **INCONCLUSIVE** if complete candidate evidence or deterministic truth
  classification cannot be produced reliably.

The baseline's **0 wrong `OBSERVED` and 4 correct `OBSERVED`** is treated as a
high-value safety property. A KILL of global removal does not kill research into
a narrower replacement predicate.

## Determinism

Primary and repeat runs are compared byte-for-byte; digests recorded.
