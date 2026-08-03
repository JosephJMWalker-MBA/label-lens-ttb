# Preregistration amendment 8 — candidate-emission API closure and executable staging validation

Refs Issue #149, PR #219. **Amended before any Stage 2 Job A workflow, before any
runtime-bundle build, before discovery, and before any governed acquisition OCR.**

## What has and has not run

**The Stage 1 trusted freeze/staging generator and its temporary `--check`
reproducibility mode have run.** That is what produced the three committed
artifacts, and saying otherwise would be false: the generator reads the PR #217
attribution artifact, verifies and copies all 115 images, assigns opaque
identities, and writes the truth-free manifest, the population freeze and the
post-freeze ID map. The `--check` path calls the same core into a temporary
directory.

**No Stage 2 Job A workflow, truth-free preparation artifact, runtime-bundle
build, discovery, execute mode or governed 115-case acquisition OCR has run.** No
`raw/` directory, no raw-evidence manifest, no workflow file, no
`workflow-mode.txt` and no acquisition runner has ever existed on this branch.

The ordinary repository suite continues to run its **pre-existing bundled-image
OCR tests** — `src/fixtures/corpus-real-ocr.test.ts`,
`src/pipeline/extractor/extractor.test.ts`,
`src/pipeline/extractor/extractor-precheck.integration.test.ts` and
`src/fixtures/eval/eval-harness.integration.test.ts`. Unmodified, pre-existing
tests over bundled fixture images; not the governed corpus.

Amendment 5's uncharacterized local test flake is preserved verbatim in its own
record, with **no cause assigned**.

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
| **Amendment 8** | this commit | see `preregistration.sha256` |

Base `546c3f279ce431a1fd8c0203df7a83553ea866ef`. No earlier plan is deleted or
reinterpreted.

## 1. The complete-array adapter is the only candidate-emission API

Amendment 7 corrected the ranking algorithm but `workflow-plan.md` still told
Stage 2 to finalize every candidate directly through `finalizeCandidateRecord` —
a route that bypasses production-comparator ordering, decision-based ranked
membership, position assignment, uniqueness, contiguity and the
exactly-one-selected invariant. The adapter also exported
`toCandidateEvidenceRecord` and `finalizeProductionCandidate`, both of which take
a caller-supplied `rankedPosition`, so a runner could have "used the reference
adapter" while inventing positions itself.

The only authorized API is now:

```ts
finalizeProductionCandidateArray(completeDiagnosticCandidateArray, opaqueItemId)
```

one call per item. The lower-level functions are **module-private**, reachable
only through `TEST_ONLY_candidateAdapterInternals`, and the runner guard fails on
`toCandidateEvidenceRecord`, `finalizeProductionCandidate`,
`finalizeCandidateRecord`, `stableCandidateId`, `CandidateAdapterContext`,
`TEST_ONLY_candidateAdapterInternals` and any constructed `rankedPosition` — and
also fails a runner that does **not** invoke the array function. The canonical
helper remains permitted for pass validation, semantic fingerprinting and
exact-byte hashing; the prohibition is specifically against bypassing the array
adapter for Brand candidate emission.

Synthetic source tests prove the exact complete-array call passes, and that a
`finalizeCandidateRecord` loop, a `finalizeProductionCandidate` call with a
manual position, a direct diagnostic map, and a reach through the test-only
interface each fail. `opaqueItemId` is validated even when the candidate array is
empty.

## 2. The staging-independence test now drives the real generator

The previous test defined its own `stagingDecisions()`, reproducing the presumed
ordering logic and substituting `sourceImageByteSize: 0`. It never invoked the
generator, so it could have stayed green while the real script began using
`acceptableValues` — the same structural failure as the drift guard that restated
its own error.

The generation core is extracted to **`scripts/eval/lib/issue-149-freeze-core.mjs`**
with explicit inputs: PR #217 attribution data, PR #218 population data, the
evaluation-manifest data, a source-image byte loader, the forbidden-key inventory
and output destinations. The CLI wrapper loads the real files and calls it;
normal staging and `--check` call the same core. **The core is host-only and is
never included in the runtime bundle or present in Job B.**

The rewritten test loads the real sources, mutates `acceptableValues` and every
governed-truth field except `present`, holds identity, inclusion, paths, hashes
and bytes fixed, runs the **actual core** against temporary outputs, and proves
byte-for-byte equality of the truth-free manifest, the population freeze and the
generated ID map — including the real byte sizes — plus that none of the mutated
text appears in any output. A separate case flips `governedTruth.present` and
proves the real core halts with `PRESENCE_SPLIT_DISCREPANCY`, which is how the
bounded use is established honestly. A further test asserts the file restates no
part of the algorithm.

## 3. Check-mode failure cleanup is now real

`check()` had a `finally`, but the mismatch path called `halt()` → `process.exit(1)`
from inside the `try`, so cleanup was not actually guaranteed on failure. The old
test verified cleanup only after a *successful* check and merely searched the
source for the halt-code string.

The core and comparator now throw a typed **`FreezeError`** carrying the halt
code, the detail and `ocrRun: false`. Cleanup runs in `finally`. Only the
top-level CLI boundary serializes the failure and sets `process.exitCode = 1`; it
never calls `process.exit`. The scratch directory is created with `mkdtemp`
rather than one fixed path.

An executable drift test copies the committed artifacts, mutates one byte, drives
the **real** core and comparator against those expected files, and asserts
`STAGE_1_GENERATED_ARTIFACT_DRIFT`, a non-success status, removal of both
temporary trees, and that the tracked artifacts and the real staging directory
are byte-identical and untouched. A second test drives the CLI end to end and
asserts exit code 1 and the halted report. The success-path reproducibility test
remains.

## 4. The trusted-staging audit language is corrected

"No trusted preparation has run" was no longer precise. The corrected statement,
now used throughout the current package:

> The Stage 1 trusted freeze/staging generator and its temporary reproducibility
> mode have run. No Stage 2 Job A workflow, truth-free preparation artifact,
> runtime-bundle build, discovery, execute mode or governed 115-case acquisition
> OCR has run.

`commands.sh`'s header changes from "planning and preregistration only" to
"contract generation and trusted freeze/staging; no governed acquisition OCR".
The package distinguishes **Stage 1 trusted staging**, already performed to freeze
and verify the corpus, from **Stage 2 Job A**, which additionally builds and scans
the runtime bundle and emits the truth-free preparation artifact.

This is an audit-language correction, not evidence contamination.

## 5. Complete production score and ranking evidence is required

The validator permitted a kept candidate with `score`, `ranking`, `decision` and
`rankedPosition` all null, and did not require a rejected candidate's `score` to
be null.

Production scores and assigns ranking semantics to **every kept candidate** before
family reduction and deduplication (`field-selection.ts:2536-2543`); a rejected
span returns before a `Candidate` object exists. So:

- every **kept** candidate has non-null `score` and `ranking` satisfying their
  complete schemas, `rankingEligible` true, and `rankingScore` equal to
  `ranking.rankingScore`;
- a kept candidate **may** lack a `decision` and a `rankedPosition` — that is a
  candidate deduplication removed;
- every **rejected** candidate has `score`, `ranking`, `decision` and
  `rankedPosition` all null, `rankingEligible` false and `selected` false.

Halt: `KEPT_CANDIDATE_EVIDENCE_INCOMPLETE`. Tests cover the kept selected
candidate, the kept deduplicated candidate, kept with null score, kept with null
ranking, rejected carrying score, and rejected carrying ranking.

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

Recorded in `amendment-8-linkage.json` and in `stage-1-contract-manifest.sha256`.
