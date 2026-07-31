# Purpose and boundaries

Stage 1, **amended** at base `546c3f279ce431a1fd8c0203df7a83553ea866ef`
(PR #220 merge). Planning and preregistration only. **No acquisition OCR has
run**, under either the original or the amended plan. See
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

The caps above are all in the **evaluation harness's `CaseReport` projection**.
The production path already emits the complete evidence, and
`runCaseArtifacts` already returns it untruncated as `extractionDebug`
(`eval-harness.ts:959`, added before this sprint).

So the acquisition reads `extractionDebug` directly instead of the capped
`CaseReport`. **No production code, no harness code and no cap constant is
modified.** The prohibited projection is bypassed, not raised.

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

Three requirements in the brief are **not satisfiable** without a production
change. They are stated here, before acquisition, rather than discovered
afterwards:

**1. "Every individual filter check" and "every active rejection reason" —
RESOLVED by merged PR #220.** The text below records the original finding; the
capability now exists behind an evaluation-only, default-off entry point. Kept
for provenance, superseded in practice.

**Original finding, no longer current:** The Brand filter is a short-circuit `if`-chain
(`field-selection.ts:1649-1917`) that returns on the first failing rule.
Production records exactly one `filterReason` per candidate. The checks after it
are never evaluated, so their results do not exist. Emitting a reason *array*
would require changing production code.

This has a direct downstream consequence worth stating plainly: **even with
complete candidate persistence, a one-rule counterfactual remains an upper
bound.** Removing the recorded reason does not reveal whether the candidate would
then fail a later rule. A candidate rejected at `producer-line` (rule 1) may or
may not also be `too-many-words` (rule 4).

The predicates are module-local and unexported, so the missing checks cannot be
recomputed offline either.

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
