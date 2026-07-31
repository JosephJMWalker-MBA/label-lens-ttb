# Preregistration amendment 10 — debug-owned diagnostic derivation and executable truth-access proof

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
| **Amendment 10** | this commit | see `preregistration.sha256` |

Base `546c3f279ce431a1fd8c0203df7a83553ea866ef`. No earlier plan is deleted or
reinterpreted.

## 1. A filtered population was still reachable by wrapping it

Amendment 9 stopped the adapter accepting a bare candidate array, but it then
trusted whatever array appeared at
`diagnosticSelection.brandDiagnostics.candidates`. So this was rejected:

```ts
finalizeProductionCandidateArray(filteredCandidates, opaqueItemId);
```

and this was accepted:

```ts
finalizeProductionCandidateArray(
  { ...diagnosticSelection,
    brandDiagnostics: { ...diagnosticSelection.brandDiagnostics, candidates: filteredCandidates } },
  opaqueItemId,
);
```

This package's **own tests demonstrated the bypass**: `selectionOf()` built a
`FieldSelection` around any caller-chosen array, and the all-rejected test filtered
a mixed population, wrapped it, and finalized it successfully.

The one public API now takes the complete **`ExtractionDebug`**:

```ts
finalizeProductionBrandEvidence(debug, opaqueItemId)
  → { diagnosticSelection, candidateRecords }
```

typed against the real exported `src/pipeline/extractor/extractor.ts#ExtractionDebug`.
Inside, and nowhere in the runner: validate `opaqueItemId`; require
`debug.passes` to be a non-empty ordered array; reconstruct the exact production
Brand pass set — `primary OBSERVED ? [debug.passes[0]] : debug.passes`, mirroring
`extractor.ts:99, 113`; invoke
`selectBrandObservationWithCompleteFilterDiagnostics` internally; assert parity
internally; derive candidates only from the selection the adapter itself created;
finalize the complete population; assert the emitted count.

**No public function accepts a `FieldSelection` or a `BrandCandidateDiagnostic[]`
as its candidate-emission input**, and the runner must never call the diagnostic
selector. The candidate mapping and the array invariants stay module-private.

## 2. Parity moved into the same public boundary

The frozen parity algorithm now runs inside `finalizeProductionBrandEvidence`: deep
clone the derived selection, remove **only** `filterChecks` and
`activeRejectionReasons` from every Brand candidate, canonicalize the complete
stripped `FieldSelection`, canonicalize `debug.finalSelections.brand` with the
same frozen algorithm, and require exact canonical equality. That automatically
covers `brandDiagnostics.lines`, every observation and provenance field, every
candidate field, and any enumerable field added upstream later.

Halt: `BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE`. **No candidate records are
returned on a parity failure.** `debug.finalSelections.brand` remains the
authority; the derived selection supplies only the two extra fields.

Tests build synthetic `ExtractionDebug` from the **real production selectors** over
synthetic passes — never a locally approximated selection cast through `unknown` —
and prove: primary OBSERVED uses exactly `[debug.passes[0]]`; primary not OBSERVED
uses the complete ordered array; a valid debug succeeds; and an altered line
diagnostic, candidate property, observation field or final-selection provenance
field each fail before any evidence is produced.

## 3. Every caller-created selection route is gone from the tests

`selectionOf()` is removed. The all-rejected case is now obtained from a **real
pass set whose selector result contains only rejected candidates**, chosen by
input text rather than by filtering a mixed population. Duplicate/deduplicated,
multi-ranked, missing-diagnostics and parity-failure cases all begin from a
complete synthetic `ExtractionDebug`, and every deliberate corruption clones the
debug object and states exactly what it corrupts. No runtime test-only export was
added.

## 4. The runner and closure gates name the new call

