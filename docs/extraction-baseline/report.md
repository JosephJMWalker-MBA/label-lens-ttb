# Extraction accuracy baseline (Issue #57)

Measured with the evaluation harness against the current production extractor `local-two-field-extractor@1.0.0`. This report is generated (`npm run eval:baseline`) and committed as a point-in-time baseline. Latencies are environment-dependent; all other figures are deterministic given fixed OCR output.

## Aggregate metrics

| Metric | Value | Denominator |
| --- | --- | --- |
| Brand exact match | 42% | 12 determinate |
| Brand normalized-acceptable match | 42% | 12 determinate |
| Brand top-3 recall | 50% | 12 determinate |
| Alcohol detection recall | 36% | 14 present |
| Alcohol parsed-value accuracy | 36% | 14 present |
| Absent-field false-positive rate | 0% | 1 absent |
| Ambiguity honesty (deferred when ambiguous) | 100% | 3 ambiguous |
| Median latency | 1291 ms | 15 cases |
| p95 latency | 2242 ms | 15 cases |

**Brand failure classes:** correct-uncertainty: 8, candidate-filtering-failure: 5, candidate-ranking-failure: 1, ocr-recognition-failure: 1

**Alcohol failure classes:** correct: 6, candidate-generation-failure: 5, ocr-recognition-failure: 4

## Per-case results

| Case | Strata | Brand state → selected | Brand class | Alcohol state → value | Alcohol class | ms |
| --- | --- | --- | --- | --- | --- | --- |
| m-cellars-baseline | multiple-brand-like-phrases; alcohol-at-bottom; genuinely-ambiguous | AMBIGUOUS → "om" | correct-uncertainty | OBSERVED → "12.5% ALC./VOL." | correct | 1395 |
| luigi-giovanni-live | decorative-or-script-brand; brand-punctuation; multiple-brand-like-phrases; alcohol-at-side-or-rotated | AMBIGUOUS → "Pir" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1057 |
| alfredos-wine | multi-line-brand; brand-punctuation; alcohol-at-bottom | AMBIGUOUS → "HLTRE" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 974 |
| la-fattoria-rotated | decorative-or-script-brand; vertical-mandatory-strip; alcohol-at-side-or-rotated | AMBIGUOUS → "x Om BARBERA" | ocr-recognition-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1241 |
| casanova-della-spinetta | multi-line-brand; low-contrast; split-alcohol-tokens | AMBIGUOUS → "Ji Jl" | candidate-filtering-failure | NOT_OBSERVED → ∅ | candidate-generation-failure | 1343 |
| domaine-follin-arbelet | brand-punctuation; multiple-brand-like-phrases; alcohol-at-bottom | AMBIGUOUS → "Aloxe-Corton" | candidate-ranking-failure | OBSERVED → "14% BY VOL." | correct | 936 |
| patricia-green-cellars | low-contrast; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom | AMBIGUOUS → "NEWBERG OREGON - 503.554.0821" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1293 |
| saker | simple-centered-brand; low-contrast | AMBIGUOUS → "SAKER" | correct-uncertainty | NOT_OBSERVED → ∅ | candidate-generation-failure | 1291 |
| nebla-mencia | simple-centered-brand; alcohol-at-bottom | AMBIGUOUS → "NEBLA" | correct-uncertainty | OBSERVED → "13% BY VOL." | correct | 1603 |
| chateau-bonneau | brand-punctuation; multi-line-brand; low-contrast | AMBIGUOUS → "I Il" | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1346 |
| le-temps-des-fleurs | simple-centered-brand; alcohol-at-bottom | AMBIGUOUS → "LE TEMPS DES FLEURS" | correct-uncertainty | OBSERVED → "11.5% BY VOL." | correct | 936 |
| three-steves-winery | missing-alcohol-statement; multiple-brand-like-phrases | AMBIGUOUS → "3 STEVES WINERY" | correct-uncertainty | NOT_OBSERVED → ∅ | correct | 2242 |
| altacima | brand-punctuation; low-contrast; alcohol-at-bottom | AMBIGUOUS → "ALTACIMA 4.090" | correct-uncertainty | NOT_OBSERVED → ∅ | ocr-recognition-failure | 2229 |
| le-caniette | multi-line-brand; split-alcohol-tokens; alcohol-at-bottom | AMBIGUOUS → "HEALTH PROBLEMS." | candidate-filtering-failure | NOT_OBSERVED → ∅ | ocr-recognition-failure | 1056 |
| amuninni-ferracane | decorative-or-script-brand; multiple-brand-like-phrases; genuinely-ambiguous; alcohol-at-bottom | AMBIGUOUS → "INV ENVY" | correct-uncertainty | OBSERVED → "12.5% By Vol." | correct | 829 |
