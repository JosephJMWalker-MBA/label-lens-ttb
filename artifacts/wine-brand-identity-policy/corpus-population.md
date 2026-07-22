# Corpus population

## Primary — the 13 fixtures (exactly, from the region-round referral)

Source: `artifacts/brand-region-coverage-diagnosis/annotation-review/truth-conflict-referrals.md`.

`patricia-green-cellars` · `approved-wine-049` · `approved-wine-052` ·
`approved-wine-053` · `three-steves-winery` · `approved-wine-073` ·
`approved-wine-074` · `approved-wine-083` · `approved-wine-086` ·
`m-cellars-baseline` · `wine-multi-artifact-04` · `wine-multi-artifact-07` ·
`wine-multi-artifact-09`

All 13 have a brand truth that carries a company designator, a possessive, or a
corporate suffix. Four of them (`three-steves-winery`, `approved-wine-073`,
`approved-wine-086`, `wine-multi-artifact-09`) are the corpus's only current
`OBSERVED` brand results.

## Controls — 10 fixtures, fixed before conclusions (`controls.json`)

| Archetype | Cases |
|---|---|
| Non-company marketed brand + separate name/address | `approved-wine-046`, `approved-wine-048` |
| Clear fanciful/product name | `approved-wine-013`, `approved-wine-061` |
| Varietal / class-type prominent | `approved-wine-006`, `approved-wine-069` |
| Brand-absent | `approved-wine-022`, `approved-wine-082` |
| Imported with importer text | `approved-wine-031`, `approved-wine-091` |

Controls are kept separate from the primary 13 throughout. `approved-wine-082` is
the load-bearing control: it forbids `3 Steves Winery` as this product's brand,
the same name that IS the brand on two primary cases — direct proof that brand
status is contextual, not lexical.
