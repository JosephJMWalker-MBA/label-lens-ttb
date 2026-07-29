# Preregistration — PARSeq compatibility and evidence-contract probe

Refs Issue #149. **Evaluation-only compatibility probe.** Frozen before any
retrieval or inference.

**Outcome: the probe stopped at the licensing gate with `BLOCKED_MODEL_LICENSE`.**
No checkpoint was downloaded, no container was built, no synthetic input was
generated, and no inference ran. This document records the design as frozen, so
that the blocker is visibly a gate outcome rather than an abandoned plan.

Base: `origin/main` `791d9c9ab6a3be8f72f753253d21b47efef9726e`, including merged
PR #211.

## Scope and prohibitions

No governed Brand crop, fixture, or fixture truth is accessed. No production
source, production Dockerfile, or application dependency is modified. PARSeq is
not integrated into the production extractor. The existing Brand selector is not
called. No bounding boxes are fabricated. No model weights are committed. No
alternative candidate is run. PR #195 untouched.

## Selected candidate

| Field | Value |
| --- | --- |
| Repository | `baudm/parseq` |
| Pinned code revision | `1902db043c029a7e03a3818c616c06600af574be` (verified) |
| Model identifier | `parseq` — PARSeq base, `img_size=128x32`, `patch_size=8x4`, `d_model=384` |
| Checkpoint | `parseq-bb5792a6.pt`, 95,392,675 bytes published |
| Checkpoint URL | `https://github.com/baudm/parseq/releases/download/v1.0.0/parseq-bb5792a6.pt` |
| Release | `v1.0.0` |
| Release-tag commit | `315d19be8ef473a864950ab497a649a69e37c6a4` (verified) |
| Refuted prior value | `315d19b88931758c5c36395b086e115049386d49` |

Decoding, fixed before any run: `decode_ar = true`, `refine_iters = 1`, greedy
argmax, no sampling, no beam search, no best-of-N, no alternate decoding arm,
evaluation mode, CPU inference. This is the canonical released configuration, not
a context-free override.

## Research question

Can the pinned code and checkpoint (1) load in a reproducible CPU-only
environment, (2) execute fully offline after asset retrieval, (3) emit auditable
raw logits, token probabilities, token IDs and transcript, (4) reproduce output
exactly across one primary run and one exact repeat, and (5) populate an honest
sequence-only evidence contract without fabricated geometry?

This does **not** test Brand recognition capability.

## Provenance and licensing gate — the gate that fired

Before downloading the checkpoint: record the official repository license; record
the official model-card license; establish that **the exact selected checkpoint**
is covered by an Apache-2.0 grant or another acceptable explicit license; record
NOTICE and attribution material; record the exact source URL and release. The
repository LICENSE file alone is explicitly **not** sufficient inference.

**If the license cannot be tied responsibly to the exact model artifact, stop
before retrieval with `BLOCKED_MODEL_LICENSE`.**

That is what happened. The audit is in `license-audit.md`. In summary: the code is
Apache-2.0 with NOTICE and BSD/MIT components; the README's license sentence is
scoped to code; the `v1.0.0` release body contains no license statement; the
repository contains no model card; and the author's Apache-2.0 model cards attach
to Hugging Face repositories named `parseq-small` / `parseq-tiny` holding
`pytorch_model.bin`, not to `parseq-bb5792a6.pt`. Closing that gap requires an
inference across three naming systems and a format change, which the gate forbids.

## Design that was frozen but never executed

The remainder of this section records what would have run, so that a follow-up can
reuse it without redesign.

**Retrieval.** One fail-closed script downloading only the exact checkpoint URL,
accepting no caller-supplied URL or model ID, writing to an untracked path under
`.local/ocr-research/models/parseq/`, computing full SHA-256 and byte size,
freezing them after an authorized discovery phase, deleting the download and
exiting non-zero on mismatch, and reverifying an existing cache before use. The
short hash embedded in the filename is never treated as an integrity proof.

**Runtime.** One research-only Python container on a native linux/amd64 GitHub
Actions runner, with base image pinned by digest and pinned Python, PyTorch CPU
wheel and source, torchvision, PyTorch Lightning, timm, Pillow, NumPy, and every
other inference dependency, plus the pinned PARSeq source commit and target
architecture. Build may use the network; **inference runs with the network
disabled**, checkpoint and inputs mounted read-only, no repository root, no corpus
or truth mounted, one CPU thread where feasible, fixed seeds, deterministic
PyTorch settings, and identical limits for primary and repeat. Python and PARSeq
are never installed into the production application.

