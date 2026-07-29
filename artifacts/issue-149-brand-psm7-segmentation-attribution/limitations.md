# Limitations — PSM 7 on segmentation-suspected Brand cases

Evaluation-only. No production code, fixture, threshold, parser, ranking,
normalization, selection rule, Brand truth, Alcohol logic, or Government Warning
logic changed. PR #195 untouched.

## n=5, mechanism-existence only

Five cases cannot support a rate, a prevalence estimate, or any production-level
claim. This experiment asks only whether line-oriented segmentation recovers
Brand text on five specific frozen crops. It does not measure how often
segmentation matters anywhere else.

## The null result does not establish a capability ceiling

All five cases came back `NO_EFFECT`. That means PSM 7 did not recover Brand
evidence on these crops. It does **not** mean Tesseract cannot read them, and it
does not establish a recognizer capability ceiling. A ceiling claim still
requires, at minimum, a stronger-traineddata comparison that fails first and a
corpus far larger than five cases. That comparison has not been run.

## The null result does not refute the segmentation label

The blinded geometry review labeled these five `SEGMENTATION_SUSPECTED` on
appearance. This experiment tested one specific intervention matched to that
label — Tesseract's single-line page segmentation mode. PSM 7 failing is
evidence that *this* treatment does not recover *these* cases. It is not proof
that segmentation is irrelevant to them: a different segmentation configuration,
or a segmentation approach outside Tesseract's PSM vocabulary, remains untested.
Nothing here authorizes such a sweep; any follow-up must be preregistered
separately and singly.

## PSM 7 suppressed output on three cases

Recorded because the preregistered metrics deliberately do not score it as
regression. On `approved-wine-023`, `approved-wine-027`, and `approved-wine-091`
the control produced a non-empty but wrong transcript, and PSM 7 produced an
**empty** transcript. Under the preregistered rules this is `NO_EFFECT`: no
correct evidence existed to lose, useful token recall was 0 in both arms, and no
false reliable read appeared. That classification stands — the rules were frozen
before the run and were not revised after seeing results.

But "no effect on truth-bearing evidence" is not the same as "no behavioral
change". PSM 7 changed behavior on four of five cases; on three of them it
removed all output. Anyone reading `5/5 NO_EFFECT` as "the two arms behaved the
same" would be reading it wrong.

## Single reader, provisional labels

The `SEGMENTATION_SUSPECTED` labels this experiment is built on come from one
isolated model annotator, with no inter-rater agreement, and remain provisional
pending an independent second reader (see PR #205). If those labels are wrong,
this experiment tested the wrong intervention on the right cases, and its null
result would say nothing about the actual mechanism.

## Says nothing about the stylized subset

The other five governed Brand cases — the no-text and severe-glyph subset scored
5/5 stylized in PR #205 — were not touched here. No result transfers between the
two subsets in either direction.

## Selection semantics are inherited, not validated

Reliability, candidate generation, and `ocrEvidenceScore` come from the existing
production Brand selection primitives, reused read-only. This experiment
inherits whatever those primitives do. Two cases (`approved-wine-035`,
`approved-wine-085`) produced `AMBIGUOUS` candidates below the reliability
threshold in both arms; that behavior was not under test and was not evaluated.

## Environment note — worktree asset override

The run executed inside a git worktree that has no `node_modules` of its own, so
the Tesseract WASM core was resolved through the supported
`LABEL_LENS_OCR_CORE_DIR` operator override pointing at the primary checkout's
`node_modules/tesseract.js-core` (version 7.0.0, the same package the repository
depends on). The vendored `eng.traineddata` resolved normally from the worktree
and is hashed in `configuration-freeze.json`. No engine, model, or traineddata
was substituted; only the on-disk location of the WASM core differed. Recorded
because it is an environment difference from a plain repository-root run.

## Determinism was checked once

One exact repeat of both arms reproduced every raw transcript, word projection,
selection, and classification. That establishes run-to-run determinism on this
machine, this Node version, and this engine build. It does not establish
determinism across platforms or engine versions.

## Latency and confidence were not treated as outcomes

Mean confidence changed between arms on several cases. Per the preregistration,
confidence alone was never counted as improvement, and no latency claim is made.
