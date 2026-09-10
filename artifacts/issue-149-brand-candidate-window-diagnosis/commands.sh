#!/usr/bin/env bash
# Issue #149 — Brand candidate-window diagnosis. Evaluation-only, read-only.
set -euo pipefail
npx vite-node --config vitest.config.ts \
  scripts/eval/run-issue-149-brand-candidate-window-diagnosis.ts
# Determinism: run twice, compare byte-for-byte.
shasum -a 256 artifacts/issue-149-brand-candidate-window-diagnosis/primary/aggregate.json
shasum -a 256 artifacts/issue-149-brand-candidate-window-diagnosis/repeat/aggregate.json
