# Preregistration amendment 11 — extractor-owned orchestration and executable closure analysis

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
| **Amendment 9** | `849ecbb1e50eab4d9f5ec53edf5f92dc56015d05` | `15fe208b96fc9b1fdff53f0637b5a002d31d4393d3e8e48354937ec051678176` |
| **Amendment 10** | `6eae8463c4c4b037a581906a892db8ae36fba1f9` | `e40dca9caf5ba757a3a121c56707e3f8e5616fc38ebf1a24ee933cfa7368387a` |
| **Amendment 11** | this commit | see `preregistration.sha256` |

Base `546c3f279ce431a1fd8c0203df7a83553ea866ef`. No earlier plan is deleted or
reinterpreted.

## 1. `ExtractionDebug` ownership was not authenticity

Amendment 10 accepted a caller-supplied `ExtractionDebug` and validated only the
opaque id and that `debug.passes` was a non-empty array. It then trusted
`primarySelections` and `finalSelections`. A helper could therefore filter or
reorder the passes, reconstruct matching primary and final selections, and pass a
coherent replacement.

This is the fourth iteration of one mistake, and the pattern is worth naming: a
bare candidate array became a caller-supplied `FieldSelection`; a filtered
population could be wrapped in a fresh selection, so that became a caller-supplied
`ExtractionDebug`; and a coherent debug object could still be constructed. **Each
time the named route was closed and an adjacent one was left open.**

The public API now owns the extractor call:

```ts
acquireProductionBrandEvidence(input: ExtractionInput)
  → Promise<Result<{ detailed, diagnosticSelection, candidateRecords }, ExtractionError>>
```

It validates `input.artifactRef` **before** invoking anything, calls
`extractLabelEvidenceDetailed(input)` exactly once, returns the extractor's typed
failure unchanged when it fails, keeps `DetailedExtractionResult` and
`ExtractionDebug` private until it succeeds, reconstructs the exact Brand pass
set, invokes the complete-diagnostics selector, asserts parity, finalizes the
complete internally derived population, and returns all three together.

**No public function accepts `ExtractionDebug`, `FieldSelection`,
`BrandCandidateDiagnostic[]` or `rankedPosition`.** The opaque identity comes from
`input.artifactRef`; there is no second identifier that could disagree. The runner
persists pass evidence only from `evidence.value.detailed.debug.passes` and
candidate evidence only from `evidence.value.candidateRecords`.

The runtime namespace is exactly `CandidateAdapterError` and
`acquireProductionBrandEvidence`.

**Tests** (non-OCR, extractor mocked): the extractor is called exactly once; it
receives the same input object; its typed failure is returned with no evidence; a
malformed `artifactRef` halts before invocation; a failed item is never retried;
success binds the returned passes and candidates to the same detailed result.

## 2. The ranked-survivor regression did not reach the invariant

Amendment 10's test removed decisions only from `debug.finalSelections.brand`.
The adapter independently derives its own selection, so the corruption halted at
**parity** — the test even said so — and `RANKED_MEMBERSHIP_INCONSISTENT` was
never evaluated. The same applied to the rejected-candidate-with-decision case.

A focused test now mocks the complete-diagnostics selector, keeping every other
field-selection export real, and constructs the authority as the same selection
minus only the two complete-diagnostics fields — so **parity succeeds** and
execution reaches the array invariants. It asserts `RANKED_MEMBERSHIP_INCONSISTENT`
for a kept population with no decision and for a decision on a rejected candidate,
`RANKED_POSITION_PARITY_FAILURE` for two selected candidates, and success for a
deduplicated kept candidate while another survives. **No runtime test-only export
was added.** The complementary parity-first case is kept and labelled as such.

## 3. The closure detector would have rejected legitimate helpers

`candidateApiOffences` added "does not invoke the acquisition API" to **every**
inspected file, while the contract said the detector scans every Stage 2 source
input. That would have rejected pass validation, semantic fingerprinting,
exact-byte hashing, manifest writing and evidence scanning — all legitimate.

It was also a substring scan living inside a test file, so the gate Job A would
run and the gate the tests exercised were two different implementations, and it
could not tell a call from a mention.

One host-only reference analyzer now exists at
`scripts/eval/lib/issue-149-stage2-source-closure.ts`, using the TypeScript
compiler API. Job A and the Stage 1 tests use it. **Only the runner entrypoint
must invoke the acquisition API, exactly once**; every other closure file is
required only to be free of prohibited routes. Outside the adapter it prohibits
calls to `extractLabelEvidenceDetailed`, `selectBrandObservation`,
`selectBrandObservationWithCompleteFilterDiagnostics` and every candidate-emission
function, and writes to `primarySelections`, `finalSelections`,
`brandDiagnostics`, `candidates`, `passes` and `rankedPosition`. Reading is
permitted. Halt: `STAGE2_SOURCE_CLOSURE_VIOLATION`.

Fourteen synthetic tests cover: a clean runner plus two helpers that never call
the API (passes); a runner that omits the call; a second call; a call outside the
runner; a helper calling the extractor; a helper calling either selector; a helper
filtering or reordering passes; a helper reconstructing selections; a helper
replacing `brandDiagnostics.candidates`; five hidden candidate-emission calls; a
comment or string *mentioning* a prohibited symbol (passes); the adapter exemption;
and a missing entrypoint.

The first-order runner test is retained, relabelled **supplementary**, and
delegates to the same analyzer instead of a second copied detector.

## 4. Two operative contracts named the superseded API

`acquisition-invocation-contract.json` defined the public API correctly but its
`referenceCandidateAdapter` section still said
`theOnlyAuthorizedFunction: finalizeProductionCandidateArray` and described the
complete-array function as mandatory. `brand-diagnostic-parity-contract.json`
still said the focused parity tests were **not implemented**, although Amendment
10 added and ran them. Both are current, manifest-covered contracts.

Both are corrected, and the sweep now fails on
`theOnlyAuthorizedFunction: finalizeProductionCandidateArray` and on
`implementedInThisAmendment: false` appearing in a current contract.

## 5. The tracked-package claims stay precise

The distinction is kept and sharpened. Manifest verification and Git status prove
the package's **state after** the tests; they cannot prove a write occurred and
was restored during one. The intentional-drift tests demonstrably use temporary
paths only — a separate, executable fact. The source scan remains **supplementary**
and says so.

A clean-checkout assertion is added: `git status --porcelain` over the governed
directory must be **empty**. During local amendment work the diff is expected, so
the test states which regime it is in and, in the lenient regime, requires every
differing path to be a governed artifact the manifest accounts for. **The lenient
local check is not equivalent to the clean-CI check**, and is not described as
such.

## What did not change

The frozen 115-item population and its opaque identifiers; the incumbent
configuration pins; two exact corpus runs with no retries; the four
experiment-controlled mounts; the closed `RegionOcrResult` and candidate schemas;
exact-byte integrity versus semantic fingerprints; the canonical forbidden-key
asset; the single source-image byte channel; the Proxy-proven staging truth
boundary; the prohibition on modifying PR #195 or any production behaviour.
**Nothing here relaxes a completeness requirement.**

## Limitations that remain genuinely unavailable

Unchanged: no word baseline geometry; no block, paragraph or line identifiers on
`OcrWord`; no constituent word IDs on `BrandLineDiagnostic`; no preprocessed-crop
hash; no per-pass warning/error array; no candidate `brandClass`; no
post-deduplication merged support for non-selected ranked candidates.

## Stage 1 contract-package aggregate

Recorded in `amendment-11-linkage.json` and in `stage-1-contract-manifest.sha256`.
