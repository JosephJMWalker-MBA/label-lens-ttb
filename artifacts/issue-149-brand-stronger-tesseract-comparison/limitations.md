# Limitations — stronger Tesseract comparison (blocked)

Evaluation-only. No production code, fixture, fixture truth, parser, ranking,
threshold, crop, PSM, scale, or preprocessing change. No Alcohol or Government
Warning change. PR #195 untouched.

## The experiment did not run

This is the central limitation and it governs everything else. The preregistered
compatibility gate failed closed before either arm produced data. There are no
per-case results, no cluster results, no determinism result, and no answer to the
question the package was written to ask.

The result artifacts are **absent rather than empty**. Nothing here reports a
measurement that was not taken.

## An unrun experiment is not a null result

The locked tesseract.js runtime could not execute the stronger model. That is a
runtime incompatibility, not evidence about what Tesseract can or cannot read.

It would be a serious error to fold this into the capability-ceiling argument as
a "deterministic failure under the stronger configuration". That prerequisite
remains **unsatisfied**, exactly as it was before this work. No prerequisite was
newly satisfied.

## What the treatment choice does and does not represent

The control model is the integer-quantized English LSTM that tesseract.js pairs
with its LSTM-only cores. The treatment was the official `tessdata_best` float
model — same architecture, same version string, same character set, same recoder,
same three dictionaries, differing only in the recognizer weights.

That is a clean single-variable design, but it is a **narrower** contrast than
"fast versus best": both models share the same training lineage, and the
difference is weight precision rather than a different or larger network. Even
had it run, a null would have been weaker evidence than the phrase "stronger
traineddata" suggests, and a positive would have been correspondingly notable.

## The follow-up path costs a second variable

Executing a float model requires a float-capable core. Under the locked
dependency that means moving off the LSTM-only core family, which changes the
WASM core build as well as the model. Any follow-up therefore compares two
dimensions at once unless it is decomposed into more arms or explicitly redefines
the treatment as the pair. That is a design decision for a new preregistration,
not something to settle by improvisation.

Whether tesseract.js 7.0.0 can pair a float model with a full core in Node at all
was **not** established. The bounded probe hung rather than answering, and it was
terminated rather than left to run indefinitely. Treat that row of the
compatibility matrix as unknown, not as a negative.

## The diagnosis rests on one machine

SIMD detection, core selection, and the abort were all observed on one host
(darwin/arm64, Node 22.17.0, relaxed SIMD available). The integer-only nature of
the LSTM-only cores is a property of the shipped builds and is corroborated by
tesseract.js's own default of `4.0.0_best_int` data for that mode, but the
specific failure mode was reproduced in one environment only.

## The model was inspected but is not retained

A 15.4 MB Apache-2.0 model file was retrieved under explicit authorization and
inspected — its component structure is analysed in `traineddata-provenance.json`
and it is what the compatibility probes were run against. **No experiment
consumed it**, so it is deliberately **not vendored in Git**.

What remains is the pinned upstream commit and URL, the expected byte size and
full sha256, the license text, and a deterministic retrieval script that
reproduces the identical bytes on demand into an untracked research-local cache.

The tradeoff is explicit: reproducing the retrieval requires network access to
GitHub, so this package is no longer self-contained offline. That was preferred
over carrying a large binary in history for an experiment that produced no
result. If upstream ever removes or rewrites that commit, the bytes become
unobtainable from this pointer — the recorded sha256 would then detect the loss
rather than paper over it, which is the intended failure mode.

## The independence structure was frozen but never exercised

Crop clusters (4) and design clusters (3) were frozen and verified against PR
#207 provenance before the gate failed. The counting rules — duplicate crop once,
shared design once — were implemented and are correct, but no data ever flowed
through them. They carry forward to a follow-up unchanged and untested against
real results.

## Standing boundaries, unchanged

- Historical case count 5; independent crop-image denominator 4; independent
  design denominator 3.
- No prevalence, causal, or capability-ceiling claim.
- The blinded stylization labels this rests on remain single-reader and
  provisional.
- Nothing authorizes replacing Tesseract, changing the production model or core,
  or production enablement.