The required call is `finalizeProductionBrandEvidence(detailed.value.debug, opaqueItemId)`.
The guard's valid synthetic source uses exactly that shape, and it no longer
accepts `diagnostics.candidates`, `diagnosticSelection`,
`diagnosticSelection.brandDiagnostics.candidates`, a caller-created
`FieldSelection`, the superseded `finalizeProductionCandidateArray`, or a direct
call to `selectBrandObservationWithCompleteFilterDiagnostics`.

Prohibited outside the adapter module: the diagnostic selector,
`finalizeProductionCandidateArray`, `toCandidateEvidenceRecord`,
`finalizeProductionCandidate`, `finalizeCandidateRecord` and `stableCandidateId`
for Brand candidate emission, and any caller construction or replacement of
`brandDiagnostics.candidates`. Job A's transitive source-closure gate owns the
property; the first-order runner regex remains **supplementary and is not
described as transitive proof**. A synthetic closure test shows a clean runner
whose imported helper clones the selection and filters the candidates, and the
gate rejecting that helper — and a clean runner passing the debug object straight
through, which passes.

## 5. The export surface is read from the real runtime namespace

The no-backdoor test now imports the adapter as a namespace and asserts its actual
runtime own keys are exactly `CandidateAdapterError` and
`finalizeProductionBrandEvidence`. Source-text assertions remain supplementary; a
regex can miss export forms, and an inferred export surface is not an export
surface.

## 6. The staging truth-access boundary is proven directly

The previous mutation test claimed to change every non-`present` truth field but
only touched strings and arrays — so `knownAmbiguous: false`, a real Boolean in the
frozen source, went unmutated.

Two changes. First, a **`Proxy` test over the real core**: every `governedTruth`
object is replaced with a proxy that permits reading `present` and throws on
reading any other property, on `ownKeys` enumeration, and on descriptor access for
non-`present` properties. The proxy is first shown to be load-bearing — reading
`acceptableValues` throws, `Object.keys` throws — and then
`generateStageOneArtifacts` is run through it and **completes successfully with
byte-identical outputs**. That is direct evidence, not inference from an
unobservable mutation.

Second, the mutation test now **recursively** visits every non-`present` leaf:
strings get a sentinel, booleans invert, finite numbers change, arrays and nested
objects are traversed. It asserts at least one Boolean actually changed, that
`knownAmbiguous` changed when present in the frozen source, that every non-`present`
field of the first case was visited, that all three outputs stay byte-identical,
and that no sentinel reaches any output. The separate `present`-flip test and its
`PRESENCE_SPLIT_DISCREPANCY` result are unchanged.

## 7. The tracked-write guard's claim is corrected

The source scan checks a fixed set of filesystem call names in a small window. It
cannot see aliases, `fs.promises`, helper functions or indirect writes, so it is
**relabelled as a supplementary heuristic** and says so in its own name and
comment.

The authoritative check is added alongside: run the real Stage 1 manifest
verifier, and require no **untracked** file under the governed directory. That
proves the package is intact; it deliberately does **not** claim to detect a write
performed and restored mid-test. The drift tests' use of temporary expected
artifacts only is a separate, executable fact and is stated as such.

## What did not change

The frozen 115-item population and its opaque identifiers; the incumbent
configuration pins; two exact corpus runs; the direct
`extractLabelEvidenceDetailed` route; the four experiment-controlled mounts; the
closed `RegionOcrResult` and candidate schemas; exact-byte integrity versus
semantic fingerprints; the canonical forbidden-key asset; the single
source-image byte channel; the prohibition on modifying PR #195 or any production
behaviour. **Nothing here relaxes a completeness requirement.**

## Limitations that remain genuinely unavailable

Unchanged: no word baseline geometry; no block, paragraph or line identifiers on
`OcrWord`; no constituent word IDs on `BrandLineDiagnostic`; no preprocessed-crop
hash; no per-pass warning/error array; no candidate `brandClass`; no
post-deduplication merged support for non-selected ranked candidates.

## Stage 1 contract-package aggregate

Recorded in `amendment-10-linkage.json` and in `stage-1-contract-manifest.sha256`.
