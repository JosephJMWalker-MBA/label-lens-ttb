# Issue #149 bounded OCR baseline metrics

| Field | Cases | Exact | Normalized | Readable recall | Insufficient routing | False reliable | Geometry | Median bounded ms | P95 bounded ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| brand | 4 | 0 | 0.5 | 1 | n/a | 0 | 1 | 153.0 | 246.8 |
| alcohol | 3 | 0 | 0.3333 | 1 | 1 | 0 | 1 | 104.9 | 1972.1 |

## Per-case classification

| Case | Field | Primary category | First variable | Outcome |
| --- | --- | --- | --- | --- |
| brand-minneapolis-synthetic | brandName | CORRECT_READ | padding | SELLER_REGION_INSUFFICIENT |
| brand-garden-city-beach-synthetic | brandName | SELECTOR_MISS_WITH_OCR_HIT | segmentation mode | SELLER_REGION_INSUFFICIENT |
| brand-golden-girls-approved-region | brandName | SELECTOR_MISS_WITH_OCR_HIT | segmentation mode | SELLER_REGION_INSUFFICIENT |
| brand-arandano-synthetic-lowres | brandName | CORRECT_READ | padding | SELLER_REGION_INSUFFICIENT |
| alcohol-clean-horizontal-synthetic | alcoholStatement | CORRECT_READ | padding | SELLER_REGION_INSUFFICIENT |
| alcohol-vertical-side-synthetic | alcoholStatement | CANDIDATE_GROUPING_MISS | segmentation mode | SELLER_REGION_INSUFFICIENT |
| alcohol-unreadable-selected-region | alcoholStatement | RELIABILITY_GATE_CORRECT | padding | SELLER_REGION_INSUFFICIENT |
