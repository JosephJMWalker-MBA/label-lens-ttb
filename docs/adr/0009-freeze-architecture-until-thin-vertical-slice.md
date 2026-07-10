# ADR 0009: Freeze Architecture Until One End-to-End Slice Is Proven

- **Status:** Accepted
- **Date:** 2026-07-10
- **Decision owners:** Label Lens engineering
- **Review source:** Rubber Duck Review 001

## Context

Label Lens now has a mature architectural record covering evidence extraction, deterministic rule evaluation, human authority, local-first operation, bounded fallback, provenance, operator trust, accessibility, auditability, and future batch workflows.

That architecture is coherent, but the repository has reached the point where additional architectural expansion creates more risk than value. The current danger is becoming documentation-complete before becoming evidence-complete.

The next engineering question is no longer whether the architecture can be described. It is whether the core doctrine works in a real end-to-end path.

## Decision

The Label Lens architecture is frozen at its current conceptual boundary until one thin vertical slice is implemented, tested, and measured from upload through human disposition.

No new broad architecture layer, provider abstraction, governance framework, workflow subsystem, batch capability, or speculative production feature may be added unless it is strictly required to complete the approved slice or fix evidence uncovered by that slice.

The required slice is:

```text
One uploaded label image
→ one real extraction provider
→ one typed evidence object
→ three deterministic rules
→ one explainable report
→ one explicit human correction or disposition
→ measured end-to-end and per-stage runtime
```

## Required rules

The slice must implement exactly these initial rule categories:

1. **Exact statutory text verification**
   - Verify the exact `GOVERNMENT WARNING:` heading.
   - Fuzzy matching may not silently approve the statutory heading.

2. **Semantic-equivalence comparison**
   - Compare the observed brand name with the expected value using bounded normalization for case, spacing, apostrophes, and limited punctuation.
   - Preserve both the original and normalized values.

3. **Numeric comparison**
   - Compare observed alcohol content against the expected application value.
   - Use an explicit, documented tolerance policy rather than an implicit or model-generated judgment.

## Architectural boundaries that remain mandatory

The architecture freeze does not suspend the governing principles already accepted.

The slice must preserve:

- AI and OCR as evidence extractors only;
- deterministic, versioned rule evaluation;
- a separate human disposition;
- evidence-only analyzer contracts;
- runtime schema validation;
- original evidence and normalized values as distinct data;
- explicit uncertainty and insufficient-evidence states;
- no user-facing mock presented as real analysis;
- no direct browser-to-model-provider calls;
- measured latency and explainable findings.

## Capture-quality coaching requirement

Before an external fallback is invoked, the workflow should attempt to reduce operator and mechanical error when image-quality evidence supports doing so.

The interface may coach the reviewer to:

- clean the camera lens;
- hold the camera steady;
- improve or reposition lighting;
- reduce glare;
- move closer;
- center the label;
- hold the camera parallel to the label.

Coaching should be tied to observed image-quality signals where practical. A coached retake may be attempted before cloud escalation, provided the workflow does not trap the reviewer in a retry loop.

## Freeze rules

Until this ADR's exit criteria are satisfied:

### Allowed work

- code required for the approved vertical slice;
- tests required to prove the slice;
- fixes to incomplete or contradictory existing documentation;
- narrow ADR clarifications that unblock implementation;
- security, accessibility, or data-handling corrections directly affecting the slice;
- measurement and observability required to evaluate the slice.

### Deferred work

- batch ingestion and queue orchestration;
- multi-engine OCR consensus;
- workflow coaching beyond capture-quality guidance required by the slice;
- generalized plugin frameworks;
- broad analytics or employee-progress systems;
- production identity federation;
- COLA integration;
- automated training pipelines;
- speculative optimization for scale not yet observed;
- additional provider integrations beyond the one provider needed for the slice;
- architectural expansion that does not resolve a demonstrated implementation constraint.

## Definition of done

The architecture freeze may be reconsidered only when all of the following are true:

- A reviewer can upload one real label image.
- A real extraction provider returns evidence through a typed, runtime-validated contract.
- The analyzer cannot emit a final regulatory verdict.
- All three required rules run against the extracted evidence.
- The report explains the observed evidence, normalization, rule applied, and resulting finding.
- Machine observation, deterministic finding, and human disposition are visibly and semantically distinct.
- The reviewer can correct extracted evidence and record a human disposition.
- Clean success, observed discrepancy, insufficient evidence, and extraction failure are tested.
- End-to-end latency and per-stage latency are recorded.
- Known failures and limitations are documented from actual execution.
- No user-facing result depends on a mock.

## Evidence required to lift the freeze

The implementation must produce:

1. working code;
2. automated test results;
3. at least one retained or reproducible non-sensitive fixture;
4. a sample explainable report;
5. measured runtime results;
6. a short implementation retrospective identifying which architectural assumptions survived, failed, or changed;
7. the next Rubber Duck Review based on working behavior rather than design promises.

## Consequences

### Positive

- Forces the architecture to become falsifiable.
- Prioritizes functional proof over speculative completeness.
- Exposes real data-contract, latency, UX, and provider limitations early.
- Reduces accidental complexity and architectural drift.
- Gives reviewers a clear, testable milestone.
- Preserves the architectural record while preventing it from outrunning implementation.

### Negative

- Valuable future features will be intentionally deferred.
- Some abstractions may initially remain narrower than their eventual production form.
- The first implementation may reveal that accepted architectural assumptions need revision.
- The team must resist adding adjacent capabilities that appear efficient but are not required for the slice.

## Review trigger

This ADR must be reviewed when the definition of done is satisfied or when implementation evidence proves that the approved slice cannot be completed without changing a frozen boundary.

A proposed exception must identify:

- the exact blocked step;
- the evidence showing why the current architecture cannot support it;
- the smallest change required;
- the tests that will validate the exception;
- and whether the change should remain after the slice is complete.

## Governing principle

Architecture now yields priority to proof.

The next faithful engineering move is to complete one real path from evidence intake to human decision, measure it, and let execution determine what deserves to be built next.
