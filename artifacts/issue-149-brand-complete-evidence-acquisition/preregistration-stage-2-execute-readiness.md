# Preregistration — Stage 2 execute-readiness and rediscovery

**Bounded sprint. Mode remains exactly `discover`. Execute remains unauthorized.**

Base: `546c3f279ce431a1fd8c0203df7a83553ea866ef` (merge commit of PR #220).
Prior head: `ce621a7b53b27451d05bc1df7573bceab8284161`.
Committed mode: **`discover`**. Execute authorization: **`EXECUTE_NOT_AUTHORIZED`**.

Discovery completed successfully at the prior head, passing all twelve checks
inside the boundary. This sprint resolves the seven recorded execute blockers,
adds execute-transition integrity, pins the execution supply chain, implements
the dormant execute path, makes the discovery claims exact, and re-runs
discovery. **No governed OCR runs and no `raw/primary` or `raw/repeat` evidence
is produced.**

---

## An audit correction, first

It was stated that "no runtime bundle was executed". **That is false.** The
bundle executed in `discover` mode — `node /opt/acquisition/acquisition.mjs` —
and that execution produced the boundary report.

The correct statement is: **the runtime bundle executed in discover mode; no
acquisition or OCR path executed.** What did not run was the acquisition API,
the extractor, the OCR engine, the sealed writers and the execute branch. The
workflow and the runner make that distinction structurally; the summary did not,
and the operative documents are corrected to match.

## A. The seven blockers

### 1–2 · Item persistence is transactional and single-use

An authentic package is **claimed atomically before any I/O**, so a second write
attempt fails with `SEALED_PACKAGE_ALREADY_CONSUMED` even if the first is still
in flight. A pre-existing destination is refused rather than overwritten. Every
file is written with the `wx` flag — exclusive creation, never truncation — into
a private staging directory, and read back.

**The commit point is the atomic rename of that staging directory to the item's
governed name.** Before it, no complete item is visible at the committed path;
after it, every file of the item is present. Deleting files in a `catch` block is
**not** crash-atomic — a process killed between two unlinks leaves exactly the
partial item it claims to prevent — and is not used as the commit rule, and not
described as one.

Failure is injected after **every individual write position** in turn, at the
`node:fs` module boundary so the real writer's real transaction runs. At every
position: no committed item directory, and no staging directory left behind.

### 3 · One authenticated run-level writer

`scripts/eval/lib/issue-149-run-evidence-writer.ts` seals and writes
`counts.json`, `raw-evidence-manifest.json`, `raw-evidence-manifest.sha256` and
`determinism-report.json`. The direct-filesystem-write prohibition is **not**
weakened: the closure gate now recognises exactly two authenticated persistence
routes, and a short, explicitly reasoned `WRITE_EXEMPT_MODULES` list.

Closed schema; exact allowed paths; exclusive creation; readback; canonical
exact-byte hashing; no caller-selected subset; no truth-bearing input. The
manifest is built from the **committed item directories on disk**, not from what
the runner says it wrote, so a run that persisted 114 items and declared 115
halts with `RUN_ITEM_SET_INCOMPLETE`.

### 4 · One pass representation

`<itemId>.passes.json` holds an ordered array of records whose own-key set is
**exactly the thirteen `RegionOcrResult` fields**. No `opaqueItemId`, no
`passOrdinal`: identity comes from the governed filename, ordinal from array
position. The serialized **bytes** are decoded back through
`assertRegionOcrResultRecord` before sealing.

### 5 · The promised fingerprints are sealed

`<itemId>.fingerprints.json` carries, per pass, the semantic fingerprint
(excluding `timings`) and the ordered-words-only fingerprint, plus the ordered
pass-array semantic fingerprint. Proven independently: a timing-only change does
not move any semantic fingerprint; a word change moves both per-pass digests; a
non-timing pass field change moves the semantic one and **not** the words-only
one; and artifact integrity still covers the exact bytes, timings included.

### 6 · Operative documents reconciled

Stale claims are **deleted**, not supplemented: the "deeply frozen" snapshot
wording, the runner persisting from `detailed.debug.passes`, the single
`.failure.json`, and the two-export runtime namespace.

### 7 · A pinned non-root runtime identity

Job B runs as `uid 10149 / gid 10149`. Discovery verifies the running identity
against `ISSUE_149_EXPECTED_UID/GID` and fails when they differ. Documenting
uid 0 as accepted was not sufficient.

## B. Execute-transition integrity

`execute-authorization.json` binds authorization to an **exact reviewed
implementation SHA**. The gate refuses execute unless the artifact names a full
40-character SHA, `status` is exactly `EXECUTE_AUTHORIZED`, the head descends
from that SHA, every path changed since it is one of the two permitted transition
files, and the mode file contains exactly `execute\n`.

**Why a repository gate.** GitHub's `paths:` filter decides *whether* the
workflow runs; it places no restriction on what else the triggering push
contains. A commit could change the mode file and the runner together and still
trigger execute. The changed-file restriction is enforced against the actual
commit range.

The gate job is a `needs:` dependency of the OCR job, so a rejected transition
prevents that job from starting at all.

## C. The execution supply chain is pinned

Every action is referenced by full commit SHA with its release recorded beside
it, and the runtime image by its **linux/amd64 manifest digest**
`sha256:3d0f0545…`, verified at run time with `RUNTIME_IMAGE_DIGEST_MISMATCH`.

## D. The dormant execute path

Implemented and analysed, **not entered**: primary and repeat acquisition of all
115 items under the identical frozen configuration, no retry and no selective
rerun, transactional per-item persistence, governed run-level counts and
manifests, exact-byte artifact integrity, a semantic determinism comparison in
which timing-only differences are descriptive, the emitted truth-key scan against
the mounted canonical inventory, and the >100 MB durable-archive stop rule with
actor-2 raw verification before any evaluator receives truth.

Every execute-path test uses synthetic images or a mocked extractor.

## E. Exact rediscovery claims

`accessibleFiles` becomes **`experimentControlledFiles`** — it walks the four
experiment mounts and is not an inventory of every file in the container.
`writablePaths` becomes **`probedWritablePaths`**, each entry the result of an
actual create-and-remove, because `accessSync` answers a question about
permission bits rather than about whether the mount accepts a write. Mount
options are parsed and reported, including `ro`/`rw`. Unavoidable writable
pseudo-filesystems are recorded **separately** from experiment-controlled
writable space rather than denied.

## Standing constraints

Mode stays exactly `discover`. No execute, no governed OCR, no `raw/primary` or
`raw/repeat`. No merge. PR #195 untouched. No new branch or PR. Production
runtime behaviour unchanged.

Stop for review. Execute requires a later, explicit authorization decision.
