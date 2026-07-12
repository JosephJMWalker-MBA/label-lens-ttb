# AI-Assisted Development Tool Selection

**Status:** Accepted operating record  
**Scope:** Label Lens TTB repository work  
**Purpose:** Record which AI development tools are assigned to which classes of work, the settings used, the reasons for those choices, and the guardrails that keep parallel work auditable.

## 1. Decision summary

Label Lens TTB uses multiple AI development tools deliberately rather than treating them as interchangeable.

The current operating allocation is:

| Tool / mode | Current setting | Primary responsibility | Why it was selected |
| --- | --- | --- | --- |
| Codex | Repository coding agent; current account/default coding configuration | Extraction pipeline, OCR logic, candidate generation, filtering, ranking, parsing, evaluation harnesses, corpus regression analysis, and performance work close to the extractor | It has produced strong results on narrow, test-driven engineering slices that require repository inspection, repeated full-corpus evaluation, exact before/after metrics, and disciplined branch/PR execution. |
| Claude Code — Opus 4.8 | **Low** effort setting | Reasoning-heavy product-surface work, accessibility, onboarding, interaction architecture, documentation integrity, and carefully bounded UI implementation | The Low setting has been sufficient for high-quality repository work while using the available rate limit efficiently. It successfully implemented the accessibility, theme, onboarding, and long-wait UI foundation without crossing into OCR or API behavior. |
| Claude Code — Fable | Current Fable mode; no separate effort setting recorded in this decision | Visual and interaction-focused implementation that builds on an already established UI foundation | Fable is reserved for work where visual hierarchy, evidence presentation, responsive composition, and interaction quality are the dominant challenge. It should inherit established architecture rather than define core extraction or regulatory behavior. |

This allocation is an operating decision, not a claim that one model is universally better than another.

## 2. Evidence for the current allocation

### 2.1 Codex results

Codex has been effective when given one bounded engineering objective, explicit non-goals, a fixed evaluation corpus, and a stop-before-merge requirement.

Examples include:

- repairing the PR #64 integration mistake by recreating the full-corpus work on a clean branch from `main`;
- implementing the Phase 1 no-brand abstention gate;
- reducing absent-brand false positives from `10/10` to `0/10` with zero false abstentions;
- implementing Phase 2 brand reconstruction and ranking;
- improving exact brand match from `17.8%` to `26.7%` while preserving the Phase 1 safety boundary;
- preserving alcohol behavior while changing only the intended brand logic;
- running full repository and corpus validation before opening each PR.

The main reason for continuing to use Codex on OCR phases is not merely code generation. It is the combination of:

1. repository-level inspection;
2. repeated measured tuning;
3. case-level regression analysis;
4. branch discipline;
5. exact validation reporting.

### 2.2 Claude Code Opus 4.8 Low results

Claude Code at Opus 4.8 Low implemented the accessibility, onboarding, appearance, and processing-state foundation in PR #68.

That work included:

- Light, Dark, and System themes;
- before-paint theme application;
- persisted text-size and reduced-motion preferences;
- accessible first-use onboarding;
- honest long-wait processing status;
- duplicate-submit prevention;
- success and error focus management;
- keyboard and screen-reader improvements;
- unit and Playwright coverage;
- explicit confirmation that no OCR, extractor, evaluation, rule, report, or API files changed.

The result demonstrates that the Low effort setting is currently enough for well-specified UI and product work. Raising effort by default would consume more allowance without evidence that the additional cost is necessary.

### 2.3 Fable role

Fable should receive tasks that are substantial but visually and interactionally concentrated, such as:

- evidence-centered result layout;
- responsive image-and-findings composition;
- OCR coordinate overlays;
- alternative-candidate presentation;
- confirmation-workflow previews;
- visual hierarchy that reuses the accessibility and theme foundation.

Fable should not independently redefine:

- OCR semantics;
- regulatory findings;
- evidence provenance;
- API contracts;
- append-only correction rules;
- evaluation truth;
- authority boundaries.

Those decisions must already be established before Fable implements the interface.

