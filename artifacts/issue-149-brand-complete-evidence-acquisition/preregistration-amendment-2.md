# Preregistration amendment 2 — pre-acquisition

Refs Issue #149, PR #219. **Amended before any governed acquisition OCR.**

## Both earlier states are preserved

| State | Head | Base | Preregistration SHA-256 |
| --- | --- | --- | --- |
| **Original Stage 1** | `7600b0a9ba5ce6995274a517121f1eda18a30424` | `8f0c6a7ca7c271eed14d9084ed6da7fe11f897a9` | `7b691c78a9de008039ccc1a7f94824015373b1caec58f8235c78a03587c641fb` |
| **Amendment 1** | `26157cfe036fb8b1506431d1aa9309029ac2dcdb` | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | `cfc118c670a9c69f783f3ca58174113711b553baf1278da31a35e31121bf13ad` |
| **Amendment 2** | this commit | `546c3f279ce431a1fd8c0203df7a83553ea866ef` | see `preregistration.sha256` |

Neither earlier plan is deleted or reinterpreted. `preregistration-amendment.md`
keeps its own account of what Amendment 1 changed and why; this document does not
rewrite it. Amendment 1's corrections stand — opaque identity, the separated ID
map, the corrected pre-freeze scan and the resolved first-reason limitation were
all right, and Amendment 2 builds on them rather than replacing them.

## No governed acquisition OCR occurred before Amendment 2

**Zero, under any of the three plans.** No `raw/` directory, no raw-evidence
manifest and no execution workflow has ever existed on this branch. Nothing in
this amendment is informed by an acquisition result, because there is no
acquisition result.

## What review found, and what changed

### 1. `runCaseArtifacts` was never a truth-free route

Both earlier plans routed acquisition through `runCaseArtifacts`. That was wrong.
It accepts an `EvalCase`, uses `evalCase.caseId` as `artifactRef`, loads the
evaluation fixture, and **always** constructs a truth-bearing `CaseReport` from
Brand and Alcohol acceptable values and classifications. Ignoring the report
afterwards does not undo reading the truth or stamping the historical case id
onto the artifact reference.

The route is now a **direct `extractLabelEvidenceDetailed` call**, with
`artifactRef` set to the opaque item id, `derivativeSha256` from the truth-free
manifest, frozen adapter/engine/parser identities, a fixed preregistered
`processedAt`, and no `sellerRegionTargets`. `runCaseArtifacts`, `runCase`,
`loadCaseImage`, `buildCaseReport`, `diagnosticsFor`, every `src/fixtures/eval`
module and every truth, metrics, classification or diagnostic-attribution module
are prohibited on that route, and the prohibition binds any Stage 2 script the
moment it is added. See `acquisition-invocation-contract.json`.

### 2. Complete diagnostics are not where Amendment 1 said they were

Amendment 1 claimed they live in
`ExtractionDebug.finalSelections.brand.brandDiagnostics.candidates`. **They do
not.** `extractLabelEvidenceDetailed` calls the ordinary
`selectBrandObservation`, so `debug.finalSelections` carries the *default* shape
with neither `filterChecks` nor `activeRejectionReasons`.

They are now obtained by a second, **exact-pass-set** call that mirrors
production's own branch:

```ts
const brandPasses =
  debug.primarySelections.brand.observation.state === "OBSERVED"
    ? [debug.passes[0]]
    : debug.passes;
const diagnosticSelection = selectBrandObservationWithCompleteFilterDiagnostics(brandPasses);
```

Calling the diagnostic selector over all passes unconditionally is prohibited:
production retains the primary selection when primary Brand is `OBSERVED`, so an
unconditional call would produce a different candidate population on every such
case.

Before any evidence is emitted, `diagnosticSelection` must be behaviourally
identical to `debug.finalSelections.brand` once **only** `filterChecks` and
`activeRejectionReasons` are removed, across all twenty-one compared fields.
Mismatch halts with **`BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE`**.
`debug.finalSelections.brand` remains the authority; the diagnostic array is the
evidence source only because parity proves the two are otherwise the same.

### 3. Stale contract language swept

Every current contract now states the correct base, route, diagnostics source,
opaque identity and resolved limitation. Old language survives **only** inside
records explicitly marked historical. A sweep test fails the build if a current,
non-historical contract mentions `runCaseArtifacts`, the old debug path, the old
base, `raw/<run>/<caseId>`, single-reason language or "capability 3 partially
satisfied" outside a prohibition or historical marker.

### 4. The isolation claim was overstated

The Stage 1 tests are **static manifest, path and import validation**. They read
committed planning artifacts. **They are not runtime proof**, and they cannot
demonstrate that a future process is unable to read the repository checkout.

`acquisition-runtime-isolation-contract.json` freezes the real requirement: no
repository checkout, `.git`, `artifacts/`, fixtures, eval manifest, ID map,
truth, prior reports, credentials or environment inheritance; network disabled;
read-only root; all capabilities dropped; `no-new-privileges`; tmpfs-only
writable space; exactly four mounts; an allowlisted runtime bundle with a
per-path SHA-256 manifest and **no unrestricted repository `COPY`**. Discover mode
must run inside that same boundary, enumerate what it can reach, prove what it
cannot, and **stop for review** before execute is authorized. **Not implemented
here — contract only.**

### 5. The candidate fingerprint is now non-circular and exactly specified

Preimage = the complete persisted record minus exactly `canonicalRecordSha256`
and `stableCandidateId`. Canonicalization `issue-149-candidate-canonical-v1`:
keys recursively sorted, array order preserved, `JSON.stringify` semantics for
strings and finite numbers, undefined object properties omitted, undefined array
values and non-finite numbers **rejected**, no separator whitespace, UTF-8 bytes,
lowercase 64-hex digest. Reference implementation and eleven tests are committed.

### 6. The whole contract package is hashed, not just the preregistration

`stage-1-contract-manifest.sha256` covers every governed artifact in sorted path
order — including the committed post-freeze ID map — plus the freeze script, the
manifest script and every Stage 1 contract test, with an aggregate over the
sorted lines. A test proves coverage, uniqueness, hash validity and that the
manifest cannot stay valid after a contract changes.

### 7. The 100 MB fallback was overstated

A workflow artifact is **retention-bound, not permanent preservation**. Above
100 MB the run completes and uploads the complete lossless evidence as a
*temporarily retained workflow artifact*, records its ID, exact bytes, SHA-256,
configured retention and expected expiration, does not delete local job output
until the upload and digest verify, stops before committing to Git, **stops
before post-freeze truth evaluation**, and requires an explicit owner decision on
durable archival before continuing.

## Stage 1 contract-package aggregate

Recorded in `amendment-2-linkage.json` and in
`stage-1-contract-manifest.sha256`.

## Limitations that remain genuinely unavailable

Re-verified against the real types at base `546c3f27…`: no word baseline
geometry; no block, paragraph or line identifiers on `OcrWord`; no constituent
word IDs on `BrandLineDiagnostic`. No field is invented to fill these.
