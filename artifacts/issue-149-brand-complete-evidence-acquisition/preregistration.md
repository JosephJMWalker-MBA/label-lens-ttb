# Preregistration — complete current-baseline Brand evidence acquisition

Refs Issue #149. **Evidence acquisition only.** Frozen before any OCR runs.

Base: `origin/main` `546c3f279ce431a1fd8c0203df7a83553ea866ef`, the merge commit
of PR #220.

**Amended twice, both times before any acquisition OCR.** See
`preregistration-amendment.md` and `preregistration-amendment-2.md`. Both earlier
plans are preserved, not overwritten, and their identities are recorded in
`amendment-linkage.json` and `amendment-2-linkage.json`. **No governed
acquisition OCR occurred under either earlier plan.**

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

The acquisition harness is authorized to call exactly one non-default entry
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

Before any evidence is emitted, `diagnosticSelection` must be behaviourally
identical to `debug.finalSelections.brand` once **only** `filterChecks` and
`activeRejectionReasons` are removed, across observation state, value,
confidence, OCR evidence score, alternates, source region, source, supporting
pass IDs, recovery-pass flag, abstention reason, candidate-array length and
order, and per candidate `rawText`, `cleanedValue`, `kept`, `filterReason`,
`decision`, `score`, `ranking`, provenance, `assembly` and `lineIndexes`. A
mismatch halts with **`BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE`**.

**`debug.finalSelections.brand` remains the authority**; the diagnostic selection
is the candidate evidence source only because parity proves the two are otherwise
the same array. No extra OCR pass runs: the second call is a pure re-selection
over results already produced.

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

**The pre-freeze scan looks for keys, files and identifiers — not Brand
strings.** It scans for prohibited JSON keys, unexpected mounted files,
historical case IDs, historical fixture paths, governed truth files,
acceptable-value files, prior per-case evaluation artifacts and the ID map. It
does **not** compare OCR transcripts or candidate values against governed Brand
strings, because a legitimate transcript may naturally contain the Brand text —
that is evidence, not leakage, and checking it would require opening a truth file
before the truth boundary. Truth-string inventory and comparison belong to
post-freeze evaluation only.

Both runs complete and both raw-evidence manifests are written and hashed
**before the ID map or any governed truth file is opened**. A hit halts with
`TRUTH_ISOLATION_FAILURE`.

## Complete raw OCR evidence

Per case and per pass, without sampling or truncation: case ID; pass ID, kind and
role; source image SHA-256; crop pixel SHA-256; crop geometry; transform and
orientation; engine configuration; **every raw OCR word** in original order with
exact text, confidence and bounding box, plus original geometry where the pass
mapped it; warnings; errors; pass latency; pass output fingerprint.

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

**The harness does not recompute any predicate.** It consumes what PR #220
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
`src/fixtures/eval/issue-149-candidate-canonical.ts`.

Asserted: ordinals begin at 0, are contiguous and occur exactly once; candidate
IDs are unique within each case; the emitted count equals the unprojected
diagnostic-array count; no record is silently overwritten or deduplicated.
Halts with `CANDIDATE_ID_COLLISION` or `CANDIDATE_EVIDENCE_TRUNCATED`.

### Evidence volume

Complete and uncapped. Expected 15–40 MB for both runs. A repository-footprint
gate applies: at or below 100 MB commit per the governed plan; above 100 MB
complete the run, upload the complete lossless evidence as a **temporarily
retained workflow artifact** — recording its ID, exact bytes, SHA-256, configured
retention and expected expiration — stop before committing raw evidence to Git,
**stop before post-freeze truth evaluation**, and require an explicit owner
decision about durable archival before continuing. Local job output is not
deleted before the upload and its digest verify. A workflow artifact is
retention-bound; it is never described as permanent preservation unless a durable
destination has actually been verified. **It is a Git storage gate, never an evidence-completeness exception** —
nothing is truncated, sampled, discarded, recompressed destructively or omitted.

## Raw evidence freeze

Before truth is loaded: write a primary manifest, write a repeat manifest, hash
every OCR, line and candidate record, write an aggregate manifest SHA-256, record
the exact commit and workflow run, and assert no truth-bearing field is present.

`raw/` becomes **immutable**. Nothing under it is pretty-printed or rewritten
after freezing; JSONL is emitted in final form and added to `.prettierignore`
before hashing.

## Repeat comparison and acquisition verdict

Primary and repeat are compared at image and crop hashes, OCR words and geometry,
reconstructed lines, candidate-decision arrays, ranking order, selected value,
authority state and fingerprints. **Every difference is reported. No case is
rerun or repaired.** Under nondeterminism both runs are preserved and neither is
canonical.

Exactly one verdict, computed from gates rather than asserted:
`COMPLETE_DETERMINISTIC_EVIDENCE`, `COMPLETE_WITH_NONDETERMINISM`,
`INCOMPLETE_EVIDENCE`, `TRUTH_ISOLATION_FAILURE` or `RUNTIME_FAILURE`.

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

No acquisition OCR has run and no execution workflow exists. No recognizer has
been downloaded or executed. No production code, OCR configuration, traineddata,
preprocessing, crop planning, recovery trigger, Brand reconstruction, filter,
ranking, selection, authority, truth, normalization, threshold, alias or state
semantic has been changed by this PR. No filter
relaxation has been implemented or simulated. No successor treatment has been
chosen. No corpus case has been expanded, substituted or excluded. PR #195 is
untouched, and PRs #214, #216, #217 and #218 are not reinterpreted.
