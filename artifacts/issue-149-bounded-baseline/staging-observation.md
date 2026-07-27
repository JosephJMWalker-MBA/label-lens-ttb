# Staging observation

Environment: pr143.ttb-test.com

Observation date: 2026-07-26

This is a real-world observation recorded after the baseline branch was tested in staging. It is not a treatment result and does not change the OCR baseline.

- The full package workflow completed successfully.
- Government Warning returned FAIL because no warning evidence was located.
- The seller-marked Brand region did not yield the intended brand.
- Machine evidence remained INSUFFICIENT_EVIDENCE.

Interpretation: PR #190 behaved as intended for an instrumentation-only baseline. These reading failures are not fixed in this branch; they remain evidence for follow-up experiments.

OCR behavior confirmation: no OCR padding, scale factor, preprocessing, Tesseract PSM, orientation policy, confidence threshold, candidate ranking, comparison outcome, or UI behavior was changed for this observation.
