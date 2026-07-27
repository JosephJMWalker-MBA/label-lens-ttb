#!/usr/bin/env bash
set -euo pipefail

# Audit discovery
git status --short --branch
git rev-parse HEAD
find . -maxdepth 2 -name '.env*' -type f -print
node -e "const p=require('./package.json'); for (const [k,v] of Object.entries(p.scripts)) if (/vlm|vision-region|observer|package|e2e/i.test(k+' '+v)) console.log(k+'='+v)"
rg -n "CanonicalRegionProposal|ocrInspectionRegion|ocrHandoff|observerProposals|runVisionObserverLifecycle|LlamaServerVisionObserverAdapter|resolveLocalVlmConfig|localVlmConfigPresent|VLM_|LLAMA_SERVER|vision-observer|local-vlm" src scripts docs artifacts package.json --glob '!docs/extraction-full-corpus/extractor-report.json'
rg -n "vision-observer|local-vlm|VLM_|LLAMA_SERVER|Observer|observer|CanonicalRegionProposal|proposal" src/app src/features src/pipeline src/server src/components --glob '!**/*.test.ts'
rg -n "rawResponseDigest|modelSha256|llamaExecutableSha256|processTreeReleasedAfterTermination|runtimeKind|real-local-vlm|fake-server|validated real-local-vlm|SKIP: public governed report|local VLM" artifacts docs scripts src/fixtures/eval --glob '!docs/extraction-full-corpus/extractor-report.json'

# Focused audit tests
npm exec vitest run src/fixtures/eval/issue-90-vlm-audit.test.ts

# Required validation
npm run format:check
npm run lint
npm run typecheck
npm exec vitest run src/fixtures/eval/issue-90-vlm-audit.test.ts src/fixtures/eval/vision-observer/observer-grid.test.ts src/fixtures/eval/vision-observer/observer-grid.integration.test.ts src/fixtures/eval/vision-observer/local-vlm/local-vlm-boundary.test.ts src/fixtures/eval/vision-observer/local-vlm/llama-server-config.test.ts src/fixtures/eval/vision-region-benchmark.test.ts
npm exec vitest run src/app/api/package/analyze/route.test.ts
npm exec vitest run src/features/package-preparation/package-workflow.test.ts src/features/package-preparation/package-model.test.ts src/features/package-preparation/PackagePreparationWorkspace.test.tsx src/features/package-preparation/ReviewWorkspaceContainer.test.tsx src/features/package-preparation/AgentReviewSubmissionDock.test.tsx
npm run build
npm run test:e2e -- tests/e2e/package-preparation.spec.ts
npm run eval:vision-region-benchmark
