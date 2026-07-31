#!/usr/bin/env bash
# Issue #149 — complete Brand evidence acquisition.
# STAGE 1: planning and preregistration only. Nothing here runs OCR.
set -euo pipefail

ART=artifacts/issue-149-brand-complete-evidence-acquisition

# Verify the merged packages this sprint freezes its population from.
( cd artifacts/issue-149-brand-current-baseline-failure-decomposition \
    && shasum -a 256 -c artifact-manifest.sha256 )
( cd artifacts/issue-149-brand-candidate-construction-filter-decomposition \
    && shasum -a 256 -c artifact-manifest.sha256 )

# Freeze the 115-case population and emit the truth-free input manifest.
# Halts on an unexpected count, a missing case, an image hash or byte-size
# mismatch, a non-included status, or any truth-bearing field in the input.
node scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs

# Verify the frozen preregistration.
( cd "${ART}" && shasum -a 256 -c preregistration.sha256 )

# The incumbent identities this sprint pins.
shasum -a 256 src/pipeline/extractor/assets/eng.traineddata
node -e 'const l=require("./package-lock.json").packages;for(const k of ["node_modules/tesseract.js","node_modules/tesseract.js-core"])console.log(k,l[k].version)'

# The two claims the evidence contract rests on: the caps are in the harness
# projection, and the untruncated debug object is already returned.
sed -n '72p;75p;304p;415p' src/fixtures/eval/eval-harness.ts
sed -n '959,962p' src/fixtures/eval/eval-harness.ts

# --- NOT PART OF STAGE 1 ------------------------------------------------------
# The acquisition runs, the determinism comparison and the post-freeze evaluation
# are added in Stage 2 behind the push-triggered workflow described in
# workflow-plan.md, and run only when the committed mode file reads `execute`.
# No command in this file can start them.
