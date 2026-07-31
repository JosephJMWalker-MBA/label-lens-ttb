# Preregistration — complete current-baseline Brand evidence acquisition

Refs Issue #149. **Evidence acquisition only.** Frozen before any OCR runs.

Base: `origin/main` `546c3f279ce431a1fd8c0203df7a83553ea866ef`, the merge commit
of PR #220.

**Amended nine times, every time before any governed acquisition OCR.** See
`preregistration-amendment.md` and `preregistration-amendment-2.md` through
`preregistration-amendment-9.md`. All earlier plans are preserved, not
overwritten, and their identities are recorded in `amendment-linkage.json` and
`amendment-2-linkage.json` through `amendment-9-linkage.json`. **The Stage 1 trusted freeze/staging generator and its temporary
reproducibility mode have run — that is what produced the three committed
artifacts. No Stage 2 Job A workflow, truth-free preparation artifact,
runtime-bundle build, discovery, execute mode or governed 115-case acquisition OCR
has run, under any plan.** The ordinary repository suite continues to run its
pre-existing bundled-image OCR tests, disclosed separately.

Stage 1 trusted staging and Stage 2 Job A are distinct: staging froze and verified
the corpus and generated the committed artifacts; Job A additionally builds and
scans the runtime bundle and emits the truth-free preparation artifact, and has
not begun.

One operational incident is recorded in `branch-pointer-incident.md`: a push used
a stale local branch as its source refspec, which reset the remote branch and
briefly closed PR #219. It was corrected within the minute, no commit was lost,
and no workflow, discovery or acquisition existed at the time. It is an audit
event, not an experimental result.

This sprint does **not** KEEP or KILL a production change, choose a successor
treatment, or simulate any filter relaxation. It authorizes no production change.

## Research purpose

Acquire a complete, current-base, auditable snapshot of the incumbent Brand
evidence path so later zero-OCR studies can (1) independently rederive
`truthInRawOcr`, (2) distinguish line reconstruction, candidate formation and
filtering, (3) simulate one-filter-at-a-time counterfactuals over all truth and
non-truth candidates, and (4) measure displacement and Brand-absent exposure
rather than upside alone.

**None of those four is performed here.**

## Frozen population

Exactly the 115 included cases represented in merged PR #217 and PR #218:
**105 Brand-present, 10 Brand-absent, 115 distinct source images**, every one
verified by SHA-256 and byte size against `eval-manifest.json`. Total source
imagery 38,683,897 bytes. The 44-case PR #218 subset is verified to be a subset.

### Acquisition identity is opaque

Every case is addressed by an opaque `item-NNNN` identifier, assigned 1-based and
zero-padded in ascending order of source-image SHA-256 so the sequence carries no
ordering signal from the historical names. Images are staged under generic
`item-NNNN.<ext>` filenames in an untracked directory, and that directory is the
only input the acquisition process receives.

The acquisition input carries exactly four fields: `opaqueItemId`,
`stagedImageFileName`, `sourceImageSha256`, `sourceImageByteSize`. It contains no
historical case ID, no fixture path, no governed truth, no acceptable value, no
prior per-case classification and no PR #217 or PR #218 record. The freeze script
fails closed if any of those survives into it.

The historical mapping lives at `post-freeze/id-map.json` — outside every
acquisition mount, outside the staged input directory and outside every raw
evidence directory. The acquisition process never imports, reads, resolves or
receives it. The mapping is opened only during post-freeze evaluation, after both
raw manifests are written, hashed and verified. This separation is validated by
`src/fixtures/eval/issue-149-acquisition-isolation.test.ts`, which performs
**static manifest, path and import validation** — it is not runtime proof.
Actual process-level isolation is a **mandatory discover-mode gate** inside the
runtime boundary, frozen in `acquisition-runtime-isolation-contract.json` and not
implemented in this amendment.

The staging step that copies the images necessarily knows the mapping, because
something must. It runs before and outside the acquisition process, and it is not
the acquisition process.

Execution halts on an unexpected case count, a missing or additional case, an
image hash or byte-size mismatch, a changed engine, traineddata, transform or
production configuration, or any truth-bearing field in the acquisition input.

No case is expanded, substituted or excluded.

## Exact incumbent path

| Element | Frozen value |
| --- | --- |
| Base / PR #220 merge commit | `546c3f279ce431a1fd8c0203df7a83553ea866ef` |
| `field-selection.ts` SHA-256 | `8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c` |
| tesseract.js / tesseract.js-core | 7.0.0 / 7.0.0 |
| `eng.traineddata` | `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`, 5,199,098 B |
| OEM | 1 (LSTM only) |
| Page segmentation | SPARSE_TEXT (11) on every Brand-eligible template |
| Pass planning | `planPrimaryOcrPass` + `planRecoveryOcrPasses`, unchanged triggers |
| Crop, transform, line reconstruction, candidate construction, filters, ranking, selection, authority | unchanged |

The acquisition is authorized to call exactly one non-default entry
point: **`selectBrandObservationWithCompleteFilterDiagnostics`**, merged in
PR #220. It is evaluation-only and changes no selection behaviour. Production
`selectBrandObservation` remains unchanged and default-off.

`selectBrandObservationWithCoherentLineMergeTreatment` is **not** called;
`allowCoherentPlausibleLineMerge` stays `false`. No other experimental flag is
enabled.

## How completeness is achieved without changing anything

