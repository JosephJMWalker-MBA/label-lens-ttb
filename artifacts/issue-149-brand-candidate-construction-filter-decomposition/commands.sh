#!/usr/bin/env bash
# Issue #149 — Brand candidate-construction filter decomposition.
# READ-ONLY, ZERO-OCR, EVALUATION-ONLY. Runs no recognizer and changes nothing.
set -euo pipefail

ART=artifacts/issue-149-brand-candidate-construction-filter-decomposition

# Verify the merged PR #217 package the population is frozen from.
( cd artifacts/issue-149-brand-current-baseline-failure-decomposition \
    && shasum -a 256 -c artifact-manifest.sha256 )

# Reproduce the decomposition. Halts if the frozen population is not exactly 44,
# if the corpus is not exactly 115, or if a frozen case is missing from the
# underlying evidence.
node scripts/eval/issue-149-brand-filter-decomposition.mjs

# Verify this package.
shasum -a 256 -c "${ART}/artifact-manifest.sha256"

# The claim that truthReachedCandidate is computed over KEPT candidates only,
# which is why it is not used as a formation signal.
sed -n '332p' src/fixtures/eval/eval-harness.ts
