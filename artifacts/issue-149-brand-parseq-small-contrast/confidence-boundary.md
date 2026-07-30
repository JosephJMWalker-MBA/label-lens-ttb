# Confidence and abstention boundary

Refs Issue #149. This document is frozen before inference.

## PARSeq has no natural abstention

Established in PR #213: PARSeq is a fixed-length autoregressive decoder with no
null class, and it emitted `10` on a blank white image. It returns a transcript
for whatever it is given.

## No threshold is derived here

No abstention or confidence threshold is derived from:

- the single synthetic blank from PR #213;
- this six-item benchmark;
- Tesseract's thresholds;
- the minimum score among correct outputs;
- the maximum score among wrong outputs;
- any post-result inspection.

Native sequence scores are preserved as **descriptive evidence only**. They are
not rescaled to 0–100, not mapped to `OBSERVED` / `LOW_CONFIDENCE` /
`NOT_OBSERVED`, and not compared directly with Tesseract confidence, whose scale
is not proven comparable.

## `scoreOrderingRisk`

For each PARSeq item this benchmark reports the sequence score, whether the output
was correct, and whether **any wrong output scored at least as high as any correct
output**. That last quantity is `scoreOrderingRisk`.

It is a **threshold-free calibration diagnostic**. It is not an authority
classifier, it does not imply a threshold exists, and a favourable value would not
license one.

## False reliable reads

The canonical Label Lens false-reliable-read measure for PARSeq in this benchmark
is:

`NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING`

**Zero false reliable reads is deliberately not reported.** Reporting zero merely
because PARSeq is not wired to the authority classifier would be a false comfort:
the measure is undefined here, not satisfied.

Operationally, PARSeq output in this experiment is evaluation evidence only and
cannot produce a reliable finding.

Reported separately instead: wrong-output count; unsupported-output adjudication
where visually clear; `scoreOrderingRisk`; and the blank-hallucination risk
inherited from PR #213.

## Standing block

A future production-facing phase remains **blocked** until abstention design and
confidence calibration are separately governed. No result in this benchmark can
lift that.
