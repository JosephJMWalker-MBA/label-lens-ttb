# RDR-004 Source Brief

## Review basis

This review synthesizes six independently supplied critique rounds concerning the OCR and stateless vision-observer evaluation pipeline. Repeated claims were checked against the current repository and open PR #114 where possible.

## Repository-verified facts

### Phase 5A reporting

The committed Phase 5A report uses the heading:

> Recovery passes that never improve outcomes

The underlying instrumentation measures fixed-order prefix-state changes across separate axes: new OCR tokens, new field-like evidence, accepted candidates, changed selections, and corrected selections.

For the left-edge 270-degree pass, the committed report records:

- 57 executions;
- 55 executions with new OCR tokens;
- 14 with new field-like evidence;
- 0 accepted candidates;
- 0 changed selections;
- 0 corrected selections;
- 44,484 ms total execution time.

Those measurements establish no immediate selected-field change at the pass's configured prefix. They do not establish leave-one-out equivalence or counterfactual dispensability.

### Candidate-filtering counts

The authoritative committed Phase 5A table reports these subtypes:

- alcohol missing volume marker: 26;
- brand too many words: 17;
- alcohol unsupported pattern: 7;
- brand domain-like: 6;
- brand producer line: 6;
- brand non-brand keyword: 5;
- brand sentence fragment: 3;
- brand overextended candidate: 2;
- alcohol missing explicit alcohol marker: 1.

Narrated alternatives in feedback rounds are non-authoritative approximations.

### Observation-quality protocol

The committed protocol defines:

- 16 cases;
- 2 research contracts;
- 2 repetitions per contract;
- 64 trials and scored items;
- 1 primary reviewer;
- 20% repeat scoring;
- real execution and production prompt change authorization set to `false as const`.

It also defines typed evidence states that distinguish model-quality evidence from infrastructure, provenance, invalid-output, blocked, and non-scored states.

### PR #114 manifest schema and validator

PR #114 is an open draft implementing only the synthetic Slice 2 corpus-manifest schema. It does not authorize real corpus selection, model execution, scoring, or production changes.

The proposed case entry includes `selectedBy` and `selectedAt`, but no annotator identity bound into the frozen case entry. A separate Slice 1 `ObservationQualityOpportunityAnnotation` type includes `annotatorId`; PR #114 does not bind that annotation record or enforce selector-versus-annotator independence in the manifest.

The validator is strongly typed but is not total over arbitrary runtime JSON. It accepts a typed `ObservationQualityCorpusManifest`, dereferences `manifest.cases.length`, and does not perform exact-key rejection at every object boundary. Compile-time `@ts-expect-error` tests exclude forbidden keys from repository-authored typed fixtures but do not form a runtime ingestion boundary.

The digest canonicalization intentionally excludes lifecycle fields such as freeze and invalidation state while binding the corpus content projection. The current field remains named `manifestDigest`, which may not communicate that limited scope clearly enough to future maintainers.

## Findings reinforced across rounds

### 1. Causal prose must match the measurement

Five of six rounds reject describing prefix-marginal non-contribution as proof that a pass never improves outcomes. Round 2 used the stronger claim, but the repository confirms that the instrumentation is not a removal experiment.

### 2. Blinding has runtime and perceptual layers

The schema should prevent hidden identity or score leakage in runtime payloads. Separately, one reviewer scoring repeated outputs may learn stylistic fingerprints even when explicit identifiers are removed.

### 3. Primary attribution is not necessarily singular causation

Exactly-one primary categories support aggregate reconciliation, but secondary observed conditions may remain important to repair. The telemetry should distinguish precedence-selected primary attribution from contributing factors.

### 4. Human provenance and separation of duties are incomplete

The current proposed manifest proves who selected a case, but not who annotated its observation opportunity or whether those roles were independent. A separate annotation type exists, but the relationship is not frozen and enforced in Slice 2.

### 5. Architectural safety and operational usefulness are separate

The repository demonstrates meaningful architectural strengths: evidence-only roles, deterministic rules, typed failure states, provenance, append-only authority, digest-backed artifacts, and authorization as code. None of those facts proves that the workflow currently saves seller or reviewer time.

### 6. Operator work must constrain tuning and expansion

Accuracy, recall, and completion metrics should be accompanied by handling time, correction burden, override burden, candidate-selection effort, and resolution before human regulatory review.

## Governing interpretation

The review does not conclude that diagnostic rigor is wasted. It concludes that diagnostic rigor earns value only when it remains causally honest and produces an ordered path toward safer extraction and reduced human work.

## Final review questions

1. What minimum runtime validator changes are required before a real manifest can be frozen?
2. What advancement-grade human-review design is required beyond the current calibration protocol?
3. Which contributing factors should be captured without destabilizing primary aggregate reporting?
4. What counterfactual experiment is sufficient before a recovery pass may be pruned?
5. What operator-work threshold must be met before field, portal, cloud, or beverage expansion?
