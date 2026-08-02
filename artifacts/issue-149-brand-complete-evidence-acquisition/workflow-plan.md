# Execution workflow plan

**Stage 2 committed the workflow with the mode set to `discover`.** Discovery has
run and completed successfully. The mode remains `discover`, execute is gated on
an explicit authorization artifact, and nothing in this PR can start OCR.

**Audit language, stated exactly.** The runtime bundle **did execute**, in
discover mode — that execution is what produced the boundary report. What did
**not** execute was the acquisition API, the extractor, the OCR engine, the
sealed writers or the execute branch. "No bundle was executed" was wrong and is
corrected here.

## Why the mode file is the control

A push-triggered workflow becomes live the moment it lands on the branch, so the
workflow file and its mode file were added together with the mode set to
`discover`.

The `paths:` filter is **not** a restriction on what a push may contain. It
decides whether this workflow runs when a push touches a matching file; a commit
could change the mode file *and* the runner and still trigger execute. The
changed-file restriction is enforced by
`scripts/eval/issue-149-execute-gate.mjs` against the actual commit range, and
execute additionally requires `execute-authorization.json` to name the exact
reviewed implementation SHA.

## Transport

The governed Issue #149 pattern, unchanged:

- push-triggered, `branches:` restricted to exactly
  `research/issue-149-brand-complete-evidence-acquisition`;
- `paths:` admitting the workflow file and governed Issue #149 inputs:
  `artifacts/issue-149-brand-complete-evidence-acquisition/**`,
  `scripts/eval/issue-149-**`, `scripts/eval/lib/issue-149-**` and
  `src/fixtures/eval/issue-149-**`. This admits source, verifier, fixture,
  contract, manifest and governed-artifact changes that can affect the package,
  while still excluding unrelated repository changes. And `paths:` decides only
  WHETHER the workflow runs; it places no restriction on what else the triggering
  push contains, so the changed-file restriction is enforced by the
  execute-transition gate against the actual commit range;
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

**Discover mode runs inside that same boundary and stops for review before
execute is authorized.** The workflow, the runtime bundle and the execute path
are implemented; discovery has run and passed. Execute remains gated on an
explicit authorization artifact.

The runtime identity is pinned: the isolated job runs as **uid 10149 / gid
10149**, and discovery verifies the running identity against the pinned values
rather than accepting root.

## What the Stage 1 manifest binds, and what it deliberately does not

The Stage 1 contract manifest binds the **immutable implementation and contract
package**: every governed contract, the freeze script, the canonical libraries
and every Stage 1 test. Job A verifies it before preparation begins, and the
ordinary suite verifies every recorded hash against the bytes on disk.

It **excludes exactly two paths** — `workflow-mode.txt` and
`execute-authorization.json` — because the authorized transition must change them
*without* changing the reviewed implementation. Hashing them made that transition
impossible: it would have left the manifest stale, and the transition commit
cannot also regenerate the manifest, because the execute gate would then observe
a third changed path and reject the transition. The result was a transition that
necessarily failed both ordinary `npm test` and Job A's first step.

Exclusion is not absence of control. Those two files are governed by Git commit
identity, exact control-state validation, exact changed-path validation against
the reviewed implementation SHA, full-history ancestry in the execute-transition
gate, and external approval of the exact unpushed transition commit SHA. The
exclusion set is two full repository-relative paths — not a pattern — and equals
the gate's permitted transition paths. See `transition-control-governance.json`.

## Job A — trusted preparation, outside isolation, no OCR

**Job A is trusted, not truth-free — and it physically reads governed truth.**
It checks out the repository and reads the PR #217 per-case attribution artifact,
whose case objects carry `governedTruth.present` alongside acceptable Brand values
and other truth. It *uses* the presence flag, and only that, for the preregistered
105/10 corpus-accounting assertion. It must not use acceptable values or any truth
text for inclusion, opaque-ID assignment, image ordering, staged filenames,
preprocessing, bundle construction, or any acquisition input or emitted field.

So **the first physical access to a truth-bearing source happens here, in Job A**.
The evaluation-use truth boundary still sits between actor 2 and actor 3, and only
actor 3 may use governed truth against acquired evidence. Calling the whole
workflow truth-free would be false. What is truth-free is the **preparation
artifact** Job A emits and the isolated job that consumes it.

