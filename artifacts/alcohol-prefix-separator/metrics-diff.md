# Corpus metric diff — fused alcohol-prefix separator

Both runs executed the **real extractor** over the full fixed manifest on the same
machine. Baseline was produced with the production edit stashed (verified absent),
treatment with it restored (verified present).

## Headline

| Metric | Baseline | Treatment | Δ |
|---|---|---|---|
| Total evaluated cases | 115 | 115 | 0 |
| Present-alcohol cases | 102 | 102 | 0 |
| Absent-alcohol cases | 13 | 13 | 0 |
| **Alcohol detection recall** | 62/102 = **60.8 %** | 68/102 = **66.7 %** | **+6 cases, +5.9 pts** |
| **Alcohol parsed-value accuracy** | 58/102 = **56.9 %** | 64/102 = **62.7 %** | **+6 cases, +5.8 pts** |
| **Alcohol false certainty** | 5 | 5 | **0** |
| **Absent-alcohol false positives** | 1 | 1 | **0** |
| Brand exact match | 27 | 27 | 0 |
| Brand normalized match | 29 | 29 | 0 |
| Latency median | 1710 ms | 1419 ms | −291 ms |
| Latency p95 | 4943 ms | 4981 ms | +38 ms (noise) |

False certainty is counted as `OBSERVED` alcohol that is inaccurate against truth,
plus any accepted statement on a label with no alcohol statement. The single
absent-alcohol false positive exists in **both** runs — it is pre-existing and
untouched by this change.

The median latency *drop* is a second-order effect, not a target: recovery passes
are triggered by `NOT_OBSERVED`, so six cases that now resolve on the primary pass
no longer run 2–3 extra OCR passes.

## State histogram

| Alcohol state | Baseline | Treatment | Δ |
|---|---|---|---|
| `OBSERVED` | 59 | 63 | +4 |
| `LOW_CONFIDENCE` | 4 | 6 | +2 |
| `NOT_OBSERVED` | 52 | 46 | −6 |

## Changed labels — all six, all improvements

| Case | Truth | State before → after | Value before → after | Correct? |
|---|---|---|---|---|
| `approved-wine-055` | 13 | `NOT_OBSERVED` → `OBSERVED` | — → `13% ALC./VOL.` | ✅ |
| `approved-wine-077` | 13.5 | `NOT_OBSERVED` → `OBSERVED` | — → `13.5% ALC./VOL.` | ✅ |
| `approved-wine-095` | 12 | `NOT_OBSERVED` → `OBSERVED` | — → `12% ALC./VOL.` | ✅ |
| `approved-wine-096` | 12 | `NOT_OBSERVED` → `OBSERVED` | — → `12% ALC./VOL.` | ✅ |
| `approved-wine-097` | 12 | `NOT_OBSERVED` → `LOW_CONFIDENCE` | — → `12% ALC./VOL.` | ✅ |
| `patricia-green-cellars` | 13.8 | `NOT_OBSERVED` → `LOW_CONFIDENCE` | — → `13.8% ALC./VOL.` | ✅ |

- **Regressions: 0.** No currently-correct label changed.
- **Brand changes: 0.**
- **Absent-alcohol cases among the changes: 0.**

Two of the six land in `LOW_CONFIDENCE` rather than `OBSERVED`. That is the
intended conservative behaviour: the value is correct, but the OCR token
confidence is low, so uncertainty stays visible rather than being asserted away.

## Predicted vs actual

The read-only simulation predicted exactly six cases:
`patricia-green-cellars`, `approved-wine-055`, `approved-wine-077`,
`approved-wine-095`, `approved-wine-096`, `approved-wine-097`.

The corpus changed exactly those six — **no unpredicted case changed, and no
predicted case failed to change**. The simulation is corroborated by, not
substituted for, the corpus measurement.

## Determinism

The treatment corpus run was executed twice and compared field-by-field on
alcohol and brand output, excluding `latencyMs`:
**115 cases compared, 0 non-deterministic.**

## Success criteria

| # | Criterion | Result |
|---|---|---|
| 1 | ≥ 5 of 6 expected cases correctly detected/parsed | **6 of 6** ✅ |
| 2 | No currently-correct case regresses | 0 regressions ✅ |
| 3 | Absent-alcohol false positives do not increase | 1 → 1 ✅ |
| 4 | False certainty not materially increased | 5 → 5 ✅ |
| 5 | No evidentiary requirement weakened | volume gate and parser untouched ✅ |
| 6 | Deterministic across repeated runs | 0/115 differences ✅ |

No kill criterion triggered.
