#!/usr/bin/env bash
# E3 — measurement only. No production, OCR, fixture, test, schema, UI or
# package file is modified.
# Branch: research/brand-ocr-recognition-miss-diagnosis   Base: see git-sha.txt
set -euo pipefail
E=artifacts/brand-ocr-recognition-miss-diagnosis

git rev-parse HEAD > "$E/git-sha.txt"

# Probe: runs the real extractor over the governed corpus, reproduces the brand
# first-stage-of-loss attribution, isolates the OCR_RECOGNITION_MISS cases, and
# only then consults truth to classify each one. Full OCR per case — minutes.
npx tsx "$E/probe.ts" "$E"            # -> cases.json  (asserts 24 cases)

# Aggregates + the narrower human-review set. Reads cases.json only.
node "$E/classify.mjs" "$E"           # -> classifications.json

# Review images for the three borderline classifications only.
npx tsx "$E/build-borderline-crops.ts" "$E"   # -> borderline-crops/

# --- Validation --------------------------------------------------------------
# Determinism: run the probe twice and compare byte-for-byte.
# NOTE ON ORDERING: classify.mjs writes `humanReviewReasons` back into cases.json,
# so compare a probe run against a probe run — re-running only the probe after
# classify has run will differ by that one added field and nothing else.
npx tsx "$E/probe.ts" "$E"
cp "$E/cases.json" /tmp/e3-run1.json
npx tsx "$E/probe.ts" "$E"
cmp "$E/cases.json" /tmp/e3-run1.json && echo "probe deterministic"
node "$E/classify.mjs" "$E"

for f in "$E"/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done
bash -n "$E/commands.sh"
node --check "$E/classify.mjs"
git status --porcelain -- src scripts tests docs public   # expected: empty
