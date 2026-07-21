# wine-multi-artifact-05 — false alarm, now eliminated

**Visible (independent read of `crops/wine-multi-artifact-05-tokenUnion-x6.png`):
`ALC 13.5 % BY VOL`.** The production value **13.5 is visibly correct**; the
recorded truth (13.5) is visibly correct. **No truth review is needed.**

| | |
|---|---|
| Selected | `ALC 135 BY VOL` → `ALCOHOL 13.5 BY VOLUME`, `explicit-percentless-alcohol-by-volume`, ops **`implicit-decimal-recovery`**, token confs 91/95/58/92 |
| Crop A | (73,928) **105×15 px** — the smallest alcohol statement in the corpus; glyph height ~7 px |
| Re-read psm 8 | `ALC 135% BY VOL` → **13.5** (OBSERVED) |
| Re-read psm 11 | `ALC 135% BY VOL` → **13.5** (OBSERVED) |
| Re-read line band psm 7 | `ALC 135% BY VOL - 750 mil CONTENT` → **13.5** (OBSERVED) |

## Why the old control said "contradiction"

Identical mechanism to `approved-wine-031`: the re-read text `135%` was parsed by
the naive regex as **35**. Under production parsing **all three re-reads return
13.5 — full agreement with the selected value.** This case was never a
contradiction; it is in fact one of the strongest *corroborations* in the corpus
(re-read confidences 80–90).

## Note on the selected reading

The primary full-image pass lost **both** the decimal point and the `%`
(`ALC 135 BY VOL`), and the correct value was restored by
`implicit-decimal-recovery`. The re-reads recover the `%` and still lose the
decimal. At 7-pixel glyph height the decimal point is at or below the engine's
resolution limit; `implicit-decimal-recovery` is doing real work here, and any
trigger that treated implicit decimals as suspect would put this correct case at
risk (see `T3` in `../narrower-trigger-results.json`).
