# Preregistration amendment 3 — pre-acquisition

Refs Issue #149, PR #219. **Amended before any governed acquisition OCR.**

## No governed acquisition OCR occurred before Amendment 3

**Zero, under any of the four plans.** No `raw/` directory, no raw-evidence
manifest, no workflow file and no mode file has ever existed on this branch.
Discover mode has not been entered. Nothing in this amendment is informed by an
acquisition result, because there is no acquisition result.

## All earlier states are preserved

| State | Head | Base | Preregistration SHA-256 |
| --- | --- | --- | --- |
| **Original Stage 1** | `7600b0a9ba5ce6995274a517121f1eda18a30424` | `8f0c6a7ca7c271eed14d9084ed6da7fe11f897a9` | `7b691c78a9de008039ccc1a7f94824015373b1caec58f8235c78a03587c641fb` |
| **Amendment 1** | `26157cfe036fb8b1506431d1aa9309029ac2dcdb` | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | `cfc118c670a9c69f783f3ca58174113711b553baf1278da31a35e31121bf13ad` |
| **Amendment 2** | `ad1c296194e21e91af8333953ad47abe396495dc` | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | recorded in `amendment-2-linkage.json` |
| **Amendment 3** | this commit | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | see `preregistration.sha256` |

No earlier plan is deleted or reinterpreted. Amendment 2's own corrections stand;
this amendment fixes eight defects found in review of the Amendment 2 contracts
before execution.

## What review found, and what changed

### 1. The `ExtractionInput` identities were unsourced

Amendment 2 specified a direct `extractLabelEvidenceDetailed` call but described
its input in the abstract, and stated a `processedAt` value that existed nowhere
in the repository. **That value was invented.**

Every identity is now frozen from the incumbent evaluation path's own constants
in `src/fixtures/eval/eval-harness.ts` (lines 62–69), copied as literal values so
the acquisition imports nothing and infers nothing at run time:
`local-two-field-extractor` `1.0.0`; `{ kind: ocr, engineId: tesseract.js,
engineVersion: 7.0.0, modelId: eng }`; `wine-alcohol-parse` `1.0.0`;
`processedAt` `2026-07-12T00:00:00Z` (the harness's own `EVAL_PROCESSED_AT`, so
it cannot vary between the primary and repeat runs). `artifactRef` is the
`opaqueItemId`; `derivativeSha256` is the manifest's `sourceImageSha256`;
`sellerRegionTargets` and `diagnostics` are omitted rather than fabricated.

Frozen in `incumbent-configuration-freeze.json#extractionInputIdentities` and
bound in `acquisition-invocation-contract.json`. A Stage 1 test asserts each
value is non-blank, is quoted by the binding, and **actually occurs in
`eval-harness.ts`** — so "frozen from the incumbent" is checked, not asserted.

### 2. The future-runner import prohibition was rhetoric

Amendment 2 said the prohibition "binds any Stage 2 script the moment it is
added". Nothing enforced that. `issue-149-acquisition-isolation.test.ts` now
inspects both future runner paths —
`scripts/eval/issue-149-brand-evidence-acquisition-run.ts` and `.mjs`. When
neither exists that absence is asserted explicitly; when either exists, every
`from`, bare `import`, static `require(...)` and dynamic `import(...)` specifier
is resolved against path segments, so `@/fixtures/…`, `src/fixtures/…` and a
relative walk such as `../../src/fixtures/…` are all caught, as are
`domain/rules/**` and the symbols `runCaseArtifacts`, `runCase`, `loadCaseImage`,
`buildCaseReport`, `diagnosticsFor` and `EvalCase`. The detector is exercised
against synthetic prohibited and permitted sources, so "no runner exists yet"
can never be mistaken for "the guard works".

**This does not prove transitive runtime isolation** and does not claim to. It is
first-order source inspection. The runtime bundle manifest and the discover gate
remain responsible for what a process can actually reach.

### 3. The runtime boundary contradicted itself

Amendment 2 required tmpfs-only writable space **and** a read-write output mount.
Both could not be true. Writable space is now the read-write **output bind mount**
plus a named `tmpfs` for scratch, and nothing else.

"Exactly four mounts" was also not implementable — every container carries
required pseudo-filesystems. The invariant is now **four experiment-controlled
data mounts** plus an explicit allowlist of those unavoidable classes.

