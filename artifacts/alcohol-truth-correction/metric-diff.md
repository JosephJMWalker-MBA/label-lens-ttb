# Metric delta attributable solely to corrected truth

Machine behaviour did not change: no production source file was modified, and a
per-case comparison of every observation state and value across the 115-case
corpus shows **0 machine-output changes**. Every metric movement below comes from
the benchmark becoming more accurate.

| Metric | Before | After | Δ |
|---|---|---|---|
| Present / absent alcohol | 102 / 13 | 103 / 12 | +1 / −1 |
| Alcohol detection recall | 69/102 = 67.6 % | 70/103 = **68.0 %** | +0.4 pts |
| Alcohol parsed-value accuracy | 65/102 = 63.7 % | 68/103 = **66.0 %** | +2.3 pts |
| Repository false certainty | 1 | **0** | −1 |
| Parser failures | 4 | **2** | −2 |
| Absent-alcohol false positives | 1 | **0** | −1 |
| Brand exact / normalized / false certainty | 27 / 29 / 0 | 27 / 29 / 0 | **unchanged** |

State histogram is **identical** before and after — `OBSERVED` 64,
`LOW_CONFIDENCE` 6, `NOT_OBSERVED` 45 — which is the clearest single proof that
the machine did not change.

Failure-class histogram: `correct` 77 → **80**, `parser-failure` 4 → **2**,
`false-certainty` 1 → **0** (class eliminated). `candidate-filtering-failure` 27,
`ocr-recognition-failure` 5, `candidate-generation-failure` 1 all unchanged.

## Exact reclassification

| Case | Before | After | Observation (unchanged) | Corrected truth |
|---|---|---|---|---|
| `approved-wine-043` | `parser-failure` | `correct` | `13.8% BY VOL.`, OBSERVED | 13.8 |
| `wine-multi-artifact-06` | `parser-failure` | `correct` | `13.5% BY VOL.`, OBSERVED | 13.5 |
| `wine-multi-artifact-07` | `false-certainty` | `correct` | `12% ALC./VOL.`, OBSERVED | 12 (present) |

## Against the read-only projection

| Projection | Actual | Match |
|---|---|---|
| false certainty 1 → 0 | 1 → 0 | ✅ |
| parser failures 4 → 2 | 4 → 2 | ✅ |
| parsed accuracy ~63.7 % → 66.0 % | 63.7 % → 66.0 % | ✅ |
| absent-alcohol FPs 1 → 0 | 1 → 0 | ✅ |

The projection was not used to steer the result; the measured values are reported
as produced and happen to match.

## Determinism

The post-correction corpus evaluation was run twice and compared per case on
alcohol observation state and value: **115 cases, 0 differences.**
