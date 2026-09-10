#!/usr/bin/env bash
set -euo pipefail
npx vite-node --config vitest.config.ts scripts/eval/run-issue-149-brand-ranking-stage-counterfactuals.ts
shasum -a 256 artifacts/issue-149-brand-ranking-stage-counterfactuals/primary/aggregate.json
shasum -a 256 artifacts/issue-149-brand-ranking-stage-counterfactuals/repeat/aggregate.json
