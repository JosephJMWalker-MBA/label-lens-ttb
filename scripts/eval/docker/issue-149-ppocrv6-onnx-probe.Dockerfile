# Issue #149 — research-only PP-OCRv6-small ONNX CPU probe container.
#
# RESEARCH ONLY. Never built, referenced or deployed by the production path. It
# does not modify, extend or share layers with the production `Dockerfile`, and
# no Python is installed into the production application.
#
# Contains no corpus image, no fixture, no fixture truth and no model weights:
# the ONNX file is mounted read-only at run time.
#
# Build may use the network to fetch pinned packages. Inference runs with
# `--network=none`.
FROM --platform=linux/amd64 python:3.11-slim-bookworm@sha256:b18992999dbe963a45a8a4da40ac2b1975be1a776d939d098c647482bcad5cba

# Required build arg with NO default, so the build fails closed rather than
# floating the font package between builds.
ARG FONT_PACKAGE_VERSION

RUN test -n "${FONT_PACKAGE_VERSION}" \
      || (echo "BUILD_ARG_REQUIRED: FONT_PACKAGE_VERSION" >&2; exit 1)

# One pinned, licence-compatible font package. DejaVu ships in Debian under the
# permissive DejaVu Fonts License and gives real glyph outlines. Same font
# governance as the PARSeq probe.
RUN apt-get update \
 && apt-get install --no-install-recommends -y \
      "fonts-dejavu-core=${FONT_PACKAGE_VERSION}" \
 && rm -rf /var/lib/apt/lists/*

# Fully pinned CPU dependency set.
#   onnxruntime      — the only authorized runtime for this probe (§7).
#   onnx             — read the model's opset and graph metadata during discovery.
#   opencv-python-headless — cv2.resize/INTER_LINEAR, to reproduce the pinned
#                      upstream `resize_norm_img` exactly rather than approximate
#                      it with a different resampler.
#   pillow           — render the synthetic sentinel.
#   pyyaml           — parse PostProcess.character_dict from inference.yml.
#   numpy            — tensors and raw logit persistence.
# The exact versions are engineering pins resolved during discovery; the plan
# fixes only that onnxruntime must be CPU and >= 1.16.0.
RUN pip install --no-cache-dir \
      "onnxruntime==1.28.0" \
      "onnx==1.22.0" \
      "opencv-python-headless==4.14.0.94" \
      "pillow==12.3.0" \
      "pyyaml==6.0.3" \
      "numpy==2.4.6"

# Evaluation scripts. Adding one here does not change any runtime pin: the base
# digest, every package version and the font package are unchanged from the build
# that produced the PR #215 compatibility verdict. Only the copied script set
# differs, so the built image id differs and both are recorded.
COPY scripts/eval/ppocrv6/inspect_model.py /opt/probe/inspect_model.py
COPY scripts/eval/ppocrv6/generate_synthetic_inputs.py /opt/probe/generate_synthetic_inputs.py
COPY scripts/eval/ppocrv6/run_probe.py /opt/probe/run_probe.py
COPY scripts/eval/ppocrv6/run_brand_contrast.py /opt/probe/run_brand_contrast.py

# Record the runtime inventory inside the image so it can be read back without
# re-resolving anything at inference time.
RUN set -eu; mkdir -p /probe; \
    { \
      echo "python=$(python --version 2>&1)"; \
      echo "onnxruntime=$(python -c 'import onnxruntime; print(onnxruntime.__version__)')"; \
      echo "onnxruntime_providers=$(python -c 'import onnxruntime; print(",".join(onnxruntime.get_available_providers()))')"; \
      echo "onnx=$(python -c 'import onnx; print(onnx.__version__)')"; \
      echo "opencv=$(python -c 'import cv2; print(cv2.__version__)')"; \
      echo "numpy=$(python -c 'import numpy; print(numpy.__version__)')"; \
      echo "pillow=$(python -c 'import PIL; print(PIL.__version__)')"; \
      echo "pyyaml=$(python -c 'import yaml; print(yaml.__version__)')"; \
      echo "font_pkg=$(dpkg-query -W -f='${Package}=${Version}' fonts-dejavu-core)"; \
      echo "font_path=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; \
      echo "font_sha256=$(sha256sum /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf | cut -d' ' -f1)"; \
      echo "arch=$(dpkg --print-architecture)"; \
      echo "uname=$(uname -m)"; \
    } > /probe/runtime-inventory.txt; \
    pip freeze > /probe/pip-freeze.txt

ENV PYTHONHASHSEED=0 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    HF_HUB_OFFLINE=1

WORKDIR /opt/probe
