# Remaining Work Plan

## Purpose

This plan sequences the work that remains after the merged Slice 3 domestic-wine pre-check vertical slice.

The governing principle is:

> Build the evidence and measurement foundation before expanding rules, fields, providers, storage, or deployment complexity.

Slice 3 proved one real end-to-end path:

```text
one wine-label image
→ local OCR
→ typed evidence
→ deterministic findings
→ human disposition
→ canonical JSON
→ readable report
```

The next risk is no longer whether the architecture can work. The next risk is allowing the architecture to expand faster than the evidence used to evaluate it.

## Current product boundary

The accepted baseline is:

- submitter/internal-reviewer pre-check;
- domestic wine;
- one PNG or JPEG artifact;
- local-first extraction;
- brand and alcohol evidence;
- deterministic advisory findings;
- append-only human disposition;
- canonical JSON and readable HTML report;
- no overall compliance verdict;
- no external Ai dependency in the core path.

Every future slice must preserve the separation between:

1. probabilistic evidence extraction;
2. deterministic rules;
3. human disposition.

## Backlog reconciliation

The following issue decisions were made after Slice 3:

- #5 closed as superseded by the local evidence-first extraction architecture;
- #9 closed as completed by canonical JSON and readable report export;
- #25 closed as completed for the local evidence/provenance path;
- #6 rewritten as bounded field-specific normalization rather than unrestricted fuzzy matching;
- #16 narrowed to governed rule-registry expansion;
- #38 created for operator-friction and throughput measurement;
- #39 created for designation/appellation evidence;
- #40 created for net contents and standard of fill.

## Dependency map

```text
#10 fixture corpus
  ↓
#15 evaluation harness
  ↓
#39 designation/appellation evidence
  ↓
#40 net contents / standard of fill
  ↓
#6 bounded normalization policies
  ↓
#16 governed rule-registry expansion
  ↓
#13 deployment modes
  ↓
#11 documentation
  ↓
#12 deployment and submission
  ↓
#17 governed evidence storage
  ↓
#24 fallback state machine
  ↓
#14 fallback implementation
  ↓
#29 fallback benchmark
```

Parallel governance lane:

```text
#27 operator-trust policy
  ↓
#28 documentation integrity checks
  ↓
#21 Rubber Duck Review automation
```

Parallel measurement lane:

```text
#15 evaluation harness
  ↓
#38 operator-friction metrics
```

External observation lane:

```text
#33 platform fingerprinting
#35 public applicant identity/signature exposure
```

These external observations are not product implementation dependencies unless a direct Label Lens requirement emerges.

---

# Phase 0 — Maintain backlog and scope integrity

## Objectives

- Keep issue bodies aligned with the accepted architecture.
- Split issues that combine domain correctness with product analytics.
- Prevent old prototype assumptions from silently returning as requirements.

## Rules

- Close completed or superseded issues with a reason and link to the implementing PR.
- Rewrite issue bodies when the original acceptance criteria conflict with later architectural decisions.
- Do not leave broad words such as “fuzzy,” “AI extraction,” or “compliance score” undefined.
- New evidence fields receive their own bounded slices.
- Product telemetry never shares an acceptance boundary with rule correctness.

## Completed actions

- #6 rewritten.
- #16 split conceptually.
- #38, #39, and #40 created.

---

# Phase 1 — Build the measurement foundation

## 1. #10 — Expand the fixture corpus

This is the next implementation priority.

### Goal

Create enough varied, privacy-screened, public domestic-wine evidence to expose where the current pipeline succeeds, fails, or remains ambiguous.

### Required fixture classes

- current M Cellars baseline;
- Rainbow Hills / VENOM adversarial fixture;
- clean brand/alcohol cases;
- ambiguous brand cases;
- varietal, appellation, vintage, slogan, and website false-brand cases;
- curved and integrated panel text;
- low-resolution and reduced public renderings;
- glare, blur, perspective, and compression cases;
- malformed alcohol statements;
- missing evidence;
- extraction failure;
- future designation/appellation and net-contents cases.

### Fixture principles

- artwork-only derivatives where possible;
- strict source-chain manifests;
- exact hashes, dimensions, media types, and privacy exclusions;
- no applicant contact blocks or handwritten signatures;
- expected observations, not hidden answer injection;
- explicit ambiguity and insufficient-evidence expectations.

