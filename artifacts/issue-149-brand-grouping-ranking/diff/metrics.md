# Brand grouping and ranking metric diff

| Metric | Control | Treatment | Delta |
| --- | --- | --- | --- |
| Raw OCR truth recall | 0.7778 | 0.7778 | 0 |
| Candidate-list truth recall | 0.5556 | 0.7778 | 0.2222 |
| Top-3 truth recall | 0.4444 | 0.6667 | 0.2223 |
| Top-1 normalized accuracy | 0.4444 | 0.6667 | 0.2223 |
| False reliable read rate | 0.1111 | 0.1111 | 0 |
| Median selection latency ms | 0.19345900000007532 | 0.11554200000000492 | -0.0779 |

## Per-case changes

| Case | Control selected | Treatment selected | Control class | Treatment class | Outcome change |
| --- | --- | --- | --- | --- | --- |
| brand-minneapolis-synthetic | MINNEAPOLIS | MINNEAPOLIS | CORRECT_TOP1_CONSERVATIVE_STATE | CORRECT_TOP1_CONSERVATIVE_STATE | unchanged |
| brand-garden-city-beach-synthetic | GARDEN CITY | GARDEN CITY BEACH | CANDIDATE_GENERATION_MISS | CORRECT_TOP1_CONSERVATIVE_STATE | CANDIDATE_GENERATION_MISS -> CORRECT_TOP1_CONSERVATIVE_STATE |
| brand-golden-girls-approved-region | ANSE WE | ANSE WE | OCR_MISS | OCR_MISS | unchanged |
| brand-arandano-synthetic-lowres | ARANDANO | ARANDANO | CORRECT_TOP1_CONSERVATIVE_STATE | CORRECT_TOP1_CONSERVATIVE_STATE | unchanged |
| brand-m-cellars-clean-designator | CELLARS | CELLARS | WRONG_ACCEPTED_CANDIDATE | WRONG_ACCEPTED_CANDIDATE | unchanged |
| brand-north-star-multiline-synthetic | NORTH | NORTH STAR | CANDIDATE_GENERATION_MISS | CORRECT_TOP1_CONSERVATIVE_STATE | CANDIDATE_GENERATION_MISS -> CORRECT_TOP1_CONSERVATIVE_STATE |
| brand-ridge-cellars-adjacent-product | RIDGE CELLARS | RIDGE CELLARS | CORRECT_READ | CORRECT_READ | unchanged |
| brand-harbor-cellars-adjacent-location | HARBOR CELLARS | HARBOR CELLARS | CORRECT_READ | CORRECT_READ | unchanged |
| brand-unreadable-selected-region |  |  | INSUFFICIENT_SOURCE_IMAGE | INSUFFICIENT_SOURCE_IMAGE | unchanged |

## Decision

ADOPT LATER: Treatment improved Brand ranking across more than one fixture without increasing false reliable reads or wrong accepted candidates.
