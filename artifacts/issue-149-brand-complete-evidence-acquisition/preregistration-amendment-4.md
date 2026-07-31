# Preregistration amendment 4 — pre-discovery contract reconciliation

Refs Issue #149, PR #219. **Amended before any governed acquisition OCR and
before discovery.**

## No governed acquisition OCR or discovery occurred before Amendment 4

**Zero, under any of the five plans.** No `raw/` directory, no raw-evidence
manifest, no workflow file, no `workflow-mode.txt` and no acquisition runner has
ever existed on this branch. Discover mode has never been entered; execute mode
has never been entered. Nothing in this amendment is informed by an acquisition
result, because there is no acquisition result.

## All earlier states are preserved

| State | Head | Base | Preregistration SHA-256 |
| --- | --- | --- | --- |
| **Original Stage 1** | `7600b0a9ba5ce6995274a517121f1eda18a30424` | `8f0c6a7ca7c271eed14d9084ed6da7fe11f897a9` | `7b691c78a9de008039ccc1a7f94824015373b1caec58f8235c78a03587c641fb` |
| **Amendment 1** | `26157cfe036fb8b1506431d1aa9309029ac2dcdb` | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | `cfc118c670a9c69f783f3ca58174113711b553baf1278da31a35e31121bf13ad` |
| **Amendment 2** | `ad1c296194e21e91af8333953ad47abe396495dc` | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | `9287ecc0d5d01bae83316c9d0dcb462d6eca566c925405cde83631fa65c89d35` |
| **Amendment 3** | `37e1a3ea752c12b230d468c10f604b8550d37ce1` | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | `3cf3d25fbb892dabc66e58796841c542fcc4eb79f7cd5d561271a7689ed87786` |
| **Amendment 4** | this commit | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | see `preregistration.sha256` |

No earlier plan is deleted or reinterpreted. Amendments 1–3 stand; Amendment 4
reconciles contradictions that survived Amendment 3 and were found in review
before discovery.

One operational incident is recorded separately in `branch-pointer-incident.md`.

## What review found, and what changed

### 1. Two different `processedAt` values were both authoritative

`incumbent-configuration-freeze.json` froze `2026-07-12T00:00:00Z` under
`extractionInputIdentities` — correctly — while its top-level `fixedProcessedAt`
still carried a *different* literal, `2026-01-01T00:00:00.000Z`. Two
authoritative values cannot both be right, and the Amendment 3 tests inspected
only the nested one, so the contradiction passed CI.

The stale literal is removed. `fixedProcessedAt` now points at the single
authoritative identity rather than restating a value. **Exactly one literal
remains in the package: `2026-07-12T00:00:00Z`**, the incumbent harness's own
`EVAL_PROCESSED_AT`.

Three new consistency assertions: the frozen literal is declared where expected;
a **recursive scan** finds no other ISO timestamp anywhere in a current,
non-historical contract; and every `processedAt` declaration resolves to that one
literal, allowing a source pointer but no second timestamp.

### 2. The workflow still put host-only steps inside isolated discovery

The runtime contract separated trusted host preparation from isolated discovery
in Amendment 3, but `workflow-plan.md` still listed discovery as re-running the
freeze script, reproducing the post-freeze ID map, verifying `preregistration.md`
and the Stage 1 artifacts, and verifying the original source images. **None of
those resources exists inside the boundary.** Its execute description also said
the container mounts "only" the staged images and output, contradicting the four
experiment-controlled mounts the runtime contract requires.

`workflow-plan.md` is rewritten with an explicit split.

**Phase 1 — trusted host preparation, outside isolation, no OCR:** check out and
verify the Stage 1 package and manifest; verify `preregistration.sha256`; run the
freeze/staging script; verify the source images and the post-freeze map; verify
the incumbent configuration pins; build the allowlisted runtime bundle; generate
the dependency closure and bundle manifest; scan the built bundle; prepare the
empty output mount.

**Phase 2 — isolated discover, inside the execute boundary, no OCR:** it receives
exactly four experiment-controlled data mounts — runtime bundle (ro), truth-free
manifest (ro), staged opaque images (ro), initially empty output (rw) — plus only
the frozen pseudo-filesystem allowlist and the named `tmpfs` scratch paths.
Inside it, the plan explicitly forbids re-running the freeze script, reading
`preregistration.md`, reading the Stage 1 artifacts directory, reading fixtures or
original source paths, and opening the post-freeze ID map. It verifies **only the
resources actually mounted there**, and still stops for owner review before
execute.

Execute now names all four mounts rather than two.

### 3. The canonical helper was prohibited from the runner that must use it

The Stage 2 runner is required to use the reference implementation, which lived
at `src/fixtures/eval/issue-149-candidate-canonical.ts` — a path the same
contract and the implemented guard both prohibit importing. The requirement and
the prohibition contradicted each other.

