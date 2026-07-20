#!/usr/bin/env bash
# Alcohol fixture-truth correction. No production source is modified.
set -euo pipefail
A="artifacts/alcohol-truth-correction"

# 1. Canonical edit: src/fixtures/eval/eval-full-corpus-overrides.mjs
#    QC correction ledger: scripts/fixtures/generate-eval-manifest.mjs (TRUTH_CORRECTIONS)
# 2. Regenerate the derived manifest and corpus docs
npm run eval:inventory

# 3. Schema + corpus integrity
npx vitest run src/fixtures/eval/eval-manifest.test.ts src/fixtures/eval/eval-boundary.test.ts \
  src/fixtures/approved-wine-ingest.test.ts

# 4. Full suite
npm run format:check && npm run lint && npm run typecheck && npm test

# 5. Corpus evaluation before/after (run the before capture on origin/main)
npx vite-node --config vitest.config.ts "$A/run-eval.ts" /tmp/after

# 6. Deterministic replay
npx vite-node --config vitest.config.ts "$A/run-eval.ts" /tmp/after2
