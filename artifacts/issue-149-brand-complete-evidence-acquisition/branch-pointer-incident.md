# Branch-pointer incident — audit record

**This is an audit event, not an experimental result.** It changed no contract,
no evidence and no verdict. It is recorded here because a force update touched
the branch that carries the governed preregistration, and a package that asks
others to trust its hashes has to disclose that.

## What happened

Immediately after committing Amendment 3 (`37e1a3e`), the push used a refspec
naming a **stale local branch** rather than `HEAD`:

```
git push --force-with-lease origin \
  claude/blinded-annotation-task-d37c1e:research/issue-149-brand-complete-evidence-acquisition
```

The left-hand side was taken from the session's worktree name rather than from
the branch actually checked out. `claude/blinded-annotation-task-d37c1e` pointed
at `8b36245ec0eb7df68bc2812614d1c10d4a475baa` ("Prepare blinded Brand mechanism
audit packet (#204)", 2026-07-28), an ancestor of `main` that contains **none**
of the Stage 1 work. `HEAD` was on
`research/issue-149-brand-complete-evidence-acquisition` at `37e1a3e`.

`--force-with-lease` did not prevent this. The lease is a check on the
*destination* ref matching what was last fetched, and it did match — the wrong
value was the *source*, which no lease inspects.

Git reported:

```
+ ad1c296...8b36245 claude/blinded-annotation-task-d37c1e ->
  research/issue-149-brand-complete-evidence-acquisition (forced update)
```

The remote branch was reset from `ad1c296` (Amendment 2) to `8b36245`.

## Consequences

- **GitHub temporarily closed PR #219.** With the head branch pointing below the
  merge base, the PR showed `state: CLOSED`, `changedFiles: 0`, `commits: 0`.
- **No commit was lost.** Both `ad1c296` and `37e1a3e` existed locally throughout;
  the remote branch pointer moved, and no object was deleted.
- **No workflow, discovery or acquisition existed at the time.** No `raw/`
  directory, no workflow file, no `workflow-mode.txt`, no acquisition runner. The
  incident could not have started, altered or invalidated any OCR run, because
  there was none.
- **No contract, hash or verdict was affected.** The Amendment 3 preregistration
  hash `3cf3d25fbb892dabc66e58796841c542fcc4eb79f7cd5d561271a7689ed87786` and the
  Stage 1 aggregate `ad06587a433e8db6eefb87c55063b3c94122347230b08168648d0353e89103c6`
  were computed before the push and were unchanged by it.

## Restoration

Within the same minute:

```
git push --force-with-lease origin HEAD:research/issue-149-brand-complete-evidence-acquisition
gh pr reopen 219
```

The push reported `8b36245..37e1a3e` — a fast-forward, not a second force. PR
#219 returned to `OPEN`, draft, 41 changed files, 4 commits, head `37e1a3e`.
Ordinary CI then ran on the restored head and returned all three checks green.

## Current ancestry

```
37e1a3e  Amendment 3
  └─ ad1c296  Amendment 2
       └─ 26157cf  Amendment 1
            └─ 393f3c1  original Stage 1 preregistration, rebased onto 546c3f27
                 └─ 546c3f27  base (PR #220 merge)
```

Verified with `git log` and `git rev-parse HEAD^` at the start of Amendment 4.

## Prevention rule, in force from Amendment 4

1. **Manual pushes use `HEAD:<remote-branch>`.** Never a local branch name on the
   left-hand side. The branch actually checked out is the only thing that should
   ever be published, and `HEAD` is the only spelling that cannot drift from it.
2. **Force updates use `--force-with-lease`,** and where the tooling allows it,
   pinned to the expected remote head
   (`--force-with-lease=<ref>:<expected-sha>`) rather than the bare form. The
   bare form guards the destination only.
3. **Verify both ends before pushing.** `git rev-parse HEAD` and
   `git rev-parse --abbrev-ref HEAD` are checked against the intended destination
   ref, and the printed result of the push is read rather than assumed.

The failure mode was reaching for an identifier that was *available* (the
session's worktree name) instead of one that was *correct* (the checked-out
branch). The rule above removes the choice.
