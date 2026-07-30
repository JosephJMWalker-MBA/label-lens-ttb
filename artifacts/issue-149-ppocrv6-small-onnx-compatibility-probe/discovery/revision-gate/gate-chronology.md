# Chronology of the first discovery gate

This directory holds the **first** discovery gate of the probe, recorded before
the governing plan's §17 was available in the session, and preserved here
unmodified.

## Order of events

1. **Commit `c006af31073ec93ba3e08718d0a3f5c5330c07a1`** — on branch
   `research/issue-149-ppocrv6-revision-gate`, base `origin/main`
   `5161a58e02341753a31c2ab889b148b2cecedf81`. The Hugging Face revision gate was
   independently re-verified and written to `revision-gate-verification.json`
   **before any download, container build or inference**. Result: **PASS**.
   `BLOCKED.md` recorded, at the same commit, that the governing plan document
   was not present in the worktree, on `origin/main`, or anywhere in Git history,
   and that the remaining phases could therefore not be executed faithfully.

2. **§17 supplied verbatim** in the task message body. The block recorded in
   `BLOCKED.md` is thereby **resolved**. `BLOCKED.md` is retained because it is a
   true record of the state at commit `c006af31`, not because it still describes
   the current state.

3. **This commit** — the provisional directory
   `artifacts/issue-149-ppocrv6-revision-gate/` was absorbed into the governed
   package `artifacts/issue-149-ppocrv6-small-onnx-compatibility-probe/` defined
   by §13.6 of the plan. The three files were relocated with `git mv` and are
   **byte-identical** to their state at commit `c006af31`; Git records the change
   as a pure rename.

## Preserved file identities

| File | SHA-256 |
| --- | --- |
| `revision-gate-verification.json` | `fce12074d360f86bda9fa5d79ec34e1b7b57b3277273406aa2be6812aaafbb91` |
| `BLOCKED.md` | `8d8cf58d65ad5fb5a44852f08e2204c5b1af8b78e6b0fc97e550afd4773aef58` |
| `git-sha.txt` | `400d0a415f519d37c60d31a27b85d10c8f60f64bcb2a615e38fe772a3e32711d` |

None of these three files was edited, reinterpreted or deleted. The gate result
they record was not recomputed to replace them: the discovery run performed under
§17 re-asserts the revision as a precondition and records that separately in
`../revision-recheck.json`, so both checks remain independently inspectable.
