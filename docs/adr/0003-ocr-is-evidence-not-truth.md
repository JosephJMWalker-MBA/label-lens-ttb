# ADR-0003: OCR Is Evidence, Not Truth

## Status
Accepted

## Context
Alcohol labels may be photographed at angles, under glare, with decorative fonts, curved surfaces, low contrast, or small regulatory text. OCR output can therefore be incomplete, inconsistent, or confidently wrong.

Treating one OCR result as authoritative would create unacceptable risk, especially for critical fields such as alcohol content and the government warning statement.

## Decision
OCR output will be treated as one source of evidence within a broader verification pipeline.

The system will:

- assess image quality before OCR;
- retain OCR confidence and geometry where available;
- support multiple preprocessing variants;
- preserve alternate OCR hypotheses;
- compare results across engines when practical;
- apply field-specific parsers;
- lower confidence when evidence disagrees;
- route ambiguous or weak evidence to human review.

The system will not convert an OCR string directly into a compliance decision.

## Consequences

### Positive
- Reduces false confidence.
- Preserves explainability.
- Supports ensemble and consensus methods.
- Enables targeted improvement through fixtures and metrics.
- Makes human review criteria explicit.

### Negative
- Adds implementation complexity.
- Requires more telemetry and test fixtures.
- May increase processing time for difficult labels.

## Governance Rule
No critical field may receive an automatic PASS solely because one OCR engine returned a high confidence value.

## Review Trigger
Revisit this decision only if a future recognition system demonstrates independently validated reliability sufficient to replace the current evidence-fusion model.