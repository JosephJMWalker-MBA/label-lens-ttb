# Preregistration amendment 5 — pre-discovery executable-contract closure

Refs Issue #149, PR #219. **Amended before any governed acquisition OCR, before
discovery, and before trusted host preparation.**

## Nothing has been run

No governed 115-case acquisition OCR, acquisition runner OCR, discovery or
execute-mode OCR has run, under any of the six plans. No `raw/` directory, no
raw-evidence manifest, no workflow file, no `workflow-mode.txt` and no
acquisition runner has ever existed on this branch. Trusted host preparation has
not been performed and no runtime bundle has been built.

The ordinary repository suite continues to run its **pre-existing bundled-image
OCR tests** — `src/fixtures/corpus-real-ocr.test.ts`,
`src/pipeline/extractor/extractor.test.ts` and the extractor integration tests.
Those are unmodified, pre-existing tests over bundled fixture images, and they are
not the governed corpus. This amendment discloses them rather than letting an
unqualified "no OCR has run" stand anywhere in the package.

## All earlier states are preserved

| State | Head | Base | Preregistration SHA-256 |
| --- | --- | --- | --- |
| **Original Stage 1** | `7600b0a9ba5ce6995274a517121f1eda18a30424` | `8f0c6a7ca7c271eed14d9084ed6da7fe11f897a9` | `7b691c78a9de008039ccc1a7f94824015373b1caec58f8235c78a03587c641fb` |
| **Amendment 1** | `26157cfe036fb8b1506431d1aa9309029ac2dcdb` | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | `cfc118c670a9c69f783f3ca58174113711b553baf1278da31a35e31121bf13ad` |
| **Amendment 2** | `ad1c296194e21e91af8333953ad47abe396495dc` | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | `9287ecc0d5d01bae83316c9d0dcb462d6eca566c925405cde83631fa65c89d35` |
| **Amendment 3** | `37e1a3ea752c12b230d468c10f604b8550d37ce1` | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | `3cf3d25fbb892dabc66e58796841c542fcc4eb79f7cd5d561271a7689ed87786` |
| **Amendment 4** | `cb574539d5e541446ec58d2b2bc62b9fda480048` | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | `87302e60a0629f6d657f4f118c8d73a50ea93aa3d321c15f77b5974ae75d28a3` |
| **Amendment 5** | this commit | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | see `preregistration.sha256` |

No earlier plan is deleted or reinterpreted. Amendments 1–4 stand. Amendment 5
closes five implementation-readiness gaps: each is narrower than the earlier
architectural problems, and each could have let the future runner violate a frozen
claim.

## What review found, and what changed

### 1. `stableCandidateId` accepted a partial record with a self-consistent digest

Amendment 4 made `finalizeCandidateRecord` validate the complete schema, but the
exported `stableCandidateId` never invoked that validator. It checked only that a
digest was present, lowercase 64-hex, and equal to a recomputation. A caller could
therefore do this:

```ts
const partial = { opaqueItemId: "item-0001", candidateOrdinal: 0 };
const supplied = { ...partial, canonicalRecordSha256: canonicalRecordSha256(partial) };
stableCandidateId(supplied); // Amendment 4: succeeded
```

The digest was genuinely self-consistent — computed over exactly that two-field
object — so the recomputation matched. **A self-consistent digest over incomplete
evidence is still incomplete evidence.** The Amendment 4 test only covered a
partial record *without* a digest, which is a different and easier case.

`stableCandidateId` now validates the complete candidate preimage schema before
it will accept any supplied digest, and the missing regression test is committed:
build the partial, hash it, attach the hash, assert `MISSING_REQUIRED_FIELD`.

**The schema is now closed rather than minimal.** Before finalization the own-key
set must *equal* `CANDIDATE_EVIDENCE_REQUIRED_KEYS`; after finalization it must
equal those keys plus `canonicalRecordSha256` and `stableCandidateId`. A missing
key and an unexpected key are equally fatal (`UNEXPECTED_FIELD`), so no
undeclared acquisition, truth, debug or convenience property can enter the
fingerprint silently.

**Values must be real incumbent values, not merely the right primitives.**
`passKind` an `OcrPassKind`; `assembly` a `BrandCandidateAssembly`;
`filterReason` a non-null `BrandLineReason`; `decision` null or a
`BrandCandidateDecision`; and `ocrConfidence`, `candidateProvenance`, `score` and
`ranking` validated against their complete frozen structures — exact key sets and
per-key predicates — rather than merely being non-array objects. The vocabularies
are copied as literals so the helper imports nothing, and
`issue-149-frozen-vocabulary.test.ts` imports the production constants and asserts
every copy is identical, so drift is a test failure rather than a silent
divergence.

