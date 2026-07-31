#!/usr/bin/env bash
# Issue #149 — complete Brand evidence acquisition.
# STAGE 1: planning and preregistration only. Nothing here runs OCR.
set -euo pipefail

ART=artifacts/issue-149-brand-complete-evidence-acquisition

# Verify the merged packages this sprint freezes its population from.
( cd artifacts/issue-149-brand-current-baseline-failure-decomposition \
    && shasum -a 256 -c artifact-manifest.sha256 )
( cd artifacts/issue-149-brand-candidate-construction-filter-decomposition \
    && shasum -a 256 -c artifact-manifest.sha256 )

# Freeze the 115-case population, assign opaque item-NNNN identifiers, stage the
# images under generic filenames into an untracked directory, and write the
# post-freeze id map outside every acquisition mount. Halts on an unexpected
# count, a missing case, an image hash or byte-size mismatch, a non-included
# status, an opaque-id collision, or any historical identifier surviving into the
# acquisition input.
node scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs

# The acquisition input carries no historical identity, and the id map is not
# inside it. This is also asserted by the focused contract test below.
node -e 'const m=require("./artifacts/issue-149-brand-complete-evidence-acquisition/truth-free-input-manifest.json");console.log(Object.keys(m.cases[0]).join(", "))'
npx vitest run src/fixtures/eval/issue-149-acquisition-isolation.test.ts

# Verify the frozen preregistration.
( cd "${ART}" && shasum -a 256 -c preregistration.sha256 )

# The incumbent identities this sprint pins.
shasum -a 256 src/pipeline/extractor/assets/eng.traineddata
node -e 'const l=require("./package-lock.json").packages;for(const k of ["node_modules/tesseract.js","node_modules/tesseract.js-core"])console.log(k,l[k].version)'

# The two claims the evidence contract rests on: the caps are in the harness
# projection, and the untruncated debug object is already returned.
sed -n '72p;75p;304p;415p' src/fixtures/eval/eval-harness.ts
sed -n '959,962p' src/fixtures/eval/eval-harness.ts

# The merged PR #220 capability this amendment consumes.
shasum -a 256 src/pipeline/extractor/field-selection.ts
grep -c "selectBrandObservationWithCompleteFilterDiagnostics" src/pipeline/extractor/field-selection.ts

# --- NOT PART OF STAGE 1 ------------------------------------------------------
# The acquisition runs, the determinism comparison and the post-freeze evaluation
# are added in Stage 2 behind the push-triggered workflow described in
# workflow-plan.md, and run only when the committed mode file reads `execute`.
# No command in this file can start them.
