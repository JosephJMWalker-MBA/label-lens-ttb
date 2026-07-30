# Limitations — PP-OCRv6-small ONNX versus frozen incumbent Tesseract

Frozen before inference. These limits are stated in advance so that no result can
be presented as broader than the design allows.

## Sample size, and it is smaller than it looks

Five historical cases, six OCR items, **five** distinct item-level pixel sets,
**four** case-level crop clusters, **three** Brand designs.

Two of the six items — `approved-wine-004` and `la-fattoria-rotated` — are
byte-identical pixels. Three of the five cases share one Brand design. The
effective diversity is **three designs**, and cluster decisions use the four
case-level crop clusters. This cannot establish population accuracy, production
prevalence, or a capability ceiling.

## Not a single-variable causal experiment

The arms differ in architecture, runtime and intrinsic transform simultaneously.
Arm A is a WASM Tesseract LSTM reading the crop at native size; Arm B is an ONNX
CTC recognizer that resizes to 48×320 in BGR because the model requires it. Any
difference is attributable to *the stack*, never to one factor.

## Arm A is carried forward, which cuts both ways

**In favour:** Arm A cannot drift with the repository, and re-running Tesseract
could not change its numbers without invalidating the comparison with PR #214.

**Against:** Arm A's latency and memory were measured on a different runner on a
different day, in-process, while Arm B will run in a container. **The two arms'
timing and memory figures are not comparable and no runtime performance
comparison may be drawn from them.** Only Arm B's internal primary-versus-repeat
timing is self-consistent, and even that is diagnostic.

Arm A's metric values will be **recomputed** from its carried raw outputs by the
same code path that scores Arm B, rather than copied from PR #214's published
table. If a recomputed value disagrees with PR #214's published value, the
discrepancy is reported openly and neither number is silently preferred.

## The primary metric is deliberately the weaker one for Arm B

Whitespace-free comparison is primary to preserve comparability with PR #214,
whose Arm B could not emit a space at all. PP-OCRv6 **can** emit spaces, so the
whitespace-free representation discards a capability this candidate actually has.
The boundary-preserving comparison is reported in full as the secondary metric for
exactly that reason. A reader who wants to know whether PP-OCRv6 recovers word
boundaries must read the secondary table; the primary table cannot show it.

## Confidence tells you nothing here

Two score definitions are recorded because PR #215 found the plan's definition and
upstream's implementation differ. Neither is calibrated, neither is comparable to
Tesseract's 0–100 word confidence, and no threshold may be derived. A PP-OCRv6
softmax over 18,710 classes and a Tesseract word confidence are not the same kind
of quantity.

`confidenceInterpretationKnown: false`. The false-reliable-read measure is
`NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING` — **not zero**.

## No selector, no authority, no geometry

This experiment does not run the Label Lens Brand selector, does not produce
`OcrWord` objects, does not fabricate bounding boxes for Arm B, and does not
compute authority states. PP-OCRv6 is a sequence recognizer here and nothing more.
PR #211 had to synthesise an identity geometry mapping to reach the selector; this
experiment declines to do that at all rather than produce selector output that is
not what production would compute.

## The visual-support review is unblinded and single-reviewer

By construction it happens after truth is revealed. One reviewer, six items, no
second adjudication, no inter-rater agreement. `UNADJUDICATED` is a first-class
outcome and will be used rather than guessing.

## PR #215's sentinel does not transfer

PP-OCRv6 read `BRAND NAME 123` exactly, at 0.9996 confidence, from 48 pt DejaVu
Sans on white. That was a floor-clearing compatibility check on synthetic type. It
is **not** evidence about stylized wine-label marks, and a good result here would
not retrospectively make it so.

## What no outcome authorizes

Production integration, shadow deployment, authority-state changes, engine
replacement, production Python or ONNX Runtime dependencies, an abstention
threshold, broader corpus access, a production-suitability claim, or training-data
clearance. `trainingDataProductionReviewRequired` remains `true`.

A `KEEP_FOR_EXPANDED_BENCHMARK` authorizes only a separately planned expanded
held-out benchmark and confidence-calibration research.

## What this experiment cannot do even if PP-OCRv6 wins outright

It cannot select an engine, because engine selection needs a held-out corpus,
calibrated abstention, latency measured on the production platform, and resolved
training-data provenance. None of those is in scope, and three of them are
explicitly blocked.
