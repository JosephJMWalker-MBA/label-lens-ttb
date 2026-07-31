# Limitations

Stage 1: planning and preregistration only. No OCR has run.

## Three requirements cannot be met, and they are named before acquisition

**Every individual filter check, and every active rejection reason per
candidate.** The Brand filter is a short-circuit `if`-chain that returns on the
first failing rule, so production records exactly one `filterReason` per
candidate and the later checks are never evaluated. Their results do not exist to
be persisted. Emitting a reason array would require changing production code,
which this sprint forbids, and the predicates are module-local and unexported so
they cannot be re-evaluated offline either.

**This is the most consequential limitation in the package.** It means the
evidence this sprint acquires will make a one-filter counterfactual *computable*
but still *an upper bound*: removing a candidate's recorded reason does not
reveal whether a later rule would then reject it. PR #218 returned
`INSUFFICIENT_COST_EVIDENCE` because no rejected candidate was committed at all;
after this acquisition the cost side becomes measurable for the candidates
production formed, but the "would another rule have fired?" question stays open.

Anyone reading a future counterfactual should read it with that caveat attached.

**Word baseline geometry, and block/paragraph/line identifiers.** `OcrWord`
carries text, raw confidence, a bounding box and an optional original geometry.
Nothing else. The brief asks for these "where available"; they are not available.

**Constituent word IDs per reconstructed line.** `BrandLineDiagnostic` records
assembled text and pass provenance, not word membership. Candidate-to-line
membership is recoverable through `lineIndexes`; word-to-line membership is not.

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