Every truncation that limited the prior studies lives in the **evaluation
harness's `CaseReport` projection** — the 25-word `sampleWords` cap, the 12-line
cap, the 120-character text truncation, and
`filter(kept && ranking).slice(0, 6)`. The production path already produces the
complete evidence.

**The acquisition does not use the evaluation harness at all.** It calls
`extractLabelEvidenceDetailed` directly and reads the untruncated `debug` object
it returns. `runCaseArtifacts` and every `src/fixtures/eval` module are
prohibited on the acquisition route, because `runCaseArtifacts` takes an
`EvalCase`, uses the historical `caseId` as `artifactRef`, and always builds a
truth-bearing `CaseReport`. Discarding that report afterwards would not make the
call truth-free. The full contract is in `acquisition-invocation-contract.json`.

**The prohibited projection is bypassed, not raised, and no cap constant, harness
file or production file is modified.**

### Complete diagnostics are obtained by a second, exact-pass-set call

`extractLabelEvidenceDetailed` uses the ordinary `selectBrandObservation`, so its
`debug.finalSelections` carries the **default** shape with neither `filterChecks`
nor `activeRejectionReasons`. The acquisition therefore mirrors production's own
pass-set branch and re-selects:

```ts
const brandPasses =
  debug.primarySelections.brand.observation.state === "OBSERVED"
    ? [debug.passes[0]]
    : debug.passes;
const diagnosticSelection = selectBrandObservationWithCompleteFilterDiagnostics(brandPasses);
```

Calling the diagnostic selector over all passes unconditionally is **prohibited**:
production retains the primary selection when primary Brand is `OBSERVED`, so an
unconditional call would produce a different candidate population on every such
case.

Before any evidence is emitted, `diagnosticSelection` must equal
`debug.finalSelections.brand` under **full-object canonical comparison** once
**only** `filterChecks` and `activeRejectionReasons` are removed. Parity is
whole-object equality over the canonical serialization, not a field allowlist:
an allowlist compares only what someone remembered to list, so a field added
later — or one already omitted, as `brandDiagnostics.lines` was — escapes
comparison silently. Any difference, in any field at any depth, halts with
**`BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE`**. The enumerated field list in
`brand-diagnostic-parity-contract.json` is illustrative and explicitly
non-authoritative.

**`debug.finalSelections.brand` remains the authority**; the diagnostic selection
is the candidate evidence source only because parity proves the two are otherwise
the same array. No extra OCR pass runs: the second call is a pure re-selection
over results already produced.

### The `ExtractionInput` identities are frozen from the incumbent, not invented

The direct call needs an `ExtractionInput`, and every identity on it is taken
from the incumbent evaluation path's own constants in
`src/fixtures/eval/eval-harness.ts` — copied as literal values so nothing is
imported and nothing is inferred at run time:

| Field | Frozen value |
| --- | --- |
| `artifactRef` | the `opaqueItemId`, never a historical case id |
| `derivativeSha256` | `sourceImageSha256` from the truth-free manifest |
| `extractionAdapter` | `local-two-field-extractor` `1.0.0` |
| `ocrEngine` | `{ kind: ocr, engineId: tesseract.js, engineVersion: 7.0.0, modelId: eng }` |
| `parser` | `wine-alcohol-parse` `1.0.0` |
| `processedAt` | `2026-07-12T00:00:00Z` |
| `sellerRegionTargets` | omitted |
| `diagnostics` | omitted |

`processedAt` is the harness's own fixed `EVAL_PROCESSED_AT`, so it cannot vary
between the primary and repeat runs. Amendment 2 stated an invented timestamp
here; that was wrong and is corrected. The frozen values live in
`incumbent-configuration-freeze.json#extractionInputIdentities` and a Stage 1
test asserts each one is non-blank, is quoted by the invocation contract, and
actually occurs in `eval-harness.ts`.

### The complete ordered pass array is persisted, so the counterfactual is replayable

Complete rejection reasons say *why* each candidate was rejected. They do not say
what the selector would have produced had one filter been different, because the
candidates themselves are constructed from the passes. The acquisition therefore
persists the **complete ordered `RegionOcrResult` array** — all thirteen fields of
every pass, in emission order — per `region-ocr-result-replay-contract.json`,
halting on `PASS_EVIDENCE_TRUNCATED` or `PASS_ORDER_MISMATCH`.

Capability 3 is accordingly stated as **SATISFIABLE**, not satisfied: a
separately governed, zero-OCR treatment selector can later replay these passes
with exactly one filter changed. This acquisition does not run that replay and
authorizes no filter change.

### The incumbent's own mandatory dependency is allowed by name

`field-selection.ts` imports `@/domain/rules/wine-alcohol-parse` on its first
line, so the frozen route cannot run without it. An earlier plan prohibited every
transitive dependency under `src/domain/rules/**`, which would have halted trusted
preparation with `BUNDLE_PROHIBITED_DEPENDENCY` while bundling the exact incumbent
extractor it is required to run.

One exception is frozen, by **path and content hash**:

| | |
| --- | --- |
| path | `src/domain/rules/wine-alcohol-parse.ts` |
| SHA-256 at base `546c3f27…` | `2ec1368cf3f4fcfab264d1507f98267aa6f6112091332d4dda5a76152ea816e7` |
| reason | mandatory deterministic incumbent Alcohol parser reached by the unchanged extractor path |
| transitive imports | none |

It is a bounded deterministic parser over label text, not an evaluation truth
module: it reads no governed truth, no acceptable values and no per-case record.
**Every other module under `src/domain/rules/**` remains prohibited**, and the
exception is a path-and-hash pair, so a different path is not covered and the same
path with different bytes is not covered.

