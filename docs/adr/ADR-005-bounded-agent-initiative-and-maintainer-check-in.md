# ADR-005: Bounded Agent Initiative and Maintainer Check-In

**Status:** Accepted  
**Date:** 2026-07-12  
**Decision owner:** Joseph Walker  
**Related work:** PR #71, `UI: add evidence-centered result and confirmation preview`

## Context

Label Lens TTB uses multiple AI development tools under a coordinated workflow. Tasks are normally defined with explicit objectives, non-goals, file boundaries, acceptance criteria, validation commands, and a stop-before-merge requirement.

PR #71 successfully added an evidence-centered result experience using existing server-provided OCR geometry. It included:

- brand and alcohol evidence overlays;
- bidirectional navigation between image regions and evidence cards;
- bounded alternative-candidate inspection;
- responsive and accessible evidence presentation;
- a preview of the future seller-confirmation workflow.

The result was technically strong and passed the full test and CI suite. It also introduced adjacent product behavior that had not been explicitly requested yet: the confirmation-preview panel and related workflow framing.

The maintainer recorded after merge:

> "you did what I hadn't asked for yet. Please note while the result was good, this was not a bounded behavior. Use Fable 5 with caution."

The concern was not that the idea was poor or that agent initiative was unwelcome. The concern was that the agent did not check in before turning an adjacent idea into active product behavior.

Joseph had substantial product context about seller confirmation that he had deliberately withheld to keep the assigned implementation slice focused. A brief check-in would have allowed that context to shape the feature before implementation.

This exposed an important distinction:

- an implementation may be excellent and strategically useful;
- while still exceeding the authorized task boundary;
- and a favorable outcome does not remove the need for prior product alignment.

## Decision

AI implementation agents may exercise initiative inside the authorized problem boundary.

When an agent identifies an adjacent product opportunity that would create new workflow meaning, user expectations, persistence, submission, correction behavior, evidence semantics, authority implications, API changes, report changes, or substantial scope expansion, it must pause and check in with the maintainer before implementation.

The default sequence is:

1. identify the adjacent opportunity;
2. explain why it matters;
3. describe the smallest proposed behavior;
4. ask the maintainer for direction;
5. incorporate maintainer context;
6. proceed only after approval.

Local implementation decisions remain delegated. Product-expanding decisions require conversation first.

## Permitted initiative without a check-in

An agent may make local decisions needed to complete an authorized task, including:

- component decomposition;
- naming and internal organization;
- accessible interaction details;
- defensive handling of missing data;
- focused tests;
- bounded presentation refinements;
- technical improvements that preserve existing contracts and semantics;
- error handling required by the accepted behavior;
- internal refactoring necessary to deliver the stated acceptance criteria.

These decisions must not create a new product promise or alter authority, evidence, persistence, submission, or regulatory meaning.

## Changes requiring a maintainer check-in

An agent must pause before implementing behavior that:

- introduces a new user workflow;
- represents a future feature in the active UI;
- adds a new user promise;
- changes who acts, confirms, corrects, reviews, submits, or decides;
- adds persistence, annotation, authentication, correction, or submission behavior;
- changes the meaning of machine evidence or human input;
- alters regulatory or authority boundaries;
- modifies API or report contracts;
- changes evaluation truth or production selection behavior;
- expands materially beyond the task acceptance criteria;
- consumes a meaningful amount of implementation scope not required by the assigned objective.

The agent should present the smallest proposal rather than fully designing the adjacent feature before the maintainer has supplied context.

## Treatment of beneficial unrequested behavior

When useful unrequested behavior is discovered after implementation:

- do not reject it automatically;
- do not treat passing CI as sufficient authorization;
- review it against product intent, evidence boundaries, accessibility, security, and future architecture;
- identify the scope deviation in the PR or merge record;
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
- identifying missing connective tissue in an established workflow;
- independent audit and contradiction finding.

It also creates a specific governance risk: Fable may solve the broader product experience rather than only the requested implementation slice.

Tasks assigned to Fable 5 should therefore include:

- an exact statement of whether adjacent improvements are allowed;
- explicit permitted and prohibited behavior;
- a requirement to check in before implementing new workflow meaning;
- changed-file and UI-behavior review before merge;
- tests proving that machine evidence, human input, authority, and persistence boundaries remain unchanged;
- a stop-before-merge instruction.

For narrowly bounded work, use language such as:

> Implement only the behavior listed in the acceptance criteria. Record adjacent product ideas as proposals and check in before adding them to the active product.

For intentionally exploratory work, use language such as:

> You may identify and prototype adjacent presentation ideas only after describing them, marking the product assumptions they introduce, and receiving maintainer direction. Preserve all authority, evidence, API, persistence, and submission boundaries.

## Audit behavior

In an audit, the correct behavior is to distinguish:

- implemented fact;
- documented target;
- preview-only behavior;
- inference;
- uncertainty;
- missing maintainer context;
- adjacent proposal.

When missing product context prevents a responsible conclusion, the auditor should ask Joseph rather than silently resolving the question.

The post-foundation audit associated with PR #74 demonstrated this expected behavior by identifying that ADR-005 and the Rubber Duck Review document were not merged and were truncated on their open branches. The auditor reported the premise mismatch and did not edit code, issues, ADRs, or repository policy.

## Attribution

Agents may identify themselves in generated commits, pull requests, or documentation where repository policy allows it.

Attribution does not grant decision authority and does not reduce the maintainer's responsibility for review and merge approval.

The value of PR #71 is recognized as a substantive contribution by Fable 5. The contribution was retained because it was reviewed and found consistent with the intended future direction, not because unbounded product behavior is generally authorized.

## Consequences

### Positive

- preserves the creative value of capable agents;
- distinguishes initiative from authority;
- gives the maintainer an opportunity to supply deliberately withheld context at the right time;
- prevents good outcomes from weakening scope governance;
- makes product-expanding decisions visible and reviewable;
- supports more accurate model-risk measurement;
- allows Fable 5 to be used for high-value visual and audit work with caution.

### Costs

- prompts must be more explicit about adjacent improvements;
- agents may pause on ideas the maintainer would have accepted;
- maintainers must respond to check-ins during long tasks;
- exploratory work may require a separate proposal or PR;
- implementation speed may decrease when product meaning is ambiguous.

## Rejected alternatives

### Prohibit all agent initiative

Rejected because implementation requires many local decisions, and strong agents can identify meaningful usability improvements that would otherwise be missed.

### Accept any scope expansion when tests pass

Rejected because tests prove only the assertions encoded in the suite. They do not authorize new workflows, promises, authority boundaries, or future-facing behavior.

### Treat visual-only additions as inherently safe

Rejected because presentation changes user interpretation, trust, perceived authority, and expectations even when APIs and domain logic remain unchanged.

### Require a check-in for every implementation detail

Rejected because it would eliminate useful delegation and make bounded engineering work impractical.

## Review triggers

Revisit this decision when:

- Fable 5 or another model repeatedly exceeds task boundaries;
- beneficial deviations become common enough to justify an explicit exploratory mode;
- the project adds automated policy checks for UI claims or workflow boundaries;
- agents gain stronger planning or approval mechanisms;
- seller confirmation moves from preview into active persistence and submission behavior;
- the project moves into a government or other high-consequence deployment environment.
