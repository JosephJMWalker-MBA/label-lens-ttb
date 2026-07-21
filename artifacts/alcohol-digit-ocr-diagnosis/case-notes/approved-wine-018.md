# approved-wine-018 — leading `1` dropped

| | |
|---|---|
| Image | `tests/fixtures/precheck/approved-wine-018/label.png`, 1080×1305 PNG |
| Visible | **`Alc.13.5% by Vol.`** |
| Truth | 13.5 |
| Machine | `3.5% BY VOL.` (OBSERVED, token confidences 95/96/96) |
| Alcohol region | source ≈ (131,432) 72×47 for the numeral group |

## Phase 1 — where the digit is lost

Primary pass only (recovery never runs: the primary produced a confident value).
Config: tesseract.js, OEM 1 (LSTM), `eng`, **PSM 11 sparse-text**, scale 1.5,
grayscale + normalise, cubic.

The `1` is **absent from the OCR token itself** — the first token is `"3.5%"`.
It therefore never reaches line grouping, window construction, canonicalization,
or the parser. Every downstream stage is innocent. **Earliest failure stage: OCR
recognition in the primary full-image pass.**

No existing pass produced the correct value: recovery is not planned, so there is
no alternate result that was collected and discarded.

## Phase 2 — visual mechanism

Dark-on-light, contrast range **204** (min 32, max 236) — the image is not the
problem. The problem is **kerning**:

- inter-glyph gaps across the statement: `[2, 5, 1, 1, 5, 1]` px
- a **1-pixel** gap separates the `Alc.` period from the numerals
- one ink run spans **44 px at aspect 0.94**, i.e. merged glyphs
- the numerals are set much larger (h≈47) than `Alc.` (h≈11–32)

`1` is the narrowest glyph in the face, and it sits immediately after a period
across a 1px gap. Under 1.5× cubic resampling that gap closes and the `1` is
absorbed into the `Alc.` cluster — which is exactly what the OCR output shows
(`"c]"`-style tokens appear in several matrix runs where the `1` should be).

## Phase 3 — what recovers 13.5

75 of 896 runs produced text containing `13.5`, but they cluster narrowly:

- **only** on the `markerAndNumber` (56) and `padded` (19) crops — never on the
  `line` or `numberOnly` crops
- overwhelmingly at **psm=singleWord** (52 of 75)

Best configuration — production treatment, unrestricted whitelist:

```
markerAndNumber x1.5 psm=singleWord -> "13.5%"  conf=52  deterministic  113ms
```

Including `Alc.` in the crop **helps**; cropping to the numerals alone never
recovers the digit.

## Phase 4 — why it does not generalise

The winning crop was hand-tuned. The **generalisable** crop — derived from the
accepted candidate's own recorded geometry — produces `"135%"` → **35**, the same
decimal-loss failure that breaks 28 currently-correct cases. The corroborated
re-read signal does **not** fire here either: the two re-reads disagree with each
other (3.9 vs 35).

**Conclusion:** the only configuration that reads this label correctly is specific
to this fixture's crop. That is overfitting, not a treatment.
