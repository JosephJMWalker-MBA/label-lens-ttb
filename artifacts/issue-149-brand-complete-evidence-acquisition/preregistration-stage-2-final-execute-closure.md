# Preregistration — Stage 2 final execute closure and rediscovery

**Bounded sprint. Mode remains exactly `discover`. Execute remains
`EXECUTE_NOT_AUTHORIZED`.**

Base: `546c3f279ce431a1fd8c0203df7a83553ea866ef`.
Prior head: `48b59443af2e2a5242f5112c18bcee83190a1275`.

Four load-bearing execution defects in the dormant execute path, plus one
authorization-process limitation. All closed here. **No governed OCR runs and no
`raw/primary` or `raw/repeat` evidence is produced.**

---

## 1 · Execute performs a complete in-container boundary preflight

Execute started the bundle with `ISSUE_149_MODE=execute` and went straight to the
manifest and the acquisition loop. **A workflow flag is not a runtime
observation**: the job could be started with the right arguments against the
wrong container and nothing downstream would notice.

Before the first acquisition call, execute now runs `runRuntimeDiscovery` —
**the same implementation discovery runs**, not a second restatement —
re-verifying linux/amd64, the pinned image digest, uid 10149 / gid 10149, the
bundle and its manifest, all 115 staged images, the exact mounts and their
`ro`/`rw` options, the probed writable surfaces, the environment allowlist,
credential absence, observed network denial, forbidden paths and the initially
empty output.

On failure it halts with `EXECUTE_BOUNDARY_PREFLIGHT_FAILED`, reporting
`acquisitionApiCalls: 0`, `extractorCalls: 0`, `itemWriterCalls: 0`,
`runWriterCalls: 0`, `outputFilesCreated: 0` — not "we stopped" but "nothing
ran".

## 2 · The determinism decision compares every preregistered level

`compareSemanticFingerprints` compared each item's `.fingerprints.json` and
nothing else. That covers PASS semantics only. **If a nondeterministic downstream
ordering changed the candidate array, the ranking or the selected value, the pass
fingerprints stayed equal and the runner labelled it a timing-only difference.**
That is the opposite of what it is.

`compareRuns` now compares nine levels: outcome; source provenance and
configuration; pass semantics excluding timings; ordered OCR words; reconstructed
lines; candidate records and stable identities; ranking, selection, authority and
abstention; item counts; typed failure evidence. Timing-free files are compared
by their **exact governed bytes**; `.passes.json` is compared through the sealed
fingerprints, and when its bytes differ the confinement to `timings` is
**checked**, not assumed.

Verdicts are the preregistered five. **`COMPLETE_WITH_NONDETERMINISM` is a
successful acquisition outcome**: both runs are preserved, raw verification and
upload continue, and the process status is successful. A nonzero status would
have skipped the verification and upload steps that a nondeterministic result
most needs. Nonzero is reserved for `INCOMPLETE_EVIDENCE`,
`TRUTH_ISOLATION_FAILURE` and `RUNTIME_FAILURE`.

## 3 · The run-level writer derives instead of trusting

It accepted each item's `outcome` and `aggregateSha256` from the runner, and an
open `Record<string, unknown>` determinism object spread **after** `runId` and
`itemCount` — so a caller field could overwrite either.

Now: the caller supplies only the closed expected item-ID set and a closed
determinism report. Outcome is derived from which authenticated suffix set is
present; the aggregate is recomputed from the committed bytes in the sealer's own
order. The determinism schema is closed, unknown keys are rejected, and the
writer's own facts are written **last**. The raw manifest covers `counts.json`
and `determinism-report.json` as well as the item files.

**The run commit is now unambiguous.** `RUN_COMMITTED.json` is created last with
exclusive creation and binds every run-level digest. A run without a valid marker
is UNCOMMITTED regardless of which files exist — including the state a crash
between renames leaves. The marker makes that state **detectable, not
impossible**, and `limitations.md` says so.

## 4 · Actor 2 raw verification, and Job C

The step named "Verify the sealed raw evidence" ran `du -sb`. **A size check that
passes on a half-written run is worse than none, because it reads as one.**

`verifyRawEvidence` checks both 115-item sets, every item's exact file set, every
file digest against the manifest, valid run commit markers, counts and
determinism coverage, the manifest's own SHA-256 file, absence of staging
directories and unexpected files, and the final verdict. The volume rule applies
**after** verification.

Verified evidence uploads as `issue-149-raw-evidence`; a failed or partial run
uploads as `issue-149-incomplete-forensic-output`. Partial output is never
labelled completed evidence. The upload's artifact ID and digest are recorded,
and a separate job downloads and re-verifies it **before job-local output
disappears**.

`verifyNoHistoricalIdentity` is Job C: it receives the sealed bytes, the minimal
historical inventory and the forbidden-key inventory, and nothing else. It scans
raw bytes, writes its report outside `raw/`, hashes it, and halts with
`TRUTH_ISOLATION_FAILURE` on any hit. No evaluator is authorized here.

## 5 · The authorization boundary, stated honestly

**A branch-local workflow cannot prove that an unreviewed commit did not replace
or remove its own gate.** The workflow and the gate script are both loaded from
the current branch head. The repository gate is therefore **defense in depth**
against ordinary accidental co-changes, not self-authenticating authorization.

The frozen procedure: create the two-file transition commit locally; **do not
push**; report its full SHA, parent SHA, exact file list and byte diffs; obtain
explicit owner authorization naming that SHA; push only the already-authorized
commit; the gate independently rechecks the range.

**No transition commit is created in this sprint.**

## Standing constraints

Mode stays `discover`. Authorization stays denied. No execute, no governed OCR,
no `raw/` evidence. No merge. PR #195 untouched. No new branch or PR.

Stop for review.
