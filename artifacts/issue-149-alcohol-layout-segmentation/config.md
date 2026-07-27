# Issue #149 alcohol layout segmentation experiment

Single variable under test: Apply PSM 7 only to bounded Alcohol statement OCR for side, rotated, or vertical seller-selected regions.

Control: PSM 11 sparse text.

Treatment: PSM 7 single line only for Alcohol layout classes side, rotated, and vertical.

Brand, horizontal Alcohol, bottom Alcohol, unreadable regions, full-panel OCR, and production behavior remain on the control segmentation mode.

Held constant: seller geometry, padding, clipping, scale factor, preprocessing, orientation detection and rotation policy, OCR confidence thresholds, alcohol parsing, candidate ranking outside transcript grouping, reliability policy, comparison semantics, UI behavior, and full-panel OCR behavior.

Corpus policy: synthetic fixtures are governed, non-private, and typography-controlled. No private browser-local uploads are used.
