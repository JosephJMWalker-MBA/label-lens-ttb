#!/usr/bin/env bash
# Experiment: fused alcohol-prefix separator. Full reproduction.
# Writes only into this artifact directory; never touches docs/extraction-full-corpus
# or the committed production-parity fixture.
set -euo pipefail
A="artifacts/alcohol-prefix-separator"

# 1. Focused + regression tests
npx vitest run src/pipeline/extractor/field-selection.test.ts
npx vitest run src/domain/rules/wine-alcohol.rule.test.ts src/domain/rules/registry.test.ts
npx vitest run src/pipeline/extractor/ src/pipeline/precheck/ src/pipeline/result/

# 2. Read-only simulation (predicts the affected set before any corpus run)
node --max-old-space-size=4096 artifacts/alcohol-filtering-diagnosis/simulate-filter-fixes.mjs \
  docs/extraction-full-corpus/extractor-report.json

# 3. Baseline corpus run (production edit removed)
git stash push -q src/pipeline/extractor/field-selection.ts
npx vite-node --config vitest.config.ts "$A/run-corpus-eval.ts" "$A/baseline-report.json"
git stash pop -q

# 4. Treatment corpus run (production edit present)
npx vite-node --config vitest.config.ts "$A/run-corpus-eval.ts" "$A/treatment-report.json"

# 5. Metric diff + changed-case analysis
node "$A/diff-reports.mjs" "$A/baseline-report.json" "$A/treatment-report.json" "$A/changed-cases.csv"

# 6. Determinism: repeat the treatment run and compare, excluding latency
npx vite-node --config vitest.config.ts "$A/run-corpus-eval.ts" /tmp/treatment-repeat.json
node -e '
const a=require("./'"$A"'/treatment-report.json").cases, b=require("/tmp/treatment-repeat.json").cases;
const k=c=>JSON.stringify({id:c.caseId,alc:c.alcohol,brand:c.brand});
const A=new Map(a.map(c=>[c.caseId,k(c)])), B=new Map(b.map(c=>[c.caseId,k(c)]));
let d=0; for(const [x,v] of A) if(B.get(x)!==v){d++;console.log("NONDETERMINISTIC:",x);}
console.log("cases compared:",A.size,"| non-deterministic:",d);'
