# RDR-004 Final Revalidation — Review of the Review

- Status: Current-state revalidation
- Date: 2026-07-16
- Repository base reviewed: `main` at `58a2e88767b425fc6b287ad1ec6585afa4e5bb9d`
- Review branch: `review/rdr-004-vision-pipeline-diagnostic-governance`
- Related open implementation: draft PR #114

## Purpose

The six feedback rounds included accurate architectural criticism, historical performance evidence, rhetorical summaries, and some statements that had already become dated by the time the RDR was assembled.

This revalidation prevents two opposite failures:

1. preserving an old defect as though it is still current; and
2. describing a defect as fixed merely because later prose says it was fixed.

Every material conclusion is therefore classified as one of:

- **CURRENT — CONFIRMED**;
- **HISTORICAL — FIXED, REGRESSION GUARD REQUIRED**;
- **PARTIALLY FIXED**;
- **OPEN — NOT YET PROVEN FIXED**;
- **GOVERNING PRINCIPLE — NOT A ONE-TIME DEFECT**.

## Executive conclusion

RDR-004 remains directionally valid, but its historical performance examples must not be used as current-state claims.

The strongest current defects are narrower than several feedback transcripts suggested:

- the generated Phase 5A heading still overstates prefix-marginal evidence;
- the proposed PR #114 manifest boundary is still not total and exact over arbitrary runtime JSON;
- PR #114 still does not bind selector and annotator provenance into one durable frozen relationship;
- the current 16-case, one-primary-reviewer protocol remains calibration-grade;
- operator-work reduction remains unmeasured as a product acceptance condition.

By contrast, the earlier 100% absent-brand false-positive result is no longer current. Current committed evidence records 0/10 absent-brand false positives, 100% correct brand abstention, zero brand false certainty, and zero false abstention.

## Finding-by-finding status

### A. Absent-brand hallucination

**Status: HISTORICAL — FIXED, REGRESSION GUARD REQUIRED**

Historical feedback repeatedly cited a 100% absent-brand false-positive rate. That was a legitimate trigger for the architecture and repair work, but it is not the current production-extractor baseline.

Current committed full-corpus evidence:

- absent brand cases: 10;
- absent-brand false-positive rate: 0%;
- correct abstention rate: 100%;
- determinate brand false-certainty rate: 0%;
- false abstention rate: 0%.

The repair is now guarded in `src/fixtures/eval/rdr-004-final-verification.test.ts`.

The governing lesson remains current: the system must preserve a truthful abstention path and must never regress to filling an absent field merely to provide an answer.

### B. Alcohol extraction and rotated/side text

**Status: PARTIALLY FIXED**

Early feedback described approximately 37% alcohol detection and 0% side/rotated recovery. Those numbers are dated.

Current committed baseline:

- alcohol detection recall: approximately 61%;
- parsed-value accuracy: approximately 57%;
- side/rotated slice: 3/12 detected and 2/12 parsed accurately;
- rotated-or-vertical truth slice: 3/11 detected and 2/11 parsed accurately;
- vertical mandatory strip: 0/5 detected and 0/5 parsed accurately.

The correct current conclusion is not “orientation extraction is wholly broken.” It is:

> Bounded orientation recovery produced real gains, but clockwise vertical text and mandatory vertical strips remain material unresolved challenge slices.

The current figures are guarded in `rdr-004-final-verification.test.ts`.

### C. Prefix-marginal causal language

**Status: CURRENT — CONFIRMED**

The generated report still contains:

> Recovery passes that never improve outcomes

The underlying data separately records new OCR, field-like evidence, accepted candidates, changed selections, corrected selections, and cost at fixed pass order.

The heading therefore still exceeds the measurement. The current code has not performed a leave-one-pass-out removal experiment proving counterfactual dispensability.

The new verification test intentionally confirms that this unresolved phrase remains present. This prevents a future review from claiming the wording was fixed before the generator and committed report actually change.

Required closure evidence:

- generated heading replaced with fixed-order language;
- methodology note added;
- test changed from “current defect is present” to “overbroad phrase is forbidden”;
- committed report regenerated;
- no OCR-pass pruning bundled into the wording correction.

### D. Runtime manifest validation

**Status: OPEN — NOT YET PROVEN FIXED**

Draft PR #114 remains synthetic and unauthorized for real corpus creation or execution.

Its validator accepts a typed manifest, dereferences `manifest.cases.length`, and does not establish exact-key rejection over arbitrary parsed JSON at each governed object boundary.

Compile-time `@ts-expect-error` fixtures remain useful but do not prove the runtime boundary.

Required closure tests on PR #114 or its successor:

- root input is `unknown`;
- `null`, arrays, strings, and empty objects return structured issues;
- missing and non-array `cases` return structured issues without throwing;
- unknown root keys are rejected;
- unknown nested case keys are rejected;
- unknown `slotSupport` keys are rejected;
- contract IDs, scores, raw model output, OCR text, and hidden result metadata are rejected from plain parsed JSON;
- rejected payloads cannot satisfy the frozen-corpus gate or be digested as valid manifests;
- issue ordering is deterministic.

Until those tests exist and pass, “strict runtime validation implemented” is not an accepted current claim.

### E. Annotation provenance and separation of duties

**Status: OPEN — NOT YET PROVEN FIXED**

The Slice 1 protocol contains an opportunity-annotation type with `annotatorId`, while PR #114 case entries contain `selectedBy`. The frozen manifest does not bind the annotation record, its digest, or selector-versus-annotator relationship.

