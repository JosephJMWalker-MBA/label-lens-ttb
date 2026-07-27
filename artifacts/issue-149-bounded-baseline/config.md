# Issue #149 bounded OCR baseline config

Single variable under test: No OCR treatment variable. Baseline instrumentation only.

This artifact runs the current production extractor as-is and records bounded seller-region diagnostics. It does not change OCR padding, scale factors, preprocessing, Tesseract PSM, orientation policy, confidence thresholds, candidate ranking, comparison outcomes, or UI behavior.

## Current pipeline

1. The package analysis route validates the seller package draft, panel files, media types, byte sizes, checksums, panel identities, and seller-selected normalized regions.
2. For each panel, the route assembles an extractor input with immutable provenance, image bytes, the derivative SHA-256, and seller-region OCR targets for the categories selected on that panel.
3. The extractor verifies and decodes the image, initializes the local Tesseract.js OCR worker, then runs the primary full-image OCR pass.
4. Brand and alcohol selectors evaluate the primary pass. If unresolved, the extractor plans bounded recovery passes without using seller truth values.
5. Seller-region targets are converted from normalized panel-relative geometry to original-image pixel crops, padded by the existing seller-region padding policy, clipped to image bounds, scaled by the existing seller-region scale factor, preprocessed, and OCRed with the existing PSM.
6. Bounded seller-region transcripts are built from OCR words in original-frame reading order, then the existing field selectors produce observed values, confidence, evidence state, reliability state, and pass provenance.
7. Package analysis stores the independent full-panel readings and seller-region readings separately, then derives the two-stream comparison and readiness without changing uncertainty semantics.

Corpus policy: committed non-private fixtures are used where they cover the requested slice. Exact labels not present in committed fixtures (Minneapolis, Garden City Beach, Arandano) are generated as deterministic synthetic, private-free panels inside the baseline runner.
