# OCR Region-Isolation Benchmark

Bounded evaluation-only benchmark over 13 adjudicated cases using the committed OCR engine and existing deterministic downstream selector logic.

## Scenario Summary

- A. Production baseline: ordinary production extractor and deterministic selector on current main
- B. Human-targeted crop (1.5x): targeted crop only, replacing full-image evidence for this scenario
- C. Canonically rotated targeted crop (1.5x): targeted crop only with explicit canonical rotation where adjudicated
- D. Baseline plus targeted crop (1.5x): ordinary production passes plus one appended targeted field pass
- E. Baseline plus rotated targeted crop (1.5x): ordinary production passes plus one appended canonically rotated targeted pass
- B. Human-targeted crop (2x): targeted crop only, replacing full-image evidence for this scenario
- C. Canonically rotated targeted crop (2x): targeted crop only with explicit canonical rotation where adjudicated
- D. Baseline plus targeted crop (2x): ordinary production passes plus one appended targeted field pass
- E. Baseline plus rotated targeted crop (2x): ordinary production passes plus one appended canonically rotated targeted pass
- B. Human-targeted crop (3x): targeted crop only, replacing full-image evidence for this scenario
- C. Canonically rotated targeted crop (3x): targeted crop only with explicit canonical rotation where adjudicated
- D. Baseline plus targeted crop (3x): ordinary production passes plus one appended targeted field pass
- E. Baseline plus rotated targeted crop (3x): ordinary production passes plus one appended canonically rotated targeted pass

## Aggregate Results

