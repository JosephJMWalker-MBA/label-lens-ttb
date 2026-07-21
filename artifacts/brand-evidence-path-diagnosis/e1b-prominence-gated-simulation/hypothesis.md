# E1b hypothesis — prominence-gated recovery spans

**Simulation only. No production code, fixture, schema, test or UI was modified.**
Branch `research/brand-evidence-path-diagnosis`, base `a9fe943`.

## Question

Can the already-existing brand prominence concept safely distinguish visually
prominent brand-bearing lines from small prose lines *before* generating recovery
sub-spans?

## Treatment as fixed by the brief

A source line is considered only when both hold:

1. its whole-line candidate was rejected specifically as `too-many-words`;
2. it satisfies production's own eligibility expression from `brandRanking`,
   using the existing constants unchanged:

```
prominence > maxProminence * BRAND_SCORE_PROMINENCE_FLOOR_RATIO
                           + BRAND_SCORE_PROMINENCE_BUFFER_PX
```

Both constants are **read out of `src/pipeline/extractor/field-selection.ts` at
runtime** by the simulation, so no new threshold or constant exists anywhere in
this experiment and none can drift from production. No alternate threshold was
tested and none was tuned after seeing results.

## Result

**Phase 1 triggered the immediate kill condition. Phase 2 was never run.**

8 of the 10 brand-absent cases emitted a selected value under treatment — the
same 8, with the same values, as the already-killed E1a. Two reached `OBSERVED`.

The prominence gate **rejected nothing at all** on brand-absent labels: 0 of 56
`too-many-words` lines were filtered out.

## Why — the mechanism, in one paragraph

The eligibility rule is **relative to the label's own strongest candidate**. On a
brand-absent label there are no kept brand candidates, so `maxProminence` is
**0**, the floor collapses to the 1-pixel buffer, and every line between 18 and
52 pixels tall qualifies. The gate is undefined exactly where it was needed most.
Production never hits this because with zero candidates it returns `NOT_OBSERVED`
before any floor is computed — the floor only has meaning once a brand mark
already exists. **Any implementation of E1b would have to invent a fallback for
the zero-candidate case, and that fallback would itself be a new threshold**,
which this experiment was expressly forbidden to introduce.
