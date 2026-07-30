#!/usr/bin/env bash
# Issue #149 — Brand baseline failure decomposition.
# DIAGNOSTIC AND EVALUATION-ONLY. Runs no OCR and changes no production code.
set -euo pipefail

ART=artifacts/issue-149-brand-current-baseline-failure-decomposition

# Reproduce the whole analysis from committed artifacts. The script fails closed
# if the corpus counts move, if a case is absent from the governed manifest, or
# if the evidence artifact does not carry the fields the attribution needs.
node scripts/eval/issue-149-brand-baseline-failure-decomposition.mjs

# Verify the committed manifest.
shasum -a 256 -c "${ART}/artifact-manifest.sha256"

# Re-check the two staleness claims the preflight rests on. Both must print
# nothing: the governed truth and the governed normalization are unchanged
# between the evidence base and this sprint's base.
git diff a9fe943a7293230af88d857104f4e6e2aa74ae02..7c34ef2a5f94cd3736599fdfca39c38928094729 \
  -- src/fixtures/eval/eval-manifest.json src/fixtures/eval/metrics.ts
