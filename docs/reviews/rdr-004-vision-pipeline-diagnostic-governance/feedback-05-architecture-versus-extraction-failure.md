# Feedback 05 — Architecture Versus Extraction Failure

- Status: Provisional review evidence
- Round: 5 of 6
- Source supplied by Joseph Walker on 2026-07-16
- Scope: Whether epistemic and governance rigor is enabling extractor repair or masking insufficient product utility

> This file preserves one review input. It does not itself authorize implementation changes, product expansion, deployment, pruning, or extractor retuning.

## Executive summary

This round presents a direct debate between two interpretations of the current Label Lens TTB state.

The first argues that the project has crossed from ordinary software engineering into scientific engineering by building a stateless, bounded, evidence-producing perception pipeline with immutable evaluation records, typed failure states, deterministic rules, explicit human authority, and diagnostic attribution capable of turning blunt aggregate failure into targeted repair work.

The second argues that this architecture may be functioning as a shield around severe extraction failures: low exact-match and recall figures, a reported 100% false-positive rate on absent-brand cases, failure on rotated or vertical text, and zero-byte observer timeouts. On this view, a perfectly governed pipeline for unreliable evidence is not yet a viable product.

The round therefore reinforces a two-axis evaluation:

```text
architectural integrity
  !=
operational usefulness
```

Both must be demonstrated. Strong governance neither cures weak extraction nor becomes irrelevant merely because extraction is weak.

## Position A — The measurement architecture is a genuine achievement

The defense emphasizes the following architectural strengths:

- stateless observer execution prevents cache poisoning, memory drift, and self-reinforcing conversational context;
- the vision observer is constrained to proposing spatial observations rather than transcribing text or issuing regulatory conclusions;
- OCR remains an independent textual skeptic;
- deterministic rules remain separate from probabilistic perception;
- typed execution failures prevent timeouts and zero-byte responses from being misreported as OCR or model-quality failures;
- immutable corpus artifacts prevent retrospective test manipulation;
- authorization-as-code prevents accidental real execution or prompt changes;
- human authority remains explicit and append-only.

The round argues that accurate failure classification is a prerequisite to responsible extractor repair. Aggregate metrics such as low exact-match rates identify a problem, while mechanism-level diagnostics identify where engineering effort should be directed.

## Position B — Architectural cleanliness may be masking product failure

The opposing position emphasizes that the product must eventually read the label and save human work.

The source repeats several severe reported limitations:

- approximately 13% exact brand match;
- approximately 37% alcohol detection recall;
- a reported 100% false-positive rate on absent-brand labels;
- failure on side, rotated, vertical, or split-token layouts;
- observer requests that can time out after 30 seconds with zero bytes.

These figures and failure modes are presented as evidence that the current system may create reviewer correction burden rather than reduce it.

The core warning is:

> A secure, immutable, explainable pipeline can still package bad evidence beautifully.

The round rejects treating diagnostic sophistication as a proxy for product readiness. It argues that abstention quality, extraction accuracy, latency, completion rate, reviewer override burden, and time saved must become explicit gates before seller-facing expansion.

## Finding 1 — Diagnostic rigor and extraction repair must be sequenced together

The round contains a productive disagreement about priority.

One side argues:

```text
measurement must be trustworthy
  -> then repair can be targeted
```

The other argues:

```text
the measurement system is already sufficiently elaborate
  -> direct more effort toward the failing extractor
```

The final RDR should not resolve this by selecting one side categorically. It should identify the smallest diagnostic sufficiency threshold needed to support repair, then require that subsequent work produce measurable operational improvement rather than indefinitely expanding the diagnostic apparatus.

## Finding 2 — False certainty is the most serious product risk

The source repeatedly returns to absent-brand false positives as the clearest safety and workflow hazard.

A missed or honestly unresolved field is visible to a reviewer. A plausible but incorrect machine-selected brand can create automation bias, additional correction work, and an unsupported sense of certainty.

The round therefore reinforces the need for:

- a structurally valid abstention or no-defensible-candidate state;
- separate measurement of false certainty from ordinary recall failure;
- reviewer override counts;
- cases requiring machine-output unlearning;
- applicant or seller correction before regulator review;
- no expansion to conversational or seller-assistance surfaces until the system can decline unsupported extraction.

## Finding 3 — Typed timeouts preserve truth but remain operational failures

The round credits the architecture for separating execution failure from model-quality failure. A zero-byte timeout should not contaminate OCR, rule, or observation-quality measurements.

