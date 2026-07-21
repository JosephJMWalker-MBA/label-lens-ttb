# Diagnostic-history disclosure

This correction is preserved deliberately, because the retracted claim shaped an
earlier recommendation and would otherwise survive in the record.

## What was claimed

An earlier round reported that the corroborated-contradiction signal fires on
`approved-wine-037` **and on two currently-correct cases** — `approved-wine-031`
and `wine-multi-artifact-05` — and priced the treatment at "2 of 68 correct cases
demoted".

## What was actually true

**The two correct-case contradictions were caused by an ad-hoc regex bug in the
research instrument, not by pipeline behaviour.**

`../alcohol-digit-ocr-diagnosis/control-simulation.mjs` parsed re-read text with
`(\d{1,2}(?:[.,]\d{1,2})?)\s*%`. On the string `135%` that pattern cannot match at
the leading digit, backtracks, and returns **35**.

**Production canonicalization correctly interpreted `135%` as 13.5**, via
`implicit-decimal-recovery` in `canonicalizeAlcoholNumber` — the same value
production had already selected. The "contradiction" was the measuring instrument
disagreeing with itself.

Visual adjudication confirmed both cases independently of stored truth and OCR
output: `approved-wine-031` reads `Alc. 13.5% by Vol`, `wine-multi-artifact-05`
reads `ALC 13.5 % BY VOL`. Both machine values were correct; both fixture truths
were correct; neither needed review.

## Consequences

- **The false-alarm claim was withdrawn.** The stated cost of "2 correct cases
  demoted" does not exist.
- **All later analysis used production-equivalent numeral handling** — re-reads
  re-derived through the real `selectAlcoholObservation`, and numerals
  canonicalized through the production `canonicalizeAlcoholNumber(_, true)` rather
  than any regex written for the study.
- Supersession banners were added to the affected diagnosis artifacts
  (`../alcohol-digit-ocr-diagnosis/summary.md` and
  `../alcohol-digit-ocr-diagnosis/candidate-experiments.md`) rather than editing
  the superseded numbers away.
- Had this experiment proceeded to implementation, a regression test asserting
  that `135%` is never interpreted as `35` in the comparison path would have been
  mandatory. It is recorded here as a requirement for any future round.

## Why this matters beyond the bug

The corrected measurement is what makes the trigger look clean (zero false
alarms). A result that improves after fixing one's own instrument deserves more
scepticism, not less — which is part of why the production treatment was killed
rather than shipped on a single true positive.
