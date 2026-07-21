#!/usr/bin/env bash
# E1a read-only simulation. No production file is modified.
# Branch: research/brand-evidence-path-diagnosis   Base: ../git-sha.txt (a9fe943)
set -euo pipefail
E=artifacts/brand-evidence-path-diagnosis/e1a-too-many-words-simulation

# Baseline + treatment in one pass over the governed corpus (full OCR per case;
# takes several minutes). Writes cases.json and filter-results.json.
npx tsx "$E/simulate.ts" "$E"

# Aggregates: baseline.json, treatment.json, changed-cases.json,
# candidate-volume.json, metrics.json — all derived from cases.json.
node "$E/aggregate.mjs"

# Determinism: run the simulation twice and compare the raw outputs byte-for-byte.
cp "$E/cases.json" /tmp/e1a-run1.json
npx tsx "$E/simulate.ts" "$E"
cmp "$E/cases.json" /tmp/e1a-run1.json && echo "deterministic"

# Validation
node -e "JSON.parse(require('fs').readFileSync('$E/cases.json','utf8'))"
bash -n "$E/commands.sh"
git status --porcelain -- src scripts tests docs public   # expected: empty
