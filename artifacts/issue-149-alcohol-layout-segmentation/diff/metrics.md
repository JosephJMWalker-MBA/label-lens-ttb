# Alcohol layout segmentation metric diff

| Layout | Cases | Control normalized | Treatment normalized | Control parsed | Treatment parsed | Grouping misses delta | Recognition misses delta | Selector misses delta | False reliable delta | Median latency delta ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| horizontal | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 1.1 |
| bottom | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 1.9 |
| side | 2 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | -5.3 |
| rotated | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 37.8 |
| vertical | 2 | 0 | 0 | 0 | 0 | -1 | 1 | 0 | 0 | 254.2 |
| unreadable | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | -2.1 |

## Per-case changes

| Case | Layout | Control PSM | Treatment PSM | Control value | Treatment value | Outcome change | Latency delta ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| alcohol-clean-horizontal-synthetic | horizontal | 11 | 11 | 13.0% BY VOL. | 13.0% BY VOL. | unchanged | 1.1 |
| alcohol-vertical-side-synthetic | vertical | 11 | 7 |  |  | CANDIDATE_GROUPING_MISS -> OCR_RECOGNITION_MISS | 239.3 |
| alcohol-unreadable-selected-region | unreadable | 11 | 11 |  |  | unchanged | -2.1 |
| alcohol-bottom-centered-synthetic | bottom | 11 | 11 | 12.8% ALC./VOL. | 12.8% ALC./VOL. | unchanged | 1.9 |
| alcohol-side-right-horizontal-synthetic | side | 11 | 7 | 14.1% ALC./VOL. | 14.1% ALC./VOL. | unchanged | -2.0 |
| alcohol-side-left-horizontal-synthetic | side | 11 | 7 | 11.9% BY VOL. | 11.9% BY VOL. | unchanged | -8.5 |
| alcohol-rotated-right-synthetic | rotated | 11 | 7 |  |  | unchanged | -248.6 |
| alcohol-rotated-left-synthetic | rotated | 11 | 7 |  |  | unchanged | 324.2 |
| alcohol-vertical-left-synthetic | vertical | 11 | 7 |  |  | unchanged | 269.1 |

## Decision

REJECT: The treatment did not produce reproducible parsed-value or normalized-read gains across more than one target-layout fixture under the fixed decision rules.
