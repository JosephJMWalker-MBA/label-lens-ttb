# Feedback 02 — Evidence-Producing Architecture and Governance as Code

- Status: Provisional review evidence
- Round: 2 of 6
- Source supplied by Joseph Walker on 2026-07-16
- Scope: Role-separated perception, honest uncertainty, stateless execution, recovery-pass telemetry, benchmark blinding, and authorization as code

> This file preserves one review input. It does not itself authorize implementation changes or establish the final RDR verdict.

## Executive summary

This feedback presents Label Lens as an evidence-producing system designed to prevent probabilistic components from silently becoming regulatory authorities. It praises the separation of perception, transcription, deterministic evaluation, and human judgment; the use of explicit uncertainty states; stateless execution; blinded evaluation; and authorization gates encoded visibly in the repository.

The review also contains claims that must remain provisional. In particular, it describes a recovery pass with zero prefix-state corrections as mathematically useless, even though Feedback 01 argues that prefix-marginal measurement does not establish counterfactual dispensability. This disagreement is material and must be preserved for six-round synthesis rather than silently resolved.

## Finding 1 — Hallucination resistance begins with role and authority separation

The feedback identifies the central anti-hallucination design decision as changing the machine's job from producing a final answer to producing bounded evidence.

The described responsibility split is:

```text
stateless vision observer
  -> identifies bounded visual regions or conditions

OCR
  -> attempts transcription from pixels or selected regions

deterministic rules
  -> evaluate structured evidence against explicit requirements

human reviewer
  -> remains accountable and authoritative
```

No probabilistic component is authorized to perceive, transcribe, interpret, validate, and decide in one step.

### Governance significance

The review argues that stripping authority from the AI is more important than making it sound certain. A useful machine output may be:

- a coordinate;
- an OCR candidate;
- an uncertainty state;
- a conflict;
- a missing-evidence condition;
- a bounded finding requiring human attention.

The system should not manufacture a complete answer merely because the interface expects one.

## Finding 2 — Honest absence is a necessary terminal state

The feedback highlights the earlier absent-brand diagnostic in which the extractor produced brand-like output for all ten cases where no defensible brand was present.

The key lesson is that a system structurally biased toward returning some value will convert unrelated text into false certainty.

The review praises the addition of a neutral terminal subtype for cases where the diagnostic pipeline cannot isolate a defensible cause or candidate. The broader principle is:

> A governed system must have an executable path for saying that it does not know.

### Provisional implications

- Absence, ambiguity, and unattributed failure should be first-class states.
- Neutral states should not be presented as successful extraction.
- A blank or unresolved result may be operationally safer than a plausible but unsupported value.
- Human correction should append to, not overwrite, the original machine state.
- Evaluation should distinguish honest abstention from infrastructure failure and model-quality failure.

## Finding 3 — Stateless observation is framed as contamination control

The review describes the vision observer as stateless: every image is evaluated without retained case memory or hidden accumulation from prior labels.

The stated rationale is to reduce:

- cache poisoning;
- cross-case contamination;
- expectation drift;
- stylistic or positional priors learned from earlier cases;
- hidden dependence on previous evaluation context.

### Boundary requiring later verification

The final RDR should distinguish among several different meanings of statelessness:

```text
no conversational memory
no cross-request application cache
no hidden retained evidence between cases
no deterministic reuse of immutable model weights
no benchmark leakage through ordering or metadata
```

These are not equivalent. The source's conceptual claim is useful, but the final record should state exactly which forms of state are prohibited, controlled, or merely absent in the current implementation.

## Finding 4 — Recovery-pass telemetry must measure decisions, not activity alone

The source contrasts evidence production with selected-field impact. Its main example is `left-edge-rotate-270`:

- 57 executions;
- approximately 44.5 seconds of total execution time;
- 55 executions producing new OCR tokens;
- zero accepted candidates;
- zero changed selections;
- zero corrected selections under the measured prefix-state method.

The review correctly warns that token volume alone is not evidence of product value. Compute-intensive passes should not be celebrated solely because they generate more text.

It recommends outcome-oriented measurements such as:

- selected-field changes;
- corrected selections;
- cost per correction;
- accepted-candidate contribution;
- execution time;
- reviewer-work reduction.

## Material disagreement with Feedback 01

The source goes further and characterizes the pass as proven mathematically useless or as producing only noise. That claim exceeds what the cited prefix-state marginal measurement necessarily establishes.

Feedback 01 preserves the narrower statement:

```text
Established:
The pass changed no selected field at its measured prefix in this corpus.

Not established without ablation or permutation:
The pipeline would behave equivalently if the pass were removed.
```

This disagreement must remain explicit.

### Six-round synthesis question

Should recovery passes be evaluated through a hierarchy such as:

```text
evidence production
  -> candidate construction
  -> ranking influence
  -> immediate prefix change
  -> downstream dependence
  -> counterfactual ablation value
  -> operational value per unit cost
```

Such a hierarchy could preserve the source's concern about wasted compute without converting local marginal evidence into an unsupported deletion claim.

