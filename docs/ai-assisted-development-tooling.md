# AI-Assisted Development Tool Selection

**Status:** Accepted operating record  
**Scope:** Label Lens TTB repository work  
**Purpose:** Record the human and AI tools used for development, their settings, their assigned responsibilities, and the coordination method that keeps parallel work aligned with GitHub.

## 1. Operating model

Label Lens TTB uses a coordinated toolchain rather than treating coding models as interchangeable or self-directing.

The system has four layers:

1. **Human authority — Joseph Walker:** selects product direction, approves task boundaries, reviews evidence, and authorizes merges.
2. **Reasoning and coordination control plane — Joseph + ChatGPT:** performs the hard cross-cutting reasoning, translates product intent and repository evidence into bounded implementation tasks, reviews returned results, and keeps the project conversation synchronized with GitHub.
3. **Specialized review and implementation agents:** Codex, Opus, Fable, and GPT-5.6 Sol are assigned according to task shape and evidence needs.
4. **Shared durable state — GitHub:** issues, branches, PRs, commits, evaluation artifacts, policies, and CI results are the factual state shared across sessions and tools.

| Tool / mode | Current setting | Primary responsibility | Reason for selection |
| --- | --- | --- | --- |
| Joseph + ChatGPT coordination environment | GPT-5.6 Thinking with live GitHub access and the active project conversation | Product reasoning, architecture, task decomposition, acceptance gates, prompt construction, branch-state verification, PR review, parallel-work coordination, and synchronization between conversation and GitHub | This layer supplies the hard reasoning that makes specialized or lower-effort implementation tools effective. It preserves the product thesis, sequences work, detects repository-state errors, and keeps every agent anchored to the same evidence. |
| Codex | **Codex 5.4, Extra High effort, Standard speed** | OCR, extraction, candidate generation, filtering, ranking, parsing, corpus evaluation, regression analysis, and long-running measured engineering tasks | Extra High has performed exceptionally well on long tasks that require repeated corpus runs, stepwise diagnosis, bounded tuning, conflict repair, exact metrics, and complete validation before a PR is opened. |
| Claude Code — Opus 4.8 | **Low** effort | Accessibility, onboarding, interaction architecture, documentation, governance, and bounded UI implementation | Low has produced complete, validated UI work while using rate limits efficiently because the coordination layer supplies the difficult product reasoning and exact boundaries first. |
| Claude Code — Fable | Current Fable mode; no separate effort setting recorded | Visual and interaction implementation, plus selected foundation-architecture review and audit work | Fable has been useful both for visually concentrated implementation and for independent review of foundational architecture, provided that authority and evidence boundaries are already explicit. |
| GPT-5.6 Sol | Review/audit mode used during foundation architecture work | Independent architecture review, adversarial audit, contradiction finding, and pressure-testing of design assumptions | Sol provided an additional review perspective during the foundation phase, helping test whether the architecture, boundaries, and governing documents composed under scrutiny before implementation advanced. |

This is an operating allocation based on observed repository results, not a universal model ranking.

## 2. The coordination environment is a core tool

The ChatGPT project conversation is the control plane for the multi-agent workflow, not merely another place to generate code.

Joseph and ChatGPT use it to:

- convert product observations into engineering hypotheses;
- distinguish architecture, OCR, workflow, governance, performance, and presentation problems;
- decide what should be solved next;
- decompose broad goals into phases and one-PR slices;
- define measurable acceptance gates and explicit non-goals;
- prepare exact task packets for Codex, Opus, Fable, and review models;
- inspect GitHub issues, PRs, branches, commits, reports, and CI;
- detect branch-topology and merge-base mistakes;
- verify returned agent reports against repository evidence;
- carry measured findings from one implementation phase into the next;
- keep the seller-confirmation workflow aligned with the immediate OCR repair program;
- coordinate non-overlapping parallel work;
- preserve continuity across fresh sessions, accounts, and context windows.

This layer makes lower-effort and specialized tools more productive because they do not need to rediscover the entire product architecture. Each implementation or review agent receives:

- the authoritative base branch;
- the current measured baseline;
- one bounded objective;
- relevant diagnostic cases;
- governing product and authority principles;
- allowed and prohibited subsystems;
- required tests and validation commands;
- a stop-before-merge instruction where implementation is involved;
- exact evidence required on return.

The hard reasoning is performed once, preserved in conversation and GitHub, and converted into tasks that specialized agents can execute efficiently.

## 3. GitHub is the synchronization layer

No single model session is the source of truth. Durable project state lives in GitHub:

