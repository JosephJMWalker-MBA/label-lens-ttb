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

## Visual architecture synthesis

A visual synthesis of this checkpoint was generated to make the governing architecture legible at a glance. It captures five commitments that remain binding during implementation:

1. **AI extracts; rules decide.** Models identify evidence; deterministic rules evaluate it.
2. **Local-first with bounded fallback.** Local OCR runs first, with external escalation only when internal evidence is insufficient.
3. **Human-in-the-loop authority.** The system may generate explainable findings, but final disposition remains with an authorized human reviewer.
4. **Operator trust over isolated compute cost.** Success is measured by trustworthy task completion and reviewer throughput, not merely server expense.
5. **The thin vertical slice.** One complete path from image upload to explainable report must work before broader architecture resumes.

The visual artifact is explanatory, not normative. The ADRs, typed contracts, tests, and this review remain the authoritative engineering record.

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

Before external escalation, image-quality evidence should trigger concise capture coaching where practical: clean the lens, hold the camera steady, improve lighting, reduce glare, move closer, center the label, or hold the camera parallel to the label. A coached retake must remain bounded so the reviewer is not trapped in a retry loop.

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

## Human comprehension gate

The review process now includes a generated quiz derived from the source brief, debate, verdicts, architectural decisions, risks, and next actions.

The architecture owner recommends—and this checkpoint adopts—a **100% passing score before implementation continues beyond the checkpoint**.

This is the human-in-the-loop counterpart to automated machine testing:

- machine tests verify that the software behaves as intended;
- the comprehension quiz verifies that the responsible engineer understands what was built, why the boundaries exist, which tradeoffs were accepted, and what work is permitted next.

A failed or incomplete quiz is not treated as punishment. It is evidence that the review has not yet transferred sufficient understanding to the person responsible for continuing the work. Incorrect answers should return the engineer to the relevant review material, after which the quiz may be retaken.

The quiz must test substantive understanding rather than memorization, including:

- why extraction providers cannot issue compliance verdicts;
- how UI semantics can undermine human authority;
- when and why bounded fallback may occur;
- why background results cannot overwrite active human review;
- what operator trust means operationally;
- what is frozen by ADR 0009;
- the exact required thin vertical slice;
- which work is deferred until proof exists.

The quiz result should be retained with the review record using only the minimum necessary information: review identifier, quiz version, date, score, and pass/fail status. It should not expose sensitive source material or private reasoning.

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
| Human comprehension quiz | Keep / Require | Provides a human understanding test parallel to automated system tests |

## Decisions recorded

- No further broad architecture expansion should precede the first working vertical slice unless it directly unblocks implementation.
- Every new governance artifact should produce corresponding code, tests, or measurable acceptance criteria.
- A generated comprehension quiz is part of the checkpoint evidence.
- The responsible engineer should achieve 100% on the checkpoint quiz before continuing implementation beyond the approved next slice.
- The next Rubber Duck Review should evaluate working behavior, test evidence, failure modes, measured latency, and retained comprehension evidence rather than additional design promises.

## Engineer reflection

The review clarified that architecture deserves to survive only when implementation evidence supports it.

The system's strongest insight remains the separation of evidence, rules, and human judgment. The next discipline is to encode that insight in types, interfaces, tests, operator-facing behavior, and demonstrated human understanding so that future contributors cannot accidentally bypass it.