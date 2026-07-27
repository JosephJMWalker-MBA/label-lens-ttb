# Issue #149 segmentation experiment

Single variable under test: Segmentation mode for bounded seller-region OCR only.

Control: PSM 11 sparse text.

Treatment: PSM 7 single line.

The treatment is evaluation-only. It does not alter production OCR behavior and does not replace the control result in package analysis.

Held constant: seller geometry, padding, clipping, scale factor, image preprocessing, orientation policy, OCR confidence thresholds, brand authority rules, alcohol parsing, candidate ranking outside transcript grouping, two-stream comparison semantics, and UI behavior.

Staging label policy: the latest staging upload is not added because no source image was identified as an already committed, non-private fixture.
