# ADR 0002: AI Extracts Evidence; Rules Decide Findings

- Status: Accepted
- Date: 2026-07-09

## Context

Vision models and OCR systems can recover information from difficult label images, but their outputs are probabilistic. Compliance findings must be reproducible, explainable, and governed by approved requirements.

Allowing a model to answer whether a label is compliant would mix extraction, policy interpretation