# Issue #149 Stage 2 Ownership-Handoff Repair Preregistration

This amendment is limited to the container-to-host ownership handoff defect observed in execute attempt 1. It does not authorize execute mode, does not create an execute transition, and does not permit governed OCR.

## Repair Scope

- Authenticated item and run writers must set directory mode `0755` and regular-file mode `0644` explicitly, without relying on umask.
- The run commit marker must be created with mode `0644`.
- Writer readback verification must include file type, mode, byte length, and SHA-256 digest.
- A trusted host handoff must run with `if: always()` immediately after the acquisition container exits and before Actor 2.
- The handoff must inspect the original tree, reject symlinks and unexpected file types, create an uncompressed source archive, write a canonical source manifest, build a separate host-readable snapshot, normalize only the snapshot to `0755`/`0644`, and prove exact content equivalence.
- Actor 2, Job C, volume measurement, verified upload, incomplete-forensic upload, and downstream exact-ID verification must operate on the host-readable snapshot.
- The original container-owned tree must not be mode-normalized or otherwise mutated by the handoff.
- The no-OCR rehearsal must create synthetic evidence inside the pinned container as uid/gid `10149`, use no checkout, run no OCR/acquisition/governed corpus/truth route, prove planted `0700` evidence is unreadable before handoff, run the real handoff, verify the snapshot as host, and round-trip by exact artifact ID.
- The no-OCR synthetic-evidence builder must preserve the caller-supplied output directory itself, including when that directory is a bind-mount root. It may clear direct children after rejecting filesystem root, symlink output roots and non-directory output roots, but it must not remove the output root.

## Attempt 1 Treatment

Execute attempt 1 is classified as `INFRASTRUCTURE_INVALIDATED_NO_OBSERVATION`. It contributes no metric, comparison, determinism verdict, item outcome, or experimental conclusion.

## Discover Rehearsal Output-Root Incident

Discover workflow `30729062947`, rehearsal job `91446146384`, failed before synthetic evidence construction when the pinned container invoked `node /opt/verifier/rehearsal-evidence.mjs /output`. The builder attempted to remove `/output`, the writable bind-mount root, and halted with `EROFS: read-only file system, rmdir '/output'`.

No cross-UID observation, forensic handoff, Actor 2, Job C, artifact round-trip, TAR extraction proof, governed OCR, governed raw evidence or experimental result was produced. The workflow was not rerun. The audit record is `discover-rehearsal-output-root-incident.json`.

## Discover Rehearsal Pre-Handoff Traversal Incident

Discover workflow `30731541000`, rehearsal job `91452865271`, validated the output-root correction because the pinned container completed the synthetic build and emitted `REHEARSAL_EVIDENCE_BUILT` for `/output`. The same step then attempted an ordinary host `stat` of `synthetic-container/raw/primary/item-9001` before the trusted handoff boundary and failed with `Permission denied`.

This is classified as `DISCOVER_REHEARSAL_INVALIDATED_PRE_HANDOFF_UNPRIVILEGED_TRAVERSAL`. The source tree was intentionally private under uid/gid `10149` and umask `077`; making it host-readable before handoff would weaken the rehearsal. No cross-UID handoff observation, planted-0700 proof, forensic handoff, Actor 2, Job C, artifact round-trip, TAR extraction proof, governed OCR, governed raw evidence or experimental result was produced. The workflow was not rerun. The audit record is `discover-rehearsal-pre-handoff-traversal-incident.json`.

## Safety State

`workflow-mode.txt` remains exactly `discover\n`. `execute-authorization.json` remains `EXECUTE_NOT_AUTHORIZED` with `reviewedImplementationSha: null` and `ocrRun: true`. No governed OCR may run under this repair.
