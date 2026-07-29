# License and provenance notes — tessdata_best English model (not vendored)

## What is and is not in this repository

The upstream `tessdata_best` English model was **inspected** during this blocked
investigation. It is **intentionally not retained in Git**: no experiment
consumed it, and a 15.4 MB binary should not sit in history for a comparison
that produced no result.

What is retained:

- the upstream license text, at `vendor/tessdata-best/LICENSE`;
- the exact pinned upstream URL, sha256, and byte size;
- the component-level analysis of the model, in `traineddata-provenance.json`;
- a deterministic retrieval script that reproduces the identical bytes on demand.

The model is fetched to an **untracked, research-local** cache at
`.local/ocr-research/traineddata/tessdata-best/eng.traineddata`, which is
outside `src/`, outside the fixture tree, and covered by the existing `.local/`
gitignore rule. It is **not** a production asset, is never loaded by production
code, and does not change the model production uses. Production continues to
load the existing vendored model at
`src/pipeline/extractor/assets/eng.traineddata`, which this package does not
touch.

## Source

| Field | Value |
| --- | --- |
| Upstream project | Tesseract OCR (`tesseract-ocr`) |
| Repository | `https://github.com/tesseract-ocr/tessdata_best` |
| Pinned commit | `9ddc24e750eec0994223a9edc3fcb434a2244f3b` |
| File | `eng.traineddata` |
| Pinned URL | `https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/9ddc24e750eec0994223a9edc3fcb434a2244f3b/eng.traineddata` |
| Retrieved | 2026-07-28 |
| Size | 15,400,601 bytes |
| sha256 | `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba` |
| Retained in Git | **No** — retrieved on demand |
| Retrieval script | `scripts/eval/fetch-issue-149-tessdata-best.mjs` |

The upstream license text was retrieved from the same repository and **is**
retained here, even though the model itself is not:

| Field | Value |
| --- | --- |
| File | `vendor/tessdata-best/LICENSE` |
| Source | `https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main/LICENSE` |
| License | Apache License 2.0 |
| sha256 | `a6cba85bc92e0cff7a450b1d873c0eaa2e9fc96bf472df0247a26bec77bf3ff9` |

## License position

The `tessdata_best` repository is distributed under the **Apache License 2.0**,
the same license family already relied on for the Tesseract runtime. Apache-2.0
permits redistribution of unmodified copies provided the license text travels
with the work. Because the model itself is **not** redistributed here, the
question is narrower: what is retained is the license text plus a pointer, which
raises no redistribution question at all. The license text is committed
**unmodified**, byte-for-byte as retrieved, and its sha256 is recorded above and
in `traineddata-provenance.json`.

Anyone who runs the retrieval script obtains the model directly from upstream
under upstream's own terms. The script verifies byte size and full sha256 and
**deletes the download and exits non-zero on any mismatch**, so a substituted or
corrupted file cannot be silently used.

No claim is made about the licensing of the *training data* behind the model
beyond what upstream states. This repository makes no new license claim.

## Relationship to the repository's offline posture

`docs/slice-3-acceptance.md` records that the Tesseract English model is
**vendored** and loaded from disk, with **no runtime model download** and no
outbound OCR or API call. That posture is unchanged: it describes the
**production** pipeline, which still loads its vendored model from disk and
still downloads nothing.

The retrieval script here is a **developer-invoked research step**, not a runtime
path. Production never calls it, and no product code path can reach it.

When the model is present in the local cache, the experiment reaches it through
the **existing supported operator override** `LABEL_LENS_OCR_ASSET_DIR`, which
`resolveLangPath()` already honours. No production source file was modified to
make this experiment possible.

## Retrieval was explicitly authorized

This download was not performed on the agent's own initiative. The absence of any
stronger in-repository Tesseract configuration was reported as a blocker first —
including the finding that OEM 0 and OEM 2 are impossible against the current
model, which carries no legacy components — and the operator authorized
retrieving and vendoring `tessdata_best` under a research-only path with license
and provenance notes before anything was fetched.

After the investigation came back blocked, the operator further directed that the
unused binary **not** be retained in Git, and that exact retrieval be made
reproducible instead. That is what this package now does.

## Scope limit

Retrieving this model authorizes nothing beyond the single preregistered
comparison in this package, which **did not run**. It does not authorize changing the production model,
enabling it by default, sweeping models or languages, or replacing Tesseract.
