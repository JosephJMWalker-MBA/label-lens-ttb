# Issue #149 — native Tesseract float-model compatibility probe.
#
# RESEARCH ONLY. This image is never built, referenced, or deployed by the
# production path. It does not modify, extend, or share layers with the
# production `Dockerfile`. It contains no corpus image, no fixture, and no
# fixture truth, and it embeds no traineddata: both models are mounted
# read-only at run time.
#
# Target architecture is linux/amd64, declared explicitly so that an ARM host
# must go through emulation rather than silently probing a different
# architecture. Any latency or memory figure gathered under emulation is
# diagnostic only and must not support a production-performance claim.
#
# Base is pinned by immutable digest to the same Debian Bookworm family the
# repository's production deployment path uses (`node:22-bookworm-slim`).
#   manifest list : sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3
#   linux/amd64   : sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27
FROM --platform=linux/amd64 node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

# Exact package versions. These have NO defaults on purpose: the build fails
# closed unless the operator supplies versions resolved from a real `apt-cache
# policy` run inside this pinned base. An unpinned `apt-get install` would
# silently float the recognizer version between builds, which would void the
# "one pinned native runtime" property this probe exists to establish.
ARG TESSERACT_VERSION
ARG LIBTESSERACT_VERSION
ARG LEPTONICA_VERSION

RUN test -n "${TESSERACT_VERSION}" \
      || (echo "BUILD_ARG_REQUIRED: TESSERACT_VERSION" >&2; exit 1) \
 && test -n "${LIBTESSERACT_VERSION}" \
      || (echo "BUILD_ARG_REQUIRED: LIBTESSERACT_VERSION" >&2; exit 1) \
 && test -n "${LEPTONICA_VERSION}" \
      || (echo "BUILD_ARG_REQUIRED: LEPTONICA_VERSION" >&2; exit 1)

# Exactly one native Tesseract package version. No language packs are installed:
# the probe supplies `eng` itself through a read-only TESSDATA_PREFIX mount, so
# the image cannot accidentally shadow the model under test.
RUN apt-get update \
 && apt-get install --no-install-recommends -y \
      "tesseract-ocr=${TESSERACT_VERSION}" \
      "libtesseract5=${LIBTESSERACT_VERSION}" \
      "libleptonica-dev=${LEPTONICA_VERSION}" \
      time \
 && rm -rf /var/lib/apt/lists/*

# Record the runtime inventory inside the image so it can be read back out
# without re-resolving anything at inference time.
RUN set -eu; \
    mkdir -p /probe; \
    { \
      echo "tesseract_version_raw<<EOF"; tesseract --version 2>&1; echo "EOF"; \
      echo "tesseract_path=$(command -v tesseract)"; \
      echo "tesseract_sha256=$(sha256sum "$(command -v tesseract)" | cut -d' ' -f1)"; \
      echo "ldd<<EOF"; ldd "$(command -v tesseract)" 2>&1; echo "EOF"; \
      echo "dpkg<<EOF"; dpkg-query -W -f='${Package}=${Version}\n' \
        tesseract-ocr libtesseract5 libleptonica-dev time 2>&1; echo "EOF"; \
      echo "arch=$(dpkg --print-architecture)"; \
      echo "uname=$(uname -m)"; \
    } > /probe/runtime-inventory.txt

# No language data is baked in. TESSDATA_PREFIX is supplied per invocation as a
# read-only mount so the control and treatment models are the only difference
# between arms.
ENV LC_ALL=C \
    LANG=C \
    OMP_THREAD_LIMIT=1 \
    OMP_NUM_THREADS=1

# No ENTRYPOINT: every invocation passes an explicit, recorded command so that
# nothing about the run is implicit.
WORKDIR /work
