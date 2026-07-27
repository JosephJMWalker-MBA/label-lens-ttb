#!/usr/bin/env bash
set -euo pipefail

# Validate and generate the committed-only no-op platform artifacts.
npm run eval:issue-149-ocr-research-platform

# Reproduce the rejected, evaluation-only 3x -> 4x bounded Brand scale treatment.
npm run eval:issue-149-ocr-research-scale

# Focused platform tests.
npx vitest run \
  src/fixtures/ocr-research/fixture-corpus.test.ts \
  src/fixtures/ocr-research/experiment.test.ts

# Repository checks required by Issue #149.
npm run format:check
npm run lint
npm run typecheck
npx vitest run \
  src/fixtures/eval/issue-149-bounded-baseline.test.ts \
  src/fixtures/eval/issue-149-segmentation-experiment.test.ts \
  src/fixtures/eval/issue-149-alcohol-layout-segmentation.test.ts \
  src/fixtures/eval/issue-149-brand-grouping-ranking.test.ts \
  src/fixtures/eval/issue-149-real-label-staging-corpus.test.ts \
  src/pipeline/extractor/field-selection.test.ts \
  src/pipeline/extractor/government-warning.test.ts \
  src/domain/rules/government-warning.rule.test.ts \
  src/domain/rules/wine-alcohol.rule.test.ts \
  src/app/api/package/analyze/route.test.ts \
  src/features/package-preparation/*.test.ts \
  src/features/package-preparation/*.test.tsx

DATABASE_URL=file:/tmp/label-lens-issue-149-build.sqlite npm run build

# With the repository's documented, fake E2E environment exported:
npm run e2e:seed
npx playwright test tests/e2e/package-preparation.spec.ts --project=chromium
