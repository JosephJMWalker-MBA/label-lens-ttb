#!/usr/bin/env bash
# Evaluation-only. Reproduces the orientation-attribution experiment and the
# approved-wine-023 boundary-stability repeats. No production behavior change.
set -euo pipefail

# Geometry audit (crops + overlays + containment) -- prerequisite, frozen first.
node scripts/eval/run-issue-149-alcohol-low-confidence-geometry-audit.mjs

# Orientation attribution: control / treatment / rot180, each with one exact repeat.
npx vite-node --config vitest.config.ts \
  scripts/eval/run-issue-149-alcohol-recovery-orientation-attribution.ts

# Two additional treatment repeats for the boundary-confidence case only.
npx vite-node --config vitest.config.ts \
  scripts/eval/run-issue-149-alcohol-023-boundary-repeats.ts
