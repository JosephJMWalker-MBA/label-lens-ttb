#!/usr/bin/env bash
# Brand evidence-path diagnosis. READ-ONLY: no production file is modified.
# Worktree: label-lens-ttb-brand   Branch: research/brand-evidence-path-diagnosis
# Base: see git-sha.txt (a9fe943, origin/main after PR #153 merged)
set -euo pipefail
A=artifacts/brand-evidence-path-diagnosis

git rev-parse HEAD > "$A/git-sha.txt"

# --- Code-path inspection (no edits) --------------------------------------
sed -n '1466,1700p'  src/pipeline/extractor/field-selection.ts   # filters + classifier
sed -n '1791,1965p'  src/pipeline/extractor/field-selection.ts   # span analysis, sub-span gate
sed -n '2045,2190p'  src/pipeline/extractor/field-selection.ts   # scoring + ranking
sed -n '2188,2424p'  src/pipeline/extractor/field-selection.ts   # generation + authority gate
sed -n '38,120p'     src/pipeline/extractor/extractor.ts         # orchestration
sed -n '100,180p'    src/fixtures/eval/metrics.ts                # truth comparison

# --- Probe: real extractor over the governed corpus -----------------------
# Runs every case through runCaseArtifacts (image bytes + digest only), then
# classifies the first stage of truth loss. Takes a few minutes: full OCR per case.
npx tsx "$A/probe.ts" "$A"          # -> cases.json

# --- Aggregates (all derived from cases.json) -----------------------------
# failure-taxonomy.json and possible-truth-audit.json are produced by the
# inline node scripts recorded in the session; each reads only cases.json.

# --- Validation -----------------------------------------------------------
node -e "JSON.parse(require('fs').readFileSync('$A/cases.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('$A/failure-taxonomy.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('$A/possible-truth-audit.json','utf8'))"
bash -n "$A/commands.sh"
git status --porcelain -- src scripts tests docs public   # expected: empty
