# Limitations — PARSeq-small compatibility and sequence-evidence probe

Evaluation-only. No governed Brand crop, fixture, or fixture truth accessed. No
production source, production Dockerfile, Render or Next.js configuration, or
application dependency modified. No Python installed into production. PR #195
untouched.

## The verdict is narrow

`COMPATIBLE` means the stack loads and runs reproducibly and its output is
auditable. It is a statement about **execution**, on **two synthetic images**. It
says nothing about Brand recognition, accuracy versus Tesseract, false reliable
reads, production suitability, or latency under real load.

## Two output-risk findings that matter more than the verdict

**The model cannot represent a space.** Every character of `LABEL LENS 123` was
recognised correctly and in order, yet the transcript is `LABELLENS123`. The
94-character charset is 62 case-sensitive alphanumeric plus 32 punctuation marks
and contains **no space**. PARSeq structurally cannot emit a word boundary.

For Brand text this is material, not cosmetic: `La Fattoria` can at best return
`lafattoria`. Any future Brand benchmark has to decide, in advance, how to score a
boundary the model is incapable of producing — and must not quietly credit or
penalise the model for it.

**The model cannot abstain.** The blank white image produced `10`. PARSeq is a
fixed-length autoregressive decoder with no null class; it returns a transcript for
whatever it is handed. Its per-character probabilities there were 0.313 and 0.197
against >0.96 on every real character, and the sequence score was 0.021 against
0.256 — suggestive, but **not a calibrated threshold** and not evidence that a
threshold would work. Any abstention behaviour would have to be imposed outside the
model, and designing that is not in scope here.

## Confidence is not interpretable yet

Native probabilities are preserved in 0–1, never rescaled, and never compared to
Label Lens authority thresholds. They ordered sensibly across exactly two images.
That is not calibration. `confidenceInterpretationKnown` is **false**, and no
compliance decision may lean on these numbers.

## Determinism was proven, on one host

Primary and repeat matched exactly on transcript, token IDs, EOS index,
per-character probabilities, **raw logits bytes**, and output fingerprint, for both
images. The rule was not relaxed after results existed.

This establishes run-to-run determinism on this runner, this image, this torch
build and CPU. It does not establish determinism across hosts, CPU
microarchitectures, or torch versions.

## The transform is model-native, not a no-op

The model does not receive unchanged pixels. It receives the approved source image
followed by its required frozen transform: RGB, **intrinsic bicubic resize to
32x128**, tensor conversion, normalization at mean/std 0.5. A 640x96 sentinel is
squeezed into 128x32. For real Brand crops that resize is aggressive and will
matter; it is a property of the model, not a choice this probe made, and it is not
something a future benchmark can opt out of.

## Discovery was re-run once, before any inference

The first execute attempt failed at import time: `strhub.data.module` transitively
imports `lmdb`, absent from upstream's core lock. The pin was taken from upstream's
own `requirements/test.txt`, discovery was re-run, and the preregistration was
re-cut and re-hashed.

No inference had run and no result existed at that point, so nothing was
re-rolled. Recorded because a re-cut freeze should always be visible rather than
inferred from a hash that quietly changed. Synthetic input hashes were
byte-identical across both container builds.

## Licensing is settled for this artifact only

The Apache-2.0 grant established here covers
`baudm/parseq-small@a1526c3d…/pytorch_model.bin`. It is **not** extended to the
GitHub Release file, and PR #212's conclusion about that file stands.

The SHA-256 prefix and byte size coincide with the GitHub artifact. That is
recorded as supportive provenance only; **no byte-identity claim is made**, and
nothing here depends on one.

## Training-data provenance is unresolved

`trainingDataProductionReviewRequired = true`. The model was trained on real STR
datasets, some of which may carry restrictions relevant to commercial deployment.
This probe did not resolve that and no production promotion may rely on this PR.
An artifact licence is not a dataset clearance.

## Two synthetic images is not an evaluation

One positive sentinel and one blank. That is enough to test whether the runtime
executes and whether output is auditable, which is all it was for. It is not a
sample from which any recognition property can be inferred.

## Nothing is authorized

Not extractor changes, not Python in production, not fabricated geometry, not
replacing Tesseract. The frozen Brand benchmark becomes eligible, but only as a
separately preregistered experiment that designs for the no-space charset and the
absence of abstention up front.
