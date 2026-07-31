# Execution workflow plan

**Specified only. No executable workflow is committed in Stage 1**, so nothing in
this PR can start OCR.

## Why it is not committed yet

A push-triggered workflow becomes live the moment it lands on the branch. Stage 1
stops for review, so the workflow file and its mode file are added in Stage 2
together, with the mode set to `discover`.

## Transport

The governed Issue #149 pattern, unchanged:

- push-triggered, `branches:` restricted to exactly
  `research/issue-149-brand-complete-evidence-acquisition`;
- `paths:` admitting **only** the workflow file and
  `artifacts/issue-149-brand-complete-evidence-acquisition/workflow-mode.txt`;
- `permissions: contents: read`;
- committed mode file with exactly three legal values: `discover`, `execute`,
  `complete`;
- **OCR runs only when the mode is exactly `execute`**;
- no `schedule`, no `pull_request_target`, no `repository_dispatch`, no unscoped
  branch trigger;
- a visible `harness revision:` counter, bumped in the same commit whenever a
  harness fix needs a rerun.

## Mode `discover` — no OCR

1. Assert the runner is native `linux/amd64` and record its identity.
2. Re-run the Stage 1 freeze script and confirm it reproduces
   `population-freeze.json` and `truth-free-input-manifest.json` bit-for-bit.
3. Verify the incumbent configuration against
   `incumbent-configuration-freeze.json`: tesseract.js and tesseract.js-core
   resolved versions, `eng.traineddata` SHA-256, OEM, page-segmentation modes,
   pass templates. Halt on any difference.
4. Verify all 115 source images by SHA-256 and byte size.
5. Confirm `preregistration.sha256` verifies.
6. Assert the acquisition input carries no truth-bearing field.

Discovery reads images to hash them. It runs no OCR pass.

## Mode `execute` — the only OCR

1. Re-verify everything discovery verified.
2. Run the **primary** matrix: all 115 cases, unchanged incumbent path, reading
   `extractionDebug` rather than the capped `CaseReport`.
3. Assert per-pass and per-case counting proofs; halt on
   `RAW_EVIDENCE_TRUNCATED`, `LINE_EVIDENCE_TRUNCATED` or
   `CANDIDATE_EVIDENCE_TRUNCATED`.
4. Scan every emitted file for banned field names; halt on
   `TRUTH_ISOLATION_FAILURE`.
5. Write and hash `raw/primary/raw-evidence-manifest.json` and its aggregate
   SHA-256. **`raw/primary/` is immutable from this point.**
6. Run the **repeat** matrix identically and freeze `raw/repeat/` the same way.
   No configuration changes between runs. No retries. No selective rerun.
7. Compare the two runs at every level in `determinism-rules.json` and report
   every difference without repairing any of it.
8. **Truth boundary.** Only now does the post-freeze evaluation open the governed
   truth, and only to validate completeness and cross-check the prior artifacts.

Both matrices run exactly once. The workflow contains no path that reruns a
single case.

## Mode `complete` — seal

No OCR. The seal run must be *observed* to skip both `discover` and `execute`,
and that observation is recorded.

## Immutability and formatting

Raw evidence is emitted in final form as JSONL and added to `.prettierignore`
before it is hashed. Nothing under `raw/` is reformatted or pretty-printed after
its manifest exists — reformatting would invalidate the proof that the evidence is
unaltered.

## Files Stage 2 will add

`scripts/eval/issue-149-brand-evidence-acquisition-run.ts` (the acquisition),
`scripts/eval/issue-149-brand-evidence-acquisition-compare.mjs` (determinism and
post-freeze evaluation), the workflow file, `workflow-mode.txt`, and the raw
evidence with its manifests. **None of them exists yet.**