## 3. Rate-limit strategy

The project optimizes for completed, validated work per unit of model allowance rather than maximum model intensity on every task.

Current practice:

- use Codex for long-running repository and evaluation work where repeated command execution and code-level iteration are central;
- use Opus 4.8 at Low for bounded reasoning-heavy implementation when Low is already producing complete, validated PRs;
- use Fable for a visual/product task worth doing, rather than spending additional Opus allowance on work Fable is suited to perform;
- move to a fresh Opus session or account when context is heavily saturated instead of continuing a reasoning-heavy task inside a nearly exhausted session;
- do not raise effort merely because a higher setting exists;
- raise effort only when the lower setting produces an identifiable reasoning or implementation deficit.

The observed result so far is strong output from both Codex and Claude with controlled allowance consumption. This document does not record vendor-specific performance benchmarks or guarantee that the same rate limits will remain available.

## 4. Task routing rules

### Route to Codex when the task primarily requires

- extractor or parser changes;
- image preprocessing or OCR behavior;
- corpus-wide measurement;
- candidate generation, filtering, or ranking;
- before/after metrics;
- failure taxonomy changes;
- performance instrumentation near the processing pipeline;
- repeated full validation against repository artifacts.

### Route to Opus 4.8 Low when the task primarily requires

- product-boundary reasoning;
- accessibility architecture;
- onboarding and workflow design;
- careful UI implementation with many semantic constraints;
- documentation synthesis or governance;
- cross-component behavior that must preserve existing domain boundaries.

### Route to Fable when the task primarily requires

- visual hierarchy;
- responsive composition;
- evidence visualization;
- interaction polish built on approved contracts;
- implementation of a defined product experience without changing core semantics.

### Escalate or reassign when

- a task crosses more than one primary boundary;
- the assigned tool begins modifying prohibited files;
- results cannot be measured;
- repeated regressions indicate the task is too broad;
- context saturation makes earlier constraints unreliable;
- the lower effort setting cannot preserve the required reasoning quality.

## 5. Parallel-work protocol

Parallel AI work is permitted only when file and responsibility boundaries are explicit.

Each task must state:

- repository and base branch;
- files or subsystems it may modify;
- files or subsystems it must not modify;
- current parallel branch activity;
- acceptance metrics;
- required tests;
- stop-before-merge instruction.

Before opening a PR, the tool must:

1. fetch the latest `origin/main`;
2. confirm the intended merge base;
3. verify that no parallel branch was accidentally included;
4. inspect the changed-file list;
5. run the required validation suite;
6. open a PR against `main` and stop before merge.

Whichever parallel PR finishes second must refresh from the newly merged `main` and rerun validation.

## 6. Required evidence from every AI-authored PR

Every implementation report should include:

- root-cause or current-state analysis;
- exact production behavior changed;
- files changed;
- explicit non-goals;
- tests added or updated;
- complete validation results;
- measurable before/after results where applicable;
- regressions and tradeoffs;
- confirmation that prohibited subsystems were not modified;
- PR number and CI state.

A successful PR is not defined by code volume or model confidence. It is defined by bounded scope, measured improvement, preserved safety, and passing validation.

## 7. Human authority and review

AI tools may:

- inspect the repository;
- propose and implement bounded changes;
- run tests;
- prepare commits and pull requests;
- report measured results.

AI tools do not independently authorize:

- merging a PR;
- changing the product authority model;
- weakening evidence or provenance requirements;
- treating evaluation truth as production input;
- representing a prototype target as production readiness;
- changing regulatory meaning without explicit review.

The human maintainer remains responsible for task selection, final review, merge decisions, and changes to this allocation.

## 8. Review and update triggers

Revisit this decision when:

- a tool repeatedly fails its assigned class of work;
- a lower setting no longer produces reliable results;
- a new model or mode materially changes cost or capability;
- parallel-work conflicts become frequent;
- rate-limit usage becomes inefficient;
- the product moves from prototype implementation into operational deployment.

Updates should record observed repository outcomes rather than general impressions of model quality.
