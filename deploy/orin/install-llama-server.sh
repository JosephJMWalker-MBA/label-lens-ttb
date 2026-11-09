#!/usr/bin/env bash
# Build llama.cpp's llama-server with CUDA for a Jetson Orin (compute capability 8.7).
# Controlled build for Jetson Orin Nano (8 GB) using capped parallelism (-j2).
# Usage: sudo LLAMA_CPP_REF=998200491327347eed85f007e4de7a1a7c871453 ./deploy/orin/install-llama-server.sh
set -euo pipefail

LLAMA_CPP_REF="${LLAMA_CPP_REF:-998200491327347eed85f007e4de7a1a7c871453}"
PREFIX="${LLAMA_CPP_DIR:-/opt/llama.cpp}"
CUDA_HOME="${CUDA_HOME:-/usr/local/cuda}"
BUILD_JOBS="${BUILD_JOBS:-2}"

if [[ ! -x "${CUDA_HOME}/bin/nvcc" ]]; then
  echo "nvcc not found under ${CUDA_HOME}. Install the JetPack CUDA toolkit first." >&2
  exit 1
fi

# Pre-flight check: ensure libcurl4-openssl-dev is present
if ! dpkg -s libcurl4-openssl-dev >/dev/null 2>&1; then
  echo "Installing missing dependency libcurl4-openssl-dev..."
  apt-get update
  apt-get install -y --no-install-recommends libcurl4-openssl-dev
fi

if [[ ! -d "${PREFIX}/.git" ]]; then
  git clone https://github.com/ggml-org/llama.cpp "${PREFIX}"
fi
git -C "${PREFIX}" fetch --tags origin
git -C "${PREFIX}" checkout --detach "${LLAMA_CPP_REF}"

export PATH="${CUDA_HOME}/bin:${PATH}"
# Note: LLAMA_CURL is deprecated in recent llama.cpp releases; cmake handles HTTP/networking natively or via cpp-httplib.
cmake -S "${PREFIX}" -B "${PREFIX}/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_CUDA=ON \
  -DCMAKE_CUDA_ARCHITECTURES=87

echo "Starting build with -j ${BUILD_JOBS} to prevent memory exhaustion..."
cmake --build "${PREFIX}/build" --config Release -j "${BUILD_JOBS}" --target llama-server

BIN="${PREFIX}/build/bin/llama-server"
echo
echo "Built: ${BIN}"
echo "llama.cpp commit: $(git -C "${PREFIX}" rev-parse HEAD)"
echo "Binary sha256:    $(sha256sum "${BIN}" | cut -d' ' -f1)"
"${BIN}" --version || true