- issues and accepted policies;
- branches and merge bases;
- pull requests and commits;
- generated evaluation reports;
- CI runs;
- measured before/after results;
- review documents and ADRs.

The coordination environment uses GitHub to confirm:

1. what is actually present on `main`;
2. whether a PR merged into `main` or only into a temporary stacked base;
3. whether an agent started from the correct branch;
4. whether parallel work crossed prohibited boundaries;
5. whether CI actually passed;
6. which metrics and tradeoffs should govern the next phase.

A conclusion in chat is not treated as repository truth until the corresponding GitHub record exists.

## 4. Observed results

### 4.1 Coordination-layer results

The reasoning and coordination layer has:

- established the evidence-only, deterministic, human-authority architecture;
- designed the Rubber Duck Review process and converted findings into implementation gates;
- identified the applicant-declared claim-verification and seller-confirmation workflow;
- separated the ultimate workflow from the immediate OCR repair sequence;
- created the five-phase OCR repair plan;
- prioritized safe brand abstention before recall expansion;
- identified the Caywood live failure as candidate-selection failure rather than total OCR failure;
- separated the 38-second Render wait into a later performance slice;
- detected that PR #64 had merged into the wrong base;
- directed the clean PR #66 integration repair;
- assigned non-overlapping OCR and UI branches;
- reviewed metrics and tradeoffs before recommending merges.

### 4.2 Foundation architecture review and audits

Fable and GPT-5.6 Sol were both used during the foundation phase as review and audit tools, not only as implementation models.

Their review role included:

- testing whether the architecture composed under adversarial scrutiny;
- challenging assumptions about security, authority, provenance, and workflow boundaries;
- identifying contradictions between documented states and implemented states;
- distinguishing architectural success from product usefulness;
- pressure-testing whether human authority remained real rather than nominal;
- surfacing risks that should become issues, freezes, or acceptance gates;
- providing independent perspectives before later implementation work was assigned.

This matters because the project did not move directly from one planning conversation into code. Foundation decisions were reviewed from multiple angles before they became implementation constraints.

### 4.3 Codex 5.4 Extra High results

Codex currently runs at **5.4, Extra High effort, Standard speed** for the OCR repair program.

It has:

- repaired the PR #64 integration mistake through a clean main-based branch;
- built and expanded the full-corpus evaluation workflow;
- reduced absent-brand false positives from `10/10` to `0/10` with zero false abstentions;
- improved exact brand match from `17.8%` to `26.7%` during Phase 2;
- preserved the Phase 1 safety boundary while improving reconstruction and ranking;
- promoted coherent Caywood evidence above short OCR noise;
- run repeated full-corpus evaluation cycles;
- found and corrected regressions before opening PRs;
- completed long tasks in explicit diagnostic stages rather than opaque rewrites;
- returned exact before/after metrics and full validation results.

Extra High is justified here because the work is long, stateful, diagnostic, and regression-sensitive. It is not automatically required for shorter Codex tasks.

### 4.4 Opus 4.8 Low results

Opus 4.8 at **Low** implemented PR #68, including:

- Light, Dark, and System themes;
- persisted font-size and reduced-motion preferences;
- accessible onboarding;
- honest long-wait status;
- duplicate-submit prevention;
- success and error focus management;
- keyboard and screen-reader improvements;
- unit and Playwright coverage;
- strict confirmation that OCR and API behavior were untouched.

This demonstrates that Low can deliver complete, validated UI work when the coordination layer supplies precise product reasoning and file boundaries.

### 4.5 Fable implementation role

After its foundation-review work, Fable is also used for visually concentrated implementation such as:

- evidence-centered result layout;
- OCR coordinate overlays;
- responsive image-and-findings composition;
- alternative-candidate presentation;
- confirmation-workflow previews;
- interaction polish built on PR #68.

Fable must not independently redefine OCR semantics, regulatory findings, evidence provenance, API contracts, correction rules, evaluation truth, or authority boundaries.

## 5. Rate-limit strategy

The project optimizes for validated work per unit of model allowance.

Current practice:

- use Joseph + ChatGPT for cross-cutting reasoning, sequencing, task design, and repository synchronization;
- use Fable and GPT-5.6 Sol selectively for independent architecture review and audits when a second perspective is valuable;
- use Codex 5.4 Extra High for long OCR tasks where sustained execution and repeated measurement justify the setting;
- use Opus 4.8 Low for well-specified UI and governance work;
- use Fable for meaningful visual implementation rather than spending more Opus allowance on work suited to Fable;
- move to a fresh Opus session or account when context is saturated;
- preserve state in GitHub so fresh sessions do not need the entire prior conversation;
- raise model effort only when task complexity or observed deficits justify it.

