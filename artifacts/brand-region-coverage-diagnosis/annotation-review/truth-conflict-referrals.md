# Truth-conflict referrals raised during annotation review

**No fixture was modified. These are referrals, not findings, and they are out of
scope for this round.** They surfaced because the reader's review disagreed about
*which text is the brand*, not about where a box sits.

## Why a region cannot simply be redrawn

The 13-case population is defined as `TRUE_NON_RECOGNITION` **relative to the
recorded fixture truth**. Phase 2 asks whether a pass examined the region
containing *that* brand. If the brand text changes, the case's membership in the
population — and its E3 classification — may change with it. Truth and region
have to move together, or neither moves.

---

## The underlying question is systematic, not case-by-case

Across three cases the reader applied a consistent principle: **a company name is
not a brand name**, with `Inc.` and `Co.` as signals.

That principle is coherent, and it is **not** the principle the corpus was
annotated under. Measured against the committed manifest:

**13 of the 105 brand-present fixtures (12 %) record a company-style name as the
brand:**

| Case | Recorded brand truth |
|---|---|
| `patricia-green-cellars` | Patricia Green Cellars |
| `approved-wine-049` | Caywood Vineyard |
| `approved-wine-052` | Mountain Valley Winery |
| `approved-wine-053` | Golden Road Vineyards |
| `three-steves-winery` | 3 Steves Winery |
| `approved-wine-073` | Mike's Farm, Inc. |
| `approved-wine-074` | Mike's Farm, Inc. |
| `approved-wine-083` | Barn Sill Wine Co. |
| `approved-wine-086` | 3 Steves Winery |
| `m-cellars-baseline` | M Cellars |
| `wine-multi-artifact-04` | Dry Cellar |
| `wine-multi-artifact-07` | Mike's Farm |
| `wine-multi-artifact-09` | Duck Walk Vineyards |

### The consequence that matters most

**All four cases the pipeline currently gets right *and* asserts as `OBSERVED`
are company-style names**: `three-steves-winery` and `approved-wine-086`
(`3 Steves Winery`), `approved-wine-073` (`Mike's Farm, Inc.`), and
`wine-multi-artifact-09` (`Duck Walk Vineyards`).

This is not a coincidence. `OBSERVED` requires `brandClass === "positive"`, which
requires a possessive or a token from `BRAND_DESIGNATOR` = {cellars, cellar,
estate, estates, vineyard, vineyards, winery, wineries}. **The authority gate is,
in effect, a company-designator detector.** If company names stop counting as
brands, then the corpus's only four confident-and-correct brand results become
four confident-and-wrong ones, and measured brand accuracy falls rather than
rises.

That is an argument for taking the question seriously and resolving it
deliberately — **not** an argument for either answer. It is recorded so the
decision is made with its consequences visible.

---

## Referral 1 — `approved-wine-083`

| | |
|---|---|
| Recorded truth | `Barn Sill Wine Co.` / `Barn Sill Wine Co` |
| Reader's reading (2026-07-21) | brand is **`Christmas Hayride`**; `Barn Sill Wine Co.` is the company |
| **Recorded `forbiddenPresentations`** | **`Christmas Hayride`**, `North Carolina Muscadine Wine` |
| Prior QC | Codex, 2026-07-12, outcome **confirmed**, checks included `varietal-not-brand`, `producer-importer-bottler-not-brand` |

**Direct conflict with a deliberate prior decision.** A previous reviewer did not
omit `Christmas Hayride` — they explicitly listed it as a presentation the machine
must **not** emit. Both readings are defensible on the artwork.

## Referral 2 — `wine-multi-artifact-07`

| | |
|---|---|
| Recorded truth | `Mike's Farm` / `Mike's Farm, Inc.` |
| Reader's reading | brand is **`Scuppernong White`** |
| `forbiddenPresentations` | none |

**Counter-evidence for the reader to weigh:** *scuppernong* is a muscadine grape
cultivar and *White* is a colour; the same label carries `North Carolina Muscadine
Wine` and `Made with North Carolina Muscadine Grapes` directly beneath. That reads
as a varietal/type designation — structurally parallel to `Sauvignon Blanc` on
`wine-multi-artifact-04`, which the reader approved with `Dry Cellar` as the
brand. Deciding 07 one way and 04 the other would be inconsistent.

## Referral 3 — `approved-wine-074`

| | |
|---|---|
| Recorded truth | `Mike's Farm, Inc.` / `Mike's Farm` |
| Reader's reading | company name, not a brand |
| `forbiddenPresentations` | `Hinnant Vineyards` |
| Strata | `back-label`, `multi-line-brand`, `missing-alcohol-statement` |

**A checkable consequence:** this label carries no other brand-like text at all —
only `Mike's Farm, Inc.`, an address, a phone/URL, `PRODUCED AND BOTTLED BY
HINNANT VINEYARDS`, and the government warning. If the company name is not the
brand, **this fixture has no visible brand and should be annotated
`presence: absent`**, not re-pointed at other text. That is a larger change than a
region edit: it would move the case out of the brand-present denominator
entirely. The sibling fixture `approved-wine-073` has the same artwork family and
is currently one of the four `OBSERVED` successes.

---

## Status

`approved-wine-083`, `wine-multi-artifact-07` and `approved-wine-074` are
**blocked for annotation** pending a truth decision. The other 10 cases are
unaffected.

## Options

1. Annotate to recorded truth for now, run Phase 2 on all 13, open a brand-truth
   round afterwards.
2. **Pause the 3 contested cases, run Phase 2 on the other 10**, fold them in
   after the truth round.
3. Open a brand-truth decision round first — ideally as a **policy** question
   ("is a company name a brand name for this corpus?") applied to all 13 affected
   fixtures at once, rather than case by case.

Recommendation: **option 3 for the policy, option 2 to keep this round moving.**
The question now reaches 13 fixtures and the authority gate's meaning, so
deciding it three times in an annotation packet would be the wrong venue.
