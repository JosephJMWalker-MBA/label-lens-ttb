# Bounded Brand fixed local-contrast experiment

- Base SHA: `2dcc26f633199ad6ff5ab71857505edfced84981`
- Experiment design: one-variable-at-a-time
- Changed variables: `localContrast`
- Treatment: Sharp `clahe({ width: 3, height: 3, maxSlope: 3 })`
- Governed regions: 11
- Behavior reproducible: true

## Platform preflight

Before preregistration and treatment, merged main's no-op, fixed 3× control, and PR #198 sharpening experiment were rerun. The no-op produced zero behavioral deltas. The control behavior hash remained `b3db6f91ea925a60aee0adc043994a5fef1e57df3cb6df03860f038cc16ffb41`, sharpening behavior hashes reproduced, production had no research-runner import edge, guarded extractor hashes matched, and PR #195 remained a separate untouched draft.

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
| Empty OCR | 0 (0.0%) | 0 (0.0%) |
| Correct but conservative | 0 | 0 |
| OCR recognition misses | 11 | 11 |
| Grouping/ranking misses | 0 | 0 |
| Median latency (ms) | 79.63 | 332.75 |
| P95 latency (ms) | 226.97 | 605.30 |

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
| Empty OCR | 0 (0.0%) | 0 (0.0%) |
| Correct but conservative | 0 | 0 |
| OCR recognition misses | 11 | 11 |
| Grouping/ranking misses | 0 | 0 |
| Median latency (ms) | 113.37 | 333.28 |
| P95 latency (ms) | 220.43 | 606.41 |

## Family analysis

- Improvement checksum families: none
- Improvement independence families: none
- Regression checksum families: none
- Regression independence families: none

## Per-case comparison

| Case | Control selected | Treatment selected | Improved | Regressed | Became empty | Mechanism |
| --- | --- | --- | --- | --- | --- | --- |
| approved-wine-004 | FAT TORIA |  | false | false | false | `CLAHE_CREATED_ARTIFACT` |
| approved-wine-005 | GATT | Sa, Tre | false | false | false | `CLAHE_CREATED_ARTIFACT` |
| approved-wine-023 |  |  | false | false | false | `CLAHE_CREATED_ARTIFACT` |
| approved-wine-027 |  |  | false | false | false | `CLAHE_CREATED_ARTIFACT` |
| approved-wine-031 | enheesO |  | false | false | false | `CLAHE_CREATED_ARTIFACT` |
| approved-wine-035 | Hokoniites |  | false | false | false | `CLAHE_AMPLIFIED_BACKGROUND_TEXTURE` |
| approved-wine-085 | AH sasaki |  | false | false | false | `CLAHE_AMPLIFIED_BACKGROUND_TEXTURE` |
| approved-wine-091 |  |  | false | false | false | `CLAHE_CREATED_ARTIFACT` |
| la-fattoria-rotated | FAT TORIA |  | false | false | false | `CLAHE_CREATED_ARTIFACT` |
| wine-multi-artifact-04-region-1 |  |  | false | false | false | `CLAHE_CREATED_ARTIFACT` |
| wine-multi-artifact-04-region-2 | Colles |  | false | false | false | `CLAHE_CREATED_ARTIFACT` |

## Preregistered criteria

| Criterion | Result |
| --- | --- |
| atLeastTwoRegionsImprove | FAIL |
| atLeastTwoChecksumFamiliesImprove | FAIL |
| atLeastTwoIndependenceFamiliesImprove | FAIL |
| normalizedTop1AccuracyImproves | FAIL |
| candidateListOrTop3RecallImproves | FAIL |
| noPreviouslyCorrectRegionRegresses | PASS |
| falseReliableReadsRemainZero | PASS |
| wrongReliableReadsRemainZero | PASS |
| emptyOcrDoesNotIncrease | PASS |
| noCleanHighContrastRegression | PASS |
| latencyWithinCeilings | FAIL |
| reproducible | PASS |
| onlyLocalContrastChanged | PASS |
| claheAndSharpeningNotCombined | PASS |
| sellerTruthNotPassedToOcr | PASS |
| noProductionOrPr195PathChanges | PASS |

## Kill reasons

- zero or one governed region improved
- improvement did not span two source checksum families
- improvement did not span two independence families
- normalized top-one accuracy did not improve in both runs
- candidate-list or top-three truth recall did not improve in both runs
- median or p95 latency exceeded a preregistered ceiling

## Decision

`KILL`

## One next recommendation

Otsu thresholding: run one separately preregistered treatment using the runner's deterministic Otsu threshold after the same 3x grayscale/normalise control, with no CLAHE or sharpening.

No second treatment was run in this task.
