# OCR Region-Isolation Benchmark

Bounded evaluation-only benchmark over 13 adjudicated cases using the committed OCR engine and existing deterministic downstream selector logic.

## Recommendation

- Verdict: MIXED RESULT
- Rationale: Some benchmark cases improve with region isolation, but the gains are not uniform enough to treat crop isolation alone as the dominant bottleneck.
- Counterfactual-corrected fields: 2; rotation-only corrected fields: 0; raw phrase recoveries: 0

## Annotation Coverage

- Benchmark cases: 13
- Brand-present cases: 11
- Alcohol-present cases: 12
- Brand annotations: 11
- Alcohol annotations: 12
- Human-readable field regions: 23

## Aggregate Comparison

| Scenario | Field | Present cases | Exact | Normalized | Top-3 | Top-5 | Detected | Parsed accurate | Parser failures | Phrase present | Mean similarity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Production baseline | brand | 11 | 18% | 18% | 27% | 27% | 100% | 0% | 0 | 91% | 0.04 |
| B. Human-targeted crop | brand | 11 | 18% | 18% | 18% | 18% | 73% | 0% | 0 | 18% | 0.41 |
| C. Canonically rotated crop | brand | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0 | 0% | 0.00 |
| A. Production baseline | alcohol | 12 | 0% | 0% | 25% | 25% | 25% | 25% | 0 | 83% | 0.02 |
| B. Human-targeted crop | alcohol | 12 | 0% | 0% | 8% | 8% | 8% | 8% | 0 | 25% | 0.12 |
| C. Canonically rotated crop | alcohol | 2 | 0% | 0% | 0% | 0% | 0% | 0% | 0 | 0% | 0.00 |

## Challenge Slices

