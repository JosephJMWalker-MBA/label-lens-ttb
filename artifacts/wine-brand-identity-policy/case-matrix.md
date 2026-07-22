# 13-case preliminary matrix (primary population)

Two-axis roles per case. **Preliminary — for review, not a fixture change.**
`brandStatus` legend: EMB=EXPLICIT_MARKETED_BRAND, FDB=FALLBACK_DEEMED_BRAND, NB=NOT_BRAND, U=UNRESOLVED_FROM_ARTWORK.

| Case | Fixture truth | Current select / state | Brand element(s) | Responsible person | Truth defensible? | Human review? |
|---|---|---|---|---|---|---|
| `patricia-green-cellars` | ["Patricia Green Cellars"] | ESTATE VINEYARD / AMBIGUOUS | Patricia Green Cellars (FDB) | Patricia Green Cellars | yes-as-fallback | **yes** |
| `approved-wine-049` | ["Caywood Vineyard"] | CAYWOQOD VINEYARD / AMBIGUOUS | Caywood Vineyard (U) | Damiani Wine Cellars | uncertain | **yes** |
| `approved-wine-052` | ["Mountain Valley Winery"] | OLp VINE ZINFANDEL / AMBIGUOUS | MOUNTAIN VALLEY winery (EMB) | — | yes | no |
| `approved-wine-053` | ["Golden Road Vineyards"] | Vineya / AMBIGUOUS | goldenroad vineyards (EMB) | Round Peak Vineyards | yes | no |
| `three-steves-winery` | ["3 Steves Winery"] | 3 STEVES WINERY / OBSERVED | 3 STEVES WINERY (EMB) | — | yes | no |
| `approved-wine-073` | ["Mike's Farm, Inc.","Mike's Farm"] | Mike's Farm, Inc. / OBSERVED | Mike's Farm, Inc. (EMB) | Hinnant Farms Vineyard | yes | no |
| `approved-wine-074` | ["Mike's Farm, Inc.","Mike's Farm"] | HINNANT VINEYARDS / AMBIGUOUS | Mike's Farm, Inc. (EMB) | Hinnant Vineyards | yes | **yes** |
| `approved-wine-083` | ["Barn Sill Wine Co.","Barn Sill Wine Co"] | Bam il / AMBIGUOUS | Barn Sill Wine Co. (U); Christmas Hayride (U) | — | contested | **yes** |
| `approved-wine-086` | ["3 Steves Winery"] | 3 STEVES WINERY / OBSERVED | 3 STEVES WINERY (EMB) | — | yes | no |
| `m-cellars-baseline` | ["M Cellars"] | CELLARS / AMBIGUOUS | M CELLARS (stylized M + CELLARS-registered) (EMB) | Matt & Tara Meineke, Proprietors | yes | **yes** |
| `wine-multi-artifact-04` | ["Dry Cellar"] | Donovan Visayas / AMBIGUOUS | Dry Cellar (EMB) | Donovan Vineyards | yes | no |
| `wine-multi-artifact-07` | ["Mike's Farm","Mike's Farm, Inc."] | North Carolina Nuscadine Nig / AMBIGUOUS | MIKE'S FARM (EMB) | Mike's Farm, Inc. (back panel) | yes | **yes** |
| `wine-multi-artifact-09` | ["Duck Walk Vineyards"] | DUCK WALK VINEYARDS / OBSERVED | DUCK WALK VINEYARDS (EMB) | — | yes | no |

## Aggregate (13 primary)

- Explicit marketed brand present: **10** — approved-wine-052, approved-wine-053, three-steves-winery, approved-wine-073, approved-wine-074, approved-wine-086, m-cellars-baseline, wine-multi-artifact-04, wine-multi-artifact-07, wine-multi-artifact-09
- Fallback deemed brand: **1** — patricia-green-cellars
- Unresolved brand element from artwork: **2** — approved-wine-049, approved-wine-083
- Current truth defensible without qualification: **10**
- Truth defensible only as fallback: **1** — patricia-green-cellars
- Truth uncertain/contested: **2** — approved-wine-049, approved-wine-083
- Requires human review: **6** — patricia-green-cellars, approved-wine-049, approved-wine-074, approved-wine-083, m-cellars-baseline, wine-multi-artifact-07

**Consistency check:** every one of the 13 cases has at least one naming element carrying a non-NOT_BRAND status (explicit, fallback, or unresolved); no primary case is left with zero brand candidates.