The **implementation moved**, not the prohibition:
**`scripts/eval/lib/issue-149-evidence-canonical.ts`**. It imports only
`node:crypto`. The invocation contract lists it under `permittedImports` and a
test asserts it sits under none of the contract's own prohibited prefixes and
that the old path no longer exists. Its test stays under `src/fixtures/eval/` and
imports the new location — a test is not the runner, and nothing imports it.

The canonicalization **version string is deliberately unchanged**
(`issue-149-candidate-canonical-v1`): it names the frozen algorithm, which did not
change, not the file path.

### 4. Candidate finalization still accepted incomplete evidence

`stableCandidateId` required and rechecked a digest, but `finalizeCandidateRecord`
had no complete-record schema, so it would happily finalize
`{ opaqueItemId: "item-0001", candidateOrdinal: 0 }` — a well-formed identity over
no evidence at all. The Amendment 3 tests only proved that calling
`stableCandidateId` *directly* without a digest failed.

There is now an explicit `CandidateEvidenceRecord` contract and reference shape
with **twenty-eight required own properties**, and three field-level corrections:

- **`filterReason`**, production's own property name. Amendment 3's contract
  called the persisted field `authoritativeFilterReason` while the real
  `BrandCandidateDiagnostic` property and the fingerprint record both used
  `filterReason`. One name, and it is production's.
- **`regionName`** at the top level, which the Amendment 3 preimage omitted
  entirely.
- **`ranking`** persisted as the complete `AnalyzerCandidateRanking` object —
  strategy, ordering mode, comparator, score factors — not merely `rankingScore`.
  A replay needs the comparator and the ordering mode.

Absent production optionals are normalized to **explicit `null`**, so the
canonical key set is stable; omission is rejected, `null` is valid.

`finalizeCandidateRecord` fails closed unless `opaqueItemId` matches
`^item-\d{4}$`, `candidateOrdinal` is a non-negative integer,
`completeCandidateArrayLength` is a positive integer, the ordinal is below the
length, every required key is an own property, every field satisfies the frozen
type predicate, and neither derived identity field is already present. **Only
then** does it compute the digest, attach it, verify it, and attach the stable
id. `stableCandidateId` still refuses partial records outright.

### 5. Several operative contracts still asserted superseded conclusions

Current, non-historical documents still said that filter checks were unavailable
and the predicates module-local and unexported; that a one-filter counterfactual
remains an upper bound because later rules are unknown; that this was the
package's most consequential limitation; that "the harness" consumes the complete
diagnostics; and that capability 3 became satisfied merely because PR #220
merged.

All are corrected in `purpose-and-boundaries.md`, `limitations.md`,
`candidate-decision-contract.json`, `candidate-fingerprint-contract.json`,
`decision-rules.json`, `determinism-rules.json`, `evidence-schema.json`,
`raw-ocr-contract.json`, `post-freeze-evaluation-plan.json`,
`truth-isolation-plan.json`, `incumbent-configuration-freeze.json`,
`workflow-plan.md`, `preregistration.md` and `commands.sh`. Every operative
contract now records `amendedBy: preregistration-amendment-4.md`.

Capability 3 remains **SATISFIABLE** through a future zero-OCR `RegionOcrResult`
replay. **It is not performed here.**

The consistency sweep now tests the *concepts*, not only exact old sentences:
`module-local and unexported`, `cannot be re-evaluated offline`, `most
consequential limitation`, `remains an upper bound`, `The harness consumes`,
`moved from partial to satisfied`, `satisfied only because PR #220 merged`,
`authoritativeFilterReason`, the old canonical path, the stale timestamp, and any
operative contract still stamped with Amendment 2.

### 6. Some promised raw evidence was unreachable through the frozen interface

`runOcrPass` (`src/pipeline/extractor/regions.ts:610`) creates the preprocessed
PNG inside a private `preprocess()` call, hands it to the engine, and returns only
the thirteen-field `RegionOcrResult`. The buffer never reaches `debug`, and
`RegionOcrResult` has no warning or error field — failures are *thrown*.

- **`cropPixelSha256` is withdrawn.** It cannot honestly be described as the hash
  of the buffer handed to OCR. It is recorded as unavailable, and is **not**
  replaced by a separately reconstructed crop under the same name: that would be a
  second implementation of preprocessing presented as the original byte stream.
  It is also removed from the determinism comparison levels.
- **Per-pass `warningsAndErrors` is withdrawn.**

In their place, **item-level typed failure evidence** is persisted from the
`Result` that `extractLabelEvidenceDetailed` returns — `ExtractionError` is
`{ code, message, issues }` — together with the opaque item ID and the
source-image SHA-256. No partial `debug` object may be invented after an extractor
failure; no failed item may be selectively retried; a case-level failure produces
the preregistered runtime/incomplete verdict.

Derived and manifest-sourced fields (`role`, `sourceImageSha256`, `opaqueItemId`)
are now labelled as such, so no reader mistakes them for fields of
`RegionOcrResult`.

