#!/usr/bin/env bash
set -euo pipefail

# Platform verification performed before treatment.
git fetch origin main
git merge --ff-only origin/main
npm run eval:issue-149-ocr-research-platform
git diff -- src/pipeline/extractor/field-selection.ts src/pipeline/extractor/regions.ts src/pipeline/extractor/extractor.ts

# Focused implementation verification performed before treatment.
npm run typecheck
npx vitest run src/fixtures/ocr-research/brand-mild-sharpening.test.ts src/fixtures/ocr-research/experiment.test.ts

# This single command ran primary control/treatment and deterministic repeat control/treatment.
npm run eval:issue-149-brand-mild-sharpening

# Full validation commands run after artifact inspection.
npm run format:check
npm run lint
npm run typecheck
npx vitest run src/fixtures/ocr-research/brand-mild-sharpening.test.ts
npx vitest run src/fixtures/ocr-research/experiment.test.ts src/fixtures/ocr-research/fixture-corpus.test.ts
npm test
DATABASE_URL=mysql://label_lens:label_lens@127.0.0.1:3306/label_lens npm run build
DATABASE_URL=sqlite:/private/tmp/label-lens-issue149-e2e-019fa4cc.sqlite LABEL_LENS_DB_DIALECT=sqlite BETTER_AUTH_SECRET=local-e2e-secret-at-least-32-characters BETTER_AUTH_URL=http://localhost:3000 npx playwright test tests/e2e/package-preparation.spec.ts