Lower-effort implementation succeeds because difficult reasoning and boundaries are supplied by the coordination layer rather than rediscovered inside every agent run.

## 6. Routing rules

### Route through Joseph + ChatGPT first for

- product direction;
- architecture and authority decisions;
- Rubber Duck Review interpretation;
- task sequencing and phase design;
- model and effort selection;
- acceptance metrics and non-goals;
- parallel-agent coordination;
- branch-state verification;
- PR review and merge recommendation.

### Route to Fable or GPT-5.6 Sol for independent review when the task requires

- foundation architecture review;
- adversarial audit;
- contradiction detection;
- pressure-testing assumptions;
- evaluating whether governance and implementation claims align;
- identifying risks that should become issues or gates.

Review outputs remain advisory and must be reconciled by the coordination layer against repository evidence.

### Route to Codex 5.4 Extra High for

- extractor and parser changes;
- OCR and image-processing behavior;
- candidate generation, filtering, and ranking;
- corpus-wide measurement;
- failure-taxonomy work;
- repeated full validation;
- long stepwise debugging where each measurement guides the next edit.

### Route to Opus 4.8 Low for

- accessibility;
- onboarding;
- bounded workflow implementation;
- documentation and governance;
- careful cross-component UI work under established constraints.

### Route to Fable for implementation when the task primarily requires

- visual hierarchy;
- responsive composition;
- evidence visualization;
- interaction polish under approved contracts.

Reassign or escalate when a task crosses boundaries, modifies prohibited files, cannot be measured, repeatedly regresses, exceeds reliable context, or begins making product decisions reserved for the coordination layer.

## 7. Prompt and handoff protocol

Every implementation or review task should include:

- repository and authoritative base;
- completed prior phases;
- current measured baseline;
- one primary objective;
- known diagnostic cases;
- required behavior or review question;
- explicit non-goals;
- allowed and prohibited subsystems;
- acceptance metrics or review criteria;
- required tests where implementation is involved;
- branch and PR title where implementation is involved;
- stop-before-merge instruction;
- exact return-report requirements.

The coordination layer then checks the return report against GitHub before merge advice or reprioritization is given.

## 8. Parallel-work protocol

Parallel work is permitted only with explicit file and responsibility boundaries.

Before opening a PR, each implementation tool must:

1. fetch latest `origin/main`;
2. confirm the merge base;
3. verify that no parallel branch was included;
4. inspect changed files;
5. run the required validation suite;
6. open against `main` and stop before merge.

The second parallel PR to finish must refresh from newly merged `main` and rerun validation.

The coordination layer verifies PR base/head, changed-file scope, CI, metrics, regressions, and consistency with the active phase.

## 9. Required evidence from AI-authored PRs

Every implementation report must include:

- root-cause or current-state analysis;
- exact production behavior changed;
- files changed;
- explicit non-goals;
- tests added or updated;
- validation results;
- measurable before/after results where applicable;
- regressions and tradeoffs;
- confirmation that prohibited subsystems were not modified;
- PR number and CI state.

Every architecture-review or audit report should include:

- the review question;
- evidence examined;
- assumptions challenged;
- contradictions or risks found;
- confidence and uncertainty;
- recommended issues, gates, or follow-up work;
- a clear distinction between implemented facts and proposed changes.

Success means bounded scope, measured improvement, preserved safety, and passing validation—not code volume or model confidence.

## 10. Human authority

AI tools may inspect, reason, audit, implement bounded changes, test, prepare PRs, and coordinate handoffs.

They do not independently authorize merges, change the authority model, weaken evidence requirements, use evaluation truth as production input, claim production readiness, or change regulatory meaning.

Joseph Walker remains responsible for product direction, final review, merge decisions, and changes to this allocation. ChatGPT is the reasoning and coordination partner, not a replacement for human authority.

## 11. Review triggers

Revisit this allocation when:

- a tool repeatedly fails its assigned work;
- a lower setting no longer produces reliable results;
- a new mode materially changes capability or cost;
- parallel conflicts become frequent;
- rate-limit use becomes inefficient;
- Codex Extra High no longer justifies itself through measured results;
- the coordination layer fails to keep chat and GitHub aligned;
- the project moves from prototype development to operational deployment.

Updates must be based on observed repository outcomes rather than general model impressions.