Separately, **every production runtime source input in the dependency closure must
match its exact bytes at the frozen base commit**, or preparation halts with
`PRODUCTION_SOURCE_DRIFTED_FROM_BASE`. A bundle manifest that merely records
whatever production source happened to be present proves the bundle is internally
consistent, not that it is the *incumbent*. Stage 2 acquisition scripts under the
explicitly approved evaluation paths are not production sources; they are hashed
and reviewed separately and listed distinctly in the manifest.

## Two exact corpus runs

One **primary** run over all 115 cases and one exact **repeat** over all 115.
No retries, no configuration change between runs, no selective rerun after a
discrepancy. The repeat determines whether the package is stable; it is **not** a
second sample from which the more favourable output may be chosen. Runtime,
environment, package and host provenance are recorded for both.

## Truth isolation

The acquisition process receives no historical case ID, no Brand-bearing
filename, no historical fixture path, no governed Brand truth, no acceptable
values, no prior per-case classification, no PR #217 or PR #218 record and not
the post-freeze ID map. Every raw output filename uses the opaque item ID only.

### The chronology, stated accurately

An earlier version of this plan said both raw manifests were written and hashed
**before the ID map or any governed truth file was opened at all**. That could
never literally be true. Trusted staging has to read the evaluation manifest and
the historical identities in order to freeze the corpus, assign opaque ids and
write the post-freeze map — and staging happens *before* acquisition. The
invariant that actually holds was never global ordering; it is **who receives
what**.

The workflow is three separate jobs, so the boundary is a process boundary and
not a promise. **Job A — trusted preparation** checks out the repository, may read
historical identity, and emits a truth-free preparation artifact containing only
the runtime bundle, the bundle manifest, the truth-free input manifest, the staged
opaque images and the empty-output specification. **Job B — isolated discover or
execute** performs no checkout, never receives the repository workspace, receives
only that artifact, and admits no GitHub token or repository credential into the
container. **Job C — the read-only identity-leak verifier** runs after sealing.
Job A is *trusted*, not truth-free; what is truth-free is the artifact it emits
and the job that consumes it, and calling the whole workflow truth-free would be
false.

**Job A physically reads governed truth, and that is now stated rather than
denied.** The freeze script reads the PR #217 per-case attribution artifact, whose
case objects carry `governedTruth.present` alongside acceptable Brand values and
other truth. It *uses* the presence flag — and only that — for the preregistered
105/10 corpus-accounting assertion. It must not use acceptable values or any truth
text for inclusion, opaque-ID assignment, image ordering, staged filenames,
preprocessing, bundle construction, or any acquisition input or emitted field.

So the **first physical access to a truth-bearing source occurs in trusted
Job A**. The boundary between actor 2 and actor 3 remains the **evaluation-use**
boundary: only actor 3 may use governed truth against acquired evidence. A
staging-independence test holds identity, paths, hashes, inclusion and presence
fixed while changing the truth text, and proves the truth-free manifest, the
opaque ordering and the staged filenames are unchanged. It does **not** claim
independence from `governedTruth.present`, because the script deliberately uses
that flag.

**`loadSourceImage` is the only source-image byte channel.** The exact Buffer the
loader returned — the one that was hashed and size-checked — is what gets written
to the opaque staged file, and the core resolves no source path against
`process.cwd()`. An earlier revision verified through the loader and then staged
with a separate `copyFileSync` from the historical path; the post-copy digest
check prevented a silent mismatch, so this was never evidence contamination, but
the injected loader was not actually the staging source. A synthetic test now
stages 115 **virtual** images whose paths do not exist on disk, which a second
byte channel could not satisfy. The transient bytes are released after staging and
never serialized into any artifact.

**The generator is one shared core.** `generateStageOneArtifacts` in
`scripts/eval/lib/issue-149-freeze-core.mjs` holds the whole algorithm and takes
its inputs explicitly — attribution data, population data, evaluation manifest, a
source-image loader, the forbidden-key inventory and output destinations. Normal
staging, `--check` and the staging-independence tests all call it, so the tests
drive the real implementation rather than a restatement of it. The core is
host-only and is never included in the runtime bundle or present in Job B. It
never calls `process.exit`: failures throw a typed `FreezeError`, cleanup runs in
`finally`, and only the CLI boundary sets `process.exitCode`.

**The generator must reproduce its own committed artifacts.** Job A reruns the
freeze script and requires bit-for-bit reproduction, so `--check` — which
regenerates all three artifacts into a temporary root, compares exact bytes,
touches no tracked file or real staging directory, and runs no OCR — is a
**mandatory precondition**. It halts with `STAGE_1_GENERATED_ARTIFACT_DRIFT`.
Amendment 6 corrected the committed ID map but not its generator, which would have
left Job A choosing between failing and overwriting reviewed artifacts with
superseded metadata.

**Phase 1 — trusted staging (Job A).** May read the evaluation manifest, historical case
identities, historical fixture paths and the source images, and may do so *only*
to freeze the population, assign `item-NNNN` identifiers, stage images under
generic filenames, verify source-image hashes and byte sizes, and write and
verify `post-freeze/id-map.json`. It is outside the acquisition process, runs no
OCR, and supplies historical identity and truth to **nothing** — not the runtime
bundle, not the truth-free manifest, not the environment, not any mounted data.

