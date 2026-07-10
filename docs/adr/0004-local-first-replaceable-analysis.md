# ADR-0004: Local-First, Replaceable Analysis

## Status
Accepted

## Context
The stakeholder environment may restrict outbound network traffic. A prior vendor pilot lost functionality when cloud machine-learning endpoints were blocked. The prototype must also be deployable and testable without binding the product to one external provider.

## Decision
The analysis layer will be accessed through a stable analyzer interface with replaceable implementations.

Preferred production direction:

1. Local or on-premises OCR and image processing.
2. Deterministic parsing and verification.
3. Optional external vision or language services only when explicitly configured and permitted.

The browser will never communicate directly with an external AI provider. Secrets remain server-side. The Jetson may host the local analysis service, but the web application will not depend on Jetson-specific APIs.

Representative interface:

```text
analyze(validatedImage) -> AnalysisEvidence
```

The returned object contains evidence, confidence, alternatives, timing, and limitations. It does not contain final policy authority.

## Consequences

### Positive
- Supports restricted-network environments.
- Avoids vendor lock-in.
- Protects API credentials.
- Allows Jetson, workstation, Azure, or other infrastructure to replace one another.
- Keeps the frontend and rule engine stable as models evolve.

### Negative
- Requires interface discipline.
- Local inference may require deployment and hardware optimization.
- Multiple providers increase testing obligations.

## Governance Rule
No analyzer implementation may bypass the shared schemas, deterministic rule engine, or governance gates.

## Review Trigger
Revisit the preferred provider when benchmark evidence shows another deployment mode offers better reliability, security, maintainability, and performance without violating stakeholder constraints.