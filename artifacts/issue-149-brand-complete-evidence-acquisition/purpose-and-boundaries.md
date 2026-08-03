# Purpose and boundaries

Stage 1, **amended** at base `546c3f279ce431a1fd8c0203df7a83553ea866ef`
(PR #220 merge). Contract generation and trusted freeze/staging. The Stage 1 trusted freeze/staging generator and its temporary reproducibility
mode have run. **No Stage 2 Job A workflow, truth-free preparation artifact,
runtime-bundle build, discovery, execute mode or governed 115-case acquisition
OCR has run.** The ordinary repository suite continues to run its pre-existing
bundled-image OCR tests, disclosed separately., under either the original or the amended plan. See
`preregistration-amendment.md`.

## What this sprint is for

Every Issue #149 Brand study since PR #217 has been limited by the same thing:
the committed evidence is a *truncated projection* of what the pipeline actually
produced. Specifically —

| Cap | Where | Consequence |
| --- | --- | --- |
| `sampleWords` first 25 per region | `eval-harness.ts:304` | `truthInRawOcr` cannot be re-derived; PR #217 had to carry it forward |
| `MAX_BRAND_LINES = 12` | `eval-harness.ts:72` | five PR #218 cases could not be verified either way |
| `filter(kept && ranking).slice(0, 6)` | `eval-harness.ts:415` | no rejected candidate is committed at all, so PR #218 returned `INSUFFICIENT_COST_EVIDENCE` |
| `MAX_TEXT_LEN = 120` | `eval-harness.ts:75` | candidate and line text is silently elided |

This sprint acquires the untruncated snapshot so later zero-OCR studies can do
what none of them could: rederive `truthInRawOcr`, separate the three
construction substages on measured evidence, run one-filter counterfactuals over
**all** candidates rather than the truth-bearing ones, and measure displacement
and Brand-absent exposure rather than upside alone.

**This sprint performs none of those counterfactuals.**

## The one thing that makes this feasible without a production change

The caps above are all in the **evaluation harness's `CaseReport` projection**,
and the production path already emits the complete evidence.

**The acquisition does not touch the harness.** It calls
`extractLabelEvidenceDetailed` directly and reads the untruncated `debug` object.
`runCaseArtifacts` and every `src/fixtures/eval` module are prohibited on the
acquisition route: `runCaseArtifacts` takes an `EvalCase`, uses the historical
`caseId` as `artifactRef` and always builds a truth-bearing `CaseReport`, so
discarding that report afterwards would not make the call truth-free.

Complete filter diagnostics are obtained by a second, exact-pass-set call to
`selectBrandObservationWithCompleteFilterDiagnostics`, checked for parity against
`debug.finalSelections.brand`. See `acquisition-invocation-contract.json` and
`brand-diagnostic-parity-contract.json`.

**No production code, no harness code and no cap constant is modified.** The prohibited projection is bypassed, not raised.

## Boundaries

**Authorized:** rerun the existing incumbent OCR pipeline, unchanged, over the
exact fixed 115-case corpus, twice.

**Not authorized, and not done:** changing production OCR behaviour; using
PARSeq, PP-OCRv6 or any other recognizer; changing OCR configuration,
traineddata, preprocessing, crop planning, recovery triggers or transformations;
changing Brand reconstruction, filtering, ranking, selection or authority;
changing truth, normalization, thresholds, aliases or state semantics;
implementing or simulating any filter relaxation; choosing a successor treatment;
expanding, substituting or excluding corpus cases. PR #195 untouched; PRs #214,
#216, #217 and #218 not reinterpreted.

## What the acquisition will and will not be able to record

Two requirements in the brief are **not satisfiable** without a production
change, and one is satisfiable only by a later replay. All three are stated here,
before acquisition, rather than discovered afterwards:

**1. "Every individual filter check" and "every active rejection reason" —
AVAILABLE since merged PR #220.** They are obtained through an evaluation-only,
default-off entry point that changes no selection behaviour. The old finding —
that the ladder short-circuits, that only the first rule is observable, and that
the predicates are module-local and unexported — is preserved only in the
historical amendment records, because none of it is true at this base.

What remains true, and is a *different* constraint from the one originally
recorded: a one-filter counterfactual is not answered by rejection reasons alone,
because candidates are constructed from the passes. It becomes reachable through
replay of the persisted complete ordered `RegionOcrResult` array, and that replay
is not performed here.

**2. Word baseline geometry and block/paragraph/line identifiers — not
available.** `OcrWord` carries `text`, `rawConfidence`, `bbox` and an optional
`originalGeometry`. Nothing else. The brief says "where available"; they are not.

**3. Constituent word IDs per reconstructed line — not available.**
`BrandLineDiagnostic` records assembled text and pass provenance, not word
membership. Candidate-to-line membership *is* recoverable via `lineIndexes`;
word-to-line membership is not.

## Also worth recording now

PR #218's "reason combinations" describe **per-case sets of reasons across
several distinct candidate objects**, not several reasons on one candidate. That
was a possibility PR #218 noted; reading the filter ladder confirms it. This is a
clarification of what the existing numbers mean, not a reinterpretation of them —
the counts stand exactly as published.

Production also caps candidate *generation*: `MAX_BRAND_WORDS = 4` and
`MAX_MULTI_LINE_SEEDS_PER_LINE = 3`. Windows longer than four words are never
formed, so acquisition cannot enumerate a candidate production never built.
Whole-line candidates longer than four words *are* formed and rejected with
`too-many-words`, so those do appear.

## What the acquisition boundary owns

It owns the whole path from input to bytes: the input snapshot, the single
extractor call, the pass-set reconstruction, the diagnostic selection, the parity
assertion, the candidate finalization **and the serialization**. What the runner
receives is a sealed, frozen list of file descriptors with exact byte lengths and
digests.

That is deliberate, and it is the fifth iteration of one correction. Each earlier
boundary closed the route it named and left the adjacent one open: a bare
candidate array became a caller-supplied `FieldSelection`, which became a
caller-supplied `ExtractionDebug`, which became a caller-owned mutable
`ExtractionInput`, which became caller-owned mutable **output**. A projection of
the output needs no mutation at all, so prohibiting mutation was never going to
be enough. The alternative is deleted rather than prohibited by convention.

## What has and has not executed

The runtime bundle **executed in discover mode**, inside the isolated boundary,
and produced the boundary report. The acquisition API, the extractor, the OCR
engine, the item writer and the run-level writer have **not** executed, and no
`raw/` evidence exists. Execute is gated on an explicit authorization artifact
that currently reads `EXECUTE_NOT_AUTHORIZED`.

Saying "no bundle was executed" would be false, and was said once; the distinction
that matters is between running the bundle and running the acquisition path.

