# Limitations

Stage 1: planning and preregistration only. No governed 115-case acquisition OCR, acquisition runner OCR, discovery or
execute-mode OCR has run. The ordinary repository suite continues to run its
pre-existing bundled-image OCR tests, disclosed separately.

## What is available, and what genuinely is not

### Complete filter checks — AVAILABLE

Merged PR #220 evaluates all ten ladder rules under an evaluation-only,
default-off entry point (`selectBrandObservationWithCompleteFilterDiagnostics`)
and exports `BRAND_FILTER_CHECK_ORDER` and the invariant assertions. For every
candidate the acquisition records `filterChecks` (all ten rules with whether each
failed) and `activeRejectionReasons` (every failed rule in ladder order).

The earlier statements that the checks were unavailable, that the predicates were
module-local and unexported, and that this was "the most consequential limitation
in the package" were true before PR #220 and are false now. They are preserved
only in the historical amendment records.

### The one-filter counterfactual — SATISFIABLE BY REPLAY, not by reasons

The superseded claim was that unknown *later* rules made a one-filter
counterfactual an upper bound. That is no longer the binding constraint: every
rule that would reject a candidate is recorded.

The real constraint is different, and Amendment 3 named it. Rejection reasons say
why a candidate was rejected; they do not say what the selector would have
produced under a different filter, because candidates are *constructed from the
passes*. A rejected span returns from `analyzeBrandSpan` before a `Candidate`
object exists, so it carries no `brandClass`, no geometry-on-candidate, no score
and no ranking — and filter outcomes feed forward into line-window and multi-line
candidate formation.

What makes the counterfactual reachable is the **complete ordered
`RegionOcrResult` array**, persisted per case
(`region-ocr-result-replay-contract.json`). A separately governed, zero-OCR
selector can replay it with exactly one filter changed. **This sprint does not
run that replay and authorizes no filter change.**

## Requirements that genuinely cannot be met

**Word baseline geometry, and block/paragraph/line identifiers.** `OcrWord`
carries text, raw confidence, a bounding box and an optional original geometry.
Nothing else. The brief asks for these "where available"; they are not available.

**Constituent word IDs per reconstructed line.** `BrandLineDiagnostic` records
assembled text and pass provenance, not word membership. Candidate-to-line
membership is recoverable through `lineIndexes`; word-to-line membership is not.

Both were re-verified against the real types at base `546c3f27…`. Neither is
invented or approximated.

## The Stage 1 isolation tests are static, not runtime proof

They read committed planning artifacts and assert manifest shape, path separation
and import prohibitions. **They cannot demonstrate that a future process is unable
to read the repository checkout.** Actual process-level isolation is a mandatory
discover-mode gate inside the runtime boundary, frozen in
`acquisition-runtime-isolation-contract.json` and deliberately not implemented
here. Until that gate has run and been reviewed, the isolation claim in this
package is a design commitment, not a measurement.

## The staging step is trusted, by necessity

Something must know which historical image becomes `item-0001`, because something
must copy it. That knowledge lives in the freeze script, which runs before and
outside the acquisition process. The acquisition process sees only a directory of
`item-NNNN.<ext>` files.

This is a real trust boundary, not an absence of one: if the staging step were
wrong, every downstream mapping would be wrong in the same way. It is tested, but
it is tested against its own output, so a systematic staging error would not be
caught by these tests. The image SHA-256 carried on both sides is the check that
would catch it, and it is asserted.

## The 100 MB fallback is retention-bound, not preservation

If the raw evidence exceeds 100 MB the run still completes and the complete
lossless evidence is uploaded — but as a **temporarily retained workflow
artifact**, which expires. It is not durable archival, and this package does not
call it that. The procedure records the artifact ID, exact bytes, SHA-256,
configured retention and expected expiration, stops before post-freeze truth
evaluation, and requires an explicit owner decision about durable archival before
continuing.

Two real consequences. A reviewer working only from the repository would not see
the evidence. And if no durable destination is chosen before expiry, the evidence
is **gone** — the run would have to be repeated. The gate makes that visible
rather than silent, but it does not prevent it.

## Production caps candidate generation, and that bounds any counterfactual

`MAX_BRAND_WORDS = 4` and `MAX_MULTI_LINE_SEEDS_PER_LINE = 3` mean windows longer
than four words are never formed. Acquisition can only enumerate candidates
production actually built, so "all candidate windows considered" means *all
windows production considered*, not all windows conceivable. Whole-line
candidates longer than four words are formed and then rejected with
`too-many-words`, so those do appear.

## The repeat measures stability, not truth

Two runs on one host, one build, one day. Agreement establishes that the evidence
package is reproducible under those conditions. It does not establish
cross-host or cross-build determinism, and it does not make either run more
correct than the other. Under disagreement both runs are preserved and neither is
designated canonical.

## The acquisition validates evidence, not the pipeline

Nothing here tests whether the Brand path is correct, well-tuned or
production-suitable. It records what the path does. A field that reproduces its
prior value confirms the evidence chain, not the behaviour.

## Cross-check outcomes may be genuinely ambiguous

`PRIOR_FIELD_NOT_REPRODUCED` and `CURRENT_PIPELINE_DIFFERENCE` are separated by a
judgement about whether an identified change accounts for the difference. Where
that judgement cannot be made from the diffs, `CANNOT_COMPARE_SEMANTICALLY` is
the honest code, and it will be used rather than forcing one of the other two.

## Volume, and what it costs to keep

The estimate below is grounded in the committed 15-case baseline report, not
guessed, but it is an extrapolation from 15 cases to 115 and the real figure will
differ. If the raw evidence turns out substantially larger than estimated, that
is a fact to report, not a reason to reintroduce a cap.

## Scope

115 cases, one corpus, one pipeline, one base. This sprint does not KEEP or KILL
anything, chooses no successor treatment, simulates no relaxation, and authorizes
no production change.
