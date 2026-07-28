#!/usr/bin/env bash
set -euo pipefail

# Baseline gate, run twice from an isolated clean worktree at the frozen base.
npm run eval:baseline
npm run eval:baseline

# Pre-treatment proof gate.
npx vitest run \
  src/fixtures/eval/issue-149-alcohol-reselection.test.ts \
  src/pipeline/extractor/field-selection.test.ts \
  src/pipeline/extractor/regions.test.ts \
  src/pipeline/extractor/government-warning.test.ts \
  src/pipeline/extractor/extractor.test.ts \
  src/fixtures/eval/production-parity.test.ts \
  src/fixtures/eval/production-parity-reconciliation.test.ts \
  src/domain/rules/wine-alcohol.rule.test.ts \
  src/domain/stale-modules.test.ts

# Governed run order. The runner checks the preregistration and production hashes.
npm run eval:issue-149-alcohol-reselection -- --arm control --run primary
npm run eval:issue-149-alcohol-reselection -- --arm treatment --run primary
npm run eval:issue-149-alcohol-reselection -- --arm control --run repeat
npm run eval:issue-149-alcohol-reselection -- --arm treatment --run repeat
npx vite-node --config vitest.config.ts scripts/eval/finalize-issue-149-alcohol-reselection.ts

# Final validation.
npm run format:check
npm run lint
npm run typecheck
npm test
DATABASE_URL='file:.local/issue-149-alcohol-reselection.db' npm run build
npx playwright test tests/e2e/package-preparation.spec.ts --project=chromium
npm run eval:baseline
