# Rubber Duck Review 001 — Architecture Checkpoint

- **Status:** Completed
- **Date:** 2026-07-10
- **Review type:** Architecture-decision checkpoint
- **Implementation evidence available:** Limited; the first end-to-end vertical slice has not yet been completed

## Scope

This checkpoint reviewed the three substantive architecture decisions immediately preceding adoption of Rubber Duck Review 2.0:

1. Separate probabilistic extraction from deterministic compliance decisions.
2. Use local-first extraction with a bounded OpenAI vision fallback.
3. Optimize for operator trust and trustworthy task completion rather than compute cost in isolation.

The review also challenged whether the repository was expanding its documented architecture faster than it was producing working implementation evidence.

## Governing conclusion

Label Lens is best understood as an **evidence-governance system embedded in a human compliance workflow**, not merely an OCR application.

The conceptual foundation is coherent and should remain. The next milestone must prioritize a narrow, falsifiable implementation over additional architectural expansion.

## Findings

### 1. AI extracts; deterministic rules decide

**Verdict: KEEP, THEN HARDEN**

The separation between probabilistic evidence extraction, deterministic rule evaluation, and human disposition is the correct governing boundary.

However, the boundary currently exists primarily in documentation. It must be enforced through:

- typed evidence-only analyzer contracts;
- package and dependency boundaries;
- runtime schema validation;
- tests proving analyzers cannot emit regulatory verdicts;
- UI terminology that distinguishes observations from final human decisions.

An extraction provider must not be able to return `PASS`, `FAIL`, `APPROVED`, or equivalent regulatory conclusions.

Suggested machine vocabulary:

- `OBSERVED_MATCH`
- `OBSERVED_DISCREPANCY`
- `INSUFFICIENT_EVIDENCE`
- `PROVIDER_DISAGREEMENT`

Human disposition must remain a separate domain concept.

### 2. UI semantics must preserve the boundary

**Verdict: HARDEN**

A correct backend contract can still be undermined by a user interface that presents AI output as a final conclusion.

A green approval badge attached to machine-extracted evidence creates automation bias even when the backend technically preserves human authority.

The interface should:

- present extracted observations neutrally;
- avoid visual language implying regulatory approval;
- distinguish machine findings from deterministic rule findings;
- require an explicit human disposition;
- avoid changing active review fields without reviewer action.

### 3. Local-first extraction with bounded cloud fallback

**Verdict: HARDEN**

A bounded fallback is a reasonable operational compromise. It can preserve reviewer throughput when local extraction cannot recover sufficient evidence.

Before implementation, the system must define:

- one centralized escalation policy;
- configurable and benchmarked thresholds;
- canonical evidence identity for deduplication and replay;
- provider and pipeline provenance;
- timeout, cancellation, and failure behavior;
- whether fallback is synchronous or progressive;
- how the five-second operational target applies to enhanced extraction.

Suggested fallback states:

```text
LOCAL_SUFFICIENT
LOCAL_INSUFFICIENT
FALLBACK_PENDING
FALLBACK_SUCCEEDED
FALLBACK_FAILED
PROVIDER_DISAGREEMENT
HUMAN_REVIEW_REQUIRED
```

### 4. Progressive enhancement must not destabilize active review

**Verdict: HARDEN**

Asynchronous fallback may reduce blocking latency, but background evidence must not overwrite fields while a reviewer is actively working.

Once a review is engaged, enhanced evidence should be queued and presented as an explicit suggestion:

```text
Enhanced evidence available

Compare
Apply
Ignore
```

The reviewer, not a background request, controls whether the active record changes.

### 5. Operator trust over isolated compute cost

**Verdict: KEEP THE PRINCIPLE; REPLACE THE INCOMPLETE ARTIFACT**

The governing principle is sound: task completion, reliability, explainability, and reviewer trust matter more than minimizing server expense in isolation.

The accepted policy document is incomplete and ends mid-sentence. It must be replaced with a measurable operational policy covering:

- interruption and silent-failure limits;
- timeout and recovery behavior;
- continued-work behavior during provider failure;
- explanation requirements for non-routine states;
- manual re-entry and interaction burden;
- safeguards against throughput metrics encouraging careless approval.

### 6. Documentation breadth versus implementation evidence

**Verdict: REVISIT**

The repository has a strong and unusually comprehensive architectural record. The current risk is becoming documentation-complete before becoming evidence-complete.

Further governance work should be tied directly to implementation or test work. The immediate priority is the first thin vertical slice.

## Required thin vertical slice

The next milestone should prove exactly one end-to-end path:

```text
One uploaded image
→ one real extraction provider
→ typed evidence
→ three deterministic rules
→ one explainable report
→ human correction or disposition
→ measured runtime
```

Suggested initial rules:

1. Exact `GOVERNMENT WARNING:` heading verification.
2. Brand-name semantic normalization.
3. ABV numeric comparison using an explicit tolerance policy.

## Verdict table

| Decision | Verdict | Reason |
|---|---|---|
| Separate extraction from compliance | Keep / Harden | Correct boundary; must become compiler- and test-enforced |
| Human authority | Keep | Consistent with the regulatory workflow and governance model |
| Local-first with bounded fallback | Harden | Escalation, identity, latency, and state transitions remain undefined |
| Observation-oriented UI semantics | Harden | Required to prevent automation bias from defeating the backend boundary |
| Operator trust over isolated compute cost | Keep principle / Replace artifact | Strong principle; current accepted document is incomplete |
| Five-second performance objective | Revisit after benchmark | Must distinguish first actionable result from optional enhanced evidence |
| Current documentation breadth | Revisit | Working implementation must now become the primary source of evidence |

## Decisions recorded

- No further broad architecture expansion should precede the first working vertical slice unless it directly unblocks implementation.
- Every new governance artifact should produce corresponding code, tests, or measurable acceptance criteria.
- The next Rubber Duck Review should evaluate working behavior, test evidence, failure modes, and measured latency rather than additional design promises.

## Engineer reflection

The review clarified that architecture deserves to survive only when implementation evidence supports it.

The system's strongest insight remains the separation of evidence, rules, and human judgment. The next discipline is to encode that insight in types, interfaces, tests, and operator-facing behavior so that future contributors cannot accidentally bypass it.
