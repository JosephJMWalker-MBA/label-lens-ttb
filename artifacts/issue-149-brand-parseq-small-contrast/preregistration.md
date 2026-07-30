# Preregistration — PARSeq-small versus incumbent Tesseract on frozen Brand crops

Refs Issue #149. **Evaluation-only, preregistered mechanism-existence benchmark.**
Frozen before any inference.

It does **not** authorize production integration, a Python production runtime,
authority-state changes, shadow deployment, or engine replacement.

Base: `origin/main` `ba15ff1fed1f5f22066fe42367e055668fa58aca`, including merged
PR #212 and PR #213.

## Prior evidence, preserved

Carried forward verbatim in `prior-evidence.md`: PR #212's
`BLOCKED_MODEL_LICENSE` for the GitHub Release checkpoint (never downloaded, no
compatibility verdict), and PR #213's `COMPATIBLE` verdict for the explicitly
licensed Hugging Face checkpoint, including PARSeq's no-space charset, its absence
of natural abstention, its uncalibrated confidence, and the unresolved
training-data due diligence.

**No compatibility probing and no synthetic inference is repeated here.**

## Research question

On the already frozen stylized Brand crop subset, does the explicitly licensed
PARSeq-small recognizer produce **more truth-bearing Brand evidence** than the
incumbent Tesseract.js recognizer?

This is a **two-arm architecture comparison**. It is **not** a single-variable
causal attribution experiment: the recognizers have different architectures and
different intrinsic transforms.

## Frozen population — verified before preregistration

Recovered from merged PR #211 and verified to reproduce exactly:

| Unit | Count |
| --- | --- |
| Historical cases | 5 |
| OCR items | 6 |
| Distinct preprocessed item-level pixel sets | 5 |
| Case-level crop clusters | 4 |
| Distinct Brand designs | 3 |

Cases: `approved-wine-004`, `approved-wine-005`, `approved-wine-031`,
`la-fattoria-rotated`, `wine-multi-artifact-04`.

Independence structure, verified: `approved-wine-004` and `la-fattoria-rotated`
share byte-identical case-level crop pixels; shared crop evidence counts once;
repeated Brand-design evidence counts once; the two `wine-multi-artifact-04`
regions remain separate OCR items but one historical case.

No case substitution, no corpus expansion, no post-result case addition.

## Fixed arms

**Arm A — incumbent.** tesseract.js 7.0.0 / core 7.0.0; integer traineddata
`5dc5d8d640a212c9…`; OEM 1; PSM 11; the exact frozen preprocessed crop PNG bytes;
the exact current evaluation settings from PR #211.

**Arm B — PARSeq-small.** Code `1902db043c029a7e03a3818c616c06600af574be`; model
commit `a1526c3d63740e460153987f9aaf6b86aa199dc1`; checkpoint
`bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00`, 95,392,675
bytes; CPU; eval mode; `decode_ar=true`; `refine_iters=1`; greedy argmax; no
sampling; batch size 1.

No third arm, alternative checkpoint, decoding variation, confidence threshold,
ensemble, fallback chain, detector, VLM, or crop/preprocessing sweep.

## Input equality and intrinsic transform

Both arms begin from the **same frozen preprocessed Brand crop PNG bytes** per OCR
item. Arm A receives them through its existing fixed path. Arm B receives the
identical bytes and then applies its preregistered intrinsic transform: RGB
conversion, bicubic resize to 32x128, tensor conversion, normalization with mean
0.5 and standard deviation 0.5. Tensor shape, dtype and hash are recorded.

**The two models do not receive byte-identical tensors.** They receive identical
source evidence followed by architecture-native processing.

## Truth isolation

Opaque item IDs are assigned from a fresh salt and inputs are copied to
opaque hash-based filenames. Brand truth, case names, producer names and expected
strings appear in no filename, directory, command, environment variable, container
mount, model metadata, or log. The case mapping lives in an evaluation-only
directory that is never mounted into inference.

Both arms and both repeats run, and **every raw output is frozen and hashed,
before truth is loaded**.

## Execution matrix

Per OCR item: Arm A primary, Arm A exact repeat, Arm B primary, Arm B exact
repeat. Totals: **24 inference invocations, 12 arm-item pairs, 12 exact-repeat
comparisons.** No retry beyond the fixed repeat; no altered setting after output
exists.

## Three preregistered text representations

The no-space charset is handled openly, not hidden. Full definitions in
`normalization-spec.json`.

1. **Raw transcript** — the exact model-emitted string, never edited.
2. **Boundary-preserving normalized** — NFKC, lowercase, every whitespace run to
   one ASCII space, trim. Spaces and punctuation preserved. Exposes PARSeq's
   inability to represent word boundaries.
