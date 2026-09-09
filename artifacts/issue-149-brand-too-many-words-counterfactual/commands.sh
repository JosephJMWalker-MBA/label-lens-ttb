#!/usr/bin/env bash
# Issue #149 — Brand too-many-words counterfactual. Evaluation-only.
set -euo pipefail

# Gate: production behaviour must be byte-identical before the treatment runs.
npm run eval:production-parity

# Seam guards and extractor regressions.
npx vitest run src/pipeline/extractor/

# The experiment (runs OCR once per case; both arms share the same passes).
npx vite-node --config vitest.config.ts \
  scripts/eval/run-issue-149-brand-too-many-words-counterfactual.ts

# Determinism: run twice, compare byte-for-byte.
shasum -a 256 artifacts/issue-149-brand-too-many-words-counterfactual/primary/aggregate.json
shasum -a 256 artifacts/issue-149-brand-too-many-words-counterfactual/repeat/aggregate.json
