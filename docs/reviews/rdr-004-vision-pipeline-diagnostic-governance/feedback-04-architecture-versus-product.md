# Feedback 04 — Architectural Success Versus Product Failure

- Status: Provisional review evidence
- Round: 4 of 6
- Source supplied by Joseph Walker on 2026-07-16
- Scope: Whether strong governance and diagnostic rigor are obscuring inadequate extraction usefulness, reliability, and reviewer-work reduction

> This file preserves one review input. It does not itself authorize implementation changes or establish the final RDR verdict.

## Executive summary

This feedback presents an explicit adversarial debate between two defensible positions:

1. **Architecture-first position.** Label Lens has built unusually strong boundaries around probabilistic perception: stateless observation, separate OCR, deterministic evaluation, append-only human authority, immutable benchmark artifacts, typed failure states, and authorization as code. Those structures make error inspectable and prevent unsupported machine outputs from silently becoming regulatory conclusions.
2. **Product-first position.** Strong containment and diagnostic sophistication may be obscuring the fact that the present perception system is not yet useful enough. Low exact-match performance, false certainty on absent-brand cases, side-text failures, and repeated zero-byte timeouts may leave reviewers doing as much or more work than before.

The round does not resolve the debate. It argues that architectural integrity and operational usefulness must be evaluated as separate dimensions and that neither can substitute for the other.

## Position A — The architecture is a legitimate engineering achievement

The feedback credits Label Lens for changing the AI's job from authoritative answer generation to bounded evidence production.

```text
stateless vision observer
  -> spatial observation
  -> local OCR transcription
  -> deterministic evaluation
  -> human review and disposition
```

The architecture intentionally prevents one model from simultaneously perceiving, transcribing, interpreting, and authorizing.

The round identifies several genuine strengths:

- fresh, stateless observer execution reduces cross-case contamination and hidden memory drift;
- OCR, vision observation, deterministic rules, and human disposition remain distinct;
- timeouts and execution failures are separated from model-quality failures;
- evaluation truth is isolated from production behavior;
- frozen corpus identity and append-only records preserve what was actually evaluated;
- authorization constants make consequential execution or prompt changes visible in code review;
- diagnostic attribution replaces emotionally blunt aggregate failure rates with mechanism-level evidence.

From this position, poor extraction performance does not invalidate the architecture. It demonstrates why containment and traceability are necessary while the perception components mature.

## Position B — Governance quality may be masking current product failure

The opposing position argues that a safe pipeline for low-quality evidence is still not a useful prescreen product.

The source highlights several operational concerns:

- roughly 13% exact brand match in the referenced corpus;
- 100% false-positive behavior across ten absent-brand cases in the referenced baseline;
- no successful handling of side, rotated, or vertical alcohol text in the cited slices;
- zero-byte observer timeouts at a 30-second boundary;
- large diagnostic schedules required to determine whether failures are deterministic, intermittent, or sequence-dependent;
- substantial engineering effort spent on taxonomy and attribution while reviewers may still need to reconstruct core label facts manually.

The core product challenge is:

> Does Label Lens reduce correction work and review time, or does it package machine error more safely without yet saving human effort?

The feedback treats false certainty as more dangerous than honest absence. A wrong but plausible brand suggestion may impose override cost, create automation bias, and require a reviewer to unlearn the machine's claim. An explicit not-observed or unresolved state may be operationally safer and faster.

## Shared conclusion — Architecture and product utility are separate axes

The debate converges on several points:

- strict boundaries, append-only authority, authorization as code, and immutable benchmark artifacts are real strengths;
- the current system must eventually read the relevant label evidence accurately enough to reduce human work;
- extraction accuracy alone is not sufficient, because black-box accuracy without auditability is unsuitable for regulated review;
- architecture quality alone is not sufficient, because a well-governed system that does not save work has not achieved its product purpose;
- false certainty, timeout burden, correction burden, and reviewer handling time belong in the same decision framework as accuracy and provenance.

A provisional two-axis assessment is therefore more honest than a single success/failure label:

