# Preregistration — PP-OCRv6-small ONNX compatibility and CTC evidence probe

Refs Issue #149. **Evaluation-only compatibility probe.** Frozen after every
discovery gate passed and **before any inference existed**.

Base: `origin/main` `5161a58e02341753a31c2ab889b148b2cecedf81`. Continues PR #215
in place; no new branch and no new pull request.

No production behaviour change. No modification to production source, the
production Dockerfile, application dependencies, fixtures, fixture truth, crop
geometry, preprocessing, parser rules, thresholds or authority logic. PR #195
untouched. The frozen Brand corpus is not accessed by this probe.

## Research question

Can `inference.onnx` at the pinned revision load in a reproducible CPU-only ONNX
Runtime environment, execute offline, emit auditable raw CTC logits and a decoded
transcript, and be deterministic across a primary run and an exact repeat?

**This does not test Brand recognition capability.** It tests loadability,
offline execution, evidence auditability and determinism.

## Selected artifact

| Field | Value |
| --- | --- |
| Repository | `PaddlePaddle/PP-OCRv6_small_rec_onnx` |
| Immutable revision | `b8f84f0b80c529de40b4fbb3544b84fa7233a513` |
| Model file | `inference.onnx` |
| SHA-256 | `5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634` |
| Byte size | 21,159,378 |
| Config file | `inference.yml`, SHA-256 `ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1`, 150,579 bytes |
| Model-artifact licence | Apache-2.0, from the model card frontmatter at the pinned revision |
| Runtime | ONNX Runtime 1.28.0, `CPUExecutionProvider` only |

No Paddle native weight loading. No local `paddle2onnx` conversion. No detector.
`inference.json` is neither loaded nor committed; only its git blob OID is
recorded.

## Discovery gates, all passed before this freeze

| Gate | Result |
| --- | --- |
| Revision still `b8f84f0…` | PASS — re-asserted inside the governed run; the earlier standalone gate record is preserved unmodified at `discovery/revision-gate/` |
| Exact five-file inventory, git OIDs and byte sizes | PASS — 5 files, no extras, none missing |
| Apache-2.0 model card | PASS — frontmatter and API `cardData` agree |
| `inference.yml` hash and byte size | PASS — 150,579 bytes |
| ONNX LFS pointer oid and size, without downloading | PASS — pointer is 133 bytes and names the expected oid |
| Pinned container built, dry session load | PASS — session created, `session.run` never called |
| Full ONNX retrieval and byte verification | PASS — fail-closed script, SHA-256 and byte count both matched |
| Network disabled after retrieval | PASS — every container operation ran `--network=none` |
| Dictionary audit | PASS — see below |

## ONNX graph facts recorded in discovery

| Field | Value |
| --- | --- |
| Opset import | `ai.onnx` version **11** |
| IR version | 6 |
| Graph name | `PaddlePaddle Graph in PIR mode` |
| Input node | **`x`**, `tensor(float)`, shape `[dynamic, 3, 48, dynamic]` |
| Output node | **`fetch_name_0`**, `tensor(float)`, shape `[dynamic, dynamic, 18710]` |
| Provider used | `CPUExecutionProvider` |

## Dictionary and vocabulary — stated as fact, not assumption

Determined during discovery and recorded in `dictionary-audit.json`:

| Field | Value |
| --- | --- |
| `PostProcess.name` | `CTCLabelDecode` |
| `character_dict` length | **18,708** |
| First character | `!` (U+0021) |
| Vocabulary size | **18,710**, from `session.get_outputs()[0].shape[-1]` |
| CTC blank token id | **0** — from `CTCLabelDecode.add_special_char` and `get_ignored_tokens`, not assumed to be `vocabSize - 1` |
| ASCII space in `inference.yml` `character_dict` | **false** |
| ASCII space decodable | **true**, at token id **18,709** |
| `dictSha256` | `42e8a0edc6ce53421aee16ff2c668b42d38a9e32a2b0056ffdcfaaeaf06f1b46` |

