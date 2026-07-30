# Limitations — PP-OCRv6-small ONNX compatibility probe

Evaluation-only. No production behaviour change, no production source or
dependency change, no fixture or truth change, no governed Brand crop accessed.
PR #195 untouched.

## Verdict: `COMPATIBLE`

All eleven frozen gates passed. Four invocations, finite logits, both repeat pairs
identical down to the raw logit bytes, ONNX Runtime with no pickle, dictionary
audit complete, peak RSS 157 MB against a 700 MB limit, worst latency 29 ms
against a 60 s limit.

## What the sentinel result does and does not show

The positive sentinel decoded to **exactly `BRAND NAME 123`**, space included, at
a CTC sequence confidence of 0.9996.

That is a clean compatibility demonstration and it is the first time in this
Issue #149 sequence that a synthetic sentinel came back exactly right. It is
**not** evidence about Brand recognition. The input is 48 pt DejaVu Sans, black on
white, rendered by the same container that ran the model — about as far from a
stylized wine label as a text image can be. §13.1 says so explicitly: this probe
does not test Brand recognition capability.

Read plainly: a recognizer that could not read this image would be disqualified.
Reading it correctly clears a floor; it says nothing about the ceiling.

## The space finding contradicts the plan's expectation

The plan expected `asciiSpaceInVocab: false` and flagged
`spaceAbsentFromDictionary: true` as the likely outcome. Both halves of that are
now settled, and they point opposite ways:

- ASCII space **is absent** from `inference.yml`'s `PostProcess.character_dict`.
  The plan is right about that; the first entry is `!` (0x21).
- ASCII space **is decodable** anyway, at token id 18,709, and the model actually
  emitted it twice in the sentinel.

The arithmetic is the whole argument: 18,708 dictionary entries plus one CTC blank
is 18,709, but the model's output width is 18,710. PaddleOCR's own decoder
appends exactly one trailing space when `use_space_char` is set, which accounts
for the missing class. Discovery recorded that reconciliation before any inference
ran, fail-closed against any other width, and the run then confirmed it
independently by decoding token 18,709 in both space positions.

**Consequence for the later benchmark:** the original motivation for choosing this
candidate — space support that PARSeq structurally lacks — survives, but it
survives for a different reason than the plan gave. The benchmark must not be
designed on the assumption that this model cannot emit spaces.

## Two definitional discrepancies, recorded rather than smoothed over

**The confidence formula.** §6.1 defines the sequence score as the mean over
non-blank *time steps*. The pinned upstream implementation averages over the
*selected* positions instead — duplicates removed as well as blanks. Both are
computed here: `nativeCtcSequenceScore` 0.99959 under the frozen definition,
`upstreamCollapsedMeanScore` 0.99970 under upstream's. On this input the gap is
negligible; on a repetitive transcript it would not be. The frozen definition is
what the field carries.

**The `asciiSpacePresent` field.** §11 documents it both as "appears as a
decodable token" and as "determined by inspecting `PostProcess.character_dict`".
Those diverge for this artifact, so both readings are reported under distinct
names rather than one being quietly chosen.

## The model output was already normalized

Row sums are 1.0 to within 4e-7, so the exported graph emits per-timestep
probabilities, not raw logits. This was measured, not assumed, and it matches
PaddleOCR's decoder taking `argmax` and `max` without a softmax. The
probabilities therefore come from the model output as emitted; re-applying softmax
would have distorted them while leaving the argmax untouched — a silent error that
would have shown up nowhere in the transcript.

The `.npy` files are still named `logits.npy`, per §13.6, and hold the model
output verbatim and unrounded.

## Confidence is not comparable to anything else here

`nativeCtcSequenceScore` is native and unrescaled. It must not be compared
numerically to PARSeq's `nativeSequenceScore` (a product over positions, 95-class
softmax) or to Tesseract `rawConfidence` (0–100). With an 18,710-class softmax,
individual token probabilities are lower in expectation than with 95 classes —
that they came back at 1.0 here reflects how easy this input is, not calibration.

`confidenceInterpretationKnown` is **false**. No threshold may be derived from
this probe, and none was.

## No abstention exists

The blank image produced an empty transcript, which is the nominal CTC outcome and
the desirable one — but it is **structural**, not abstention. Every frame decoded
to blank. There is no null class, no confidence gate, and no governed Label Lens
abstention anywhere in this path. An empty transcript and a confident wrong
transcript are produced by the same mechanism with no internal signal separating
them.

For contrast, PARSeq returned `"10"` on its blank image. That PP-OCRv6 returned
`""` is a better outcome on one input, not a demonstrated property.

## Determinism is proven on one host, once

Both repeat pairs matched exactly, including `.npy` bytes. That was measured on a
single GitHub-hosted `ubuntu-latest` amd64 runner, in one image build, with
single-threaded sequential execution. It is not a cross-host, cross-build or
cross-architecture determinism claim.

## Resource figures are diagnostic

157 MB peak RSS and ~29 ms per invocation, on 2 CPUs with a 4 GB container limit.
Peak RSS is `ru_maxrss` for the whole process and therefore **cumulative across
all four invocations**, not a per-invocation figure. Latency excludes the 75 ms
model load, which happens once. None of this says anything about Render.

## Evaluation fields are deliberately null

`normalized-evidence.json` sets `evaluation` to `null`. There is no governed truth
in scope, so the corpus-oriented `failureClass` vocabulary is not applied and no
`falseCertainty` is computed. Reporting a `CORRECT` failure class against a
sentinel string the probe itself specified would dress an input specification up
as truth. The sentinel comparison lives in `output-risk-report.json` instead.

## What remains unestablished

Better Brand recognition, better stylized-text recognition, lower CER, fewer false
reliable reads, production suitability, acceptable Render latency, production
licensing clearance, or authorization to alter production. Training-data
provenance is unresolved and `trainingDataProductionReviewRequired` stays `true`.

## What `COMPATIBLE` authorizes

Exactly one thing: a **separately preregistered** frozen-crop Brand benchmark
against Tesseract.js on the six OCR items, four crop clusters and three Brand
designs of PR #214. That benchmark is not authorized by this PR and its KEEP gate
— at least one crop-cluster improvement, at least one design improvement, no
design regression — is the same no-regression gate that produced PR #214's
`REGRESSION` verdict. Nothing here weakens it.
