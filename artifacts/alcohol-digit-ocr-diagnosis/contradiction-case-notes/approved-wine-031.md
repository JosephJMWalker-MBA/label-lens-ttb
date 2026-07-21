# approved-wine-031 — false alarm, now eliminated

**Visible (independent read of `crops/approved-wine-031-tokenUnion-x6.png`, not
using stored truth or OCR output): `Alc. 13.5% by Vol`.** Dark-on-light,
condensed grotesque, crisp. The production value **13.5 is visibly correct**.
The recorded truth (13.5) is visibly correct. **No truth review is needed.**

| | |
|---|---|
| Selected | `Alc. 13.5% by Vol` → `13.5% ALC./VOL.`, `explicit-percent-alc-vol`, ops `split-decimal-merge`, token confs 89/58/94/67 |
| Crop A | (22,1077) 223×94, mean 224, stdev 63, dark-on-light |
| Re-read psm 8 | `He f35hiyi` → **no accepted candidate** (NOT_OBSERVED), mean conf 30 |
| Re-read psm 11 | `GONINS SUINIES Ne. 135% by Vol` → **13.5** (OBSERVED, via `implicit-decimal-recovery`) |
| Re-read line band psm 7 | `Ae 1355 yo esr BATAAN` → no accepted candidate |

## Why the old control said "contradiction"

The psm-11 re-read emitted `135%`. The naive regex `(\d{1,2}(?:[.,]\d{1,2})?)\s*%`
cannot match `135%` at the leading digit, backtracks, and matches `35%` → **35**.
The production parser instead applies `implicit-decimal-recovery` and reads
**13.5** — the same value production selected. The disagreement was in the
measuring instrument, not in the pixels.

## Why the re-read still loses the decimal

The decimal point is a small, low-contrast dot in a tightly-kerned condensed
face. The tight crop is also clipped on the right (`N` of `Net`) and includes the
`Contains Sulfites` line above, so psm 8 (single word) has no coherent word to
lock onto and returns noise at confidence 30. This is **decimal loss plus crop
framing**, not digit misrecognition.

The two re-reads also **disagree with each other** (one abstains, one reads
13.5), so the agreement requirement suppresses this case independently of the
parser fix.
