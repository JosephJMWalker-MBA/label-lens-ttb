#!/usr/bin/env bash
# Issue #149 — PARSeq-small compatibility and sequence-evidence probe.
# Evaluation-only. Verdict: COMPATIBLE. Requires Docker on native linux/amd64.
set -euo pipefail

# 1. Retrieve and verify the explicitly licensed checkpoint. Fail-closed: only one
#    pinned immutable URL, full SHA-256 and exact byte size enforced, file deleted
#    and non-zero exit on mismatch, cached bytes reverified every invocation.
node scripts/eval/fetch-issue-149-parseq-hf-checkpoint.mjs

# 2. Build the research container. Build args have no defaults, so the image
#    cannot build with a floating font or source revision.
docker build --platform=linux/amd64 \
  -f scripts/eval/docker/issue-149-parseq-probe.Dockerfile \
  --build-arg FONT_PACKAGE_VERSION=2.37-6 \
  --build-arg PARSEQ_COMMIT=1902db043c029a7e03a3818c616c06600af574be \
  -t issue-149-parseq-probe:cpu .

# 3. Regenerate the synthetic sentinels. Renders with the real pinned DejaVu Sans
#    font and refuses to write unless two independent renderings are identical.
#    Must reproduce positive 265aaae73d65a04f… and blank 26daf63d1830f5af….
docker run --rm --platform=linux/amd64 --network=none \
  -v "$PWD/artifacts/issue-149-parseq-hf-compatibility-probe/synthetic:/out" \
  issue-149-parseq-probe:cpu python /opt/probe/generate_synthetic_inputs.py /out

# 4. Run the four invocations OFFLINE: network disabled, model and inputs
#    read-only, no repository root mounted, no corpus or fixture truth mounted.
docker run --rm --platform=linux/amd64 --network=none \
  --cpus 2 --memory 6g \
  -v "$PWD/.local/ocr-research/models/parseq-small:/model:ro" \
  -v "$PWD/artifacts/issue-149-parseq-hf-compatibility-probe/synthetic:/inputs:ro" \
  -v "$PWD/artifacts/issue-149-parseq-hf-compatibility-probe/raw:/out" \
  -e OMP_NUM_THREADS=1 -e MKL_NUM_THREADS=1 \
  issue-149-parseq-probe:cpu python /opt/probe/run_probe.py

# Verify the frozen preregistration, inputs and committed artifacts.
( cd artifacts/issue-149-parseq-hf-compatibility-probe && shasum -a 256 -c preregistration.sha256 )
( cd artifacts/issue-149-parseq-hf-compatibility-probe/synthetic \
    && shasum -a 256 -c positive.png.sha256 && shasum -a 256 -c blank.png.sha256 )
shasum -a 256 -c artifacts/issue-149-parseq-hf-compatibility-probe/artifact-manifest.sha256
