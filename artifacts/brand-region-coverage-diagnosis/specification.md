# Specification (Phases 0–1 complete; Phase 2 pre-registered, not run)

## Population

**Primary: exactly the 13 `TRUE_NON_RECOGNITION` cases** from
`artifacts/brand-ocr-recognition-miss-diagnosis/classifications.json`.

**Controls, fixed before any Phase-2 measurement** (`controls.json`): all
remaining cases carrying the `decorative-or-script-brand` slice, plus all
`La Fattoria` fixtures, deduplicated, excluding the 13 primary. **6 cases.**
Controls are reported separately and were not chosen after seeing measurements.

## Phase 1 — annotation

Regions are proposed by visual inspection of the artwork, in canonical
original-image pixels, enclosing only the visible brand mark with modest padding.
Varietal, appellation, series and descriptive text are excluded unless visually
part of the fixture brand.

`annotation-review/proposed-regions.json` and `approved-regions.json` are kept as
**separate files**; only the approved file may be used as evaluation truth.

**Expected fixture text may be used to identify which mark is the brand. It may
never steer OCR, recovery passes, crops, or extraction.**

The first annotation view deliberately shows **no OCR word boxes and no
machine-selected regions**.

## Phase 2 — pre-registered, awaiting approved annotations

### Coverage threshold, fixed now and not to be tuned afterwards

> A pass **geometrically covers** the brand region when at least **90 %** of the
> annotated brand-region area falls inside the pass footprint.

Continuous coverage ratios will be reported alongside the fixed classification.

### Per pass × case, to record

pass id and kind · footprint mapped into canonical coordinates · rotation and
transform provenance · % of annotated region area included · region dimensions in
canonical pixels · region dimensions after the pass transform · words whose
centre lies inside the region · words with ≥ 50 % of their own box area
intersecting it · overlapping word text, confidence and geometry · reconstructed
line membership · orientation of overlapping words and lines · whether the
overlapping text carries any fixture-brand evidence · whether the pass
contributed to the final brand candidate set.

### First-failure categories, in precedence order

1. `REGION_NOT_COVERED` — no executed pass includes ≥ 90 % of the region.
2. `REGION_COVERED_NO_TEXT_RECOGNIZED` — a pass covers ≥ 90 %, but no word box has
   its centre inside the region or ≥ 50 % of its own area overlapping it.
3. `ORIENTATION_OR_SEGMENTATION_FAILURE` — covered, with overlapping geometry
   showing wrong orientation, glyphs fragmented across incompatible lines, fused
   brand/non-brand text, badly split words, or transform/line-grouping behaviour
   preventing coherent reading.
4. `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION` — covered, words overlap, text is
   severely different from the visible brand, and no stronger geometric
   explanation applies.
5. `UNATTRIBUTED` — the evidence does not justify any of the above.

Exactly one first-failure category per case; secondary contributing mechanisms
recorded separately; counts must sum to 13.

### Control comparison

Failures vs controls on: region pixel height and width · region area as % of the
full image · number of passes covering the region · number of overlapping words ·
mean confidence of overlapping words · pass type producing the best brand-region
evidence · decorative/script vs ordinary typography · upright / vertical /
rotated / curved presentation.

**No production threshold may be inferred from these distributions.**

## Interpretation boundary (carried into Phase 2)

`REGION_NOT_COVERED` → region-proposal or recovery-planning research (possibly
issue #77). `REGION_COVERED_NO_TEXT_RECOGNIZED` → typeface, preprocessing,
resolution, or alternate-OCR research. `REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION`
→ OCR-engine or local-vision comparison. `ORIENTATION_OR_SEGMENTATION_FAILURE` →
orientation, line-segmentation, or geometry-composition research.

**None of these may be implemented in this round, and no YOLO, local-vision, or
preprocessing treatment may be opened until this classification is complete.**