**Phase 2 — isolated acquisition.** Receives no historical case identifier, no
Brand-bearing filename, no historical fixture path, no governed Brand truth, no
acceptable values, no prior per-case classification, no PR #217 or PR #218 record
and not the post-freeze ID map. Every raw output filename uses the opaque item ID
only. From inside the boundary it scans its mounted input set, its mount list and
its emitted records for **the single authoritative forbidden-key inventory, unexpected mounted files and
unexpected emitted files**, and it writes and seals each raw manifest inside the
boundary. That inventory is one ordered list of ten field names, held in a
canonical asset at `runtime/truth-key-inventory.json` and referenced by every
contract and by the executable scanner — `isTruth`, `matchesTruth`,
`truthInRawOcr`, `truthOnReconstructedLine`, `truthFilterReasons`,
`expectedBrand`, `acceptableValues`, `brandPresent`, `historicalCaseId`,
`historicalImagePath`. It governs **every** emitted file, not only the pass and
candidate records whose schemas are closed: selection, failure, count, manifest
and provenance records are separate output shapes and are scanned too.

It does **not** scan for historical case IDs or fixture paths. It cannot: it does
not hold that inventory, and handing it the inventory would be precisely the leak
the scan exists to prevent.

**Phase 3 — read-only identity-leak verification (Job C).** After **both** raw
manifests are sealed, the evidence is remounted or otherwise exposed
**read-only**. A separate verifier receives the sealed evidence and a *minimal*
historical case-ID and fixture-path inventory — and no acceptable Brand values, no
truth labels, no prior per-case classifications. It verifies the artifact digest
and both raw manifests, then scans the already-frozen bytes for historical IDs and
paths. It may not modify, rewrite, reformat, re-emit or replace any raw file, and
it performs no truth-based evaluation. Its report lives outside `raw/` and carries
its own SHA-256. A hit halts with `TRUTH_ISOLATION_FAILURE`.

**A clean Job C report is a mandatory precondition for both actor 2 committing
evidence and actor 3 beginning post-freeze evaluation.** Above 100 MB Job C still
runs: identity-leak verification does not depend on whether the evidence is ever
committed.

**Phase 4 — post-freeze evaluation** is the only phase that uses governed truth
against the evidence.

**No phase compares OCR transcripts or candidate values against governed Brand
strings before the truth boundary.** A legitimate transcript may naturally
contain the Brand text — that is evidence, not leakage, and checking it would
require opening a truth file early. Truth-string inventory and comparison belong
to phase 4 alone.

## Complete raw OCR evidence

Per item and per pass, without sampling or truncation: the complete
`RegionOcrResult` — all thirteen fields, in emission order — plus two clearly
labelled non-type fields, the **opaque item ID** and the **source image SHA-256**,
both manifest-sourced, and one clearly labelled derived field, `role`. No schema
field anywhere is named `caseId`.

The pass record therefore carries `passId`, `regionName`, `passKind`,
`triggerReasons`, `preprocessing`, `fieldEligibility`, `transform`,
`transformedSize`, `pageSegMode`, `rawWordCount`, `discardedWordCount`, `timings`
and `words` — **every raw OCR word** in original order with exact text,
confidence and bounding box, plus original geometry where the pass mapped it.

**Two previously promised fields are withdrawn, because they are not reachable
through the frozen production interface.** `runOcrPass`
(`src/pipeline/extractor/regions.ts:610`) builds the preprocessed PNG inside a
private `preprocess()` call, hands it to the engine, and returns only the
thirteen-field result:

- **`cropPixelSha256`** — the buffer handed to OCR is never exposed on `debug`.
  It is recorded as unavailable. It is **not** replaced by hashing a separately
  reconstructed crop: that would be a second implementation of preprocessing, and
  labelling its output `cropPixelSha256` would present a different byte stream as
  the original.
- **per-pass `warnings` and `errors`** — `RegionOcrResult` has no such field.
  `runOcrPass` reports failure by *throwing*, so a failed pass yields no pass
  record at all.

`originalGeometry` is optional in production, and the faithful JSON
representation of an absent optional is **omission**, not `null`. An earlier
version normalized it to `null`; that is not an exact `RegionOcrResult`, because
a replay reading `null` sees a present-but-empty property where production had no
property at all — and the inverse mapping producing nothing is precisely the
signal that the token was never mapped back to the original frame. A replay must
preserve omission, or decode it back to absence before selection. An explicit
`null` halts with `PASS_WORD_ORIGINAL_GEOMETRY_NULL`.

The pass record's key set is **closed**: exactly those thirteen fields. Run
metadata — wall clock, workflow run ID, artifact ID, artifact expiration, runner
identity — lives in a separate provenance record; on a pass record it is an
unexpected key and is rejected, so it cannot enter a semantic fingerprint by
accident. The words-only digest is named `orderedWordsOnlyFingerprint` so it can
never be mistaken for the complete semantic pass fingerprint.

In their place, an item-level typed failure record is persisted from the `Result`
that `extractLabelEvidenceDetailed` returns: `code`, `message`, `issues`, the
opaque item ID and the source-image SHA-256. **No partial `debug` object is
invented after an extractor failure, and no failed item is retried, in whole or
in part.** A case-level failure produces the preregistered `RUNTIME_FAILURE` or
`INCOMPLETE_EVIDENCE` verdict; it is never quietly dropped from the population.

Every reconstructed Brand line, with no 12-line cap: exact text, cleaned value,
confidence inputs, reconstruction provenance, kept flag, line reason, ordering.

