# Engineering Constitution

## Purpose

This document defines the principles that govern architectural, implementation, testing, security, and product decisions for Label Lens TTB.

The prototype is not only expected to work. It should remain understandable, measurable, secure by default, and safe to improve.

## Core Principles

### 1. Evidence Before Assumption

The system must distinguish observed evidence from inferred conclusions.

- OCR output is evidence, not truth.
- Confidence must be supported by measurable signals.
- Ambiguity must be preserved and surfaced.
- Unknowns must never be silently converted into passes.

### 2. AI Extracts; Rules Decide

Probabilistic components may identify text, regions, and candidate values.

Deterministic components must apply compliance logic.

The AI layer must not independently determine whether a label is compliant.

### 3. Humans Remain Authoritative

The system assists reviewers; it does not replace accountable human judgment.

- Human reviewers can confirm or correct extracted values.
- Corrections become governed evidence, not immediate production truth.
- Critical uncertainty routes to human review.

### 4. Every Decision Must Be Explainable

Every finding must identify:

- What was expected
- What was observed
- What normalization was applied
- Which rule was evaluated
- Why the status was assigned
- What evidence or limitation affected confidence

### 5. Performance Is Part of Correctness

A system that agents will not use provides no operational value.

- Median performance should target less than two seconds.
- The p95 target must remain below five seconds.
- Performance improvements must not weaken critical validation.
- Slow stages must be measurable and identifiable.

### 6. Accessibility Is a Functional Requirement

The interface must support users with varied technical comfort and ability.

- No information may depend on color alone.
- Primary actions must be obvious.
- Keyboard and assistive-technology use must be supported.
- Every screen must make the next step clear.

### 7. Security and Privacy Are Default Behaviors

- Uploaded images are processed ephemerally unless retention is explicitly configured.
- Secrets remain server-side.
- Sensitive content is excluded from logs.
- External service dependencies are replaceable and optional.
- Local and restricted-network operation must remain viable.

### 8. Improvements Must Be Measured

No tuning change is accepted because it feels better.

Every change must be evaluated against:

- Accuracy
- False-pass rate
- Critical-rule performance
- Latency
- Regression results
- Accessibility
- Security boundaries

### 9. The System Does Not Promote Itself

Models, rules, thresholds, and management guidance require governed promotion.

- Production models do not retrain automatically.
- Human-reviewed examples enter a candidate dataset.
- Candidate changes must pass holdout and regression evaluation.
- Promotion requires recorded approval.

### 10. The Repository Must Teach

The repository is institutional memory.

A future engineer should be able to trace:

```text
Stakeholder need
    ↓
Requirement
    ↓
Architecture decision
    ↓
Implementation
    ↓
Tests
    ↓
Measured outcome
```

## Decision Test

Before accepting a change, ask:

1. Does this improve evidence quality or workflow value?
2. Does it preserve deterministic compliance logic?
3. Does it introduce hidden coupling or an avoidable external dependency?
4. Can the behavior be tested and measured?
5. Can a reviewer understand why the system produced its result?
6. Does the change preserve accessibility, security, and performance budgets?
7. Will the next engineer understand why this decision was made?

## Non-Negotiable Boundaries

The prototype must not:

- Claim production certification or authorization
- Represent uncertain evidence as verified fact
- Allow an AI model to create or modify compliance policy
- Automatically promote a model or ruleset
- Require direct COLA integration
- Require outbound cloud connectivity to perform core verification
- Hide failures behind a generic success state

## Guiding Standard

Build narrow enough to finish, rigorous enough to trust, and clear enough for the next person to improve.