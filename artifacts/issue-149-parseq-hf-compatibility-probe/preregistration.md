# Preregistration — PARSeq-small compatibility and sequence-evidence probe

Refs Issue #149. **Evaluation-only compatibility probe.** Frozen after discovery
and **before any inference**.

New candidate selection with its own preregistration. It does not modify, reopen,
reinterpret, or substitute anything in PR #212, whose conclusion is preserved: the
GitHub Release checkpoint lacked an explicit licence tied to that exact artifact,
the gate correctly stopped before retrieval, and no compatibility verdict exists.

Base: latest `origin/main` `791d9c9ab6a3be8f72f753253d21b47efef9726e`. PR #212 was
still an open draft when this branch was cut, so `origin/main` did not contain it;
nothing here depends on its artifacts. See `candidate-lineage.md`.

## Research question

Can the explicitly licensed PARSeq-small artifact, under the pinned official code,
(1) load in a reproducible CPU-only environment, (2) execute fully offline, (3)
emit auditable raw logits, token probabilities, token IDs and transcript, (4)
reproduce its output exactly across one primary run and one exact repeat, and (5)
populate an honest sequence-only evidence contract without fabricated geometry?

**This does not test Brand recognition capability.**

## Selected artifact — licence established before retrieval

| Field | Value |
| --- | --- |
| Model repository | `baudm/parseq-small` |
| Immutable model commit | `a1526c3d63740e460153987f9aaf6b86aa199dc1` |
| Selected file | `pytorch_model.bin` |
| SHA-256 | `bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00` |
| Byte size | 95,392,675 |
| Model licence | **Apache-2.0**, declared on the model card in the same commit as the weights |

All six licence-gate items verified — see `license-audit.md`. The hash and size were
attested by the LFS pointer **before** download; the retrieval script then verified
both against the real bytes.

The SHA-256 prefix and byte size coincide with the GitHub Release file. That is
**supportive provenance only**: not the licence basis, not an experimental
dependency, and **no byte-identity claim is made**.

Training-data provenance is recorded separately in `training-data-provenance.md`
and remains **unresolved**. `trainingDataProductionReviewRequired = true`.

## Code, runtime and container — frozen from discovery run 30499089181

| Field | Value |
| --- | --- |
| Code | `baudm/parseq` @ `1902db043c029a7e03a3818c616c06600af574be`, Apache-2.0 + NOTICE |
| Base image | `python:3.11-slim-bookworm@sha256:b18992999dbe963a45a8a4da40ac2b1975be1a776d939d098c647482bcad5cba` |
| Built image | `sha256:c29fb8cc7041b07022c9f44c368a42b42c906d0781fcada4b5c395976f6288a1` |
| Python | 3.11.15 |
| torch / torchvision | `2.2.1+cpu` / `0.17.1+cpu` |
| pytorch-lightning / timm | `2.2.0.post0` / `0.9.16` |
| numpy / Pillow / nltk | `1.26.4` / `10.2.0` / `3.8.1` |
| lmdb | `1.4.1` — required transitively by `strhub.data.module`; pin from upstream `requirements/test.txt` |
| Dependency source | upstream `requirements/core.txt` at the pinned commit, used verbatim |
| Font | `fonts-dejavu-core=2.37-6`, `DejaVuSans.ttf`, sha256 `abdc775b21b1bc47…`, DejaVu Fonts License |

Discovery was re-run after a pre-inference import failure revealed the missing
transitive `lmdb` dependency; no inference had run and no result existed at that
point. Synthetic input hashes were byte-identical across the two independent
container rebuilds.

Full inventory in `dependency-lock.json`, `container-provenance.json`,
`runtime-provenance.json`, `font-provenance.json`. Build args have no defaults, so
the image cannot build with a floating font or source revision.

## Checkpoint security

Loaded with `torch.load(..., map_location="cpu", weights_only=True)`, then
validated as a mapping of string keys to tensors only, then loaded into the
architecture with `strict=True`.

**Fails closed** if `weights_only=True` cannot load the artifact, if any
non-tensor or malformed key appears, if shapes are incompatible, or if missing or
unexpected keys appear. The TorchScript file is never used and no arbitrary
serialized object is executed.

## Architecture and decoding — verified from the pinned source

`img_size [32, 128]` (height first); `patch_size [4, 8]` (height first);
`embed_dim 384`; `max_label_length 25`; enc depth 12 / heads 6; dec depth 1 /
heads 12; 94-character train charset (62 case-sensitive alphanumeric + 32
punctuation).

Official loading semantics: `create_model('parseq', pretrained=False)` then
`model.model.load_state_dict(state, strict=True)` — the inner-`model` target is
exactly what upstream's `pretrained=True` path uses.

Canonical released inference: `decode_ar = true`, `refine_iters = 1`, greedy
argmax, eval mode, CPU, no sampling, no beam search, no best-of-N, no alternate
decoding arm.