Observed maximum words and lines per case are recorded, and the emitted counts
must equal the debug array lengths. Any inequality halts with
`RAW_EVIDENCE_TRUNCATED` or `LINE_EVIDENCE_TRUNCATED`.

**Not available, verified against the real types at this base and recorded as
absent with the reason:** word baseline geometry; block, paragraph and line
identifiers; constituent word IDs per line. No field is invented to fill these.

## Complete Brand candidate-decision evidence

Every candidate decision generated before final retention, **kept and rejected**,
one JSON object per line in a per-case JSONL file. Per candidate: stable ID; raw
and cleaned values untruncated; source pass and support passes; source line
indexes; assembly span; prominence; token and line confidences; candidate class
and provenance; kept flag; the recorded rejection reason; ranking eligibility;
complete ranking-score components; final ranking score; position in the
**complete** ranked list; whether selected. Per case: final selected value, final
authority state, abstention reason.

Recorded per case: candidate count, kept count, rejected count. Per run: maximum
and total candidate count. The emitted count must equal
`brandDiagnostics.candidates.length` read before any projection; any mismatch
halts with `CANDIDATE_EVIDENCE_TRUNCATED`.

No truth label is attached during acquisition.

### Complete filter diagnostics — the original blocker is resolved

The original plan recorded that only the first firing rule was observable.
**Merged PR #220 resolves that.** For every candidate the acquisition persists:

- `filterChecks` — the complete ordered array of all ten rules with whether each
  failed;
- `activeRejectionReasons` — every failed rule in ladder order;
- the authoritative `filterReason`, which for a rejected candidate equals
  `activeRejectionReasons[0]`;
- kept/rejected status.

The ladder order is `producer-line`, `no-letters-or-too-short`,
`non-brand-keyword`, `too-many-words`, `domain-like`, `varietal-or-designation`,
`generic-product-language`, `location-or-appellation`,
`low-information-fragment`, `sentence-fragment`.

**The acquisition does not recompute any predicate.** It consumes what PR #220
emits, so no second implementation can drift from production. PR #220 enforces
eight runtime invariants whenever diagnostics are enabled, throwing on the prefix
`BRAND_FILTER_DIAGNOSTIC_INVARIANT_FAILURE`.

Acquisition halts with `COMPLETE_DIAGNOSTICS_ABSENT` if either field is missing
from any candidate.

### Candidate identity

Identity is an ordinal plus a full digest, never a truncated hash: `opaqueItemId`,
`candidateOrdinal` into the exact unprojected production array,
`completeCandidateArrayLength`, a 64-character `canonicalRecordSha256`, and a
`stableCandidateId` of `${opaqueItemId}:${ordinal}:${digest}`.

`canonicalRecordSha256` is defined over a **non-circular preimage**: the complete
persisted record minus exactly `canonicalRecordSha256` and `stableCandidateId`.
Canonicalization version `issue-149-candidate-canonical-v1` — keys recursively
sorted, array order preserved, undefined object properties omitted, undefined
array values and non-finite numbers rejected, no separator whitespace, UTF-8
bytes, lowercase 64-hex digest. Full definition in
`candidate-fingerprint-contract.json`; reference implementation and tests in
`scripts/eval/lib/issue-149-evidence-canonical.ts`, deliberately outside
`src/fixtures/**` so the Stage 2 runner may import it without violating the
fixtures prohibition.

Asserted: ordinals begin at 0, are contiguous and occur exactly once; candidate
IDs are unique within each case; the emitted count equals the unprojected
diagnostic-array count; no record is silently overwritten or deduplicated.
Halts with `CANDIDATE_ID_COLLISION` or `CANDIDATE_EVIDENCE_TRUNCATED`.

### One call emits the candidates

The **only** authorized candidate-emission API is
`finalizeProductionCandidateArray(diagnosticSelection, opaqueItemId)` from
`scripts/eval/lib/issue-149-candidate-adapter.ts`, called exactly once per item
with the **complete `FieldSelection`** that
`selectBrandObservationWithCompleteFilterDiagnostics` returned.

The adapter reads the population from
`diagnosticSelection.brandDiagnostics.candidates` **itself**. An earlier signature
took a bare array — and the workflow named `diagnosticSelection.candidates`, which
does not exist on `FieldSelection` — so a runner could have handed over a filtered
or truncated population while technically calling the approved function. It halts
with `COMPLETE_DIAGNOSTICS_ABSENT` if the diagnostics or the candidate array are
missing, and with `CANDIDATE_EVIDENCE_TRUNCATED` if the emitted count disagrees
with the complete diagnostic candidate count. `candidateOrdinal` is the original
diagnostic-array index, and `opaqueItemId` is validated even when the population
is empty. The runner may not call `finalizeCandidateRecord`,
`finalizeProductionCandidate`, `toCandidateEvidenceRecord`, `stableCandidateId` or
`TEST_ONLY_candidateAdapterInternals` for Brand candidate emission, and may not
construct a `rankedPosition` itself.

That prohibition is not stylistic. The lower-level functions accept a
caller-supplied position, so a runner could "use the reference adapter" while
inventing positions — bypassing production-comparator ordering, decision-based
membership, contiguity, uniqueness and the exactly-one-selected invariant. Those
functions are module-private and **not exported at runtime at all** — an earlier
`TEST_ONLY_candidateAdapterInternals` object made them reachable, so a helper the
runner imported could have bypassed the array API without the runner source
containing a prohibited symbol. The adapter now exports exactly one
candidate-emission function, and the tests exercise candidate construction
through it.