```text
Axis 1: epistemic and governance integrity
Axis 2: operational usefulness and reliability
```

A system may score strongly on the first while remaining inadequate on the second.

## Reinforcement of causal-language findings

This round again criticizes the heading:

> Recovery passes that never improve outcomes

It agrees with rounds 1 and 3 that prefix-state marginal attribution at fixed pass order does not establish counterfactual dispensability.

The `left-edge-rotate-270` pass is again used as the example:

- it produced many new OCR tokens;
- it produced field-like evidence;
- it did not change the selected field at its measured prefix;
- the team correctly deferred pruning;
- therefore, the report should not convert a local marginal result into a universal claim of uselessness.

The debate's architecture-first voice defends the underlying metric and restraint, while the product-first voice criticizes the prose. These positions are compatible: the measurement may be useful while the summary language remains overbroad.

## Benchmark-design concerns reinforced

The feedback also reinforces the perception-layer blinding concern from rounds 2 and 3.

A 16-case, 64-trial calibration exercise with one primary reviewer may be acceptable as rubric calibration rather than a population claim. However, explicit metadata scrubbing does not prevent the reviewer from learning stylistic fingerprints across repeated outputs.

The round therefore preserves the distinction between:

- **data-layer blinding** — contract identifiers and forbidden metadata are removed;
- **perceptual blinding** — the reviewer cannot infer source identity from style, length, vocabulary, or formatting.

The first does not prove the second.

## Reliability and failure-state governance

The source praises the system for not converting infrastructure failures into model-quality failures. A zero-byte timeout should remain distinguishable from:

- incorrect spatial observation;
- OCR transcription error;
- parser rejection;
- rule-evaluation failure;
- unsupported certainty.

That distinction protects diagnostic validity.

However, operational classification does not erase user impact. A correctly typed 30-second timeout still matters to product viability. The final RDR should therefore preserve both facts:

```text
Diagnostic fact:
The timeout is not evidence that the model reasoned incorrectly.

Operational fact:
The timeout may still make the workflow too slow or unreliable.
```

## Provisional measurement framework suggested by this round

The final review should avoid choosing between governance purity and raw accuracy. It should evaluate at least four categories:

### 1. Evidence quality

- exact and normalized retrieval;
- candidate-region recall;
- absent-field false-positive rate;
- conflict detection;
- unsupported certainty.

### 2. Execution reliability

- completion rate;
- timeout rate;
- zero-byte response rate;
- median and tail latency;
- recurrence or sequence sensitivity.

### 3. Human workload

- reviewer overrides;
- seconds to classify;
- manual reconstruction required;
- applicant correction cycles;
- cases resolved before regulator review;
- automation-bias or false-certainty burden.

### 4. Governance integrity

- evidence provenance;
- state separation;
- append-only corrections;
- runtime validation;
- benchmark blinding;
- authorization visibility;
- reproducibility and digest integrity.

No one category should be allowed to hide failure in another.

## Questions reserved for six-round synthesis

1. What minimum operational improvement must the existing architecture demonstrate before new diagnostic or product scope is added?
2. Which referenced performance figures remain current for the exact branch and corpus under review?
3. How should false certainty be weighted relative to missed extraction and honest absence?
4. What completion-rate and latency thresholds are appropriate for a seller prescreen rather than a production regulator system?
5. Does the current diagnostic program consume disproportionate effort, or is it the necessary mechanism for targeted repair?
6. Which reliability investigations are reusable instruments, and which are one-off diagnostic debt?
7. What combined exit gate should require both governance integrity and measured reviewer-work reduction?
8. Should the final verdict distinguish architectural readiness, component readiness, benchmark readiness, and product readiness?

## Provisional disposition

This round provides credible evidence for a dual conclusion:

- Label Lens has built a strong architecture for containing and examining probabilistic failure.
- The architecture has not, by itself, established that the current perception workflow is operationally useful.

The final RDR should not dismiss governance as overengineering, but it should also prevent governance achievements from being used as a proxy for product readiness.
