# Layout and confidence patterns

## The dominant signal is presentation, not matching

| Layout slice | NEAR_MISS | PARTIAL | TRUE_NON | Total |
|---|---|---|---|---|
| **`decorative-or-script-brand`** | 0 | 2 | **7** | **9** |
| `alcohol-at-bottom` | 2 | 6 | 8 | 16 |
| `front-label` | 1 | 5 | 7 | 13 |
| `back-label` | 1 | 4 | 4 | 9 |
| `alcohol-at-side-or-rotated` | 0 | 3 | 4 | 7 |
| `vertical-mandatory-strip` | 0 | 2 | 3 | 5 |
| `dense-text` | 1 | 3 | 1 | 5 |
| `multi-line-brand` | 0 | 1 | 3 | 4 |
| `multiple-brand-like-phrases` | 0 | 3 | 0 | 3 |
| `wraparound` | 0 | 2 | 0 | 2 |
| `multi-panel` | 0 | 0 | 2 | 2 |

Slices overlap, so rows do not sum to 24.

**`decorative-or-script-brand` is the standout: 7 of its 9 cases are true
non-recognitions.** A brand set in script or heavily stylised type is simply not
read. No matching tolerance reaches these cases, because there is nothing to match
against — 12 of 24 cases have no 4-character fragment of the brand anywhere in the
OCR output.

## The `La Fattoria` family — the same brand, five times

| Case | Category | Distinguishing slice |
|---|---|---|
| `approved-wine-107` | `PARTIAL_RECOGNITION` | + `wraparound` |
| `approved-wine-108` | `PARTIAL_RECOGNITION` | + `wraparound` |
| `la-fattoria-rotated` | `TRUE_NON_RECOGNITION` | — |
| `approved-wine-004` | `TRUE_NON_RECOGNITION` | — |
| `approved-wine-005` | `TRUE_NON_RECOGNITION` | — |

All five share `decorative-or-script-brand`, `vertical-mandatory-strip`,
`alcohol-at-side-or-rotated`, `front-label`. **The identical brand string lands in
two different categories depending purely on how it is presented.** This is the
clearest single demonstration in the study that the class is driven by
presentation and geometry, not by string matching.

## OCR confidence does not separate the categories

| Mean confidence of the best span | NEAR_MISS | PARTIAL | TRUE_NON |
|---|---|---|---|
| ≥ 80 | 0 | 7 | **8** |
| 60–79 | **2** | 2 | 1 |
| < 60 | 0 | 0 | 4 |

**8 of 13 true non-recognitions have a high-confidence best span.** The engine
read something clearly — it was simply not the brand. Confidence measures the
quality of what was recognised, not whether the right region was recognised.

Both bounded near misses sit in the middle band (60–79), which is consistent with
single-glyph noise on otherwise legible text, but n = 2 supports no inference.

## Pass attribution

All 24 best spans came from the **primary** full-image upright pass; recovery
passes contributed none. Recovery is planned only when brand is `NOT_OBSERVED`,
and these cases are not — they carry a confident wrong or partial brand instead.
So the recovery machinery never engages on this failure class.

## Line placement

| | Cases |
|---|---|
| One reconstructed line carries a ≥ 4-char fragment | 5 |
| Two or more lines each carry a fragment (visually split) | 7 |
| **No line carries even a 4-character fragment** | **12** |

The 7 split cases are the composition population; the 12 with nothing are the
perception population.