| Scenario | Field | Present | Absent | Exact | Normalized | Top-3 | Top-5 | Detected | Parsed accurate | False certainty | Absent FP | Phrase present | Token coverage | Mean similarity | Median latency |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Production baseline | brand | 11 | 2 | 18% | 18% | 27% | 27% | 100% | 0% | 0% | 0% | 91% | 0.95 | 0.04 | 2198 ms |
| B. Human-targeted crop (1.5x) | brand | 11 | 0 | 18% | 18% | 18% | 18% | 73% | 0% | 0% | N/A | 18% | 0.35 | 0.41 | 141 ms |
| C. Canonically rotated targeted crop (1.5x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | N/A | N/A | 0% | 0.00 | 0.00 | 0 ms |
| D. Baseline plus targeted crop (1.5x) | brand | 11 | 0 | 36% | 36% | 36% | 36% | 100% | 0% | 0% | N/A | 91% | 0.95 | 0.04 | 3162 ms |
| E. Baseline plus rotated targeted crop (1.5x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | N/A | N/A | 0% | 0.00 | 0.00 | 0 ms |
| B. Human-targeted crop (2x) | brand | 11 | 0 | 18% | 18% | 18% | 18% | 73% | 0% | 0% | N/A | 18% | 0.35 | 0.42 | 178 ms |
| C. Canonically rotated targeted crop (2x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | N/A | N/A | 0% | 0.00 | 0.00 | 0 ms |
| D. Baseline plus targeted crop (2x) | brand | 11 | 0 | 36% | 36% | 36% | 36% | 100% | 0% | 0% | N/A | 91% | 0.95 | 0.04 | 3276 ms |
| E. Baseline plus rotated targeted crop (2x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | N/A | N/A | 0% | 0.00 | 0.00 | 0 ms |
| B. Human-targeted crop (3x) | brand | 11 | 0 | 18% | 18% | 18% | 18% | 64% | 0% | 0% | N/A | 18% | 0.35 | 0.41 | 329 ms |
| C. Canonically rotated targeted crop (3x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | N/A | N/A | 0% | 0.00 | 0.00 | 0 ms |
| D. Baseline plus targeted crop (3x) | brand | 11 | 0 | 36% | 36% | 36% | 36% | 100% | 0% | 0% | N/A | 91% | 0.95 | 0.04 | 3422 ms |
| E. Baseline plus rotated targeted crop (3x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | N/A | N/A | 0% | 0.00 | 0.00 | 0 ms |
| A. Production baseline | alcohol | 12 | 1 | 0% | 0% | 25% | 25% | 25% | 25% | 0% | 0% | 83% | 0.81 | 0.02 | 2198 ms |
| B. Human-targeted crop (1.5x) | alcohol | 12 | 0 | 0% | 0% | 8% | 8% | 8% | 8% | 0% | N/A | 25% | 0.25 | 0.12 | 127 ms |
| C. Canonically rotated targeted crop (1.5x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | N/A | 0% | 0.00 | 0.00 | 55 ms |
| D. Baseline plus targeted crop (1.5x) | alcohol | 12 | 0 | 0% | 0% | 25% | 25% | 25% | 25% | 0% | N/A | 83% | 0.81 | 0.02 | 2322 ms |
| E. Baseline plus rotated targeted crop (1.5x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | N/A | 50% | 0.50 | 0.01 | 1348 ms |
| B. Human-targeted crop (2x) | alcohol | 12 | 0 | 0% | 0% | 8% | 8% | 8% | 8% | 0% | N/A | 25% | 0.25 | 0.12 | 185 ms |
| C. Canonically rotated targeted crop (2x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | N/A | 0% | 0.00 | 0.00 | 67 ms |
| D. Baseline plus targeted crop (2x) | alcohol | 12 | 0 | 0% | 0% | 25% | 25% | 25% | 25% | 0% | N/A | 83% | 0.81 | 0.02 | 2378 ms |
| E. Baseline plus rotated targeted crop (2x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | N/A | 50% | 0.50 | 0.01 | 1359 ms |
| B. Human-targeted crop (3x) | alcohol | 12 | 0 | 0% | 0% | 0% | 0% | 8% | 0% | 0% | N/A | 17% | 0.23 | 0.10 | 373 ms |
| C. Canonically rotated targeted crop (3x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | N/A | 0% | 0.00 | 0.00 | 102 ms |
| D. Baseline plus targeted crop (3x) | alcohol | 12 | 0 | 0% | 0% | 25% | 25% | 25% | 17% | 0% | N/A | 83% | 0.81 | 0.02 | 2517 ms |
| E. Baseline plus rotated targeted crop (3x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | N/A | 50% | 0.50 | 0.01 | 1381 ms |

- `Absent FP` renders `N/A` when the targeted scenario has no applicable absent-field denominator. That safety is inherited from unchanged production behavior rather than demonstrated by the targeted benchmark.

## Contribution Summary

| Scenario | Field | Cases | Mean new words | Phrase present | Candidate generated | Candidate kept | Duplicate corroborated | New candidate | New alternate | Ordering changed | Ambiguity changed | Correct result recovered | Correct uncertainty recovered | Total acceptable recoveries | Regressed prior correct | No meaningful contribution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B. Human-targeted crop (1.5x) | brand | 11 | 2.73 | 2 | 5 | 5 | 1 | 11 | 5 | 11 | 5 | 0 | 2 | 2 | 3 | 0 |
| B. Human-targeted crop (2x) | brand | 11 | 2.64 | 2 | 5 | 5 | 1 | 11 | 5 | 11 | 5 | 0 | 2 | 2 | 3 | 0 |
| B. Human-targeted crop (3x) | brand | 11 | 2.64 | 2 | 5 | 5 | 1 | 11 | 5 | 11 | 6 | 0 | 2 | 2 | 3 | 0 |
| C. Canonically rotated targeted crop (1.5x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| C. Canonically rotated targeted crop (2x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| C. Canonically rotated targeted crop (3x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| D. Baseline plus targeted crop (1.5x) | brand | 11 | 2.73 | 2 | 10 | 6 | 1 | 9 | 6 | 9 | 0 | 0 | 2 | 2 | 0 | 6 |
| D. Baseline plus targeted crop (2x) | brand | 11 | 2.64 | 2 | 10 | 6 | 1 | 9 | 6 | 9 | 0 | 0 | 2 | 2 | 0 | 7 |
| D. Baseline plus targeted crop (3x) | brand | 11 | 2.64 | 2 | 10 | 6 | 1 | 9 | 4 | 9 | 0 | 0 | 2 | 2 | 0 | 6 |
| E. Baseline plus rotated targeted crop (1.5x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| E. Baseline plus rotated targeted crop (2x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| E. Baseline plus rotated targeted crop (3x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| B. Human-targeted crop (1.5x) | alcohol | 12 | 2.33 | 3 | 3 | 1 | 1 | 2 | 0 | 10 | 0 | 0 | 0 | 0 | 2 | 10 |
| B. Human-targeted crop (2x) | alcohol | 12 | 2.17 | 3 | 3 | 1 | 1 | 2 | 0 | 10 | 0 | 0 | 0 | 0 | 2 | 10 |
| B. Human-targeted crop (3x) | alcohol | 12 | 2.42 | 2 | 2 | 0 | 0 | 3 | 0 | 10 | 0 | 0 | 0 | 0 | 3 | 9 |
| C. Canonically rotated targeted crop (1.5x) | alcohol | 2 | 3.50 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 2 |
| C. Canonically rotated targeted crop (2x) | alcohol | 2 | 3.50 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 2 |
| C. Canonically rotated targeted crop (3x) | alcohol | 2 | 3.50 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 2 |
| D. Baseline plus targeted crop (1.5x) | alcohol | 12 | 2.33 | 3 | 10 | 3 | 1 | 2 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 12 |
| D. Baseline plus targeted crop (2x) | alcohol | 12 | 2.17 | 3 | 10 | 3 | 1 | 2 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 12 |
| D. Baseline plus targeted crop (3x) | alcohol | 12 | 2.42 | 2 | 10 | 3 | 0 | 3 | 1 | 3 | 0 | 0 | 0 | 0 | 1 | 11 |
| E. Baseline plus rotated targeted crop (1.5x) | alcohol | 2 | 3.50 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| E. Baseline plus rotated targeted crop (2x) | alcohol | 2 | 3.50 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| E. Baseline plus rotated targeted crop (3x) | alcohol | 2 | 3.50 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |

## Recovery Summary

| Family | Field | Scale | Applicable case-fields | Exact recoveries | Correct-uncertainty recoveries | Total acceptable recoveries | Recovered case-fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Crop-only replacement | brand | 1.5x | 11 | 0 | 2 | 2 | approved-wine-013:brand, approved-wine-054:brand |
| Crop-only replacement | brand | 2x | 11 | 0 | 2 | 2 | approved-wine-013:brand, approved-wine-054:brand |
| Crop-only replacement | brand | 3x | 11 | 0 | 2 | 2 | approved-wine-013:brand, approved-wine-054:brand |
| Rotated crop-only replacement | brand | 1.5x | 0 | 0 | 0 | 0 | — |
| Rotated crop-only replacement | brand | 2x | 0 | 0 | 0 | 0 | — |
| Rotated crop-only replacement | brand | 3x | 0 | 0 | 0 | 0 | — |
| Additive targeted evidence | brand | 1.5x | 11 | 0 | 2 | 2 | approved-wine-013:brand, approved-wine-054:brand |
| Additive targeted evidence | brand | 2x | 11 | 0 | 2 | 2 | approved-wine-013:brand, approved-wine-054:brand |
| Additive targeted evidence | brand | 3x | 11 | 0 | 2 | 2 | approved-wine-013:brand, approved-wine-054:brand |
| Rotated additive targeted evidence | brand | 1.5x | 0 | 0 | 0 | 0 | — |
| Rotated additive targeted evidence | brand | 2x | 0 | 0 | 0 | 0 | — |
| Rotated additive targeted evidence | brand | 3x | 0 | 0 | 0 | 0 | — |
| Crop-only replacement | alcohol | 1.5x | 12 | 0 | 0 | 0 | — |
| Crop-only replacement | alcohol | 2x | 12 | 0 | 0 | 0 | — |
| Crop-only replacement | alcohol | 3x | 12 | 0 | 0 | 0 | — |
| Rotated crop-only replacement | alcohol | 1.5x | 2 | 0 | 0 | 0 | — |
| Rotated crop-only replacement | alcohol | 2x | 2 | 0 | 0 | 0 | — |
| Rotated crop-only replacement | alcohol | 3x | 2 | 0 | 0 | 0 | — |
| Additive targeted evidence | alcohol | 1.5x | 12 | 0 | 0 | 0 | — |
| Additive targeted evidence | alcohol | 2x | 12 | 0 | 0 | 0 | — |
| Additive targeted evidence | alcohol | 3x | 12 | 0 | 0 | 0 | — |
| Rotated additive targeted evidence | alcohol | 1.5x | 2 | 0 | 0 | 0 | — |
| Rotated additive targeted evidence | alcohol | 2x | 2 | 0 | 0 | 0 | — |
| Rotated additive targeted evidence | alcohol | 3x | 2 | 0 | 0 | 0 | — |

## Recovery Ledger

| Family | Scale | Case-field | Recovery kind | Targeted selected source | Duplicate corroborated | New candidate | New alternate | Ranking changed | Ambiguity changed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Crop-only replacement | 1.5x | approved-wine-013:brand | correct-uncertainty | yes | yes | yes | yes | yes | no |
| Crop-only replacement | 2x | approved-wine-013:brand | correct-uncertainty | yes | yes | yes | yes | yes | no |
| Crop-only replacement | 3x | approved-wine-013:brand | correct-uncertainty | yes | yes | yes | yes | yes | no |
| Additive targeted evidence | 1.5x | approved-wine-013:brand | correct-uncertainty | yes | yes | yes | yes | yes | no |
| Additive targeted evidence | 2x | approved-wine-013:brand | correct-uncertainty | yes | yes | yes | yes | yes | no |
| Additive targeted evidence | 3x | approved-wine-013:brand | correct-uncertainty | yes | yes | yes | yes | yes | no |
| Crop-only replacement | 1.5x | approved-wine-054:brand | correct-uncertainty | yes | no | yes | yes | yes | no |
| Crop-only replacement | 2x | approved-wine-054:brand | correct-uncertainty | yes | no | yes | yes | yes | no |
| Crop-only replacement | 3x | approved-wine-054:brand | correct-uncertainty | yes | no | yes | yes | yes | no |
| Additive targeted evidence | 1.5x | approved-wine-054:brand | correct-uncertainty | yes | no | yes | yes | yes | no |
| Additive targeted evidence | 2x | approved-wine-054:brand | correct-uncertainty | yes | no | yes | yes | yes | no |
| Additive targeted evidence | 3x | approved-wine-054:brand | correct-uncertainty | yes | no | yes | yes | yes | no |

## Regression Summary

| Family | Scale | Applicable case-fields | Scenario-scale regression instances | Unique case-field regressions | Unique case-fields |
| --- | --- | --- | --- | --- | --- |
| Crop-only replacement | all-scales | 23 | 43 | 15 | alfredos-wine:alcohol, alfredos-wine:brand, approved-wine-006:alcohol, approved-wine-006:brand, approved-wine-013:alcohol, approved-wine-022:alcohol, approved-wine-095:alcohol, la-fattoria-rotated:alcohol, luigi-giovanni-live:brand, patricia-green-cellars:alcohol, patricia-green-cellars:brand, three-steves-winery:brand, wine-multi-artifact-04:alcohol, wine-multi-artifact-09:alcohol, wine-multi-artifact-09:brand |
| Crop-only replacement | 1.5x | 23 | 14 | 14 | alfredos-wine:alcohol, alfredos-wine:brand, approved-wine-006:brand, approved-wine-013:alcohol, approved-wine-022:alcohol, approved-wine-095:alcohol, la-fattoria-rotated:alcohol, luigi-giovanni-live:brand, patricia-green-cellars:alcohol, patricia-green-cellars:brand, three-steves-winery:brand, wine-multi-artifact-04:alcohol, wine-multi-artifact-09:alcohol, wine-multi-artifact-09:brand |
| Crop-only replacement | 2x | 23 | 14 | 14 | alfredos-wine:alcohol, alfredos-wine:brand, approved-wine-006:brand, approved-wine-013:alcohol, approved-wine-022:alcohol, approved-wine-095:alcohol, la-fattoria-rotated:alcohol, luigi-giovanni-live:brand, patricia-green-cellars:alcohol, patricia-green-cellars:brand, three-steves-winery:brand, wine-multi-artifact-04:alcohol, wine-multi-artifact-09:alcohol, wine-multi-artifact-09:brand |
| Crop-only replacement | 3x | 23 | 15 | 15 | alfredos-wine:alcohol, alfredos-wine:brand, approved-wine-006:alcohol, approved-wine-006:brand, approved-wine-013:alcohol, approved-wine-022:alcohol, approved-wine-095:alcohol, la-fattoria-rotated:alcohol, luigi-giovanni-live:brand, patricia-green-cellars:alcohol, patricia-green-cellars:brand, three-steves-winery:brand, wine-multi-artifact-04:alcohol, wine-multi-artifact-09:alcohol, wine-multi-artifact-09:brand |
| Rotated crop-only replacement | all-scales | 2 | 3 | 1 | la-fattoria-rotated:alcohol |
| Rotated crop-only replacement | 1.5x | 2 | 1 | 1 | la-fattoria-rotated:alcohol |
| Rotated crop-only replacement | 2x | 2 | 1 | 1 | la-fattoria-rotated:alcohol |
| Rotated crop-only replacement | 3x | 2 | 1 | 1 | la-fattoria-rotated:alcohol |
| Additive targeted evidence | all-scales | 23 | 1 | 1 | approved-wine-006:alcohol |
| Additive targeted evidence | 1.5x | 23 | 0 | 0 | — |
| Additive targeted evidence | 2x | 23 | 0 | 0 | — |
| Additive targeted evidence | 3x | 23 | 1 | 1 | approved-wine-006:alcohol |
| Rotated additive targeted evidence | all-scales | 2 | 0 | 0 | — |
| Rotated additive targeted evidence | 1.5x | 2 | 0 | 0 | — |
| Rotated additive targeted evidence | 2x | 2 | 0 | 0 | — |
| Rotated additive targeted evidence | 3x | 2 | 0 | 0 | — |

## Metric Interpretation

- Exact normalized phrase presence requires the complete normalized expected phrase to appear in OCR text.
- Expected-token coverage measures partial token recovery and can improve even when full phrase presence does not.
- Dice/bigram similarity measures approximate character overlap only; higher similarity is not by itself phrase recovery.
- Candidate generation/retention and selected-field correctness are reported separately from raw OCR similarity.
- Partial fragments are not counted as phrase recovery unless the full normalized phrase is present.
- Targeted absent-field false-positive safety is not experimentally exercised when no adjudicated absent-field target geometry exists; those rows render N/A and inherit safety from unchanged production behavior.

## Challenge Slices

| Slice | Field | Scenario | Applicable | Corrected | Phrase present |
| --- | --- | --- | --- | --- | --- |
| absent-alcohol | brand | A. Production baseline | 1 | 1 | 1 |
| absent-alcohol | brand | B. Human-targeted crop | 1 | 0 | 0 |
| absent-alcohol | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| absent-alcohol | brand | D. Baseline plus targeted crop | 1 | 1 | 1 |
| absent-alcohol | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| absent-alcohol | alcohol | A. Production baseline | 0 | 0 | 0 |
| absent-alcohol | alcohol | B. Human-targeted crop | 0 | 0 | 0 |
| absent-alcohol | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| absent-alcohol | alcohol | D. Baseline plus targeted crop | 0 | 0 | 0 |
| absent-alcohol | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| absent-brand | brand | A. Production baseline | 0 | 0 | 0 |
| absent-brand | brand | B. Human-targeted crop | 0 | 0 | 0 |
| absent-brand | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| absent-brand | brand | D. Baseline plus targeted crop | 0 | 0 | 0 |
| absent-brand | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| absent-brand | alcohol | A. Production baseline | 2 | 1 | 2 |
| absent-brand | alcohol | B. Human-targeted crop | 2 | 0 | 1 |
| absent-brand | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| absent-brand | alcohol | D. Baseline plus targeted crop | 2 | 1 | 2 |
| absent-brand | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| bottom-alcohol | brand | A. Production baseline | 2 | 0 | 2 |
| bottom-alcohol | brand | B. Human-targeted crop | 2 | 0 | 0 |
| bottom-alcohol | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| bottom-alcohol | brand | D. Baseline plus targeted crop | 2 | 0 | 2 |
| bottom-alcohol | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| bottom-alcohol | alcohol | A. Production baseline | 4 | 2 | 4 |
| bottom-alcohol | alcohol | B. Human-targeted crop | 4 | 1 | 2 |
| bottom-alcohol | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| bottom-alcohol | alcohol | D. Baseline plus targeted crop | 4 | 2 | 4 |
| bottom-alcohol | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| candidate-filtering | brand | A. Production baseline | 7 | 1 | 6 |
| candidate-filtering | brand | B. Human-targeted crop | 7 | 2 | 2 |
| candidate-filtering | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| candidate-filtering | brand | D. Baseline plus targeted crop | 7 | 3 | 6 |
| candidate-filtering | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| candidate-filtering | alcohol | A. Production baseline | 8 | 1 | 7 |
| candidate-filtering | alcohol | B. Human-targeted crop | 8 | 1 | 2 |
| candidate-filtering | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| candidate-filtering | alcohol | D. Baseline plus targeted crop | 8 | 1 | 7 |
| candidate-filtering | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| candidate-ranking | brand | A. Production baseline | 1 | 0 | 1 |
| candidate-ranking | brand | B. Human-targeted crop | 1 | 1 | 1 |
| candidate-ranking | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| candidate-ranking | brand | D. Baseline plus targeted crop | 1 | 1 | 1 |
| candidate-ranking | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| candidate-ranking | alcohol | A. Production baseline | 1 | 0 | 1 |
| candidate-ranking | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| candidate-ranking | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| candidate-ranking | alcohol | D. Baseline plus targeted crop | 1 | 0 | 1 |
| candidate-ranking | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| correct-control | brand | A. Production baseline | 2 | 2 | 2 |
| correct-control | brand | B. Human-targeted crop | 2 | 0 | 0 |
| correct-control | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| correct-control | brand | D. Baseline plus targeted crop | 2 | 2 | 2 |
| correct-control | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| correct-control | alcohol | A. Production baseline | 2 | 2 | 2 |
| correct-control | alcohol | B. Human-targeted crop | 2 | 0 | 1 |
| correct-control | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| correct-control | alcohol | D. Baseline plus targeted crop | 2 | 2 | 2 |
| correct-control | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| front-label | brand | A. Production baseline | 1 | 0 | 1 |
| front-label | brand | B. Human-targeted crop | 1 | 0 | 0 |
| front-label | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| front-label | brand | D. Baseline plus targeted crop | 1 | 0 | 1 |
| front-label | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| front-label | alcohol | A. Production baseline | 1 | 0 | 1 |
| front-label | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| front-label | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| front-label | alcohol | D. Baseline plus targeted crop | 1 | 0 | 1 |
| front-label | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| genuinely-ambiguous | brand | A. Production baseline | 1 | 1 | 1 |
| genuinely-ambiguous | brand | B. Human-targeted crop | 1 | 0 | 0 |
| genuinely-ambiguous | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| genuinely-ambiguous | brand | D. Baseline plus targeted crop | 1 | 1 | 1 |
| genuinely-ambiguous | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| genuinely-ambiguous | alcohol | A. Production baseline | 1 | 0 | 1 |
| genuinely-ambiguous | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| genuinely-ambiguous | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| genuinely-ambiguous | alcohol | D. Baseline plus targeted crop | 1 | 0 | 1 |
| genuinely-ambiguous | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| low-contrast | brand | A. Production baseline | 2 | 1 | 2 |
| low-contrast | brand | B. Human-targeted crop | 2 | 0 | 0 |
| low-contrast | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| low-contrast | brand | D. Baseline plus targeted crop | 2 | 1 | 2 |
| low-contrast | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| low-contrast | alcohol | A. Production baseline | 2 | 1 | 2 |
| low-contrast | alcohol | B. Human-targeted crop | 2 | 1 | 1 |
| low-contrast | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| low-contrast | alcohol | D. Baseline plus targeted crop | 2 | 1 | 2 |
| low-contrast | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| low-resolution | brand | A. Production baseline | 0 | 0 | 0 |
| low-resolution | brand | B. Human-targeted crop | 0 | 0 | 0 |
| low-resolution | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| low-resolution | brand | D. Baseline plus targeted crop | 0 | 0 | 0 |
| low-resolution | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| low-resolution | alcohol | A. Production baseline | 1 | 0 | 1 |
| low-resolution | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| low-resolution | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| low-resolution | alcohol | D. Baseline plus targeted crop | 1 | 0 | 1 |
| low-resolution | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| mixed-orientation | brand | A. Production baseline | 1 | 0 | 1 |
| mixed-orientation | brand | B. Human-targeted crop | 1 | 1 | 1 |
| mixed-orientation | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| mixed-orientation | brand | D. Baseline plus targeted crop | 1 | 1 | 1 |
| mixed-orientation | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| mixed-orientation | alcohol | A. Production baseline | 1 | 0 | 0 |
| mixed-orientation | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| mixed-orientation | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| mixed-orientation | alcohol | D. Baseline plus targeted crop | 1 | 0 | 0 |
| mixed-orientation | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| multi-artifact | brand | A. Production baseline | 2 | 1 | 1 |
| multi-artifact | brand | B. Human-targeted crop | 2 | 0 | 0 |
| multi-artifact | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| multi-artifact | brand | D. Baseline plus targeted crop | 2 | 1 | 1 |
| multi-artifact | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| multi-artifact | alcohol | A. Production baseline | 2 | 1 | 2 |
| multi-artifact | alcohol | B. Human-targeted crop | 2 | 0 | 0 |
| multi-artifact | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| multi-artifact | alcohol | D. Baseline plus targeted crop | 2 | 1 | 2 |
| multi-artifact | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| multiple-brand-like-phrases | brand | A. Production baseline | 3 | 1 | 3 |
| multiple-brand-like-phrases | brand | B. Human-targeted crop | 3 | 1 | 1 |
| multiple-brand-like-phrases | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| multiple-brand-like-phrases | brand | D. Baseline plus targeted crop | 3 | 2 | 3 |
| multiple-brand-like-phrases | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| multiple-brand-like-phrases | alcohol | A. Production baseline | 2 | 0 | 2 |
| multiple-brand-like-phrases | alcohol | B. Human-targeted crop | 2 | 0 | 1 |
| multiple-brand-like-phrases | alcohol | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| multiple-brand-like-phrases | alcohol | D. Baseline plus targeted crop | 2 | 0 | 2 |
| multiple-brand-like-phrases | alcohol | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| ocr-recognition | brand | A. Production baseline | 3 | 0 | 2 |
| ocr-recognition | brand | B. Human-targeted crop | 3 | 1 | 1 |
| ocr-recognition | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| ocr-recognition | brand | D. Baseline plus targeted crop | 3 | 1 | 2 |
| ocr-recognition | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| ocr-recognition | alcohol | A. Production baseline | 3 | 0 | 1 |
| ocr-recognition | alcohol | B. Human-targeted crop | 3 | 0 | 0 |
| ocr-recognition | alcohol | C. Canonically rotated targeted crop | 1 | 0 | 0 |
| ocr-recognition | alcohol | D. Baseline plus targeted crop | 3 | 0 | 1 |
| ocr-recognition | alcohol | E. Baseline plus rotated targeted crop | 1 | 0 | 0 |
| rotated-text | brand | A. Production baseline | 2 | 0 | 2 |
| rotated-text | brand | B. Human-targeted crop | 2 | 0 | 0 |
| rotated-text | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| rotated-text | brand | D. Baseline plus targeted crop | 2 | 0 | 2 |
| rotated-text | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| rotated-text | alcohol | A. Production baseline | 2 | 0 | 1 |
| rotated-text | alcohol | B. Human-targeted crop | 2 | 0 | 0 |
| rotated-text | alcohol | C. Canonically rotated targeted crop | 2 | 0 | 0 |
| rotated-text | alcohol | D. Baseline plus targeted crop | 2 | 0 | 1 |
| rotated-text | alcohol | E. Baseline plus rotated targeted crop | 2 | 0 | 1 |
| side-or-edge-alcohol | brand | A. Production baseline | 4 | 0 | 4 |
| side-or-edge-alcohol | brand | B. Human-targeted crop | 4 | 1 | 1 |
| side-or-edge-alcohol | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| side-or-edge-alcohol | brand | D. Baseline plus targeted crop | 4 | 1 | 4 |
| side-or-edge-alcohol | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| side-or-edge-alcohol | alcohol | A. Production baseline | 4 | 0 | 2 |
| side-or-edge-alcohol | alcohol | B. Human-targeted crop | 4 | 0 | 1 |
| side-or-edge-alcohol | alcohol | C. Canonically rotated targeted crop | 2 | 0 | 0 |
| side-or-edge-alcohol | alcohol | D. Baseline plus targeted crop | 4 | 0 | 2 |
| side-or-edge-alcohol | alcohol | E. Baseline plus rotated targeted crop | 2 | 0 | 1 |
| vertical-mandatory-strip | brand | A. Production baseline | 1 | 0 | 1 |
| vertical-mandatory-strip | brand | B. Human-targeted crop | 1 | 0 | 0 |
| vertical-mandatory-strip | brand | C. Canonically rotated targeted crop | 0 | 0 | 0 |
| vertical-mandatory-strip | brand | D. Baseline plus targeted crop | 1 | 0 | 1 |
| vertical-mandatory-strip | brand | E. Baseline plus rotated targeted crop | 0 | 0 | 0 |
| vertical-mandatory-strip | alcohol | A. Production baseline | 1 | 0 | 1 |
| vertical-mandatory-strip | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| vertical-mandatory-strip | alcohol | C. Canonically rotated targeted crop | 1 | 0 | 0 |
| vertical-mandatory-strip | alcohol | D. Baseline plus targeted crop | 1 | 0 | 1 |
| vertical-mandatory-strip | alcohol | E. Baseline plus rotated targeted crop | 1 | 0 | 1 |

## Case Ledger

| Case | Field | Baseline | Best crop-only | Crop state | Best additive | Additive state | Best rotated crop-only | Rotated crop state | Best rotated additive | Rotated additive state | Diagnostic best outcome (non-prescriptive) | Classifications |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| wine-multi-artifact-09 | brand | correct | ocr-recognition-failure @ 1.5x | regression | correct @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement, regressions observed |
| wine-multi-artifact-09 | alcohol | correct | ocr-recognition-failure @ 1.5x | regression | correct @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement, regressions observed |
| approved-wine-022 | brand | correct | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| approved-wine-022 | alcohol | correct | candidate-filtering-failure @ 1.5x | regression | correct @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement, regressions observed |
| three-steves-winery | brand | correct | ocr-recognition-failure @ 1.5x | regression | correct @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement, regressions observed |
| three-steves-winery | alcohol | correct | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| approved-wine-006 | brand | candidate-filtering-failure | candidate-generation-failure @ 3x | unchanged | candidate-filtering-failure @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| approved-wine-006 | alcohol | correct | correct @ 1.5x | unchanged | correct @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement, regressions observed |
| alfredos-wine | brand | candidate-filtering-failure | ocr-recognition-failure @ 2x | unchanged | candidate-filtering-failure @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| alfredos-wine | alcohol | candidate-filtering-failure | ocr-recognition-failure @ 2x | unchanged | candidate-filtering-failure @ 2x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| luigi-giovanni-live | brand | candidate-filtering-failure | ocr-recognition-failure @ 3x | unchanged | candidate-filtering-failure @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| luigi-giovanni-live | alcohol | candidate-filtering-failure | candidate-filtering-failure @ 1.5x | unchanged | candidate-filtering-failure @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| approved-wine-013 | brand | candidate-ranking-failure | correct-uncertainty @ 3x | correct-uncertainty recovery | correct-uncertainty @ 3x | correct-uncertainty recovery | not-applicable | not-applicable | not-applicable | not-applicable | B. Human-targeted crop (3x) | scale sensitivity, ranking recovery |
| approved-wine-013 | alcohol | candidate-filtering-failure | region-coverage-failure @ 1.5x | unchanged | candidate-filtering-failure @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| approved-wine-035 | brand | ocr-recognition-failure | ocr-recognition-failure @ 1.5x | unchanged | ocr-recognition-failure @ 3x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| approved-wine-035 | alcohol | ocr-recognition-failure | ocr-recognition-failure @ 1.5x | unchanged | ocr-recognition-failure @ 1.5x | unchanged | region-coverage-failure @ 1.5x | unchanged | ocr-recognition-failure @ 2x | unchanged | A. Production baseline | no improvement |
| la-fattoria-rotated | brand | ocr-recognition-failure | ocr-recognition-failure @ 3x | unchanged | ocr-recognition-failure @ 3x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| la-fattoria-rotated | alcohol | candidate-filtering-failure | region-coverage-failure @ 1.5x | unchanged | candidate-filtering-failure @ 3x | unchanged | ocr-recognition-failure @ 1.5x | unchanged | candidate-filtering-failure @ 1.5x | unchanged | A. Production baseline | no improvement |
| approved-wine-054 | brand | candidate-filtering-failure | correct-uncertainty @ 1.5x | correct-uncertainty recovery | correct-uncertainty @ 1.5x | correct-uncertainty recovery | not-applicable | not-applicable | not-applicable | not-applicable | B. Human-targeted crop (1.5x) | annotation uncertainty, filtering recovery |
| approved-wine-054 | alcohol | ocr-recognition-failure | ocr-recognition-failure @ 1.5x | unchanged | ocr-recognition-failure @ 2x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | annotation uncertainty, no improvement |
| patricia-green-cellars | brand | correct-uncertainty | candidate-generation-failure @ 1.5x | regression | correct-uncertainty @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | annotation uncertainty, no improvement, regressions observed |
| patricia-green-cellars | alcohol | candidate-filtering-failure | region-coverage-failure @ 1.5x | unchanged | candidate-filtering-failure @ 2x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | annotation uncertainty, no improvement |
| wine-multi-artifact-04 | brand | ocr-recognition-failure | candidate-generation-failure @ 1.5x | unchanged | ocr-recognition-failure @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| wine-multi-artifact-04 | alcohol | candidate-filtering-failure | ocr-recognition-failure @ 1.5x | unchanged | candidate-filtering-failure @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| approved-wine-095 | brand | correct | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no improvement |
| approved-wine-095 | alcohol | candidate-filtering-failure | region-coverage-failure @ 1.5x | unchanged | candidate-filtering-failure @ 1.5x | unchanged | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | annotation uncertainty, no improvement |

## Regressions

| Case | Field | Scenario | Baseline | Counterfactual |
| --- | --- | --- | --- | --- |
| wine-multi-artifact-09 | brand | B. Human-targeted crop (1.5x) | correct | ocr-recognition-failure |
| wine-multi-artifact-09 | brand | B. Human-targeted crop (2x) | correct | ocr-recognition-failure |
| wine-multi-artifact-09 | brand | B. Human-targeted crop (3x) | correct | ocr-recognition-failure |
| wine-multi-artifact-09 | alcohol | B. Human-targeted crop (1.5x) | correct | ocr-recognition-failure |
| wine-multi-artifact-09 | alcohol | B. Human-targeted crop (2x) | correct | ocr-recognition-failure |
| wine-multi-artifact-09 | alcohol | B. Human-targeted crop (3x) | correct | ocr-recognition-failure |
| approved-wine-022 | alcohol | B. Human-targeted crop (1.5x) | correct | candidate-filtering-failure |
| approved-wine-022 | alcohol | B. Human-targeted crop (2x) | correct | candidate-filtering-failure |
| approved-wine-022 | alcohol | B. Human-targeted crop (3x) | correct | candidate-filtering-failure |
| three-steves-winery | brand | B. Human-targeted crop (1.5x) | correct | ocr-recognition-failure |
| three-steves-winery | brand | B. Human-targeted crop (2x) | correct | ocr-recognition-failure |
| three-steves-winery | brand | B. Human-targeted crop (3x) | correct | ocr-recognition-failure |
| approved-wine-006 | brand | B. Human-targeted crop (1.5x) | candidate-filtering-failure | candidate-generation-failure |
| approved-wine-006 | brand | B. Human-targeted crop (2x) | candidate-filtering-failure | candidate-generation-failure |
| approved-wine-006 | brand | B. Human-targeted crop (3x) | candidate-filtering-failure | candidate-generation-failure |
| approved-wine-006 | alcohol | B. Human-targeted crop (3x) | correct | parser-failure |
| approved-wine-006 | alcohol | D. Baseline plus targeted crop (3x) | correct | parser-failure |
| alfredos-wine | brand | B. Human-targeted crop (1.5x) | candidate-filtering-failure | ocr-recognition-failure |
| alfredos-wine | brand | B. Human-targeted crop (2x) | candidate-filtering-failure | ocr-recognition-failure |
| alfredos-wine | brand | B. Human-targeted crop (3x) | candidate-filtering-failure | ocr-recognition-failure |
| alfredos-wine | alcohol | B. Human-targeted crop (1.5x) | candidate-filtering-failure | ocr-recognition-failure |
| alfredos-wine | alcohol | B. Human-targeted crop (2x) | candidate-filtering-failure | ocr-recognition-failure |
| alfredos-wine | alcohol | B. Human-targeted crop (3x) | candidate-filtering-failure | ocr-recognition-failure |
| luigi-giovanni-live | brand | B. Human-targeted crop (1.5x) | candidate-filtering-failure | ocr-recognition-failure |
| luigi-giovanni-live | brand | B. Human-targeted crop (2x) | candidate-filtering-failure | ocr-recognition-failure |
| luigi-giovanni-live | brand | B. Human-targeted crop (3x) | candidate-filtering-failure | ocr-recognition-failure |
| approved-wine-013 | alcohol | B. Human-targeted crop (1.5x) | candidate-filtering-failure | region-coverage-failure |
| approved-wine-013 | alcohol | B. Human-targeted crop (2x) | candidate-filtering-failure | region-coverage-failure |
| approved-wine-013 | alcohol | B. Human-targeted crop (3x) | candidate-filtering-failure | region-coverage-failure |
| la-fattoria-rotated | alcohol | B. Human-targeted crop (1.5x) | candidate-filtering-failure | region-coverage-failure |
| la-fattoria-rotated | alcohol | B. Human-targeted crop (2x) | candidate-filtering-failure | region-coverage-failure |
| la-fattoria-rotated | alcohol | B. Human-targeted crop (3x) | candidate-filtering-failure | region-coverage-failure |
| la-fattoria-rotated | alcohol | C. Canonically rotated targeted crop (1.5x) | candidate-filtering-failure | ocr-recognition-failure |
| la-fattoria-rotated | alcohol | C. Canonically rotated targeted crop (2x) | candidate-filtering-failure | ocr-recognition-failure |
| la-fattoria-rotated | alcohol | C. Canonically rotated targeted crop (3x) | candidate-filtering-failure | ocr-recognition-failure |
| patricia-green-cellars | brand | B. Human-targeted crop (1.5x) | correct-uncertainty | candidate-generation-failure |
| patricia-green-cellars | brand | B. Human-targeted crop (2x) | correct-uncertainty | candidate-generation-failure |
| patricia-green-cellars | brand | B. Human-targeted crop (3x) | correct-uncertainty | candidate-generation-failure |
| patricia-green-cellars | alcohol | B. Human-targeted crop (1.5x) | candidate-filtering-failure | region-coverage-failure |
| patricia-green-cellars | alcohol | B. Human-targeted crop (2x) | candidate-filtering-failure | region-coverage-failure |
| patricia-green-cellars | alcohol | B. Human-targeted crop (3x) | candidate-filtering-failure | ocr-recognition-failure |
| wine-multi-artifact-04 | alcohol | B. Human-targeted crop (1.5x) | candidate-filtering-failure | ocr-recognition-failure |
| wine-multi-artifact-04 | alcohol | B. Human-targeted crop (2x) | candidate-filtering-failure | ocr-recognition-failure |
| wine-multi-artifact-04 | alcohol | B. Human-targeted crop (3x) | candidate-filtering-failure | ocr-recognition-failure |
| approved-wine-095 | alcohol | B. Human-targeted crop (1.5x) | candidate-filtering-failure | region-coverage-failure |
| approved-wine-095 | alcohol | B. Human-targeted crop (2x) | candidate-filtering-failure | region-coverage-failure |
| approved-wine-095 | alcohol | B. Human-targeted crop (3x) | candidate-filtering-failure | ocr-recognition-failure |

## Latency

| Scenario | Field | Applicable case-fields | Matched baseline latency | Measured targeted-pass incremental latency | Estimated combined latency | Matched additive delta | Interpretation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Production baseline | brand | 13 | 2198 ms | N/A | N/A | N/A | measured production baseline |
| B. Human-targeted crop (1.5x) | brand | 11 | 2997 ms | 141 ms | N/A | N/A | measured targeted pass only |
| C. Canonically rotated targeted crop (1.5x) | brand | 0 | 0 ms | 0 ms | N/A | N/A | measured targeted pass only |
| D. Baseline plus targeted crop (1.5x) | brand | 11 | 2997 ms | 141 ms | 3162 ms | 141 ms | estimated combined latency |
| E. Baseline plus rotated targeted crop (1.5x) | brand | 0 | 0 ms | 0 ms | 0 ms | 0 ms | estimated combined latency |
| B. Human-targeted crop (2x) | brand | 11 | 2997 ms | 178 ms | N/A | N/A | measured targeted pass only |
| C. Canonically rotated targeted crop (2x) | brand | 0 | 0 ms | 0 ms | N/A | N/A | measured targeted pass only |
| D. Baseline plus targeted crop (2x) | brand | 11 | 2997 ms | 178 ms | 3276 ms | 178 ms | estimated combined latency |
| E. Baseline plus rotated targeted crop (2x) | brand | 0 | 0 ms | 0 ms | 0 ms | 0 ms | estimated combined latency |
| B. Human-targeted crop (3x) | brand | 11 | 2997 ms | 329 ms | N/A | N/A | measured targeted pass only |
| C. Canonically rotated targeted crop (3x) | brand | 0 | 0 ms | 0 ms | N/A | N/A | measured targeted pass only |
| D. Baseline plus targeted crop (3x) | brand | 11 | 2997 ms | 329 ms | 3422 ms | 329 ms | estimated combined latency |
| E. Baseline plus rotated targeted crop (3x) | brand | 0 | 0 ms | 0 ms | 0 ms | 0 ms | estimated combined latency |
| A. Production baseline | alcohol | 13 | 2198 ms | N/A | N/A | N/A | measured production baseline |
| B. Human-targeted crop (1.5x) | alcohol | 12 | 2126 ms | 127 ms | N/A | N/A | measured targeted pass only |
| C. Canonically rotated targeted crop (1.5x) | alcohol | 2 | 1234 ms | 55 ms | N/A | N/A | measured targeted pass only |
| D. Baseline plus targeted crop (1.5x) | alcohol | 12 | 2126 ms | 127 ms | 2322 ms | 127 ms | estimated combined latency |
| E. Baseline plus rotated targeted crop (1.5x) | alcohol | 2 | 1234 ms | 55 ms | 1348 ms | 55 ms | estimated combined latency |
| B. Human-targeted crop (2x) | alcohol | 12 | 2126 ms | 185 ms | N/A | N/A | measured targeted pass only |
| C. Canonically rotated targeted crop (2x) | alcohol | 2 | 1234 ms | 67 ms | N/A | N/A | measured targeted pass only |
| D. Baseline plus targeted crop (2x) | alcohol | 12 | 2126 ms | 185 ms | 2378 ms | 185 ms | estimated combined latency |
| E. Baseline plus rotated targeted crop (2x) | alcohol | 2 | 1234 ms | 67 ms | 1359 ms | 67 ms | estimated combined latency |
| B. Human-targeted crop (3x) | alcohol | 12 | 2126 ms | 373 ms | N/A | N/A | measured targeted pass only |
| C. Canonically rotated targeted crop (3x) | alcohol | 2 | 1234 ms | 102 ms | N/A | N/A | measured targeted pass only |
| D. Baseline plus targeted crop (3x) | alcohol | 12 | 2126 ms | 373 ms | 2517 ms | 373 ms | estimated combined latency |
| E. Baseline plus rotated targeted crop (3x) | alcohol | 2 | 1234 ms | 102 ms | 1381 ms | 102 ms | estimated combined latency |

- `Estimated combined latency` is derived from matched baseline latency plus one targeted pass. It is not a directly measured end-to-end production workflow.

## Scale Analysis

| Family | Field | Applicable case-fields | Improved vs 1.5x | Worsened vs 1.5x | Failure-class changes without selected-outcome improvement | Unchanged |
| --- | --- | --- | --- | --- | --- | --- |
| Crop-only replacement | brand | 11 | 0 | 0 | 4 | 7 |
| Crop-only replacement | alcohol | 12 | 0 | 1 | 2 | 9 |
| Rotated crop-only replacement | brand | 0 | 0 | 0 | 0 | 0 |
| Rotated crop-only replacement | alcohol | 2 | 0 | 0 | 0 | 2 |
| Additive targeted evidence | brand | 11 | 0 | 0 | 3 | 8 |
| Additive targeted evidence | alcohol | 12 | 0 | 1 | 0 | 11 |
| Rotated additive targeted evidence | brand | 0 | 0 | 0 | 0 | 0 |
| Rotated additive targeted evidence | alcohol | 2 | 0 | 0 | 0 | 2 |

## Conclusions

### replacement

- Labels: REGION REPLACEMENT NOT SUPPORTED
- Rationale: Limited crop-only correct-uncertainty recoveries occurred, but replacement is not supported as a reliable strategy because it removes full-image context and produces substantially more regressions than recoveries.
- Evidence: crop-only exact recoveries: 0 scenario-scale, 0 unique case-fields
- Evidence: crop-only correct-uncertainty recoveries: 6 scenario-scale, 2 unique case-fields (approved-wine-013:brand, approved-wine-054:brand)
- Evidence: crop-only scenario-scale regression instances: 43
- Evidence: crop-only unique case-field regressions: 15

### additive-brand

- Labels: BOUNDED ADDITIVE BRAND SIGNAL SUPPORTED
- Rationale: Bounded additive brand signal is supported on this adjudicated slice: two brand case-fields recover to correct uncertainty at 1.5x without any prior-correct brand regression.
- Evidence: 1.5x additive brand recoveries: 0 exact, 2 correct-uncertainty, 2 total acceptable
- Evidence: recovered case-fields: approved-wine-013:brand, approved-wine-054:brand
- Evidence: approved-wine-013:brand => targeted selected source: yes; duplicate corroborated: yes; new candidate: yes; new alternate: yes; ranking changed: yes; ambiguity changed: no
- Evidence: approved-wine-054:brand => targeted selected source: yes; duplicate corroborated: no; new candidate: yes; new alternate: yes; ranking changed: yes; ambiguity changed: no

### additive-alcohol

- Labels: INSUFFICIENT EVIDENCE
- Rationale: No additive alcohol selected-outcome recovery was observed on this adjudicated slice.
- Evidence: 1.5x additive alcohol recoveries: 0 exact, 0 correct-uncertainty, 0 total acceptable
- Evidence: additive alcohol prior-correct regressions: 1 scenario-scale

### rotation

- Labels: INSUFFICIENT EVIDENCE
- Rationale: Canonical rotation did not recover a selected outcome in the two applicable alcohol fields at any tested scale. The evidence remains too small for a broad universal claim.
- Evidence: rotated crop-only applicable alcohol case-fields at 1.5x: 2
- Evidence: rotated selected-outcome recoveries across crop-only and additive families: 0

### scaling

- Labels: MIXED RESULT
- Rationale: Scale changes affect a bounded subset of case-fields. The report separates beneficial, harmful, and failure-class-only movements relative to the original 1.5x benchmark without recommending a production scale.
- Evidence: Crop-only replacement / brand: improved 0, worsened 0, failure-class changes without selected-outcome improvement 4, unchanged 7
- Evidence: Crop-only replacement / alcohol: improved 0, worsened 1, failure-class changes without selected-outcome improvement 2, unchanged 9
- Evidence: Rotated crop-only replacement / brand: improved 0, worsened 0, failure-class changes without selected-outcome improvement 0, unchanged 0
- Evidence: Rotated crop-only replacement / alcohol: improved 0, worsened 0, failure-class changes without selected-outcome improvement 0, unchanged 2
- Evidence: Additive targeted evidence / brand: improved 0, worsened 0, failure-class changes without selected-outcome improvement 3, unchanged 8
- Evidence: Additive targeted evidence / alcohol: improved 0, worsened 1, failure-class changes without selected-outcome improvement 0, unchanged 11
- Evidence: Rotated additive targeted evidence / brand: improved 0, worsened 0, failure-class changes without selected-outcome improvement 0, unchanged 0
- Evidence: Rotated additive targeted evidence / alcohol: improved 0, worsened 0, failure-class changes without selected-outcome improvement 0, unchanged 2

### remaining-bottlenecks

- Labels: RECOGNITION BOTTLENECK SUPPORTED. MIXED RESULT
- Rationale: After the diagnostic-best targeted scenarios, remaining failures still separate into recognition/reconstruction, candidate-generation, filtering, ranking, and parser categories.
- Evidence: recognition/reconstruction failures remaining: 5
- Evidence: candidate-generation failures remaining: 0
- Evidence: candidate-filtering failures remaining: 10
- Evidence: candidate-ranking failures remaining: 0
- Evidence: parser failures remaining: 0

## Production Boundary

- Benchmark modules: src/fixtures/eval/ocr-region-benchmark.annotations.ts, src/fixtures/eval/ocr-region-benchmark.ts
- Guard tests: src/fixtures/truth-boundary.test.ts, src/fixtures/eval/eval-boundary.test.ts
- Proof note: All benchmark annotations, synthetic pass-kind adaptation, and additive scenario synthesis remain confined to src/fixtures/eval; production OCR planning, selection behavior, API/UI behavior, and geometry contracts are unchanged.
