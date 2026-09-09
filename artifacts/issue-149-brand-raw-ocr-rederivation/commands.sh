#!/usr/bin/env bash
# Issue #149 — fresh re-derivation of Brand truthInRawOcr.
# Research/evaluation only. Runs the real extractor; changes no production code.
set -euo pipefail

# The frozen rule and its divergence from the inherited diagnostic.
npx vitest run src/fixtures/eval/issue-149-brand-raw-ocr-match.test.ts

# Re-derive over the frozen 115-case population (re-runs OCR; ~15 min).
npx vite-node --config vitest.config.ts \
  scripts/eval/run-issue-149-brand-raw-ocr-rederivation.ts

# Determinism + shared-module fidelity: run twice and compare byte-for-byte.
shasum -a 256 artifacts/issue-149-brand-raw-ocr-rederivation/primary/aggregate.json
shasum -a 256 artifacts/issue-149-brand-raw-ocr-rederivation/repeat/aggregate.json

# Confirm the inherited field is the extractor's own diagnostic (115/115).
node -e '
const c=require("./artifacts/brand-evidence-path-diagnosis/cases.json");
const r=require("./docs/extraction-full-corpus/extractor-report.json");
const m=new Map(r.cases.map(x=>[x.caseId,x]));
console.log("agree:", c.filter(x=>x.truthInRawOcr===m.get(x.caseId).diagnostics.brandOcrContainsAcceptable).length, "/", c.length);
'