A staging-independence test holds identities, paths, hashes, inclusion and
presence flags fixed while changing the truth text, and proves the truth-free
manifest, opaque ordering and staged filenames are unchanged. It does **not**
claim independence from `governedTruth.present`, because the script intentionally
uses that flag.

These steps need the repository checkout, the Stage 1 artifacts and the
post-freeze map. **None of those exists inside the isolated boundary**, so they
run on the host, before isolation. Amendment 3 correctly split the phases in the
runtime contract but left this document listing them under `discover`; that is
corrected here.

1. Check out and verify the Stage 1 contract package against
   `stage-1-contract-manifest.sha256`.
2. **Verify that the freeze script reproduces its own committed artifacts**:

   ```bash
   node scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs --check
   ```

   Check mode regenerates `truth-free-input-manifest.json`,
   `population-freeze.json` and `post-freeze/id-map.json` into a temporary root
   and compares the **exact bytes** against the committed files, touching no
   tracked artifact and no real staging directory and running no OCR. It halts
   with `STAGE_1_GENERATED_ARTIFACT_DRIFT`. **This is a mandatory precondition**:
   Job A is required to rerun the generator and reproduce the committed map
   bit-for-bit, so a generator that has drifted from its own output would leave
   Job A choosing between failing and overwriting reviewed artifacts.
3. Verify `preregistration.sha256`.
4. Run the freeze/staging script and confirm it reproduces
   `population-freeze.json`, `truth-free-input-manifest.json` and
   `post-freeze/id-map.json` bit-for-bit, restaging the 115 opaque images.
5. Verify all 115 source images by SHA-256 and byte size, and verify the
   post-freeze ID map.
6. Verify the incumbent configuration against
   `incumbent-configuration-freeze.json`: tesseract.js and tesseract.js-core
   resolved versions, `eng.traineddata` SHA-256, OEM, page-segmentation modes,
   pass templates, **and the `field-selection.ts` SHA-256
   `8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c`**. Halt on
   any difference.
7. Build the allowlisted runtime bundle. **No unrestricted repository `COPY`.**
8. Generate the **complete dependency closure** — a bundler metafile or
   equivalent full module graph — for every runtime input module, and halt with
   `BUNDLE_PROHIBITED_DEPENDENCY` if any transitive source input resolves under
   `src/fixtures/**`, `tests/**`, `artifacts/**`, `src/domain/rules/**`, the eval
   manifest, governed truth or a prior per-case report. Source maps carry no
   embedded `sourcesContent` from prohibited paths.
9. Write the bundle manifest: every source input path and SHA-256, every emitted
   path and SHA-256, the exact build command, the build tool version, and the
   metafile digest.
10. Scan the built bundle, with a **scope that cannot reject its own scanner and
   does not infer an inventory from source text**. The **raw bytes** of every
   bundle file — including binary assets — are checked for historical case IDs
   and fixture paths. The forbidden evidence keys live in exactly one place: the
   canonical inventory asset at `runtime/truth-key-inventory.json`, a bare JSON
   array whose exact byte SHA-256 is recorded in the bundle manifest and whose
   parsed array must **equal** the authoritative array, order included. The
   runtime's emitted-evidence scanner reads that asset; no executable module
   carries a duplicate literal list, and a forbidden key appearing in any other
   file is a violation. Halt with `BUNDLE_PROHIBITED_CONTENT`. The scan takes no
   Brand inventory as a parameter at all — a transcript may contain the Brand
   text, and that is evidence, not leakage.
11. Prepare the initially empty output mount.

Job A emits a **truth-free preparation artifact** containing only: the runtime
bundle, the bundle manifest, the truth-free input manifest, the staged opaque
images, and the empty-output specification. No historical case identifier, no
fixture path, no ID map, no governed truth and no prior per-case record may enter
that artifact.

Job A owns the transitive dependency proof and the production-source base-drift
gate. The Stage 1 runner-source guard is a useful first-order check and is
explicitly not a substitute for either.

**The incumbent's own dependency is allowed by name.** `field-selection.ts`
imports `@/domain/rules/wine-alcohol-parse` on its first line, so the frozen
route cannot run without it. One exception is frozen by **path and content
hash** — `src/domain/rules/wine-alcohol-parse.ts`,
`2ec1368cf3f4fcfab264d1507f98267aa6f6112091332d4dda5a76152ea816e7`, no imports of
its own — and every other module under `src/domain/rules/**` stays prohibited.
Every production source in the closure must also match its bytes at the frozen
base commit, or the job halts with `PRODUCTION_SOURCE_DRIFTED_FROM_BASE`.