Therefore both of these statements are true:

- annotator identity exists in a protocol type;
- independent annotation is not yet provable from the proposed frozen manifest.

Required closure evidence:

- bound annotation identity or annotation-record digest per frozen case;
- explicit independence policy by benchmark grade;
- structured validation when required roles improperly coincide;
- tests proving content-digest sensitivity to provenance changes where provenance is part of the frozen content.

### F. Digest scope

**Status: PARTIALLY FIXED / SEMANTIC RISK REMAINS**

PR #114 already tests the important mathematical property: later invalidation metadata does not alter the frozen content digest.

What remains is semantic protection. The field name `manifestDigest` does not itself reveal that lifecycle metadata is intentionally excluded.

This does not require an automatic rename. It requires one of:

- a scope-revealing field name in a reviewed schema version; or
- explicit schema documentation and comments enumerating included and excluded fields.

Any change must preserve the existing test that lifecycle mutation does not rewrite content identity.

### G. Perceptual blinding

**Status: OPEN — CALIBRATION LIMIT CONFIRMED**

The current protocol explicitly states:

- 16 cases;
- 64 scored items;
- one primary reviewer;
- real execution unauthorized;
- production prompt change unauthorized.

This is not a failed production benchmark because it is not yet an executed production benchmark. It is a synthetic calibration protocol.

The open concern remains valid: hiding explicit contract identifiers does not prove the reviewer could not infer identity from style.

Required before advancement-grade use:

- at least two independent reviewers or a justified alternative;
- style-guessability or suspected-unblinding record;
- session timing and drift evidence;
- inter-rater agreement and adjudication rules;
- explicit limitation or invalidation behavior if perceptual blinding is compromised.

The current calibration status and authorization flags are guarded in `rdr-004-final-verification.test.ts`.

### H. Candidate-filtering attribution

**Status: CURRENT PRIMARY ACCOUNTING IS PROVEN; MULTI-CAUSAL EXTENSION REMAINS OPTIONAL RESEARCH**

Current committed tests prove:

- every candidate-filtering failure receives exactly one primary subtype;
- no non-candidate-filtering case receives one;
- aggregate subtype totals reconcile to case-level failures.

That is a real implemented invariant, not a narrated claim.

RDR-004's contributing-factor proposal should not be treated as a confirmed defect in those totals. It is a proposed extension for richer diagnosis.

Before adding it, the project must distinguish:

- an observed condition;
- a causal mechanism;
- a downstream consequence;
- a mutually exclusive primary category.

No multi-label field should destabilize the current primary reconciliation without a report-schema version change.

### I. Stateless execution and typed execution failures

**Status: CURRENT ARCHITECTURAL STRENGTH; PRODUCT BENEFIT NOT YET PROVEN**

The repository now contains substantial deterministic diagnostic coverage for:

- process lifecycle and cleanup;
- image transport;
- vision attention;
- response-completion stages;
- request parity;
- counterbalanced replication;
- permutation recurrence;
- separate infrastructure, blocked, invalid-output, and model-quality states.

This addresses the concern that a timeout might be silently counted as model-quality failure.

It does not establish acceptable product latency or availability. Diagnostic correctness and user-facing reliability remain separate claims.

### J. Architecture versus product usefulness

**Status: GOVERNING PRINCIPLE — NOT A ONE-TIME DEFECT**

The RDR's strongest lasting conclusion survives every dated metric correction:

> Architectural integrity and operational usefulness are independent acceptance axes.

The repository now has evidence-centered UI, append-only human confirmation, seller-facing project scaffolding, and improved extraction metrics. However, it still lacks a measured manual baseline proving reduced handling time.

Future acceptance must include both:

- machine/evidence safety; and
- human-work outcomes.

At minimum:

- time to first usable result;
- total handling time;
- corrections and overrides;
- manual re-entry;
- candidate selections;
- false-certainty burden;
- completion and timeout rates;
- median and p95 latency.

## New executable verification

Added:

- `src/fixtures/eval/rdr-004-final-verification.test.ts`

The test distinguishes:

1. repaired historical facts that must remain repaired;
2. current metrics that supersede old transcript numbers;
3. still-open report-language defects;
4. the synthetic, unauthorized status of the observation-quality protocol.

This is intentionally not a substitute for the PR #114 adversarial runtime-validator suite. Those tests must live with the validator implementation so they can exercise the actual boundary.

## Final judgment

The review was not wrong because some examples became dated. The correct treatment is to preserve the causal history while updating the present-tense verdict.

RDR-004 should therefore be read as follows:

- historical metrics explain why safeguards were built;
- current committed metrics determine present product status;
- executable tests determine whether a claimed repair actually exists;
- open findings remain open until the relevant implementation and regression tests land;
- governing principles survive individual fixes and continue constraining future work.

## Remaining ordered actions

1. Correct the Phase 5A generated heading and invert the new verification assertion to forbid the old phrase.
2. Harden PR #114 with total exact runtime parsing and adversarial plain-JSON tests.
3. Bind annotation provenance and define independence by benchmark grade.
4. Document digest projection semantics without breaking invalidation durability.
5. Define advancement-grade perceptual-blinding controls.
6. Establish operator-work baselines before claiming product expansion or workflow improvement.
7. Keep the current absent-brand and alcohol-baseline regression checks green during all later work.
