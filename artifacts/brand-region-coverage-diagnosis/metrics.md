# Phase 2 metrics

**10 approved primary cases** (3 of the original 13 blocked by a truth conflict —
see `annotation-review/truth-conflict-referrals.md`) and **6 pre-registered
controls**. Coverage threshold fixed at **90 %** before measurement and not
tuned afterwards. Machine form: `classifications.json`, `pass-coverage.json`,
`word-overlap.json`, `control-analysis.json`.

## First-failure categories (primary, n = 10)

| Category | Count |
|---|---|
| `REGION_NOT_COVERED` | **0** |
| `REGION_COVERED_NO_TEXT_RECOGNIZED` | **3** |
| `ORIENTATION_OR_SEGMENTATION_FAILURE` | **5** |
| `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION` | **2** |
| `UNATTRIBUTED` | **0** |
| **Total** | **10** |

Exactly one category per case; the counts sum to 10.

## The three layers, kept separate

| Question | Answer |
|---|---|
| Brand region covered by the primary full-image pass | **10 / 10** |
| Brand region covered by any recovery pass | **0 / 10** |
| **Recovery ran at all** | **0 / 10** |
| Region covered but **zero** OCR boxes over it | **3 / 10** |
| Overlapping boxes present but no recognisable brand text | **7 / 10** |
| Showing orientation or segmentation evidence | **5 / 10** |

**Full-image inclusion proved nothing on its own — which is exactly why the layers
were separated.** Every region was covered at ratio 1.00, and every case still
failed. Coverage is not the discriminator.

## A finding that changes Phase 0's picture

**No recovery pass ran on any of the 16 cases.** The committed corpus report
(2026-07-18) showed 3–4 passes for many of these fixtures; today every one runs a
single primary pass.

The reason is the one flagged in `code-path.md`: for these cases brand is
`AMBIGUOUS`, not `NOT_OBSERVED`, so recovery was only ever triggered by
**alcohol** — and PRs #150/#151 improved alcohol recognition after that report was
generated. **Recovery planning no longer engages on this failure population at
all.** Had this study been run from the committed report, it would have credited
coverage to passes that no longer execute.

## Per-case results

| Case | Category | Cov. | Words in region | Lines spanned | Ungrouped | Mean conf. |
|---|---|---|---|---|---|---|
| `la-fattoria-rotated` | `REGION_COVERED_NO_TEXT_RECOGNIZED` | 1.00 | **0** | — | — | — |
| `approved-wine-004` | `REGION_COVERED_NO_TEXT_RECOGNIZED` | 1.00 | **0** | — | — | — |
| `approved-wine-005` | `REGION_COVERED_NO_TEXT_RECOGNIZED` | 1.00 | **0** | — | — | — |
| `approved-wine-023` | `ORIENTATION_OR_SEGMENTATION_FAILURE` | 1.00 | 2 | 2 | 0 | 21 |
| `approved-wine-027` | `ORIENTATION_OR_SEGMENTATION_FAILURE` | 1.00 | 8 | 5 | 3 | 36 |
| `approved-wine-035` | `ORIENTATION_OR_SEGMENTATION_FAILURE` | 1.00 | 1 | 1 | 0 | 0 |
| `approved-wine-085` | `ORIENTATION_OR_SEGMENTATION_FAILURE` | 1.00 | 3 | 1 | 0 | 25 |
| `approved-wine-091` | `ORIENTATION_OR_SEGMENTATION_FAILURE` | 1.00 | 4 | 1 | **3** | 54 |
| `approved-wine-031` | `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION` | 1.00 | 1 | 1 | 0 | 10 |
| `wine-multi-artifact-04` | `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION` | 1.00 | 2 | 1 | 0 | 38 |

## What the OCR actually emitted inside the annotated brand region

| Case | Visible brand | Text recognised over the region |
|---|---|---|
| `approved-wine-031` | embeleso | `enrhekeso` (conf 10) |
| `approved-wine-035` | Hubert Lamy | `Hectiont` (conf 0) — two words fused into one |
| `wine-multi-artifact-04` | Dry Cellar | `Dy` + `Colla` (conf 41, 35) |
| `approved-wine-023` | Podere don Cataldo | `7` + `ary` (conf 4, 37) across two lines |
| `approved-wine-085` | Mosaikon | `=` + `SP` + `“i` — one word split into three |
| `approved-wine-091` | Rias | `/` + `R{` + `d` + `D>` — three not grouped into any line |
| `approved-wine-027` | The Golden Girls | `HE`, `¥`, `a}`, `>`, `N`, `A001`, `Gy`, `PRA` across five lines |
| 3 × La Fattoria | La Fattoria | **nothing at all** |

Confidence over the annotated brand region runs **0–54, median 25**. The engine is
not confidently reading the wrong thing here — it is emitting low-confidence
fragments, or nothing.

## Secondary mechanisms

`wine-multi-artifact-04` was classified on its back-panel occurrence (`Dy Colla`,
the more favourable evidence). Its **front-panel** occurrence produced a single
token `9.` for the whole two-word script mark — a fusion/under-segmentation
event recorded as a secondary mechanism.