## Job B — isolated discover or execute

Job B performs **no repository checkout** and never receives the repository
workspace. It receives only Job A's truth-free preparation artifact, and no
GitHub token or repository credential enters the container.

### Mode `discover` — inside the execute boundary, no OCR

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
2. **Before the first acquisition call, run the boundary preflight inside the
   container.** It re-verifies the pinned image digest and identity, the mounts
   and their options, the environment, credential absence, observed network
   denial, the writable surfaces, the forbidden paths, the bundle and its
   manifest, all 115 staged images and the initially empty output — using the
   same implementation discovery runs. A workflow flag is not a runtime
   observation. On failure it halts with `EXECUTE_BOUNDARY_PREFLIGHT_FAILED`
   and no acquisition, extractor, OCR or writer call is made.

3. Run the **primary** matrix: all 115 opaque items through
   `acquireProductionBrandEvidence(extractionInput)` — one call per item. That
   call makes the direct `extractLabelEvidenceDetailed` invocation itself,
   exactly once, and never `runCaseArtifacts`. The runner constructs the frozen
   `ExtractionInput` and reads the result; it does not call the extractor, and it
   does not perform the pass-set reconstruction, the diagnostic selection or the
   parity assertion.

3. Persist the **complete ordered `RegionOcrResult` array** — all thirteen fields
   of every pass, in emission order — per
   `region-ocr-result-replay-contract.json`. The runner does not do this by
   reading a pass array: the acquisition boundary serializes it and returns
   bytes. This is what makes the counterfactual in capability 3 replayable
   later, without OCR.
4. **Write the sealed package, whole.** The call returns a frozen
   `SealedItemEvidence`: an item id, an outcome, an ordered list of frozen file
   descriptors — governed run-relative path, exact byte length, SHA-256 over
   exactly those bytes, and a `bytes` reader that hands out a fresh copy every
   time — plus `fileCount`, `totalBytes` and an `aggregateSha256` over the
   ordered `(path, byteLength, sha256)` entries.

   The runner passes that package to `writeSealedEvidencePackage`, which writes
   every file and verifies each by reading it back. It does **not** serialize,
   filter, map, project, rank, reorder, reconstruct or parse evidence, and it
   cannot select a subset: the writer takes the complete package and a
   destination, and has no subset parameter.

   A superseded plan (Amendment 12) had the runner reach into the returned
   result for pass and candidate evidence itself. That left the runner holding
   the live objects, and a **projection** — `slice`, `filter`, `map`, `concat`, a spread
   into a new array — produces incomplete evidence with no mutation at all, which
   no source-level mutation rule can catch. Serialization therefore happens
   inside the boundary and the alternative no longer exists.

   Inside it: the input's exact own data-property values are captured before the
   first await (`Reflect.ownKeys`, symbols rejected, `Proxy` rejected, accessors
   rejected, `imageBytes` copied); the extractor is called exactly once and a
   typed failure seals exactly one governed `.failure.json` with no synthesised
   debug and no retry; the exact Brand pass set is reconstructed
   (`primary OBSERVED ? [debug.passes[0]] : debug.passes`);
   `selectBrandObservationWithCompleteFilterDiagnostics` is invoked; full-object
   canonical parity is asserted against `debug.finalSelections.brand`; the
   complete internally derived candidate population is finalized; and every
   record is validated and serialized in production's own order. The opaque
   identity comes from `input.artifactRef`, so no second identifier can disagree
   with it.

   The runner supplies **no** `ExtractionDebug`, **no** `FieldSelection`, **no**
   candidate array and **no** `rankedPosition`, and never calls
   `extractLabelEvidenceDetailed` or a selector itself. Three earlier signatures
   each closed the route they named and left an adjacent one open — a bare array,
   then a caller-supplied selection, then a caller-supplied debug object a helper
   could construct with filtered passes and matching selections. Owning the
   extractor call removes the class.

   Halts: `MALFORMED_ARTIFACT_REF`, `DEBUG_PASSES_ABSENT`,
   `BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE` (no evidence returned),
   `COMPLETE_DIAGNOSTICS_ABSENT`, `CANDIDATE_EVIDENCE_TRUNCATED`,
   `RANKED_MEMBERSHIP_INCONSISTENT`, `RANKED_POSITION_PARITY_FAILURE`.

   The adapter's runtime namespace exports exactly `CandidateAdapterError` and
   `acquireProductionBrandEvidence`. Trusted Job A runs the parsed source-closure
   analyzer at `scripts/eval/lib/issue-149-stage2-source-closure.ts` over the
   **complete transitive** Stage 2 source set. Only the runner entrypoint must
   invoke the acquisition API; hashing, manifest, validation and scanning helpers
   are legitimate closure members and are required only to be free of prohibited
   routes.

