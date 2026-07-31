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

## Phase 1 — trusted host preparation, outside isolation, no OCR

These steps need the repository checkout, the Stage 1 artifacts and the
post-freeze map. **None of those exists inside the isolated boundary**, so they
run on the host, before isolation. Amendment 3 correctly split the phases in the
runtime contract but left this document listing them under `discover`; that is
corrected here.

1. Check out and verify the Stage 1 contract package against
   `stage-1-contract-manifest.sha256`.
2. Verify `preregistration.sha256`.
3. Run the freeze/staging script and confirm it reproduces
   `population-freeze.json`, `truth-free-input-manifest.json` and
   `post-freeze/id-map.json` bit-for-bit, restaging the 115 opaque images.
4. Verify all 115 source images by SHA-256 and byte size, and verify the
   post-freeze ID map.
5. Verify the incumbent configuration against
   `incumbent-configuration-freeze.json`: tesseract.js and tesseract.js-core
   resolved versions, `eng.traineddata` SHA-256, OEM, page-segmentation modes,
   pass templates, **and the `field-selection.ts` SHA-256
   `8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c`**. Halt on
   any difference.
6. Build the allowlisted runtime bundle. **No unrestricted repository `COPY`.**
7. Generate the **complete dependency closure** — a bundler metafile or
   equivalent full module graph — for every runtime input module, and halt with
   `BUNDLE_PROHIBITED_DEPENDENCY` if any transitive source input resolves under
   `src/fixtures/**`, `tests/**`, `artifacts/**`, `src/domain/rules/**`, the eval
   manifest, governed truth or a prior per-case report. Source maps carry no
   embedded `sourcesContent` from prohibited paths.
8. Write the bundle manifest: every source input path and SHA-256, every emitted
   path and SHA-256, the exact build command, the build tool version, and the
   metafile digest.
9. Scan the built bundle for historical case IDs, historical fixture paths and
   prohibited truth-bearing keys; halt with `BUNDLE_PROHIBITED_CONTENT`. This
   scan does **not** look for legitimate Brand strings — a transcript may contain
   the Brand text, and that is evidence, not leakage.
10. Prepare the initially empty output mount.

Host preparation owns the transitive dependency proof. The Stage 1 runner-source
guard is a useful first-order check and is explicitly not a substitute for it.

## Mode `discover` — inside the execute boundary, no OCR

Isolated discovery receives **exactly four experiment-controlled data mounts**:

1. the runtime bundle, read-only;
2. `truth-free-input-manifest.json`, read-only;
3. the staged opaque images, read-only;
4. an initially empty output directory, read-write;

plus only the frozen pseudo-filesystem allowlist and the named `tmpfs` scratch
paths.

**Inside isolated discovery, do not:** re-run the freeze script; read
`preregistration.md`; read the Stage 1 artifacts directory; read fixtures or any
original source path; open the post-freeze ID map. Those resources are not
present, and claiming they are checked here would be false.

**Inside isolated discovery, verify only what is actually mounted:**

1. Assert the runner is native `linux/amd64` and record its identity.
2. Verify the runtime bundle against its manifest — every mounted emitted path
   matches its recorded SHA-256.
3. Verify the truth-free manifest, and every staged opaque image by SHA-256 and
   byte size.
4. Recursively list every accessible mounted file and report it.
5. Assert only the four experiment-controlled data mounts exist, plus the
   allowlisted pseudo-filesystem classes.
6. Assert read-only root; assert only the output mount and the named `tmpfs`
   paths are writable.
7. Assert the environment matches the allowlist and carries no credential.
8. Assert network is unavailable.
9. Assert the forbidden paths cannot be opened: the repository root, `.git`,
   `artifacts/`, fixtures, the eval manifest, the post-freeze ID map, governed
   truth.
10. Assert the acquisition input carries no truth-bearing field.

