# Preregistration — complete current-baseline Brand evidence acquisition

Refs Issue #149. **Evidence acquisition only.** Frozen before any OCR runs.

Base: `origin/main` `8f0c6a7ca7c271eed14d9084ed6da7fe11f897a9`, the merge commit
of PR #218.

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

The acquisition input is a **truth-free manifest** carrying only `caseId`,
`imagePath`, `sourceImageSha256` and `sourceImageByteSize`. It is scanned for
truth-bearing substrings before it is written.

Execution halts on an unexpected case count, a missing or additional case, an
image hash or byte-size mismatch, a changed engine, traineddata, transform or
production configuration, or any truth-bearing field in the acquisition input.

No case is expanded, substituted or excluded.

## Exact incumbent path

| Element | Frozen value |
| --- | --- |
| tesseract.js / tesseract.js-core | 7.0.0 / 7.0.0 |
| `eng.traineddata` | `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`, 5,199,098 B |
| OEM | 1 (LSTM only) |
| Page segmentation | SPARSE_TEXT (11) on every Brand-eligible template |
| Pass planning | `planPrimaryOcrPass` + `planRecoveryOcrPasses`, unchanged triggers |
| Crop, transform, line reconstruction, candidate construction, filters, ranking, selection, authority | unchanged |

No experimental flag is enabled.
`selectBrandObservationWithCoherentLineMergeTreatment` is **not** called;
`DEFAULT_BRAND_SELECTION_OPTIONS.allowCoherentPlausibleLineMerge` stays `false`.

## How completeness is achieved without changing anything

Every truncation that limited the prior studies lives in the **evaluation
harness's `CaseReport` projection** — the 25-word `sampleWords` cap, the 12-line
cap, the 120-character text truncation, and
`filter(kept && ranking).slice(0, 6)`. The production path already produces the
complete evidence, and `runCaseArtifacts` already returns it untruncated as
`extractionDebug`.

The acquisition therefore reads `extractionDebug` directly. **The prohibited
projection is bypassed, not raised, and no cap constant, harness file or
production file is modified.**

## Two exact corpus runs

One **primary** run over all 115 cases and one exact **repeat** over all 115.
No retries, no configuration change between runs, no selective rerun after a
discrepancy. The repeat determines whether the package is stable; it is **not** a
second sample from which the more favourable output may be chosen. Runtime,
environment, package and host provenance are recorded for both.

## Truth isolation

The acquisition process receives no governed Brand truth, no acceptable values,
no truth-match booleans, no expected classifications, no PR #217 or PR #218
per-case results and no filter-relaxation expectations. It emits no `isTruth`,
`matchesTruth`, `truthInRawOcr`, `truthFilterReasons` or `expectedBrand` field.

Both runs complete and both raw-evidence manifests are written and hashed
**before any governed truth file is opened**. A banned field name appearing as a
key halts with `TRUTH_ISOLATION_FAILURE`.

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

**Not available, recorded as absent with the reason:** word baseline geometry;
block, paragraph and line identifiers; constituent word IDs per line.

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

### The blocker, stated before acquisition

**"Every individual filter check" and "every active rejection reason" cannot be
recorded.** The filter is a short-circuit `if`-chain returning on the first
failing rule, in the order `producer-line`, `no-letters-or-too-short`,
`non-brand-keyword`, `too-many-words`, `domain-like`, `varietal-or-designation`,
`generic-product-language`, `location-or-appellation`,
`low-information-fragment`, `sentence-fragment`. Production records exactly one
reason per candidate; the later checks are never evaluated and their results do
not exist. Emitting an array would require a production change, and the
predicates are unexported so they cannot be re-evaluated offline.

Consequence, recorded now rather than discovered later: **a one-filter
counterfactual built on this evidence remains an upper bound**, because removing
a candidate's recorded reason does not reveal whether a later rule would then
reject it.

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

No OCR has run. No recognizer has been downloaded or executed. No production
code, OCR configuration, traineddata, preprocessing, crop planning, recovery
trigger, Brand reconstruction, filter, ranking, selection, authority, truth,
normalization, threshold, alias or state semantic has been changed. No filter
relaxation has been implemented or simulated. No successor treatment has been
chosen. No corpus case has been expanded, substituted or excluded. PR #195 is
untouched, and PRs #214, #216, #217 and #218 are not reinterpreted.
