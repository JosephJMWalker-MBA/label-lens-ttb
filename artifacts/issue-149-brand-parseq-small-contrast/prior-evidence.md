# Prior evidence — preserved unchanged

Refs Issue #149. These findings are carried forward verbatim. Nothing in this
benchmark reopens, reinterprets or relabels them.

## PR #212 — blocked GitHub Release checkpoint

- Verdict: **`BLOCKED_MODEL_LICENSE`**.
- The GitHub Release checkpoint was **never downloaded**.
- **No compatibility verdict exists** for that artifact.

## PR #213 — explicitly licensed Hugging Face checkpoint

- Verdict: **`COMPATIBLE`**.
- Code commit `1902db043c029a7e03a3818c616c06600af574be`.
- Model repository commit `a1526c3d63740e460153987f9aaf6b86aa199dc1`.
- Checkpoint SHA-256 `bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00`, 95,392,675 bytes.
- Canonical decoding: autoregressive, greedy argmax, one refinement iteration, no sampling.
- Exact deterministic raw logits were demonstrated.
- **PARSeq's charset contains no space.**
- **PARSeq has no natural abstention** and emitted `10` on a blank image.
- Native sequence confidence is **not calibrated** for Label Lens authority.
- Training-data production due diligence remains **unresolved**.

## Consequences for this benchmark

No compatibility probing and no synthetic inference is repeated here. The
established stack is used as-is.

The no-space charset is handled openly through three separate text
representations rather than hidden by preprocessing. The absence of abstention and
the uncalibrated confidence are why the canonical false-reliable-read measure is
reported as `NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING` rather than as zero.
