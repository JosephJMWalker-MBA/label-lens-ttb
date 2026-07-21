# Edit-distance analysis

## The two bounded near misses

Both are single-character optical confusions on otherwise cleanly read text.

| Case | Expected | Best qualifying span | Operation |
|---|---|---|---|
| `approved-wine-017` | `La Borde Noire` | `oABORDE NOIRE` | **substitution** `l` → `o` at index 0 |
| `approved-wine-049` | `Caywood Vineyard` | `CAYWOQOD VINEYARD` | **insertion** of `q` at index 5 |

Both sit at OCR confidence 60–79 — the only two cases in that band that are not
true non-recognitions. Both are classic glyph confusions (`l`/`o` at a word
start; a spurious `q` inside `woo`).

## Distance distribution and what widening the bound would buy

| Distance | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Cases | 2 | 5 | 2 | 1 | 2 | 1 | 4 | 2 | 2 | 3 |

Median 5. The distribution is **not** concentrated near the bound — it has a long
right tail, with 12 of 24 cases at distance ≥ 5. That is the shape of "the text
was never read", not of "the text was read with noise".

Of the 5 cases at distance 2, **4 are already `PARTIAL_RECOGNITION`** on token
evidence (`approved-wine-092`, `102`, `107`, `108`). Only `approved-wine-091`
would change category if the bound moved to 2 — and it is referred for human
review for exactly that reason (`borderline-review.md`).

**This is a measurement, not an argument for widening the bound.** The bound was
pre-registered at 1 and is not revised here. What the distribution establishes is
that the *ceiling* on any bounded-tolerance family is small: at most 3 additional
cases even at distance 2, against 13 cases where nothing recognizable was read.

## Span-window sensitivity

The span window is anchored on the expected token count, so a merged or dropped
OCR word boundary could push the best evidence outside it. Measured with the
window widened to 1–6 tokens (diagnostic only, never used for classification):

- the window excluded a closer span in **1 of 24** cases (`approved-wine-083`,
  distance 10 → 9 — still far outside any bound);
- **no case would change category**.

The span rule is not doing hidden work, and the near-miss count of 2 is not an
artifact of the window.

## What this does not license

Edit-distance proximity is **not** evidence of authority. A span at distance 1
from the expected brand is a statement about string shape, nothing more — it does
not establish that the pipeline observed the brand, and it must never be used to
promote an observation to `OBSERVED`. Nothing here proposes implementing fuzzy
matching.
