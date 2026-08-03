# Preregistration amendment 6 — runtime compatibility and truth-contract unification

Refs Issue #149, PR #219. **Amended before any governed acquisition OCR, before
discovery, and before trusted preparation.**

## Nothing has been run

No governed 115-case acquisition OCR, acquisition runner OCR, trusted preparation,
discovery or execute-mode OCR has run, under any of the seven plans. No `raw/`
directory, no raw-evidence manifest, no workflow file, no `workflow-mode.txt` and
no acquisition runner has ever existed on this branch. No runtime bundle has been
built.

The ordinary repository suite continues to run its **pre-existing bundled-image
OCR tests** — `src/fixtures/corpus-real-ocr.test.ts`,
`src/pipeline/extractor/extractor.test.ts`,
`src/pipeline/extractor/extractor-precheck.integration.test.ts` and
`src/fixtures/eval/eval-harness.integration.test.ts`. Those are unmodified,
pre-existing tests over bundled fixture images, and they are not the governed
corpus.

## All earlier states are preserved

| State | Head | Preregistration SHA-256 |
| --- | --- | --- |
| **Original Stage 1** | `7600b0a9ba5ce6995274a517121f1eda18a30424` | `7b691c78a9de008039ccc1a7f94824015373b1caec58f8235c78a03587c641fb` |
| **Amendment 1** | `26157cfe036fb8b1506431d1aa9309029ac2dcdb` | `cfc118c670a9c69f783f3ca58174113711b553baf1278da31a35e31121bf13ad` |
| **Amendment 2** | `ad1c296194e21e91af8333953ad47abe396495dc` | `9287ecc0d5d01bae83316c9d0dcb462d6eca566c925405cde83631fa65c89d35` |
| **Amendment 3** | `37e1a3ea752c12b230d468c10f604b8550d37ce1` | `3cf3d25fbb892dabc66e58796841c542fcc4eb79f7cd5d561271a7689ed87786` |
| **Amendment 4** | `cb574539d5e541446ec58d2b2bc62b9fda480048` | `87302e60a0629f6d657f4f118c8d73a50ea93aa3d321c15f77b5974ae75d28a3` |
| **Amendment 5** | `fca0755d629af2a15206d4cc5f5251768223e2f7` | `274e45779c849d4e6ada50e10b74d1fc8f6b1396f68b540ae02156e640422332` |
| **Amendment 6** | this commit | see `preregistration.sha256` |

Base `546c3f279ce431a1fd8c0203df7a83553ea866ef`. No earlier plan is deleted or
reinterpreted.

Amendment 5's own record retains its uncharacterized local test flake exactly as
reported: one full-suite run showed a single failure whose identity was not
captured before the output scrolled, and two subsequent local runs plus CI were
clean. **No cause is invented for it here.**

## Two of these were execution blockers

### 1. The closed candidate schema rejected every real production candidate

Production's `AnalyzerOcrConfidence` has **seven** fields. `ocrConfidenceOf`
(`field-selection.ts:39-55`) emits all seven, including a required
`missingTokenCount`. Amendment 5's closed schema declared **six** and therefore
rejected the real object as carrying an unexpected key.

Worse, the "production drift guard" restated the same six-key list by hand rather
than deriving it from production, so it agreed with the bug. CI stayed green while
the Stage 2 adapter would have failed on its first actual candidate. **A guard
that restates the thing it is guarding proves nothing.**

`missingTokenCount` is added to `ANALYZER_OCR_CONFIDENCE_KEYS`, the exact nested
validator, every synthetic record, `candidate-decision-contract.json`,
`candidate-fingerprint-contract.json` and the preregistration — and the validator
now enforces the arithmetic, not merely the shape:

- `missingTokenCount` is a non-negative integer;
- it equals the number of `null` entries in `rawTokenConfidences`;
- `rawMean`, `rawMin` and `rawMax` equal the values derived from the non-null
  entries;
- when no token confidence is present, all three aggregates are `null`.

**A non-OCR production-compatibility test now drives the real selector.** It
builds synthetic `RegionOcrResult` evidence, calls the real
`selectBrandObservationWithCompleteFilterDiagnostics`, takes the actual emitted
`BrandCandidateDiagnostic` objects, transforms them through **one reference
adapter**, and finalizes every resulting record. It covers a rejected candidate, a
kept and ranked candidate, the real `ocrConfidence` (including a case with missing
token confidences), the real `candidateProvenance`, the real `score` and `ranking`
structures, and all ten filter diagnostics.

