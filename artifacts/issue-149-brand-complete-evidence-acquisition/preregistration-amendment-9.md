# Preregistration amendment 9 — candidate-selection source closure and staging-test isolation

Refs Issue #149, PR #219. **Amended before any Stage 2 Job A workflow, before any
runtime-bundle build, before discovery, and before any governed acquisition OCR.**

## What has and has not run

**The Stage 1 trusted freeze/staging generator and its temporary reproducibility
mode have run.** That is what produced the three committed artifacts.

**No Stage 2 Job A workflow, truth-free preparation artifact, runtime-bundle
build, discovery, execute mode or governed 115-case acquisition OCR has run.** No
`raw/` directory, no raw-evidence manifest, no workflow file, no
`workflow-mode.txt` and no acquisition runner has ever existed on this branch.

The ordinary repository suite continues to run its **pre-existing bundled-image
OCR tests**, disclosed separately. Amendment 5's uncharacterized local test flake
is preserved verbatim in its own record, with **no cause assigned**.

## All earlier states are preserved

| State | Head | Preregistration SHA-256 |
| --- | --- | --- |
| **Original Stage 1** | `7600b0a9ba5ce6995274a517121f1eda18a30424` | `7b691c78a9de008039ccc1a7f94824015373b1caec58f8235c78a03587c641fb` |
| **Amendment 1** | `26157cfe036fb8b1506431d1aa9309029ac2dcdb` | `cfc118c670a9c69f783f3ca58174113711b553baf1278da31a35e31121bf13ad` |
| **Amendment 2** | `ad1c296194e21e91af8333953ad47abe396495dc` | `9287ecc0d5d01bae83316c9d0dcb462d6eca566c925405cde83631fa65c89d35` |
| **Amendment 3** | `37e1a3ea752c12b230d468c10f604b8550d37ce1` | `3cf3d25fbb892dabc66e58796841c542fcc4eb79f7cd5d561271a7689ed87786` |
| **Amendment 4** | `cb574539d5e541446ec58d2b2bc62b9fda480048` | `87302e60a0629f6d657f4f118c8d73a50ea93aa3d321c15f77b5974ae75d28a3` |
| **Amendment 5** | `fca0755d629af2a15206d4cc5f5251768223e2f7` | `274e45779c849d4e6ada50e10b74d1fc8f6b1396f68b540ae02156e640422332` |
| **Amendment 6** | `ad8351ee84f073f13b869871115748a0700beea7` | `15771503f342652fd69ea1edf24d470a0e61324adac1451d32532b47e77627a1` |
| **Amendment 7** | `d23554cb7a56a480f884c9ca8365b5b3c7d4d288` | `c407f4634d1fb71d836b459a09b2da28b8b46ca5d44b619776a3e15f0d8e7747` |
| **Amendment 8** | `dd50a9e258705b77d2109514f4a495c64b364036` | `7edbaeace6217c0fb1b51d20c3b3db2d4e024a84ba31d697a3a354f43f2a5d85` |
| **Amendment 9** | this commit | see `preregistration.sha256` |

Base `546c3f279ce431a1fd8c0203df7a83553ea866ef`. No earlier plan is deleted or
reinterpreted.

## 1. The frozen candidate call named a property that does not exist

`workflow-plan.md` mandated `finalizeProductionCandidateArray(diagnosticSelection.candidates, …)`.
`selectBrandObservationWithCompleteFilterDiagnostics` returns a complete
`FieldSelection`, whose candidates live at `brandDiagnostics.candidates` — there is
no `candidates` property on the selection root.

Correcting only the path would have left the deeper problem: a bare-array
parameter lets a runner pass a **filtered or truncated** population while
technically calling the approved function.

The API now takes the **complete diagnostic selection**:

```ts
finalizeProductionCandidateArray(diagnosticSelection, opaqueItemId)
```

typed against the real exported `FieldSelection`. Inside, the adapter validates
`opaqueItemId` first — even for an empty population — requires `brandDiagnostics`
and an array `candidates`, takes the population from that property, finalizes it
exactly once, keeps `candidateOrdinal` as the original diagnostic-array index, and
asserts the emitted count equals the complete candidate count. Halts:
`COMPLETE_DIAGNOSTICS_ABSENT`, `CANDIDATE_EVIDENCE_TRUNCATED`.

## 2. An entire kept population could lose every decision undetected

Ranked membership derives from candidates carrying a `decision`, and selection was
checked only when that derived set was non-empty. The per-record schema correctly
allows a kept candidate to lack a decision — deduplication removes some. But if
**every** kept candidate's decision disappeared, the ranked set was empty and all
records still passed.

