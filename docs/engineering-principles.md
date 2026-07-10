# Engineering Principles

These principles govern architecture, implementation, review, and future changes to Label Lens TTB.

## 1. Evidence Over Assumption

The system must preserve and expose the evidence behind every finding.

- OCR output is evidence, not truth.
- Confidence must be earned from multiple signals.
- Uncertain evidence must remain visible.
- Alternate interpretations should not be discarded silently.

## 2. Deterministic Validation Over Probabilistic Approval

Probabilistic systems may extract and classify evidence. Deterministic rules decide whether that evidence satisfies known requirements.

- AI does not define compliance policy.
- AI does not autonomously approve labels.
- Compliance rules must be versioned, testable, and explainable.
- Critical requirements must not depend on a generative model response.

## 3. Humans Remain Authoritative

The system augments compliance professionals; it does not replace their judgment.

- Low-confidence findings must route to human review.
- Human corrections become reviewed evidence, not immediate truth.
- Production model changes require explicit approval.
- The system must make disagreement easy to identify and resolve.

## 4. Performance Is Part of Correctness

A system that is too slow to use has no operational value.

- Median processing should target under two seconds.
- The p95 target is under five seconds.
- Slow stages must be observable.
- Performance improvements may not weaken evidence quality or increase false passes.

## 5. Accessibility Is a Requirement

The interface must work for users with varied technical comfort, age, ability, and assistive technology.

- No critical action should require hunting through menus.
- Keyboard navigation and screen-reader support are mandatory.
- Color must never be the only indicator of status.
- Coach guidance must reduce cognitive load without blocking experienced users.

## 6. Unknowns Must Be Surfaced

The system must distinguish between verified, likely, ambiguous, missing, and unobservable.

- Unknown is a valid result.
- The system must never manufacture confidence.
- Image-quality limitations must be reported directly.
- A safe request for review is preferable to an unsupported pass.

## 7. Every Improvement Must Be Measurable

Changes must be evaluated against a versioned fixture corpus and a known baseline.

- Accuracy changes require before-and-after metrics.
- Performance changes require stage-level timing.
- No improvement is accepted if it creates a critical regression.
- False-pass rate receives higher priority than aggregate accuracy.

## 8. Components Must Be Replaceable

The architecture must avoid binding the product to one model, OCR engine, cloud provider, or deployment environment.

- Analysis providers share a stable contract.
- Local, on-premises, and cloud inference are implementation choices.
- The browser never depends directly on a model provider.
- Rules and governance remain independent of extraction technology.

## 9. Security Begins With Data Minimization

The safest sensitive data is data the system never retains.

- Uploaded images are processed ephemerally by default.
- Secrets remain server-side.
- Logs exclude full images, raw sensitive content, and credentials.
- Retention must be explicit, configurable, and documented.

## 10. The Repository Must Preserve Institutional Knowledge

The repository should teach the next implementer how and why the system evolved.

- Significant decisions require Architecture Decision Records.
- Improvements should document the problem, evidence, result, and decision.
- Tests preserve resolved failure modes.
- Documentation changes are part of feature completion.

## 11. Policy Must Be Separated From Mechanism

Technical components process evidence. Policy determines acceptable thresholds and required actions.

- Governance thresholds are configurable and versioned.
- Management guidance is authoritative content, not model-generated policy.
- Policy changes require review and audit history.
- Mechanism changes must not silently alter policy outcomes.

## 12. Safe Failure Is a Designed Outcome

Failures must be contained, observable, and actionable.

- One failed batch item must not stop the batch.
- Dependency outages must degrade gracefully.
- Errors must identify the failed stage and recommended next action.
- Recovery behavior must be tested.

## Pull Request Standard

Every meaningful change should answer:

1. Which principle does this change advance?
2. What evidence shows the change works?
3. What new failure modes were introduced?
4. Which tests protect the behavior?
5. Can the change be reversed safely?

A change that cannot answer these questions is not ready to merge.
