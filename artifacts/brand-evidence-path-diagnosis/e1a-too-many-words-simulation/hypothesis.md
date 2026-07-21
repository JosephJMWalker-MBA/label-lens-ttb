# E1a hypothesis — sub-spans for `too-many-words` lines only

**Simulation only. No production code was modified and nothing is proposed for
implementation by this document.** Branch `research/brand-evidence-path-diagnosis`,
base `a9fe943`.

## Question

Would generating ≤4-word contiguous sub-spans **only** for whole lines rejected as
`too-many-words` improve brand candidate usefulness without weakening any filter
or authority rule?

This is deliberately narrower than the original E1, which would have opened
sub-spans for every rejection reason.

## Prior reasoning

The diagnosis found that 43 of 115 cases lose the truth between line
reconstruction and candidate generation, that `too-many-words` is the single
largest reason (23 cases), and that in those 23 cases **every** candidate the run
produced carried `assembly: "whole-line"` — no sub-span was ever tried. The
mechanism is `shouldTrimWholeLineCandidate`, which only opens sub-spans when the
whole line already produced a *positive* candidate.

The hypothesis was that offering those sub-spans to the unchanged filter,
classifier, scorer, ranker, and authority gate would let the truth compete.

## Result, stated up front

**The generation half of the hypothesis is confirmed. The end-to-end claim is
false, decisively.**

- Truth survives as a kept candidate in **17 of the 23 targeted cases**, up from
  **0**. Generation was indeed the blocker.
- **0 of those 17 reach the top 3. 0 become the selected value. 0 become
  `OBSERVED`.**
- Corpus-wide: **0 gains, 20 regressions**, normalized selected match falls
  **29 → 17**, and **8 brand-absent cases begin emitting a value**, two of them at
  `OBSERVED`.

The treatment fails five of the six kill criteria. See `recommendation.md`.
