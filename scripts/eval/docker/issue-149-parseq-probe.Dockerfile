# Issue #149 — research-only PARSeq CPU probe container.
#
# RESEARCH ONLY. Never built, referenced or deployed by the production path. It
# does not modify, extend or share layers with the production `Dockerfile`, and
# no Python is installed into the production application.
#
# Contains no corpus image, no fixture, no fixture truth and no model weights:
# the checkpoint is mounted read-only at run time.
#
# Build may use the network to fetch pinned packages and pinned source.
# Inference runs with `--network=none`.
FROM --platform=linux/amd64 python:3.11-slim-bookworm@sha256:b18992999dbe963a45a8a4da40ac2b1975be1a776d939d098c647482bcad5cba

# Required build args with NO defaults, so the build fails closed rather than
# floating a font or source revision between builds.
ARG FONT_PACKAGE_VERSION
ARG PARSEQ_COMMIT

RUN test -n "${FONT_PACKAGE_VERSION}" \
      || (echo "BUILD_ARG_REQUIRED: FONT_PACKAGE_VERSION" >&2; exit 1) \
 && test -n "${PARSEQ_COMMIT}" \
      || (echo "BUILD_ARG_REQUIRED: PARSEQ_COMMIT" >&2; exit 1)

# One pinned, license-compatible font package. DejaVu is used because it ships in
# Debian under the permissive DejaVu Fonts License and gives real glyph outlines
# rather than hand-drawn rectangles.
RUN apt-get update \
 && apt-get install --no-install-recommends -y \
      "fonts-dejavu-core=${FONT_PACKAGE_VERSION}" \
      curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Upstream's own fully-pinned CPU lock at the pinned commit, used verbatim rather
# than a hand-invented pin set. It carries the CPU wheel index and exact versions
# for torch, torchvision, pytorch-lightning, timm, numpy, Pillow, nltk and every
# transitive dependency.
RUN curl -fsSL -o /tmp/core.txt \
      "https://raw.githubusercontent.com/baudm/parseq/${PARSEQ_COMMIT}/requirements/core.txt" \
 && pip install --no-cache-dir -r /tmp/core.txt \
 && rm /tmp/core.txt

# `strhub.data.module` transitively imports `strhub.data.dataset`, which imports
# lmdb. lmdb is absent from upstream's core lock because it is only needed for
# dataset access, but the import runs at module load and so is required to reach
# the official `SceneTextDataModule.get_transform`. The pin is taken from
# upstream's own requirements/test.txt at the same commit rather than invented.
RUN pip install --no-cache-dir "lmdb==1.4.1"

# Pinned PARSeq source. The tarball is extracted rather than pip-installed so the
# `configs/` tree the official loader reads stays on disk at a known root.
RUN curl -fsSL -o /tmp/parseq.tar.gz \
      "https://codeload.github.com/baudm/parseq/tar.gz/${PARSEQ_COMMIT}" \
 && mkdir -p /opt \
 && tar -xzf /tmp/parseq.tar.gz -C /opt \
 && mv "/opt/parseq-${PARSEQ_COMMIT}" /opt/parseq \
 && rm /tmp/parseq.tar.gz

COPY scripts/eval/parseq/generate_synthetic_inputs.py /opt/probe/generate_synthetic_inputs.py
COPY scripts/eval/parseq/run_probe.py /opt/probe/run_probe.py
COPY scripts/eval/parseq/run_brand_contrast.py /opt/probe/run_brand_contrast.py

# Record the runtime inventory inside the image so it can be read back without
# re-resolving anything at inference time.
RUN set -eu; mkdir -p /probe; \
    { \
      echo "python=$(python --version 2>&1)"; \
      echo "font_pkg=$(dpkg-query -W -f='${Package}=${Version}' fonts-dejavu-core)"; \
      echo "font_path=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; \
      echo "font_sha256=$(sha256sum /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf | cut -d' ' -f1)"; \
      echo "parseq_commit=${PARSEQ_COMMIT}"; \
      echo "arch=$(dpkg --print-architecture)"; \
      echo "uname=$(uname -m)"; \
    } > /probe/runtime-inventory.txt; \
    pip freeze > /probe/pip-freeze.txt

ENV PYTHONPATH=/opt/parseq \
    PYTHONHASHSEED=0 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    CUBLAS_WORKSPACE_CONFIG=:4096:8 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    TORCH_HOME=/tmp/torch

WORKDIR /opt/probe
