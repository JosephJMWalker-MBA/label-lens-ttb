# Amendment 1 — classifier precedence

**Disclosure: this amendment was made AFTER the first aggregate was inspected.**
It is not a pre-inspection correction and is not recorded as one. The original
definitions (`frozen-definitions.md`, sha256
`deed0705e41db544d65bb60ecafdf10e6602b4745c31a66a6745f1c52e23a9ea`) are retained
unchanged alongside this file; nothing is silently replaced.

## The correction

> Classifier precedence corrected: exact pre-filter candidate existence is
> tested first, because its existence falsifies an earlier window-formation loss
> for that case.

The original order tested `D` before `A`, which is a taxonomy-driven order rather
than an evidence-driven one. It could have classified a case as a structural loss
while an exact candidate had in fact been generated and then filtered — recording
a window-formation loss where the real loss was filtering.

## Amended precedence

1. **Was an exact / normalized-correct Brand candidate generated pre-filter?**
   - rejected → **A** `EXACT_CANDIDATE_GENERATED_AND_FILTERED`
   - kept → the case does not belong to the 42-loss population; investigate.
2. **Otherwise, why was no correct candidate generated?**
   - a span covering exactly the truth token run was emitted but its constructed
     value differs → **F**
   - truth not contiguous within any single generation unit → **D**
   - an emitted span carries the Brand inside a longer value → **B**
   - an emitted span captures only part of the Brand → **C**
   - the correct run sits inside a unit and nothing corresponding was emitted → **E**
   - otherwise → **G** / **H**

### Why `F` precedes `B`, `C` and `E`

A deviation from the literal order in the correction as received, applied for the
same reason the correction itself gives. If a span covering exactly the truth run
was enumerated, window enumeration **succeeded** for that case; the loss is in
value construction. Classifying it as a window-formation loss would repeat the
error this amendment exists to remove, one stage later. `approved-wine-024` is
exactly this case: the span `CHATEAU dé LAVILLE` was emitted and became
`CHATEAU d LAVILLE`. `D` and `F` are mutually exclusive in practice, since a span
covering the truth cannot be emitted when no unit contains it.

## Effect on results

**None.** Verified before re-running: **0 of the 42 in-scope cases have an exact
pre-filter candidate**, including the single `D` case (`chateau-bonneau`, which
has no exact candidate and no overwide candidate). No case moves into `A`, and
`FILTER_LOSS = 0` is unchanged. The scope guard also holds: **0** in-scope cases
have a kept exact candidate, because a kept exact candidate excludes a case from
the population by construction.

The amended classifier is nonetheless what produced the committed artifacts, so
the evidence and the stated rule agree.
