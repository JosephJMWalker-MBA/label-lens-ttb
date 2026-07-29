# Preregistration — Brand native-runtime / float-model attribution benchmark

Refs Issue #149. **Evaluation-only, preregistered three-arm benchmark** on
already frozen approved Brand crop pixels. Frozen before any OCR runs.

No production behaviour change. No modification to production source, fixtures,
fixture truth, crop geometry, preprocessing, parser rules, thresholds, or
authority logic. PR #195 untouched.

Base: `origin/main` `d6c87c4122d8faf5ca65863d7f3a5f8d8da5d9a6`, including merged
PR #210.

Eligibility for this benchmark is recorded separately in
`eligibility-rationale.md`. The Attempt 1/2/3 verdicts are preserved unchanged and
none is relabelled `COMPATIBLE`.

## Two matched contrasts

**Contrast 1 — runtime effect.** Does native Tesseract 5.3.0 produce better Brand
evidence than the incumbent tesseract.js 7.0.0 WASM runtime when both use the
exact same integer-quantized traineddata? **Only the runtime changes.**

**Contrast 2 — model effect.** Within native Tesseract 5.3.0, does the float
`tessdata_best` model produce better Brand evidence than the integer-quantized
traineddata? **Only the traineddata weights change.**

Arm A versus Arm C is a **bundled stack comparison** — runtime and weights change
together — and is reported **descriptively only**, never as a single-variable
causal contrast.

## Three fixed arms

| Arm | Runtime | Model | Role |
| --- | --- | --- | --- |
| A | tesseract.js 7.0.0 / core 7.0.0, OEM 1, in-process | integer traineddata `5dc5d8d6…` | incumbent, production-equivalent evaluation path |
| B | native Tesseract 5.3.0, OEM 1, pinned container | **same** integer bytes | runtime-only contrast against A |
| C | native Tesseract 5.3.0, OEM 1, pinned container | float `tessdata_best` `8280aed0…` | model-only contrast against B |

All arms: governed Brand PSM **11**, OEM **1**, language `eng`, **no DPI flag**
(the incumbent evaluation path sets none, so no arm sets one), and **byte-identical
preprocessed crop PNG input**.

No fourth arm. No model sweep, PSM sweep, preprocessing variant, scale variant,
retry with changed settings, ensemble, best-of-N, VLM, or modern recognizer.

## Frozen population, verified against merged artifacts

