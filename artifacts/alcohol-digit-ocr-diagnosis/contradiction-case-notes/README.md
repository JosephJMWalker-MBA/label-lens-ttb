# Trigger-positive case notes

Three cases were reported trigger-positive by the **previous round's** control
(`../control-results.json`). That control parsed re-read text with an ad-hoc regex
rather than with the production parser, so its "contradictions" were not
comparable to the production value. This round re-derives every re-read through
the **real** `selectAlcoholObservation` and the production number
canonicalization.

Under that corrected comparison only **one** of the three is a genuine
contradiction.

| Case | Naive-regex trigger | Production-parsed trigger | Selected value visibly correct? |
|---|---|---|---|
| `approved-wine-037` | fired | **fired** | **no** — visibly 13.0, machine says 19.0 |
| `approved-wine-031` | fired | **does not fire** | yes |
| `wine-multi-artifact-05` | fired | **does not fire** | yes |

Full per-field record: `../contradiction-cases.csv`. Crops: `crops/`.
