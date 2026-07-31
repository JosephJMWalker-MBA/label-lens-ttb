# Preregistration amendment 7 — generator reproducibility, truthful preparation boundaries, exact ranking evidence

Refs Issue #149, PR #219. **Amended before any governed acquisition OCR, before
Job A trusted preparation, and before discovery.**

## Nothing has been run

No governed 115-case acquisition OCR, acquisition-runner OCR, trusted
preparation, discovery or execute-mode OCR has run, under any of the eight plans.
No `raw/` directory, no raw-evidence manifest, no workflow file, no
`workflow-mode.txt` and no acquisition runner has ever existed on this branch. No
runtime bundle has been built.

The ordinary repository suite continues to run its **pre-existing bundled-image
OCR tests** — `src/fixtures/corpus-real-ocr.test.ts`,
`src/pipeline/extractor/extractor.test.ts`,
`src/pipeline/extractor/extractor-precheck.integration.test.ts` and
`src/fixtures/eval/eval-harness.integration.test.ts`. Those are unmodified,
pre-existing tests over bundled fixture images, and they are not the governed
corpus.

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
| **Amendment 7** | this commit | see `preregistration.sha256` |

Base `546c3f279ce431a1fd8c0203df7a83553ea866ef`. No earlier plan is deleted or
reinterpreted.

## Three execution blockers

### 1. The freeze script no longer reproduced its own committed artifacts

Amendment 6 corrected the committed ID map but not its generator. The script still
emitted the superseded boundary — `readableOnlyAfter`, `mountedIntoAcquisition`,
`importedByAcquisitionHarness` — and none of the corrected discovery/execution
mount fields, trusted-staging permission, evaluation-use boundary or physical-access
correction.

Job A is preregistered to rerun that script and require bit-for-bit reproduction
of the committed map. As written, **Job A had to either fail or overwrite the
corrected map with stale metadata.**

The generator now emits exactly the boundary `id-map-contract.json` declares, and
the **obsolete keys are removed rather than kept as aliases**. The committed map is
aligned to the generator's exact output, including key order.

A reproducibility mode is added:

```bash
node scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs --check
```

It regenerates `truth-free-input-manifest.json`, `population-freeze.json` and
`post-freeze/id-map.json` into a temporary root under `.local/`, applies the same
final serialization and formatting as normal staging, compares the **exact bytes**
against the committed files, and halts with `STAGE_1_GENERATED_ARTIFACT_DRIFT`. It
touches no tracked artifact, never modifies the real staging directory, runs no
OCR, and removes its scratch directory afterwards.

**One implementation, two entry points.** Both `stage()` and `check()` call the
same `generate(out)`; only the output root differs. A test asserts there is a
single `writeJson` set and a single generator, so a check that passes cannot be
checking a different serializer from the one Job A will run.

**Result: all three artifacts reproduce byte-for-byte.** This is now a mandatory
Job A precondition, in `commands.sh` and in `workflow-plan.md`.

### 2. Job A physically reads and uses governed truth

The workflow honestly called Job A "trusted, not truth-free", but the actor table
still said Job A had no governed truth. The freeze script reads
`artifacts/issue-149-brand-current-baseline-failure-decomposition/per-case-attribution.json`
and accesses `c.governedTruth.present` to enforce the frozen 105/10 Brand-present
split — and acceptable Brand values and other governed truth live in the same case
objects.

That does not contaminate isolated acquisition. But "Job A receives no governed
truth" was false, and the claim is replaced with the accurate one:

- **Job A physically accesses a truth-bearing source** and uses the presence flag
  for corpus accounting;
- it may use only case identity and inclusion, source-image path/hash/byte size,
  `governedTruth.present` for the 105/10 assertion, and PR #218 membership;
- it must **not** use acceptable Brand values or any truth text for inclusion,
  opaque-ID assignment, image ordering, staged filenames, preprocessing, runtime
  bundle construction, or any acquisition input or emitted field;
- no governed truth enters the preparation artifact or Job B;
- only actor 3 uses governed truth against acquired evidence.

**The first physical access to a truth-bearing source occurs in trusted Job A.**
The boundary between actor 2 and actor 3 remains valid as an **evaluation-use**
boundary, not as the first physical access.

A staging-independence test mutates acceptable values and every other truth field
except `present` in an in-memory copy, holds identity, paths, hashes, inclusion and
presence fixed, and proves the truth-free input manifest, the opaque ordering and
the staged filenames are unchanged. It explicitly does **not** claim independence
from `governedTruth.present`, and asserts that the contract records that bound.

### 3. `rankedPosition` was not production-faithful

The Amendment 6 adapter took every diagnostic carrying a `ranking`, sorted by
`rankingScore` descending, and gave them all positions.

Production does something materially different (`field-selection.ts:2556-2578`):
it assigns ranking semantics to every scored candidate, reduces them through
`bestFamilyCandidates` and `dedupeBestCandidates`, sorts the survivors with
`compareCandidateRanking`, and assigns a `decision` **only to candidates in that
final ranked array**. The comparator is an ordered list that can prioritise score
eligibility, prominence, OCR evidence and normalized value under three ordering
modes.

Consequences of the old adapter: a deduplicated candidate received a fake ranked
position merely for having a ranking object; `prominence-first` candidates could be
ordered wrongly; equal-score ties could be broken differently from production; and
"position in the complete ranked list" was not what production produced.

