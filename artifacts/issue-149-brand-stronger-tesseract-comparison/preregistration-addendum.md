# Preregistration addendum — model storage location

`preregistration.md` is **unchanged and unchanged-able**: it is byte-identical to
the version frozen before OCR, its sha256
`d2e8f7fc4d96f9b8e4565db7be1773c3d2780ead13d517f3e97c5c3dda61f708` is still
asserted by the runner, and nothing in it was rewritten after the outcome was
known. This addendum records one post-hoc change that is deliberately **not**
folded into that document.

## What changed

The preregistration describes the treatment model as living at
`artifacts/issue-149-brand-stronger-tesseract-comparison/vendor/tessdata-best/eng.traineddata`.
That was accurate when the compatibility gate ran: the file was vendored at that
path and the run read it from there.

After the investigation came back blocked, the operator directed that the unused
15.4 MB binary not be retained in Git. The model is now retrieved on demand to an
untracked research-local cache at
`.local/ocr-research/traineddata/tessdata-best/eng.traineddata` by
`scripts/eval/fetch-issue-149-tessdata-best.mjs`.

## What did not change

- The model. Same upstream file, pinned to commit
  `9ddc24e750eec0994223a9edc3fcb434a2244f3b`, same sha256
  `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`, same
  15,400,601 bytes. The retrieval script verifies both and fails closed.
- The design. Control, treatment, the single variable, the held-fixed
  dimensions, the case set, the independence structure, the classification
  scheme, the decision rule, the safety vetoes, and every interpretation
  boundary are exactly as preregistered.
- The outcome. Still blocked, still no comparison data, still no capability
  ceiling prerequisite satisfied. Re-running the runner after the move
  reproduces the identical fail-closed abort.

Only **where the identical bytes are stored** changed.

## Why this is an addendum rather than an edit

Editing a frozen preregistration after seeing an outcome is the exact move these
packages exist to prevent, and "it was only a path" is exactly how that starts.
Even though this change cannot affect any result — there is no result — the
preregistration stays untouched and the change is recorded separately, dated and
attributable, where a reviewer will see it as a post-hoc amendment rather than
discover it as a silent rewrite.

The frozen document therefore contains one stale path. That is the intended
tradeoff: a stale pointer with a visible correction beats a tidy document with an
invisible edit.
