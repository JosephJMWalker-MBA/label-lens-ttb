# Feedback 06 — Strengthening Human Evaluation and Operator-Work Measurement

- Status: Provisional review evidence
- Round: 6 of 6
- Source supplied by Joseph Walker on 2026-07-16
- Scope: Perception-layer blinding, causal language, and operator-friction acceptance criteria

> This file preserves the sixth review input. Final authority is established only by the reconciled `verdict.md` and `next-actions.md` produced after all six rounds.

## Executive summary

This round reinforces three findings repeated across the review:

1. Structural removal of contract metadata does not prove that human scorers remain perceptually blinded to model style.
2. Prefix-state marginal measurements must not be summarized as proof of counterfactual uselessness.
3. Extractor repairs must be judged partly by whether they reduce human work, not by machine accuracy alone.

## Finding 1 — Human blinding must be measured

The protocol specifies sixteen cases, two contracts, two repetitions, sixty-four scored items, and one primary reviewer. That design can support rubric calibration, but it creates a single-reviewer risk: repeated exposure may reveal contract-specific cadence, vocabulary, formatting, length, or abstention style even when explicit identifiers are removed.

Proposed safeguards include:

- a post-session style-guessability record;
- per-item timestamps and an unblinding-seal record;
- splitting sessions to reduce fatigue and pattern learning;
- at least two independent reviewers before a research contract advances;
- inter-rater agreement reporting;
- treating suspected perceptual unblinding as a limitation or invalidation condition rather than ignoring it.

The round also notes a possible observer effect: asking reviewers about stylistic guessability may itself focus attention on style. The final design should therefore distinguish between calibration experiments and advancement-grade experiments and choose the least biasing measurement that still exposes blind failure.

## Finding 2 — Report language exceeds prefix-marginal measurement

The `left-edge-strip-rotated-270` pass is again used as the example. It produced substantial new OCR and field-like evidence but changed no selected field at its fixed prefix. The round argues that this does not establish that the pipeline would behave equivalently if the pass were removed.

Recommended wording:

> Recovery passes that changed no selected field at their measured prefix in this corpus

Recommended methodology note:

> Contribution is measured as prefix-state marginal change at fixed pass order. It is not a leave-one-out or counterfactual-necessity result.

The report should separately present:

- evidence generated;
- candidates accepted;
- immediate selection changes;
- correct selection changes;
- execution cost;
- counterfactual ablation results, when available.

## Finding 3 — Operator friction belongs in extractor acceptance criteria

The primary product claim is not merely that the machine extracts more text. The system should help sellers or reviewers reach a usable, traceable result with less work.

Raw string accuracy can improve while operator burden worsens. Examples include fragmented boxes, confusing candidate ordering, repeated zooming and cross-reference, or multiple append-only corrections required to repair one technically improved result.

Candidate operational measures proposed by this round:

- time to first usable result;
- total case-handling time;
- number of human corrections or overrides;
- number of candidate selections per field;
- percentage of cases resolved without manual re-entry;
- cognitive or interaction steps required to verify a result;
- comparison with unaided manual review;
- no increase in false certainty or unsupported machine-cleared states.

Cloud fallback or other architectural expansion should remain deferred until the local workflow demonstrates saved human work sufficient to justify added latency, dependency, cost, and governance complexity.

## Cross-round significance

Round 6 independently reinforces:

- rounds 1, 3, 4, and 5 on causal-language discipline;
- rounds 2, 3, and 4 on perception-layer unblinding;
- rounds 4 and 5 on operational usefulness as a separate acceptance dimension.

## Provisional disposition

This round supports completing the six-round synthesis with immediate priority given to:

1. correcting overbroad diagnostic prose;
2. hardening and measuring the human-evaluation protocol;
3. incorporating operator-work measures into the next extractor repair cycle;
4. preserving architectural safety while refusing to treat it as proof of product readiness.
