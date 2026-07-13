# OCR Reliability Strategy

## Purpose

OCR is treated as an unreliable evidence source, not as truth.

The system must never approve a label merely because one OCR engine returned plausible text. Reliability comes from image-quality controls, multiple recognition paths, field-specific parsing, confidence calibration, deterministic rules, and human review when evidence is weak or conflicting.

## Core Principle

> OCR proposes observations. The verification system decides whether the evidence is sufficient.

The pipeline must preserve what the OCR engine observed, preserve how Label Lens ranked competing candidates, and keep evaluation truth out of production selection.

## Signal semantics

| Signal | Origin | Meaning | Valid use | Invalid interpretation |
| --- | --- | --- | --- | --- |
| Raw OCR confidence | OCR engine | Engine-specific observation confidence | Diagnostics and future calibration features | End-to-end correctness probability |
| Deterministic ranking | Label Lens rules | Candidate ordering mechanism | Selection and explanation | Probability the candidate is correct |
| Evaluation correctness | Ground-truth fixtures | Whether output matches expected value | Offline evaluation and future calibration labels | Production input |
| Future calibrated probability | Not implemented | Empirically estimated correctness likelihood | Future authorized phase only | Current Phase 5B output |

## Phase 5B contract

Phase 5B separates OCR-engine confidence from deterministic ranking semantics without changing production candidate generation, filtering, ranking order, selection, confidence behavior, or API workflow.

The implementation preserves three distinct concepts:

1. Raw OCR confidence.
   This is OCR-engine output. It may be missing, it may use engine-specific scales, and it must never be described as the probability that the selected field is correct.
2. OCR evidence score.
   This is the current repository's normalized aggregation of OCR confidence across the tokens that support a candidate. It is still OCR-derived evidence, not a correctness probability.
3. Deterministic ranking.
   This is Label Lens selection logic. It explains why one candidate outranked another. It is not an OCR observation and not a probability model.

## Raw OCR confidence

Raw OCR confidence is preserved with provenance:

- OCR engine identity remains in analyzer provenance.
- Candidate provenance records which pass, region, triggers, and preprocessing steps produced the observation.
- Recovery-pass support remains attached to the selected field and candidate diagnostics.

Raw OCR confidence limitations:

- Values may not be comparable across OCR engines.
- Values may not be comparable across future engine upgrades or alternate OCR sources unless explicitly revalidated.
- Missing raw OCR confidence must remain explicit rather than silently becoming zero.
- Any normalized OCR-derived score must remain labeled as OCR evidence, not correctness.

## Deterministic ranking

Label Lens currently uses deterministic candidate ordering, not calibration.

- Alcohol selection is comparator-based and OCR-evidence-first.
- Brand selection is mixed: candidates must first satisfy score eligibility, then are ordered by a deterministic ranking that includes score, prominence, OCR evidence, and stable tie-breaks.
- Structured ranking explanations are emitted from the same decision path that performs ordering so the explanation cannot drift into a second ranking implementation.

Ranking explanation data may include:

- strategy identifier;
- ordering mode;
- comparator entries in evaluation order;
- ranking score where the mechanism is additive;
- score factors where the mechanism is additive.

These signals explain why a candidate outranked another candidate. They do not estimate correctness likelihood.

## Evaluation boundary

Ground-truth fixture labels remain evaluation-only.

- Evaluation may compare selected or alternate candidates to acceptable truth.
- Evaluation may record calibration-ready candidate features and correctness labels.
- Production extractor, parser, ranking, and selection code must not import or consult evaluation truth.

## Calibration status

Phase 5B does not implement empirical calibration.

- No correctness probability is emitted in production.
- No threshold tuning is authorized from the new measurements.
- No new telemetry, analytics pipeline, or retention behavior is introduced.

Calibration would require, at minimum:

- representative corpus evidence;
- stable feature definitions;
- explicit train/eval separation;
- reviewed probability semantics;
- authorized product behavior changes.