Because the runner-source guard is first-order by construction, **trusted Job A
additionally scans every Stage 2 acquisition source input in the dependency
closure** for those symbols, outside the adapter module itself. The first-order
regex does not prove the transitive property and does not claim to. The canonical helper remains
permitted for pass validation, semantic fingerprinting and exact-byte hashing.

### A kept population must retain a ranked survivor

Per-record validation cannot see this. Each kept candidate may individually lack a
`decision` because deduplication removed it — but they cannot **all** lack one.
Production always builds a non-empty ranked list and assigns exactly one selected
decision whenever kept candidates exist. The global relation is:

```
(any candidate is kept) === (at least one candidate carries a decision)
```

Enforced in `finalizeProductionCandidateArray`, together with: every
decision-bearing candidate is kept; every ranked member carries score and ranking
semantics; positions are unique and contiguous; and exactly one selected candidate
sits at position 0. Halt: `RANKED_MEMBERSHIP_INCONSISTENT`.

### Kept and rejected candidates carry different complete evidence

Production scores and assigns ranking semantics to **every kept candidate** before
family reduction and deduplication. A rejected span returns from
`analyzeBrandSpan` before a `Candidate` object exists, so it can carry none of it.

Every **kept** candidate therefore has a non-null `score` satisfying the complete
`BrandCandidateScore` schema, a non-null `ranking` satisfying the complete ranking
schema, `rankingEligible` true, and `rankingScore` equal to `ranking.rankingScore`.
It may still have `decision` and `rankedPosition` both null — that is exactly what
a candidate removed by deduplication looks like.

Every **rejected** candidate has `score`, `ranking`, `decision` and
`rankedPosition` all null, `rankingEligible` false and `selected` false. Halt:
`KEPT_CANDIDATE_EVIDENCE_INCOMPLETE`.

### Ranked position means final production ranked membership

Production assigns `ranking` semantics to **every scored candidate**, then reduces
them with `bestFamilyCandidates` and `dedupeBestCandidates`, sorts the survivors
with `compareCandidateRanking`, and assigns a `decision` **only to candidates in
that final ranked array** (`field-selection.ts:2556-2578`).

So `ranking !== undefined` means *ranking semantics were computed*, and
`decision !== undefined` means *this candidate survived into the final ranked
list*. A candidate can have the first without the second, because deduplication
removed it.

`rankedPosition` therefore tracks `decision`, not `ranking`. Final ranked members
are ordered by **production's own exported comparator**, applied through a minimal
`{ ranking }` wrapper — the comparator reads nothing else, which is verified
against the real function — with the original diagnostic-array order as the stable
tie-break. Positions are contiguous `0..N-1` and unique; exactly one candidate is
selected when N > 0 and it must be position 0; nothing outside the membership
receives a position; and a rejected candidate has `decision`, `ranking` and
`rankedPosition` all null.

An earlier adapter took every diagnostic carrying a `ranking` and sorted by
`rankingScore` descending. That gave fake positions to candidates production had
eliminated and ignored the ordered comparator, which can prioritise score
eligibility, prominence, OCR evidence and normalized value under three ordering
modes. Halts: `RANKED_MEMBERSHIP_INCONSISTENT`, `RANKED_POSITION_PARITY_FAILURE`.
Uniqueness and contiguity are enforced across the whole array, because no
single-record validator can prove them.

### Candidate support is pre-deduplication support

Production merges support-pass information during deduplication, *after* the
public diagnostics are built, and never writes the merged value back. The record's
`supportPassIds` and `candidateProvenance` are therefore the **pre-merge** values
and must not be described as the final support set. The post-merge support for the
**selected observation** is available from `FieldSelection.supportingPassIds` and
is persisted separately; the complete merged support for every ranked candidate is
not exposed and is **not reconstructed here**.

### A complete record is a schema, not a convention

Identity alone is not evidence. `finalizeCandidateRecord` validates the **whole
record against a frozen schema before it hashes anything**, and refuses to
finalize otherwise. The twenty-eight required own properties are
`canonicalizationVersion`, `opaqueItemId`, `candidateOrdinal`,
`completeCandidateArrayLength`, `rawText`, `cleanedValue`, `confidence`,
`ocrEvidenceScore`, `ocrConfidence`, `prominence`, `regionName`, `passId`,
`passKind`, `supportPassIds`, `candidateProvenance`, `assembly`, `lineIndexes`,
`kept`, `filterReason`, `decision`, `score`, `ranking`, `filterChecks`,
`activeRejectionReasons`, `rankingEligible`, `rankingScore`, `rankedPosition` and
`selected`.

The key set is **closed**: before finalization the own keys must *equal* that
list, and after finalization they must equal it plus `canonicalRecordSha256` and
`stableCandidateId`. An unexpected key is as fatal as a missing one — an open set
would let an undeclared acquisition, truth, debug or convenience property enter
the fingerprint silently, so the digest would cover something no contract
describes.

Every value must be an **actual incumbent value**, not merely the right
primitive: `passKind` an `OcrPassKind`, `assembly` a `BrandCandidateAssembly`,
`filterReason` a non-null `BrandLineReason`, `decision` null or a
`BrandCandidateDecision`, and `ocrConfidence`, `candidateProvenance`, `score` and
`ranking` complete frozen structures rather than merely non-array objects. The
copied vocabularies are guarded against drift by a test that imports the
production constants and asserts equality.

