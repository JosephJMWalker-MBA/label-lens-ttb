#!/usr/bin/env bash
# Issue #149 — PP-OCRv6-small ONNX compatibility and CTC evidence probe.
# Evaluation-only. Verdict: COMPATIBLE. Requires Docker on native linux/amd64.
set -euo pipefail

ART=artifacts/issue-149-ppocrv6-small-onnx-compatibility-probe
IMAGE=issue-149-ppocrv6-onnx-probe:cpu
FONT=2.37-6

# 1. Discovery gates 1-5: revision re-assertion, exact five-file inventory with
#    git OIDs, Apache-2.0 model card, inference.yml hash and byte size, and the
#    ONNX LFS pointer metadata. Downloads no weights; exits non-zero on any
#    mismatch so nothing downstream can run.
node scripts/eval/issue-149-ppocrv6-discovery.mjs

# 2. Build the pinned ONNX Runtime CPU container. The build arg has no default,
#    so the image cannot build with a floating font package.
docker build --platform=linux/amd64 \
  -f scripts/eval/docker/issue-149-ppocrv6-onnx-probe.Dockerfile \
  --build-arg "FONT_PACKAGE_VERSION=${FONT}" \
  -t "${IMAGE}" .

# 3. Retrieve inference.onnx. Fail-closed: one pinned immutable URL, full
#    SHA-256 and exact byte size enforced, file deleted and non-zero exit on
#    mismatch, cached bytes reverified on every invocation.
node scripts/eval/fetch-issue-149-ppocrv6-onnx.mjs

# 4. Dry session load and dictionary audit, OFFLINE. session.run is never called.
#    Must reproduce opset 11, input `x`, output `fetch_name_0`, vocab 18710,
#    blank token 0, and ASCII space decodable at token 18709.
docker run --rm --platform=linux/amd64 --network=none --cpus 2 --memory 4g \
  -v "$PWD/.local/ocr-research/models/ppocrv6-small-rec-onnx:/model:ro" \
  -v "$PWD/${ART}/vendor:/config:ro" \
  -v "$PWD/${ART}/discovery:/out" \
  "${IMAGE}" python /opt/probe/inspect_model.py

# 5. Regenerate the synthetic sentinels. Renders with the pinned DejaVu Sans face
#    and refuses to write unless two independent renderings are identical.
#    Must reproduce positive 574d8cc7e2f9f5cd… and blank 26daf63d1830f5af….
docker run --rm --platform=linux/amd64 --network=none \
  -v "$PWD/${ART}/synthetic:/out" \
  "${IMAGE}" python /opt/probe/generate_synthetic_inputs.py /out

# 6. Run the four invocations OFFLINE: network disabled, model, config, audit and
#    inputs all read-only, no repository root mounted, no corpus or fixture truth.
docker run --rm --platform=linux/amd64 --network=none --cpus 2 --memory 4g \
  -v "$PWD/.local/ocr-research/models/ppocrv6-small-rec-onnx:/model:ro" \
  -v "$PWD/${ART}/vendor:/config:ro" \
  -v "$PWD/${ART}/dictionary-audit.json:/audit/dictionary-audit.json:ro" \
  -v "$PWD/${ART}/synthetic:/inputs:ro" \
  -v "$PWD/${ART}/raw:/out" \
  -e OMP_NUM_THREADS=1 -e MKL_NUM_THREADS=1 \
  "${IMAGE}" python /opt/probe/run_probe.py

# 7. Derive the reports and the verdict from the raw descriptors. The verdict is
#    computed from the frozen §13.4 gates, not asserted by hand.
node scripts/eval/finalize-issue-149-ppocrv6-probe.mjs

# Verify the frozen preregistration, the frozen inputs and the committed artifacts.
( cd "${ART}" && shasum -a 256 -c preregistration.sha256 )
( cd "${ART}/synthetic" && shasum -a 256 -c positive.png.sha256 && shasum -a 256 -c blank.png.sha256 )
shasum -a 256 -c "${ART}/artifact-manifest.sha256"