## Finding 5 — Benchmark blinding must protect against stylistic fingerprints

The review argues that hiding explicit model names is insufficient. A scorer may infer contract identity from recurring output style, including:

- capitalization;
- punctuation;
- wording conventions;
- rationale structure;
- formatting;
- transcription habits;
- provider-specific failure language.

The feedback praises forbidden-language and output-neutralization controls intended to prevent these tells from unblinding a human scorer.

### Provisional requirements

- Blinding should cover explicit identity fields and indirect stylistic leakage.
- Execution failures must remain distinct from model-quality scores.
- Scorer-visible artifacts should contain only authorized evaluation content.
- Scrubbing or canonicalization rules must themselves be deterministic and versioned.
- Blinding transformations must not alter the substantive observation being scored.
- Runtime validation must reject undeclared identity-bearing fields, consistent with Feedback 01.

## Finding 6 — Governance and authorization should be visible in code review

The source praises explicit constants such as conceptual forms of:

```text
REAL_EXECUTION_AUTHORIZED = false
PRODUCTION_PROMPT_CHANGE_AUTHORIZED = false
```

The purpose is not secrecy. It is to make consequential authorization changes visible in a diff and difficult to trigger accidentally.

### Governance value

This approach can:

- fail closed by default;
- separate experimental artifacts from production behavior;
- require an intentional code change before real execution;
- give reviewers a precise authorization line to inspect;
- preserve an auditable transition from prohibited to permitted action.

### Limits to examine later

A hard-coded false constant is not by itself a complete authorization system. The final RDR should examine:

- who may change the flag;
- required reviewers or branch protection;
- whether CI verifies the authorized state;
- whether runtime configuration can bypass the constant;
- whether authorization applies to data access, prompts, model invocation, publication, and production independently;
- whether the flag records the authority basis or merely the current state.

## Finding 7 — Multi-voice review is used as an anti-groupthink mechanism

The source describes adversarial review voices such as prosecutor, defender, and analyst. Their function is to prevent one attractive metric or engineering narrative from controlling the decision.

The useful pattern is:

```text
one voice challenges cost, risk, and failure
one voice presents the strongest defense
one voice reconciles claims against the measurement design
```

The RDR process should preserve genuine disagreement rather than treating the voices as theater that must converge.

## Cross-cutting strengths identified by this round

The review strongly supports the following architectural principles:

1. AI and OCR produce evidence, not regulatory authority.
2. Deterministic rules operate on governed evidence.
3. Humans retain final authority.
4. Honest uncertainty is preferable to unsupported certainty.
5. Original machine output is preserved when humans correct it.
6. Infrastructure failure is not model-quality failure.
7. Evaluation blinding must account for indirect identity leakage.
8. Authorization boundaries should fail closed and appear in reviewable code.
9. Compute activity should not be confused with corrected outcomes.
10. Restraint and auditability are part of innovation in a high-stakes system.

## Claims requiring caution or verification

This round also includes several statements that should not be adopted without verification:

- that the vision observer is structurally incapable of transcription rather than merely instructed not to transcribe;
- that statelessness fully eliminates bias or expectation effects;
- that an unattributed subtype alone prevents unsupported candidate selection;
- that `left-edge-rotate-270` is proven useless rather than locally non-corrective;
- that generated tokens are meaningless whenever they do not immediately change selection;
- that current blinding scrubbers fully neutralize model fingerprints;
- that hard-coded authorization constants cannot be bypassed elsewhere;
- that the system has mathematically stopped hallucination rather than bounded and exposed specific failure modes.

The final language should prefer:

> Label Lens is designed to contain, expose, and reduce unsupported machine certainty.

rather than:

> Label Lens has eliminated hallucinations.

## Questions reserved for six-round synthesis

1. What exact capabilities are prohibited by schema, code, prompt contract, or policy for the vision observer?
2. Which state surfaces are reset per case, and which immutable or cached artifacts remain?
3. How should honest abstention be scored relative to false positives, false negatives, and execution failures?
4. What experiments are required before pruning a zero-prefix-contribution recovery pass?
5. Does output canonicalization preserve observation meaning while removing stylistic identity cues?
6. Are forbidden-language rules total over nested runtime objects and generated reports?
7. What repository controls make authorization constants enforceable rather than documentary?
8. Should RDR voices map to formal required claims, counterclaims, evidence, and unresolved disagreement fields?
9. Which anti-hallucination claims are demonstrated by tests, and which remain architectural intentions?
10. How should seller-facing language explain uncertainty without overstating machine incapacity or certainty?

## Provisional disposition

This round provides strong support for the existing evidence-producing architecture and its governance direction. It does not justify declaring hallucination solved, authorizing recovery-pass pruning, or treating conceptual safeguards as fully verified implementation guarantees.

The most important cross-round issue introduced here is the conflict between:

- measuring recovery passes by corrected outcomes and operational cost; and
- preserving causal honesty about what prefix-marginal evidence can and cannot prove.

That conflict should be resolved only after all six rounds are available.