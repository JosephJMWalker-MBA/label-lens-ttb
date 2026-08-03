# Preregistration — Stage 2, `discover` mode

**Isolated runtime-boundary discovery. No OCR.**

Base: `546c3f279ce431a1fd8c0203df7a83553ea866ef` (merge commit of PR #220).
Prior head: `8f47e52cb048a136b7a7618282b9aeae3a039c90`.
Committed mode: **`discover`**.

Stage 1 was amended fourteen times, every time before any governed acquisition
OCR. Those fourteen records are preserved unchanged and are explicitly
historical. This record covers Stage 2 discovery only.

**Execute remains unauthorized.** Six execute-readiness blockers are recorded in
`execute-readiness-blockers.json` and must be resolved and explicitly authorized
before `workflow-mode.txt` may change. Discovery does not authorize execute.

---

## Why discovery now, rather than another static amendment

Fourteen amendment cycles converged: the later ones were producing findings on
the **execute path** — package replay, run-level writers, envelope shape — that
no amount of further static review exercises. The purpose of `discover` is to
replace speculation with evidence from the actual bundle, mount boundary,
environment and container.

That is a change in method, not a relaxation of the boundary. Discovery runs
inside **the same boundary execute will use**, and its job is to report what is
actually there.

## What is added

| Path | What it is |
| --- | --- |
| `.github/workflows/issue-149-brand-evidence-acquisition.yml` | the acquisition workflow |
| `artifacts/issue-149-brand-complete-evidence-acquisition/workflow-mode.txt` | the committed mode, exactly `discover` |
| `scripts/eval/issue-149-brand-evidence-acquisition-run.ts` | the Stage 2 runner |
| `scripts/eval/issue-149-job-a-prepare.mjs` | Job A trusted preparation |
| `scripts/eval/issue-149-run-source-closure-gate.ts` | the closure-gate CLI Job A drives |
| `scripts/eval/lib/issue-149-runtime-discovery.ts` | the runtime-boundary discovery implementation |
| `artifacts/…/execute-readiness-blockers.json` | the six recorded execute blockers |

## Transport, unchanged

Push-triggered on exactly
`research/issue-149-brand-complete-evidence-acquisition`; `paths:` admitting only
the workflow file and `workflow-mode.txt`; `permissions: contents: read`; no
`schedule`, no `pull_request_target`, no `repository_dispatch`, no unscoped
branch trigger; a visible `harness revision: 1`; and **OCR permitted only when
the mode is exactly `execute`**.

The `job-b-execute` job exists and is wired to the `execute` mode so the transport
is complete and reviewable, and it **fails immediately** with a pointer to the
recorded blockers. There is no path from this commit to OCR.

## Job A — trusted preparation, no OCR

Job A is **trusted, not truth-free**. The freeze generator it runs physically
reads the PR #217 attribution artifact and uses `governedTruth.present`, and only
that, for the 105/10 corpus accounting. What is truth-free is the **preparation
artifact** it emits and the isolated job that consumes it.

It performs the twelve frozen steps in order: contract-manifest verification;
`preregistration.sha256`; the freeze generator `--check`; byte-for-byte
reproduction of the three generated artifacts; restaging and verification of all
115 opaque images; verification of every incumbent identity and frozen source
hash; the allowlisted bundle build with **no unrestricted repository copy**; the
complete esbuild metafile as the dependency graph; the prohibited-dependency and
production-source base-drift gates with the sole frozen
`wine-alcohol-parse.ts` exception; the tested TypeChecker source-closure
analyzer, driven through a thin CLI so Job A runs the same implementation the
Stage 1 tests exercise; the canonical bundle-content scanner over **raw bytes**
including binary assets; and the truth-free preparation artifact.

**Job A never executes the bundle it builds.**

## Job B — isolated discovery, no OCR

No repository checkout. Job B receives only the preparation artifact, and no
GitHub token or repository credential enters the container. The container runs
with `--network none`, `--read-only`, `--cap-drop ALL`,
`--security-opt no-new-privileges`, an empty `--env-file` so nothing is
inherited, named `tmpfs` at `/tmp` and `/run`, and exactly four
experiment-controlled data mounts: the bundle (ro), the truth-free manifest (ro),
the staged images (ro), and an initially empty output directory (rw).

Discovery verifies and reports: platform and runtime identity; complete
bundle-manifest verification with every mounted path and SHA-256; truth-free
manifest integrity; all 115 staged image lengths and digests; the complete
accessible-file inventory; the actual mount inventory against the four
experiment mounts plus the pseudo-filesystem allowlist; the writable-path
inventory; the read-only root; the environment allowlist; credential absence;
network denial; the unopenability of the repository root, `.git`, `artifacts/`,
fixtures, the eval manifest and the ID map; and that the output mount is empty.

**Network denial is observed, not asserted.** An earlier draft returned
`denied: true` unconditionally and printed the probe output beside it, which is
restating the intent and calling it evidence. Both a DNS resolution and a TCP
connect are attempted and awaited, and denial is the observed outcome of both.

**What discovery does not claim.** It does not check the freeze script,
`preregistration.md`, the Stage 1 artifacts, the fixtures or the post-freeze ID
map — those are not inside the boundary, and saying they were checked here would
be false. What it asserts about them is that they are **absent or unopenable**,
which is a different and checkable claim.

## The halt

The runner resolves the mode and, when it is not exactly `execute`, returns
**before any call to `acquireProductionBrandEvidence`,
`extractLabelEvidenceDetailed`, the OCR engine or
`writeSealedEvidencePackage`**. That halt is asserted by a load-bearing test that
drives the real `main()` with the extractor and the adapter mocked, and fails if
any of them is invoked.

The two acquisition-route calls appear in the runner source unconditionally, and
that is deliberate: the source-closure gate resolves them by symbol and requires
exactly one of each, in this file, awaited, with an identifier argument. A runner
that hid the execute path behind a dynamic import would satisfy discover while
leaving the execute path unanalysed. The gate checks the source; the mode check
decides whether the source is reached.

Discovery writes nothing to the output mount — not even its own report. The
report goes to stdout, and the trusted workflow wrapper outside the boundary
captures, hashes and uploads it. Writing the report into `/output` would mean
discovery had created files in the mount whose emptiness it reports on.

## Standing constraints

No new branch or PR. Mode stays exactly `discover`. No OCR, no extractor call, no
engine initialization, no primary or repeat raw evidence, no `raw/` directory. No
merge. PR #195 untouched. Production runtime behaviour unchanged. Acquisition
never receives historical case IDs, Brand-bearing filenames, historical fixture
paths, governed Brand truth, acceptable Brand values, prior per-case
classifications, PR #217/#218 records, or the post-freeze ID map.

Stop after discovery.
