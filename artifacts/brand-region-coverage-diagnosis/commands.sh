#!/usr/bin/env bash
# Brand region-coverage diagnosis — Phases 0 and 1 only.
# READ-ONLY: no production, OCR, fixture, schema, test, UI or package file is
# modified, and NO OCR was re-run in this round.
# Branch: research/brand-region-coverage-diagnosis   Base: see git-sha.txt
set -euo pipefail
A=artifacts/brand-region-coverage-diagnosis

git rev-parse HEAD > "$A/git-sha.txt"

# --- Phase 0: evidence-path inspection (reading only) -----------------------
sed -n '60,100p'  src/pipeline/extractor/extractor.types.ts   # RegionTransform, OcrWord
sed -n '1,110p'   src/pipeline/extractor/geometry.ts          # inverse mapping
sed -n '60,120p'  src/fixtures/eval/eval-harness.ts           # sampleWords cap
# What the committed corpus report actually carries:
node -e '
const r=JSON.parse(require("fs").readFileSync("docs/extraction-full-corpus/extractor-report.json","utf8"));
const c=r.cases[0];
console.log("regions[] keys:",Object.keys(c.diagnostics.regions[0]).join(", "));
let total=0,capped=0,words=0;
for(const cs of r.cases) for(const g of cs.diagnostics.regions){total++;words+=g.wordCount;if(g.sampleWords.length<g.wordCount)capped++;}
console.log("passes:",total,"| truncated sampleWords:",capped,"| corpus words:",words);
console.log("brand check:",(r.aggregate.brandExactMatchRate*r.aggregate.determinateBrandCount).toFixed(0),
            (r.aggregate.brandNormalizedAcceptableRate*r.aggregate.determinateBrandCount).toFixed(0),
            (r.aggregate.brandTop3Recall*r.aggregate.determinateBrandCount).toFixed(0),
            "| ocr-recognition-failure:",r.aggregate.brandFailureCounts["ocr-recognition-failure"]);
'

# --- Control population, fixed before any Phase-2 measurement ---------------
# controls.json was produced from the committed manifest and the preserved
# evidence-path strata: all remaining decorative-or-script-brand cases plus all
# La Fattoria fixtures, deduplicated, excluding the 13 primary cases.

# --- Phase 1: annotation packet ---------------------------------------------
# Renders one plain label and one outlined proposal per primary case. Draws NO
# OCR word boxes and NO machine-selected regions. Fails loudly if a proposed
# region leaves the canonical image frame.
npx tsx "$A/annotation-review/build-annotation-packet.ts" "$A/annotation-review"

# --- Validation --------------------------------------------------------------
for f in "$A"/*.json "$A"/annotation-review/*.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"
done
bash -n "$A/commands.sh"
git status --porcelain -- src scripts tests docs public   # expected: empty

# --- NOT RUN in this round ---------------------------------------------------
# Phase 2 requires approved annotations AND the bounded evidence collection
# described in code-path.md. Neither has happened.

# --- Phase 2 (run after annotation approval) --------------------------------
# Re-executes exactly the passes production already plans, on the approved
# primary cases plus the pre-registered controls, and records pass footprints,
# full word geometry, line membership and coverage. Read-only.
npx tsx "$A/probe.ts" "$A"        # -> cases.json, pass-coverage.json, word-overlap.json
node "$A/classify.mjs" "$A"       # -> classifications.json
