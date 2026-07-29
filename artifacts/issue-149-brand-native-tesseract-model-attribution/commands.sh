#!/usr/bin/env bash
# Issue #149 — Brand native-runtime / float-model attribution benchmark.
# Evaluation-only. Three arms over frozen governed Brand crop pixels.
set -euo pipefail

# 1. Freeze the population and recover the governed preprocessed crop bytes.
#    Recovers (does not recompute) the committed bounded-Brand control PNGs and
#    writes them under opaque item ids. No OCR, no truth read.
node scripts/eval/issue-149-brand-attribution-prepare.mjs

# 2. Retrieve the pinned float model (verified PR #208 mechanism).
node scripts/eval/fetch-issue-149-tessdata-best.mjs

# 3. Run the benchmark. Requires Docker and a native linux/amd64 host.
#    Arm A runs tesseract.js in-process; Arms B and C run native Tesseract in the
#    pinned container with --network=none and read-only mounts. All raw output is
#    hashed before Brand truth is read. Fails closed on any pin or hash drift.
node --import tsx scripts/eval/run-issue-149-brand-native-attribution.ts

# Verify the frozen preregistration and the inference inputs.
(cd artifacts/issue-149-brand-native-tesseract-model-attribution && shasum -a 256 -c preregistration.sha256)

# Verify the committed artifacts.
shasum -a 256 -c artifacts/issue-149-brand-native-tesseract-model-attribution/artifact-manifest.sha256
