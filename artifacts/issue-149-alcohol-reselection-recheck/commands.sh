#!/usr/bin/env bash
# Experiment A recheck — verification only. No OCR corpus run, no production change.
set -euo pipefail

# 1. Causal-surface diff between the landed experiment's base and this base.
git diff --stat 5d22a6b..4bb3140 -- \
  src/pipeline/extractor/extractor.ts \
  src/pipeline/extractor/regions.ts \
  src/pipeline/extractor/field-selection.ts \
  src/pipeline/analyzer/

# 2. Frozen corpus identity at both revisions.
shasum -a 256 docs/extraction-full-corpus/extractor-report.json
git show 5d22a6b:docs/extraction-full-corpus/extractor-report.json | shasum -a 256

# 3. Fresh reachability evidence.
npx vitest run src/pipeline/extractor/alcohol-reselection-reachability.test.ts

# 4. Extraction regressions and the landed experiment's own suites.
npx vitest run src/pipeline/extractor/ \
  src/fixtures/eval/issue-149-alcohol-reselection.test.ts \
  src/fixtures/eval/issue-149-alcohol-reselection-report.test.ts
