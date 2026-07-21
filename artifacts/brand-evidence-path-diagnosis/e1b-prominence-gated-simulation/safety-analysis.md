# E1b safety analysis

## The immediate kill condition

> *Any brand-absent case emits a selected value → stop, do not inspect
> present-case gain metrics, record E1b as killed.*

**8 of 10 brand-absent cases emitted a selected value.** The condition fired, the
run stopped, and no brand-present treatment metric was computed.

## Alternates

**Zero brand-absent cases produced an alternate candidate.** This is not
reassuring. It is worse than the alternative: it means each of the eight cases
converged on a *single* fabricated brand with no competing reading, which is
precisely the shape that suppresses the `competing_candidates` ambiguity route and
lets two of them reach `OBSERVED`.

## What survived on labels with no brand

Producer, regulatory, designation and prose fragments all survived:

- **Prose fragments:** `BECAUSE OF THE RIS`, `PEPPEE This very`,
  `OPENED THEIR WINERY AND` — mid-sentence windows of back-label copy.
- **Address / office text:** `OFFICE PALAZZOLO DISONA -` on two cases.
- **Generic product wording that escaped its own filter:** `STILL WHITE WINE`.
  The `generic-product-language` rule rejects a span only when *every* alpha token
  is generic; `STILL` is not in the vocabulary, so the span passes.
- **Place-like wording:** `MARBLE CREEK ACRES`.
- **Designator-bearing prose:** `Baltana Vella vineyard`, `OPENED THEIR WINERY AND`
  — both **`OBSERVED`**.

364 generated spans were kept as `candidate-plausible` and 10 as
`candidate-positive`, on labels that have no brand.

## Producer/bottler exclusion

Bypassed again, by the same mechanism as E1a: `isProducerLine` requires a producer
word **and** a standalone `by` within the same span, and a 4-word window of a
bottling statement usually contains neither. 5 of the 7 producer/bottler
`too-many-words` lines corpus-wide passed prominence eligibility, so the gate does
not compensate.

## The designator finding, reconfirmed

`Baltana Vella vineyard` and `OPENED THEIR WINERY AND` cleared the authority gate
solely because a prose window contained `vineyard` / `WINERY`. E1a found this;
E1b reproduces it exactly, **with the prominence gate in place**. The gate does
not touch the mechanism, because the mechanism lives in the authority stage, not
the generation stage.

This is now a twice-measured property: **the `BRAND_DESIGNATOR` vocabulary is a
safe authority signal only while candidates are whole, coherent label lines.**
Any future proposal that admits sub-spans inherits this, and no generation-side
gate can fix it.

## Why the gate could not work — root cause

The eligibility expression is **relative to the label's own strongest candidate**:

```
prominence > maxProminence * 0.4 + 1px
```

On a brand-absent label there are no kept candidates, so `maxProminence` is 0, the
floor collapses to 1 pixel, and every line 18–52 px tall qualifies. Measured: **0
of 56 brand-absent lines rejected**, against 0 of 422 brand-present lines having a
zero maximum.

Production never encounters this because with zero candidates it returns
`NOT_OBSERVED` before any floor is computed — the floor is only meaningful once a
brand mark already exists. **Implementing E1b would therefore require inventing a
fallback for the zero-candidate case, and that fallback would be a new threshold**,
which this experiment was expressly forbidden to introduce. The gate is not merely
ineffective here; it is *undefined* on the population it most needed to protect.

## And it does not separate the populations anyway

Even where the ratio is defined, lines that produced E1a regressions have a
**higher** median prominence ratio (0.530) than lines containing fixture truth
(0.492). The two distributions overlap across their whole range. **No threshold on
this axis — higher, lower, or otherwise — separates brand-bearing lines from
regression-producing ones.** That conclusion does not depend on the particular
value 0.4, which is why it is reported as a property of the axis rather than of
the constant, and why no alternative threshold was tried.
