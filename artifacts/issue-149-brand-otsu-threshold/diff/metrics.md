# Bounded Brand automatic Otsu-threshold experiment

- Base SHA: `f269a3c78b1053638e2bdae36c3f9f6b29423590`
- Experiment design: one-variable-at-a-time
- Changed variables: `thresholdMethod`
- Treatment: custom `histogram-between-class-variance-lower-tie-single-channel-v1`
- Governed regions: 11
- Behavior reproducible: true

## Implementation gate

The treatment uses the evaluation-only repository functions
`selectOtsuThreshold` and `binarizeGrayscaleWithOtsu`. The former builds a
256-bin grayscale histogram and maximizes
`wB * wF * (meanB - meanF)^2`, using strict-greater comparison so the lowest
threshold wins ties. The latter emits one-channel bytes with
`value > threshold ? 255 : 0`. Empty or uniform input fails closed. The Otsu
branch contains no Sharp threshold call, no fixed/adaptive threshold, no CLAHE,
no sharpening, and no inversion.

## Platform preflight

Before preregistration and treatment, current main's no-op, fixed 3× control,
and merged PR #199 CLAHE experiment were rerun. The no-op produced zero
behavioral deltas; the known control behavior hash reproduced; CLAHE behavior
hashes reproduced; guarded extractor hashes matched; production had no
research-runner import edge; and PR #195 remained a separate untouched draft.

## Primary aggregate metrics

| Metric | Control | Treatment |
| --- | ---: | ---: |
| Exact top-1 accuracy | 0.0% | 0.0% |
| Normalized top-1 accuracy | 0.0% | 0.0% |
| Raw OCR truth recall | 0.0% | 0.0% |
| Candidate-list truth recall | 0.0% | 0.0% |
| Top-3 truth recall | 0.0% | 0.0% |
| False reliable reads | 0 | 0 |
| Wrong reliable reads | 0 | 0 |
| Empty OCR | 0 (0.0%) | 1 (9.1%) |
| Correct but conservative | 0 | 0 |
| OCR recognition misses | 11 | 10 |
| Grouping/ranking misses | 0 | 0 |
| Median latency (ms) | 80.39 | 64.86 |
| P95 latency (ms) | 228.75 | 419.82 |

## Deterministic repeat aggregate metrics

| Metric | Control | Treatment |
| --- | ---: | ---: |
| Exact top-1 accuracy | 0.0% | 0.0% |
| Normalized top-1 accuracy | 0.0% | 0.0% |
| Raw OCR truth recall | 0.0% | 0.0% |
| Candidate-list truth recall | 0.0% | 0.0% |
| Top-3 truth recall | 0.0% | 0.0% |
| False reliable reads | 0 | 0 |
| Wrong reliable reads | 0 | 0 |
| Empty OCR | 0 (0.0%) | 1 (9.1%) |
| Correct but conservative | 0 | 0 |
| OCR recognition misses | 11 | 10 |
| Grouping/ranking misses | 0 | 0 |
| Median latency (ms) | 80.57 | 49.01 |
| P95 latency (ms) | 221.00 | 417.28 |

## Latency ratios

- Primary median: 0.807×
- Primary p95: 1.835×
- Repeat median: 0.608×
- Repeat p95: 1.888×

## Family analysis

- Improvement checksum families: none
- Improvement independence families: none
- Regression checksum families: sha256:445d39b8f73d04cd05bb35e03f9678f6ba9e81f6a6f01d5469306ec43c9c5887
- Regression independence families: dry-cellar

## Per-case comparison

| Case | Control selected | Treatment selected | Improved | Regressed | Became empty | Mechanism |
| --- | --- | --- | --- | --- | --- | --- |
| approved-wine-004 | FAT TORIA | FATTORIA | false | false | false | `OTSU_REMOVED_BACKGROUND_NOISE` |
| approved-wine-005 | GATT | GATT | false | false | false | `OTSU_CHANGED_CONFIDENCE_ONLY` |
| approved-wine-023 |  | nC alertett | false | false | false | `OTSU_FRAGMENTED_CHARACTERS` |
| approved-wine-027 |  |  | false | false | false | `OTSU_LOST_THIN_STROKES` |
| approved-wine-031 | enheesO | enheesO | false | false | false | `OTSU_CHANGED_CONFIDENCE_ONLY` |
| approved-wine-035 | Hokoniites | THortiont Lrg | false | false | false | `OTSU_REMOVED_BACKGROUND_NOISE` |
| approved-wine-085 | AH sasaki |  | false | false | false | `OTSU_FRAGMENTED_CHARACTERS` |
| approved-wine-091 |  |  | false | false | false | `OTSU_CHANGED_CONFIDENCE_ONLY` |
| la-fattoria-rotated | FAT TORIA | FATTORIA | false | false | false | `OTSU_REMOVED_BACKGROUND_NOISE` |
| wine-multi-artifact-04-region-1 |  |  | false | true | true | `OTSU_CAUSED_EMPTY_OCR` |
| wine-multi-artifact-04-region-2 | Colles | Colla | false | false | false | `OTSU_FRAGMENTED_CHARACTERS` |

## Preregistered criteria

| Criterion | Result |
| --- | --- |
| atLeastTwoRegionsImprove | FAIL |
| atLeastTwoChecksumFamiliesImprove | FAIL |
| normalizedTop1AccuracyImproves | FAIL |
| candidateListOrTop3RecallImproves | FAIL |
| noPreviouslyCorrectRegionRegresses | PASS |
| falseReliableReadsRemainZero | PASS |
| wrongReliableReadsRemainZero | PASS |
| emptyOcrDoesNotIncrease | FAIL |
| noCleanHighContrastRegression | FAIL |
| latencyWithinCeilings | FAIL |
| reproducible | PASS |
| controlBaselineReproduced | PASS |
| onlyThresholdMethodChanged | PASS |
| otsuNotCombinedWithClaheOrSharpening | PASS |
| sellerTruthNotPassedToOcr | PASS |
| noProductionOrPr195PathChanges | PASS |
| implementationVerified | PASS |

## Kill reasons

- zero or one governed region improved
- improvement did not span two source checksum families
- normalized top-one accuracy did not improve in both runs
- candidate-list or top-three truth recall did not improve in both runs
- empty OCR increased
- a clean-background or high-contrast case materially regressed
- median or p95 latency exceeded a preregistered ceiling

## Decision

`KILL`

## One next recommendation

Adaptive thresholding: preregister one evaluation-only, default-off treatment on the same locked corpus and control, with an exact local-window algorithm and parameters frozen before any OCR output.

No second treatment was run in this task.
