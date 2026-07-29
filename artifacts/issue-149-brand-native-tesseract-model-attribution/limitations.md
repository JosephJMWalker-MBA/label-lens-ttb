# Limitations — Brand native-runtime / float-model attribution benchmark

Evaluation-only. No production behaviour change, no fixture or truth change, no
crop/preprocessing/parser/threshold/authority change. PR #195 untouched.

## The headline, stated carefully

Neither matched contrast produced any truth-bearing gain. On five of six OCR items
all three arms produced **character-identical** output; on the sixth, Arm A and
Arm B differed trivially (`Colles Dig` vs `Colles ey`) and both were equally wrong
(CER 0.89). Arms B and C were identical on **all six** items.

Nothing recovered truth anywhere: exact normalized match 0/6, truth present in the
raw transcript 0/6, in every arm.

What that supports: on this frozen stylized subset, **neither the recognition
runtime nor the weight precision is the bottleneck**. Both were swapped, one at a
time, with byte-identical inputs, and neither moved the result.

What it does not support: any claim that Tesseract cannot read stylized Brand
marks in general. This is 5 cases / 6 items / 4 distinct crops / 3 distinct
designs.

## Sample size and independence

Small by construction, and smaller than it looks. Two of the six items are
byte-identical pixels (`approved-wine-004` and `la-fattoria-rotated`), and three of
the five cases share one Brand design. Cluster decisions used the 4 case-level crop
clusters and 3 design clusters so no duplicate or repeated design was counted
twice, but the effective diversity here is **three designs**.

## Latency comparison is confounded

Arm A ran in-process; Arms B and C each paid full container startup. The reported
medians — A 184 ms, B 383 ms, C 403 ms — therefore measure different things and
**must not be read as a runtime performance comparison**. The B-versus-C delta
(383 vs 403 ms) is the more meaningful of the two, since both include the same
container overhead.

## Memory figures are different metrics

Arm A reports a Node process RSS delta (median 128 kB); Arms B and C report
container peak RSS from `/usr/bin/time -v` (median 52,108 kB and 61,316 kB). These
are **not comparable to each other**. Only the B/C pair is internally comparable,
and there the float model costs about 9 MB more resident memory — consistent with
the larger weights. All figures are diagnostic and say nothing about Render.

## Confidence is not comparable across runtimes

Original engine confidence is preserved per arm and **no cross-runtime normalized
confidence was fabricated**, because the tesseract.js and native scales are not
proven equivalent. Every selector-derived quantity — candidate, authority state,
false reliable read — is therefore **exploratory**. Raw-recognition metrics are
primary, and no engine confidence became a compliance finding.

## The selector was run with an identity geometry mapping

To pass normalized word evidence through the existing deterministic Brand selector
in evaluation-only mode, each word's `originalGeometry` was synthesised from its
bounding box under an identity transform, because this benchmark feeds preprocessed
pixels directly rather than replaying the production region-mapping path.

All three arms received the same treatment, so the contrast stays fair, but
selector output here is **not** what production would compute for these images.
That is a further reason the authority-state and false-reliable-read numbers are
exploratory rather than production-predictive.

## Arm A is production-equivalent, not production

Arm A is the bounded governed-Brand evaluation path: one pass, one region, PSM 11,
OEM 1, the vendored integer model. Production runs a broader region strategy with
multiple passes. Arm A is the right incumbent for a single-variable runtime
contrast; it is not a simulation of the whole production pipeline.

## Hallucination was not adjudicated

`hallucinatedText` is recorded as `null` with an explicit note rather than guessed.
Deciding whether recognized text is visually unsupported needs paired human
review, which this package does not perform. Several outputs look like plausible
candidates for it — `Colles Dig`, `EA,` — and none was scored either way.

## Arm A versus Arm C is descriptive only

The two differ in runtime **and** weights. It is reported for completeness and is
never treated as a single-variable causal comparison. As it happens the question is
moot here: A and C agree on five of six items.

## What the null does and does not add to the ceiling question

A complete null on this subset satisfies **one** additional prerequisite for a
later capability-ceiling discussion about this specific stylized subset. It does
not establish a ceiling, and it does not generalize beyond these designs.

Standing prerequisites still unmet include orientation and segmentation ruled out
per case, preprocessing null on the final subset, and a substantially larger
independently sourced corpus across multiple design families.

## No result authorizes production change

Not production replacement, not shadow mode, not an engine swap, not a traineddata
swap, not a threshold change. The overall next-step decision authorizes
**planning** for one modern local scene-text recognizer, which is a separate
preregistered evaluation, not an implementation mandate.
