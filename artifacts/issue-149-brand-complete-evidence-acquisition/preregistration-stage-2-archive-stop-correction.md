# Preregistration — Stage 2 archive-stop ordering correction

**Bounded. Mode remains exactly `discover`. Execute remains
`EXECUTE_NOT_AUTHORIZED`. No transition commit is created.**

Base: `546c3f279ce431a1fd8c0203df7a83553ea866ef`.
Prior head: `c46e7c4e029f6e66300420da7b184127ca1b1442`.

---

## The defect

The execute workflow ran Actor 2, then Job C, then a volume step that **exited
nonzero** above 100 MB, and only then uploaded the verified artifact.

GitHub applies an implicit `success()` to any step whose `if:` contains no
status-check function. So once the volume step failed:

- the **verified upload was skipped**;
- the **incomplete-forensic upload was skipped too** — its explicit condition is
  false when Actor 2 and Job C have succeeded, and it carried the same implicit
  `success()`.

A governed run producing 100 MB plus one byte would therefore have correctly
detected that it crossed the threshold, and then **discarded the only durable
copy of the evidence** when the runner disappeared.

That contradicts the frozen plan, which requires the complete lossless artifact
to be uploaded and verified above the limit, and only then for the process to
stop before Git commitment and truth evaluation. The limit is meant to control
what happens to the evidence — not to be the thing that destroys it. And it
cannot be assumed the output will stay under the limit; that would make the rule
an unstated prediction rather than a control on the observed result.

## The correction

**The measurement is nonfatal.** It runs only after Actor 2 and Job C succeed,
computes the exact byte count, writes `archive-volume-report.json` exposing
`rawBytes`, `archiveLimitBytes = 104857600` and `overLimit`, and **never
terminates the job because `overLimit` is true.**

**The verified upload runs whenever Actor 2 and Job C succeed**, regardless of
`overLimit`, and now carries `archive-volume-report.json` with the evidence.

**The exact-ID redownload, metadata digest comparison, content-level
re-verification and verification receipt all run on both sides of the limit.**
The receipt records `rawBytes`, `archiveLimitBytes`, `overLimit` and the
`decision` — `ELIGIBLE_FOR_OWNER_COMMIT_PROCESS` or
`DURABLE_ARCHIVE_DECISION_REQUIRED` — plus `retentionBound: true` and
`isPermanentPreservation: false`. An Actions artifact is retention-bound and is
not called permanent preservation.

**A terminal `archive-adjudication` job runs last**, after the upload, the
redownload, the digest comparison, the re-verification and the receipt. At or
below the limit it permits the workflow to complete. Above it, it halts with
`RAW_EVIDENCE_EXCEEDS_DURABLE_ARCHIVE_LIMIT` — meaning: do not commit raw
evidence to Git, do not begin truth-based evaluation, require an explicit owner
durable-archive decision, and preserve the retention-bound artifact for it.

**An over-limit result is not incomplete evidence** and is never uploaded under
`issue-149-incomplete-forensic-output`.

The decision is a pure, tested function: `decideArchiveVolume(rawBytes)` and
`archiveAdjudication({ report, verifiedArtifactUploaded,
verificationReceiptCreated })`. The boundary is exercised at 104857599 /
104857600 / 104857601 with synthetic byte counts; no 100 MB artifact is
generated, and the production limit stays frozen. `archiveAdjudication` refuses
outright when preservation has not happened, so the ORDERING is itself testable.

## Failure paths, unchanged

Actor 2 still runs after every acquisition attempt; Job C only after Actor 2
verifies complete committed evidence; incomplete or runtime-failed evidence still
routes to the incomplete-forensic artifact; `COMPLETE_WITH_NONDETERMINISM`
remains a successful outcome; and `INCOMPLETE_EVIDENCE`,
`TRUTH_ISOLATION_FAILURE` and `RUNTIME_FAILURE` still fail only after forensic
preservation.

## Wording corrected

The plan said the trigger path set contains only the workflow and mode file. It
contains three files — the workflow, the mode file and
`execute-authorization.json` — and `paths:` decides only whether the workflow
runs, not what else the push may contain.

## Standing constraints

Mode `discover`. Authorization denied. No execute, no governed OCR, no `raw/`
evidence, no transition commit. No merge. PR #195 untouched.

Stop for review.