| Slice | Field | Scenario | Applicable | Corrected | Phrase present |
| --- | --- | --- | --- | --- | --- |
| absent-alcohol | brand | A. Production baseline | 1 | 1 | 1 |
| absent-alcohol | brand | B. Human-targeted crop | 1 | 0 | 0 |
| absent-alcohol | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| absent-alcohol | alcohol | A. Production baseline | 0 | 0 | 0 |
| absent-alcohol | alcohol | B. Human-targeted crop | 0 | 0 | 0 |
| absent-alcohol | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| absent-brand | brand | A. Production baseline | 0 | 0 | 0 |
| absent-brand | brand | B. Human-targeted crop | 0 | 0 | 0 |
| absent-brand | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| absent-brand | alcohol | A. Production baseline | 2 | 1 | 2 |
| absent-brand | alcohol | B. Human-targeted crop | 2 | 0 | 1 |
| absent-brand | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| bottom-alcohol | brand | A. Production baseline | 2 | 0 | 2 |
| bottom-alcohol | brand | B. Human-targeted crop | 2 | 0 | 0 |
| bottom-alcohol | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| bottom-alcohol | alcohol | A. Production baseline | 4 | 2 | 4 |
| bottom-alcohol | alcohol | B. Human-targeted crop | 4 | 1 | 2 |
| bottom-alcohol | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| candidate-filtering | brand | A. Production baseline | 7 | 1 | 6 |
| candidate-filtering | brand | B. Human-targeted crop | 7 | 2 | 2 |
| candidate-filtering | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| candidate-filtering | alcohol | A. Production baseline | 8 | 1 | 7 |
| candidate-filtering | alcohol | B. Human-targeted crop | 8 | 1 | 2 |
| candidate-filtering | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| candidate-ranking | brand | A. Production baseline | 1 | 0 | 1 |
| candidate-ranking | brand | B. Human-targeted crop | 1 | 1 | 1 |
| candidate-ranking | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| candidate-ranking | alcohol | A. Production baseline | 1 | 0 | 1 |
| candidate-ranking | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| candidate-ranking | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| correct-control | brand | A. Production baseline | 2 | 2 | 2 |
| correct-control | brand | B. Human-targeted crop | 2 | 0 | 0 |
| correct-control | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| correct-control | alcohol | A. Production baseline | 2 | 2 | 2 |
| correct-control | alcohol | B. Human-targeted crop | 2 | 0 | 1 |
| correct-control | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| front-label | brand | A. Production baseline | 1 | 0 | 1 |
| front-label | brand | B. Human-targeted crop | 1 | 0 | 0 |
| front-label | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| front-label | alcohol | A. Production baseline | 1 | 0 | 1 |
| front-label | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| front-label | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| genuinely-ambiguous | brand | A. Production baseline | 1 | 1 | 1 |
| genuinely-ambiguous | brand | B. Human-targeted crop | 1 | 0 | 0 |
| genuinely-ambiguous | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| genuinely-ambiguous | alcohol | A. Production baseline | 1 | 0 | 1 |
| genuinely-ambiguous | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| genuinely-ambiguous | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| low-contrast | brand | A. Production baseline | 2 | 1 | 2 |
| low-contrast | brand | B. Human-targeted crop | 2 | 0 | 0 |
| low-contrast | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| low-contrast | alcohol | A. Production baseline | 2 | 1 | 2 |
| low-contrast | alcohol | B. Human-targeted crop | 2 | 1 | 1 |
| low-contrast | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| low-resolution | brand | A. Production baseline | 0 | 0 | 0 |
| low-resolution | brand | B. Human-targeted crop | 0 | 0 | 0 |
| low-resolution | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| low-resolution | alcohol | A. Production baseline | 1 | 0 | 1 |
| low-resolution | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| low-resolution | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| mixed-orientation | brand | A. Production baseline | 1 | 0 | 1 |
| mixed-orientation | brand | B. Human-targeted crop | 1 | 1 | 1 |
| mixed-orientation | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| mixed-orientation | alcohol | A. Production baseline | 1 | 0 | 0 |
| mixed-orientation | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| mixed-orientation | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| multi-artifact | brand | A. Production baseline | 2 | 1 | 1 |
| multi-artifact | brand | B. Human-targeted crop | 2 | 0 | 0 |
| multi-artifact | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| multi-artifact | alcohol | A. Production baseline | 2 | 1 | 2 |
| multi-artifact | alcohol | B. Human-targeted crop | 2 | 0 | 0 |
| multi-artifact | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| multiple-brand-like-phrases | brand | A. Production baseline | 3 | 1 | 3 |
| multiple-brand-like-phrases | brand | B. Human-targeted crop | 3 | 1 | 1 |
| multiple-brand-like-phrases | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| multiple-brand-like-phrases | alcohol | A. Production baseline | 2 | 0 | 2 |
| multiple-brand-like-phrases | alcohol | B. Human-targeted crop | 2 | 0 | 1 |
| multiple-brand-like-phrases | alcohol | C. Canonically rotated crop | 0 | 0 | 0 |
| ocr-recognition | brand | A. Production baseline | 3 | 0 | 2 |
| ocr-recognition | brand | B. Human-targeted crop | 3 | 1 | 1 |
| ocr-recognition | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| ocr-recognition | alcohol | A. Production baseline | 3 | 0 | 1 |
| ocr-recognition | alcohol | B. Human-targeted crop | 3 | 0 | 0 |
| ocr-recognition | alcohol | C. Canonically rotated crop | 1 | 0 | 0 |
| rotated-text | brand | A. Production baseline | 2 | 0 | 2 |
| rotated-text | brand | B. Human-targeted crop | 2 | 0 | 0 |
| rotated-text | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| rotated-text | alcohol | A. Production baseline | 2 | 0 | 1 |
| rotated-text | alcohol | B. Human-targeted crop | 2 | 0 | 0 |
| rotated-text | alcohol | C. Canonically rotated crop | 2 | 0 | 0 |
| side-or-edge-alcohol | brand | A. Production baseline | 4 | 0 | 4 |
| side-or-edge-alcohol | brand | B. Human-targeted crop | 4 | 1 | 1 |
| side-or-edge-alcohol | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| side-or-edge-alcohol | alcohol | A. Production baseline | 4 | 0 | 2 |
| side-or-edge-alcohol | alcohol | B. Human-targeted crop | 4 | 0 | 1 |
| side-or-edge-alcohol | alcohol | C. Canonically rotated crop | 2 | 0 | 0 |
| vertical-mandatory-strip | brand | A. Production baseline | 1 | 0 | 1 |
| vertical-mandatory-strip | brand | B. Human-targeted crop | 1 | 0 | 0 |
| vertical-mandatory-strip | brand | C. Canonically rotated crop | 0 | 0 | 0 |
| vertical-mandatory-strip | alcohol | A. Production baseline | 1 | 0 | 1 |
| vertical-mandatory-strip | alcohol | B. Human-targeted crop | 1 | 0 | 0 |
| vertical-mandatory-strip | alcohol | C. Canonically rotated crop | 1 | 0 | 0 |

