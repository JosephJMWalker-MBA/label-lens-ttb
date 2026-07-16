# Rubber Duck Review 004 — Vision Pipeline Diagnostic Governance

- Status: Accepted review conclusion, current-state revalidated
- Date opened: 2026-07-16
- Date completed: 2026-07-16
- Date revalidated: 2026-07-16
- Scope: Causal honesty, blinded evaluation boundaries, diagnostic attribution, human-proofing, and operational usefulness of the OCR/vision evidence pipeline
- Planned review inputs: 6 rounds
- Inputs received: 6 of 6

## Purpose

This review evaluates whether the diagnostic and evaluation instruments surrounding the Label Lens OCR and stateless vision-observer pipeline describe their measurements honestly, preserve benchmark blinding at runtime and at the human-perception layer, expose enough causal and provenance detail to support safe engineering decisions, and remain connected to measurable product usefulness.

## Governing question

> Does the evaluation system produce diagnostic evidence whose language, runtime boundaries, human-review design, attribution model, integrity semantics, and operational metrics are sufficiently precise that future maintainers can act on it without being misled?

## Authoritative review record

- [`final-revalidation.md`](final-revalidation.md) — current-state review of the review; classifies each finding as current, historical and fixed, partially fixed, open, or a continuing governing principle.
- [`source-brief.md`](source-brief.md) — six-round synthesis and repository facts available when the original verdict was written.
- [`verdict.md`](verdict.md) — accepted conclusions and withheld authorities before current-state revalidation.
- [`next-actions.md`](next-actions.md) — bounded remediation and product gates, interpreted through the revalidation status.
- [`../../../src/fixtures/eval/rdr-004-final-verification.test.ts`](../../../src/fixtures/eval/rdr-004-final-verification.test.ts) — executable checks separating repaired historical failures from findings that remain open.

Where an earlier authoritative artifact or numbered feedback file conflicts with `final-revalidation.md`, the final revalidation controls for present-tense repository status. Historical artifacts remain preserved as evidence of why later safeguards were built.

## Feedback inputs

1. [`feedback-01-causal-honesty.md`](feedback-01-causal-honesty.md) — prefix-marginal causal language, strict runtime manifest validation, and primary-versus-contributing diagnostic attribution.
2. [`feedback-02-evidence-producing-architecture.md`](feedback-02-evidence-producing-architecture.md) — evidence-producing role separation, honest abstention, stateless execution, blinding, authorization as code, and a preserved disagreement over recovery-pass causal claims.
3. [`feedback-03-human-proofing.md`](feedback-03-human-proofing.md) — perception-layer unblinding, annotator provenance and separation of duties, digest-scope clarity, and reinforcement of prefix-marginal causal discipline.
4. [`feedback-04-architecture-versus-product.md`](feedback-04-architecture-versus-product.md) — whether governance strength is obscuring low extraction usefulness, timeout burden, false certainty, and insufficient reviewer-work reduction.
5. [`feedback-05-architecture-versus-extraction-failure.md`](feedback-05-architecture-versus-extraction-failure.md) — whether scientific measurement is enabling targeted repair or becoming a shield around extraction failure.
6. [`feedback-06-human-evaluation-and-operator-friction.md`](feedback-06-human-evaluation-and-operator-friction.md) — perception-layer blinding, causal-language discipline, and operator-friction acceptance criteria.

## Current-state conclusions after revalidation

- The historical 100% absent-brand false-positive result is fixed in the committed baseline: 0/10 absent-brand false positives, 100% correct brand abstention, zero brand false certainty, and zero false abstention. Regression protection is now explicit.
- Alcohol extraction and orientation handling are partially improved, not wholly fixed: current alcohol detection is approximately 61%, side/rotated recovery is nonzero, and vertical mandatory strips remain 0/5.
- The generated Phase 5A report still uses the overbroad heading `Recovery passes that never improve outcomes`; removal equivalence remains untested.
- Draft PR #114 still lacks a total, exact arbitrary-JSON validation boundary and still does not bind selector-versus-annotator provenance into the frozen manifest.
- The observation-quality protocol remains a synthetic calibration design: 16 cases, 64 scored items, one primary reviewer, and real execution unauthorized.
- Candidate-filtering primary subtype reconciliation is already an implemented and tested invariant. Contributing-factor telemetry is an optional diagnostic extension, not proof that current totals are invalid.
- Evidence-producing architecture, deterministic evaluation, typed failures, provenance, and authorization as code are genuine strengths, but they still do not prove saved human work.

## Accepted governing principles

- Historical metrics explain why safeguards were built; current committed metrics determine present status.
- A claimed repair is not accepted merely because later prose says it happened; executable tests must demonstrate it.
- Evidence generation, selection change, and counterfactual necessity are different measurements.
- A blind is an empirical property of the review session, not merely the absence of an identifier field.
- A primary attribution bucket supports accounting without necessarily proving singular causation.
- A safely classified failure may still be operationally unacceptable.
- Architecture must preserve truth; the product must also save work.

## Authority treatment

The review authorizes bounded remediation and regression protection. It does **not** authorize:

- pruning recovery passes;
- changing the production prompt;
- running the real observation-quality benchmark;
- freezing a real corpus manifest;
- advancing one research contract into production;
- expanding fields, beverage categories, cloud fallback, or seller/regulator product surfaces solely because architectural safeguards exist.

Those actions remain gated by current evidence, relevant regression tests, and explicit authorization.
