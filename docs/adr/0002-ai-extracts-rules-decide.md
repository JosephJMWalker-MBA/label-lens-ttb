# ADR 0002: AI Extracts Evidence; Rules Decide Findings

- Status: Accepted
- Date: 2026-07-09

## Context

Vision models and OCR systems can recover information from difficult label images, but their outputs are probabilistic. Compliance findings must be reproducible, explainable, and governed by approved requirements.

Allowing a model to answer whether a label is compliant would mix extraction, policy interpretation, and final decision-making in one opaque step. That would make failures harder to diagnose, rules harder to version, and decisions harder to audit.

## Decision

Probabilistic systems may extract evidence, identify candidate fields, estimate confidence, and preserve alternate readings.

Deterministic, versioned rules produce verification findings.

The pipeline is therefore separated into:

```text
Image
  ↓
Image quality and preprocessing
  ↓
OCR / vision evidence extraction
  ↓
Field parsing and normalization
  ↓
Versioned compliance rules
  ↓
Governance gates
  ↓
Explainable verification report
  ↓
Human decision
```

An extraction provider must not return a final `PASS`, `WARN`, or `FAIL` compliance decision. It returns evidence only.

## Consequences

### Benefits

- Compliance behavior is reproducible and testable.
- Rules can be reviewed and versioned independently of OCR models.
- OCR or vision providers can be replaced without rewriting compliance logic.
- Every finding can explain the evidence and rule that produced it.
- Human reviewers remain authoritative.

### Costs

- More explicit data contracts are required between pipeline stages.
- The rule registry and governance layer must be maintained carefully.
- Ambiguous evidence may require human review rather than a convenient model-generated answer.

## Governance

A production rule change requires:

1. documented authority or policy basis,
2. tests covering positive, negative, and ambiguous cases,
3. regression evaluation against the approved fixture corpus,
4. version increment and changelog entry,
5. human approval before promotion.

A model or OCR update may improve evidence extraction, but it cannot silently redefine compliance.

## Rejected Alternatives

### Let a multimodal LLM decide compliance directly

Rejected because the result would be probabilistic, difficult to reproduce, and vulnerable to model drift or prompt changes.

### Treat OCR text as truth

Rejected because OCR is unreliable on glare, curvature, decorative typography, perspective distortion, and small statutory text.

### Encode field comparison logic inside UI components

Rejected because compliance logic must be reusable, independently testable, and framework-agnostic.

## Review Trigger

Revisit this decision only if a future authorized policy explicitly permits probabilistic automated approval and the system can still provide reproducible evidence, versioning, auditability, and human oversight.