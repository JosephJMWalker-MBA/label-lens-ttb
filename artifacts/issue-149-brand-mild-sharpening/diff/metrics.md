# Bounded Brand mild-sharpening experiment

- Base SHA: `4aac539c7d314cc0d57ed168e270f5191bed161d`
- Experiment design: one-variable-at-a-time
- Changed variables: `sharpening`
- Sharpening: Sharp `sharpen({ sigma: 1, m1: 1, m2: 2, x1: 2, y2: 10, y3: 20 })`
- Governed regions: 11
- Behavior reproducible: true

## Platform preflight

Before treatment, the merged no-op was rerun at base `4aac539c7d314cc0d57ed168e270f5191bed161d`. Control and identical treatment both produced behavior hash `b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41`, zero behavioral deltas, 0/11 correct, 11/11 failures, and zero false reliable reads. This reproduces the fixed 3× control. Repository import inspection found no production import edge from `src/fixtures/ocr-research`.

## Primary aggregate metrics

| Metric | Control | Treatment |
| --- | ---: | ---: |
| Exact top-1 accuracy | 0.0% | 0.0% |
| Normalized top-1 accuracy | 0.0% | 0.0% |
| Raw OCR truth recall | 0.0% | 0.0% |
| Candidate-list truth recall | 0.0% | 0.0% |
| Top-3 truth recall | 0.0% | 0.0% |
| False reliable reads | 0 | 0 |
| Empty OCR | 0 | 1 |
| Wrong reliable reads | 0 | 0 |
| Correct but conservative | 0 | 0 |
| Median latency (ms) | 80.57 | 93.33 |
| P95 latency (ms) | 230.31 | 270.74 |

## Deterministic repeat aggregate metrics

| Metric | Control | Treatment |
| --- | ---: | ---: |
| Exact top-1 accuracy | 0.0% | 0.0% |
| Normalized top-1 accuracy | 0.0% | 0.0% |
| Raw OCR truth recall | 0.0% | 0.0% |
| Candidate-list truth recall | 0.0% | 0.0% |
| Top-3 truth recall | 0.0% | 0.0% |
| False reliable reads | 0 | 0 |
| Empty OCR | 0 | 1 |
| Wrong reliable reads | 0 | 0 |
| Correct but conservative | 0 | 0 |
| Median latency (ms) | 80.15 | 94.06 |
| P95 latency (ms) | 219.95 | 271.43 |

## Per-case comparison

| Case | Control selected | Treatment selected | Improved | Regressed | Became empty | Mechanism |
| --- | --- | --- | --- | --- | --- | --- |
| approved-wine-004 | FAT TORIA | FAT TORIA | false | false | false | `SHARPENING_CHANGED_CONFIDENCE_ONLY` |
| approved-wine-005 | GATT | GATT | false | false | false | `SHARPENING_CHANGED_CONFIDENCE_ONLY` |
| approved-wine-023 |  |  | false | false | false | `SHARPENING_RECOVERED_CHARACTER` |
| approved-wine-027 |  | AEE EEE | false | false | false | `UNDETERMINED` |
| approved-wine-031 | enheesO | enheesO | false | false | false | `SHARPENING_CHANGED_CONFIDENCE_ONLY` |
| approved-wine-035 | Hokoniites | Hotoni | false | false | false | `SHARPENING_RECOVERED_CHARACTER` |
| approved-wine-085 | AH sasaki |  | false | false | false | `UNDETERMINED` |
| approved-wine-091 |  |  | false | false | false | `SHARPENING_CHANGED_CONFIDENCE_ONLY` |
| la-fattoria-rotated | FAT TORIA | FAT TORIA | false | false | false | `SHARPENING_CHANGED_CONFIDENCE_ONLY` |
| wine-multi-artifact-04-region-1 |  |  | false | false | false | `SHARPENING_CHANGED_CONFIDENCE_ONLY` |
| wine-multi-artifact-04-region-2 | Colles |  | false | false | true | `SHARPENING_CAUSED_EMPTY_OCR` |

## Preregistered criteria

| Criterion | Result |
| --- | --- |
| atLeastTwoRegionsImprove | FAIL |
| noPreviouslyCorrectRegionRegresses | PASS |
| falseReliableReadsRemainZero | PASS |
| wrongReliableReadsRemainZero | PASS |
| emptyOcrDoesNotIncrease | FAIL |
| normalizedTop1AccuracyImproves | FAIL |
| improvementsCrossIndependentFamilies | FAIL |
| latencyWithinCeilings | PASS |
| noProductionCodePathChanges | PASS |
| onlySharpeningChanged | PASS |
| sellerTruthNotPassedToOcr | PASS |
| noCleanSliceDegradation | PASS |
| reproducible | PASS |

## Kill reasons

- zero or one governed region improved
- empty OCR increased
- normalized top-1 accuracy did not improve
- improvements did not span at least two duplicate/checksum families

## Decision

`KILL`

The one permitted follow-up recommendation is **local contrast enhancement**, as a separately preregistered one-variable experiment. No second treatment was run here.
