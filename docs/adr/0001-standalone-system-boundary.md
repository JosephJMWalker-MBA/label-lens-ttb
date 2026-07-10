# ADR 0001: Standalone System Boundary

- Status: Accepted
- Date: 2026-07-09

## Context

The existing COLA platform is a long-lived .NET system with separate authorization, integration, security, and procurement constraints. The take-home request explicitly asks for a standalone proof of concept rather than a direct COLA integration.

## Decision

Label Lens TTB will operate as a standalone application with no direct dependency on COLA, agency identity systems, or production records.

Included in the prototype boundary:

- Label image intake
- Expected application field entry
- OCR and field extraction
- Deterministic comparison and compliance findings
- Batch processing
- Human review
- Exportable reports
- Evaluation and governance tooling

Excluded from the prototype boundary:

- COLA APIs or database access
- Production agency authentication
- Long-term federal records storage
- Production authorization claims
- FedRAMP certification claims

## Consequences

Positive:

- The prototype can be built, deployed, and evaluated independently.
- Security and performance behavior are easier to inspect.
- Future integrations can be designed around a stable report contract.
- The take-home remains focused on the actual verification problem.

Trade-offs:

- Application data must be entered or imported separately.
- Production identity and record workflows remain future work.
- Integration assumptions must be documented rather than demonstrated.

## Revisit Conditions

Revisit this decision only after a successful controlled pilot and a formal integration discovery process with COLA owners, security staff, records management, and procurement stakeholders.