The adapter is `scripts/eval/lib/issue-149-candidate-adapter.ts`, and **the Stage
2 runner is required to use it** rather than reimplementing the mapping. It also
checks the facts the diagnostic states twice: `confidence` equals
`ocrEvidenceScore`; top-level `passId`, `passKind` and `regionName` equal their
`candidateProvenance` copies; `supportPassIds` equals
`candidateProvenance.supportingPassIds`; and `candidateProvenance.recoveryPassUsed`
equals `passKind !== "full-image-primary"`.

The drift guard is rebuilt on **typed exemplars and real selector output** rather
than asserted lists: if a production field is added, removed or renamed, the
exemplar stops compiling, and the key set is read *off* the exemplar.

Two contract corrections came with it: `filterReason` is a non-null
`BrandLineReason`, not `string | null`; and **no explicit candidate `brandClass`
is persisted** — there is no such field, kept candidates carry the distinction as
`candidate-positive` versus `candidate-plausible`, and a rejected span returns
before a `Candidate` exists so production never calculates one. Every currently
possible validation halt code is now enumerated.

### 2. The dependency gate prohibited a required incumbent dependency

`field-selection.ts` imports `@/domain/rules/wine-alcohol-parse` on its **first
line**, and Amendment 5 rejected every transitive dependency under
`src/domain/rules/**`. Trusted preparation would have halted with
`BUNDLE_PROHIBITED_DEPENDENCY` while bundling the exact incumbent extractor it is
required to run.

One exception is frozen, by **path and content hash**:

| | |
| --- | --- |
| path | `src/domain/rules/wine-alcohol-parse.ts` |
| SHA-256 at base `546c3f27…` | `2ec1368cf3f4fcfab264d1507f98267aa6f6112091332d4dda5a76152ea816e7` |
| reason | mandatory deterministic incumbent Alcohol parser reached by the unchanged extractor path |
| transitive imports | none |

It is a bounded deterministic parser over label text, not an evaluation truth
module. **Every other module under `src/domain/rules/**` remains prohibited.** A
contract test proves `field-selection.ts` really imports that exact parser and no
other rules module, that the parser's current bytes match the frozen hash, that it
has no imports of its own, and that every other module in that directory is
outside the allowlist.

Separately, **every production runtime source input in the closure must match its
exact bytes at the frozen base commit**, or preparation halts with
`PRODUCTION_SOURCE_DRIFTED_FROM_BASE`. A bundle manifest that merely records
whatever production source happened to be present proves the bundle is internally
consistent, not that it is the *incumbent*. Stage 2 scripts under the explicitly
approved evaluation paths are not production sources; they are hashed and reviewed
separately and listed distinctly.

## The rest left the package internally inconsistent

### 3. Three different forbidden-key sets were in play

Ten keys in `evidence-schema.json`, seven in `truth-isolation-plan.json` and the
bundle scanner, five in `raw-ocr-contract.json` — so `brandPresent`,
`historicalCaseId` and `historicalImagePath` were absent from the executable
emitted-field scanner. Closed pass and candidate schemas cover two output shapes;
selection, failure, count, manifest and provenance records are separate shapes and
were governed by whichever list happened to apply.

**One ordered inventory now governs everything**, held in a canonical asset at
`runtime/truth-key-inventory.json`:

```
["isTruth","matchesTruth","truthInRawOcr","truthOnReconstructedLine",
 "truthFilterReasons","expectedBrand","acceptableValues","brandPresent",
 "historicalCaseId","historicalImagePath"]
```

A test asserts every operative contract and the executable path expose exactly
that array and the same asset digest.

The inventory governs **field NAMES** inside acquisition output. The historical
identifier and fixture-path **VALUES** are a separate matter, checked after
sealing by the read-only verifier. `evidence-schema.json` is restamped and its
truth-isolation assertion now distinguishes the in-boundary key/file scan from the
post-seal historical-value scan, instead of claiming historical IDs and paths are
scanned before each manifest.

### 4. The ID-map contract preserved a chronology Amendment 5 had rejected

Both `id-map-contract.json` and the committed map still said the mapping was
"readable only after" both manifests were written, while trusted staging reads,
generates and verifies it beforehand — and the map is committed on this branch,
where any checkout can read it. Unreadability was never the control.

Both records now state the accurate rules: trusted staging may read, generate and
verify it; it is outside the staged image directory and outside `raw/`; it is
never mounted into isolated discovery or execution; it is never imported by
acquisition code; it may not be used against acquired evidence until both
manifests are sealed and the read-only identity-leak verification is authorized;
and only actor 3 is **authorized to use** it for truth-based evaluation.

### 5. The workflow actor claims were broader than the process isolation

Phase 1 checks out the repository and reads the map and evaluation manifest, while
the actor contract still described "the OCR workflow job" as receiving neither,
and still claimed actor 3 was the only actor that may *open* the map.