However, the review also insists that classification is not remediation.

A user-facing prescreen cannot be considered useful merely because a 30-second timeout is accurately labeled. The product evaluation must measure:

- request completion rate;
- median and tail latency;
- timeout recurrence;
- retry burden;
- whether failures are deterministic, intermittent, or sequence-dependent;
- effect on total seller or reviewer handling time.

## Finding 4 — Prefix-marginal diagnostics remain useful but bounded

This round largely aligns with rounds 1, 3, and 4.

It accepts prefix-state marginal attribution as a useful diagnostic for the configured sequence, but rejects interpreting it as proof of counterfactual necessity or dispensability.

The source uses the `left-edge-rotate-270` pass again:

- it reportedly executed 57 times;
- produced new OCR tokens in 55 executions;
- produced no immediate changed or corrected selection at its measured prefix;
- incurred substantial runtime cost.

The round praises the decision not to prune it immediately. It argues that pruning should wait for ablation, permutation, downstream-dependence, or other evidence capable of testing removal rather than only local marginal contribution.

## Finding 5 — Product expansion should remain subordinate to core evidence usefulness

The source criticizes planning for retrieval chat, label builders, seller portals, and other future surfaces while core brand and alcohol extraction remain unreliable.

The final RDR should distinguish harmless future planning from implementation priority. Planning documents need not be deleted, but execution should remain gated by evidence that the current brand-and-alcohol workflow:

- abstains safely;
- completes reliably;
- retrieves declared values or conflicts accurately;
- materially reduces seller or reviewer work;
- does not increase false passes or unsupported certainty.

## Factual and cross-round discrepancies requiring verification

This round contains claims that conflict with other feedback artifacts or previously recorded repository state.

### Candidate-filtering counts

Round 4 cited one breakdown of candidate-filtering failures, while round 5 cites different counts and labels. These figures must be verified against the committed evaluation artifact before appearing in the final source brief or verdict.

### Annotator identity and separation of duties

Round 5 describes independent annotator IDs and selector-versus-annotator separation as already required by the corpus rules.

Round 3 identified the absence of an annotator ID in the frozen case schema as a weakness and proposed adding it.

The final synthesis must inspect the current branch and relevant schema version to determine whether:

- the field was already present;
- it was added after the source reviewed an earlier state;
- the source conflated a proposal with implementation;
- separation is documented but not enforced;
- or the rounds refer to different artifacts.

No final finding should assume either account is correct without repository verification.

## Cross-round relationships

### Reinforces earlier rounds

- Reinforces round 4 that architecture and product usefulness are distinct dimensions.
- Reinforces rounds 1, 3, and 4 that prefix-marginal data does not prove removability.
- Reinforces round 2 that stateless execution, evidence role separation, typed failure states, and authorization as code are meaningful strengths.
- Reinforces rounds 2 and 4 that false certainty is more dangerous than honest abstention.
- Reinforces round 4 that operational completion, latency, accuracy, and reviewer-work reduction must be measured directly.

### Preserves disagreement

The broader tension remains unresolved:

```text
Is diagnostic rigor the necessary instrument for targeted repair?

or

Has the instrument become elaborate enough that further diagnostic work risks delaying direct extractor improvement?
```

The final review should answer this through an ordered plan with explicit stop conditions for additional instrumentation.

## Questions reserved for six-round synthesis

1. What is the minimum additional diagnostic work required before bounded extractor repair is justified?
2. Which extraction failures can be repaired directly from existing evidence?
3. What abstention and false-certainty thresholds should gate seller-facing workflows?
4. What completion-rate and latency targets are required for the observer to remain in the interactive path?
5. Which reported counts are authoritative in the committed evaluation artifacts?
6. Is annotator identity and separation of duties currently enforced in code, proposed only, or partially implemented?
7. Which planned product surfaces should remain documentation-only until the core workflow reduces human effort?
8. What evidence would demonstrate that the diagnostic system is enabling rather than substituting for repair?

## Provisional disposition

This round provides strong evidence that Label Lens TTB should preserve its governance and evidence architecture while refusing to treat that architecture as proof of product readiness.

The final verdict should likely require both:

```text
preserve the trustworthy measurement and authority boundaries
  +
force the next implementation sequence to improve abstention, extraction reliability, completion, latency, and human-work reduction
```

That conclusion remains provisional until round 6 is received and all factual discrepancies are verified.