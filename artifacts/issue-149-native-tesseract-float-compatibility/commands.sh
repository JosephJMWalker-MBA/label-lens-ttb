#!/usr/bin/env bash
# Issue #149 — native Tesseract float-model compatibility probe.
# Synthetic compatibility only. No corpus access, no production change.
#
# STATUS: INCONCLUSIVE_ENVIRONMENT. No container runtime is available on the
# authoring host, so the pinned native runtime could not be built, inventoried,
# or executed. Zero of the eight planned OCR invocations ran.
set -euo pipefail

# 1. Retrieve the pinned float model into the untracked cache (PR #208
#    mechanism, reused; no competing download system). Verifies size + sha256
#    and fails closed on mismatch.
node scripts/eval/fetch-issue-149-tessdata-best.mjs

# 2. Run the probe. It generates the synthetic inputs deterministically,
#    verifies both models, inventories the host, and fails closed before any
#    OCR if a gate fails. On a host with a container runtime it proceeds to the
#    eight fixed invocations.
node --import tsx scripts/eval/run-issue-149-native-tesseract-float-compatibility.ts

# 3. Resolve the package pins. REQUIRED before the image can build: the
#    Dockerfile declares TESSERACT_VERSION, LIBTESSERACT_VERSION and
#    LEPTONICA_VERSION as build args with no defaults, so an unpinned recognizer
#    version cannot slip in. Resolve them inside the pinned base:
#
#   docker run --rm --platform=linux/amd64 \
#     node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 \
#     sh -c 'apt-get update >/dev/null && apt-cache policy tesseract-ocr libtesseract5 libleptonica-dev'
#
#   Then freeze those exact versions into preregistration.md, re-hash it, and
#   update PREREGISTRATION_SHA256 in the runner before any OCR.

# 4. Build the research image (never the production Dockerfile).
#
#   docker build --platform=linux/amd64 \
#     -f scripts/eval/docker/issue-149-native-tesseract-probe.Dockerfile \
#     --build-arg TESSERACT_VERSION=<resolved> \
#     --build-arg LIBTESSERACT_VERSION=<resolved> \
#     --build-arg LEPTONICA_VERSION=<resolved> \
#     -t issue-149-native-tesseract-probe .

# 5. Shape of each inference invocation: no network, read-only model and input
#    mounts, no repository root mounted, no corpus or fixture path mounted, and
#    a writable directory only for raw output and metrics.
#
#   docker run --rm --platform=linux/amd64 --network=none \
#     --cpus 1 --memory 2g \
#     -v "$PWD/<model-dir>":/models:ro \
#     -v "$PWD/artifacts/issue-149-native-tesseract-float-compatibility/synthetic":/inputs:ro \
#     -v "$PWD/artifacts/issue-149-native-tesseract-float-compatibility/raw":/out \
#     -e TESSDATA_PREFIX=/models -e LC_ALL=C -e LANG=C \
#     -e OMP_THREAD_LIMIT=1 -e OMP_NUM_THREADS=1 \
#     issue-149-native-tesseract-probe \
#     /usr/bin/time -v tesseract /inputs/positive.png stdout \
#       -l eng --oem 1 --psm 11 --dpi 300 tsv

# Verify synthetic input integrity.
shasum -a 256 -c artifacts/issue-149-native-tesseract-float-compatibility/synthetic/positive.png.sha256 2>/dev/null \
  || (cd artifacts/issue-149-native-tesseract-float-compatibility/synthetic && shasum -a 256 -c positive.png.sha256 && shasum -a 256 -c blank.png.sha256)

# Verify the frozen preregistration and the committed artifacts.
(cd artifacts/issue-149-native-tesseract-float-compatibility && shasum -a 256 -c preregistration.sha256)
shasum -a 256 -c artifacts/issue-149-native-tesseract-float-compatibility/artifact-manifest.sha256
