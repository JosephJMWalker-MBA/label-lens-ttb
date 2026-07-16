# Feedback 01 — Causal Honesty in Vision-Pipeline Diagnostics

- Status: Provisional review evidence
- Round: 1 of 6
- Source supplied by Joseph Walker on 2026-07-16
- Scope: Prefix-marginal causal language, blinded-manifest runtime validation, and multi-causal diagnostic attribution

> This file preserves one review input. It does not itself authorize implementation changes or establish the final RDR verdict.

## Executive summary

This feedback identifies three governance risks in the current diagnostic and evaluation instrumentation surrounding the OCR and stateless vision-observer pipeline:

1. **Causal language exceeds the measurement design.** Prefix-state marginal attribution is being summarized with absolute language such as “never improves outcomes,” even though the measurement only establishes whether a pass changed the selected field at that specific point in the configured sequence.
2. **The blinded manifest boundary is not fully protected at runtime.** Compile-time TypeScript checks cannot prevent malformed or leakage-bearing JSON from entering a live evaluation path, and missing structures may produce raw runtime errors instead of structured validation issues.
3. **Single primary attribution can conceal multi-causal failures.** A mutually exclusive diagnostic bucket may satisfy aggregate accounting while hiding secondary mechanisms that must also be repaired.

The shared concern is diagnostic honesty: telemetry should support safe engineering decisions without overstating causality, accepting structurally unsafe data, or simplifying overlapping failure mechanisms into misleading singular explanations.

## Finding 1 — Prefix-marginal evidence is being described as an absolute outcome claim

### Measurement described by the feedback

The recovery pipeline executes multiple passes in sequence. For a pass at position `n`, the harness compares the selected field state after prefix `n - 1` with the selected field state after prefix `n`.

The measured quantity is therefore local:

```text
selected state before pass n
  -> run pass n
  -> selected state after pass n
  -> attribute an immediate prefix delta, if any
```

If a pass produces new OCR tokens or field-like evidence but does not change the winning selected field at that exact prefix, its corrected-selection count remains zero.

### Risk

A heading such as:

> Recovery passes that never improve outcomes

turns a bounded historical measurement into an untested counterfactual claim.

The feedback uses the `left-edge-rotate-270` pass as the central example:

- executed 57 times;
- produced new OCR tokens 55 times;
- produced field-like evidence 14 times;
- did not independently flip the selected field at its measured prefix.

Those facts may establish that the pass did not create an immediate selected-field correction under the current sequence, corpus, and ranker. They do **not** establish that the pass is globally useless, that removing it would preserve downstream behavior, or that future ranking changes would not use the evidence it generated.

### Engineering hazard

Future maintainers may read the absolute wording as permission to prune the pass. That would destroy evidence production before its counterfactual necessity has been tested.

The distinction is:

```text
Observed:
The pass changed no selected field at its prefix in this corpus.

Not established:
The pipeline would behave equivalently if the pass were removed.
```

### Provisional remedies proposed by this round

- Rename absolute report sections to language bounded by the actual methodology, for example:

  > Recovery passes that changed no selected field at their prefix in this corpus

- Add a methodology note explaining that a pass may produce new or field-like evidence without changing the current selected value.
- State explicitly that counterfactual necessity is untested unless a removal, permutation, or controlled ablation experiment was performed.
- Preserve separate measurements for:
  - pass execution count;
  - new-token production;
  - field-like evidence production;
  - immediate selected-field correction;
  - downstream use, where measurable.
- Consider glossary text or report tooltips so readers do not interpret prefix marginal attribution as total causal contribution.

## Finding 2 — The blinded corpus manifest requires total, strict runtime validation

### Boundary described by the feedback

The observation-quality corpus manifest is intended to be a frozen, digest-backed record used in a blinded comparison between model contracts such as `A` and `A_PRIME`.

Human scorers must not receive contract identity, hidden scores, or other information capable of biasing review.

### Risks identified

#### Non-total handling of malformed structures

If a required top-level structure such as `cases` is absent, validation may dereference it and throw a raw runtime error rather than returning a structured validation issue.

A blinding gate should be total over arbitrary parsed JSON:

```text
any runtime input
  -> valid manifest, or
  -> bounded structured issue list
```

It should not crash merely because a malformed input lacks an expected property.

#### Unknown properties are not necessarily rejected at runtime

Compile-time TypeScript assertions can prove that repository-authored typed fixtures do not contain forbidden fields. They cannot protect a runtime JSON ingestion boundary.

