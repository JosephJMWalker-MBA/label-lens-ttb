# Candidate lineage — a new selection, not a substitution

Refs Issue #149. Evaluation-only.

## PR #212's conclusion is preserved unchanged

PR #212 established that the selected GitHub Release checkpoint
`parseq-bb5792a6.pt` lacked an explicit licence tied to that exact release
artifact; that the licensing gate correctly stopped before retrieval; that no
compatibility inference ran; and that **no compatibility verdict exists**.

That conclusion stands. This package does not modify, reopen, reinterpret, or
substitute anything inside PR #212, and it does not relabel its blocker.

**Base-state note.** At the time this branch was cut, **PR #212 was still an open
draft and was not merged**, so `origin/main` (`791d9c9ab6a3be8f72f753253d21b47efef9726e`,
the PR #211 merge) did not contain it. This branch was taken from latest
`origin/main` as instructed. Nothing here depends on #212's artifacts being
present, and the two packages occupy separate directories, so they coexist without
conflict whenever #212 lands.

## This is a new candidate selection with its own preregistration

| | PR #212 candidate | This candidate |
| --- | --- | --- |
| Artifact | GitHub Release `parseq-bb5792a6.pt` | Hugging Face `pytorch_model.bin` |
| Source | `baudm/parseq` releases, tag `v1.0.0` | `baudm/parseq-small` at commit `a1526c3d63740e460153987f9aaf6b86aa199dc1` |
| Licence evidence | none tied to the artifact | **explicit `license: apache-2.0`** on the model card in the same commit as the weights |
| Hash attested before retrieval | no | **yes** — LFS pointer records the full SHA-256 and byte size |
| Outcome | `BLOCKED_MODEL_LICENSE`, no retrieval | gate passed, retrieval authorized |

The Hugging Face artifact is treated as **the selected artifact in its own right**,
licensed on its own evidence.

## What is deliberately not claimed

The expected SHA-256 opens `bb5792a6`, matching the short hash in the GitHub
Release filename, and both files are 95,392,675 bytes. That coincidence is
**recorded as supportive provenance only**.

This package makes **no claim that the two files are byte-identical**. Proving that
would need an authorized post-retrieval comparison of both artifacts, which is not
performed here, and the GitHub file is deliberately not retrieved. The licence
basis for this probe is the Hugging Face model card alone, and nothing
experimental depends on any relationship between the two files.

## Code lineage is unchanged

The official PARSeq implementation is pinned at
`1902db043c029a7e03a3818c616c06600af574be` — the same maintained revision PR #212
verified — under Apache-2.0 with `NOTICE`, and BSD/MIT for the bundled ABINet and
CRNN components. Floating `main` is not used.

Code provenance and model provenance are recorded **separately**, in
`code-provenance.json` and `model-repository-provenance.json`, because they are
distinct grants over distinct artifacts.
