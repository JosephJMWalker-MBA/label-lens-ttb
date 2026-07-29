#!/usr/bin/env bash
# Issue #149 — PARSeq compatibility and evidence-contract probe.
#
# STATUS: BLOCKED_MODEL_LICENSE. The checkpoint was never downloaded and no
# inference ran. The commands below are the audit steps that produced that
# determination; they are read-only and touch no model weights.
set -euo pipefail

C=1902db043c029a7e03a3818c616c06600af574be

# 1. Verify the pinned code revision exists and is the maintained revision.
curl -s "https://api.github.com/repos/baudm/parseq/commits/${C}" | head -40

# 2. Verify the v1.0.0 tag target, refuting the previously reported commit
#    315d19b88931758c5c36395b086e115049386d49.
curl -s "https://api.github.com/repos/baudm/parseq/git/ref/tags/v1.0.0"

# 3. Enumerate every licence-bearing file in the pinned tree. Four exist:
#    LICENSE (Apache-2.0), NOTICE, and BSD/MIT files for the abinet and crnn
#    components. There is no model card and no weights licence statement.
curl -s "https://api.github.com/repos/baudm/parseq/git/trees/${C}?recursive=1" \
  | grep -oE '"path": "[^"]*(licen|card|notice)[^"]*"' -i

# 4. Confirm the README licence sentence is scoped to code, and that no file
#    states a licence for the released weights.
for f in README.md Datasets.md hubconf.py NOTICE; do
  curl -sL "https://raw.githubusercontent.com/baudm/parseq/${C}/${f}" \
    | grep -niE "weights? (are|is).*licen|licen.*weights?|model licen" || true
done

# 5. Confirm the v1.0.0 release body carries no licence statement.
curl -s "https://api.github.com/repos/baudm/parseq/releases/tags/v1.0.0"

# 6. Record the author's Hugging Face model-card licences. These are explicit
#    Apache-2.0 grants, but they attach to parseq-small / parseq-tiny artifacts
#    named pytorch_model.bin, not to the selected parseq-bb5792a6.pt.
curl -s "https://huggingface.co/api/models?author=baudm"
curl -sL "https://huggingface.co/baudm/parseq-small/raw/main/README.md" | head -8

# 7. Verify the intrinsic transform from the pinned source rather than assuming it.
curl -sL "https://raw.githubusercontent.com/baudm/parseq/${C}/strhub/data/module.py" \
  | grep -A 14 "def get_transform"

# NOT RUN, deliberately: checkpoint retrieval, container build, font and synthetic
# input generation, and all four inference invocations. The licensing gate
# precedes retrieval, and it blocked.

# Verify the committed artifacts of this package.
shasum -a 256 -c artifacts/issue-149-parseq-compatibility-probe/artifact-manifest.sha256
