# Limitations

Diagnostic and evaluation-only. No OCR was run, no recognizer executed, no
production code, ranking, selection, authority threshold or state semantics
changed, no truth altered, no normalization changed, no corpus expanded.

## The strongest result rests on one number I did not re-derive

`CANDIDATE_GROUPING_MISS` is 44 of 105 cases, and every one of them depends on
`truthInRawOcr` being **true**. That field is carried forward from the evidence
artifact; the committed evidence retains reconstructed line texts, not the
complete per-word OCR list, so I could not recompute it independently.

If the probe's raw-OCR determination were systematically too generous, cases
would move from `CANDIDATE_GROUPING_MISS` to `OCR_RECOGNITION_MISS` and the
conclusion could flip to `OCR_HEADROOM`. Everything downstream of raw OCR —
candidate retention, rank, selection, state — **was** re-derived here from
`rankedCandidates`, `truthRank` and `state`.

This is the single most load-bearing assumption in the package and the first
thing a successor experiment should check.

## Current-equivalence is a code-reading claim, not a measurement

The evidence artifact was produced 52 commits ago. I diffed every file that can
affect the Brand path and found the path behaviourally identical — the OCR engine,
the traineddata, primary and recovery pass planning, candidate construction,
ranking, selection and authority are all unchanged, and the one refactor to
`selectBrandObservation` preserves its default branch exactly.

That is a strong argument. It is still an argument. Confirming it would require
re-running the extractor, which this sprint forbids.

## The corpus is 115 cases and one snapshot of one pipeline

It cannot establish population accuracy, production prevalence, or how these
proportions would move on a different corpus. Every percentage here is
conditional on this corpus and this code.

## Distinct brand identity is not distinct visual design

No crop-cluster or verified design clustering exists for this corpus. Brand
identity — the acceptable-truth-value set — is the available duplication control,
and it is a proxy. Two cases of one brand may use entirely different artwork; two
different brands may share a label template. The identity-level counts guard
against one repeated brand dominating the totals; they do **not** measure design
diversity.

The conclusion holds on both units, so this caveat does not change it — but a
successor experiment that needs design diversity must establish it, not inherit it.

## Zero wrong acceptances is a measurement, not a safety claim

`WRONG_ACCEPTED_CANDIDATE` is 0 across all 115 cases. That is a real, welcome
count on this corpus under the current authority gate. It is **not** evidence
that the gate is correctly tuned, because the same gate withholds `OBSERVED` on
25 cases where the correct answer was already selected or top-ranked. Zero false
acceptances and 4 correct acceptances out of 105 describe a gate that is
currently very reluctant, not a gate that is currently well-calibrated.

## `AMBIGUOUS` at 101 of 115 flattens the state histogram

Almost every case ends in one state, so the histogram carries little diagnostic
signal on its own. Four cases carry a governed `knownAmbiguous` truth, where a
non-`OBSERVED` state may be the correct behaviour rather than a failure; those are
flagged per case. The remaining 97 are not explained by governed ambiguity.

## The classification is stage-attribution, not causal attribution

Assigning a case to the earliest stage where truth stops surviving does not prove
that fixing that stage would recover the case. A candidate that survives filtering
might still be out-ranked; a recovered candidate might still be withheld by
authority. The cascade shows where evidence is *lost*, not what a repair would
*gain*.

## What this sprint deliberately does not do

It does not KEEP or KILL anything, does not propose a threshold, does not
implement the successor experiment it suggests, and authorizes no production
change of any kind.
