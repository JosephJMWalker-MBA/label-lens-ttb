# License audit — explicitly licensed PARSeq-small model artifact

Refs Issue #149. Performed **before** retrieval. Outcome: **license established**;
the provenance gate passed and retrieval was authorized.

This audit concerns a **new candidate artifact**. It does not revisit, reopen, or
reinterpret the blocked GitHub Release artifact from PR #212.

## The six gate items, each verified

| # | Requirement | Result |
| --- | --- | --- |
| 1 | The immutable Hugging Face model commit exists | **PASS** — `a1526c3d63740e460153987f9aaf6b86aa199dc1`, dated 2022-08-28T18:35:24Z |
| 2 | Its `README.md` contains `license: apache-2.0` | **PASS** — present in the card front-matter at that exact revision; the API `cardData` also reports `"license":"apache-2.0"` |
| 3 | The card describes PARSeq small v1.0 and intended STR use | **PASS** — "PARSeq small v1.0", image size 128x32, patch size 8x4, Latin STR, 62 case-sensitive alphanumeric + 32 punctuation |
| 4 | The `pytorch_model.bin` LFS pointer records the expected complete SHA-256 and byte size | **PASS** — pointer at the pinned revision reads `oid sha256:bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00` and `size 95392675`, matching the expected values exactly |
| 5 | Card and weights were introduced in the same attributable commit | **PASS** — see below |
| 6 | Apache-2.0 and NOTICE material retained in the research package | **PASS** — see below |

## Item 5, checked precisely rather than assumed

The model repository has exactly two commits:

| Commit | Date | Title | Files present |
| --- | --- | --- | --- |
| `3c59be4cb0870048c5739478df2275c4d02f6f87` | 2022-08-28T18:31:18Z | initial commit | `.gitattributes` only |
| `a1526c3d63740e460153987f9aaf6b86aa199dc1` | 2022-08-28T18:35:24Z | Initial commit of weights | `.gitattributes`, `README.md`, `pytorch_model.bin`, `torchscript_model.bin` |

`README.md` and `pytorch_model.bin` both return HTTP 404 at the earlier commit and
both exist at the pinned commit. The licence-bearing card and the weights were
therefore introduced **together, in one attributable commit** — the requirement is
met literally, not merely in spirit.

## Item 6 — retained material

Held in `vendor-license/` so the grant travels with this package:

| File | sha256 |
| --- | --- |
| `LICENSE-Apache-2.0.txt` (from the code repo at the pinned code commit) | `cfc7749b96f63bd3…` |
| `NOTICE.txt` (upstream attribution) | `0b0a09b6a5321a43…` |
| `MODEL-CARD-parseq-small.md` (at the pinned model revision) | `9159b955256b8b55…` |
| `pytorch_model.bin.lfs-pointer.txt` (the pointer proving hash and size) | `260adab9bd214da2…` |

The `NOTICE` attributes the Scene Text Recognition Model Hub to Darwin Bautista
and names the initial developers of the bundled ABINet, CRNN, TRBA and ViTSTR
components (USTC; Jieru Mei; NAVER Corp.; Rowel Atienza).

## Licence conclusion

The **selected Hugging Face artifact** —
`baudm/parseq-small@a1526c3d…/pytorch_model.bin` — is covered by an **explicit
Apache-2.0 grant** declared on the model card in the same commit that introduced
the weights, in the author's own namespace, with the artifact's full SHA-256 and
byte size independently attested by the LFS pointer.

This is a licence for **this artifact**. It is deliberately **not** extended to the
separate GitHub Release file `parseq-bb5792a6.pt`, whose licensing PR #212 found
could not be responsibly established. That conclusion stands unchanged.

## Supportive provenance, explicitly not the licence basis

The expected SHA-256 begins `bb5792a6`, matching the short hash embedded in the
GitHub Release filename, and the byte sizes are identical at 95,392,675.

That is **recorded as supportive provenance only**. It is not the licence basis, it
is not an experimental dependency, and **no claim is made here that the two files
are byte-identical**. Establishing that would require an authorized post-retrieval
comparison, which this probe does not perform.

## Training-data provenance — separate, unresolved

Recorded in full in `training-data-provenance.md`. In short: the card states the
model was pre-trained on various real STR datasets, some of which may carry
restrictions relevant to eventual commercial deployment. This probe does **not**
resolve that, and no production promotion may rely on this compatibility PR alone.

Unresolved training-data provenance is **not** treated as a reason to erase or
discount the explicit model-artifact licence. The two questions are separate, and
both are recorded as such.
