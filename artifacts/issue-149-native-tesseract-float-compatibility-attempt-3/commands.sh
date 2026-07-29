#!/usr/bin/env bash
# Issue #149 Attempt 3 — native Tesseract + tessdata_best compatibility probe.
# Synthetic only. No corpus, no production change. Verdict: INCONCLUSIVE_OUTPUT.
set -euo pipefail

# 1. Regenerate the synthetic sentinels. Refuses to write unless two independent
#    generations are byte-identical. Must reproduce:
#      positive.png 9f079b48bcc7ba5a71a0e1b84f946c621e6709739ecd260549075a0c38e3b49d
#      blank.png    8b5531768177d1a62c9e7780a1edfd5231f46681a474ad359313a979aa4d3e9d
node scripts/eval/issue-149-attempt-3-generate-inputs.mjs

# 2. Retrieve the pinned treatment model (PR #208 mechanism, reused).
node scripts/eval/fetch-issue-149-tessdata-best.mjs

# 3. Run the probe. Requires Docker and a native linux/amd64 host. It reverifies
#    the frozen runtime (base digest, package pins, tesseract binary sha256),
#    stages the pinned runtime's configs/tsv into two ephemeral non-Git tessdata
#    directories, then runs the eight fixed invocations. Fails closed on any
#    drift, on a missing configs/tsv, or on a plain-text fallback.
node --import tsx scripts/eval/run-issue-149-native-tesseract-attempt-3.ts

# Verify the frozen preregistration and inputs.
(cd artifacts/issue-149-native-tesseract-float-compatibility-attempt-3 \
  && shasum -a 256 -c preregistration.sha256 \
  && cd synthetic && shasum -a 256 -c positive.png.sha256 && shasum -a 256 -c blank.png.sha256)

# Verify the committed artifacts.
shasum -a 256 -c artifacts/issue-149-native-tesseract-float-compatibility-attempt-3/artifact-manifest.sha256
