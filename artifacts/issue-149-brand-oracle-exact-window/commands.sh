#!/usr/bin/env bash
# Issue #149 — oracle exact-window counterfactual. Evaluation-only, not deployable.
set -euo pipefail
npm run eval:production-parity                                  # default-path parity gate
npx vitest run src/pipeline/extractor/                          # seam guards + sham control
npx vite-node --config vitest.config.ts \
  scripts/eval/run-issue-149-brand-oracle-exact-window.ts       # both arms
shasum -a 256 artifacts/issue-149-brand-oracle-exact-window/primary/aggregate.json
shasum -a 256 artifacts/issue-149-brand-oracle-exact-window/repeat/aggregate.json