5. On a case-level extractor failure, persist the typed failure record — error
   code, message, issues, opaque item ID, source-image SHA-256. **No partial
   debug object is invented and no failed item is retried.**
6. Assert per-pass and per-case counting proofs; halt on
   `RAW_EVIDENCE_TRUNCATED`, `LINE_EVIDENCE_TRUNCATED` or
   `CANDIDATE_EVIDENCE_TRUNCATED`.
7. Scan every emitted file — pass, candidate, selection, failure, count,
   manifest and provenance records alike — against the **single authoritative
   forbidden-key inventory** read from `runtime/truth-key-inventory.json`, and
   for unexpected files; halt on `TRUTH_ISOLATION_FAILURE`. The isolated runtime
   does **not** scan for historical case ID or fixture-path VALUES: it does not
   hold that inventory, and handing it over would be the leak the scan exists to
   prevent. Those checks run afterwards, read-only — see Job C below.
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

## Job C — read-only identity-leak verification, after sealing, outside the boundary

Once **both** raw manifests are sealed, the evidence is remounted or otherwise
exposed **read-only** to a separate verifier. That verifier may read the
historical case-ID and fixture-path inventory, and it scans the already-frozen
bytes for both. It also re-verifies that each raw file still matches its manifest
entry.

It receives **only** a minimal historical case-ID and fixture-path inventory —
no acceptable Brand values, no truth labels, no prior per-case classifications.
It **may not** modify, rewrite, reformat, re-emit or replace any raw file, and it
performs **no** truth-based evaluation. Its report lives outside `raw/` and
carries its own SHA-256. A hit halts with `TRUTH_ISOLATION_FAILURE`.

**A clean Job C report is a mandatory precondition for both actor 2 committing
evidence and actor 3 beginning post-freeze evaluation.** Above 100 MB, Job C
still runs — identity-leak verification does not depend on whether the evidence
is ever committed.

This is why the superseded claim that "nothing opens the ID map or truth before
both manifests exist" was dropped: trusted staging necessarily opened historical
identity before acquisition ever started. The invariant that holds is not global
ordering — it is that the isolated acquisition never receives that identity, and
that identity-leak checking happens against frozen bytes it cannot alter.

## After the run — the actors, in order

| # | Actor | Checkout? | Historical identity? | Governed truth? | May commit? |
| --- | --- | --- | --- | --- | --- |
| A | trusted preparation | yes | yes | yes, reads it; uses only the presence flag | no |
| B | isolated discover / execute | no | no | no | no |
| C | read-only identity verifier | no | identifier inventory only | no | no |
| 2 | owner-authorized commit process | yes, in practice | not used as an input | no | yes, ≤ 100 MB |
| 3 | post-freeze evaluation | yes | yes | yes | no raw evidence |

**At or below 100 MB:** actor 2 — *not* the OCR process — takes the verified
workflow artifact as its evidence input, verifies the outer artifact digest,
verifies **both** raw manifests and their aggregates, commits **exactly those
immutable bytes** to PR #219, verifies that every committed file's SHA-256 equals
its artifact manifest entry, and **stops**. It performs no transformation,
filtering, regeneration, re-serialization, reordering or selective omission, and
any changed byte fails verification.

Actor 2 may technically operate in a repository checkout, and
`post-freeze/id-map.json` is committed on this branch — so it is **not** claimed
to be physically unable to reach the map. That claim would be false unless actor
2 ran inside a separately verified restricted environment, which it does not. The
control that protects the evidence is **immutable-byte equality**: truth and
historical identity are not inputs to any decision actor 2 makes, because it
makes no content-dependent decision at all — it commits the bytes it verified, or
it fails.

Only actor 3 is **authorized to use** the map and governed truth for evaluation.
That is an authorization rule, not an access claim: the map is committed on this
branch, so other processes can physically read it. Actor 2's preconditions
include a clean Job C report, and so do actor 3's.

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