**Seven cross-field invariants** are enforced, mirroring production's own
`assertBrandFilterDiagnosticInvariants` plus the acquisition's derived-field
rules: `filterChecks` holds exactly all ten rules, once each, in frozen order;
`activeRejectionReasons` equals the failed checks in ladder order; a rejected
candidate has at least one active reason whose first element is `filterReason`; a
kept candidate has no active reason, no failed check, and a `candidate-positive`
or `candidate-plausible` reason; `rankingEligible` equals `ranking !== null`;
`rankingScore` equals `ranking?.rankingScore ?? null`; `selected` equals
`decision === "selected"`.

### 2. The persisted `RegionOcrResult` had no exact schema

`assertRegionOcrResultRecord` now enforces exactly the thirteen production fields
as a **closed** key set, with complete nested shapes and real enum values —
`OcrPassKind`, `OcrPassTriggerReason`, `rotate ∈ {0,90,180,270}`, exact
`transform`, `transformedSize`, `fieldEligibility` and `timings` shapes.

**Run metadata on a pass record is rejected**, not silently hashed. Wall-clock
start and end, workflow run ID, artifact ID, artifact expiration and runner
identity live in a separate provenance record; on a pass they are an unexpected
key. Amendment 4's test kept metadata out by stripping it *by hand* before
calling the helper, which meant the helper itself enforced nothing.

**`originalGeometry` is persisted only when production emitted it, and absence is
OMISSION.** Amendment 4's raw contract said absent geometry was "recorded as null
rather than omitted". That is not an exact `RegionOcrResult`: a replay reading
`null` sees a present-but-empty property where production had no property at all,
and the inverse mapping producing nothing is precisely the signal that the token
was never mapped back to the original frame. A replay must preserve omission, or
decode it back to absence before selection. An explicit `null` halts with
`PASS_WORD_ORIGINAL_GEOMETRY_NULL`. A test proves omission survives serialization
and parsing.

### 3. Byte integrity and canonical digests were the same function

Amendment 4 exported `fullRecordIntegritySha256`, which canonicalized an object
and then hashed it — so it could not see whitespace, key order or a terminal
newline — while `determinism-rules.json` defined artifact integrity as SHA-256
over **file bytes**. The name promised something the implementation could not do.

That export is **removed**, not reinterpreted. Four clearly separated primitives:

- **`sha256Bytes(bytes)`** — SHA-256 over the exact bytes supplied. Raw manifests
  and their aggregate use this, so a changed byte always changes the value.
- **`canonicalRecordDigest(record)`** — a canonical object digest, documented as
  **not** a raw-file integrity proof.
- **`semanticPassFingerprint(pass)`** — validates the pass first, then removes
  exactly `timings`.
- **`semanticOrderedPassArrayFingerprint(passes)`** — validates each pass, then
  hashes the ordered array.

Tests prove that whitespace or a terminal newline changes byte integrity but not
the semantic fingerprint after parsing; that changing only `timings` changes byte
integrity but not semantic equality; that any other `RegionOcrResult` field does
change it; that run metadata on a pass is rejected rather than hashed; and that
pass order changes the ordered-array digest.

### 4. The global truth-ordering claim contradicted trusted staging

The package still said both raw manifests were frozen **before the ID map or any
governed truth file was opened at all**. That could never literally be true:
trusted staging has to read the evaluation manifest and the historical identities
to freeze the corpus, assign opaque ids and write the post-freeze map, and staging
happens *before* acquisition. The false claim is removed; the invariant that
actually holds is **who receives what**.

- **Phase 1, trusted staging** — may read the evaluation manifest, historical
  identities, historical fixture paths and the source images, *only* to freeze the
  population, assign identifiers, stage images, verify hashes and write the map.
  It is outside the acquisition process, runs no OCR, and supplies historical
  identity and truth to nothing: not the runtime bundle, not the truth-free
  manifest, not the environment, not any mounted data.
- **Phase 2, isolated acquisition** — receives no historical identifier, fixture
  path, ID map or governed truth. It scans its own inputs, mount set and emitted
  records for prohibited field names and unexpected files, and writes and seals
  each raw manifest inside the boundary. It **cannot** scan for historical case
  IDs or fixture paths: it does not hold that inventory, and handing it the
  inventory would be the leak the scan exists to prevent.
