#!/usr/bin/env bash
# Issue #149 — PP-OCRv6-small ONNX versus frozen incumbent Tesseract Brand evidence.
# PLANNING STAGE. Nothing here downloads a model or runs inference.
set -euo pipefail

ART=artifacts/issue-149-brand-ppocrv6-small-onnx-contrast

# 1. Stage the frozen population and carry Arm A forward. Deterministic and
#    evaluation-only: verifies the six source PNGs against merged PR #214 by
#    SHA-256 and byte size, verifies the 5/6/5/4/3 structure, stages byte-identical
#    copies under fresh opaque identifiers, and re-hashes all twelve Arm A raw
#    outputs against PR #214's raw-output-manifest.json. Halts on any mismatch.
node scripts/eval/issue-149-brand-ppocrv6-contrast-prepare.mjs

# 2. Verify the frozen preregistration.
( cd "${ART}" && shasum -a 256 -c preregistration.sha256 )

# 3. Confirm the inference input directory carries no truth-bearing name.
ls -1 "${ART}/inference-inputs"

# --- NOT PART OF THIS STAGE ---------------------------------------------------
# Model retrieval, container build and the twelve Arm B invocations are added in
# the execution PR, behind the push-triggered workflow described in
# workflow-plan.md. They run only when the committed mode file reads exactly
# `execute`. No command in this file can start them.
