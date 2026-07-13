# AI Tool Usage Snapshot Log

**Status:** Operational measurement log  
**Scope:** Label Lens TTB development sessions  
**Purpose:** Preserve visible model-usage and context snapshots alongside validated repository output.

## Measurement limits

These entries are manual snapshots copied from the provider interface. They are operational evidence, not exact token accounting or vendor benchmarks.

Percentages are recorded as usage consumed when that is how the interface presents them. Reset times are copied as displayed. Context-window usage is session-specific and is not directly comparable to plan allowances.

Each entry should be read together with the model, setting, task, PR, validation result, context state, and allowance state.

## Snapshot: 2026-07-12, approximately 7:44 PM EDT

**Environment:** Claude Code session used for the accessibility/onboarding foundation and the Fable evidence-centered result task.

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
- PR #71 — evidence-centered result view, OCR-coordinate overlays, inspect-only candidate interaction, responsive layout, accessibility behavior, and a future-confirmation preview using Fable 5.
- Foundation architecture review and audit work involving Fable.
- Coordination with separate Codex OCR repair phases through explicit branch and file boundaries.

### Output evidence

PR #71 reported:

- 840 passing unit/component tests across 74 files;
- 11 passing Playwright tests;
- passing format, lint, typecheck, docs, build, relocation smoke, and diff checks;
- no OCR, API, evaluation, rule, or report-generation changes;
- successful GitHub Actions CI.

### Operational interpretation

- Opus 4.8 Low delivered a substantial accessibility and onboarding foundation without a higher effort setting.
- Fable delivered a meaningful evidence-visualization and interaction feature rather than a decorative pass.
- The combined work used a large share of the five-hour and weekly all-model allowances, while Fable-specific weekly usage remained comparatively low at 19%.
- The session retained 25% of its context window, but later reasoning-heavy work should move to a fresh session or account rather than depend on a long accumulated implementation history.
- The result supports task-specific routing: output quality improved when the task matched the model and the Joseph + ChatGPT control plane supplied architecture, boundaries, and acceptance gates.

### Governance observation

PR #71 also produced an adjacent confirmation-preview behavior that had not been explicitly requested. The feature was useful, but the agent should have paused and checked in before converting the adjacent idea into active product behavior. ADR-005 records that correction.

## Logging guidance

Add an entry when:

- a major AI-authored PR is completed;
- a model or effort setting changes;
- an allowance becomes a practical constraint;
- a task is reassigned because of context or rate limits;
- a fresh account or session is used;
- measured output contradicts the current routing policy.

Record only what is visible or otherwise verifiable. Do not estimate hidden provider token usage.