## Case Ledger

| Case | Field | Best scenario | Baseline | B crop | C rotated | Classifications |
| --- | --- | --- | --- | --- | --- | --- |
| wine-multi-artifact-09 | brand | A. Production baseline | correct | ocr-recognition-failure | not-applicable | regression |
| wine-multi-artifact-09 | alcohol | A. Production baseline | correct | ocr-recognition-failure | not-applicable | regression |
| approved-wine-022 | brand | A. Production baseline | correct | not-applicable | not-applicable | no improvement |
| approved-wine-022 | alcohol | A. Production baseline | correct | candidate-filtering-failure | not-applicable | regression |
| three-steves-winery | brand | A. Production baseline | correct | ocr-recognition-failure | not-applicable | regression |
| three-steves-winery | alcohol | A. Production baseline | correct | not-applicable | not-applicable | no improvement |
| approved-wine-006 | brand | A. Production baseline | candidate-filtering-failure | candidate-generation-failure | not-applicable | regression |
| approved-wine-006 | alcohol | A. Production baseline | correct | correct | not-applicable | no improvement |
| alfredos-wine | brand | A. Production baseline | candidate-filtering-failure | ocr-recognition-failure | not-applicable | regression |
| alfredos-wine | alcohol | A. Production baseline | candidate-filtering-failure | ocr-recognition-failure | not-applicable | regression |
| luigi-giovanni-live | brand | A. Production baseline | candidate-filtering-failure | ocr-recognition-failure | not-applicable | regression |
| luigi-giovanni-live | alcohol | A. Production baseline | candidate-filtering-failure | candidate-filtering-failure | not-applicable | no improvement |
| approved-wine-013 | brand | B. Human-targeted crop | candidate-ranking-failure | correct-uncertainty | not-applicable | ranking recovery, full-image scaling loss, surrounding-text interference |
| approved-wine-013 | alcohol | A. Production baseline | candidate-filtering-failure | region-coverage-failure | not-applicable | regression |
| approved-wine-035 | brand | A. Production baseline | ocr-recognition-failure | ocr-recognition-failure | not-applicable | no improvement |
| approved-wine-035 | alcohol | A. Production baseline | ocr-recognition-failure | ocr-recognition-failure | region-coverage-failure | no improvement |
| la-fattoria-rotated | brand | A. Production baseline | ocr-recognition-failure | ocr-recognition-failure | not-applicable | no improvement |
| la-fattoria-rotated | alcohol | A. Production baseline | candidate-filtering-failure | region-coverage-failure | ocr-recognition-failure | regression |
| approved-wine-054 | brand | B. Human-targeted crop | candidate-filtering-failure | correct-uncertainty | not-applicable | annotation uncertainty, filtering recovery, full-image scaling loss, surrounding-text interference, wrong-region coverage |
| approved-wine-054 | alcohol | A. Production baseline | ocr-recognition-failure | ocr-recognition-failure | not-applicable | annotation uncertainty, no improvement |
| patricia-green-cellars | brand | A. Production baseline | correct-uncertainty | candidate-generation-failure | not-applicable | annotation uncertainty, regression |
| patricia-green-cellars | alcohol | A. Production baseline | candidate-filtering-failure | region-coverage-failure | not-applicable | annotation uncertainty, regression |
| wine-multi-artifact-04 | brand | A. Production baseline | ocr-recognition-failure | candidate-generation-failure | not-applicable | no improvement |
| wine-multi-artifact-04 | alcohol | A. Production baseline | candidate-filtering-failure | ocr-recognition-failure | not-applicable | regression |
| approved-wine-095 | brand | A. Production baseline | correct | not-applicable | not-applicable | no improvement |
| approved-wine-095 | alcohol | A. Production baseline | candidate-filtering-failure | region-coverage-failure | not-applicable | annotation uncertainty, regression |

