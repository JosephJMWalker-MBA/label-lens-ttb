# AI Tool Usage Snapshot Log

**Status:** Operational measurement log  
**Scope:** Label Lens TTB development sessions  
**Purpose:** Preserve observed model-usage and context snapshots alongside the work produced, so tool-selection decisions can be evaluated against actual validated output rather than impressions.

## Measurement limits

These entries are manual snapshots from the model provider's user interface. They are useful operational evidence, but they are not precise token-accounting records and should not be interpreted as vendor benchmarks.

Percentages may represent allowance remaining rather than allowance consumed, according to the interface label. Reset times are copied as displayed. Context-window values are session-specific and are not directly comparable to weekly plan allowances.

Each snapshot should therefore be read together with:

- model and setting;
- task performed;
- resulting branch or pull request;
- validation and CI result;
- context and allowance state at the time captured.

## Snapshot: 2026-07-12, approximately 7:44 PM EDT

**Environment:** Claude Code session used for foundation UI work and the Fable evidence-centered result task.

| Measure | UI-reported state |
| --- | ---: |
| Context window | `754.3k / 1.0M` used (`75%`) |
| Five-hour plan allowance | `76%` remaining |
| Weekly all-model allowance | `73%` remaining |
| Weekly Fable allowance | `19%` remaining |
| Five-hour reset | approximately `2 hr 35 min` |
| Weekly reset | Tuesday at `3:00 PM` |

### Work associated with this usage

The session had already produced or supported:

- PR #68 — accessibility, onboarding, appearance, and processing-state foundation using Opus 4.8 Low;
- PR #71 — evidence-centered result view, OCR-coordinate overlays, inspect-only candidate interaction, responsive layout, accessibility behavior, and an honest future-confirmation preview using Fable;
- foundation architecture review and audit work involving Fable;
- coordination with the separate Codex OCR repair phases through explicit branch and file boundaries.

### Output evidence

PR #71 reported:

- 840 passing unit/component tests across 74 files;
- 11 passing Playwright tests;
- passing format, lint, typecheck, docs, build, relocation smoke, and diff checks;
- no OCR, API, evaluation, rule, or report-generation changes;
- successful GitHub Actions CI.

### Operational interpretation

The snapshot supports the current routing strategy:

- Opus 4.8 Low delivered a substantial accessibility and onboarding foundation without requiring a higher effort setting;
- Fable delivered a meaningful, technically bounded evidence-visualization feature rather than a decorative pass;
- the combined Claude session still retained most of the five-hour and weekly all-model allowance after both pieces of validated work;
- Fable-specific weekly allowance was more heavily used, which should be considered before assigning another large Fable task in the same reset period;
- the session still had sufficient context for a bounded task, but future reasoning-heavy work should move to a fresh session or account rather than relying on a heavily accumulated implementation history.

## Logging guidance

Add another entry when one of the following occurs:

- a major AI-authored PR is completed;
- a model or effort setting changes;
- an allowance becomes a practical constraint;
- a task is reassigned because of context or rate limits;
- a fresh account or session is used to continue the project;
- measured output contradicts the current routing policy.

Future entries should record only what is visible or otherwise verifiable. Do not estimate hidden provider token usage.