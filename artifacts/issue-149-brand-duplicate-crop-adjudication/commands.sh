#!/usr/bin/env bash
# Evidence and adjudication only. Traces provenance for the duplicate approved
# Brand crop, recomputes every governed Brand crop from current sources, and
# classifies the duplication. Runs no OCR and no traineddata experiment.
set -euo pipefail

# Fails closed before recomputing if:
#   - HEAD is not the frozen base SHA;
#   - preregistration.md no longer matches its frozen sha256;
#   - any prior merged frozen artifact has changed;
#   - any guarded production path (including the PR #195 baseline file) changed.
#
# Recomputed crops are written to recomputed-crops/ and never overwrite the
# committed crops under artifacts/issue-149-brand-otsu-threshold/control/crops,
# which are read-only inputs here. Recomputation is deterministic: rerunning
# reproduces identical bytes.
node --import tsx scripts/eval/run-issue-149-brand-duplicate-crop-adjudication.ts

# Confirm the recompute is deterministic.
shasum -a 256 artifacts/issue-149-brand-duplicate-crop-adjudication/recomputed-crops/*.png

# Confirm the committed crops this package read were not modified.
shasum -a 256 artifacts/issue-149-brand-otsu-threshold/control/crops/*.png

# Verify the committed artifacts of this package.
shasum -a 256 -c artifacts/issue-149-brand-duplicate-crop-adjudication/artifact-manifest.sha256
