# E3 decision

**E3 is complete. It was measurement only: no production code, OCR configuration,
candidate generation, matching behaviour, ranking, authority state, fixture, test,
schema, UI or package was changed, and no treatment corpus run occurred.** Base
`a4a0fd9`.

## Population

**24 cases**, exactly those the preserved brand evidence-path diagnosis
(`artifacts/brand-evidence-path-diagnosis/`) classified as
`OCR_RECOGNITION_MISS`. Reproduced independently by this round's probe and
verified at 24. **Every case received exactly one pre-registered category, and the
three counts sum to 24.**

## Category results

| Category | Count | % of 24 |
|---|---|---|
| `BOUNDED_NEAR_MISS` | **2** | 8.3 % |
| `PARTIAL_RECOGNITION` | **9** | 37.5 % |
| `TRUE_NON_RECOGNITION` | **13** | 54.2 % |

---

## 1. Near miss — **the matching-tolerance family is closed for now**

Only **`approved-wine-017`** (`La Borde Noire`, substitution `l` → `o` at index 0)
and **`approved-wine-049`** (`Caywood Vineyard`, insertion of `q` at index 5)
qualify. Both are one-edit glyph errors on otherwise legible text.

- **Two cases is too small a sample to support a matching-tolerance treatment.**
  They are 1.7 % of the 115-case corpus.
- **Edit-distance proximity is diagnostic only.** A span one edit from the
  expected brand is a statement about string shape and nothing more.
- **It must never be treated as authority evidence and must never promote an
  observation to `OBSERVED`.**
- **No fuzzy-matching implementation is recommended**, at any bound. Distance 2
  was measured for distribution only and was never an approved treatment; the
  pre-registered bound of 1 was not revised.

**Decision: the matching-tolerance family is closed for now.**

## 2. Partial recognition — **secondary; no treatment recommended**

**Nine cases contain distinctive brand material** that the pipeline read and did
not turn into the answer. **Three of them contain every part of the brand and fail
only at composition** (`Twin Suns` ×2, `Golden Road Vineyards`).

- This **may** support a later diagnostic into line grouping, segmentation, or
  evidence composition.
- **It does not reopen arbitrary sub-span generation.** That family (E1a, E1b, and
  the never-simulated E2) was closed on measurement in the previous round and
  stays closed. Any composition work must start from a different mechanism and
  must screen brand-absent behaviour first.
- **No production composition treatment is recommended by this round.**

## 3. True non-recognition — **the largest family, and presentation-driven**

**Thirteen cases contain no qualifying brand evidence at all.** 12 of the 24 have
no 4-character fragment of the brand anywhere in the OCR output.

- **Presentation is the dominant signal.** **Seven of the nine
  `decorative-or-script-brand` cases are true non-recognitions.**
- **The same brand string can succeed or fail on presentation alone.**
  `La Fattoria` appears in five fixtures: two are partial recognitions, three are
  true non-recognitions, sharing the same decorative/vertical/rotated slices.
- **OCR confidence does not distinguish success from failure.** 8 of the 13 true
  non-recognitions have a high-confidence (mean ≥ 80) best diagnostic span.
- **High confidence may describe unrelated text rather than the brand.** It
  measures the quality of what was recognised, never that the brand region was
  examined. On `approved-wine-091` the closest-matching span is government-warning
  copy.

---

## Next research priority

**A diagnostic-only study of the 13 true-non-recognition cases**, begun later from
a fresh branch based on then-current `origin/main`.

Question: **did any OCR pass the pipeline already runs geometrically cover the
brand region?** Classify each case into:

- region not covered;
- region covered but no text recognized;
- region covered with severe glyph misrecognition;
- orientation or segmentation failure;
- unattributed.

**Do not rerun matching-tolerance experiments first.** Partial-recognition
composition remains secondary to this.

## Borderline cases

`approved-wine-091`, `approved-wine-083` and `approved-wine-044` are preserved as
**rule-sensitivity cases**: their category turns on where a pre-registered
boundary was drawn, not on the artwork.

- **They are not fixture-truth problems, and nothing here questions any fixture.**
- **They do not require human resolution before preservation**, and this record is
  complete without it.
- **Resolving them differently would not change the headline conclusion.** Every
  plausible resolution leaves the counts at 2–3 near miss, 8–9 partial, 13–14 true
  non-recognition: bounded near misses stay the smallest family by a wide margin
  and true non-recognition stays the largest.

Detail: `borderline-review.md`.
