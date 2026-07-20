#!/usr/bin/env bash
# Experiment C3 — ABV as explicit alcohol-by-volume. Full reproduction.
# Writes only into this artifact directory; never touches docs/extraction-full-corpus
# or the committed production-parity fixture.
set -euo pipefail
A="artifacts/alcohol-abv-marker"

npx vitest run src/pipeline/extractor/field-selection.test.ts
npx vitest run src/domain/rules/wine-alcohol.rule.test.ts src/domain/rules/registry.test.ts
npx vitest run src/pipeline/extractor/ src/pipeline/precheck/ src/pipeline/result/ src/fixtures/eval/
npm test

# Read-only simulation (form-by-form + corpus projection)
node --max-old-space-size=4096 "$A/simulate-abv.mjs" \
  docs/extraction-full-corpus/extractor-report.json "$A/simulation.json"

# Baseline (change removed) / treatment / determinism repeat
git stash push -q src/pipeline/extractor/field-selection.ts
npx vite-node --config vitest.config.ts "$A/run-corpus-eval.ts" "$A/baseline-report.json"
git stash pop -q
npx vite-node --config vitest.config.ts "$A/run-corpus-eval.ts" "$A/treatment-report.json"
node "$A/diff-reports.mjs" "$A/baseline-report.json" "$A/treatment-report.json" "$A/changed-cases.csv"
npx vite-node --config vitest.config.ts "$A/run-corpus-eval.ts" /tmp/abv-repeat.json
node -e '
const a=require("./'"$A"'/treatment-report.json").cases, b=require("/tmp/abv-repeat.json").cases;
const k=c=>JSON.stringify({id:c.caseId,alc:c.alcohol,brand:c.brand});
const A=new Map(a.map(c=>[c.caseId,k(c)])),B=new Map(b.map(c=>[c.caseId,k(c)]));
let d=0;for(const [x,v] of A) if(B.get(x)!==v){d++;console.log("NONDETERMINISTIC:",x);}
console.log("cases compared:",A.size,"| non-deterministic:",d);'
