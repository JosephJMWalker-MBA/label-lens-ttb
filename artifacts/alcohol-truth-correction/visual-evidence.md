# Visual adjudication evidence

Crops were produced with `sharp` from the committed fixture images and read
visually. **OCR output was not used as ground truth.**

| Case | Image | Crop (source coords) | Visible transcription |
|---|---|---|---|
| `approved-wine-043` | `tests/fixtures/precheck/approved-wine-043/label.jpeg` | `(210,950) 250x70`, ×8 | **`ALC. 13.8% BY VOL.`** |
| `wine-multi-artifact-06` | `tests/fixtures/precheck/wine-multi-artifact-06/label.png` | `(560,60) 110x150`, rotate 90°, ×12 | **`ITALY Alc. 13,5 % by Vol.`** |
| `wine-multi-artifact-07` | `tests/fixtures/precheck/wine-multi-artifact-07/label.png` | `(60,600) 300x80`, ×7 | **`12% ALC./VOL.`** |

Committed crops: `approved-wine-043-crop.png`, `wma06-final.png`,
`wine-multi-artifact-07-crop.png`.

## Reading notes

- **`approved-wine-043`** — thin cream-on-charcoal caps. The final digit shows two
  stacked bowls: an unambiguous `8`. Reads 13.8, not 13.
- **`wine-multi-artifact-06`** — small vertical serif text on the front-label
  edge, rectified by rotating the crop before upscaling. Comma decimal separator.
  The final digit has the flat top bar and lower bowl of a `5`; a `4` would show a
  diagonal and a vertical stem.
- **`wine-multi-artifact-07`** — bold condensed black on white, directly beneath
  "Made with North Carolina Muscadine Grapes". The statement is plainly present;
  the recorded `absenceReason` was factually wrong.

## Reader status

- **First reader:** Claude, 2026-07-20, magnified visual crops. **Not blind** — see
  the disclosure below.
- **Second reader:** **Joseph, 2026-07-20. Blind** — had not seen the expected
  answers beforehand.

**All three corrections are independently confirmed by a second human reader.**

### Second reader's independent readings

| Case | Joseph's reading | Matches corrected truth |
|---|---|---|
| `approved-wine-043` | **13.8%** | ✅ |
| `wine-multi-artifact-06` | **13.5%** | ✅ |
| `wine-multi-artifact-07` | **12%** | ✅ |

**Recorded uncertainty — `wine-multi-artifact-06`:** the decimal separator was not
visually clear to the second reader, while the numeric reading was 13.5%. The case
is therefore confirmed as the **numeric value 13.5**, with the uncertainty
attaching to the clarity of the separator glyph only, not to the value. This is
consistent with the first reader's note that the statement uses a comma separator
(`Alc. 13,5 % by Vol.`) in small vertical type.

OCR output was not used as a reader by either party.

### Anchoring disclosure (first read)

The two reads are **not** equivalent and are deliberately not recorded as such. A
blind first read was not possible: the first reader had already seen both the
fixture truths and the OCR outputs during the preceding diagnosis rounds and could
not un-know them. The second read *was* blind, which is what supplies the
independent confirmation here.

The mitigation recorded at the time still stands: the first reader's five readings
cut both ways — contradicting the fixture in three cases and contradicting the OCR
in two (`approved-wine-018`, `approved-wine-037`), and those two are **not**
corrected in this PR.
