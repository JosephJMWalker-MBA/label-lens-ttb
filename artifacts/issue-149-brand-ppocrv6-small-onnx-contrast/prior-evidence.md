# Prior evidence, preserved

Refs Issue #149. Frozen before any inference in this experiment. Nothing here
reopens, reinterprets or relabels a prior verdict.

## PR #214 — PARSeq-small versus incumbent Tesseract: `REGRESSION`

Merged at `5161a58e02341753a31c2ab889b148b2cecedf81`. On the same six-item
stylized Brand subset, PARSeq-small produced four truth-bearing improvements and
two regressions, but design cluster **D1 regressed**, and the frozen gate requires
that *no* distinct Brand design regress. The verdict was `REGRESSION` and it
authorized nothing.

Two of its findings carry directly into this experiment:

- **The Arm A evidence used here is that experiment's Arm A evidence**, byte for
  byte. tesseract.js 7.0.0 / core 7.0.0, OEM 1, PSM 11, traineddata
  `5dc5d8d640a212c9…`, no DPI flag, consuming the same frozen crop PNGs.
- **The metric and classification definitions used here are that experiment's
  definitions**, transcribed from its runner rather than re-derived, so the two
  benchmarks remain comparable.

Its false-reliable-read result was `NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING`,
not zero. That treatment is preserved here.

## PR #215 — PP-OCRv6-small ONNX compatibility probe: `COMPATIBLE`

Merged at `9372ebbb4f0cd3f4d58023e944c2500f28c8fe7b`, the base of this branch. It
established, and this experiment reuses without repeating:

| Established | Value |
| --- | --- |
| Artifact | `PaddlePaddle/PP-OCRv6_small_rec_onnx` @ `b8f84f0b80c529de40b4fbb3544b84fa7233a513` |
| Model | `inference.onnx`, `5435fd747c9e0efe…`, 21,159,378 B, Apache-2.0 |
| Runtime | ONNX Runtime 1.28.0, `CPUExecutionProvider`, opset 11, IR 6 |
| Graph | input `x` `[dyn,3,48,dyn]`, output `fetch_name_0` `[dyn,dyn,18710]` |
| Vocabulary | 18,710 = 1 blank + 18,708 dictionary entries + 1 appended ASCII space |
| CTC blank | token **0** |
| ASCII space | absent from `character_dict`, **decodable at token 18,709** |
| Preprocessing | BGR, `cv2` INTER_LINEAR, height 48, max width 320, always zero-padded to 320, `(p/255 - 0.5)/0.5` |
| Output | **probabilities, not logits** — row sums 1.0 to within 4e-7 |

**No compatibility probing and no synthetic inference is repeated here.**

### Three PR #215 findings that shape this design

**The graph emits probabilities.** So this experiment's evidence contract names
the tensor `rawProbabilityTensor`, never `logits`, and applies no softmax.
Re-applying one would distort every probability while leaving the transcript
untouched — an error that would surface nowhere in the output.

**ASCII space is decodable.** PR #214's Arm B structurally could not emit a space,
which is why whitespace-free comparison was the only meaningful primary metric
there. Here both arms can emit spaces, so the boundary-preserving comparison
becomes substantively meaningful for the first time. It is reported as a full
secondary comparison — but the **primary** metric stays whitespace-free, to keep
this benchmark comparable with PR #214.

**The sentinel result proves nothing about Brand marks.** PR #215's exact
`BRAND NAME 123` transcript came from 48 pt DejaVu Sans, black on white, rendered
by the same container. Its own `limitations.md` says it clears a floor, not a
ceiling. **This experiment must not be read as confirming that result on real
labels, and a good outcome here would not retrospectively strengthen it.**

## What remains unresolved from both

- Training-data provenance for PP-OCRv6 is unresolved.
  `trainingDataProductionReviewRequired` remains `true`.
- Neither model has a calibrated mapping to Label Lens authority states, and
  neither has a governed abstention mechanism.
- PP-OCRv6 confidence has never been compared with Tesseract confidence on any
  proven-equivalent scale, and this experiment does not attempt it.
