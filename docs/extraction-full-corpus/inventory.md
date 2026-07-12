# Full Corpus Inventory Checkpoint

This checkpoint reconciles every committed candidate image under `tests/fixtures/precheck` into the corpus-scale evaluation manifest.

- Discovered candidate images: **132**
- Wine images: **120**
- Distilled-spirits images: **9**
- Beer or malt beverage images: **3**
- Included baseline seed cases: **24**
- Wine images awaiting full annotation: **94**

## Visual corrections discovered during inventory

- `wine-multi-artifact-01`, `wine-multi-artifact-02`, and `wine-multi-artifact-03` are visually non-wine distilled-spirit labels despite their supplemental inventory grouping.
- `m-cellars-reference-crop` and `m-cellars-lowres` are materially duplicate derivatives of the canonical `m-cellars-baseline` artwork and remain excluded from scoring.

