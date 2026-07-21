#!/usr/bin/env bash
# Commands used for the corroborated-contradiction specification round.
# READ-ONLY: no production code, schema, or fixture was modified.
#
# Worktree : label-lens-ttb-cc
# Branch   : experiment/alcohol-corroborated-contradiction
# Base     : see git-sha.txt (9ecd7b2, current origin/main)
set -euo pipefail
A=artifacts/alcohol-corroborated-contradiction

git rev-parse HEAD > "$A/git-sha.txt"

# --- Inspection (no edits) ------------------------------------------------
# Observation states, ambiguity reasons, alternate shape:
sed -n '17,60p;145,185p' src/pipeline/analyzer/analyzer.types.ts
# Schema invariants for present states, alternates, and AMBIGUOUS:
sed -n '158,222p;280,340p' src/domain/evidence/evidence.schema.ts
# Where alcohol state is assigned:
sed -n '1031,1150p' src/pipeline/extractor/field-selection.ts
# Where an async verification step could attach (engine + image both in scope):
sed -n '38,120p' src/pipeline/extractor/extractor.ts
# Evaluator: confirm classifyAlcohol has no AMBIGUOUS branch.
sed -n '233,272p' src/fixtures/eval/metrics.ts

# --- Cost measurement -----------------------------------------------------
# reread-evidence.json is carried over from the diagnosis round
# (artifacts/alcohol-digit-ocr-diagnosis on branch research/alcohol-digit-ocr-diagnosis)
# so the eligibility counts and crop geometry are reproducible here.
node --input-type=module -e '
import {readFileSync} from "node:fs";
const R=JSON.parse(readFileSync("artifacts/alcohol-corroborated-contradiction/reread-evidence.json","utf8"));
const el=R.filter(r=>r.eligible);
console.log("cases",R.length,"accepted candidate",el.length,
  "OBSERVED",el.filter(r=>r.alcohol.state==="OBSERVED").length,
  "LOW_CONFIDENCE",el.filter(r=>r.alcohol.state==="LOW_CONFIDENCE").length);
'
# Time the two bounded re-reads for every OBSERVED case.
npx tsx "$A/latency-probe.ts"        # -> latency-probe.json

# --- Documentation gate ---------------------------------------------------
npx prettier --check "$A/**/*.md"

# No production file is modified in this round:
git status --porcelain -- src scripts tests docs   # expected: empty