### Exit criteria

- corpus covers clean, mismatch, ambiguous, insufficient, and failure states;
- every fixture passes privacy/provenance validation;
- no extractor receives fixture truth as an input;
- each field has positive and adversarial examples.

## 2. #15 — Build the Kaizen evaluation harness

### Goal

Make every future extraction, preprocessing, normalization, rule, and fallback change measurable against a locked baseline.

### Required metrics

- field-level observation accuracy;
- false-`OBSERVED` rate;
- false-pass rate;
- false-fail rate;
- ambiguity rate;
- insufficient-evidence rate;
- OCR recovery rate;
- evidence-reference correctness;
- rule determinism;
- end-to-end latency;
- per-stage latency;
- worker/resource failures;
- operator correction burden where available.

### Required outputs

- machine-readable fixture results;
- baseline snapshots;
- comparison against a selected prior commit;
- per-field and per-fixture summaries;
- explicit regression thresholds;
- no single opaque aggregate score.

### Exit criteria

- tuning changes can be compared objectively;
- false passes are first-class regressions;
- results are reproducible on the locked environment;
- the harness does not alter production findings.

---

# Phase 2 — Expand the domestic-wine evidence model

## 3. #39 — Designation and appellation evidence

### Goal

Add typed designation/class/type/varietal and appellation observations plus their geometry/grouping relationship.

### Guardrails

- evidence only before rules;
- independent observation states;
- direct-conjunction assessment only when geometry supports it;
- entitlement remains an external dependency;
- ambiguous grouping never becomes an automatic substantive outcome;
- preserve existing brand/alcohol behavior.

## 4. #40 — Net contents and standard of fill

### Goal

Add printed net-contents evidence, bounded metric parsing, declared-value comparison, and authorized-standard-of-fill checks.

### Guardrails

- distinguish net contents from dimensions, years, and alcohol percentages;
- preserve original text and normalized metric quantity;
- no actual-fill inference;
- unsupported units remain explicit;
- keep the slice independent from designation/appellation implementation.

## 5. #6 — Bounded field-specific normalization

### Goal

Version explicit normalization policies for each evidence field.

### Sequence

Implement only the policies needed by fields that already exist:

1. brand policy hardening;
2. alcohol policy formalization;
3. designation/appellation policy after #39;
4. net-contents policy after #40.

### Prohibited behavior

- unrestricted fuzzy pass;
- proof-to-ABV normalization for wine;
- dropping substantive words;
- similarity threshold as regulatory equivalence;
- cross-field generic repair.

## 6. #16 — Governed rule-registry expansion

### Goal

Turn the current registry foundation into an explicit lifecycle for adding, replacing, deprecating, and replaying rules.

### Required governance

- immutable rule ids;
- versioned implementations;
- authority versioning;
- evidence dependencies;
- normalization-policy references;
- fixture requirements;
- profile version changes for ordered-manifest changes;
- historical replay;
- no activation without implemented evidence.

### Exit criteria

- one representative new rule follows the complete lifecycle;
- active profiles cannot reference unknown or untested rules;
- operator metrics cannot alter rule outcomes.

---

# Phase 3 — Make the accepted baseline deployable

## 7. #13 — Define secure deployment modes

Define at minimum:

- local developer mode;
- public reviewer-demo mode;
- private organizational mode;
- production signing-key requirements;
- request/proxy limits;
- ephemeral versus retained evidence behavior;
- supported runtime/platform;
- startup, health, and degraded-mode behavior.

Do not deploy until these modes have explicit privacy and secret-management boundaries.

## 8. #11 — Complete setup, tradeoff, and submission documentation

Document:

- installation and locked runtime;
- required environment variables;
- local OCR packaging;
- standalone deployment;
- sample workflow;
- architecture boundaries;
- deterministic versus platform-dependent behavior;
- security and privacy limits;
- troubleshooting;
- deferred roadmap.

## 9. #12 — Deploy prototype and complete submission checklist

Deployment acceptance must include:

- configured production append-signing key;
- local OCR assets present;
- real fixture upload succeeds;
- disposition append succeeds;
- JSON and HTML downloads succeed;
- no secret/client leakage;
- upstream request limit configured;
- health and safe failure behavior verified;
- deployed URL documented.

The old API-key-fallback assumptions are superseded by the local-first baseline.

---

# Phase 4 — Add governed persistence