- **Phase 3, read-only identity-leak verification** — after both manifests are
  sealed, the evidence is exposed read-only and a separate verifier, which *may*
  read the historical inventory, scans the already-frozen bytes for historical IDs
  and fixture paths and re-verifies each manifest entry. It may not modify,
  rewrite, reformat, re-emit or replace any raw file, and performs no truth-based
  evaluation. Its report lives outside `raw/`. A hit halts with
  `TRUTH_ISOLATION_FAILURE`.
- **Phase 4, post-freeze evaluation** — the only phase that uses governed truth
  against the evidence.

### 5. Actor 2 was described as physically unable to reach the ID map

`post-freeze/id-map.json` is committed on PR #219 and covered by the Stage 1
package manifest. A process operating in an ordinary branch checkout to commit raw
evidence **can** read it. Amendment 4's claim that actor 2 "receives neither
governed truth nor the ID map" would only be true if actor 2 ran inside a
separately verified restricted environment, which it does not.

The overclaim is withdrawn and replaced with the control that actually holds:

- actor 2 takes the **verified workflow artifact** as its evidence input;
- it verifies the outer artifact digest and **both** raw manifests;
- it commits **exactly those immutable bytes**;
- it verifies that every committed file's SHA-256 equals its artifact manifest
  entry;
- it performs no transformation, filtering, regeneration, re-serialization,
  reordering or selective omission;
- **any changed byte fails verification**;
- truth and historical identity are not inputs to any decision it makes, because
  it makes no content-dependent decision at all — it commits the bytes it
  verified, or it fails;
- it stops after exact commitment and verification.

Actor 3 remains the only actor authorized to use the map and governed truth **for
evaluation**.

### 6. The bundle-content scan would have rejected its own scanner

Amendment 4 required scanning the built executable bundle for prohibited
truth-bearing JSON keys. But the runtime must **carry** that inventory in order to
scan its own emitted evidence, so a blanket string scan would have failed on the
truth-isolation scanner itself — the first module it looked at.

One strategy is chosen and frozen:

1. **Every** bundle file, executable or data, is scanned for historical case IDs
   and historical fixture paths. There is no legitimate reason for either.
2. **Data and configuration assets** are scanned for prohibited truth-bearing JSON
   keys. A data asset has no reason to name them.
3. **Executable code** may carry the inventory in exactly one place: the
   designated truth-isolation scanner module, whose path and SHA-256 are recorded
   in the bundle manifest.
4. The inventory inside that module must be **exactly** the frozen set. Widening
   it is a violation, and so is narrowing it — a dropped key means the runtime's
   own emitted-evidence scan is silently incomplete.
5. Governed Brand strings are **never** scanned. The scan takes no Brand inventory
   as a parameter at all, so this cannot regress by configuration.

Reference implementation in `scripts/eval/lib/issue-149-bundle-scan.ts`, with ten
synthetic non-OCR tests. Governed truth data, acceptable values and prior per-case
results remain prohibited from the bundle entirely, through the dependency-closure
gate, independently of this key scan.

### 7. Current metadata and OCR wording

`git-sha.txt` still labelled **amendment 2** as CURRENT while the package was at
Amendment 4, and the manifest faithfully hashed that stale statement. It now
carries one CURRENT block for Amendment 5 and explicit HISTORICAL blocks for
amendments 1–4 and the original Stage 1. It is **no longer exempt** from the
consistency sweep: exempting it wholesale is what let the staleness survive.

Unqualified statements — "No OCR has run", "No acquisition OCR has run" — are
replaced everywhere in current material with the precise claim quoted at the top
of this document, and a sweep test fails the build if an unqualified form
reappears.

## What did not change

The frozen 115-item population and its opaque identifiers; the incumbent
configuration pins including `field-selection.ts`
`8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c`; two exact
corpus runs with no retries and no selective rerun; the direct
`extractLabelEvidenceDetailed` route and the `runCaseArtifacts` prohibition;
full-object diagnostic parity; the four experiment-controlled mounts and the
phase split; the transitive dependency-closure gate; the prohibition on modifying
PR #195 or any production behaviour. **Nothing here relaxes a completeness
requirement.**

## Limitations that remain genuinely unavailable

Unchanged and re-verified at base `546c3f27…`: no word baseline geometry; no
block, paragraph or line identifiers on `OcrWord`; no constituent word IDs on
`BrandLineDiagnostic`; no preprocessed-crop hash; no per-pass warning/error array.
No field is invented to fill these.

## Stage 1 contract-package aggregate

Recorded in `amendment-5-linkage.json` and in `stage-1-contract-manifest.sha256`.
