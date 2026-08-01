# Preregistration — Stage 2 verifier transport and no-OCR rehearsal

**Mode remains exactly `discover`. Execute remains `EXECUTE_NOT_AUTHORIZED`. No
transition commit is created.**

Base: `546c3f279ce431a1fd8c0203df7a83553ea866ef`.
Prior head: `28b792a5d9f848888c6710728e5322fbf3fe4adb`.

Four execution defects — places where the dormant workflow would **fail or
report success incorrectly** when actually entered — plus an executable
rehearsal that proves the host-side pipeline can run at all.

---

## 1 · The verifier could not have run in Job B

`job-b-execute` performs no checkout and downloads only the truth-free
preparation artifact. It then invoked
`npx vite-node --config vitest.config.ts scripts/eval/issue-149-verify-raw-evidence.ts`.
**None of that exists in that workspace** — not the script, not
`vitest.config.ts`, not `package.json`, not `node_modules`. Actor 2 and Job C
could not have run.

Job A now builds a **self-contained host verifier bundle**: `verify.mjs` plus its
complete dependency closure, runnable by plain pinned Node with no npm install,
no npx, no vite-node and no checkout. It has its own manifest and aggregate, is
bundle-scanned like the acquisition bundle, and carries no governed truth, no
acceptable values and no historical identity inventory. It runs on the **host,
after the container exits**, and is never mounted into the OCR container.

Job C's inventory is a **separate minimal artifact** — the frozen historical
ID/path inventory and the forbidden evidence-key inventory, with their exact
digests and counts. It is not part of the truth-free acquisition input and is
never mounted with it; Job B downloads it only for the host-side Job C step.

## 2 · A missing inventory silently became an empty one

The CLI turned an absent ID map or truth-key file into `[]`. **Job C would then
scan for zero markers and report clean** — another load-bearing check that could
not fail.

That fallback is deleted. With `--identity`, both files must be present and
readable, parse against a closed schema, match their frozen SHA-256, carry the
exact frozen counts, and contain no duplicate or empty marker. A zero-marker
inventory halts on its own. Halt codes: `IDENTITY_INVENTORY_ABSENT`,
`IDENTITY_INVENTORY_MALFORMED`, `IDENTITY_INVENTORY_DIGEST_MISMATCH` — printed as
governed JSON, not an uncaught stack trace.

## 3 · A failed acquisition bypassed Actor 2

The container step ran under `set -euo pipefail`, so a nonzero runner status
ended the job before Actor 2, which had no `always()` condition. **The path most
in need of forensic verification was precisely the path that skipped it**, and
the forensic upload it did reach carried no raw-verification report.

The container status is now captured into `acquisition-status.json` without
terminating the step. Actor 2 runs with `if: always()` and verifies whatever
exists. Job C runs only after Actor 2 verifies a complete committed artifact; the
volume rule applies only after that; verified evidence uploads only after both
succeed, and incomplete forensic output otherwise. **Adjudication happens last**,
after the reports and the appropriate artifact are preserved.

## 4 · Marker and manifest verification were not exact

`verifyRunCommitted` iterated whatever `fileDigests` contained, so a marker with
the correct `requiredFiles` list and **one** valid digest entry returned
`committed: true`. The marker schema is now closed: exact own-key set, valid
`runId` matching the run being verified, non-negative integer `itemCount`,
`requiredFiles` exactly the frozen list in frozen order, `fileDigests` exactly the
same four paths each once in order, every length and digest matching, and the
aggregate recomputed from the ordered entries. Malformed fields return an
explicit uncommitted result rather than an uncaught `TypeError`.

Actor 2 verified each file on disk against the manifest but not the reverse, so
**phantom entries naming nonexistent files passed**. Verification is now
bidirectional: phantom, duplicated, unlisted and reordered entries all fail, the
`runFiles` set is exact, and the manifest's own `runId`/`itemCount` must match.

Its `no-forbidden-evidence-key` finding was hardcoded `ok: true` with a note that
another verifier did the real work. That is the same defect as a size check
standing in for verification. It is replaced by
`forbidden-evidence-key-scan` with `adjudicatedHere: false` and an explicit
delegation to Job C.

## 5 · The uploaded artifact identity was recorded and discarded

`uploaded-artifact.json` was written and never uploaded, exposed or compared. The
follow-up job downloaded by name and re-checked contents but never compared the
recorded ID or digest. GitHub's download action validates the digest itself, but
a mismatch is a **warning**, not a gate.

The execute job now exposes `artifactId`, `artifactDigest`, `artifactUrl` and the
producing `headSha` as job outputs. The verification job requires all of them,
downloads **by exact artifact ID**, reads the artifact metadata with narrowly
scoped `actions: read`, requires the metadata's run association to match this
execution, normalizes and compares the digests, fails on disagreement, re-runs
the full content-level verification, and uploads a **verification receipt**
binding artifact ID, upload digest, metadata digest, head SHA, report digest and
final status.

## 6 · The no-OCR verifier-transport rehearsal

The execute job is skipped under `discover`, so rediscovery never exercised any
of this. A dedicated rehearsal now runs while the mode stays `discover`: no
checkout, the Job A verifier bundle, synthetic committed primary/repeat evidence,
Actor 2 under plain Node, the separate identity inventory, Job C, an upload and
redownload **by artifact ID** with a metadata digest comparison, and three
planted failures — a missing commit marker, a phantom manifest entry and a
missing identity inventory — each of which must fail.

It invokes no acquisition API, no extractor and no OCR engine, writes no governed
raw evidence, and changes neither mode nor authorization. **It is the executable
proof that the dormant host-side pipeline can actually run in a no-checkout job.**

## Standing constraints

Mode `discover`. Authorization denied. No execute, no governed OCR, no `raw/`
evidence, no transition commit. No merge. PR #195 untouched.

Stop for review.