Discovery reads images to hash them. It runs no OCR pass, and **it stops for
owner review before execute is authorized.**

## Mode `execute` — the only OCR

The container receives the same **four experiment-controlled data mounts** as
discovery — runtime bundle, truth-free manifest, staged images, empty output —
and nothing else. The post-freeze ID map is not mounted.

1. Re-verify everything discovery verified.
2. Run the **primary** matrix: all 115 opaque items through a DIRECT
   `extractLabelEvidenceDetailed` call — never `runCaseArtifacts` — then obtain
   complete diagnostics with a second, exact-pass-set call to
   `selectBrandObservationWithCompleteFilterDiagnostics`, asserting **full-object
   canonical parity** against `debug.finalSelections.brand` once only
   `filterChecks` and `activeRejectionReasons` are removed, and halting on
   `BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE`. Parity is whole-object equality;
   no field allowlist is authoritative.
3. Persist the **complete ordered `RegionOcrResult` array** — all thirteen fields
   of every pass, in emission order — per
   `region-ocr-result-replay-contract.json`; halt on `PASS_EVIDENCE_TRUNCATED` or
   `PASS_ORDER_MISMATCH`. This is what makes the counterfactual in capability 3
   replayable later, without OCR.
4. Finalize every candidate through `finalizeCandidateRecord`, which validates the
   complete evidence schema **before** hashing and refuses any record missing a
   required own property.
5. On a case-level extractor failure, persist the typed failure record — error
   code, message, issues, opaque item ID, source-image SHA-256. **No partial
   debug object is invented and no failed item is retried.**
6. Assert per-pass and per-case counting proofs; halt on
   `RAW_EVIDENCE_TRUNCATED`, `LINE_EVIDENCE_TRUNCATED` or
   `CANDIDATE_EVIDENCE_TRUNCATED`.
7. Scan every emitted file for banned field names; halt on
   `TRUTH_ISOLATION_FAILURE`.
8. Write and hash `raw/primary/raw-evidence-manifest.json` and its aggregate
   SHA-256. **`raw/primary/` is immutable from this point.**
9. Run the **repeat** matrix identically and freeze `raw/repeat/` the same way.
   No configuration changes between runs. No retries. No selective rerun.
10. Compare the two runs at every **semantic** level in `determinism-rules.json`
    and report every difference without repairing any of it. Timings and run
    metadata are persisted and reported descriptively, and **never alone**
    produce `COMPLETE_WITH_NONDETERMINISM`.
11. **Transport.** The OCR job holds `contents: read` and therefore **never
    commits anything**. At every size it uploads the complete lossless evidence
    as a **temporarily retained workflow artifact**, records the artifact ID,
    exact bytes, SHA-256, configured retention and expected expiration, and
    verifies the uploaded digest **before** any job-local output is deleted. It
    reports exact total bytes, bytes by category and largest files. **The OCR job
    ends there.**

Both matrices run exactly once. The workflow contains no path that reruns a
single case.

## After the run — the actors, in order

| # | Actor | May read truth? | May commit? |
| --- | --- | --- | --- |
| 1 | the OCR workflow job | no | no |
| 2 | the owner-authorized post-run commit process | no | yes, ≤ 100 MB |
| 3 | the separately authorized post-freeze evaluation | yes | no raw evidence |

**At or below 100 MB:** actor 2 — *not* the OCR process — downloads the artifact,
verifies its digest, verifies **both** raw manifests and their aggregates,
commits the immutable raw evidence to PR #219, and **stops for review**. Only
then may actor 3 be authorized, and only actor 3 receives
`post-freeze/id-map.json` and the governed truth.

**Above 100 MB:** actor 1 still uploads and verifies the complete lossless
artifact, then stops before Git commitment and **before post-freeze truth
evaluation**. Actors 2 and 3 do not run until an explicit owner decision about
durable archival. A workflow artifact is retention-bound and is never called
permanent preservation.

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
