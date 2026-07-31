# Limitations

Read-only, zero-OCR, evaluation-only. No recognizer ran, no production code
changed, no filter was relaxed or modified, no treatment was implemented.

## The `truthInRawOcr` reliance is inherited and unresolved

PR #217 flagged this as its own first limitation, and this sprint **inherits it
whole**. All 44 frozen cases sit downstream of `truthInRawOcr = true`, which is
carried forward from a probe run and cannot be re-derived: the complete per-word
OCR list is not committed, only reconstructed lines capped at 12 per case.

If that determination is systematically generous, cases leave this population
entirely and become `OCR_RECOGNITION_MISS` — and the `FILTER_REJECTION`
dominance would shrink with them.

What this sprint *did* add is a partial check the earlier one could not run: for
**38 of 43** cases whose truth is claimed to be on a reconstructed line, the truth
was independently located in the retained lines under the governed normalization.
That is direct corroboration for 38 cases. It says nothing about the word-level
determination for the 24 cases classified `OCR_RECOGNITION_MISS` in PR #217,
which remain unchecked.

## Five cases cannot be verified either way

Five cases claim truth on a reconstructed line but do not show it in their
retained lines — and their line lists sit at the 12-line cap, so the truth may
simply be in a dropped line. They are recorded as **unverifiable**, not as
contradictions. Calling them contradictions would manufacture a finding out of a
truncation artifact; calling them confirmed would assert something unchecked.

## `CANDIDATE_FORMATION_LOSS` rests on an absence

The two cases in that class are classified there because **no** rejected candidate
decision carries the truth. Absence of a recorded rejection is consistent with no
candidate object being formed — but the complete candidate decision list is not
committed, so a candidate that was formed and dropped without a recorded reason
cannot be excluded. With n=2 this does not affect the conclusion, but the class is
weaker evidence than `FILTER_REJECTION`, which rests on a positive record.

## The cost side is not merely unmeasured — it is unmeasurable here

This is the central limitation. The committed evidence contains **no** rejected
non-truth candidate and **no** rejection reason for one. Every question that
matters for safety — what a relaxation would newly admit, whether it would
displace a currently-correct top-1 or selected value, whether a Brand-absent case
would gain a candidate, how far candidate volume would grow — is unanswerable
from what is committed.

So the sole-blocker counts in this package are **upside upper bounds and nothing
more**. They assume every sole-blocked truth candidate, once kept, would also
survive ranking, selection and the unchanged authority gate. None of that is
computed. The real recovery is at most those numbers and probably less.

**No relaxation in this package is described as safe, and none should be read as
recommended.**

## The largest category is already closed, and that constrains what follows

`too-many-words` is the largest sole blocker at 17 cases and 14 brand identities —
by upside alone it would be the obvious target. It is not available. E1a and E1b
both simulated relaxations aimed at it and both were killed, with E1b recorded as
closing the brand sub-span-generation family. E1a is the cautionary case: it
recovered truth in 17 of 23 targeted cases *and* broke 12 currently-correct
selections, pushed 8 of 10 Brand-absent labels into emitting a value, and put 2
wrong values into `OBSERVED`.

That is the clearest available demonstration that upside counts of exactly the
kind reported here do not predict outcomes. This sprint does not reinterpret those
verdicts; it treats them as settled.

## Stage attribution is not causal

Locating the earliest stage where truth stops surviving does not establish that
repairing that stage would recover the case. A candidate admitted past a filter
must still be ranked above its competitors, be selected, and clear an unchanged
authority gate that currently reports `OBSERVED` on 4 of 105 cases. The cascade
shows where evidence is lost, not what a repair would gain.

## Distinct brand identity is a proxy

Carried forward from PR #217 with the same caveat: it is the acceptable-truth-value
set, a duplication control, not a measurement of visual-design diversity. It is
used here for the dominance test and for the sole-blocker identity counts.

## Scope

44 cases inside one 115-case corpus, one pipeline, one snapshot. Every count is
conditional on that. This sprint does not KEEP or KILL anything and authorizes no
production change.
