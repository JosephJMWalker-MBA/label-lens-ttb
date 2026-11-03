#!/usr/bin/env bash
# Build llama.cpp's llama-server with CUDA for a Jetson Orin (compute capability 8.7).
# Usage: sudo LLAMA_CPP_REF=<tag-or-commit> ./deploy/orin/install-llama-server.sh
set -euo pipefail

if [[ -z "${LLAMA_CPP_REF:-}" ]]; then
  echo "Set LLAMA_CPP_REF to a llama.cpp tag or commit so the reader build is reproducible." >&2
  exit 1
fi

PREFIX="${LLAMA_CPP_DIR:-/opt/llama.cpp}"
CUDA_HOME="${CUDA_HOME:-/usr/local/cuda}"

if [[ ! -x "${CUDA_HOME}/bin/nvcc" ]]; then
  echo "nvcc not found under ${CUDA_HOME}. Install the JetPack CUDA toolkit first." >&2
  exit 1
fi

apt-get update
apt-get install -y --no-install-recommends git cmake build-essential libcurl4-openssl-dev ca-certificates

if [[ ! -d "${PREFIX}/.git" ]]; then
  git clone https://github.com/ggml-org/llama.cpp "${PREFIX}"
fi
git -C "${PREFIX}" fetch --tags origin
git -C "${PREFIX}" checkout --detach "${LLAMA_CPP_REF}"

export PATH="${CUDA_HOME}/bin:${PATH}"
cmake -S "${PREFIX}" -B "${PREFIX}/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_CUDA=ON \
  -DCMAKE_CUDA_ARCHITECTURES=87 \
  -DLLAMA_CURL=ON
cmake --build "${PREFIX}/build" --config Release -j "$(nproc)" --target llama-server

BIN="${PREFIX}/build/bin/llama-server"
echo
echo "Built: ${BIN}"
echo "llama.cpp commit: $(git -C "${PREFIX}" rev-parse HEAD)"
echo "Binary sha256:    $(sha256sum "${BIN}" | cut -d' ' -f1)"
"${BIN}" --version || true