3. **Whitespace-free comparable** — the boundary-preserving form with every
   whitespace character removed, all other characters including punctuation kept.
   The **primary** architecture-comparable representation, because PARSeq's frozen
   charset cannot emit a space.

Never applied: punctuation removal, character substitution, edit-distance
correction, dictionary word splitting, space insertion into PARSeq output, or
truth-guided segmentation. Both representations are reported, and whitespace-free
matching is **never** described as raw exact matching.

## Metrics

**Primary, on the whitespace-free representation:** exact match; character error
rate; truth present as a contiguous substring; useful-token recall (tokens of
length >= 3, applied identically to both arms); empty transcript; deterministic
repeat; runtime failure.

**Boundary-sensitive, on the boundary-preserving representation:** exact match;
CER; missing or extra whitespace; punctuation differences.

The raw transcript is also reported unchanged.

## Per-item classification

`PARSEQ_TRUTH_BEARING_IMPROVEMENT`, `PARSEQ_NO_EFFECT`, `PARSEQ_REGRESSION`,
`PARSEQ_INCOMPARABLE`, `PARSEQ_NONDETERMINISTIC`.

An improvement requires a truth-bearing gain under the primary whitespace-free
metrics: wrong to exact, materially lower CER (>= 0.10), truth newly present, or a
useful Brand fragment newly recovered (recall gain >= 0.25 plus at least one more
whole token). More characters, a higher score, or a non-empty output is never an
improvement by itself. A change between two equally wrong transcripts is
`NO_EFFECT` unless one has objectively worse primary CER.

## Confidence, abstention and false reliable reads

Governed by `confidence-boundary.md`. In summary: no threshold is derived from any
source; native sequence scores are descriptive only, never rescaled, never mapped
to authority states, never compared directly with Tesseract confidence.
`scoreOrderingRisk` is reported as a threshold-free calibration diagnostic.

The canonical false-reliable-read measure is
**`NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING`**. Zero is deliberately not
reported. Wrong-output count, unsupported-output adjudication, score-ordering risk,
and the inherited blank-hallucination risk are reported separately.

## Unsupported-text adjudication

After raw outputs are frozen and truth is revealed, each PARSeq transcript is
classified `FULLY_VISUALLY_SUPPORTED`, `PARTIALLY_VISUALLY_SUPPORTED`,
`NOT_VISUALLY_SUPPORTED`, or `UNADJUDICATED`. Visual support is **not** inferred
from truth mismatch alone. Reviewer notes and uncertainty are retained. This is
separate from exact-match evaluation.

## Determinism

Arm B requires exact primary/repeat equality in logits bytes, token IDs, EOS
index, per-character probabilities, raw transcript, and output fingerprint. Arm A
requires its existing deterministic fingerprint. **Any PARSeq nondeterminism
yields `PARSEQ_NONDETERMINISTIC` and blocks a KEEP decision.**

## Independence reporting

Results are reported separately by historical case, OCR item, distinct preprocessed
pixel set, case-level crop cluster, and distinct Brand design. Duplicate crops are
never aggregated as independent successes, and a repeated Brand design can
contribute only **one** design-level improvement.

## Decision rules

**`KEEP_FOR_EXPANDED_BENCHMARK`** requires all of: at least one distinct
case-level crop cluster shows a truth-bearing improvement; at least one distinct
Brand design does; all PARSeq repeats are deterministic; no unexplained runtime
failure; no distinct Brand design has a primary-metric regression; no model or
truth leakage; and all known output risks are reported without inventing
calibration. It authorizes **only corpus expansion and calibration research** — not
production use.

**`NO_EVIDENCE_OF_GAIN`** — no distinct crop cluster improves, or no distinct
design improves, without a material regression.

**`REGRESSION`** — a material primary-metric regression at distinct-design level;
or repeated unsupported text severe enough to negate any gains; or an unexplained
runtime failure.

**`INCONCLUSIVE`** — inputs cannot be reproduced; truth isolation fails; raw
outputs are incomplete; independence mappings cannot be verified; or the comparison
cannot be interpreted without changing the frozen design.

## Interpretation boundaries

Small mechanism-existence experiment: 5 cases, 6 items, 4 case-level crop
clusters, 3 Brand designs. It cannot establish population accuracy, production
prevalence, calibrated abstention, production licensing clearance, training-data
clearance, production latency suitability, final engine selection, authority
integration, or production replacement.

Even a KEEP leaves these blocked: abstention design; confidence calibration;
geometry strategy; parser integration; an expanded held-out corpus; training-data
due diligence; and production deployment architecture.
