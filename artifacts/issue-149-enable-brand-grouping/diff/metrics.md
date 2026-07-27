# Brand production grouping metric diff

| Metric | Control | Production | Delta |
| --- | --- | --- | --- |
| Raw OCR truth recall | 0.8889 | 0.8889 | 0 |
| Candidate-list truth recall | 0.6667 | 0.8889 | 0.2222 |
| Top-3 truth recall | 0.5556 | 0.8889 | 0.3333 |
| Top-1 normalized accuracy | 0.5556 | 0.8889 | 0.3333 |
| Exact top-1 accuracy | 0.5556 | 0.8889 | 0.3333 |
| Wrong accepted candidates | 1 | 0 | -1 |
| False reliable-read rate | 0.1111 | 0 | -0.1111 |
| Designator-only winner count | 1 | 0 | -1 |
| Median selection latency ms | 0.18520799999998871 | 0.030666999999994005 | -0.1545 |

Control authority histogram: `{"AMBIGUOUS":5,"OBSERVED":3,"NOT_OBSERVED":1}`

Production authority histogram: `{"AMBIGUOUS":5,"OBSERVED":3,"NOT_OBSERVED":1}`

## Per-case changes

| Case | Control selected | Production selected | Normalized top-1 delta | Authority state | False reliable delta | Designator-only delta | Latency delta ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| brand-garden-city-beach-synthetic | CITY BEACH | GARDEN CITY BEACH | 1 | unchanged | 0 | 0 | -2.5992 |
| brand-north-star-multiline-synthetic | NORTH | NORTH STAR | 1 | unchanged | 0 | 0 | -0.2457 |
| brand-m-cellars-clean-designator | CELLARS | M CELLARS | 1 | unchanged | -1 | -1 | -0.1881 |
| brand-minneapolis-single-line | MINNEAPOLIS | MINNEAPOLIS | 0 | unchanged | 0 | 0 | -0.0495 |
| brand-arandano-single-line | ARANDANO | ARANDANO | 0 | unchanged | 0 | 0 | -0.1202 |
| brand-golden-girls-single-line | GOLDEN GIRLS | GOLDEN GIRLS | 0 | unchanged | 0 | 0 | -0.1623 |
| brand-ridge-cellars-adjacent-product | RIDGE CELLARS | RIDGE CELLARS | 0 | unchanged | 0 | 0 | -0.1737 |
| brand-harbor-cellars-adjacent-location | HARBOR CELLARS | HARBOR CELLARS | 0 | unchanged | 0 | 0 | -0.0452 |
| brand-unreadable-selected-region |  |  | 0 | unchanged | 0 | 0 | -0.0055 |

## Decision

ENABLE: Production Brand grouping improves the staged multi-line cases and M Cellars without increasing false certainty or promoting product/location text.
