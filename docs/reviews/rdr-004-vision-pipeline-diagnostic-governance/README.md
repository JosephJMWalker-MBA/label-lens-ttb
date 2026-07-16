# Rubber Duck Review 004 — Vision Pipeline Diagnostic Governance

- Status: Accepted review conclusion
- Date opened: 2026-07-16
- Date completed: 2026-07-16
- Scope: Causal honesty, blinded evaluation boundaries, diagnostic attribution, human-proofing, and operational usefulness of the OCR/vision evidence pipeline
- Planned review inputs: 6 rounds
- Inputs received: 6 of 6

## Purpose

This review evaluates whether the diagnostic and evaluation instruments surrounding the Label Lens OCR and stateless vision-observer pipeline describe their measurements honestly, preserve benchmark blinding at runtime and at the human-perception layer, expose enough causal and provenance detail to support safe engineering decisions, and remain connected to measurable product usefulness.

## Governing question

> Does the evaluation system produce diagnostic evidence whose language, runtime boundaries, human-review design, attribution model, integrity semantics, and operational metrics are sufficiently precise that future maintainers can act on it without being misled?

## Authoritative review record

- [`source-brief.md`](source-brief.md) — reconciled feedback and repository-verified facts.
- [`verdict.md`](verdict.md) — accepted conclusions and withheld authorities.
- [`next-actions.md`](next-actions.md) — bounded, ordered remediation and product gates.

Where a numbered feedback artifact conflicts with these files, the authoritative review record controls.

## Feedback inputs

1. [`feedback-01-causal-honesty.md`](feedback-01-causal-honesty.md) — prefix-marginal causal language, strict runtime manifest validation, and primary-versus-contributing diagnostic attribution.
2. [`feedback-02-evidence-producing-architecture.md`](feedback-02-evidence-producing-architecture.md) — evidence-producing role separation, honest abstention, stateless execution, blinding, authorization as code, and a preserved disagreement over recovery-pass causal claims.
3. [`feedback-03-human-proofing.md`](feedback-03-human-proofing.md) — perception-layer unblinding, annotator provenance and separation of duties, digest-scope clarity, and reinforcement of prefix-marginal causal discipline.
4. [`feedback-04-architecture-versus-product.md`](feedback-04-architecture-versus-product.md) — whether governance strength is obscuring low extraction usefulness, timeout burden, false certainty, and insufficient reviewer-work reduction.
5. [`feedback-05-architecture-versus-extraction-failure.md`](feedback-05-architecture-versus-extraction-failure.md) — whether scientific measurement is enabling targeted repair or becoming a shield around extraction failure.
6. [`feedback-06-human-evaluation-and-operator-friction.md`](feedback-06-human-evaluation-and-operator-friction.md) — perception-layer blinding, causal-language discipline, and operator-friction acceptance criteria.

## Repository-verified conclusions

- The committed Phase 5A report uses the overbroad heading `Recovery passes that never improve outcomes`, while the underlying method measures fixed-order prefix-state marginal change.
- The left-edge 270-degree pass produced new OCR tokens and field-like evidence but no immediate selected-field change; removal equivalence was not tested.
- PR #114's proposed validator is not total over arbitrary runtime JSON and does not perform exact-key rejection at every governed object boundary.
- PR #114 records `selectedBy` but does not bind annotator identity or enforce selector-versus-annotator independence in the frozen manifest.
- The observation-quality protocol specifies 16 cases, 64 scored items, and one primary reviewer; this is calibration-grade, not decisive advancement evidence.
- The committed Phase 5A candidate-filtering subtype table controls over conflicting narrated counts.
- Evidence-producing architecture, deterministic evaluation, typed failures, provenance, and authorization as code are genuine strengths, but they do not prove saved human work.

## Accepted governing principles

- Evidence generation, selection change, and counterfactual necessity are different measurements.
- A blind is an empirical property of the review session, not merely the absence of an identifier field.
- A primary attribution bucket supports accounting without necessarily proving singular causation.
- A safely classified failure may still be operationally unacceptable.
- Architecture must preserve truth; the product must also save work.

## Authority treatment

The verdict authorizes the ordered review and remediation work in `next-actions.md`. It does **not** authorize:

- pruning recovery passes;
- changing the production prompt;
- running the real observation-quality benchmark;
- freezing a real corpus manifest;
- advancing one research contract into production;
- expanding fields, beverage categories, cloud fallback, or seller/regulator product surfaces.

Those actions remain gated by explicit evidence and authorization.