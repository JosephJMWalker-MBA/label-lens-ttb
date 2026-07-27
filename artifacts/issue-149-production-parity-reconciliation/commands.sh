#!/usr/bin/env bash
set -eu

REPOSITORY=/Users/josephjmwalker-mba/Documents/GitHub/label-lens-ttb
CAPTURE_WORKTREE=/private/tmp/label-lens-parity-reconciliation
PRODUCTION_BASE=552d30352e76dd412bd75ceb319878ab2d2747bb
INSTRUMENTATION_COMMIT=21c5a6db365549078946b84f500e5e14738dbde4

cd "$REPOSITORY"
git status --short --branch
git merge-base --is-ancestor "$PRODUCTION_BASE" main
git worktree add --detach "$CAPTURE_WORKTREE" "$INSTRUMENTATION_COMMIT"
ln -s "$REPOSITORY/node_modules" "$CAPTURE_WORKTREE/node_modules"

cd "$CAPTURE_WORKTREE"
PRODUCTION_PARITY_COMMIT_SHA="$INSTRUMENTATION_COMMIT" \
  PRODUCTION_PARITY_BASE_SHA="$PRODUCTION_BASE" \
  PRODUCTION_PARITY_RUN_PATH="$REPOSITORY/artifacts/issue-149-production-parity-reconciliation/determinism-run-1.json" \
  PRODUCTION_PARITY_ACTUAL_FIXTURE_PATH=/private/tmp/label-lens-parity-reconciliation/actual-run-1.json \
  npm run eval:production-parity:reconcile
PRODUCTION_PARITY_COMMIT_SHA="$INSTRUMENTATION_COMMIT" \
  PRODUCTION_PARITY_BASE_SHA="$PRODUCTION_BASE" \
  PRODUCTION_PARITY_RUN_PATH="$REPOSITORY/artifacts/issue-149-production-parity-reconciliation/determinism-run-2.json" \
  PRODUCTION_PARITY_ACTUAL_FIXTURE_PATH=/private/tmp/label-lens-parity-reconciliation/actual-run-2.json \
  npm run eval:production-parity:reconcile

cmp -s \
  "$REPOSITORY/artifacts/issue-149-production-parity-reconciliation/determinism-run-1.json" \
  "$REPOSITORY/artifacts/issue-149-production-parity-reconciliation/determinism-run-2.json"
cmp -s actual-run-1.json actual-run-2.json
shasum -a 256 actual-run-1.json

cd "$REPOSITORY"
npm run eval:baseline
npm run eval:production-parity
npx vitest run \
  src/fixtures/eval/production-parity.test.ts \
  src/fixtures/eval/production-parity-reconciliation.test.ts \
  src/fixtures/eval/eval-boundary.test.ts \
  src/fixtures/truth-boundary.test.ts
npm test
npm run typecheck
npm run lint
npm run format:check
npm run docs:check
