# Segmentation experiment metric diff

| Field | Control normalized | Treatment normalized | Grouping misses delta | Selector misses delta | False reliable delta | Median latency delta ms |
| --- | --- | --- | --- | --- | --- | --- |
| brand | 0.5 | 0.5 | 1 | -1 | 0 | -49.3 |
| alcohol | 0.3333 | 0.3333 | -1 | 0 | 0 | 53.9 |

## Per-case changes

| Case | Field | Control value | Treatment value | Outcome change | Latency delta ms |
| --- | --- | --- | --- | --- | --- |
| brand-minneapolis-synthetic | brandName | MINNEAPOLIS | MINNEAPOLIS | unchanged | -84.4 |
| brand-garden-city-beach-synthetic | brandName | GARDEN CITY | BEACH | unchanged | -14.2 |
| brand-golden-girls-approved-region | brandName | ANSE WE |  | SELECTOR_MISS_WITH_OCR_HIT -> CANDIDATE_GROUPING_MISS | -49.4 |
| brand-arandano-synthetic-lowres | brandName | ARANDANO | ARANDANO | unchanged | 0.2 |
| alcohol-clean-horizontal-synthetic | alcoholStatement | 13.0% BY VOL. | 13.0% BY VOL. | unchanged | -5.0 |
| alcohol-vertical-side-synthetic | alcoholStatement |  |  | CANDIDATE_GROUPING_MISS -> OCR_RECOGNITION_MISS | 504.1 |
| alcohol-unreadable-selected-region | alcoholStatement |  |  | unchanged | 59.0 |

## Decision

RUN NARROWER FOLLOW-UP: The treatment improved at least one target metric without increasing false reliable reads; run a narrower field/layout slice before adoption.
