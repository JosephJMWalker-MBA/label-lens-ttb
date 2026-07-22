# Fixture-impact assessment (no fixture changed)

Whether each current brand truth remains defensible under the policy hierarchy.
**No fixture is edited in this round.**

| Case | Current truth | Defensible? | Basis |
|---|---|---|---|
| `three-steves-winery` | 3 Steves Winery | **yes** | explicit marketed brand (prominent header) that is also the bottler |
| `approved-wine-086` | 3 Steves Winery | **yes** | same brand family |
| `approved-wine-073` | Mike's Farm, Inc. | **yes** | explicit brand identity; Hinnant is a separate responsible person |
| `approved-wine-074` | Mike's Farm, Inc. | **yes** | same layout as 073; corrects the region-round "presence absent" hypothesis |
| `wine-multi-artifact-09` | Duck Walk Vineyards | **yes** | explicit front-header brand = bottler |
| `approved-wine-052` | Mountain Valley Winery | **yes** | explicit header brand = bottler |
| `approved-wine-053` | Golden Road Vineyards | **yes** | explicit gold-box brand; Round Peak is the (different) bottler |
| `wine-multi-artifact-04` | Dry Cellar | **yes** | explicit brand; Sauvignon Blanc correctly forbidden |
| `wine-multi-artifact-07` | Mike's Farm | **yes** | explicit brand; Scuppernong White is varietal/type (parallel to wma-04) |
| `m-cellars-baseline` | M Cellars | **yes (confirm mark wording)** | explicit stylized brand; dominant glyph is "M" |
| `patricia-green-cellars` | Patricia Green Cellars | **yes — as §4.33(a) fallback** | brand appears only in producer line + URL; record as fallback deemed brand |
| `approved-wine-049` | Caywood Vineyard | **uncertain** | may be a single-vineyard designation rather than the marketed brand; Damiani (responsible person) correctly forbidden |
| `approved-wine-083` | Barn Sill Wine Co. | **contested** | Barn Sill vs Christmas Hayride unresolved from artwork; forbidding Christmas Hayride may be too strong |

## Summary

- **11 of 13 current truths are defensible** (one, `patricia-green-cellars`, only
  *as a fallback* — the value is right but its representation as an explicit brand
  is not; one, `m-cellars`, pending a mark-wording confirmation).
- **2 of 13 are referred for a later blind second review — as referrals, not
  confirmed errors**: `approved-wine-049` (brand vs vineyard designation;
  current truth provisionally defensible) and `approved-wine-083` (competing
  marks; unresolved, retained temporarily).
- **The reader's company-name intuition does not generalize.** For `approved-wine-074`
  and `wine-multi-artifact-07` the company name is the explicit brand and the
  current truth stands; only `083` genuinely turns on the company-vs-fanciful
  question, and it is unresolved rather than wrong.

## Possible dispositions (recommend, do not implement)

1. **Retain** all truths except revisit `049` and `083`.
2. **Correct** `049`/`083` only after human review, in a separate truth-correction
   PR with a blind second reader (as done for the alcohol corrections).
3. **Re-represent** `patricia-green-cellars` (and any future fallback) as a
   fallback deemed brand once a schema exists — not a value change.
