#!/usr/bin/env bash
# Download one vision model and its projector from Hugging Face, once, and print digests.
# Usage: sudo ./deploy/orin/fetch-model.sh <hf-repo> <model-file.gguf> <mmproj-file.gguf> [revision]
# Optional: HF_TOKEN for gated repos.
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <hf-repo> <model-file.gguf> <mmproj-file.gguf> [revision]" >&2
  exit 1
fi

REPO="$1"
MODEL_FILE="$2"
MMPROJ_FILE="$3"
REVISION="${4:-main}"
DEST="${VISION_MODEL_DIR:-/opt/label-lens-vision/models}/$(echo "${REPO}" | tr '/' '__')"

mkdir -p "${DEST}"
AUTH=()
if [[ -n "${HF_TOKEN:-}" ]]; then
  AUTH=(-H "Authorization: Bearer ${HF_TOKEN}")
fi

for FILE in "${MODEL_FILE}" "${MMPROJ_FILE}"; do
  if [[ -s "${DEST}/${FILE}" ]]; then
    echo "Already present: ${DEST}/${FILE}"
    continue
  fi
  echo "Downloading ${REPO}@${REVISION}/${FILE}"
  curl --fail --location --continue-at - "${AUTH[@]}" \
    -o "${DEST}/${FILE}.part" \
    "https://huggingface.co/${REPO}/resolve/${REVISION}/${FILE}"
  mv "${DEST}/${FILE}.part" "${DEST}/${FILE}"
done

echo
echo "Record these in vision.env and in the evaluation provenance:"
echo "VISION_MODEL_PATH=${DEST}/${MODEL_FILE}"
echo "VISION_MMPROJ_PATH=${DEST}/${MMPROJ_FILE}"
sha256sum "${DEST}/${MODEL_FILE}" "${DEST}/${MMPROJ_FILE}"