A payload generated by another language, script, external process, or future API can include an undeclared key such as:

```json
{
  "contract": "A_PRIME"
}
```

If unknown keys are ignored, leakage can become part of the frozen artifact and compromise scorer blinding.

### Governance significance

For a blinded benchmark, unknown-property rejection is not stylistic schema strictness. It is part of experimental validity.

The gate should fail closed against:

- contract identifiers;
- model/provider identifiers not explicitly authorized;
- hidden scores;
- ranking outcomes;
- reviewer hints;
- undeclared metadata;
- malformed top-level or nested structures.

### Provisional remedies proposed by this round

- Implement strict runtime schema validation using an exact-object validator, JSON Schema, Zod-style strict objects, or an equivalent custom validator.
- Reject unknown properties at every governed object boundary, not only at the root.
- Return structured issues rather than raw exceptions for absent, mistyped, or malformed properties.
- Keep compile-time tests, but treat them as an additional developer aid rather than the runtime security boundary.
- Add adversarial runtime tests using plain parsed JSON rather than only TypeScript literals.
- Verify that rejected payloads cannot be hashed, frozen, or exposed to a scorer.
- Preserve deterministic issue ordering so validation failures remain reproducible.

## Finding 3 — Mutually exclusive primary attribution masks contributing failure mechanisms

### Current diagnostic pattern described by the feedback

Candidate-filtering diagnostics use precedence to assign exactly one category to each failure. This produces clean aggregate reconciliation, such as accounting for all 73 failures in mutually exclusive buckets.

Example:

```text
if parser rejected:
  classify as unsupported pattern
else if another condition:
  classify as ...
```

### Risk

A candidate can fail for more than one mechanically relevant reason.

For example, the same text may involve:

- parser rejection;
- an unsupported pattern;
- token fragmentation;
- normalization failure;
- region or orientation limitations.

Selecting one bucket may be useful for aggregate reporting, but presenting it as the singular cause hides compounding repair requirements.

### Engineering hazard

A maintainer may repair the displayed primary category, rerun the benchmark, and find that the same cases remain unresolved because a secondary condition was always present but unreported.

The telemetry remains numerically reconciled while accumulating hidden context debt.

### Provisional remedies proposed by this round

Preserve the one-to-one aggregate invariant, but make the precedence explicit:

```json
{
  "primaryAttributionMechanism": "unsupported_pattern",
  "contributingFactors": [
    "parser_rejected"
  ]
}
```

Recommended reporting changes include:

- Rename singular columns or headings to **primary attribution mechanism**.
- Add an optional, versioned `contributingFactors` array.
- Preserve deterministic precedence for the primary field.
- Define whether contributing factors are observed conditions, inferred mechanisms, or both.
- Prevent secondary factors from changing the primary aggregate totals unless a separate multi-label report is requested.
- Add overlap matrices or case-level drill-down views for engineering diagnosis.

## Cross-cutting principle

The review round argues that diagnostic instruments shape engineering priorities. Therefore, the instrument itself must be governed as carefully as the production pipeline.

Three forms of misleading simplification are highlighted:

```text
local marginal measurement
  -> falsely absolute causal statement

compile-time shape assumption
  -> falsely trusted runtime boundary

primary precedence category
  -> falsely singular causal explanation
```

The common requirement is to preserve the exact scope of what the evidence establishes.

## Questions reserved for six-round synthesis

1. Which current report headings or generated explanations exceed the actual prefix-marginal methodology?
2. Do existing permutation or recurrence diagnostics already answer part of the counterfactual-removal question?
3. What exact manifest objects require unknown-key rejection, and are there any intentionally extensible metadata regions?
4. Should malformed manifest validation return one issue, all reachable issues, or a bounded combination?
5. Which candidate-filtering categories are mechanisms, which are symptoms, and which may validly co-occur?
6. Is `contributingFactors` sufficient, or is a causal graph / stage-by-stage failure trace required?
7. Which proposed fixes are documentation-only, schema-affecting, benchmark-affecting, or production-affecting?

## Provisional disposition

This round provides credible evidence of three review-worthy weaknesses, but the final RDR should wait for all six inputs before deciding:

- whether any current production or evaluation claim is materially invalid;
- whether the manifest validator requires immediate code changes;
- whether the attribution schema should change;
- whether existing diagnostic phases already mitigate any cited risk;
- and how to order remediation without contaminating the active benchmark.
