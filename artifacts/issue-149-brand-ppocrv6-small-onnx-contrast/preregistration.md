# Preregistration — PP-OCRv6-small ONNX versus frozen incumbent Tesseract Brand evidence

Refs Issue #149. **Evaluation-only, preregistered architecture comparison.**
Frozen before any model retrieval and before any inference.

Base: `origin/main` `9372ebbb4f0cd3f4d58023e944c2500f28c8fe7b`, including merged
PR #214 and PR #215.

It does **not** authorize production integration, shadow deployment,
authority-state changes, engine replacement, a production Python or ONNX Runtime
dependency, an abstention threshold, broader corpus access, a production
suitability claim, or training-data clearance.

## Prior evidence, preserved

Carried forward in `prior-evidence.md`: PR #214's `REGRESSION` verdict for
PARSeq-small, and PR #215's `COMPATIBLE` verdict for the PP-OCRv6-small ONNX
compatibility probe. **Neither is reopened, reinterpreted or relabelled here.**
No compatibility probing and no synthetic inference is repeated.

## Research question

On the exact frozen six-item stylized Brand crop subset, does
`PP-OCRv6_small_rec_onnx` produce **more truth-bearing Brand recognition
evidence** than the frozen incumbent Tesseract evidence from PR #214?

This is a **two-arm architecture comparison**. It is **not** a single-variable
causal attribution experiment, and it does **not** test the full Label Lens
selector or authority pipeline.

## Frozen population — verified before this freeze

| Unit | Count |
| --- | --- |
| Historical cases | 5 |
| OCR items | 6 |
| Distinct item-level pixel sets | 5 |
| Case-level crop clusters | 4 |
| Distinct Brand designs | 3 |

Cases: `approved-wine-004`, `approved-wine-005`, `approved-wine-031`,
`la-fattoria-rotated`, `wine-multi-artifact-04`.

All six source PNG SHA-256 values and byte sizes were re-verified against merged
PR #214's `input-pixel-manifest.json` and match exactly. The expected counts are
compiled into the prepare script rather than read from the source file, so a
drifted source cannot silently redefine the population; any discrepancy halts
before staging.

No substitution, recropping, corpus expansion, post-result addition or new
example. `approved-wine-004` and `la-fattoria-rotated` are byte-identical pixels
and the duplicate C1 crop counts once; a repeated Brand design counts once.

## Truth isolation

Byte-identical copies are staged under **fresh opaque identifiers** from a new
experiment-specific salt, `issue-149-brand-ppocrv6-small-onnx-contrast-v1`. The
prepare script halts if any identifier collides with PR #214's for the same item.

The inference environment never receives case IDs, fixture names, Brand truth,
producer names, expected transcripts, cluster mappings, truth-bearing filenames or
the repository root. Checked surfaces: filenames, directory names, container
mounts, command arguments, environment variables, model and config metadata,
runtime logs and output filenames.

The evaluation-only mapping lives at `evaluation/id-map.json` and the carried
Arm A evidence at `arm-a-frozen/`. **Neither is ever mounted into inference.**

## Arm A — frozen incumbent evidence, not a new run

**Tesseract is not re-run. No current-code Tesseract execution is authorized in
this experiment.**

Carried forward from merged PR #214 at `5161a58e02341753a31c2ab889b148b2cecedf81`:
tesseract.js 7.0.0 / tesseract.js-core 7.0.0, OEM 1, PSM 11, traineddata
`5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`, no DPI flag;
the exact primary and repeat raw outputs, with transcripts, words, boxes,
confidence values, warnings, latency and fingerprints.

All twelve carried files were re-hashed and match the SHA-256 values recorded in
PR #214's `raw-output-manifest.json`; each item has exactly one primary and one
repeat; and each carried file's recorded source-pixel hash matches the pixels
staged here. Proof is in `arm-a-carryforward.json`.

