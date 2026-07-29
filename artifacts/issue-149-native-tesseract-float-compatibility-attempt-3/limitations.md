# Limitations — Attempt 3, native Tesseract + tessdata_best compatibility

Synthetic compatibility experiment only. No corpus access, no fixture or truth
change, no production change, no native Tesseract installed into the production
application or production Dockerfile. PR #195 untouched.

Attempts 1 and 2 are preserved unchanged. Nothing here edits or reinterprets
them.

## Verdict: `INCONCLUSIVE_OUTPUT`

One of the two preregistered harness corrections worked completely. The other did
not, and it blocked the result again.

## Correction 1 succeeded

Staging the pinned runtime's own `configs/tsv`
(`/usr/share/tesseract-ocr/5/tessdata/configs/tsv`, owned by
`libtesseract5:amd64`, 22 bytes, sha256 `59d079bb…`, contents
`tessedit_create_tsv 1`) into both ephemeral mounts fixed the Attempt 2 defect
outright:

- all eight invocations produced **valid TSV** against the exact schema;
- **no plain-text fallback** anywhere, and no `Can't open tsv` in any stderr;
- both staged copies were byte-identical, so the only difference between arms
  remained the `eng.traineddata` bytes;
- all four blank outputs were correctly empty;
- all four primary/repeat pairs were **raw-byte identical**.

## Correction 2 failed, and failed differently than expected

The positive sentinel normalized to `LHEEL LENS 124`, not `LABEL LENS 123`. Three
characters are wrong: `A`→`H`, `B`→`E`, and the new `3`→`4`.

Two things about that are worth stating plainly.

**The new digit did not fix the digit problem.** `3` was built as a standard
seven-segment form and still misread, this time as `4`.

**The letters regressed.** In Attempt 2 every letter was read correctly
(`LABEL LENS 14H`); here `A` and `B` broke. Those glyphs are byte-identical
between the two attempts — only the trailing digits changed. The most plausible
explanation is that Tesseract's LSTM recognizes a line as a sequence, so changing
the trailing token changed the decoding of earlier characters. That means my
per-glyph reasoning about ambiguity was the wrong model of the problem all along:
I was tuning individual shapes while the recognizer was scoring whole sequences.

## The real lesson: hand-built rectangle glyphs are the wrong tool

Two attempts have now been blocked by a synthetic font I drew from rectangles,
while everything the experiment actually set out to test behaved perfectly. The
approach optimizes for byte-level determinism and pays for it with a typeface no
recognizer was trained on.

A future attempt should render the sentinel from a **real vendored font** — a
hashed TTF at a fixed point size, with the font file's sha256 frozen the same way
the models are. That keeps determinism (same font bytes, same rasterizer version,
same PNG) while producing glyph shapes Tesseract has actually seen. Recording
this here rather than acting on it: changing the input generator now would be a
new attempt, not this one.

## No retry was performed

The preregistration allows no third run, no retry with altered settings, no
additional synthetic image, and no alternative config. None was attempted. The
frozen images were not touched after results existed, and the normalization rule
was not relaxed to let `LHEEL LENS 124` pass — relaxing it afterwards is exactly
the move the rule exists to forbid.

## What this attempt does and does not add

**Adds:** the float model produces **valid, deterministic, schema-conformant TSV**
with correct bounding boxes and confidences under the pinned native runtime, on
both a text image and a blank one. Attempt 2 could not show this because the TSV
renderer never engaged.

**Does not add:** an exact-transcript demonstration, and therefore not
`COMPATIBLE`.

**Does not subtract:** Attempt 2's finding stands — native Tesseract 5.3.0 loads
and executes both models. Attempt 3 strengthens it. Both arms produced
*character-identical* output on every invocation, so the float model and the
integer control agree exactly on this input.

## Still not established

Better Brand recognition, better stylized-text recognition, lower CER, fewer
false reliable reads, production suitability, acceptable Render latency,
authorization to alter production, or authorization to replace Tesseract.js.
None of these is touched by any outcome here.

## Performance figures are diagnostic

Latency 239–284 ms and peak RSS ~38 MB (control) against ~61 MB (treatment),
measured on a native linux/amd64 GitHub-hosted runner. Diagnostic only; they say
nothing about Render production performance. The RSS gap is consistent with the
larger float model being resident.

## The frozen-crop benchmark remains ineligible

It requires a `COMPATIBLE` verdict plus its own preregistration. The verdict is
`INCONCLUSIVE_OUTPUT`, so it is not eligible — even though the specific thing
that blocked it is a synthetic typeface of my own making rather than anything
about the model, the runtime, or the corpus.
