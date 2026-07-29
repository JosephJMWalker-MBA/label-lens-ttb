# Candidate selection corrections — verified upstream identities

Refs Issue #149. Evaluation-only. All values below were verified against the
GitHub API before any retrieval was attempted.

## Corrected release-tag commit

The previously reported release-tag commit was **wrong**.

| Field | Value | Status |
| --- | --- | --- |
| Incorrect previously reported commit | `315d19b88931758c5c36395b086e115049386d49` | **refuted** |
| Actual `v1.0.0` tag target | `315d19be8ef473a864950ab497a649a69e37c6a4` | **verified** |

Verified by resolving `git/ref/tags/v1.0.0` on `baudm/parseq`: the tag is a
lightweight ref pointing directly at commit
`315d19be8ef473a864950ab497a649a69e37c6a4`. The corrected value supplied for this
probe is the correct one.

## Verified pinned code revision

| Field | Value |
| --- | --- |
| Repository | `baudm/parseq` |
| Pinned commit | `1902db043c029a7e03a3818c616c06600af574be` |
| Commit date | 2024-04-24T15:32:34Z |
| Subject | Added PaddleOCR integration info |

The maintained pinned revision is used rather than floating `main`.

## Verified release asset

| Field | Value |
| --- | --- |
| Release | `v1.0.0` ("Pretrained Weights") |
| Asset | `parseq-bb5792a6.pt` |
| Published size | 95,392,675 bytes |
| URL | `https://github.com/baudm/parseq/releases/download/v1.0.0/parseq-bb5792a6.pt` |

The size is taken from the release metadata. **The asset was not downloaded**, so
no SHA-256 is recorded — see `decision.json`.

## Model identifier, verified from `hubconf.py`

`hubconf.parseq` is documented in the pinned source as the PARSeq **base** model,
`img_size=128x32`, `patch_size=8x4`, `d_model=384`. This matters for the licensing
audit: the official Hugging Face model repositories are named `parseq-small`,
`parseq-tiny` and `parseq-small-patch16-224`, and **no repository named plainly
`parseq` exists** in the author's Hugging Face namespace.

## Naming systems do not line up

Three different naming systems are in play for what may or may not be the same
trained weights:

- GitHub `hubconf.py`: `parseq` — "base" model, `d_model=384`
- GitHub release asset: `parseq-bb5792a6.pt`
- Hugging Face: `baudm/parseq-small`, files `pytorch_model.bin` and
  `torchscript_model.bin`

The paper's PARSeq-S is the `d_model=384` configuration, so these are *probably*
the same trained model. "Probably the same" is the reason the licensing gate
returned a blocker rather than a pass.