Seven cross-field invariants are enforced, mirroring production's own
`assertBrandFilterDiagnosticInvariants` plus the acquisition's derived-field
rules: `filterChecks` holds exactly all ten rules, once each, in frozen order;
`activeRejectionReasons` equals the failed checks in ladder order; a rejected
candidate has at least one active reason whose first element is `filterReason`; a
kept candidate has no active reason, no failed check and a `candidate-positive`
or `candidate-plausible` reason; `rankingEligible` equals `ranking !== null`;
`rankingScore` equals `ranking?.rankingScore ?? null`; and `selected` equals
`decision === "selected"`.

Three details matter and were wrong before:

- the field is **`filterReason`**, production's own property name, never a
  renamed `authoritative…` variant;
- **`regionName`** is persisted at the top level, not only inside
  `candidateProvenance`;
- **`filterReason`** is a non-null `BrandLineReason`, never `string | null`.
- **`ranking`** is persisted as the complete `AnalyzerCandidateRanking` object —
  strategy, ordering mode, comparator and score factors — not merely
  `rankingScore`, because a replay needs the comparator and ordering mode.

Production optionals that are absent are normalized to **explicit `null`**, so
the canonical key set is identical across every record. Omission is rejected;
`null` is valid.

`stableCandidateId` validates the **complete preimage schema** before it will
accept a supplied digest. An earlier version checked only that the digest was
present, well formed and self-consistent — so a caller could hash a two-field
partial and hand the result straight back, and the digest matched because it was
computed over exactly that partial. A self-consistent digest over incomplete
evidence is still incomplete evidence.

Validation runs first, and only then does the acquisition compute
`canonicalRecordSha256`, attach it, verify it, and attach `stableCandidateId`.
Halts: `MISSING_REQUIRED_FIELD`, `FIELD_TYPE_MISMATCH`,
`MALFORMED_OPAQUE_ITEM_ID`, `MALFORMED_CANDIDATE_ORDINAL`,
`MALFORMED_ARRAY_LENGTH`, `ORDINAL_OUT_OF_RANGE`,
`WRONG_CANONICALIZATION_VERSION`, `ALREADY_FINALIZED`, `MISSING_DIGEST`,
`MALFORMED_DIGEST`, `DIGEST_DOES_NOT_MATCH_RECORD`.

### Evidence volume

Complete and uncapped. Expected 15–40 MB for both runs. A repository-footprint
gate applies, under a transport that respects `permissions: contents: read`.
The OCR job **never commits anything** and is never granted `contents: write`.
At every size it uploads the complete lossless evidence as a **temporarily
retained workflow artifact**, recording its ID, exact bytes, SHA-256, configured
retention and expected expiration, and verifies the uploaded digest before any
job-local output is deleted. At or below 100 MB it stops there, and a separate,
owner-authorized post-run process — not the OCR process — downloads the artifact,
re-verifies its digest and commits the evidence. Above 100 MB it stops before Git
commitment, **stops before post-freeze truth evaluation**, and requires an
explicit owner decision about durable archival before continuing. A workflow artifact is
retention-bound; it is never described as permanent preservation unless a durable
destination has actually been verified. **It is a Git storage gate, never an evidence-completeness exception** —
nothing is truncated, sampled, discarded, recompressed destructively or omitted.

## Raw evidence freeze

**Inside the isolated acquisition process, before it exits:** write a primary
manifest, write a repeat manifest, hash every OCR, line and candidate record,
write an aggregate manifest SHA-256, record the exact commit and workflow run,
and assert no forbidden evidence key is present in any emitted file.

"Before truth is loaded" was the wrong framing, because it described a global
ordering no component could honour — trusted staging necessarily read historical
identity earlier. The boundary is **process-specific**: the isolated acquisition
process never holds the ID map or governed truth at any point in its life, and
the sealing above happens entirely inside it. Historical identifier *values* are
checked afterwards by Job C, read-only, against frozen bytes.

`raw/` becomes **immutable**. Nothing under it is pretty-printed or rewritten
after freezing; JSONL is emitted in final form and added to `.prettierignore`
before hashing.

## Repeat comparison and acquisition verdict

### Integrity and semantics are separate measurements

**Full artifact integrity** is SHA-256 over the **exact persisted file bytes**,
including `timings` and run metadata — `sha256Bytes`, not a canonical object
digest. A canonical digest deliberately cannot see whitespace, key order or a
terminal newline, so it can never prove a file is unaltered; an earlier version
exported one under an integrity-sounding name, and that name is removed rather
than reinterpreted. Byte integrity is **not** expected to match between the
primary and repeat runs — two independent runs legitimately differ in timings,
and an integrity hash that matched across them would mean the second run had not
been recorded independently. Raw manifests and their aggregate use exact file
bytes.

**Semantic fingerprints** are computed over the **validated** complete
`RegionOcrResult` with exactly one exclusion, `timings`, preserving all array
order; and over the complete ordered pass array with `timings` removed from each
pass. Validation is not optional: the pass record's own-key set must equal the
thirteen production fields exactly, so run metadata on a pass record is
**rejected rather than silently hashed**. These carry the determinism verdict.

This split is a correction. Amendment 3 required a fingerprint over the complete
pass record *including* timings and simultaneously required exact fingerprint
agreement between runs. `performance.now()` values differ by construction, so
that pair guaranteed an apparent-nondeterminism verdict on every possible run.

