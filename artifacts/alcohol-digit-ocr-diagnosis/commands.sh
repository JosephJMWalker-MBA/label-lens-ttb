#!/usr/bin/env bash
# Exact commands used for the alcohol digit OCR diagnosis. READ-ONLY.
# Worktree: label-lens-ttb-ocr   Branch: research/alcohol-digit-ocr-diagnosis
# Base commit: 9ecd7b280f95bb80e930b76cb618c790ca4a6926 (origin/main)
set -euo pipefail
A=artifacts/alcohol-digit-ocr-diagnosis

git rev-parse HEAD > "$A/git-sha.txt"

# Phase 0 — measured baseline on unmodified main (full 115-case corpus).
#
# REQUIRED FIRST STEP. This regenerates `all-cases-slim.json`, the corpus-wide
# candidate-decision intermediate, which is deliberately NOT committed with this
# record — see `omitted-intermediate.md` for its size, SHA-256, and the
# verification that it regenerates byte-identically. The two scripts below marked
# "needs the regenerated intermediate" cannot run until this completes.
#
# Emits exactly three files: baseline-summary.json, all-cases-slim.json,
# forensic-cases.json. (target-cases.csv, failure-classification.json and crops/
# were produced by separate ad-hoc steps during the round and are preserved as
# results, not regenerated here.)
#
# baseline-summary.json reproduces identically except for latencyMs.median and
# latencyMs.p95, which are wall-clock measurements.
npx tsx "$A/run-eval.ts" "$A"

# Phase 3 — OCR matrix: 896 runs per case, 3 repeats each.
REPEATS=3 node "$A/ocr-matrix.mjs" "$A"   # -> ocr-matrix.csv, ocr-matrix-summary.json

# Phase 4 — corpus-wide control for the targeted re-read family.
# NEEDS THE REGENERATED INTERMEDIATE (Phase 0). forensic-cases.json is not a
# substitute: it holds only the two target cases, and a control must iterate all
# 70 cases that produced an accepted candidate.
# NOTE: this control's own numeral parsing was later found to be defective — see
# `decision-addendum.md`. Its output is preserved as the superseded measurement.
node "$A/control-simulation.mjs" "$A" "$A/all-cases-slim.json"   # -> control-results.json

# Corroborated-contradiction signal (E1) false-alarm count.
node -e '
const j=JSON.parse(require("fs").readFileSync("'"$A"'/control-results.json","utf8"));
const near=(a,b)=>a!=null&&b!=null&&Math.abs(a-b)<0.05;
const correct=j.results.filter(x=>x.wasCorrect);
const fire=correct.filter(x=>near(x.reread.singleWord.parsed,x.reread.sparse.parsed)
  && x.selectedValue!=null && !near(x.reread.singleWord.parsed,x.selectedValue));
console.log(correct.length, fire.length, fire.map(f=>f.caseId));
'

# No production file was modified in this round:
git status --porcelain -- src scripts tests   # expected: empty

# --- Narrower-trigger round (Phases 1-6) ---------------------------------
# Re-read evidence, parsed by the REAL production selector (2 crops, 3 PSMs).
# NEEDS THE REGENERATED INTERMEDIATE (Phase 0).
npx tsx "$A/reread-evidence.ts" "$A" "$A/all-cases-slim.json"   # -> reread-evidence.json
# sharp's .stats() ignores .extract(); recompute crop statistics from pixels.
node "$A/fix-crop-stats.mjs"
# Evaluate the nine candidate triggers over all 115 cases.
# Reads reread-evidence.json only — reproduces from committed files alone.
node "$A/narrower-triggers.mjs" "$A"                             # -> narrower-trigger-results.json
# Determinism: run reread-evidence.ts twice and diff the re-read texts (0 differences).
