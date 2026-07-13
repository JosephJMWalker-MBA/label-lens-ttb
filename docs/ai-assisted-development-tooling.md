# AI-Assisted Development Tool Selection

**Status:** Accepted operating record  
**Scope:** Label Lens TTB repository work  
**Purpose:** Record the human and AI tools used for development, their settings, assigned responsibilities, and the coordination method that keeps parallel work aligned with GitHub.

## Operating model

Label Lens TTB uses a coordinated toolchain rather than treating coding models as interchangeable or self-directing.

1. **Human authority — Joseph Walker:** selects product direction, approves task boundaries, reviews evidence, and authorizes merges.
2. **Reasoning and coordination control plane — Joseph + ChatGPT:** performs cross-cutting product and engineering reasoning, prepares bounded task packets, reviews returned work, and keeps conversation synchronized with GitHub.
3. **Specialized agents:** Codex, Opus, Fable, and GPT-5.6 Sol are assigned according to task shape and evidence needs.
4. **Durable state — GitHub:** issues, branches, PRs, commits, reports, ADRs, and CI are the factual state shared across sessions and tools.

| Tool / mode | Setting | Primary responsibility |
| --- | --- | --- |
| Joseph + ChatGPT | GPT-5.6 Thinking with live GitHub access | Product reasoning, architecture, sequencing, acceptance gates, prompts, branch verification, PR review, and coordination |
| Codex | Codex 5.4, Extra High effort, Standard speed | OCR, extraction, candidate construction, parsing, corpus evaluation, regression analysis, and long-running measured engineering tasks |
| Claude Code — Opus 4.8 | Low effort | Accessibility, onboarding, bounded UI, documentation, and governance work |
| Claude Code — Fable 5 | No separate effort setting recorded | Visual and interaction implementation; selected architecture review and audit work |
| GPT-5.6 Sol | Review / audit mode | Independent architecture review, contradiction finding, adversarial audit, and pressure-testing assumptions |
| NotebookLM | Current hosted notebook workflow | Multi-voice Rubber Duck Review discussion generated from bounded review packets |
| MacWhisper | Local transcription workflow | Local transcription of Rubber Duck Review audio |

This allocation is based on observed repository outcomes, not a universal model ranking.

## Coordination environment

Joseph and ChatGPT use the project conversation to:

- convert product observations into engineering hypotheses;
- distinguish architecture, OCR, workflow, governance, performance, and presentation problems;
- sequence work into one-PR slices;
- define measurable gates and explicit non-goals;
- prepare exact task packets;
- inspect repository state and CI;
- detect branch and merge-base mistakes;
- verify agent reports against durable evidence;
- carry measured findings into later phases;
- coordinate non-overlapping parallel work;
- preserve continuity across sessions, accounts, and context windows.

Each implementation or review task should include the authoritative base, current baseline, one bounded objective, known diagnostic cases, governing principles, allowed and prohibited subsystems, required validation, stop-before-merge instructions, and exact return evidence.

A conclusion in chat is not repository truth until a durable GitHub record exists.

## Observed results

### Codex 5.4 Extra High

Codex has:

- repaired an integration mistake through a clean main-based branch;
- built and expanded the full-corpus evaluation workflow;
- reduced absent-brand false positives from 10/10 to 0/10 with zero false abstentions;
- improved exact brand match from 17.8% to 26.7%;
- improved alcohol detection recall from 36.6% to 57.4%;
- improved alcohol parsed-value accuracy from 34.7% to 54.5%;
- repeatedly regenerated corpus evidence after final code changes;
- found and corrected regressions before opening PRs;
- returned exact metrics, case deltas, tradeoffs, and full validation results.

Extra High is justified for long, stateful, diagnostic, regression-sensitive work. It is not automatically required for shorter tasks.

### Opus 4.8 Low

Opus 4.8 at Low implemented the accessibility and onboarding foundation, including:

- Light, Dark, and System themes;
- persisted font-size and reduced-motion preferences;
- accessible onboarding;
- honest long-wait status;
- duplicate-submit prevention;
- focus management;
- keyboard and screen-reader improvements;
- unit and Playwright coverage.