## 10. #17 — Governed evidence storage and audit chain

Persistence follows deployment-mode decisions; it does not precede them.

### Required design

- non-semantic evidence ids;
- immutable originals where retention permits;
- separate derived-artifact identity;
- encryption and access boundaries;
- explicit retention modes;
- append-only audit events;
- governed deletion;
- no applicant/brand/OCR text in object keys;
- machine findings and human disposition stored distinctly;
- replay against exact pipeline versions.

### Exit criteria

- ephemeral mode remains supported;
- retention is explicit rather than accidental;
- access and deletion are testable;
- audit events cannot rewrite machine history.

---

# Phase 5 — Evaluate cloud fallback rather than assume it

## 11. #24 — Define the bounded-fallback state machine

Define the workflow before wiring a provider.

States must cover:

- local sufficient;
- local insufficient;
- fallback pending;
- fallback complete;
- fallback unavailable;
- disagreement;
- operator accepted/rejected enhancement;
- timeout and recovery;
- preservation of active human review.

## 12. #14 — Implement confidence-gated fallback

Fallback must:

- remain evidence-only;
- receive bounded field requests;
- preserve provider/model provenance;
- never overwrite local evidence silently;
- expose disagreement;
- fail without blocking the local result;
- respect deployment/privacy mode.

## 13. #29 — Benchmark whether fallback improves outcomes

Use #15 to compare local-only and local-plus-fallback for:

- field accuracy;
- false-pass rate;
- ambiguity reduction;
- human correction burden;
- interruption rate;
- latency;
- cost;
- privacy impact;
- recovery behavior.

Fallback remains optional unless measured evidence supports its use.

---

# Parallel governance work

## #27 — Complete operator trust and throughput policy

Define measurable expectations for:

- interruption;
- silent failure;
- timeout;
- recovery;
- continued work during provider failure;
- human authority;
- acceptable ambiguity;
- throughput tradeoffs.

## #28 — Add documentation integrity checks

After #27 is complete, add checks for:

- malformed fences;
- broken internal links;
- duplicate ADR ids;
- missing ADR metadata;
- abrupt truncation;
- incomplete accepted policies;
- rendering-breaking Markdown errors.

## #21 — Automate Rubber Duck Review 2.0

Automate after another meaningful group of substantive PRs exists. Review automation should summarize and challenge real work, not create ceremony without new evidence.

---

# Parallel measurement work

## #38 — Operator friction and review throughput

Build on #15.

Measure product behavior without changing domain decisions:

- time to usable result;
- review time;
- correction count;
- ambiguity/review burden;
- interruptions and retries;
- completion and abandonment;
- disposition changes;
- fallback dependence when implemented.

Telemetry is optional until deployment, privacy, and retention policies authorize it.

---

# External observation work

## #33 — Public COLA platform fingerprinting

Treat as a bounded external security observation. Document evidence, severity, and responsible-disclosure decision. Do not turn it into Label Lens application code without a direct requirement.

## #35 — Public applicant identity/signature exposure

Treat as a privacy/security research record. Preserve no copied signature or direct contact artifact in Label Lens fixtures. Decide whether and how to report the exposure responsibly.

---

# Pull request discipline

Each implementation PR should:

- address one bounded slice;
- identify the issue and explicit non-goals;
- include fixture/evaluation evidence;
- preserve evidence/rule/human separation;
- document schema/version decisions;
- run format, lint, typecheck, full tests, production build, and relevant relocation/e2e gates;
- receive an adversarial review before merge when it changes evidence, rule, identity, disposition, storage, or provider boundaries.

Do not combine:

- multiple new evidence fields;
- provider fallback and persistence;
- rule correctness and operator analytics;
- deployment and broad domain expansion;
- architecture redesign and feature implementation.

## Immediate next branch

The next implementation branch should address **#10 — fixture corpus expansion**.

Suggested sequence:

```text
fixtures/public-wine-corpus
→ evaluation/kaizen-harness
→ slice/designation-appellation
→ slice/net-contents
→ governance/normalization-policies
→ governance/rule-registry
```

## Decision rule

At each phase boundary ask:

1. What new claim are we making?
2. What evidence supports it?
3. What fixture could falsify it?
4. What human authority remains required?
5. What new risk is created if the feature succeeds?

Do not proceed merely because the next feature is technically possible.