## Transform — verified from the pinned source

RGB conversion, bicubic resize to 32x128, tensor conversion, normalization with
mean 0.5 and standard deviation 0.5, per
`SceneTextDataModule.get_transform`.

**The model does not receive unchanged pixels.** It receives the same approved
source image followed by its required frozen model-native transform. The intrinsic
resize is a property of the model, not a preprocessing choice.

## Synthetic inputs — frozen

Rendered with the real pinned DejaVu Sans font; **no manually constructed
rectangle glyphs**. Canvas 640x96, font size 48, origin (24, 20), black on white,
PNG `compress_level=9`, `optimize=False`. Each image was generated twice in-container
and required byte-identical.

| Image | sha256 | Bytes |
| --- | --- | --- |
| `synthetic/positive.png` — `LABEL LENS 123` | `265aaae73d65a04fe58441ccc1e1c67e15ca707b89fe312ca80c8aceb85831a0` | 5,029 |
| `synthetic/blank.png` | `26daf63d1830f5af6375d1be855f6ce7a7daba20994a667951d38da0d604fd48` | 384 |

Neither image may be altered after model output exists. The expected positive
transcript is recorded for output QA; **exact transcription is not required for the
compatibility verdict**.

## Fixed matrix — exactly four invocations

positive primary; positive exact repeat; blank primary; blank exact repeat.

No third invocation, no retry with changed settings, no alternate model, no
alternate transform, no alternate decoder. One model load is shared by all four;
`modelLoadMs` is recorded and **excluded** from per-invocation `latencyMs`.

## Sequence-only evidence

No `OcrWord` values. `selectBrandObservation` is never called. Nothing fabricates
bounding boxes, word/line/character geometry, Tesseract confidence, or Label Lens
authority. Probabilities stay in their native 0–1 range, are never multiplied by
100, and are never compared to Label Lens authority thresholds.

Per invocation: source image SHA-256; transformed tensor shape, dtype and SHA-256;
complete unrounded raw logits as a binary artifact plus JSON descriptor; logits
shape and SHA-256; finite-value validation; softmax probabilities; token IDs;
token strings; EOS index; raw transcript; normalized transcript; per-character
probabilities; native sequence score; empty-output flag; latency; model-load
duration; peak memory; warnings; errors; output fingerprint.

**Native sequence score, fixed before inference:** the product of per-position
maximum softmax probabilities over decoded positions up to and including the first
EOS position; `null` when no position is decoded. Range 0–1.

**Normalization, fixed before inference:** NFKD; strip combining diacritics;
lowercase; replace characters outside `[a-z0-9 ]` with a space; collapse
whitespace to one ASCII space; trim. No fuzzy matching, no edit-distance
allowance.

## Determinism

Primary and repeat must match exactly in raw transcript, normalized transcript,
token IDs, EOS position, per-character probabilities, **raw logits bytes**, and
output fingerprint. This is **not relaxed after results exist**.

## Verdicts

`COMPATIBLE` — licensing and provenance gates pass; model bytes match the full
expected hash and size; safe state-dictionary loading succeeds; architecture
loading succeeds; all four invocations complete; logits finite and structurally
valid; decoding succeeds; repeats deterministic; offline inference succeeds; no
unexplained dependency or process failure. **Exact positive transcription is not
required.**

`INCOMPATIBLE_RUNTIME` — integrity and environment gates pass but the pinned model
cannot load or execute in the pinned runtime, reproducibly, attributable to the
runtime/model combination.

`INCONCLUSIVE_ENVIRONMENT` — dependencies cannot be pinned; native amd64
unavailable; runtime inventory incomplete; container not reproducible.

`INCONCLUSIVE_OUTPUT` — execution completes but logits are malformed or
non-finite, decoding fails, or primary and repeat are nondeterministic.

`BLOCKED_MODEL_PROVENANCE` — only if this artifact's explicit licence, immutable
identity, hash, size, or attributable source could not be verified. **It was
verified, so this blocker does not apply.** PR #212's `BLOCKED_MODEL_LICENSE` is
not reused.

## Output-risk flags, reported separately

`positiveTranscriptExact`, `blankTranscriptEmpty`,
`blankProducedUnsupportedText`, `modelHasNaturalAbstention`,
`confidenceInterpretationKnown`, `trainingDataProductionReviewRequired`.

A wrong synthetic transcript is an **output-risk** result, not automatically a
runtime incompatibility.

## Interpretation boundary

A `COMPATIBLE` result establishes only that the explicitly licensed PARSeq-small
artifact runs reproducibly, that its sequence output is auditable, and that a
**separately preregistered** frozen Brand benchmark becomes eligible.

It does not establish superior Brand recognition, production licensing clearance,
resolution of training-dataset provenance, production suitability, acceptable
production latency, authorization to install Python in production, authorization
to fabricate geometry, or authorization to replace Tesseract.
