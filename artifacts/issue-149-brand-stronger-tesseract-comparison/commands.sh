#!/usr/bin/env bash
# Evaluation-only. One-variable comparison: the English traineddata variant.
# THIS EXPERIMENT DID NOT RUN. The preregistered compatibility gate fails closed
# because the locked LSTM-only Tesseract WASM cores are integer-only and cannot
# execute the float treatment model. See compatibility/compatibility-report.json.
#
# The treatment model is NOT vendored in this repository. It is retrieved on
# demand, pinned to an upstream commit and verified by size and sha256.
set -euo pipefail

# 1. Retrieve the pinned upstream model into an untracked research-local cache
#    (.local/ocr-research/traineddata/tessdata-best/eng.traineddata).
#    Verifies 15,400,601 bytes and sha256
#    8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba.
#    On any mismatch it deletes the download and exits non-zero. It takes no
#    model or URL argument, so no other file can be substituted.
node scripts/eval/fetch-issue-149-tessdata-best.mjs

# 2. Reproduce the blocker. Expect a fail-closed abort in the compatibility gate,
#    before either arm produces data. No corpus OCR result is emitted.
#    Without step 1 this fails early with STRONGER_TESS_TREATMENT_MODEL_NOT_CACHED.
node --import tsx scripts/eval/run-issue-149-brand-stronger-tesseract-comparison.ts

# 3. Reproduce the compatibility diagnosis on a synthetic image (no corpus data,
#    no Brand truth). Each configuration must run in its own process because
#    tesseract.js caches the loaded core at module scope.
#      arg 1: absolute langPath directory containing eng.traineddata
#      arg 2: legacyCore flag (true forces the float-capable full core)
node artifacts/issue-149-brand-stronger-tesseract-comparison/compatibility/probe-child.mjs \
  "$PWD/src/pipeline/extractor/assets" false
node artifacts/issue-149-brand-stronger-tesseract-comparison/compatibility/probe-child.mjs \
  "$PWD/.local/ocr-research/traineddata/tessdata-best" false

# Running from a git worktree without its own node_modules: point the supported
# operator override at the primary checkout's Tesseract WASM core first.
#   export LABEL_LENS_OCR_CORE_DIR=/path/to/primary/checkout/node_modules/tesseract.js-core

# Verify the retained upstream license text is unmodified.
shasum -a 256 artifacts/issue-149-brand-stronger-tesseract-comparison/vendor/tessdata-best/LICENSE

# Verify the committed artifacts of this package.
shasum -a 256 -c artifacts/issue-149-brand-stronger-tesseract-comparison/artifact-manifest.sha256