Historical cases (from PRs #204, #205, #207): `approved-wine-004`,
`approved-wine-005`, `approved-wine-031`, `la-fattoria-rotated`,
`wine-multi-artifact-04`.

Verified structure:

| Unit | Count |
| --- | --- |
| Historical cases | 5 |
| OCR items | 6 |
| Distinct preprocessed pixel sets, item level | 5 |
| Distinct crop images, case level | 4 |
| Distinct Brand designs | 3 |

**Both crop counts are reported deliberately.** At item level there are 5 distinct
pixel sets, because `approved-wine-004` and `la-fattoria-rotated` are
byte-identical. At case level there are 4 distinct crop clusters — the denominator
PR #207 recorded — because `wine-multi-artifact-04`'s two regions belong to one
case. **Cluster decisions in this benchmark use the 4 case-level crop clusters.**

Independence rules: duplicate crop evidence counts once; shared-design evidence
counts once at design level; historical case, OCR item, distinct crop, and
distinct design are reported separately. No case may be substituted and the
population may not be expanded after results are seen.

## Runtime and asset freeze

Reused and reverified from Attempts 2 and 3: native linux/amd64 GitHub-hosted
runner; base `node:22-bookworm-slim@sha256:6c74791e…` with amd64 image id
`sha256:bd16adab…`; Tesseract 5.3.0; `tesseract-ocr=5.3.0-2`,
`libtesseract5=5.3.0-2`, `liblept5=1.82.0-3+b3`, `time=1.9-0.2`; binary sha256
`1e8c7ce7…`; `configs/tsv` sha256 `59d079bb…`; 1 CPU, 2 GB, 120 s timeout;
`LC_ALL=C`, `LANG=C`, `OMP_THREAD_LIMIT=1`, `OMP_NUM_THREADS=1`.

Models: integer `5dc5d8d640a212c9…` (5,199,098 bytes); float
`8280aed0782fe272…` (15,400,601 bytes), retrieved through the existing verified
PR #208 script. Neither model nor any Docker image is committed.

**If any pinned runtime, model, config, or base identity cannot be reproduced
exactly, the run stops before OCR with `INCONCLUSIVE_ENVIRONMENT`.**

## Identical evidence inputs

The governed preprocessed Brand crop PNG bytes are **recovered once** from the
merged Otsu-threshold control arm — not recomputed — and all three arms receive
byte-identical input per OCR item. Frozen per item before OCR: case ID, OCR item
ID, source image path and hash, approved region geometry, preprocessing
description, processed PNG dimensions and sha256, crop cluster ID, design cluster
ID.

The inference payload uses **opaque item identifiers**. Brand truth appears in no
file name, mount name, environment variable, command argument, OCR metadata,
runtime log, or model directory. The opaque-ID-to-case mapping lives only in a
post-inference evaluation area that the OCR phase never reads.

## Raw output boundary

Every arm runs a primary invocation and one exact repeat, and **all raw output is
persisted and hashed before Brand truth is read**. Arm A retains the full
tesseract.js word list with text, boxes, and raw confidence, plus latency and
memory. Arms B and C retain complete TSV bytes, stderr, exit status, word rows,
boxes, confidences, latency, and peak RSS. Absent output is recorded with an
explicit marker and failure stage; no TSV is ever fabricated.

## Normalized evidence adapter

An evaluation-only layer emits a common structure per invocation. **Original
engine confidence is preserved separately, and no cross-runtime normalized
confidence is emitted**, because tesseract.js and native Tesseract confidence
scales are not proven comparable. Production confidence handling is unchanged. No
engine confidence becomes a compliance finding. Authority-state effects are
reported as **exploratory**; raw-recognition metrics are primary.

## Truth evaluation

After every raw output is frozen: reveal the existing governed Brand truth, apply
the single preregistered normalization in `normalization-spec.json`, compute
metrics, and pass normalized word evidence through the existing deterministic
Brand selector in evaluation-only mode. Parser, selector, lexicons, denylists,
confidence thresholds, and authority rules are unchanged.

## Per-item metrics

Per arm: exact match; normalized exact match; character error rate; useful-token
recall; truth present anywhere in the raw transcript; truth-bearing fragment
count; empty-output status; hallucinated or visually unsupported text where
adjudicable; deterministic repeat status; latency; peak memory; process/runtime
failure. Where safely comparable: selected Brand candidate, candidate correctness,
resulting authority state, false reliable read.

**A false reliable read is the primary safety veto.**

## Matched classifications

Each OCR item is classified separately for both contrasts.

Runtime (A vs B): `NATIVE_RUNTIME_IMPROVEMENT`, `NATIVE_RUNTIME_NO_EFFECT`,
`NATIVE_RUNTIME_REGRESSION`, `NATIVE_RUNTIME_NONDETERMINISTIC`,
`NATIVE_RUNTIME_INCOMPARABLE`.

Model (B vs C): `FLOAT_MODEL_IMPROVEMENT`, `FLOAT_MODEL_NO_EFFECT`,
`FLOAT_MODEL_REGRESSION`, `FLOAT_MODEL_NONDETERMINISTIC`,
`FLOAT_MODEL_INCOMPARABLE`.

**Improvement requires truth-bearing evidence** — a newly exact normalized match,
truth newly present in the raw transcript, a useful-token-recall gain of at least
0.25 that also adds at least one whole truth token, or a character-error-rate
reduction of at least 0.10. More characters, higher confidence, non-empty output,
or merely different output never count. Legibility improved but not recovered may
be annotated but is not recovery.

## Primary decisions

**Runtime:** `KEEP_NATIVE_RUNTIME_FOR_FURTHER_EVALUATION` only when at least one
distinct crop cluster improves, at least one distinct design cluster improves,
there are zero new false reliable reads, all evaluated runs are deterministic, and
there is no unexplained process failure. Otherwise
`RUNTIME_NO_EVIDENCE_OF_GAIN`, `RUNTIME_REGRESSION`, or `RUNTIME_INCONCLUSIVE`.

**Float model:** `KEEP_FLOAT_MODEL_FOR_FURTHER_EVALUATION` only when at least one
distinct crop cluster improves over native integer, at least one distinct design
cluster improves, there are zero new false reliable reads, output is
deterministic, and there is no unexplained process failure. Otherwise
`FLOAT_MODEL_NO_EVIDENCE_OF_GAIN`, `FLOAT_MODEL_REGRESSION`, or
`FLOAT_MODEL_INCONCLUSIVE`.

**Overall next step:** native runtime improves → authorize engine-neutral adapter
planning. Float model improves → retain it as the candidate traineddata for the
expanded benchmark. Runtime improves but float does not → prefer native integer
next. Float improves but runtime does not → record that float **weights**, not
the runtime, are the useful change. Neither improves → stop Tesseract tuning on
this frozen subset and authorize planning for one modern local scene-text
recognizer. Any new false reliable read blocks production-facing follow-up. No
result authorizes production replacement or shadow mode.

## Interpretation boundaries

A small mechanism-existence benchmark. It does not support population accuracy,
prevalence, production-rate claims, a final engine-selection decision, production
suitability, Render resource suitability, or a universal Tesseract capability
ceiling. A complete null would satisfy one additional prerequisite for a later
capability-ceiling discussion on this specific stylized subset, and would not
establish the ceiling alone.

## Transport

Push-triggered workflow scoped to this research branch, with committed modes
`execute` and `complete`, and a path filter admitting only the workflow file and
the mode file. OCR runs only when the mode is exactly `execute`. After results are
committed the mode becomes `complete` and a seal run must skip OCR. No
`pull_request_target`, no workflow added to main, no unscoped branch trigger.