This demonstrates that Low can deliver complete validated work when the coordination layer supplies precise product reasoning and boundaries.

### Fable 5

Fable has been used for foundation review and for visually concentrated implementation. PR #71 added:

- an evidence-centered result layout;
- OCR coordinate overlays;
- responsive image-and-findings composition;
- candidate inspection;
- bidirectional evidence focus behavior;
- an honest future-confirmation preview.

The result was valuable and validated, but part of it exceeded the explicitly requested behavior. ADR-005 therefore governs future use: local implementation choices remain delegated, while adjacent product behavior requires a maintainer check-in before implementation.

Fable must not independently redefine OCR semantics, regulatory findings, provenance, API contracts, correction rules, evaluation truth, persistence, submission, or authority boundaries.

### Foundation review

Fable and GPT-5.6 Sol were both used during the foundation phase to:

- test whether the architecture composed under scrutiny;
- challenge assumptions about security, authority, provenance, and workflow;
- identify contradictions between documented and implemented states;
- distinguish architectural success from product usefulness;
- pressure-test whether human authority remained real;
- surface risks that should become issues or gates.

## Rate-limit strategy

The project optimizes for validated work per unit of model allowance.

- Use Joseph + ChatGPT for cross-cutting reasoning, sequencing, task design, and repository synchronization.
- Use Codex Extra High for long OCR and corpus tasks where repeated measurement justifies the setting.
- Use Opus Low for well-specified UI, accessibility, documentation, and governance work.
- Use Fable selectively for visual implementation or independent audit under explicit boundaries.
- Use fresh sessions when context is saturated.
- Preserve state in GitHub so a new session does not need to rediscover the project.
- Raise model effort only when task complexity or observed deficits justify it.

## Routing and handoff rules

Route through Joseph + ChatGPT first for product direction, architecture, authority decisions, phase design, model selection, acceptance metrics, parallel coordination, branch verification, and merge recommendation.

Route to Codex for extractor changes, OCR behavior, candidate construction, parsing, corpus measurement, failure taxonomy, and repeated full validation.

Route to Opus for accessibility, onboarding, careful cross-component UI work, documentation, and governance under established constraints.

Route to Fable for visual hierarchy, responsive composition, evidence visualization, interaction polish, and bounded audits. When Fable identifies adjacent product behavior, ADR-005 requires a check-in before implementation.

Every AI-authored implementation report must include:

- root-cause or current-state analysis;
- exact production behavior changed;
- files changed;
- explicit non-goals;
- tests and validation;
- measurable before/after results where applicable;
- regressions and tradeoffs;
- confirmation that prohibited subsystems were not modified;
- PR number and CI state.

Every architecture-review or audit report should include the question, evidence examined, assumptions challenged, contradictions and risks, confidence and uncertainty, recommended gates or follow-up work, and a clear distinction between implemented facts and proposals.

## Parallel work

Before opening a PR, each implementation tool must:

1. fetch latest origin/main;
2. confirm the merge base;
3. verify no parallel branch was included;
4. inspect changed files;
5. run the required validation suite;
6. open against main and stop before merge.

The second parallel PR to finish must refresh from newly merged main and rerun validation.

## Human authority

AI tools may inspect, reason, audit, implement bounded changes, test, prepare PRs, and coordinate handoffs.

They do not independently authorize merges, change the authority model, weaken evidence requirements, use evaluation truth as production input, claim production readiness, or change regulatory meaning.

Joseph Walker remains responsible for product direction, final review, merge decisions, and changes to this allocation. ChatGPT is the reasoning and coordination partner, not a replacement for human authority.

## Review triggers

Revisit this allocation when a tool repeatedly fails its assigned work, a setting no longer produces reliable results, capabilities or costs change materially, parallel conflicts become frequent, rate-limit use becomes inefficient, the coordination layer fails to keep chat and GitHub aligned, or the project moves from prototype development to operational deployment.

Updates must be based on observed repository outcomes rather than general model impressions.
