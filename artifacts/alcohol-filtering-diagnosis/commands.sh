#!/usr/bin/env bash
# Alcohol candidate-filtering diagnosis — READ ONLY.
# Runs no OCR, modifies no production code, regenerates no committed baseline.
set -euo pipefail
REPORT="docs/extraction-full-corpus/extractor-report.json"

# 1. Rejection accounting across the 34 candidate-filtering failures.
node --max-old-space-size=4096 -e '
const r=require("./'"$REPORT"'");
const F=r.cases.filter(c=>c.alcohol?.failureClass==="candidate-filtering-failure");
const sub={},rej={};
for(const c of F){ sub[c.alcohol.candidateFilteringSubtype]=(sub[c.alcohol.candidateFilteringSubtype]||0)+1;
  for(const d of c.diagnostics.alcoholCandidateDecisions||[]) rej[d.rejectionReason||"(kept)"]=(rej[d.rejectionReason||"(kept)"]||0)+1; }
console.log("cases:",F.length); console.log("subtypes:",JSON.stringify(sub,null,2)); console.log("rejectionReasons:",JSON.stringify(rej,null,2));'

# 2. Layout clustering.
node --max-old-space-size=4096 -e '
const r=require("./'"$REPORT"'");
const F=r.cases.filter(c=>c.alcohol?.failureClass==="candidate-filtering-failure");
const t={}; for(const c of F) for(const s of (c.strata||[])) t[s]=(t[s]||0)+1;
console.log(JSON.stringify(Object.fromEntries(Object.entries(t).sort((a,b)=>b[1]-a[1])),null,2));'

# 3. Simulate the candidate fixes against the failures AND the controls
#    (13 absent-alcohol cases + 70 currently-correct cases).
#    This transcribes the production canonicalization/acceptance regexes; it sizes and
#    ranks the experiments and is NOT a substitute for `npm run eval:baseline`.
node --max-old-space-size=4096 artifacts/alcohol-filtering-diagnosis/simulate-filter-fixes.mjs "$REPORT"
