# Limitations — Alcohol recovery-strip orientation attribution

## What this result is

A mechanism-existence test on five governed cases. It establishes that the
mandatory edge-strip rotation can destroy legible, horizontally oriented Alcohol
text that sits fully inside the recovery crop.

## What this result is not

- **Not a rate claim.** Five cases cannot estimate how often this occurs. No
  percentage, prevalence, or population-level statement is supported.
- **Not a finding about the population these templates serve.** All six cases here
  are `LOW_CONFIDENCE`, where recovery does not run in production today. The
  edge-strip templates exist for the 45 `NOT_OBSERVED` cases, which this experiment
  did not touch. Whether rotation harms or helps there is untested.
- **Not a production defect report.** Nothing was changed, enabled, or proposed for
  production. The rotation may be correct for the vertically oriented text it was
  designed to read.
- **Not an authorization for Stage 2 trigger expansion.** All five primary cases
  already hold the correct Alcohol value from the primary pass. Nothing here argues
  recovery should run on `LOW_CONFIDENCE` cases at all.

## Orientation is not a universal explanation

`approved-wine-020` is fully contained in its recovery crop and produced no
truth-bearing evidence in any of the three arms. At least one fully-contained
failure has a different, still-unidentified cause. Any successor work should carry
this case forward rather than treating orientation as a complete account.

## The most important safety signal

Three treatment candidates (`approved-wine-023`, `approved-wine-079`,
`approved-wine-097`) reached `OBSERVED` state from a **recovery** pass in isolation.
All three were correct, so this experiment records zero false reliable reads.

This is nevertheless the dominant risk carried into any successor experiment: an
unrotated recovery crop that can reach `OBSERVED` on a correct read can equally
reach `OBSERVED` on a wrong read for cases outside this frozen set. That risk is
entirely unmeasured here. A recovery-orientation policy experiment must therefore
be scoped on the `NOT_OBSERVED` population with false-reliable-read as its primary
veto, not on these six cases.

Note also that these `OBSERVED` states were produced by selecting on a single
recovery pass in isolation, per the requirement that passes not be combined before
per-pass reporting. Production combines passes through the existing ranking logic,
so these isolated states do not predict what a combined selection would yield. That
question was deliberately not asked.

## Boundary-confidence case

`approved-wine-023` has primary-pass confidence 0.58, within 0.02 of the 0.6
`LOW_CONFIDENCE` threshold, and its treatment candidate crossed to `OBSERVED`. Two
additional treatment repeats were run beyond the standard single repeat; see
`boundary-repeats-approved-wine-023.json`.

## Partial-containment diagnostic

`approved-wine-034` (52.3% containment) returned null in all three arms. It informs
crop-planner work only and did not contribute to the orientation decision. Its
Alcohol clause sits mid-label rather than bottom-of-label and straddles the ~12%
gap between the two edge strips, so it is structurally unlike the other five.

## Annotation provenance caveat inherited from the geometry audit

The Alcohol-region geometry that established containment was annotated in a single
review session by two passes of the same reviewer, not by two independent readers.
It was sufficient to establish containment against exactly-known crop boundaries,
but it is not independently adjudicated truth. See
`artifacts/issue-149-alcohol-low-confidence-geometry-audit/alcohol-region-annotations.json`.