**Arm A metrics are recomputed** from the carried raw outputs by the same scoring
code path as Arm B, not copied from PR #214's published table. Any disagreement
with the published values is reported openly, and neither number is silently
preferred.

## Arm B — PP-OCRv6-small ONNX

| Field | Value |
| --- | --- |
| Repository | `PaddlePaddle/PP-OCRv6_small_rec_onnx` |
| Immutable revision | `b8f84f0b80c529de40b4fbb3544b84fa7233a513` |
| Model | `inference.onnx` |
| SHA-256 | `5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634` |
| Byte size | 21,159,378 |
| Config | `inference.yml`, `ab078671bb49f062…`, 150,579 B |
| Runtime | the exact pinned ONNX Runtime 1.28.0 CPU environment from PR #215, `CPUExecutionProvider` only |

No Paddle native weights, no `paddle2onnx`, no loading of `inference.json`, no
detector, ensemble, lexicon, fallback or alternate model. **No PARSeq third arm.**

**Upstream-head rule.** At execution time the pinned revision must remain
retrievable and every pinned byte, hash, size, configuration and licence must
verify. The upstream repository's current default-branch head is **not** required
to equal the pinned revision: a later upstream commit does not invalidate an
immutable approved revision. Any head change is recorded as an observation and the
run proceeds with the pinned revision. Only a failure of the pinned-revision
checks halts.

## Intrinsic preprocessing, frozen from PR #215

BGR channel order; OpenCV `INTER_LINEAR` resize; fixed height 48;
aspect-preserving width; maximum width 320; always right-pad to width 320;
normalization `(pixel / 255 - 0.5) / 0.5`; float32 tensor `[1, 3, 48, 320]`.

Both arms begin from **byte-identical frozen source PNG evidence**, followed by
their architecture-native transforms. The two models do **not** receive
byte-identical tensors, and no such claim is made.

## Output semantics

**The ONNX graph emits probabilities, not logits** — PR #215 measured row sums of
1.0 to within 4e-7. The evidence contract and filenames use `rawModelOutputTensor`,
`rawProbabilityTensor` and `probabilityTensorSha256`. The outputs are **not**
called logits and **no softmax is applied**.

CTC decoding: blank token ID **0**; `character_dict` from the pinned
`inference.yml`; PaddleOCR's appended ASCII-space token at ID **18709**;
consecutive-duplicate removal; blank removal. No dictionary correction and no
truth-guided change.

## Fixed invocation matrix

Only Arm B runs new inference: six OCR items, one primary and one exact repeat
each, **twelve PP-OCRv6 invocations**. No retry beyond the fixed repeat, and no
changed setting after any result exists. Arm A contributes fixed carry-forward
evidence, not invocations.

**All twelve Arm B outputs are frozen and hashed before Brand truth or cluster
identities are loaded.**

## Three text representations

1. **Raw transcript** — exact output, unchanged.
2. **Boundary-preserving normalized** — NFKC, lowercase, collapse whitespace runs
   to one ASCII space, trim; punctuation and spaces preserved.
3. **Whitespace-free comparable** — representation 2 with whitespace removed;
   every other character preserved.

**Primary comparison: whitespace-free**, to preserve comparability with PR #214.
**Secondary comparison: boundary-preserving**, now substantively meaningful
because PP-OCRv6 can emit ASCII space.

Never applied: punctuation removal, character substitution, edit correction, word
splitting, lexicon insertion, or truth-guided normalization.

## Metrics

**Primary**, on the whitespace-free representation: exact match; character error
rate; truth present as a contiguous substring; useful-token recall using PR #214's
exact definition (tokens of the boundary-preserving truth with length ≥ 3, matched
by substring containment, applied identically to both arms); empty transcript;
deterministic repeat; runtime failure.

**Secondary**, on the boundary-preserving representation: boundary-sensitive exact
match; boundary-sensitive CER; missing or extra whitespace; punctuation
differences.

