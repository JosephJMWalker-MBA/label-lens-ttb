# Authority-gate audit

**No production code is changed.** This measures how the current brand authority
gate behaves against the two-axis model, using the gate logic in
`src/pipeline/extractor/field-selection.ts`.

## What the gate actually keys on

`OBSERVED` requires `brandClass === "positive"` and evidence ≥ 0.6.
`classifyBrandLine` sets `positive` from `hasPositiveBrandSignal`:

```
possessive  ( '…'s )   OR   a token in BRAND_DESIGNATOR
BRAND_DESIGNATOR = { cellars, cellar, estate, estates, vineyard, vineyards, winery, wineries }
```

So the positive signal is: **a possessive, or a winery/vineyard/cellars/estate
designator.** Company suffixes (`Inc.`, `Co.`, `LLC`) are *not* in the set;
prominence and explicit name/address lead-ins do not create the positive signal;
absence of a competing brand does not either. The gate is, functionally, a
**brand-entity-designator + possessive detector.**

## Where a company-style name becomes positive

Across the corpus the four cases that reach `OBSERVED` for brand are exactly the
four whose truth is a designator-bearing or possessive company name:

| Case | Truth | Positive signal | Correct answer? |
|---|---|---|---|
| `three-steves-winery` | 3 Steves Winery | `winery` | yes — explicit brand |
| `approved-wine-086` | 3 Steves Winery | `winery` | yes — explicit brand |
| `approved-wine-073` | Mike's Farm, Inc. | possessive `Mike's` | yes — explicit brand |
| `wine-multi-artifact-09` | Duck Walk Vineyards | `vineyards` | yes — explicit brand |

**All four are genuinely correct** (they are explicit marketed brands displayed as
identity — see `case-matrix.md`). But three of the four are correct **because the
brand happens to be a winery/vineyard name or a possessive**, not because the gate
recognised it as the marketed identity.

## Where an explicit marketed brand stays only *plausible* (the false negatives)

Cases whose two-axis brand IS an explicit marketed brand, but which the gate does
**not** mark positive because the name carries no designator/possessive:

| Case | Explicit brand | Why not positive | Current state |
|---|---|---|---|
| `approved-wine-052` | Mountain Valley Winery | has `winery` but OCR failed to read the script "winery" (a recognition miss, not a policy miss) | AMBIGUOUS |
| `m-cellars-baseline` | M Cellars | has `cellars` but the dominant mark is the glyph "M" | AMBIGUOUS |
| `wine-multi-artifact-04` | Dry Cellar | `cellar` singular **is** in the set | — |
| non-company controls: `Curious`, `Pacha`, `Afflicted`, `Aphrodite`, `Dark Horse`, `AltaCima`, `embeleso`, `Rias` | fanciful brands | **no designator, no possessive** | AMBIGUOUS |

The controls are the tell: **every clean non-company marketed brand in the corpus
is denied `OBSERVED`** because it lacks a designator or possessive, even though it
is the most unambiguous kind of brand there is.

## The two questions the round was asked

**Does the current positive signal distinguish explicit brand from fallback
brand?** **No.** It cannot. It has one bucket (`positive`) and no representation of
"deemed brand by §4.33(a) fallback." `patricia-green-cellars` (a fallback deemed
brand, appearing only in the producer line and URL) and `three-steves-winery` (an
explicit marketed brand) would both, if read, be scored by the same designator
rule. The distinction the whole round turns on is invisible to the gate.

**Does it merely detect company-like wording?** **Substantially yes.** The
positive signal fires on the presence of a company-entity designator or a
possessive. It approximates "is this a company/winery-style name," which
correlates with "is a brand" on this corpus only because most of the
designator-bearing names here happen to be the marketed brand. On
`approved-wine-049` the same logic would mark the responsible person
`Damiani Wine Cellars` positive if it were the leading candidate — the corpus
avoids that by forbidding it in truth, not by gate logic.

## Consequences of changing fixture policy for the four OBSERVED cases

**If the policy shifted to "a company name is never a brand": all four current
`OBSERVED` successes would become wrong** — `3 Steves Winery`, `Mike's Farm, Inc.`,
`Duck Walk Vineyards` are all genuinely the marketed brands, and demoting them
would convert 4 correct results into 4 misses and drop brand accuracy. **If the
policy shifted to "a company name is always the brand":** cases like
`approved-wine-049`/`053` (where a *different* Vineyards/Cellars name is the
responsible person, not the brand) would be mis-pointed at the bottler.

**Neither absolute is safe.** The audit supports the two-axis model: the correct
change is representational (distinguish explicit brand, fallback brand, responsible
person, and unresolved), not a lexical flip of how designators are treated. **The
gate is not changed in this round.**
