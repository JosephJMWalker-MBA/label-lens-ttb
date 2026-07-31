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
- `permissions: contents: read` — the OCR job cannot push, and is never granted
  `contents: write`;
- committed mode file with exactly three legal values: `discover`, `execute`,
  `complete`;
- **OCR runs only when the mode is exactly `execute`**;
- no `schedule`, no `pull_request_target`, no `repository_dispatch`, no unscoped
  branch trigger;
- a visible `harness revision:` counter, bumped in the same commit whenever a
  harness fix needs a rerun.

## Runtime boundary

Discover and execute both run inside the boundary frozen in
`acquisition-runtime-isolation-contract.json`: no repository checkout, no `.git`,
no `artifacts/`, no fixtures, no eval manifest, no ID map, no truth, no
credentials, no environment inheritance; network disabled, read-only root, all
capabilities dropped, `no-new-privileges`. Writable space is the read-write
**output bind mount** plus a named `tmpfs` for scratch — nothing else is
writable. The invariant is **four experiment-controlled data mounts** plus an
explicit allowlist of the pseudo-filesystems every container unavoidably carries;
"exactly four mounts" was not implementable and is superseded. The runtime bundle
is allowlisted and must not be built with an unrestricted repository `COPY`.

The design is two-phase. **Phase 1 is trusted host preparation**: the freeze
script stages the opaque images and writes the truth-free manifest on the host,
outside the boundary. **Phase 2 is the isolated discover run**, which sees only
the staged inputs. Phase 1 never runs inside the boundary and phase 2 never
prepares its own inputs.

**Discover mode must run inside that same boundary and stop for review before
execute is authorized.** Neither the workflow nor the runtime bundle is
implemented in this amendment.

## Mode `discover` — no OCR

1. Assert the runner is native `linux/amd64` and record its identity.
2. Re-run the Stage 1 freeze script and confirm it reproduces
   `population-freeze.json`, `truth-free-input-manifest.json` and
   `post-freeze/id-map.json` bit-for-bit, and restages the 115 opaque images.
3. Verify the incumbent configuration against
   `incumbent-configuration-freeze.json`: tesseract.js and tesseract.js-core
   resolved versions, `eng.traineddata` SHA-256, OEM, page-segmentation modes,
   pass templates, **and the `field-selection.ts` SHA-256
   `8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c`**. Halt on
   any difference.
4. Verify all 115 source images by SHA-256 and byte size.
5. Confirm `preregistration.sha256` verifies.
6. Assert the acquisition input carries no truth-bearing field.

Discovery reads images to hash them. It runs no OCR pass.

## Mode `execute` — the only OCR

1. Re-verify everything discovery verified.
2. Run the **primary** matrix: all 115 opaque items through a DIRECT
   `extractLabelEvidenceDetailed` call — never `runCaseArtifacts` — then obtain
   complete diagnostics with a second, exact-pass-set call to
   `selectBrandObservationWithCompleteFilterDiagnostics`, asserting **full-object
   canonical parity** against `debug.finalSelections.brand` once only
   `filterChecks` and `activeRejectionReasons` are removed, and halting on
   `BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE`. Parity is whole-object equality;
   no field allowlist is authoritative. The container mounts only
   `.local/issue-149-acquisition-inputs` read-only and an empty output
   directory. The post-freeze ID map is not mounted.
3. Persist the **complete ordered `RegionOcrResult` array** — all thirteen fields
   of every pass, in emission order — per
   `region-ocr-result-replay-contract.json`; halt on `PASS_EVIDENCE_TRUNCATED` or
   `PASS_ORDER_MISMATCH`. This is what makes the counterfactual in capability 3
   replayable later, without OCR.
4. Assert per-pass and per-case counting proofs; halt on
   `RAW_EVIDENCE_TRUNCATED`, `LINE_EVIDENCE_TRUNCATED` or
   `CANDIDATE_EVIDENCE_TRUNCATED`.
5. Scan every emitted file for banned field names; halt on
   `TRUTH_ISOLATION_FAILURE`.
6. Write and hash `raw/primary/raw-evidence-manifest.json` and its aggregate
   SHA-256. **`raw/primary/` is immutable from this point.**
7. Run the **repeat** matrix identically and freeze `raw/repeat/` the same way.
   No configuration changes between runs. No retries. No selective rerun.
8. Compare the two runs at every level in `determinism-rules.json` and report
   every difference without repairing any of it.
9. **Transport.** The OCR job holds `contents: read` and therefore **never
   commits anything**. At every size it uploads the complete lossless evidence as
   a **temporarily retained workflow artifact**, records the artifact ID, exact
   bytes, SHA-256, configured retention and expected expiration, and verifies the
   uploaded digest **before** any job-local output is deleted. It then reports
   exact total bytes, bytes by category and largest files, and applies the
   **100 MB gate**: at or below 100 MB it stops after verification, and a
   separate, owner-authorized post-run process — not the OCR process — downloads
   the artifact, re-verifies the digest and commits the evidence to PR #219;
   above 100 MB it stops before Git commitment, **stops before post-freeze truth
   evaluation**, and requires an explicit owner decision about durable archival.
   A workflow artifact is retention-bound and is never called permanent
   preservation.
10. **Truth boundary.** Only after both raw manifests verify does the post-freeze
    evaluation open `post-freeze/id-map.json` and the governed truth, to attach
    historical identity, validate completeness and cross-check the prior
    artifacts.

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