The rule is now exact:

- **final ranked membership is the set of candidates whose `decision` is defined**;
- every ranked member must carry a `ranking`, or `RANKED_MEMBERSHIP_INCONSISTENT`;
- a candidate with `ranking` but no `decision` gets `rankedPosition: null`;
- a rejected candidate gets `rankedPosition: null`;
- members are sorted with **production's exported `compareCandidateRanking`**
  through a minimal `{ ranking }` wrapper — verified against the real function,
  which reads nothing but `.ranking` — **not by `rankingScore` alone**;
- the original diagnostic-array order is the stable tie order;
- positions are contiguous `0..N-1`;
- exactly one candidate is selected when N > 0, and it is position 0;
- nothing outside the membership receives a position.

The closed schema now carries the matching invariants: `decision === null` iff
`rankedPosition === null`; a decision requires a ranking; `selected` requires
position 0; position 0 requires `decision === "selected"`; a rejected candidate has
all three null. **Array-level invariants — uniqueness, contiguity, at-most-one and
exactly-one selected — live in `finalizeProductionCandidateArray`**, because a
single-record validator cannot prove them and pretending otherwise would be the
same class of overclaim this package has already had to correct twice.

Halts: `RANKED_MEMBERSHIP_INCONSISTENT`, `RANKED_POSITION_PARITY_FAILURE`.

## Real-selector probes

The single-ranked-member probe was not sufficient to validate `rankedPosition`.
Added, all non-OCR and driving the real selector:

- **Duplicate across two passes.** The same Brand read from a primary and a
  rotated pass: production keeps both diagnostics, scores both — so both carry
  `ranking` — and assigns a `decision` to only one. The eliminated duplicate gets
  `rankedPosition: null` and keeps its ranking evidence.
- **Two distinct ranked candidates.** `RED BRICK WINERY` and `SILVER OAK CELLARS`
  in one pass produce a two-member ranked list whose order differs from the
  diagnostic-array order. Positions are contiguous, the selected candidate is at 0,
  and the order matches production's comparator applied to the same members.
- **Comparator versus score-only.** A controlled synthetic ranking array with equal
  `rankingScore` and a deciding later comparator entry: score-only sorting returns
  zero for every pair, while the production comparator orders them.
- **Comparator tie.** Identical comparator entries preserve the original
  diagnostic-array order.
- **Parity halts.** A decision without ranking, and two selected candidates, each
  halt with the preregistered code.

## Support provenance is stated at the level actually exposed

Production merges support-pass information during deduplication
(`dedupeBestCandidates` → `mergeCandidateSupport`, `field-selection.ts:466`,
`2175-2195`), *after* the public diagnostics are constructed, and never writes the
merged value back — only `score`, `ranking` and `decision` are written back.

Frozen accordingly:

- candidate-record `supportPassIds` and `candidateProvenance` are the **public
  pre-merge** values;
- the final selection's `supportingPassIds` is persisted **separately** from
  `FieldSelection`, where the post-merge value is exposed for the selected
  observation;
- alternate provenance is persisted wherever `FieldSelection` exposes it;
- **complete post-deduplication merged support for every final ranked candidate is
  unavailable** through the current public diagnostics.

It is recorded as a genuine remaining limitation and is **not reconstructed in the
adapter** — that would be a second implementation of deduplication presented as
production's output. No production change is made to expose it.

## The forbidden-key asset is now the actual single source

Amendment 6 declared the canonical asset authoritative and then copied the ten-key
array into four contracts, while the consistency test kept a fifth copy and the
freeze script maintained a separate hard-coded substring list. Cross-file equality
tests reduce drift; they are not the declared single-source design.

Operative contracts now carry only the **authoritative asset path, the bundle
path, the exact byte SHA-256, the canonical formatting rule, the key count, and
the statement that the runtime reads the asset**. A test asserts each contract
references the same path and hash *and that none of them restates a key* — and
that neither the freeze script nor the bundle scanner contains a literal key
either.

The freeze script's truth-free-output scan reads the canonical asset. Two
staging-specific opacity keys (`caseId`, `imagePath`) remain a separate, explicitly
labelled staging check, and exact historical-value checks remain separate as
before. The bundle scanner still receives no Brand-value inventory.

## What did not change

The frozen 115-item population and its opaque identifiers; the incumbent
configuration pins; the frozen `wine-alcohol-parse` exception and the
production-source base-drift gate; two exact corpus runs with no retries and no
selective rerun; the direct `extractLabelEvidenceDetailed` route; full-object
diagnostic parity; the four experiment-controlled mounts; the closed
`RegionOcrResult` schema; exact-byte integrity versus semantic fingerprints; the
prohibition on modifying PR #195 or any production behaviour. **Nothing here
relaxes a completeness requirement.**

## Limitations that remain genuinely unavailable

Unchanged and re-verified at base `546c3f27…`: no word baseline geometry; no
block, paragraph or line identifiers on `OcrWord`; no constituent word IDs on
`BrandLineDiagnostic`; no preprocessed-crop hash; no per-pass warning/error array;
no candidate `brandClass`; and now, explicitly, no post-deduplication merged
support for non-selected ranked candidates. No field is invented to fill these.

## Stage 1 contract-package aggregate

Recorded in `amendment-7-linkage.json` and in `stage-1-contract-manifest.sha256`.