Production never behaves that way: whenever kept candidates exist it builds a
non-empty ranked list and assigns one selected decision. The missing global
invariant is now enforced in `finalizeProductionCandidateArray`:

```
(any candidate is kept) === (at least one candidate carries a decision)
```

with: every decision-bearing candidate is kept; every ranked member carries score
and ranking; positions unique and contiguous; exactly one selected candidate at
position 0. Halt: `RANKED_MEMBERSHIP_INCONSISTENT`.

A regression test takes a real selection containing kept candidates, removes every
`decision` while preserving score and ranking, and asserts the halt. Companion
tests cover an all-rejected selection, a decision on a rejected candidate, and
deduplicated kept candidates while another survives.

## 3. The private APIs were still runtime-accessible

`TEST_ONLY_candidateAdapterInternals` was a real exported object holding both
lower-level functions. The runner guard is first-order by construction, so a
helper the runner imported could have reached that object and bypassed the array
API without the runner source containing a prohibited symbol.

The export is **removed**. `toCandidateEvidenceRecord`,
`finalizeProductionCandidate`, `CandidateAdapterContext` and
`assertRankedArrayInvariants` are module-private and unavailable at runtime; the
adapter exports exactly one candidate-emission function. Tests exercise candidate
construction through the public complete-selection API.

The Stage 2 source-closure contract is strengthened: the direct runner guard
remains, and **trusted Job A must additionally scan every Stage 2 acquisition
source input in the dependency closure**, failing outside the adapter module on
any of the prohibited symbols, and requiring the public complete-selection
function to be the sole candidate-emission call reachable from the runner's
transitive source closure. The contract states explicitly that the first-order
regex does not prove this. A synthetic test shows a clean runner whose imported
helper hides a lower-level call, and that the closure detector catches it.

The adapter's header comment is corrected: it imports production
`compareCandidateRanking` as a **runtime function**, not only types.

## 4. The drift test modified a tracked governed artifact

The CLI failure test appended a byte to the committed `population-freeze.json` and
restored it in `finally`. That protects the final working tree but not concurrent
execution — another Vitest file reading the same governed package could have seen
the corrupted artifact.

The check's expected artifacts are now **injectable**: `runFreezeCheck(expected)`
and a `--expected-root=<dir>` CLI argument. Ordinary `--check` still compares
against the committed artifacts. The drift test copies all three to a unique
temporary directory, mutates one copy, runs the real CLI against those paths, and
asserts `HALTED`, exit 1, removal of every temporary directory, and that no
tracked artifact changed. **No test opens a tracked Stage 1 artifact for writing.**

A standing test scans the Stage 1 test files and fails on any write whose
destination is the governed package — reading it remains fine.

## 5. The core had a second, non-injected image source

`generateStageOneArtifacts` verified bytes through `loadSourceImage` and then
staged each image with a separate `copyFileSync` from `process.cwd()` and the
historical path. The post-copy digest check prevented a silent mismatch, so this
was **not** evidence contamination — but the "explicitly injected source-image
loader" was not actually the staging source, and the core had two byte channels
that happened to point at the same files.

The second channel is removed. The exact verified Buffer is retained transiently,
used for the hash and byte size, **written to the opaque staged destination**, and
re-read and compared; the transient bytes are then released and are never
serialized into any artifact. The core calls no `copyFileSync` and resolves no
source path against `process.cwd()`.

A synthetic test builds 115 virtual cases with the frozen 105/10 split, virtual
image paths that **do not exist on disk**, unique injected Buffers and matching
synthetic hashes, and proves the real core stages all 115 solely from the loader —
which a second byte channel could not have satisfied.

## What did not change

The frozen 115-item population and its opaque identifiers; the incumbent
configuration pins and the `wine-alcohol-parse` exception; two exact corpus runs;
the direct `extractLabelEvidenceDetailed` route; full-object diagnostic parity;
the four experiment-controlled mounts; the closed `RegionOcrResult` schema;
exact-byte integrity versus semantic fingerprints; the canonical forbidden-key
asset; the prohibition on modifying PR #195 or any production behaviour.
**Nothing here relaxes a completeness requirement.**

## Limitations that remain genuinely unavailable

Unchanged: no word baseline geometry; no block, paragraph or line identifiers on
`OcrWord`; no constituent word IDs on `BrandLineDiagnostic`; no preprocessed-crop
hash; no per-pass warning/error array; no candidate `brandClass`; no
post-deduplication merged support for non-selected ranked candidates.

## Stage 1 contract-package aggregate

Recorded in `amendment-9-linkage.json` and in `stage-1-contract-manifest.sha256`.
