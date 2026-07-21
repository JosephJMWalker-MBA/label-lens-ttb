# Hypothesis — corroborated OCR contradiction

Branch `experiment/alcohol-corroborated-contradiction`, base `9ecd7b2`
(current `origin/main`).

> **OUTCOME: KILLED (deferred). Nothing was implemented.** The hypothesis below
> was specified, costed, and stopped at the schema boundary. It was not refuted —
> it was judged insufficiently evidenced to ship. See `decision.md`,
> `limitations.md`, `cost-analysis.md`, and `revisit-criteria.md`.

## Hypothesis

When two bounded re-reads of the selected alcohol evidence agree on the same
canonicalized numeral, and that numeral differs from the primary selected value,
the observation should preserve the primary evidence and value but be marked
ambiguous for human review.

## What this is not

- Not a value replacement: `19.0` is never rewritten to `13.0`.
- Not a confidence statement: the primary tokens here score 79–96.
- Not a plausibility bound, a truth-aware test, or fixture-specific logic.
- Not `NOT_OBSERVED`: a complete statement *was* extracted.

## Prior measurement (see `artifacts/alcohol-digit-ocr-diagnosis/`)

Evaluated over all 115 cases with the production parser, the plain T1 signal
fires on `approved-wine-037` and on nothing else — 0 correct-case demotions, 0
LOW_CONFIDENCE, 0 absent-alcohol, 0 OCR-failure cases — deterministically across
two full runs.

Two caveats carried forward unchanged: the signal rests on **one** true positive,
and the numeral-correspondence rule was not pinned down by the diagnosis.

## Superseded earlier claim

An earlier control reported this signal firing on two currently-correct cases
(`approved-wine-031`, `wine-multi-artifact-05`). That was a bug in the diagnostic
harness: it parsed re-read text with an ad-hoc regex that reads `135%` as **35**,
where production's `implicit-decimal-recovery` correctly reads **13.5**. Both
false alarms are withdrawn. A regression test asserting that `135%` is never
read as `35` would be mandatory for any future round; none was written here,
because nothing was implemented.

## Outcome

Not implemented. `AMBIGUOUS` cannot represent the finding honestly without a
three-part schema extension, and the evidence — one true positive, two re-reads
sharing crop, preprocessing, engine, model and language, 128 added OCR
executions across the fixed corpus — does not justify extending the contract.
Recorded as a completed research result.
