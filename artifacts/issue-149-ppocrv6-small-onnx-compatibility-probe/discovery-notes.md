# Discovery notes — PP-OCRv6-small ONNX compatibility probe

Evaluation-only. Records how the plan's §17 Phase 0 discovery gates were carried
out, including every point where the plan left a value open and an engineering
choice had to be made. Choices made here are labelled as such; they are **not**
attributed to the plan.

## Gate order, and one necessary resolution

§17 Phase 0 lists the steps in this order:

1. revision SHA still `b8f84f0…`
2. exact five-file inventory
3. Apache-2.0 model card
4. `inference.yml` hash, size, preprocessing and dictionary
5. ONNX LFS pointer metadata, without downloading the file
6. pinned ONNX Runtime CPU container, plus a **dry session load**
7. full `inference.onnx` retrieval and byte verification
8. network disabled for all remaining container operations
9. `dictionary-audit.json`

Steps 6 and 7 cannot run in the listed order: a session cannot be created for a
file that has not been downloaded. The resolution is:

- **6a** build the pinned container (no model needed),
- **7** retrieve `inference.onnx` and verify its SHA-256 and byte count fail-closed,
- **6b** perform the dry session load, `--network=none`, on the verified bytes,
- **8** every container operation after retrieval runs with `--network=none`,
- **9** the dictionary audit runs in the same offline container as 6b.

Nothing is skipped and no gate is weakened: the integrity gate still runs before
any session exists, and the session is created only from bytes that already
matched the pinned hash. `session.run` is not called during the dry load, and the
script records `sessionRunCalled: false`.

## Where the plan left a value open

| Value | Plan status | Choice made during discovery |
| --- | --- | --- |
| `onnxruntime` version | "to be pinned during discovery; must be ≥ 1.16.0" | `onnxruntime==1.28.0`, CPU wheel |
| Container base | not specified | `python:3.11-slim-bookworm@sha256:b18992999dbe…`, reused from the PARSeq probe so no new base is introduced |
| Resize implementation | "OpenCV or PIL in BGR mode" (Phase 2); "Pillow" named in the container step | Both installed. **cv2.resize with INTER_LINEAR** performs the resize, because that is what the pinned upstream `resize_norm_img` calls; Pillow renders the sentinel. Pillow's bilinear filter is area-weighted on downscale and would not reproduce upstream. |
| Opset reader | "record the ONNX opset version" | `onnx==1.22.0`, discovery-only, to read `opset_import` |
| Other pins | not specified | `numpy==2.4.6`, `pillow==12.3.0`, `pyyaml==6.0.3`, `opencv-python-headless==4.14.0.94` |
| PaddleOCR commit for the preprocessing and postprocessor confirmation | files named, commit not named | `2661c7c0ef5c613e8f93c6e93b2e052399f0f854` |
| Sentinel canvas and point size | "a point size that produces a legible single-line image", parameters to be recorded | 640×96 canvas, 48 pt, origin (24, 20). 640/96 == 320/48, so the model's resize is an exact 2× downscale: no distortion, no padding. |

## Preprocessing, confirmed from pinned source

§4 marks the normalization formula as INFERENCE-level and requires confirmation
from `ppocr/data/imaug/rec_img_aug.py`. Confirmed at the pinned commit:

`RecResizeImg.__call__` selects `resize_norm_img(img, image_shape, padding=True)`
because `inference.yml` sets neither `infer_mode` nor `eval_mode`. That function:

- `ratio = w / h`; `resized_w = 320 if ceil(48 * ratio) > 320 else ceil(48 * ratio)`
- `cv2.resize(img, (resized_w, 48))` — **INTER_LINEAR**, since the `interpolation`
  argument is only threaded through the non-padding branch
- `float32`, `transpose(2,0,1) / 255`, `-= 0.5`, `/= 0.5` → range [-1, 1]
- `padding_im = np.zeros((3, 48, 320), float32)`; the resized image is copied into
  the left edge

Two consequences worth stating, because §4 marked both as implementation-dependent:

- the tensor width is **always 320**, not the resized width, so
  `modelInputWidth` is 320 and `paddingColumnsAdded` carries the difference;
- padding is **zeros in normalized space**, which is mid-grey (127.5) in pixel
  space, not black.

`DecodeImage` declares `img_mode: BGR`, `channel_first: false`. `cv2.imdecode`
returns BGR HWC directly, so **no RGB conversion happens anywhere** in this path.

## CTC decoding, confirmed from pinned source

From `ppocr/postprocess/rec_postprocess.py` at the same commit:

- `CTCLabelDecode.add_special_char` → `dict_character = ["blank"] + dict_character`,
  so the **blank is token 0**, not `vocabSize - 1`.
- `BaseRecLabelDecode.get_ignored_tokens` → `[0]`, confirming the same.
- `BaseRecLabelDecode.__init__` → `if use_space_char: character_str.append(" ")`,
  i.e. a space, when enabled, is appended **after** the dictionary and therefore
  lands at the final index.
- `CTCLabelDecode.__call__` takes `preds.argmax(axis=2)` and `preds.max(axis=2)`
  **without applying softmax**, which implies the exported graph already emits
  per-timestep probabilities. The probe measures this rather than assuming it and
  records `modelOutputAlreadyNormalized`.

### One discrepancy, recorded rather than smoothed over

§6.1 defines the sequence confidence as the mean over **non-blank time steps**.
The pinned upstream implementation averages over the **selected** positions —
consecutive duplicates removed *and* blanks removed. The two differ whenever
adjacent frames repeat a character. The frozen §6.1 definition is what
`nativeCtcSequenceScore` carries; the upstream-implementation value is reported
beside it as `upstreamCollapsedMeanScore`. Neither is rescaled, and neither is
comparable to PARSeq or Tesseract confidence.

## The space question

§5 records, as a fact, that ASCII space is absent from
`PostProcess.character_dict` — the first entry is `!` (0x21). That is confirmed:
the dictionary has **18,708 entries** and no space among them.

§5 also states the CTC output width is **18,710** (from the PIR weight shape
`linear_8.b_0: [18710]`) and instructs the probe to determine the decodable
vocabulary empirically. 18,708 + 1 blank = 18,709, which leaves one class
unexplained; PaddleOCR's own decoder construction accounts for exactly one more
when `use_space_char` is enabled. The audit therefore reconciles the model's
measured output width against the dictionary length and fails closed unless the
width is `len + 1` or `len + 2`. The outcome is recorded in
`dictionary-audit.json`, and §13.2 makes either answer a valid, non-failing
result.

Because §11 documents `asciiSpacePresent` two ways — "appears as a decodable
token" and "determined by inspecting `PostProcess.character_dict`" — and the two
readings diverge for this artifact, the audit reports **both**:
`asciiSpacePresent` carries the decodable-token reading, and
`asciiSpaceInInferenceYmlDict` carries the dictionary reading.

## Not done

No Paddle native weights, no local `paddle2onnx` conversion, no detector, no
access to the frozen Brand corpus, no fixture truth, no production source or
dependency change, and `inference.json` is neither committed nor loaded — only its
git blob OID is recorded.