Reported separately by OCR item, distinct pixel set, crop cluster, historical case
and Brand design. The duplicate C1 crop counts once; a repeated Brand design counts
once. **No averaging may conceal an item-level material regression.**

## Per-item classification

`PPOCRV6_TRUTH_BEARING_IMPROVEMENT`, `PPOCRV6_NO_EFFECT`, `PPOCRV6_REGRESSION`,
`PPOCRV6_INCOMPARABLE`, `PPOCRV6_NONDETERMINISTIC`.

PR #214's material-improvement definition is preserved: wrong to exact; a primary
CER improvement of at least 0.10; truth newly present; or a useful-token recall
gain of at least 0.25 **plus** at least one additional whole useful token. More
characters, a non-empty result, or a higher native score is never an improvement
by itself.

**Any material regression within a repeated Brand design makes that design a
regression. An improvement within the same design does not cancel it.**

## Confidence and abstention

Governed by `confidence-boundary.md`. Both score definitions are recorded now,
under distinct names, and **the choice between them is frozen before any result
exists**: `planDefinedNonBlankTimestepMean` and `upstreamCollapsedSequenceMean`.
Neither may be swapped in after results, and no composite may be invented later.

PP-OCRv6 confidence is descriptive evidence only: not compared numerically with
Tesseract confidence, not mapped to authority states, and no threshold derived.
`confidenceInterpretationKnown: false`.

Canonical false-reliable-read result:
**`NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING`**. Zero is deliberately not
reported. Also reported: wrong-output count, output support adjudication,
score-ordering risk for both definitions, and empty-output behaviour.

## Visual-support review

Per `visual-support-protocol.md`, only after raw outputs are frozen and truth is
revealed: `FULLY_VISUALLY_SUPPORTED`, `PARTIALLY_VISUALLY_SUPPORTED`,
`NOT_VISUALLY_SUPPORTED`, `UNADJUDICATED`. Truth mismatch alone does not establish
unsupported text. Reviewer identity, unblinded status, notes and uncertainty are
recorded. The review is unblinded by construction and single-reviewer, and is
reported as such.

## Decision rules

**`KEEP_FOR_EXPANDED_BENCHMARK`** requires every one of: at least one distinct
crop cluster improves; at least one distinct Brand design improves; no distinct
Brand design regresses; all twelve PP-OCRv6 runs complete; every primary/repeat
pair is byte-deterministic; no unexplained runtime failure; all source and model
hashes verify; truth isolation passes; no concealed confidence or abstention
assumption; known output risks are reported.

**`NO_EVIDENCE_OF_GAIN`** — no crop-cluster improvement or no design improvement,
without a material design regression.

**`REGRESSION`** — any distinct Brand-design regression, severe repeated
unsupported output, or unexplained runtime failure.

**`INCONCLUSIVE`** — input reproduction failure, truth-isolation failure,
incomplete raw evidence, broken independence mapping, or a comparison that cannot
be interpreted without changing the frozen design.

A `KEEP` authorizes **only** a separately planned expanded held-out benchmark and
confidence-calibration research.

## Interpretation boundaries

Small mechanism-existence experiment: 5 cases, 6 items, 5 pixel sets, 4 crop
clusters, 3 designs. It cannot establish population accuracy, production
prevalence, calibrated abstention, production licensing clearance, training-data
clearance, production latency suitability, final engine selection, authority
integration, or production replacement.

Arm A's latency and memory came from a different host on a different day, running
in-process, while Arm B will run in a container: **no runtime performance
comparison may be drawn between the arms.**

`trainingDataProductionReviewRequired` remains `true`.

## State at the time of this freeze

No model has been downloaded. No inference has been run. Tesseract has not been
executed. No Brand truth has been read. Production code and application
dependencies are unchanged. PR #195 is untouched, and the PR #214 and PR #215
conclusions are unchanged.
