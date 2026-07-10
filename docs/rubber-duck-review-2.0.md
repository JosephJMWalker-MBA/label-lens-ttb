# Rubber Duck Review 2.0

## Purpose

Rubber Duck Review 2.0 is a recurring buffer-audit step performed after every three pull requests.

The goal is not merely to confirm that the code works. The goal is to ensure that the engineer understands:

- what was built,
- why it was built that way,
- which tradeoffs were accepted,
- which assumptions remain untested,
- what alternatives were rejected,
- and what should happen next.

The review converts recent development into a two-voice technical debate that can be listened to, read, or processed by an external tool such as NotebookLM.

The review may also be generated and run locally when privacy, confidentiality, or offline operation matters.

## Cadence

Run Rubber Duck Review 2.0 after every three pull requests.

Example cadence:

```text
PR 1
PR 2
PR 3
  ↓
Rubber Duck Review 2.0
  ↓
PR 4
PR 5
PR 6
  ↓
Rubber Duck Review 2.0
```

The review is a required engineering checkpoint, not an optional retrospective.

## Why Three Pull Requests

One pull request is often too narrow to reveal architectural drift.

A long milestone is too late: assumptions may already be embedded across multiple layers.

Three pull requests provide enough implementation evidence to identify patterns while the design is still easy to change.

## Required Inputs

The review should examine:

1. The three pull-request descriptions.
2. Their commits and changed files.
3. Relevant architecture decision records.
4. Engineering principles and design-review criteria.
5. Test results and known CI limitations.
6. Stakeholder requirements affected by the changes.
7. New technical debt, unresolved questions, or deferred work.

## Debate Roles

### Voice A — The Builder

The Builder explains and defends the work.

Responsibilities:

- state the problem each pull request solved,
- explain why the chosen design was appropriate for the current scope,
- identify intentional constraints,
- distinguish temporary decisions from durable architecture,
- connect implementation choices to stakeholder needs,
- and acknowledge known limitations honestly.

The Builder must not defend choices merely because they already exist.

### Voice B — The Reviewer

The Reviewer challenges the work as a skeptical senior engineer, operator, security reviewer, accessibility reviewer, and future maintainer.

Responsibilities:

- identify hidden coupling,
- challenge unnecessary abstractions,
- challenge missing abstractions where repeated concepts already exist,
- question assumptions and hard-coded policies,
- test whether the code supports replacement of infrastructure,
- examine failure modes and observability,
- assess whether tests prove behavior rather than implementation,
- and identify decisions that could erode operator trust.

The Reviewer should be constructive, specific, and evidence-based.

## Debate Structure

Each episode or script should follow this sequence.

### 1. Context

- What three pull requests are under review?
- What changed in the product and architecture?
- What constraints shaped the work?

### 2. Pull Request Review

For each pull request:

- problem solved,
- implementation approach,
- why the approach was reasonable,
- evidence that it works,
- tradeoffs,
- risks,
- alternatives,
- and whether the decision should remain, change, or be revisited later.

### 3. Cross-PR Architecture Review

Ask:

- Do the three pull requests form a coherent system?
- Did dependency direction remain clean?
- Did any temporary choice become an accidental contract?
- Did terminology remain consistent?
- Is evidence preserved across layers?
- Did tests grow with the architecture?
- Did user effort increase or decrease?
- Did the changes preserve human authority?

### 4. Operational Review

Ask:

- What happens when extraction fails?
- What happens when confidence is low?
- What happens when external services are unavailable?
- Can the employee keep working?
- Could this change cause users to abandon the tool?
- Is the cost model optimizing compute expense or total operational cost?

### 5. Security and Compliance Review

Ask:

- What data is collected, stored, transmitted, or logged?
- Is retention explicit?
- Can decisions be reproduced?
- Are originals and derived artifacts distinguishable?
- Are rule versions and model versions recorded?
- Does the system claim more compliance certainty than the evidence supports?

### 6. Verdict

Classify each major decision as:

- **Keep** — sound and appropriately implemented.
- **Harden** — correct direction, but needs stronger tests, provenance, configuration, or operational controls.
- **Revisit** — reasonable for now, but should be reconsidered before the next major milestone.
- **Replace** — evidence shows the current design is no longer suitable.

### 7. Next Actions

Produce a short prioritized list:

1. blockers before the next slice,
2. improvements that should become issues,
3. questions needing stakeholder or legal clarification,
4. decisions that should become ADRs,
5. and changes that should explicitly wait.

## Required Output Artifacts

Each Rubber Duck Review 2.0 should produce:

1. A source brief containing the three PR summaries, architecture context, tests, and known limitations.
2. A two-voice debate script.
3. A written verdict table.
4. A list of follow-up issues or ADR candidates.
5. A short engineer reflection: what the author now understands better than before the review.

Suggested location:

```text
docs/reviews/
  rdd-001-pr-001-003/
    source-brief.md
    debate-script.md
    verdict.md
    next-actions.md
```

## Local and Private Mode

NotebookLM is an optional presentation and audio-generation layer, not a dependency of the review process.

For private or restricted projects, the same review can be performed locally:

1. Export the three PR diffs and descriptions.
2. Combine relevant ADRs and tests into a source brief.
3. Run the Rubber Duck Review prompt through an approved local or private model.
4. Generate the two-voice script.
5. Optionally synthesize audio locally.
6. Store only the written review artifacts permitted by policy.

No private source code must be uploaded to an external service merely to perform this audit.

## Reusable Generation Prompt

```text
You are producing Rubber Duck Review 2.0 for three completed pull requests.

Create a rigorous two-person technical debate.

Voice A is the Builder. The Builder explains what was implemented, why the design was chosen, what stakeholder or operational requirement it serves, what evidence supports it, and which limitations were intentionally accepted.

Voice B is the Reviewer. The Reviewer challenges architecture, hidden coupling, premature abstraction, missing tests, security, accessibility, operational failure modes, data retention, provenance, total cost, and operator trust. The Reviewer must distinguish real defects from reasonable temporary scope decisions.

For each pull request, cover:
- problem solved,
- implementation approach,
- why it made sense at the time,
- alternatives,
- tradeoffs,
- evidence from tests,
- risks,
- and whether the decision should be kept, hardened, revisited, or replaced.

Then review the three pull requests as one system. Ask whether dependency direction remains clean, whether terminology and contracts are coherent, whether temporary choices became accidental architecture, and whether the system still serves the human workflow.

End with:
1. a verdict table,
2. prioritized next actions,
3. ADR candidates,
4. unresolved stakeholder questions,
5. and a concise explanation of what the engineer should now understand more deeply.

Do not produce praise-only commentary. Do not invent defects. Make every challenge specific and evidence-based.
```

## Definition of Done

A Rubber Duck Review 2.0 checkpoint is complete when:

- the three PRs are represented accurately,
- both voices make substantive arguments,
- implementation decisions are connected to requirements,
- at least one plausible alternative is considered for each major decision,
- risks and limitations are stated without exaggeration,
- verdicts are assigned,
- next actions are recorded,
- and the engineer can explain the system without relying on the code-generation tool that wrote it.

## Governing Principle

Rubber Duck Review 2.0 exists to prevent velocity from outrunning understanding.

The code should not merely pass tests. The engineer should be able to explain why the system deserves to exist in its present form and what evidence would justify changing it.
