# Authority gates — what `OBSERVED` currently means for brand

## The finding, stated precisely

`OBSERVED` requires `best.brandClass === "positive"`, and `positive` requires
`hasPositiveBrandSignal`: a possessive (`…'s`) or a token in

```
BRAND_DESIGNATOR = { cellars, cellar, estate, estates, vineyard, vineyards,
                     winery, wineries }
```

There is no other route. Consequently **a brand whose name contains neither a
possessive nor one of those eight words cannot become `OBSERVED`, at any OCR
confidence, at any rank, with any score.** `SAKER`, `FULCRUM`, `VALDINERA`,
`APHRODITE`, `KYRIOS` are all read correctly, ranked first, at evidence 0.80–0.95,
and all remain `AMBIGUOUS`.

Corpus effect: 4 `OBSERVED` cases in 115. All four contain a designator or
possessive. All four are correct.

## This is a deliberate design, and it is working

The gate's comment says it plainly: a plausible-but-not-positively-distinguishable
line "stays AMBIGUOUS — its value, geometry, and alternates are preserved for a
human, but it never silently drives a brand match."

The measured consequences are exactly what that intends:

- **0 wrong values marked `OBSERVED`** across 115 cases;
- **0 absent-brand false positives** across 10 absent cases;
- every uncertain case reaches a human with its value and alternates intact.

`AMBIGUOUS` here is not a failure state. It preserves the value, carries
alternates, and is the repository's documented human-deferral signal. A reviewer
looking at `SAKER` sees `SAKER`.

## What I am *not* recommending

**I am not recommending that `OBSERVED` be weakened because the correct candidate
is ranked first.** Rank is not evidence of correctness — it is evidence of
relative score among the candidates that happened to be generated. In this corpus
ranking first coincides with being right 29 times out of 29, but that statistic is
conditioned on truth having survived generation at all (37 of 105), and the
generation stage is where 43 cases are already lost. Promoting rank-1 candidates
to `OBSERVED` would move all 29 correct ones — and would also have promoted the
leading candidate in the 7 `WRONG_SELECTED_CANDIDATE` cases and in an unknown
number of the 43 generation misses, where the selected value is confidently wrong
(`"2 LRS3 aoc"`, `"HLTRE"`, `"Indigenous blend"`). The current gate is precisely
what keeps those from being asserted.

The honest reading of the 25 abstentions is **not** "the gate is too strict". It
is: *the gate is a designator detector, and it is being asked to serve as a
general brand-confidence signal.* Whether a second, equally conservative route to
`positive` should exist is a **product and evidentiary question**, not a tuning
question, and it is out of scope for this diagnosis.

## Secondary gates

- **`competing-prominence-rival`** (61 cases): a rival within 80 % of the leader's
  text height. This fires often on front labels where the brand and the varietal
  are set at similar sizes. It is a genuine ambiguity signal, not a defect.
- **`weak-contested-lead`** (20 cases): leader below the 0.6 evidence floor with a
  non-corroborating alternate.
- **`below-confidence-floor`** (1 case): positive signal present but evidence
  < 0.6.

Note that the first two would still hold 14 of the 25 correct-but-abstained cases
`AMBIGUOUS` even if the positive-signal requirement disappeared. The designator
gate is the dominant term, not the only one.

## Consequence for experiment design

Because `brandClass === "positive"` is both the largest ranking term (`+2`) and a
hard authority precondition, **any change to candidate generation or ranking
leaves the authority histogram essentially unchanged** unless it happens to
surface a designator-bearing span. Experiments in `candidate-experiments.md` are
therefore scoped to candidate usefulness (recall, top-3, selected accuracy) and
explicitly protect the authority gate and the two zero-valued safety metrics.
