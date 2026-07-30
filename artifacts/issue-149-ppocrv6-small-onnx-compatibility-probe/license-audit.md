# Licence audit — PP-OCRv6_small_rec_onnx @ b8f84f0…

Evaluation-only probe. The licence gate is a **hard gate**: if Apache-2.0 is not
confirmed at the pinned revision, the verdict is `BLOCKED_MODEL_LICENSE` and no
inference runs.

## Result: PASS — Apache-2.0

The model-artifact licence is **Apache-2.0**, confirmed from two independent
sources at the pinned immutable revision
`b8f84f0b80c529de40b4fbb3544b84fa7233a513`:

| Source | Value |
| --- | --- |
| `README.md` YAML frontmatter, line 2 | `license: apache-2.0` |
| Hugging Face API `cardData.license` | `apache-2.0` |

The model card also carries an Apache-2.0 badge. The verbatim model card is
retained at `vendor/model-card-README.md`, so the claim can be re-checked without
network access.

The licence is tied to **this exact artifact** — the ONNX repository at this
revision — not inferred from a sibling repository, a paper, or the presence of a
`LICENSE` file. That distinction is the reason the earlier PARSeq GitHub-Release
probe was recorded as `BLOCKED_MODEL_LICENSE` in PR #212.

## CC BY 4.0 does not apply here

An earlier draft of the selection plan recorded the licence as CC BY 4.0. It is
not. CC BY 4.0 covers the PP-OCRv6 technical report (arXiv:2606.13108); it does
not appear anywhere in this ONNX artifact's model card. The plan itself corrects
this in §2, and the correction is confirmed above.

## No LICENSE and no NOTICE file in the model repository

The repository contains exactly five files at the pinned revision:
`.gitattributes`, `README.md`, `inference.json`, `inference.onnx`,
`inference.yml`. There is **no `LICENSE` file and no `NOTICE` file**, even though
the model card's badge links to `./LICENSE`. That absence is verified by the
five-file inventory gate and recorded in `file-inventory.json`.

Attribution under Apache-2.0 therefore references the PaddleOCR main
repository's licence, retained verbatim at
`vendor-license/LICENSE-Apache-2.0.txt` from the pinned PaddleOCR commit. Whether
PaddleOCR itself carries a `NOTICE` file at that commit is recorded in
`code-provenance.json`; if it does, it is retained at
`vendor-license/NOTICE-PaddleOCR.txt`.

## What this audit does not clear

- **Training-data provenance is unresolved.** See
  `training-data-provenance.md`. `trainingDataProductionReviewRequired` stays
  `true`.
- **No production licensing clearance.** Apache-2.0 permits the evaluation use
  in this probe. Production deployment is a separate decision that this audit
  does not make and this probe does not request.