**The plan's expectation on the space question was not borne out, and this
preregistration records the measured state rather than the expectation.** §5
correctly records that ASCII space is absent from the `character_dict` — it is —
and correctly instructs the probe to determine the *decodable* vocabulary
empirically. It does: 18,708 dictionary entries plus one CTC blank is 18,709,
while the model's output width is 18,710. PaddleOCR's own decoder accounts for
exactly one further class, a trailing ASCII space, when `use_space_char` is
enabled. The reconciliation is fail-closed: any width other than `len + 1` or
`len + 2` halts the probe as `BLOCKED_DISCOVERY`.

So `asciiSpacePresent` is **true** under the evidence contract's primary reading
("appears as a decodable token") and **false** under its secondary reading
("appears in `PostProcess.character_dict`"). Both are reported. Per §13.2 neither
answer is a compatibility failure.

## Preprocessing specification

Frozen from `PreProcess.transform_ops` in `inference.yml` and from
`resize_norm_img` in `ppocr/data/imaug/rec_img_aug.py` at PaddleOCR commit
`2661c7c0ef5c613e8f93c6e93b2e052399f0f854`. Full detail in `transform-spec.json`.

- **Channel order BGR.** No RGB conversion is applied anywhere in this path.
- Aspect-preserving resize to height **48**, width `min(ceil(48 * w/h), 320)`,
  using `cv2.resize` with **INTER_LINEAR** — the resampler upstream's padding
  branch actually uses.
- Normalization `(pixel / 255 - 0.5) / 0.5`, giving range [-1, 1].
- Zero-padding on the right to width **320**. The tensor width is therefore
  always 320; `paddingColumnsAdded` carries the difference. Padding is zeros in
  *normalized* space, i.e. mid-grey, not black.
- Tensor `[1, 3, 48, 320]`, dtype `float32`.
- Training-only ops (`MultiLabelEncode`, `label_ctc`, `label_gtc`) are excluded.

## Synthetic inputs, frozen before inference

| Image | Content | SHA-256 |
| --- | --- | --- |
| `synthetic/positive.png` | exactly `BRAND NAME 123` | `574d8cc7e2f9f5cdfae8843e964e4edf307d5d1fec52eeb967bb01a479183911` |
| `synthetic/blank.png` | pure white, same dimensions | `26daf63d1830f5af6375d1be855f6ce7a7daba20994a667951d38da0d604fd48` |

Rendered with a real TrueType font, not hand-built glyphs:
`fonts-dejavu-core=2.37-6`, `DejaVuSans.ttf`, SHA-256
`abdc775b21b1bc470d50c97e790d276f2054b7504e56e5bd3e64f48d68582322` — the same
font governance as PR #213. Canvas 640×96, 48 pt, text origin (24, 20), white
background, black foreground, PNG written with `optimize=False, compress_level=9`.
Each image is rendered twice and is not written unless the two renderings are
byte-identical.

## Invocation matrix — exactly four

| Run ID | Image | Type |
| --- | --- | --- |
| `positive-primary` | `BRAND NAME 123` | primary |
| `positive-repeat` | `BRAND NAME 123` | exact repeat |
| `blank-primary` | blank | primary |
| `blank-repeat` | blank | exact repeat |

No fifth invocation, no retry with changed settings, no additional synthetic
image, no alternative model tier, no alternative transform, no alternative
decoder, no beam search, no best-of-N, no language model, no detector.

Decoding is greedy CTC argmax: consecutive-duplicate removal, then removal of
token 0. One session is created per container invocation and shared by all four
runs; `modelLoadMs` is recorded and excluded from per-invocation `latencyMs`.

## Determinism rule

For each image, `outputFingerprint` — the SHA-256 of canonical JSON over
`rawTimestepTokenIds` and `rawTranscript` — **must match** between the primary run
and the repeat. `logitsSha256` is compared as well. **This rule is not relaxed
after results are seen.** A mismatch on either pair is `DETERMINISM_FAILURE` and
analysis halts.

