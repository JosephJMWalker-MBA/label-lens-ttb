# RDR-004 Next Actions

## Immediate sequence

### 1. Correct Phase 5A causal language

Change headings and generated prose so they describe fixed-order prefix-state marginal results precisely.

Required minimum:

- replace `Recovery passes that never improve outcomes` with a bounded heading;
- add a methodology note distinguishing prefix marginal change from counterfactual necessity;
- preserve separate columns for evidence generation, candidate acceptance, selection change, correction, and cost;
- add a regression test that rejects the overbroad phrase in generated reports.

This is a documentation/reporting change only. It does not authorize OCR-pass pruning.

### 2. Make the corpus validator total and exact at runtime

Before real manifest creation is authorized:

- accept `unknown` or parsed JSON at the boundary rather than assuming a typed manifest;
- return structured, deterministic issues for missing or mistyped root and nested properties;
- reject unknown properties at every governed object boundary;
- add adversarial plain-JSON tests for contract IDs, scores, raw outputs, undeclared metadata, missing `cases`, non-array `cases`, malformed entries, and nested leakage;
- prove rejected payloads cannot be digested, frozen, or shown to scorers.

Compile-time fixture checks should remain as supplementary developer protection.

### 3. Bind annotation provenance deliberately

Choose and document one of two governed designs:

1. include `annotatedBy` / `annotatedAt` directly in each frozen case entry; or
2. bind a separately digested annotation record to each case by stable ID and digest.

Then define when independence is required. At minimum, advancement-grade cases must prove whether selector, annotator, scorer, adjudicator, and freezer are the same or different people. Do not claim separation of duties unless the artifact can prove it.

### 4. Clarify digest semantics

Protect the intentional exclusion of lifecycle metadata.

- rename `manifestDigest` to a scope-revealing name such as `corpusContentDigest`, or preserve the field with an explicit schema comment and documentation;
- enumerate fields included and excluded from canonicalization;
- state why invalidation metadata is excluded;
- add tests proving lifecycle changes do not alter the content digest while content changes do.

Any rename of a versioned durable field requires normal schema-version review.

### 5. Extend attribution without breaking aggregate reconciliation

Preserve the deterministic primary subtype, but evaluate a bounded secondary field such as:

```json
{
  "primaryAttributionMechanism": "unsupported-pattern",
  "contributingFactors": ["parser-rejected"]
}
```

Before implementing, classify each candidate factor as:

- observed condition;
- inferred mechanism;
- downstream consequence;
- or mutually exclusive primary category.

Add case-level overlap reporting without changing the existing primary totals unless a new report version explicitly does so.

### 6. Define counterfactual pruning evidence

A recovery pass may be considered for removal only after a controlled experiment measures the pipeline without it.

Minimum evidence should include:

- final field accuracy and uncertainty changes;
- candidate-region recall changes;
- downstream ranker dependence;
- latency and compute savings;
- challenge-slice regressions, especially rotated or side text;
- reproducible corpus and configuration identity.

A zero prefix-marginal correction count is not sufficient.

### 7. Separate calibration-grade and advancement-grade human review

Keep the existing 16-case design clearly labelled as calibration until stronger controls are added.

For advancement-grade evaluation, define:

- at least two independent reviewers, unless a documented alternative is justified;
- session splitting and order randomization;
- style normalization where it does not erase meaningful content;
- a governed style-guessability or suspected-unblinding record;
- per-item timestamps and fatigue/drift analysis;
- inter-rater agreement and adjudication rules;
- invalidation or limitation language when the blind is suspected to have failed.

Do not use one-reviewer results as sole authority for production prompt or contract advancement.

### 8. Add operator-work measures to the next extractor repair cycle

For the existing domestic-wine brand and alcohol workflow, establish a manual baseline and measure:

- time to first usable result;
- total handling time;
- human corrections and overrides;
- candidate selections per field;
- manual re-entry rate;
- seller-side resolution before reviewer escalation;
- false-certainty burden;
- completion and timeout rates;
- median and p95 latency.

An extractor change should not be accepted as a product improvement merely because string accuracy rises. It must avoid increasing human burden and unsupported certainty.

## Product gates

### Gate A — Real benchmark execution

Requires completed runtime validation, provenance binding, and explicit authorization changes.

### Gate B — Research-contract advancement

Requires advancement-grade human review, complete evidence reconciliation, acceptable availability, and no material challenge-slice regression.

### Gate C — Product expansion

Additional fields, beverage categories, cloud fallback, seller portal expansion, or regulator queue expansion require evidence that the current local workflow:

- safely abstains;
- materially reduces avoidable corrections;
- reduces or at least does not worsen human handling time;
- preserves evidence and human authority;
- does not increase false-cleared cases.

## Deferred items

- pruning any OCR recovery pass;
- changing the production prompt;
- running the real observation-quality benchmark;
- freezing a real corpus manifest;
- broadening product scope;
- treating MASI or any generalized architecture as part of this RDR.

## Exit condition

RDR-004 actions are complete when the repository can demonstrate, with tests and documentation, that:

1. diagnostic prose states no more than the measurement proves;
2. malformed or leakage-bearing runtime manifests fail closed with structured issues;
3. annotation and review authorship claims are durably provable;
4. perceptual blinding risk is measured and governed;
5. any pruning decision is supported by counterfactual evidence;
6. extractor improvements are evaluated against both machine quality and saved human work.
