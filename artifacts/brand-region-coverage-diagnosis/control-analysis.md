# Control analysis

6 controls, fixed before measurement: all remaining `decorative-or-script-brand`
cases plus all `La Fattoria` fixtures, minus the primary set — `luigi-giovanni-live`,
`approved-wine-013`, `amuninni-ferracane`, `approved-wine-105`, `approved-wine-107`,
`approved-wine-108`.

## A methodological limit, stated before the numbers

**Controls have no human-approved annotation.** Their "region" is derived from the
machine's own selected-brand geometry — that is, from a place where the machine
already read something. Any comparison of *recognition* outcomes between primary
and control is therefore partly circular.

**Consequently the controls' first-failure categories are not reported and must
not be used.** Only the size, volume and confidence distributions are compared,
and even those carry the bias above.

## Distributions

| Measure | Primary (n = 10) | Control (n = 6) |
|---|---|---|
| Region width (px) | 80 – 822 | — |
| Region height (px) | 50 – 340 | — |
| **Region area, % of image** | 3.14 – **8.21** – 25.43 | 1.38 – **3.26** – 9.41 |
| Passes geometrically covering | 1 – 1 – 1 | 1 – 1 – 1 |
| **Executed passes** | **1 – 1 – 1** | **1 – 1 – 1** |
| Overlapping word count | 0 – **2** – 8 | 1 – **3** – 10 |
| **Mean confidence of overlapping words** | 0 – **25** – 54 | 55 – **89** – 92 |
| Decorative / script typography | 6 / 10 | 6 / 6 |
| Rotated, vertical or wraparound | 6 / 10 | 4 / 6 |
| Pass kind producing the best evidence | full-image-primary | full-image-primary |

(min – median – max.)

## What survives the circularity caveat

1. **No recovery pass ran anywhere** — 1 executed pass in all 16 cases, primary
   and control alike. This is unaffected by how regions were drawn.
2. **The confidence gap is large** (median 25 vs 89) but is *exactly* the measure
   the circularity inflates, so it is reported and **not** relied upon.
3. **Failing brand regions are not small** — they are, if anything, larger as a
   share of the image (median 8.2 % vs 3.3 %). **Region size is not the
   explanation**, and that conclusion is not weakened by the region-derivation
   difference, because it runs opposite to the bias.
4. **Decorative/script typography does not separate the groups** — 6/10 primary,
   6/6 control. It is a necessary-looking condition, not a sufficient one.

## What a proper control would require

Human-approved annotations for the control cases too, drawn under the same rule
and without sight of machine output. That was out of scope here. **No production
threshold may be inferred from any of these distributions.**
