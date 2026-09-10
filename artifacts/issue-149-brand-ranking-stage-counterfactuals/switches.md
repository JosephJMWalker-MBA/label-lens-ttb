# Frozen counterfactual switches F / E / S

Frozen **before** aggregate treatment outcomes were computed. Offline
counterfactual diagnosis, not production tuning. No production ranking, family
key, threshold, weight, filter, generation or authority is changed.

## Evaluation dependency

Descends from the ranking-loss diagnosis `6a969e4b`, which descends from the
oracle checkpoint `8de5b9fc`. Ancestry is an **evaluation dependency only** and is
not a claim that the oracle seam belongs in production.

## Method: pure offline evaluation

Candidates and their complete ranking inputs are captured once from the real
selector, then the family stage, dedupe stage and comparator are re-simulated
offline. **Gate: the offline evaluator must reproduce the production result
exactly** — family winner, final comparator pool, top-3, top-1 and selected value
— before any switch is applied. No new production seam is introduced; the
existing default-off oracle seam supplies the correct candidate.

Baseline (`F0 E0 S0`) is *production with the oracle candidate present*, which is
the oracle experiment's treatment arm. That is the correct baseline here, since
F/E/S ask what must change **given** the correct candidate exists.

## F — FAMILY RETENTION

For the **oracle exact Brand candidate only**, exempt it from removal by
`bestFamilyCandidates` and `dedupeBestCandidates`. The existing family winner is
retained as well — nothing is displaced. Family keys, scores, filters and all
other candidates are untouched.

Deliberately oracle-assisted and **non-deployable**. It asks only: if the correct
candidate reached the comparator alongside its overwide sibling, what happens?

The two instance-level dedupe cases, where an equal-valued candidate already
survives, are reported **separately** from the 12 substantive same-family
evidence losses.

## E — ELIGIBILITY PARTITION REMOVED

The `scoreEligible` partition is removed for **every candidate in the treated
case**, not only the oracle. The truth candidate receives no privilege.

Replacement comparator, frozen before results: the **existing eligible-candidate
chain**, applied to all candidates —
`ranking-score` → `prominence` → `ocr-evidence-score` → `normalized-value-key`.
This is the least-inventive interpretation: it is already the ordering the code
uses once a candidate is eligible, so no new ordering semantics are invented.

`score.total` is not altered by E.

## S — SIZE / LENGTH SCORE TERMS NEUTRALIZED

Neutralized for **every candidate in the treated case**, from the frozen
inventory:

| Term | Weight | Why it is in the set |
| --- | --- | --- |
| `prominence` (normalized) | ×0.8 | physical footprint — glyph height / `maxProminence` |
| `area` | ×0.6 | physical footprint — span area / `maxArea` |
| `meaningfulChars` | ×1.6 | literally text length, `min(1, alphaChars/14)` |

`score.total` is recomputed as `total − 0.8·prominence − 0.6·area − 1.6·meaningfulChars`.

### Boundary case, documented rather than silently resolved

`structure` = `min(1, (informativeAlphaTokenCount + (alphaTokens>1) + positive)/4)`
is **also** length-monotone, because `informativeAlphaTokenCount` counts tokens of
length ≥ 3 and can only rise as text is added. It is nevertheless **excluded**
from S because it additionally encodes `brandClass === "positive"`, a semantic
signal, and the instruction forbids neutralizing non-size semantic evidence.
Neutralizing it would remove semantic evidence along with the length effect.
A variant `S′` including `structure` is a legitimate follow-up and is not run here.

Penalty terms (`lowInformationPenalty`, `residualPenalty`) are excluded: they
penalize rather than reward, so they are not in the "monotonically reward" set.

### Eligibility interaction

`prominence` participates in both the eligibility gate and `score.total`. **S
neutralizes only its score contribution.** The gate is controlled solely by E, so
the two switches remain independent.

## Factorial

All eight combinations of F/E/S are evaluated across all 37 ranking-loss cases —
**every case in every arm**, not only the stage a case was originally assigned to,
so interactions such as "survives F then fails E" are observable.

## Minimum sufficient intervention set

Each case is assigned the smallest switch set under which the correct Brand is
selected. When several minimal sets of equal size exist, **all** are preserved.

## Authority boundary

Authority state is recorded per arm but kept downstream of and distinct from
ranking success. A case counts as a ranking success when the correct Brand is
selected, regardless of whether it reaches `OBSERVED`.
