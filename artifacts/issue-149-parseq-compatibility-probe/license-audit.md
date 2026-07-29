# License audit — PARSeq code and the `parseq-bb5792a6.pt` checkpoint

Refs Issue #149. Performed **before** any retrieval attempt, as the preregistered
gate requires. Outcome: **`BLOCKED_MODEL_LICENSE`**. The checkpoint was not
downloaded.

## What the gate required

1. Record the official repository license.
2. Record the official model-card license.
3. Establish that **the exact selected checkpoint** is covered by an Apache-2.0
   grant or another acceptable explicit license.
4. Record required NOTICE or attribution material.
5. Record the exact source URL and release.
6. **Do not infer checkpoint licensing solely from the presence of a repository
   LICENSE file.**

## 1. Repository license — established

At pinned commit `1902db043c029a7e03a3818c616c06600af574be`, the repository root
contains `LICENSE`: the Apache License, Version 2.0 (202 lines).

The complete set of licence-bearing files in the pinned tree, enumerated
recursively, is exactly four:

| Path | Licence |
| --- | --- |
| `LICENSE` | Apache-2.0 |
| `NOTICE` | attribution, not a grant |
| `strhub/models/abinet/LICENSE` | BSD (component) |
| `strhub/models/crnn/LICENSE` | MIT (component) |

There is **no** `MODEL_CARD.md`, no `model_card.md`, and no
`strhub/models/parseq/LICENSE`.

## 2. The repository's own licence sentence is scoped to code

The README states, in the Getting Started section, that the
"Majority of the code is licensed under the Apache License v2.0" (baudm/parseq
README), continuing that the ABINet and CRNN sources are under BSD and MIT
respectively.

That sentence is about **code**. It makes no statement about the released
weights. Grepping the pinned `README.md`, `Datasets.md`, `hubconf.py` and
`NOTICE` for any weights-licensing statement returns **nothing**.

## 3. NOTICE / attribution material — recorded

`NOTICE` declares "Scene Text Recognition Model Hub, Copyright 2022 Darwin
Bautista" and then attributes the initial developers of the bundled `abinet`,
`crnn`, `trba` and `vitstr` components (USTC; Jieru Mei; NAVER Corp.; Rowel
Atienza). It is attribution material, not a licence grant, and it covers code
components rather than trained weights.

Any downstream redistribution of the code would need to carry this NOTICE.

## 4. The release itself is silent on licensing

GitHub release `v1.0.0`, titled "Pretrained Weights", carries a body that names
the training datasets — COCO, RCTW17, Uber, ArT, LSVT, MLT19, ReCTS, TextOCR and
OpenVINO — and two notes about `parseq-tiny` and the patch16-224 variant.

It contains **no licence statement of any kind**, and the release assets are seven
`.pt` files with no accompanying LICENSE asset.

## 5. Model-card licences — recorded, but they cover different artifacts

The author's Hugging Face namespace contains model repositories whose card
front-matter declares `license: apache-2.0`:

| HF repository | Card licence | Files |
| --- | --- | --- |
| `baudm/parseq-small` | apache-2.0 | `pytorch_model.bin`, `torchscript_model.bin` |
| `baudm/parseq-tiny` | apache-2.0 | `pytorch_model.bin`, `torchscript_model.bin` |
| `baudm/parseq-small-patch16-224` | apache-2.0 | — |
| `baudm/abinet-lv`, `trba`, `crnn`, `vitstr-small`, `vitstr-small-patch16-224` | apache-2.0 | — |

These are genuine, explicit licence declarations attached to repositories whose
content **is** model weights, by the author, in the author's own namespace. That
is materially stronger evidence than a bare code LICENSE file.

**But none of them is the selected artifact.** There is no
`baudm/parseq` model repository. The selected checkpoint is the GitHub release
asset `parseq-bb5792a6.pt`; the licensed HF artifacts are `pytorch_model.bin` and
`torchscript_model.bin` under a differently named repository.

## 6. Why the chain does not close

To treat the HF Apache-2.0 declaration as covering `parseq-bb5792a6.pt`, the audit
would have to bridge three naming systems and a format change:

1. GitHub `hubconf.parseq` — documented in the pinned source as the PARSeq
   **base** model, `img_size=128x32`, `patch_size=8x4`, `d_model=384`;
2. the paper's **PARSeq-S**, which is the `d_model=384` configuration;
3. Hugging Face **`parseq-small`**, whose card carries the grant;
4. and a different container format and filename
   (`parseq-bb5792a6.pt` versus `pytorch_model.bin`).

Each step is plausible. Together they are an **inference**, and byte- or
weight-identity between the GitHub asset and the HF artifact cannot be confirmed
without downloading the HF checkpoint — which this probe is explicitly forbidden
from substituting, and which would not establish identity anyway given the format
difference.

The gate's standard is that the licence be "tied **responsibly** to the exact
model artifact". A probable-intent chain across three naming systems does not meet
it. The most likely reality is that the author intends Apache-2.0 for everything
they publish; "most likely intends" is not an explicit grant.

## 7. A separate, independent concern worth recording

The release body names the training corpora: COCO, RCTW17, Uber, ArT, LSVT,
MLT19, ReCTS, TextOCR, OpenVINO. Several datasets in that family are distributed
under research-only or non-commercial terms.

An Apache-2.0 grant on the weights, even if established, would not by itself
resolve whether weights trained on research-only corpora may be used in a
**regulatory compliance product**. That question is upstream of this probe and is
not answered here, but it is flagged because this repository's purpose makes it
material rather than academic.

## Conclusion

**`BLOCKED_MODEL_LICENSE`.** The checkpoint was not retrieved.

- Code licensing: **established** — Apache-2.0 with NOTICE, plus BSD and MIT
  components.
- Checkpoint licensing: **not established for the exact selected artifact.**

## What would unblock this

Any one of the following, in decreasing order of strength:

1. An explicit statement from the author that the `v1.0.0` release assets are
   released under Apache-2.0 — for example in the release notes, the README, or a
   `MODEL_CARD` in the repository.
2. Publication of the selected checkpoint under a model card that names
   `parseq-bb5792a6.pt` directly.
3. A documented owner decision to accept `baudm/parseq-small`'s Apache-2.0 card as
   covering the GitHub `parseq` base weights, recorded as an explicit,
   attributable risk acceptance rather than an inference by the implementer.
4. Switching the probe's selected artifact to the Hugging Face
   `baudm/parseq-small` checkpoint, which does carry a card-level grant — but this
   probe forbids that substitution, so it would require a new preregistration.
