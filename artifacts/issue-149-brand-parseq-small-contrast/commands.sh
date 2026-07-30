#!/usr/bin/env bash
# Issue #149 — PARSeq-small versus incumbent Tesseract on frozen Brand crops.
# Evaluation-only. Verdict: REGRESSION (one design tripped the frozen rule).
set -euo pipefail

# 1. Recover and verify the frozen population, then republish the identical
#    preprocessed PNG bytes under fresh opaque ids. Fails closed on any count,
#    hash or independence-relationship mismatch. No OCR, no truth read.
node scripts/eval/issue-149-parseq-contrast-prepare.mjs

# 2. Retrieve and verify the explicitly licensed PARSeq checkpoint.
node scripts/eval/fetch-issue-149-parseq-hf-checkpoint.mjs

# 3. Build the pinned PARSeq container.
docker build --platform=linux/amd64 \
  -f scripts/eval/docker/issue-149-parseq-probe.Dockerfile \
  --build-arg FONT_PACKAGE_VERSION=2.37-6 \
  --build-arg PARSEQ_COMMIT=1902db043c029a7e03a3818c616c06600af574be \
  -t issue-149-parseq-probe:cpu .

# 4. Arm B, primary and exact repeat. Offline; model and inputs read-only; no
#    repository root, corpus, truth or case mapping mounted.
for run in primary repeat; do
  docker run --rm --platform=linux/amd64 --network=none \
    --cpus 2 --memory 6g \
    -v "$PWD/.local/ocr-research/models/parseq-small:/model:ro" \
    -v "$PWD/artifacts/issue-149-brand-parseq-small-contrast/inference-inputs:/inputs:ro" \
    -v "$PWD/artifacts/issue-149-brand-parseq-small-contrast/raw:/out" \
    -e OMP_NUM_THREADS=1 -e MKL_NUM_THREADS=1 \
    issue-149-parseq-probe:cpu python /opt/probe/run_brand_contrast.py "$run"
done

# 5. Arm A (incumbent tesseract.js, primary and repeat) and evaluation. Truth is
#    loaded only after every raw output is written and hashed.
node --import tsx scripts/eval/run-issue-149-parseq-contrast.ts

# Verify the frozen preregistration and the committed artifacts.
( cd artifacts/issue-149-brand-parseq-small-contrast && shasum -a 256 -c preregistration.sha256 )
shasum -a 256 -c artifacts/issue-149-brand-parseq-small-contrast/artifact-manifest.sha256