**Transform.** Verified from the pinned source rather than assumed: RGB, resize to
height 32 by width 128 with bicubic interpolation, tensor conversion, normalization
with mean 0.5 and standard deviation 0.5. Confirmed in
`SceneTextDataModule.get_transform` — see `transform-spec.json`.

**Synthetic inputs.** Exactly two images. A positive rendering `LABEL LENS 123`
using one real, license-compatible font from an exactly pinned Linux package —
glyphs are never drawn manually — with package, version, font path, font SHA-256,
font license, dimensions, size, placement, colors, and PNG hash recorded. A blank
of identical dimensions and background. Each generated twice and required
byte-identical before preregistration. The expected positive transcript is
recorded for output QA only; exact transcription is **not** required for the
compatibility verdict.

**Matrix.** Exactly four invocations: positive primary, positive repeat, blank
primary, blank repeat. No retry, no third run, no altered transform, no alternate
checkpoint, no alternate decoding mode. Whether model load time is included in
invocation latency is recorded explicitly.

**Raw evidence.** Persisted before interpretation: input hash; transformed tensor
hash where reproducible; tensor dimensions and dtype; raw float logits as a
deterministic binary artifact plus a small JSON descriptor, unrounded; logits
dimensions and SHA-256; finite/non-finite validation; softmax probabilities;
token IDs and strings; EOS position; raw and normalized transcript; character
probabilities; model-native sequence score; latency; model load time; peak memory;
warnings; errors; exit status; output fingerprint.

**Sequence score, fixed in advance:** the product of per-position maximum softmax
probabilities over decoded positions up to and including the first EOS, excluding
padding. Range 0..1.

**Never fabricated:** word, character or line boxes; Tesseract-style confidence;
abstention capability the model does not possess. Native probabilities stay in
0..1, are never multiplied by 100, never enter Label Lens authority thresholds,
never become `OcrWord` objects, and `selectBrandObservation` is never called.

**Determinism.** Primary and repeat must match exactly in normalized transcript,
token IDs, EOS position, character probabilities, raw logits bytes, and output
fingerprint. If exact raw-logit equality is unachievable despite identical token
output, the rule is **not** silently relaxed: the differences are recorded and the
run is classified nondeterministic.

## Verdicts

`COMPATIBLE` — code and checkpoint load; all four invocations complete; logits
finite and schema-valid; token decoding succeeds; primary/repeat deterministic;
inference succeeds with the network disabled; no unexplained process or dependency
failure. Exact recognition of the positive sentinel is **not** required.

`INCOMPATIBLE_RUNTIME` — the pinned code/checkpoint cannot load or execute in the
pinned runtime, reproducibly, with integrity and environment preflights passing,
attributable to runtime/model incompatibility.

`INCONCLUSIVE_ENVIRONMENT` — dependencies cannot be pinned or installed
reproducibly; native amd64 execution unavailable; asset integrity cannot be
established; the runtime cannot be inventoried completely.

`INCONCLUSIVE_OUTPUT` — execution completes but logits or tokens are malformed;
non-finite logits; token decoding fails; primary/repeat nondeterministic.

Separate output-risk flags, none of which alone implies runtime incompatibility:
`positiveTranscriptExact`, `blankTranscriptEmpty`,
`blankProducedUnsupportedText`, `modelHasNaturalAbstention`,
`confidenceInterpretationKnown`.

**`BLOCKED_MODEL_LICENSE` is a gate outcome that precedes all four verdicts.** It
is not one of them, and it is not evidence about the runtime.

## Interpretation boundaries

A `COMPATIBLE` verdict would establish only that the selected PARSeq stack runs
reproducibly, that its output can be audited through a sequence-only evidence
contract, and that the frozen Brand mechanism benchmark becomes eligible.

It would not establish better Brand recognition, better accuracy than Tesseract,
acceptable false reliable reads, production suitability, acceptable production
latency, authorization to alter the extractor, authorization to add Python to
production, authorization to use fabricated geometry, or authorization to replace
Tesseract.

No verdict was reached here, so none of the above is claimed either way.
