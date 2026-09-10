#!/usr/bin/env bash
# Issue #149 — Brand ranking-loss diagnosis. Diagnosis only.
set -euo pipefail
npx vite-node --config vitest.config.ts scripts/eval/run-issue-149-brand-ranking-loss-diagnosis.ts
shasum -a 256 artifacts/issue-149-brand-ranking-loss-diagnosis/primary/aggregate.json
shasum -a 256 artifacts/issue-149-brand-ranking-loss-diagnosis/repeat/aggregate.json
