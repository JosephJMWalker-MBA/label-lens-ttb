#!/usr/bin/env bash
set -euo pipefail

# Pre-treatment proof gates.
npm run typecheck
npx vitest run \
  src/fixtures/ocr-research/experiment.test.ts \
  src/fixtures/ocr-research/brand-otsu-threshold.test.ts

# One governed sequence only: primary control, primary treatment,
# repeat control, repeat treatment.
npm run eval:issue-149-brand-otsu-threshold

# Repository validation after the clean decision artifacts exist.
npm run format:check
npm run lint
npm run typecheck
npm test

DATABASE_URL=mysql://label_lens:label_lens@127.0.0.1:3306/label_lens \
BETTER_AUTH_SECRET=local-build-secret-at-least-32-characters \
BETTER_AUTH_URL=http://localhost:3000 \
npm run build

DATABASE_URL=sqlite:/private/tmp/label-lens-issue149-otsu-clean-e2e.sqlite \
LABEL_LENS_DB_DIALECT=sqlite \
BETTER_AUTH_SECRET=local-e2e-secret-at-least-32-characters \
BETTER_AUTH_URL=http://localhost:3000 \
npx playwright test tests/e2e/package-preparation.spec.ts
