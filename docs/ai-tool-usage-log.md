# AI Tool Usage Snapshot Log

**Status:** Operational measurement log  
**Scope:** Label Lens TTB development sessions  
**Purpose:** Preserve visible model-usage and context snapshots alongside validated repository output.

## Measurement limits

These are manual snapshots copied from the provider interface. They are operational evidence, not exact token accounting or vendor benchmarks.

The percentages below are recorded as **usage consumed**, matching the visible progress bars. Reset times are copied as displayed. Context-window usage is session-specific and is not directly comparable to plan allowances.

Each entry should be read together with the model, setting, task, PR, validation result, context state, and allowance state.

## Snapshot: 2026-07-12, approximately 7:44 PM EDT

**Environment:** Claude Code session used for the foundation UI work and the Fable evidence-centered result task.

| Measure | UI-reported state |
| --- | ---: |
| Context window | `754.3k / 1.0M` used (`75%`) |
| Five-hour allowance | `76%` used |
| Weekly all-model allowance | `73%` used |
| Weekly Fable allowance | `19%` used |
| Five-hour reset | approximately `2 hr 35 min` |
| Weekly reset | Tuesday at `3:00 PM` |

### Work associated with this usage

- PR #68 — accessibility, onboarding, appearance, and processing-state foundation using Opus 4.8 Low.
- PR #71 — evidence-centered result view, OCR-coordinate overlays, inspect-only candidate interaction, responsive layout, accessibility behavior, and an honest future-confirmation preview using Fable.
- Foundation architecture review and audit work involving Fable.
- Coordination with the separate Codex OCR repair phases through explicit branch and file boundaries.

### Output evidence

PR #71 reported:

- 840 passing unit/component tests across 74 files;
- 11 passing Playwright tests;
- passing format, lint, typecheck, docs, build, relocation smoke, and diff checks;
- no OCR, API, evaluation, rule, or report-generation changes;
- successful GitHub Actions CI.

### Operational interpretation

- Opus 4.8 Low delivered a substantial accessibility and onboarding foundation without requiring a higher effort setting.
- Fable delivered a meaningful evidence-visualization and interaction feature rather than a decorative pass.
- The combined work used a large share of the five-hour and weekly all-model allowances, while Fable-specific usage remained comparatively low at 19%.
- The session retained 25% of its context window, but future reasoning-heavy work should move to a fresh session or account rather than depend on a long accumulated implementation history.
- The result supports task-specific routing: high-quality output came from matching the task to the model, while the Joseph + ChatGPT control plane supplied the architecture, boundaries, and acceptance gates.

## Logging guidance

Add an entry when:

- a major AI-authored PR is completed;
- a model or effort setting changes;
- an allowance becomes a practical constraint;
- a task is reassigned because of context or rate limits;
- a fresh account or session is used;
- measured output contradicts the current routing policy.

Record only what is visible or otherwise verifiable. Do not estimate hidden provider token usage.