`timings` and run metadata — wall-clock start and end, workflow run ID, artifact
ID, artifact expiration, runner and host identity — are **persisted in full and
compared and reported descriptively**, but a difference confined to them must
never on its own produce `COMPLETE_WITH_NONDETERMINISM`. They are provenance and
telemetry, not recognizer output.

The words-only pass digest is renamed `orderedWordsOnlyFingerprint` so it cannot
be mistaken for the complete semantic pass fingerprint.

Primary and repeat are compared at source-image hashes, OCR words and geometry,
complete pass records excluding timings, reconstructed lines, candidate-decision
arrays, ranking order, selected value, authority state, semantic fingerprints and
candidate identity. **Every difference is reported. No case is rerun or
repaired.** Under nondeterminism both runs are preserved and neither is
canonical.

Exactly one verdict, computed from gates rather than asserted:
`COMPLETE_DETERMINISTIC_EVIDENCE`, `COMPLETE_WITH_NONDETERMINISM`,
`INCOMPLETE_EVIDENCE`, `TRUTH_ISOLATION_FAILURE` or `RUNTIME_FAILURE`.

## Who does what after the run

The OCR job holds `permissions: contents: read` and therefore **never commits
anything**. Three actors, in order, each with an explicit boundary:

| # | Actor | May read governed truth? | May commit? |
| --- | --- | --- | --- |
| 1 | the OCR workflow job | no | no |
| 2 | the owner-authorized post-run commit process | no | yes, at or below 100 MB |
| 3 | the separately authorized post-freeze evaluation | yes | no raw evidence |

Actor 1 ends after uploading the complete lossless evidence artifact **at every
size** and verifying its digest before any job-local output is deleted.

Actor 2 is **not** claimed to be physically unable to reach the ID map.
`post-freeze/id-map.json` is committed on this branch and covered by the Stage 1
package manifest, so a process operating in an ordinary checkout can read it, and
saying otherwise would be false unless actor 2 ran inside a separately verified
restricted environment — which it does not. The control that protects the
evidence is **immutable-byte equality**: actor 2 takes the verified workflow
artifact as its evidence input, verifies the outer digest and both raw manifests,
commits exactly those bytes, and verifies that every committed file's SHA-256
equals its manifest entry. It performs no transformation, filtering,
regeneration, re-serialization, reordering or selective omission, and any changed
byte fails verification. Truth and historical identity are not inputs to any
decision it makes, because it makes no content-dependent decision at all — it
commits the bytes it verified, or it fails.

At or below 100 MB, actor 2 — explicitly **not** the OCR process — downloads the
artifact, verifies its digest, verifies **both** raw manifests and their
aggregates, commits the immutable raw evidence to PR #219, and **stops for
review**. Only then may actor 3 be authorized, and actor 3 is the only actor
**authorized to use** `post-freeze/id-map.json` or the governed truth for
evaluation. That is an authorization rule, not an access claim: the map is
committed on this branch, so any checkout can physically read it. A clean Job C
identity-leak report is a precondition for both actor 2 and actor 3.

Above 100 MB, actor 1 still uploads and verifies, then stops before Git
commitment and before post-freeze truth evaluation; actors 2 and 3 do not run
until an explicit owner decision about durable archival.

**The truth boundary sits between actor 2 and actor 3** — not inside the OCR
workflow, which never holds truth to begin with.

## Post-freeze evaluation

Only after both manifests verify, governed truth is loaded to rederive
`truthInRawOcr`, `truthOnReconstructedLine`, truth-bearing candidate formed and
kept, the filters rejecting each truth-bearing candidate, truth rank, selected
correctness and the final authority result — using the existing governed
normalization exactly, with no new alias and no truth-guided correction.

These are cross-checked against `brand-evidence-path-diagnosis/cases.json` and
the merged PR #217 and PR #218 artifacts, and each difference is reported as
`CURRENT_RERUN_CONFIRMS_PRIOR_FIELD`, `PRIOR_FIELD_NOT_REPRODUCED`,
`CURRENT_PIPELINE_DIFFERENCE`, `NONDETERMINISTIC_EVIDENCE` or
`CANNOT_COMPARE_SEMANTICALLY`. No prior record is silently replaced and no
current-equivalence is claimed where a measurement now disagrees.

**This evaluation validates evidence completeness only.** It does not simulate
removing a filter and does not recommend a filter treatment.

## Interpretation boundaries

The acquisition records what the pipeline does; it does not test whether the
pipeline is correct or production-suitable. The repeat measures stability on one
host and one build, not cross-host determinism. Production's own generation caps
mean "all candidates" means all candidates production formed.

## State at the time of this freeze

No governed 115-case acquisition OCR, acquisition runner OCR, discovery or
execute-mode OCR has run, and no execution workflow exists. The ordinary
repository suite continues to run its pre-existing bundled-image OCR tests,
disclosed separately. **No recognizer has been downloaded or executed for
acquisition purposes** — no recognizer runs on the governed corpus, in the
acquisition runner, in discovery or in execute mode. The ordinary suite's
pre-existing tests do execute the bundled `eng.traineddata` recognizer, which is
why that statement is qualified rather than absolute. No production code, OCR configuration, traineddata,
preprocessing, crop planning, recovery trigger, Brand reconstruction, filter,
ranking, selection, authority, truth, normalization, threshold, alias or state
semantic has been changed by this PR. No filter
relaxation has been implemented or simulated. No successor treatment has been
chosen. No corpus case has been expanded, substituted or excluded. PR #195 is
untouched, and PRs #214, #216, #217 and #218 are not reinterpreted.
