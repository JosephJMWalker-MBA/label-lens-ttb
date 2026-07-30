# Execution workflow plan

Refs Issue #149. **Plan only.** No workflow file, runner or container invocation
exists in this PR, and no model has been downloaded.

## Why the harness is not in this PR

A push-triggered workflow scoped to this branch would become live the moment it is
committed. This stage is preregistration and scaffolding only, so the workflow is
specified here and added in the execution PR, together with its mode file set to
`discover`.

## Transport

The pattern is the one established by PR #210 and reused by PR #213 and PR #215:

- push-triggered, `branches:` restricted to exactly
  `research/issue-149-brand-ppocrv6-small-onnx-contrast`;
- `paths:` admitting **only** the workflow file and
  `artifacts/issue-149-brand-ppocrv6-small-onnx-contrast/workflow-mode.txt`, so no
  ordinary code or artifact commit can retrigger inference;
- committed mode file with exactly three legal values: `discover`, `execute`,
  `complete`;
- inference runs only when the mode is exactly `execute`;
- after results are committed the mode becomes `complete`, and the seal run must
  be observed to skip inference;
- no `pull_request_target`, no `schedule`, no `repository_dispatch`, no unscoped
  branch trigger, and `permissions: contents: read`;
- a `harness revision:` counter in the workflow header, bumped in the same commit
  whenever a harness fix needs a rerun, so every rerun is explicit and reviewable.

## Mode `discover`

1. Assert the runner is native `linux/amd64`.
2. Re-run `scripts/eval/issue-149-brand-ppocrv6-contrast-prepare.mjs` and confirm
   it reproduces the staged inputs and the Arm A carry-forward bit-for-bit.
3. Verify the pinned model revision is still **retrievable** and that
   `inference.onnx`, `inference.yml`, their SHA-256 values, their byte sizes and
   the Apache-2.0 model-card licence all match `arm-b-provenance.json`.
   - Record the repository's current default-branch head in
     `upstream-head-observation.json`. **A changed head does not halt the run.**
     An immutable approved revision is not invalidated by a later upstream commit.
     Only a failure of the pinned-revision checks halts.
4. Rebuild the pinned research container from
   `scripts/eval/docker/issue-149-ppocrv6-onnx-probe.Dockerfile` and record the
   image id and `pip freeze`.
5. Retrieve `inference.onnx` through the existing fail-closed script
   `scripts/eval/fetch-issue-149-ppocrv6-onnx.mjs`.
6. Confirm `preregistration.sha256` still verifies.

Discovery runs no inference against any Brand crop.

## Mode `execute`

1. Verify `preregistration.sha256`, the six staged input hashes, and the twelve
   Arm A carried hashes.
2. Rebuild the container from the frozen pins.
3. Run the twelve Arm B invocations offline: `--network=none`, model, config and
   inputs mounted read-only, no repository root, no corpus, no fixture truth, no
   `evaluation/` directory, no `arm-a-frozen/` directory.
4. Write per-invocation descriptors and the raw probability tensors, then write
   `raw-output-manifest.json` hashing all of them.
5. **Truth boundary.** Only after that manifest exists does the evaluation phase
   load `evaluation/id-map.json` and the governed Brand truth.
6. Recompute Arm A metrics from the carried raw outputs using the same scoring
   code path as Arm B; cross-check against PR #214's published values and report
   any discrepancy rather than preferring either silently.
7. Emit per-item, pixel-set, crop-cluster, case and design results; the
   determinism report; the score-ordering diagnostics; the truth-isolation report;
   and the typed verdict.
8. Conduct the visual-support review per `visual-support-protocol.md`.

## Mode `complete`

No inference. The seal run must be observed to skip both the discover and execute
jobs, and that observation is recorded.

## Output naming, fixed now

The Arm B tensor artifacts use, and only use:

- `rawModelOutputTensor` — the tensor as the graph emits it;
- `rawProbabilityTensor` — the same values, named for what they are;
- `probabilityTensorSha256`.

**The word `logits` must not appear in any Arm B filename or field**, because the
graph emits probabilities. No softmax is applied.

## Determinism

Each item's primary and repeat must agree byte-for-byte on the probability tensor
file and on the argmax sequence, collapsed sequence, transcript and fingerprint.
Any mismatch classifies the item `PPOCRV6_NONDETERMINISTIC` and blocks a KEEP.

## Files the execution PR will add

`scripts/eval/ppocrv6/run_brand_contrast.py`, a Node orchestrator, the workflow
file, `workflow-mode.txt`, and the result artifacts. None of them exists yet.
