# Attribution — PP-OCRv6 small recognition, ONNX export

Retained to satisfy the attribution obligation of the Apache License, Version 2.0
for an evaluation-only research probe.

## Artifact

| Field | Value |
| --- | --- |
| Model | PP-OCRv6 small recognition (`PP-OCRv6_small_rec`) |
| Distribution | Official ONNX export |
| Hugging Face repository | `PaddlePaddle/PP-OCRv6_small_rec_onnx` |
| Repository URL | https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx |
| Immutable revision | `b8f84f0b80c529de40b4fbb3544b84fa7233a513` |
| File used | `inference.onnx` |
| SHA-256 | `5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634` |
| Byte size | 21,159,378 |
| Licence | Apache-2.0, from the model card frontmatter at the pinned revision |

## Upstream project

PaddleOCR, by the PaddlePaddle authors — https://github.com/PaddlePaddle/PaddleOCR

Licensed under the Apache License, Version 2.0. The full licence text is retained
beside this file as `LICENSE-Apache-2.0.txt`, taken from the pinned PaddleOCR
commit recorded in `../code-provenance.json`.

The ONNX model repository itself carries **no** `LICENSE` and **no** `NOTICE`
file at the pinned revision, so this attribution references the PaddleOCR main
repository. See `../license-audit.md`.

## Technical report

PP-OCRv6: arXiv:2606.13108. The report is separately licensed and is cited here
for identification only; the licence on the weights is Apache-2.0 as recorded
above.

## Nature of the use

Evaluation only. The model was loaded with ONNX Runtime on CPU inside a research
container with the network disabled, run against two synthetic images generated in
that same container, and never integrated into the application. No weights are
committed to this repository — retrieval is performed by a fail-closed script that
verifies the SHA-256 and byte size on every invocation.

No modification was made to the model. No derived weights were produced.
