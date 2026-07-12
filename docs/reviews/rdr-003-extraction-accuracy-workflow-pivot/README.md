# Rubber Duck Review 003 — Extraction Accuracy and Workflow Pivot

- Status: In review
- Date: 2026-07-12
- Scope: Full-corpus extraction evidence, reviewer workload, and applicant-assisted verification workflow

## Purpose

This review records the checkpoint reached after the full wine-corpus evaluation exposed a severe gap between architectural quality and practical extraction usefulness.

The central finding is that the original workflow asks OCR to solve a broader semantic problem than the product requires. A seller or applicant already knows what information should appear on the label. The primary workflow should therefore use declared application facts as bounded search targets, while preserving machine observations, applicant assertions, and reviewer classifications as separate records.

## Governing principle

> The applicant declares what should appear. The machine locates and compares evidence. The applicant resolves correctable differences. The reviewer classifies genuine ambiguity. Human authority remains final.

## Contents

- [`source-brief.md`](source-brief.md) — current evidence, risks, and review questions.
- [`verdict.md`](verdict.md) — review conclusion and product-direction decision.
- [`next-actions.md`](next-actions.md) — bounded implementation sequence.
- [`deep-dive-transcript.md`](deep-dive-transcript.md) — architectural success versus extraction failure discussion.
- [`extraction-failure-critique.md`](extraction-failure-critique.md) — critique of urgency, workflow metrics, and governance debt.
- [`secure-architecture-debate.md`](secure-architecture-debate.md) — debate on whether containment quality justifies continued development.

## Authority treatment

The source brief, verdict, and next-actions files are the authoritative review record. The three transcript files are supplemental synthesis artifacts. Where wording conflicts, the authoritative review record controls.
