# Feedback 03 — Human-Proofing the Evaluation Architecture

- Status: Provisional review evidence
- Round: 3 of 6
- Source supplied by Joseph Walker on 2026-07-16
- Scope: Perceptual unblinding, causal-language discipline, annotator independence, and digest-scope clarity

> This file preserves one review input. It does not itself authorize implementation changes or establish the final RDR verdict.

## Executive summary

This round identifies four risks created by the interaction between mathematically disciplined artifacts and human cognition or maintenance behavior:

1. Structural blinding may still fail at the perception layer when one reviewer sees enough outputs to learn contract-specific style.
2. Prefix-state marginal measurements must not be described as proof that a recovery pass is causally dispensable.
3. Frozen corpus cases need explicit annotator provenance and a documented separation-of-duties model to avoid circular validation.
4. Digest naming must state exactly what is cryptographically bound so future maintainers do not “repair” intentional lifecycle exclusions.

## Finding 1 — Structural blinding does not prove perceptual blinding

The observation-quality benchmark presents 64 trials to one primary reviewer. Even when contract identifiers and forbidden metadata are removed, repeated exposure may reveal stylistic fingerprints such as output length, whitespace, vocabulary, formatting, or edge-case phrasing.

The risk is subconscious unblinding rather than explicit leakage. A reviewer may infer which contract produced an output and score it differently without intending to do so.

### Provisional remedies proposed by this round

- Ask the reviewer after scoring whether contract identity became guessable and record the response.
- Record a pre-unblinding seal or hash and an explicit unblinding event.
- Measure stylistic guessability rather than assuming metadata removal is sufficient.
- Split trials across multiple reviewers or shorter sessions so no reviewer receives enough repeated exposure to learn the contracts.
- Consider presentation normalization only as one control; vocabulary and content style may still leak identity.

### Open methodological questions

- Is reviewer contract-guess accuracy meaningfully above chance?
- Can outputs be normalized without changing the evidence being scored?
- Does dividing the benchmark across reviewers create inter-rater variance requiring its own calibration?
- Is a single-reviewer calibration corpus intentionally exempt from independence requirements, and if so, is that limitation visible in the artifact?

## Finding 2 — Causal prose must remain bounded by prefix-state marginal attribution

This round reinforces feedback 01. A recovery pass can produce tokens or field-like evidence without changing the selected field at its configured prefix. That result does not establish that the pipeline would behave equivalently if the pass were removed.

Safer language includes:

> Recovery passes that changed no selected field on this corpus.

A methodology note should state that contribution is measured as prefix-state marginal change at fixed pass order and is not a counterfactual-necessity test.

This reinforces round 1 and contradicts round 2’s stronger “mathematically useless” characterization. The final synthesis must preserve that distinction.

## Finding 3 — Frozen corpus cases need annotator provenance

The source argues that `selectedBy` identifies who included a case but does not prove who annotated its expected truth or opportunity state. Selection, annotation, and final scoring are different acts.

Without explicit annotation provenance, a frozen artifact cannot demonstrate whether the same person selected a case, authored its truth, and scored the model output. That creates a risk of circular validation or self-certification.

### Provisional schema direction

Candidate fields include:

```json
{
  "selectedBy": "reviewer-a",
  "opportunityAnnotatedBy": "reviewer-b",
  "annotationTimestamp": "...",
  "annotationMethodVersion": "..."
}
```

Potential validation rules:

- require annotation provenance before freeze;
- return structured validation issues for missing provenance;
- define whether `selectedBy !== opportunityAnnotatedBy` is mandatory, recommended, or phase-dependent;
- document any calibration-phase exception rather than silently permitting it;
- preserve later corrections append-only.

### Important caution

This round proposes strict separation of duties, but the final RDR should not assume that independence is always feasible or statistically superior for a small calibration set. The governance rule must distinguish calibration, benchmark, and production-validation contexts.

## Finding 4 — Digest naming should expose canonicalization scope

The corpus digest intentionally excludes lifecycle metadata so a case can move from frozen to invalidated while retaining proof of the originally frozen content. The source considers that exclusion correct.

The risk is semantic: a field named `manifestDigest` may imply that the entire manifest, including lifecycle metadata, is bound. A future maintainer may interpret the exclusion as a bug and include mutable lifecycle state, breaking durable historical verification.

### Provisional remedies proposed by this round

- Rename the field to something explicit, such as `corpusContentDigest` or `frozenContentDigest`.
- Add documentation immediately above canonicalization code listing:
  - fields included;
  - fields excluded;
  - the reason lifecycle metadata is excluded;
  - compatibility and migration expectations.
- Add tests proving that content changes alter the digest while authorized lifecycle transitions do not.
- Treat any digest rename as a versioned schema change with backward compatibility, not a casual refactor.

## Cross-cutting principle

A system may be mathematically correct today yet remain vulnerable to human pattern recognition, circular authorship, misleading naming, or future “cleanup” edits. Governance must therefore protect not only execution, but also interpretation and maintenance.

## Questions reserved for six-round synthesis

1. How should perceptual unblinding be measured and recorded?
2. Should the benchmark use multiple reviewers, shorter blocks, or both?
3. What independence is required among case selection, truth annotation, scoring, and adjudication?
4. Are calibration-corpus exceptions acceptable, and how are they bounded?
5. What fields are currently included in the corpus digest, and which are intentionally excluded?
6. Would renaming the digest break persisted artifacts or require a schema version migration?
7. Which findings duplicate earlier rounds and which materially expand the RDR scope?

## Provisional disposition

This round materially expands the review with perception-layer blinding, annotation provenance, and semantic protection of digest scope. Its causal-language finding reinforces round 1. All remedies remain provisional pending the remaining three rounds and repository-level verification.