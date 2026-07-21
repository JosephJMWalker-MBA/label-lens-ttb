#!/usr/bin/env bash
# E1b read-only simulation. No production file, fixture, schema, test or UI changed.
# Branch: research/brand-evidence-path-diagnosis   Base: ../git-sha.txt (a9fe943)
#
# The prominence constants are READ FROM PRODUCTION SOURCE at runtime by both
# scripts; no threshold is defined, tested, or tuned here.
set -euo pipefail
B=artifacts/brand-evidence-path-diagnosis/e1b-prominence-gated-simulation

# --- PHASE 1: brand-absent safety screen, run FIRST and alone ---------------
npx tsx "$B/simulate.ts" "$B" --absent-only
#   -> cases-absent.json, prominence-analysis-absent.json, filter-results-absent.json
#   Phase 1 fired the immediate kill condition (8/10 absent cases emitted a value),
#   so PHASE 2 (full corpus) was NOT run and must not be run from this record.

# --- Prominence diagnostic: NO treatment arm --------------------------------
# Records only the eligibility decision per too-many-words line. Runs no treatment
# selection and never compares a treated value to truth, so it yields no gain metric.
npx tsx "$B/prominence-probe.ts" "$B"      # -> prominence-analysis.json

# --- Determinism -------------------------------------------------------------
cp "$B/cases-absent.json" /tmp/e1b-run1.json
npx tsx "$B/simulate.ts" "$B" --absent-only
cmp "$B/cases-absent.json" /tmp/e1b-run1.json && echo "phase 1 deterministic"
cp "$B/prominence-analysis.json" /tmp/e1b-prom1.json
npx tsx "$B/prominence-probe.ts" "$B"
cmp "$B/prominence-analysis.json" /tmp/e1b-prom1.json && echo "prominence deterministic"

# --- Validation --------------------------------------------------------------
for f in "$B"/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done
bash -n "$B/commands.sh"
git status --porcelain -- src scripts tests docs public   # expected: empty
