#!/usr/bin/env bash
# Evaluation-only. Runs the frozen PSM 7 versus bounded Brand control comparison
# on the five frozen SEGMENTATION_SUSPECTED cases. Changes no production
# behavior, sweeps no modes, and produces no labels.
set -euo pipefail

# The runner fails closed unless, before any OCR:
#   - preregistration.md matches its frozen sha256;
#   - the guarded production paths (including the PR #195 baseline file) are
#     unchanged;
#   - the evaluation modules it depends on are unchanged;
#   - psm is the only differing configuration variable;
#   - the five frozen crops hash distinctly and match their frozen values.
# It also re-hashes the crop bytes handed to OCR in every run and arm.
node --import tsx scripts/eval/run-issue-149-brand-psm7-segmentation-attribution.ts

# Running from a git worktree without its own node_modules: point the supported
# operator override at the primary checkout's Tesseract WASM core first. The
# vendored eng.traineddata always resolves from the working tree.
#
#   export LABEL_LENS_OCR_CORE_DIR=/path/to/primary/checkout/node_modules/tesseract.js-core
#   node --import tsx scripts/eval/run-issue-149-brand-psm7-segmentation-attribution.ts

# Verify the committed artifacts.
shasum -a 256 -c artifacts/issue-149-brand-psm7-segmentation-attribution/artifact-manifest.sha256
