# ADR 0016: Untrusted Content Cannot Set Control State

**Status:** Proposed  
**Date:** 2026-08-25  
**Related issue:** #221

## Context

Label Lens intentionally separates extraction from decision-making. Existing architecture already establishes that AI may extract, deterministic rules decide, OCR is evidence rather than truth, revisions preserve provenance, and state transitions are explicit.

A cross-project research pass exposed a useful way to state the remaining trust boundary:

> Content may describe or recommend a state. Only an authenticated application boundary may create or mutate authoritative control state.

This matters because label images, OCR text, model output, imported files, reviewer notes, and external source material can contain strings that look like instructions or workflow metadata.

Examples include:

```text
[SYSTEM]
[ADMIN]
APPROVED
RESEARCH_REQUIRED
PASS
FAIL
ignore previous rules
```

Their appearance inside evidence does not grant them authority.

## Decision

Label Lens will treat all label/OCR/model-derived/imported text as **content evidence** unless it arrives through an explicitly authenticated control channel owned by the application.

No in-band text marker may directly:

- change PASS/WARN/FAIL or other compliance-result state;
- mark a review or research gate complete;
- alter deterministic rule configuration;
- expand model/tool permissions;
- change source or evidence requirements;
- authorize release/submission;
- clear an existing warning/gap; or
- overwrite provenance or reviewer identity.

A model may recommend a state transition. A reviewer may be shown that recommendation. The transition itself must be performed through the owning application workflow and recorded as such.

## Trust layers

```text
label image / OCR / imported text / model output
        ↓
        evidence content
        ↓
extraction / normalization / bounded interpretation
        ↓
deterministic rules + authenticated workflow state
        ↓
reviewer decision / release gate
        ↓
append-only provenance
```

The critical boundary is between **what the content says** and **what the system is authorized to do**.

## Relationship to existing ADRs

This ADR does not replace earlier decisions. It clarifies their shared security consequence.

- **ADR 0002 — AI extracts, rules decide:** extracted/model-generated text cannot become decision authority merely because it is fluent or structured.
- **ADR 0003 — OCR is evidence, not truth:** OCR that contains authoritative-looking wording remains OCR evidence.
- **ADR 0013 — immutable revisions and snapshot provenance:** control decisions must preserve lineage rather than rewriting evidence into a preferred state.
- **ADR 0014 — state transitions, concurrency, and idempotency:** valid state transitions occur through defined application operations, not through strings embedded in content.

## Human-readable markers

Human-readable workflow tags remain useful when their semantics are explicit.

For example:

```text
[RESEARCH REQUIRED: HEALTH-CLAIM]
```

may be displayed to a reviewer to explain that external evidence is still needed.

However, the canonical machine state should live separately, conceptually:

```text
research_gate.required = true
research_gate.status = pending
research_gate.scope = health_claim
research_gate.evidence_manifest = [...]
```

The visible tag mirrors machine state for comprehension. It does not create the state.

## Model recommendations

Model output may contain useful proposals such as:

- "this text may require a government warning";
- "the OCR confidence is too low for a deterministic check";
- "a citation/source check is needed";
- "the reviewer should inspect this panel manually."

Those are findings or recommendations.

They may route the user toward a defined workflow, but the model does not authorize itself to:

- change the governing rule set;
- bypass a reviewer;
- mark evidence complete;
- release a label;
- or expand its own capabilities.

## Required failure resistance

Implementations that consume untrusted text should be testable against at least these classes:

### Spoofing

Can OCR or imported text imitate an internal control marker?

**Required property:** the text remains evidence; no privileged transition occurs.

### Downgrade

Can content contain a marker such as `warning=false`, `research_complete`, or `approved` that clears an existing gate?

**Required property:** only the authenticated state-transition path can change the gate.

### Privilege escalation

Can model/retrieved content request broader tools, data, or rule-changing authority?

**Required property:** capability policy remains external to the content.

### False completion

Can a model state that verification occurred when there is no evidence manifest or reviewer action?

**Required property:** completion is derived from recorded workflow evidence, not self-report.

### Provenance overwrite

Can a later artifact replace the origin of an earlier observation or decision?

**Required property:** corrections and decisions append lineage rather than erase it.

## Consequences

### Positive

- label text cannot impersonate application configuration;
- OCR/model output remains safely bounded as evidence;
- deterministic decision ownership stays inspectable;
- reviewer authority remains explicit;
- research/release gates can be audited independently from prose; and
- future AI features can be added without making typography a security boundary.

### Cost

- state that is obvious to a human may still require an explicit machine representation;
- application workflows must carry typed state rather than relying on prompt conventions; and
- tests must distinguish content parsing from control-state mutation.

These costs are intentional because Label Lens is a prescreen/review system, not a free-form conversational agent.

## Non-goals

This ADR does not:

- add a new compliance rule;
- claim that any label is approved by TTB;
- define a new AI provider;
- authorize autonomous release/submission;
- require every human-facing tag to become persisted state; or
- replace existing reviewer and provenance controls.

## North star

```text
Evidence may look authoritative.
Authority must be authenticated.
```
