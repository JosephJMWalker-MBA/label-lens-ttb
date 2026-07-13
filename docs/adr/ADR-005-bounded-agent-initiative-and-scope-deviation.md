# ADR-005: Bounded Agent Initiative and Scope Deviation

**Status:** Accepted  
**Date:** 2026-07-12  
**Decision owners:** Joseph Walker  
**Related work:** PR #71, `UI: add evidence-centered result and confirmation preview`

## Context

Label Lens TTB uses multiple AI development tools under a coordinated workflow. Tasks are normally defined with explicit objectives, non-goals, file boundaries, acceptance criteria, validation commands, and a stop-before-merge requirement.

PR #71 was assigned to create an evidence-centered result experience using existing server-provided OCR geometry. The implementation successfully added:

- brand and alcohol evidence overlays;
- bidirectional navigation between image regions and evidence cards;
- bounded alternative-candidate inspection;
- responsive and accessible evidence presentation;
- an honest preview of the future seller-confirmation workflow.

The result was valuable and passed the full test and CI suite. It also included product behavior that had not been requested explicitly yet: the future confirmation-preview panel and related interaction framing.

The maintainer recorded the following after merge:

> "you did what I hadn't asked for yet. Please note while the result was good, this was not a bounded behavior. Use Fable 5 with caution."

This exposed an important distinction:

- an implementation can be technically excellent and strategically useful;
- while still exceeding the authorized task boundary.

A favorable outcome does not make unrequested scope expansion safe as a general operating pattern.

## Decision

AI implementation agents may exercise initiative **inside the authorized problem boundary**, but they may not silently expand the product boundary, authority model, persistence behavior, evidence semantics, or user commitments.

Unrequested behavior is treated as a **scope deviation**, even when:

- it is well designed;
- tests pass;
- the maintainer likes the result;
- it anticipates a known future direction;
- it does not immediately create a defect.

Scope deviations must be surfaced explicitly and reviewed as decisions rather than normalized after the fact.

## Permitted initiative

An agent may make local implementation choices needed to complete an authorized task, including:

- component decomposition;
- naming and internal organization;
- accessible interaction details;
- defensive handling of missing data;
- focused tests;
- bounded presentation improvements;
- technical refinements that preserve existing contracts and semantics.

The agent may also identify valuable adjacent work, but should normally:

1. document it;
2. propose it as a follow-up;
3. avoid implementing it unless the task packet explicitly allows adjacent improvements.

## Initiative requiring explicit authorization

An agent must stop, ask, or return a proposal before implementing behavior that:

- introduces a new user workflow;
- represents a future feature in the active product surface;
- adds persistence, submission, correction, annotation, or account behavior;
- changes the meaning of machine evidence or human input;
- alters regulatory or authority boundaries;
- modifies API or report contracts;
- changes evaluation truth or production selection behavior;
- creates a new promise to users;
- expands substantially beyond the task's acceptance criteria;
- consumes a meaningful amount of implementation scope not required by the assigned objective.

## Treatment of beneficial scope deviations

When an agent produces a useful unrequested feature:

- do not reject it automatically;
- do not treat passing CI as sufficient authorization;
- review the behavior against product intent, evidence boundaries, accessibility, security, and future architecture;
- identify the deviation in the PR or merge record;
- decide deliberately whether to keep, revise, revert, or separate it;
- update future prompts and routing rules so the same ambiguity does not recur.

Acceptance of one beneficial deviation does not create standing permission for future deviations.

## Fable 5 operational guidance

Fable 5 has demonstrated strong visual and interaction judgment, including the ability to anticipate product experience beyond the literal task request.

That capability is valuable for:

- evidence visualization;
- responsive composition;
- interaction design;
- product-surface coherence;
- identifying missing connective tissue in an established workflow.

It also creates a specific governance risk: Fable may solve the broader product experience rather than only the requested implementation slice.

Therefore, tasks assigned to Fable 5 should include:

- an exact statement of whether adjacent product improvements are allowed;
- explicit lists of permitted and prohibited behavior;
- a requirement to describe proposed additions before implementing them when they create new workflow meaning;
- changed-file and UI-behavior review before merge;
- tests proving that machine evidence, human input, authority, and persistence boundaries remain unchanged;
- a stop-before-merge instruction.

For narrowly bounded work, use language such as:

> Implement only the behavior listed in the acceptance criteria. Record adjacent product ideas as proposals; do not add them to the active UI without explicit authorization.

For intentionally exploratory visual work, use language such as:

> You may propose and prototype adjacent presentation improvements, but clearly identify every behavior not explicitly requested and keep all authority, evidence, API, persistence, and submission boundaries unchanged.

## Attribution

Agents may identify themselves in generated commits, pull requests, or documentation where repository policy allows it. Attribution does not grant decision authority and does not reduce the maintainer's responsibility for review and merge approval.

The value of PR #71 is recognized as a substantive contribution by Fable 5. The contribution is retained because it was reviewed and found consistent with the intended future seller-confirmation direction, not because unbounded behavior is generally authorized.

## Consequences

### Positive

- preserves the creative value of capable implementation agents;
- distinguishes initiative from authority;
- prevents good outcomes from weakening scope governance;
- makes unexpected behavior visible and reviewable;
- supports more accurate task routing and model-risk measurement;
- allows Fable 5 to be used for high-value visual work with appropriate caution.

### Costs

- prompts must be more explicit about adjacent improvements;
- agents may stop or defer ideas that a human would have accepted;
- maintainers must inspect behavior, not only changed files and test results;
- exploratory work may require a separate prototype or PR.

## Rejected alternatives

### Prohibit all agent initiative

Rejected because implementation requires many local decisions, and strong agents can identify meaningful usability improvements that would otherwise be missed.

### Accept any scope expansion when tests pass

Rejected because tests prove only the assertions encoded in the suite. They do not authorize new product promises, workflows, authority boundaries, or future-facing behavior.

### Treat visual-only additions as inherently safe

Rejected because presentation can change user interpretation, trust, perceived authority, and expectations even when APIs and domain logic remain unchanged.

## Review triggers

Revisit this decision when:

- Fable 5 or another model repeatedly exceeds task boundaries;
- beneficial deviations become common enough to justify an explicit exploratory mode;
- the project adds automated policy checks for UI claims or workflow boundaries;
- agents gain stronger planning or approval mechanisms;
- the seller-confirmation workflow moves from preview into active persistence and submission behavior.
