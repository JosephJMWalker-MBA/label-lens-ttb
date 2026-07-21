# approved-wine-037 — the only genuine contradiction

**Visible (independent read of `crops/approved-wine-037-tokenUnion-x6.png`):
`13.0 % by volume`,** light-on-dark, large numerals, decimal point clearly
present. The production value **19.0 is visibly wrong.** Recorded truth 13.0 is
visibly correct.

| | |
|---|---|
| Selected | `19.0 % by volume` → `19.0% BY VOL.`, `explicit-percent-by-volume`, ops `split-decimal-merge`, token confs 79/90/96/95, state **OBSERVED** |
| Crop A | (138,765) 213×70, mean 22, stdev 34, range 134, **light-on-dark** |
| Re-read psm 8 | `13.0 Hoare` → numeral **13.0**; no accepted statement (NOT_OBSERVED) |
| Re-read psm 11 | `13.0 i) by volume --—_rm` → numeral **13.0**; no accepted statement |
| Re-read line band psm 7 | `I Alcohol \| 3.0 i by volume \|` → numeral **3.0**; no accepted statement |

## What the contradiction actually is

It is a **numeral-level** contradiction, not a statement-level one. Both
token-union re-reads recognise `13.0` with an explicit decimal separator and no
implicit-decimal recovery, and both disagree with the selected `19.0`. Neither
re-read assembles an *accepted* alcohol statement, because the `%` degrades to
`i)` and the surrounding words are noisy — so the production selector abstains on
the re-read.

This matters for any implementation: the signal must compare **the numeral
recognized in the accepted candidate's own pixels**, not "a second complete
statement". Requiring a complete re-read statement (`T4`) loses this case
entirely.

## Why the line band disagrees with both

The full-width band re-introduces the neighbouring government-warning text and
segments `13.0` as `| 3.0` — the leading `1` becomes a bar glyph. The line band is
therefore **not** usable as the second geometry (`T6` fires zero times).
