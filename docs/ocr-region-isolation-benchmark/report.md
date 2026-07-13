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
| A. Production baseline | brand | 11 | 2 | 18% | 18% | 27% | 27% | 100% | 0% | 0% | 0% | 91% | 0.95 | 0.04 | 2075 ms |
| B. Human-targeted crop (1.5x) | brand | 11 | 0 | 18% | 18% | 18% | 18% | 73% | 0% | 0% | 0% | 18% | 0.35 | 0.41 | 145 ms |
| C. Canonically rotated targeted crop (1.5x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0.00 | 0.00 | 0 ms |
| D. Baseline plus targeted crop (1.5x) | brand | 11 | 0 | 36% | 36% | 36% | 36% | 100% | 0% | 0% | 0% | 91% | 0.95 | 0.04 | 2671 ms |
| E. Baseline plus rotated targeted crop (1.5x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0.00 | 0.00 | 0 ms |
| B. Human-targeted crop (2x) | brand | 11 | 0 | 18% | 18% | 18% | 18% | 73% | 0% | 0% | 0% | 18% | 0.35 | 0.42 | 172 ms |
| C. Canonically rotated targeted crop (2x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0.00 | 0.00 | 0 ms |
| D. Baseline plus targeted crop (2x) | brand | 11 | 0 | 36% | 36% | 36% | 36% | 100% | 0% | 0% | 0% | 91% | 0.95 | 0.04 | 2776 ms |
| E. Baseline plus rotated targeted crop (2x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0.00 | 0.00 | 0 ms |
| B. Human-targeted crop (3x) | brand | 11 | 0 | 18% | 18% | 18% | 18% | 64% | 0% | 0% | 0% | 18% | 0.35 | 0.41 | 326 ms |
| C. Canonically rotated targeted crop (3x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0.00 | 0.00 | 0 ms |
| D. Baseline plus targeted crop (3x) | brand | 11 | 0 | 36% | 36% | 36% | 36% | 100% | 0% | 0% | 0% | 91% | 0.95 | 0.04 | 3042 ms |
| E. Baseline plus rotated targeted crop (3x) | brand | 0 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0.00 | 0.00 | 0 ms |
| A. Production baseline | alcohol | 12 | 1 | 0% | 0% | 25% | 25% | 25% | 25% | 0% | 0% | 83% | 0.81 | 0.02 | 2075 ms |
| B. Human-targeted crop (1.5x) | alcohol | 12 | 0 | 0% | 0% | 8% | 8% | 8% | 8% | 0% | 0% | 25% | 0.25 | 0.12 | 123 ms |
| C. Canonically rotated targeted crop (1.5x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0.00 | 0.00 | 57 ms |
| D. Baseline plus targeted crop (1.5x) | alcohol | 12 | 0 | 0% | 0% | 25% | 25% | 25% | 25% | 0% | 0% | 83% | 0.81 | 0.02 | 1918 ms |
| E. Baseline plus rotated targeted crop (1.5x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 50% | 0.50 | 0.01 | 980 ms |
| B. Human-targeted crop (2x) | alcohol | 12 | 0 | 0% | 0% | 8% | 8% | 8% | 8% | 0% | 0% | 25% | 0.25 | 0.12 | 189 ms |
| C. Canonically rotated targeted crop (2x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0.00 | 0.00 | 64 ms |
| D. Baseline plus targeted crop (2x) | alcohol | 12 | 0 | 0% | 0% | 25% | 25% | 25% | 25% | 0% | 0% | 83% | 0.81 | 0.02 | 1962 ms |
| E. Baseline plus rotated targeted crop (2x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 50% | 0.50 | 0.01 | 994 ms |
| B. Human-targeted crop (3x) | alcohol | 12 | 0 | 0% | 0% | 0% | 0% | 8% | 0% | 0% | 0% | 17% | 0.23 | 0.10 | 368 ms |
| C. Canonically rotated targeted crop (3x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0.00 | 0.00 | 141 ms |
| D. Baseline plus targeted crop (3x) | alcohol | 12 | 0 | 0% | 0% | 25% | 25% | 25% | 17% | 0% | 0% | 83% | 0.81 | 0.02 | 2112 ms |
| E. Baseline plus rotated targeted crop (3x) | alcohol | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 0% | 50% | 0.50 | 0.01 | 1076 ms |

## Contribution Summary

| Scenario | Field | Cases | Mean new words | Phrase present | Candidate generated | Candidate kept | Duplicate corroborated | New candidate | New alternate | Ordering changed | Ambiguity changed | Correct result recovered | Correct uncertainty recovered | Regressed prior correct | No meaningful contribution |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B. Human-targeted crop (1.5x) | brand | 11 | 2.73 | 2 | 5 | 5 | 1 | 11 | 5 | 11 | 5 | 0 | 2 | 3 | 0 |
| B. Human-targeted crop (2x) | brand | 11 | 2.64 | 2 | 5 | 5 | 1 | 11 | 5 | 11 | 5 | 0 | 2 | 3 | 0 |
| B. Human-targeted crop (3x) | brand | 11 | 2.64 | 2 | 5 | 5 | 1 | 11 | 5 | 11 | 6 | 0 | 2 | 3 | 0 |
| C. Canonically rotated targeted crop (1.5x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| C. Canonically rotated targeted crop (2x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| C. Canonically rotated targeted crop (3x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| D. Baseline plus targeted crop (1.5x) | brand | 11 | 2.73 | 2 | 10 | 6 | 1 | 9 | 6 | 9 | 0 | 0 | 2 | 0 | 6 |
| D. Baseline plus targeted crop (2x) | brand | 11 | 2.64 | 2 | 10 | 6 | 1 | 9 | 6 | 9 | 0 | 0 | 2 | 0 | 7 |
| D. Baseline plus targeted crop (3x) | brand | 11 | 2.64 | 2 | 10 | 6 | 1 | 9 | 4 | 9 | 0 | 0 | 2 | 0 | 6 |
| E. Baseline plus rotated targeted crop (1.5x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| E. Baseline plus rotated targeted crop (2x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| E. Baseline plus rotated targeted crop (3x) | brand | 0 | 0.00 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| B. Human-targeted crop (1.5x) | alcohol | 12 | 2.33 | 3 | 3 | 1 | 1 | 2 | 0 | 10 | 0 | 0 | 0 | 2 | 10 |
| B. Human-targeted crop (2x) | alcohol | 12 | 2.17 | 3 | 3 | 1 | 1 | 2 | 0 | 10 | 0 | 0 | 0 | 2 | 10 |
| B. Human-targeted crop (3x) | alcohol | 12 | 2.42 | 2 | 2 | 0 | 0 | 3 | 0 | 10 | 0 | 0 | 0 | 3 | 9 |
| C. Canonically rotated targeted crop (1.5x) | alcohol | 2 | 3.50 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2 |
| C. Canonically rotated targeted crop (2x) | alcohol | 2 | 3.50 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2 |
| C. Canonically rotated targeted crop (3x) | alcohol | 2 | 3.50 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2 |
| D. Baseline plus targeted crop (1.5x) | alcohol | 12 | 2.33 | 3 | 10 | 3 | 1 | 2 | 0 | 3 | 0 | 0 | 0 | 0 | 12 |
| D. Baseline plus targeted crop (2x) | alcohol | 12 | 2.17 | 3 | 10 | 3 | 1 | 2 | 0 | 3 | 0 | 0 | 0 | 0 | 12 |
| D. Baseline plus targeted crop (3x) | alcohol | 12 | 2.42 | 2 | 10 | 3 | 0 | 3 | 1 | 3 | 0 | 0 | 0 | 1 | 11 |
| E. Baseline plus rotated targeted crop (1.5x) | alcohol | 2 | 3.50 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| E. Baseline plus rotated targeted crop (2x) | alcohol | 2 | 3.50 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| E. Baseline plus rotated targeted crop (3x) | alcohol | 2 | 3.50 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |

## Metric Interpretation

- Exact normalized phrase presence requires the complete normalized expected phrase to appear in OCR text.
- Expected-token coverage measures partial token recovery and can improve even when full phrase presence does not.
- Dice/bigram similarity measures approximate character overlap only; higher similarity is not by itself phrase recovery.
- Candidate generation/retention and selected-field correctness are reported separately from raw OCR similarity.
- Partial fragments are not counted as phrase recovery unless the full normalized phrase is present.

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

| Case | Field | Baseline | B crop-only | C rotated crop-only | D additive | E rotated additive | Best outcome | Contribution | Classifications |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| wine-multi-artifact-09 | brand | correct | ocr-recognition-failure @ 1.5x | not-applicable | correct @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement, regressions observed |
| wine-multi-artifact-09 | alcohol | correct | ocr-recognition-failure @ 1.5x | not-applicable | correct @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement, regressions observed |
| approved-wine-022 | brand | correct | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| approved-wine-022 | alcohol | correct | candidate-filtering-failure @ 1.5x | not-applicable | correct @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement, regressions observed |
| three-steves-winery | brand | correct | ocr-recognition-failure @ 1.5x | not-applicable | correct @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement, regressions observed |
| three-steves-winery | alcohol | correct | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| approved-wine-006 | brand | candidate-filtering-failure | candidate-generation-failure @ 3x | not-applicable | candidate-filtering-failure @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| approved-wine-006 | alcohol | correct | correct @ 1.5x | not-applicable | correct @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement, regressions observed |
| alfredos-wine | brand | candidate-filtering-failure | ocr-recognition-failure @ 2x | not-applicable | candidate-filtering-failure @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| alfredos-wine | alcohol | candidate-filtering-failure | ocr-recognition-failure @ 2x | not-applicable | candidate-filtering-failure @ 2x | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| luigi-giovanni-live | brand | candidate-filtering-failure | ocr-recognition-failure @ 3x | not-applicable | candidate-filtering-failure @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| luigi-giovanni-live | alcohol | candidate-filtering-failure | candidate-filtering-failure @ 1.5x | not-applicable | candidate-filtering-failure @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| approved-wine-013 | brand | candidate-ranking-failure | correct-uncertainty @ 3x | not-applicable | correct-uncertainty @ 3x | not-applicable | B. Human-targeted crop (3x) | correct uncertainty recovered, duplicate corroborated, new alternate introduced | scale sensitivity, ranking recovery |
| approved-wine-013 | alcohol | candidate-filtering-failure | region-coverage-failure @ 1.5x | not-applicable | candidate-filtering-failure @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| approved-wine-035 | brand | ocr-recognition-failure | ocr-recognition-failure @ 1.5x | not-applicable | ocr-recognition-failure @ 3x | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| approved-wine-035 | alcohol | ocr-recognition-failure | ocr-recognition-failure @ 1.5x | region-coverage-failure @ 1.5x | ocr-recognition-failure @ 1.5x | ocr-recognition-failure @ 2x | A. Production baseline | no meaningful contribution | no improvement |
| la-fattoria-rotated | brand | ocr-recognition-failure | ocr-recognition-failure @ 3x | not-applicable | ocr-recognition-failure @ 3x | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| la-fattoria-rotated | alcohol | candidate-filtering-failure | region-coverage-failure @ 1.5x | ocr-recognition-failure @ 1.5x | candidate-filtering-failure @ 3x | candidate-filtering-failure @ 1.5x | A. Production baseline | no meaningful contribution | no improvement |
| approved-wine-054 | brand | candidate-filtering-failure | correct-uncertainty @ 1.5x | not-applicable | correct-uncertainty @ 1.5x | not-applicable | B. Human-targeted crop (1.5x) | correct uncertainty recovered, new alternate introduced | annotation uncertainty, filtering recovery |
| approved-wine-054 | alcohol | ocr-recognition-failure | ocr-recognition-failure @ 1.5x | not-applicable | ocr-recognition-failure @ 2x | not-applicable | A. Production baseline | no meaningful contribution | annotation uncertainty, no improvement |
| patricia-green-cellars | brand | correct-uncertainty | candidate-generation-failure @ 1.5x | not-applicable | correct-uncertainty @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | annotation uncertainty, no improvement, regressions observed |
| patricia-green-cellars | alcohol | candidate-filtering-failure | region-coverage-failure @ 1.5x | not-applicable | candidate-filtering-failure @ 2x | not-applicable | A. Production baseline | no meaningful contribution | annotation uncertainty, no improvement |
| wine-multi-artifact-04 | brand | ocr-recognition-failure | candidate-generation-failure @ 1.5x | not-applicable | ocr-recognition-failure @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| wine-multi-artifact-04 | alcohol | candidate-filtering-failure | ocr-recognition-failure @ 1.5x | not-applicable | candidate-filtering-failure @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| approved-wine-095 | brand | correct | not-applicable | not-applicable | not-applicable | not-applicable | A. Production baseline | no meaningful contribution | no improvement |
| approved-wine-095 | alcohol | candidate-filtering-failure | region-coverage-failure @ 1.5x | not-applicable | candidate-filtering-failure @ 1.5x | not-applicable | A. Production baseline | no meaningful contribution | annotation uncertainty, no improvement |

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

| Scenario | Executed fields | Median latency | p95 latency | Median OCR | Median preprocess |
| --- | --- | --- | --- | --- | --- |
| A. Production baseline | 26 | 2075 ms | 4003 ms | 1603 ms | 178 ms |
| B. Human-targeted crop (1.5x) | 23 | 128 ms | 365 ms | 111 ms | 40 ms |
| C. Canonically rotated targeted crop (1.5x) | 2 | 57 ms | 110 ms | 30 ms | 12 ms |
| D. Baseline plus targeted crop (1.5x) | 23 | 2315 ms | 4091 ms | 1807 ms | 338 ms |
| E. Baseline plus rotated targeted crop (1.5x) | 2 | 980 ms | 3361 ms | 703 ms | 190 ms |
| B. Human-targeted crop (2x) | 23 | 174 ms | 590 ms | 131 ms | 57 ms |
| C. Canonically rotated targeted crop (2x) | 2 | 64 ms | 124 ms | 34 ms | 13 ms |
| D. Baseline plus targeted crop (2x) | 23 | 2376 ms | 4177 ms | 1840 ms | 346 ms |
| E. Baseline plus rotated targeted crop (2x) | 2 | 994 ms | 3367 ms | 715 ms | 191 ms |
| B. Human-targeted crop (3x) | 23 | 340 ms | 1245 ms | 224 ms | 115 ms |
| C. Canonically rotated targeted crop (3x) | 2 | 141 ms | 206 ms | 89 ms | 29 ms |
| D. Baseline plus targeted crop (3x) | 23 | 2716 ms | 4697 ms | 2024 ms | 368 ms |
| E. Baseline plus rotated targeted crop (3x) | 2 | 1076 ms | 3445 ms | 782 ms | 207 ms |

## Conclusions

### replacement

- Labels: REGION REPLACEMENT NOT SUPPORTED
- Rationale: Crop-only replacement did not deliver a reliable outcome recovery once full-image context was removed.
- Evidence: crop-only correct recoveries: 0
- Evidence: crop-only regressions: 46

### additive

- Labels: ADDITIVE REGION SIGNAL SUPPORTED
- Rationale: Appending targeted evidence recovers a bounded set of outcomes without changing production extraction or selection rules.
- Evidence: additive recoveries: 2
- Evidence: additive false-certainty introductions: 0

### rotation

- Labels: ROTATION STRATEGY NOT SUPPORTED
- Rationale: Explicit canonical rotation did not recover outcomes beyond the non-rotated targeted variants.
- Evidence: rotation-assisted recoveries: 0

### scaling

- Labels: SCALE-SENSITIVE RESULT
- Rationale: Scenario outcomes change across 1.5x, 2x, and 3x, so scale effects are measurable even though this report makes no production recommendation.
- Evidence: scale-sensitive cases observed: yes

### remaining-recognition-failures

- Labels: RECOGNITION BOTTLENECK SUPPORTED
- Rationale: Even with targeted evidence, several cases still fail before a usable candidate can be selected, indicating a remaining recognition or reconstruction bottleneck.
- Evidence: best-scenario recognition/reconstruction failures remaining: 5

### remaining-selection-failures

- Labels: MIXED RESULT
- Rationale: Candidate filtering, ranking, or alcohol parsing defects still remain after the best tested targeted scenarios.
- Evidence: best-scenario selection/parsing failures remaining: 10

## Production Boundary

- Benchmark modules: src/fixtures/eval/ocr-region-benchmark.annotations.ts, src/fixtures/eval/ocr-region-benchmark.ts
- Guard tests: src/fixtures/truth-boundary.test.ts, src/fixtures/eval/eval-boundary.test.ts
- Proof note: All benchmark annotations, synthetic pass-kind adaptation, and additive scenario synthesis remain confined to src/fixtures/eval; production OCR planning, selection behavior, API/UI behavior, and geometry contracts are unchanged.