## Confidence handling

`nativeCtcSequenceScore` is the mean, over **non-blank time steps**, of the
argmax probability at that step, and is 0.0 when the transcript is empty. This is
§6.1's frozen definition.

The pinned upstream implementation averages instead over the **selected**
positions — duplicates removed *and* blanks removed. The two differ whenever
adjacent frames repeat a character, so the upstream value is reported alongside as
`upstreamCollapsedMeanScore`. Neither is rescaled.

Whether the exported graph already emits per-timestep probabilities is
**measured** per invocation, not assumed, and recorded as
`modelOutputAlreadyNormalized`; PaddleOCR's decoder takes `argmax` and `max` over
the model output without a softmax, which suggests it does.

Scores from this model must not be compared numerically to PARSeq
`nativeSequenceScore` (product formula, 95-class softmax) or to Tesseract
`rawConfidence` (0–100 scale). `confidenceInterpretationKnown` is **false**. No
threshold may be derived from this probe.

## Output-risk flags

| Flag | Expected | Meaning |
| --- | --- | --- |
| `spaceAbsentFromDictionary` | `true` | ASCII space is absent from `inference.yml`'s `character_dict`. True as measured. |
| `spaceDecodable` | `true` | ASCII space is nonetheless a decodable token, at id 18,709. Recorded because it changes the later benchmark's scoring design. |
| `blankTranscriptEmpty` | `true` | CTC nominal behaviour on a blank image |
| `blankProducedText` | `false` | Reported if the blank transcript is non-empty; not a compatibility failure |
| `modelHasNaturalAbstention` | `false` | An empty transcript is structural, not calibrated abstention |
| `confidenceInterpretationKnown` | `false` | No calibration exists |
| `trainingDataProductionReviewRequired` | `true` | Standing rule; provenance unresolved |

## Compatibility verdict criteria

**`COMPATIBLE`** requires all of:

- all four invocations complete without subprocess error;
- raw logits are finite;
- fingerprints match within each pair (`positive-primary` = `positive-repeat`;
  `blank-primary` = `blank-repeat`);
- safe loading confirmed — ONNX Runtime, no pickle;
- the dictionary audit is complete and `dictionaryAudit.asciiSpacePresent` is
  recorded;
- peak RSS ≤ 700 MB;
- per-invocation latency ≤ 60 s.

**`INCOMPATIBLE`** on any of: subprocess crash or timeout; non-finite logits;
fingerprint mismatch on either repeat pair; ONNX SHA-256 mismatch.

**`BLOCKED_MODEL_LICENSE`** if Apache-2.0 is not confirmed at the pinned revision.

**`BLOCKED_DISCOVERY`** if any required file, its SHA-256 or byte size, or the
immutable revision SHA cannot be established exactly from the authoritative
repository.

**An exact positive transcript is NOT required for `COMPATIBLE`.** Neither space
outcome, and a non-empty blank transcript, are compatibility failures; each is an
output-risk result.

## Interpretation boundaries

A `COMPATIBLE` verdict authorises exactly one thing: a **separately
preregistered** frozen-crop benchmark against Tesseract.js on the six OCR items,
four crop clusters and three Brand designs of PR #214.

It does not authorise production integration, shadow deployment, authority-state
changes, engine replacement, expanded corpus access, installing Python in
production, or any threshold change. It makes no claim of better Brand
recognition, lower CER, fewer false reliable reads, production suitability, or
acceptable Render latency.

## Transport

Push-triggered workflow scoped to this research branch, with committed modes
`discover`, `execute` and `complete`, and a path filter admitting only the
workflow file and the mode file. Inference runs only when the mode is exactly
`execute`. After results are committed the mode becomes `complete` and a seal run
must skip inference. No `pull_request_target`, no unscoped branch trigger.
