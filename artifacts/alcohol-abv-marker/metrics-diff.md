# Corpus metric diff — ABV as explicit alcohol-by-volume (C3)

Both runs used the real extractor over the full fixed manifest on the same
machine. Baseline was produced with the production edit stashed (verified: 0
occurrences of `expand-abv`), treatment with it restored (verified: 2).

Base commit `5edec00` already contains C1 (PR #150), so these deltas are ABV only.

| Metric | Baseline | Treatment | Δ |
|---|---|---|---|
| Total evaluated cases | 115 | 115 | 0 |
| Present-alcohol cases | 102 | 102 | 0 |
| Absent-alcohol cases | 13 | 13 | 0 |
| **Alcohol detection recall** | 68/102 = **66.7 %** | 69/102 = **67.6 %** | **+1 case** |
| **Alcohol parsed-value accuracy** | 64/102 = **62.7 %** | 65/102 = **63.7 %** | **+1 case** |
| **Alcohol false certainty** | 5 | 5 | **0** |
| **Absent-alcohol false positives** | 1 | 1 | **0** |
| Brand exact match | 27 | 27 | 0 |
| Brand normalized match | 29 | 29 | 0 |
| Latency median | 1401 ms | 1390 ms | −11 ms |
| Latency p95 | 4768 ms | 4727 ms | −41 ms |

The single absent-alcohol false positive is present in **both** runs; it is
pre-existing and untouched.

## State histogram

| Alcohol state | Baseline | Treatment | Δ |
|---|---|---|---|
| `OBSERVED` | 63 | 64 | +1 |
| `LOW_CONFIDENCE` | 6 | 6 | 0 |
| `NOT_OBSERVED` | 46 | 45 | −1 |

## Changed labels

| Case | Truth | State before → after | Value before → after | Correct? |
|---|---|---|---|---|
| `approved-wine-013` | 13.5 | `NOT_OBSERVED` → `OBSERVED` | — → `13.5% BY VOL.` | ✅ |

- **Regressions: 0** — no currently-correct label changed.
- **Brand changes: 0.**
- **Absent-alcohol cases among the changes: 0.**
- **Unpredicted changes: 0** — the simulation named exactly `approved-wine-013`,
  and exactly that case changed.

## Determinism

Treatment run twice and compared field-by-field on alcohol and brand output,
excluding `latencyMs`: **115 cases compared, 0 non-deterministic.**

## Success criteria

| # | Criterion | Result |
|---|---|---|
| 1 | `approved-wine-013` correctly detected and parsed | ✅ `13.5% BY VOL.`, matches truth 13.5 |
| 2 | No currently-correct case changes incorrectly | ✅ 0 regressions |
| 3 | No absent-alcohol case gains an accepted candidate | ✅ 1 → 1, unchanged |
| 4 | Alcohol false certainty does not increase | ✅ 5 → 5 |
| 5 | Bare/malformed ABV text remains rejected | ✅ covered by 13 negative controls |
| 6 | Existing accepted alcohol forms unchanged | ✅ `% BY VOL`, `% ALC./VOL.`, fused `ALC.13%` all unchanged |
| 7 | Deterministic outputs stable | ✅ 0/115 differences |

No kill criterion triggered.
