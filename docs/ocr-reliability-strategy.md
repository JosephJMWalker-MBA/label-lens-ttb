# OCR Reliability Strategy

## Purpose

OCR is treated as an unreliable evidence source, not as truth.

The system must never approve a label merely because one OCR engine returned plausible text. Reliability comes from image-quality controls, multiple recognition paths, field-specific parsing, confidence calibration, deterministic rules, and human review when evidence is weak or conflicting.

## Core Principle

> OCR proposes observations. The verification system decides whether the evidence is sufficient.

The pipeline must