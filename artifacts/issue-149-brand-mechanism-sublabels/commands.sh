#!/usr/bin/env bash
# Evaluation-only. Builds and validates the blinded Brand mechanism audit packet.
# Runs no OCR, no treatment, and produces no labels.
set -euo pipefail

# Build the packet (deterministic: same inputs -> same packet-manifest hash).
# Clears only reader-packet/ and generated JSON; hand-authored docs survive.
node scripts/eval/build-issue-149-brand-mechanism-packet.mjs

# Prove the blinding holds. Must pass before handing the packet to an annotator,
# and again before unblinding recorded responses.
node scripts/eval/validate-issue-149-brand-mechanism-packet.mjs