## Regressions

| Case | Field | Scenario | Baseline | Counterfactual |
| --- | --- | --- | --- | --- |
| wine-multi-artifact-09 | brand | B. Human-targeted crop | correct | ocr-recognition-failure |
| wine-multi-artifact-09 | alcohol | B. Human-targeted crop | correct | ocr-recognition-failure |
| approved-wine-022 | alcohol | B. Human-targeted crop | correct | candidate-filtering-failure |
| three-steves-winery | brand | B. Human-targeted crop | correct | ocr-recognition-failure |
| approved-wine-006 | brand | B. Human-targeted crop | candidate-filtering-failure | candidate-generation-failure |
| alfredos-wine | brand | B. Human-targeted crop | candidate-filtering-failure | ocr-recognition-failure |
| alfredos-wine | alcohol | B. Human-targeted crop | candidate-filtering-failure | ocr-recognition-failure |
| luigi-giovanni-live | brand | B. Human-targeted crop | candidate-filtering-failure | ocr-recognition-failure |
| approved-wine-013 | alcohol | B. Human-targeted crop | candidate-filtering-failure | region-coverage-failure |
| approved-wine-035 | alcohol | C. Canonically rotated crop | ocr-recognition-failure | region-coverage-failure |
| la-fattoria-rotated | alcohol | B. Human-targeted crop | candidate-filtering-failure | region-coverage-failure |
| la-fattoria-rotated | alcohol | C. Canonically rotated crop | candidate-filtering-failure | ocr-recognition-failure |
| patricia-green-cellars | brand | B. Human-targeted crop | correct-uncertainty | candidate-generation-failure |
| patricia-green-cellars | alcohol | B. Human-targeted crop | candidate-filtering-failure | region-coverage-failure |
| wine-multi-artifact-04 | alcohol | B. Human-targeted crop | candidate-filtering-failure | ocr-recognition-failure |
| approved-wine-095 | alcohol | B. Human-targeted crop | candidate-filtering-failure | region-coverage-failure |

## Latency

| Scenario | Executed fields | Median latency | p95 latency | Median OCR | Median preprocess |
| --- | --- | --- | --- | --- | --- |
| A. Production baseline | 26 | 2425 ms | 4672 ms | 1878 ms | 195 ms |
| B. Human-targeted crop | 23 | 143 ms | 414 ms | 121 ms | 44 ms |
| C. Canonically rotated crop | 2 | 59 ms | 126 ms | 33 ms | 12 ms |

## Production Boundary

- Benchmark modules: src/fixtures/eval/ocr-region-benchmark.annotations.ts, src/fixtures/eval/ocr-region-benchmark.ts
- Guard tests: src/fixtures/truth-boundary.test.ts, src/fixtures/eval/eval-boundary.test.ts
- Proof note: All benchmark annotations and report code live under src/fixtures/eval and remain covered by the existing evaluation-only import guards.
