# Issue #149 Brand grouping and ranking config

Single variable under test: allow coherent adjacent plausible Brand lines to form a multi-line candidate in the treatment selector.

Unchanged: OCR engine, crop geometry, padding, clipping, scale factor, preprocessing, PSM mode, orientation policy, confidence thresholds, authority requirements, seller declaration authority, Alcohol behavior, Government Warning behavior, two-stream comparison semantics, package-analysis serialization, and production UI behavior.

The seller-entered Brand value is used only by the evaluation harness as truth for measurement. It is not passed into OCR, candidate generation, candidate ranking, or selection.

Control: current production `selectBrandObservation`.

Treatment: `selectBrandObservationWithCoherentLineMergeTreatment`, called only from this evaluation harness and focused tests. Production continues to call the control selector.

Current Brand path summary:

1. Bounded seller-region OCR emits raw words with processed and original-frame geometry.
2. The selector normalizes transcript text only for candidate cleaning and comparison keys.
3. Words are ordered top-to-bottom, left-to-right.
4. Words are grouped into lines by vertical proximity.
5. Whole-line candidates are analyzed first.
6. Existing line-window candidates are generated only for trimmable positive lines.
7. Existing multi-line candidates are generated for adjacent lines when at least one line has a positive Brand signal.
8. Candidates are filtered by producer, non-brand, product/designation, location/appellation, low-information, and sentence-fragment rules.
9. Kept candidates are scored by positive signal, meaningful characters, structure, OCR score, prominence, area, centrality, alignment, proximity, and penalties.
10. Ranking selects a likely candidate and top alternates.
11. Authority remains separate: a likely candidate becomes OBSERVED only when it is positive and clears the confidence floor; otherwise it remains AMBIGUOUS or LOW/NOT observed downstream.
12. Package analysis serializes OCR-derived observations and seller-region readings separately for review UI presentation.