The design is stated as two phases: **phase 1 trusted host preparation** (the
freeze script stages images and writes the truth-free manifest, outside the
boundary) and **phase 2 the isolated discover run** (which sees only the staged
inputs). Phase 1 never runs inside the boundary; phase 2 never prepares its own
inputs.

### 4. A schema field was still literally named `caseId`

Amendment 2 banned only the phrase "per-pass caseId". The raw schema still
declared a key called `caseId`. It is now `opaqueItemId`, and the consistency
test **walks the JSON keys** of every current contract rather than grepping
prose. `historicalCaseId` remains legal in the post-freeze ID map, which is
precisely where the historical identity belongs.

### 5. `stableCandidateId` accepted unsafe partial records

The digest was optional and was computed from whatever object it was handed, so
`{ opaqueItemId, candidateOrdinal }` alone produced a plausible 64-hex id that
was never derived from any evidence.

It now fails closed: the digest is **required**, must be lowercase 64-hex, and is
**re-derived from the complete record** and compared before an id is returned —
`MISSING_OPAQUE_ITEM_ID`, `MISSING_CANDIDATE_ORDINAL`, `MISSING_DIGEST`,
`MALFORMED_DIGEST`, `DIGEST_DOES_NOT_MATCH_RECORD`. A new
`finalizeCandidateRecord` is the preferred entry point: it takes a complete
unfinalized record, computes the digest and attaches both derived fields, and
refuses to re-finalize. Tests cover partial records, malformed and truncated
digests, a well-formed digest borrowed from a different record, and that the id
carries the exact verified full digest.

### 6. Parity was a field allowlist

Amendment 2 made a 21-field comparison authoritative. It omitted
`brandDiagnostics.lines`, and any field added later would have escaped comparison
in silence. Parity is now **full-object canonical equality** between
`diagnosticSelection` and `debug.finalSelections.brand` once only `filterChecks`
and `activeRejectionReasons` are removed. Any difference at any depth halts with
`BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE`. The enumerated list survives only as
an explicitly non-authoritative illustration, and a Stage 2 synthetic parity test
is contracted.

### 7. The transport required a permission the workflow does not have

Amendment 2 said evidence at or below 100 MB would be committed by the workflow.
**A job with `permissions: contents: read` cannot commit.**

At every size the OCR job now uploads the complete lossless evidence as a
temporarily retained workflow artifact, records its ID, exact bytes, SHA-256,
retention and expected expiration, and **verifies the uploaded digest before any
job-local output is deleted**. At or below 100 MB it stops there and a separate,
owner-authorized post-run process — not the OCR process — downloads, re-verifies
and commits. Above 100 MB it stops before Git commitment, stops before
post-freeze truth evaluation, and requires the durable-archive decision. The OCR
workflow is never granted `contents: write`.

### 8. Capability 3 was overclaimed, for the wrong reason

Amendment 2 recorded capability 3 as SATISFIED because complete rejection reasons
are now available. That reasoning is wrong: rejection reasons say why a candidate
was rejected, not what the selector would have produced had a filter differed,
because the candidates themselves are built from the passes.

The acquisition therefore persists the **complete ordered `RegionOcrResult`
array** — all thirteen fields of every pass (`passId`, `regionName`, `passKind`,
`triggerReasons`, `preprocessing`, `fieldEligibility`, `transform`,
`transformedSize`, `pageSegMode`, `rawWordCount`, `discardedWordCount`,
`timings`, `words`), in emission order — per
`region-ocr-result-replay-contract.json`, halting on `PASS_EVIDENCE_TRUNCATED` or
`PASS_ORDER_MISMATCH`. Capability 3 is restated as **SATISFIABLE**: a separately
governed, zero-OCR treatment selector can later replay these passes with exactly
one filter changed. This sprint does not run that replay and authorizes no filter
change.

## What did not change

The population, the 115 opaque items, the incumbent configuration pins, the two
exact corpus runs, the truth boundary, the pre-freeze scan's key-and-path scope,
and the prohibition on modifying PR #195 or any production behaviour. Nothing in
this amendment relaxes a completeness requirement.

## Limitations that remain genuinely unavailable

Unchanged and re-verified at base `546c3f27…`: no word baseline geometry; no
block, paragraph or line identifiers on `OcrWord`; no constituent word IDs on
`BrandLineDiagnostic`. No field is invented to fill these.

## Stage 1 contract-package aggregate

Recorded in `amendment-3-linkage.json` and in
`stage-1-contract-manifest.sha256`.