### 7. Timing guaranteed apparent nondeterminism

The replay contract required a canonical fingerprint over the complete pass
record **including `timings`**, while the determinism contract required exact
fingerprint agreement between the primary and repeat runs. `performance.now()`
timings differ by construction, so that pair guaranteed a nondeterminism verdict
on every possible run. The older raw contract meanwhile defined the pass
fingerprint over ordered words only — a third, incompatible definition.

Three concepts are now separate:

- **Full artifact integrity** — file and manifest SHA-256 over every persisted
  byte, including timings and run metadata. Proves immutability. **Not** expected
  to match between runs.
- **Semantic pass fingerprint** — the complete `RegionOcrResult` excluding exactly
  `timings`, all array order preserved.
- **Semantic ordered-pass-array fingerprint** — the complete ordered pass array
  with `timings` removed from each pass.

The determinism verdict uses the semantic fingerprints and semantic field
comparison. Timings are persisted and reported descriptively and **never alone**
produce `COMPLETE_WITH_NONDETERMINISM`. Run metadata — wall-clock start and end,
workflow run ID, artifact ID, artifact expiration, runner and host identity — is
provenance and never enters the semantic equality gate. The words-only digest is
renamed `orderedWordsOnlyFingerprint`.

Synthetic tests prove that changing only timings changes the integrity hash but
not the semantic digest; that changing a word, transform, preprocessing,
`pageSegMode` or pass order changes the semantic digest; and that run metadata
does not affect semantic equality.

### 8. The import guard was direct-only while the bundle claim was transitive

The Stage 1 test inspects only the two runner source files. A runner could import
an apparently safe helper that itself imports fixtures or a truth-bearing module.
The test says honestly that it is not transitive — but nothing else closed the
gap, because the runtime bundle contract required only a path/hash manifest.

**Phase 1 trusted host preparation now owns a dependency-closure gate.** It must
generate a complete dependency closure or bundler metafile for every runtime input
module and fail if any transitive source input is under or derived from
`src/fixtures/**`, `tests/**`, `artifacts/**`, `src/domain/rules/**`, the eval
manifest, governed truth or a prior per-case report. Source maps may not carry
embedded `sourcesContent` from prohibited paths.

The bundle manifest must record every source input path and SHA-256, every emitted
runtime path and SHA-256, the exact build command, the build tool version, and the
digest of the dependency graph itself. Before isolation, the built bundle is
scanned for historical case IDs, historical fixture paths and prohibited
truth-bearing JSON keys — and explicitly **not** for legitimate Brand strings in
OCR or candidate evidence, which are evidence rather than leakage.

Halts: `BUNDLE_PROHIBITED_DEPENDENCY`, `BUNDLE_MANIFEST_INCOMPLETE`,
`BUNDLE_PROHIBITED_CONTENT`. Isolated discover verifies the resulting bundle
against its manifest but does not and cannot own the transitive proof.

### 9. The post-freeze actors were not named

`post-freeze-evaluation-plan.json` and `workflow-plan.md` now name the actor and
the location of every boundary transition:

| # | Actor | May read governed truth? | May commit? |
| --- | --- | --- | --- |
| 1 | the OCR workflow job (`contents: read`) | no | no |
| 2 | the owner-authorized post-run commit process | no | yes, at or below 100 MB |
| 3 | the separately authorized post-freeze evaluation | yes | no raw evidence |

Actor 1 ends after uploading and verifying the complete artifact at every size.
At or below 100 MB actor 2 — **not** the OCR process — downloads, verifies the
artifact and both raw manifests, commits the immutable raw evidence to PR #219,
and stops for review; only then may actor 3 be authorized, and actor 3 is the only
actor that ever receives the ID map or the governed truth. Above 100 MB, actor 1
stops before Git commitment and before post-freeze evaluation, and the durable
archival decision is required.

**The truth boundary sits between actor 2 and actor 3.**

## What did not change

The frozen 115-item population and its opaque identifiers; the incumbent
configuration pins including `field-selection.ts`
`8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c`; two exact
corpus runs with no retries and no selective rerun; the pre-freeze scan's
key-and-path scope; the direct `extractLabelEvidenceDetailed` route and the
`runCaseArtifacts` prohibition; full-object diagnostic parity; the prohibition on
modifying PR #195 or any production behaviour. **Nothing here relaxes a
completeness requirement**; item 6 removes two fields that were never obtainable
in the first place and replaces them with evidence that is.

## Limitations that remain genuinely unavailable

Unchanged and re-verified at base `546c3f27…`: no word baseline geometry; no
block, paragraph or line identifiers on `OcrWord`; no constituent word IDs on
`BrandLineDiagnostic`; and now, explicitly, no preprocessed-crop hash and no
per-pass warning/error array. No field is invented to fill these.

## Stage 1 contract-package aggregate

Recorded in `amendment-4-linkage.json` and in `stage-1-contract-manifest.sha256`.
