# Confidence and abstention boundary

Refs Issue #149. Frozen before inference.

## PP-OCRv6 has no governed abstention

CTC has no null class. An empty transcript means every frame decoded to blank —
a structural outcome, not a calibrated decision. PR #215 observed an empty
transcript on a blank white image, which is the desirable behaviour on that one
input and is **not** evidence of an abstention mechanism. An empty transcript and
a confident wrong transcript come out of the same mechanism with no internal
signal separating them.

## Two score definitions, both recorded, neither chosen after results

PR #215 found that the plan's confidence definition and PaddleOCR's own
implementation are not the same function. Both are recorded here under distinct
names, and **the choice between them is frozen now, before any result exists**:

**`planDefinedNonBlankTimestepMean`** — the mean, over all time steps whose argmax
is not the blank token, of the probability of that argmax token.

**`upstreamCollapsedSequenceMean`** — the mean over the *selected* positions, that
is after consecutive-duplicate removal *and* blank removal, as
`BaseRecLabelDecode.decode` implements it. Zero when nothing is selected.

The two differ whenever adjacent frames repeat a character. Neither is designated
the "real" score, neither may be swapped in after results are seen, and no
composite of the two may be invented later.

## No threshold is derived here

No abstention or confidence threshold is derived from:

- PR #215's single synthetic sentinel or its single blank image;
- this six-item benchmark;
- Tesseract's thresholds;
- the minimum score among correct outputs;
- the maximum score among wrong outputs;
- any post-result inspection.

Both scores are **descriptive evidence only**. They are not rescaled, not mapped
to `OBSERVED` / `LOW_CONFIDENCE` / `NOT_OBSERVED`, and **not compared numerically
with Tesseract confidence**, whose scale is not proven comparable. The gap is
worse than unproven here: PP-OCRv6 softmaxes over 18,710 classes while Tesseract
reports a 0–100 word confidence, so the two numbers are not even on the same kind
of scale.

`confidenceInterpretationKnown: false`.

## `scoreOrderingRisk`

For each item this benchmark reports the two scores, whether the output was
correct, and whether **any wrong output scored at least as high as any correct
output**. That last quantity is `scoreOrderingRisk`, computed separately for each
of the two score definitions.

It is a **threshold-free calibration diagnostic**. It is not an authority
classifier, it does not imply that a usable threshold exists, and a favourable
value would not license one.

## False reliable reads

The canonical Label Lens false-reliable-read measure for PP-OCRv6 in this
benchmark is:

`NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING`

**Zero false reliable reads is deliberately not reported.** Reporting zero merely
because PP-OCRv6 is not wired to the authority classifier would be false comfort:
the measure is undefined here, not satisfied.

Operationally, PP-OCRv6 output in this experiment is evaluation evidence only and
cannot produce a reliable finding.

Reported separately instead:

- **wrong-output count** — items whose primary-representation output is not an
  exact match;
- **output support adjudication** — per `visual-support-protocol.md`;
- **score-ordering risk** — for both score definitions;
- **empty-output behaviour** — how often either arm returned nothing, and on
  which items;
- `confidenceInterpretationKnown: false`.

## Standing block

A production-facing phase remains **blocked** until abstention design and
confidence calibration are separately governed. No result in this benchmark can
lift that, and a `KEEP_FOR_EXPANDED_BENCHMARK` verdict explicitly does not.
