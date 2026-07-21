# E1a limitations

- **Simulation, not implementation.** The treatment was produced by feeding
  synthetic single-span passes to the real `selectBrandObservation`. Production
  rules are unmodified and every span goes through the identical path, but the
  spans arrive with a different `passId` and are recorded as `whole-line` rather
  than `line-window`. Neither field affects filtering, scoring, ranking, or
  authority. Divergences are enumerated in `specification.md`.
- **Three of the 23 targeted cases were not reached.** Their `too-many-words`
  line did not reproduce as a contiguous word run when matched by raw text, so no
  sub-span was generated for them. The reported reach (20/23) is therefore a
  slight under-count of what a real implementation would attempt.
- **Latency was not measured.** Candidate volume is the proxy. Scoring is cheap
  next to OCR, so the wall-clock effect is probably modest — but "probably" is not
  a measurement, and nothing here should be cited as evidence that the treatment
  is fast.
- **One corpus.** 115 cases, 10 of them brand-absent. "8 of 10 absent cases began
  emitting" is a severe result on a small denominator; the direction is
  unambiguous, the precise rate is not.
- **The filter-rejection tally counts candidate diagnostics, not spans.** It
  totals 9 663 against 9 602 generated spans, because production re-applies
  `shouldTrimWholeLineCandidate` to each synthetic pass and a positive, noisy
  generated span spawns sub-spans of its own. This is recorded in
  `filter-results.json` rather than reconciled away.
- **The tally counts spans, not cases**, and a span rejected by
  an early rule is never tested against later ones — the ladder is first-match.
  So the distribution shows which rule *fired*, not which rules *would have*.
- **`wrongSelectedCandidates` counts every present case whose selected value does
  not match truth**, including the five unresolved boundary referrals. Those five
  are identical in both arms, so they do not affect the delta.
- **The verdict on kill criterion 4 is an interpretation.** Read literally
  ("currently correct **`OBSERVED`** case"), it did not trigger. I recorded it as
  triggered because 12 currently-correct selections were destroyed. That reading
  is stated openly in `recommendation.md` rather than folded silently into the
  tally.