The Stage 2 workflow is frozen as **separate jobs**:

- **Job A — trusted preparation, no OCR.** Checks out the repository, verifies the
  Stage 1 package, runs staging, may read historical identity and the evaluation
  manifest, builds the allowlisted bundle, and emits a **truth-free preparation
  artifact** containing only the runtime bundle, the bundle manifest, the
  truth-free input manifest, the staged opaque images and the empty-output
  specification. Job A is *trusted*, not truth-free; **the whole workflow is not
  called truth-free.**
- **Job B — isolated discover or execute.** No repository checkout, no repository
  workspace, only Job A's artifact, the four governed mounts, and no GitHub token
  or repository credential inside the container. Execute uploads one sealed
  evidence artifact and its externally recorded digest. Discovery still stops for
  review.
- **Job C — read-only identity-leak verifier.** Runs only after both manifests are
  sealed and the artifact exists; mounts the evidence read-only; receives a
  *minimal* historical case-ID and fixture-path inventory and **no** acceptable
  Brand values or truth labels; verifies the artifact digest and both manifests;
  scans frozen bytes; cannot modify or replace evidence; uploads a report outside
  `raw/` with its own SHA-256.

**A clean Job C report is a mandatory precondition for both actor 2 committing
evidence and actor 3 beginning post-freeze evaluation** — it was not listed as one
before. Above 100 MB Job C still runs.

### 6. The bundle scanner did not prove an exact inventory

Amendment 5 checked whether every frozen token appeared *somewhere* in the
scanner's source text and used a regex to notice some additions. That proves
neither direction: a dropped key left in a **comment** satisfied the presence
test, and an addition outside the regex's recognized prefixes —
`matchesExpectedResult`, for instance — widened the scanner undetected. The tests
covered `truthSelectedValue` but not those bypasses, and operated on textual files
only while the contract claimed every bundle file was scanned.

Source-text inference is replaced by a **dedicated canonical inventory asset**:

- frozen bundle path `runtime/truth-key-inventory.json`;
- a bare canonical JSON array of the authoritative keys, in order, and nothing
  else;
- exact byte SHA-256 recorded in the bundle manifest;
- the runtime emitted-evidence scanner **reads that asset**;
- executable code carries **no duplicate literal inventory**.

The host scan now reads the **raw bytes of every bundle file, including binary
assets**, for historical case IDs and fixture paths; parses the asset; requires
**exact array equality including order**; requires the asset's byte digest; permits
key strings only in that asset; and takes no Brand inventory parameter at all.
Tests prove a widened, narrowed and reordered inventory each fail; that a key
surviving only in a comment does not satisfy anything; that
`matchesExpectedResult` and friends fail; that the inventory duplicated into
another module or asset fails; that a historical identifier encoded inside a
**binary** byte array fails; and that legitimate Brand strings pass.

### 7. Stale current statements

- "No recognizer has been downloaded or executed" was **false** under the
  document's own disclosure. It is now acquisition-specific: no recognizer runs on
  the governed corpus, in the runner, in discovery or in execute mode, and the
  ordinary suite's pre-existing tests do execute the bundled recognizer.
- "Actor 3 is the only actor that ever receives the ID map" is replaced by the
  authorization rule.
- "Before truth is loaded" is replaced by a process-specific boundary: the
  isolated acquisition process never holds the map or governed truth at any point
  in its life, and sealing happens entirely inside it.
- `git-sha.txt` advances to Amendment 6 with Amendment 5 preserved as historical.
- A test asserts **every** current non-historical JSON artifact with an
  `amendedBy` field names `preregistration-amendment-6.md`.

## What did not change

The frozen 115-item population and its opaque identifiers; the incumbent
configuration pins including `field-selection.ts`
`8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c`; two exact
corpus runs with no retries and no selective rerun; the direct
`extractLabelEvidenceDetailed` route and the `runCaseArtifacts` prohibition;
full-object diagnostic parity; the four experiment-controlled mounts; the closed
`RegionOcrResult` schema and omitted-`originalGeometry` rule; exact-byte artifact
integrity versus semantic fingerprints; the prohibition on modifying PR #195 or
any production behaviour. **Nothing here relaxes a completeness requirement.**

## Limitations that remain genuinely unavailable

Unchanged and re-verified at base `546c3f27…`: no word baseline geometry; no
block, paragraph or line identifiers on `OcrWord`; no constituent word IDs on
`BrandLineDiagnostic`; no preprocessed-crop hash; no per-pass warning/error array;
no candidate `brandClass`. No field is invented to fill these.

## Stage 1 contract-package aggregate

Recorded in `amendment-6-linkage.json` and in `stage-1-contract-manifest.sha256`.
