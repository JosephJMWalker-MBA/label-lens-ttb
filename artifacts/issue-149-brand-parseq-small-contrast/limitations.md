# Limitations — PARSeq-small versus incumbent Tesseract on frozen Brand crops

Evaluation-only. No production source, Dockerfile, dependency, Render or Next.js
configuration, OCR asset, field selection, parser, threshold, authority state,
rule, fixture or truth was modified. PR #195 untouched. No checkpoint or container
layer in Git.

## The verdict is `REGRESSION`, and it turns on one design

The preregistered rule is explicit: `KEEP_FOR_EXPANDED_BENCHMARK` requires that
**no distinct Brand design** has a primary-metric regression. Design `D1` — the La
Fattoria design — regressed, so KEEP is blocked and the verdict is `REGRESSION`.

That result sits alongside genuine, substantial gains: **3 of 4 crop clusters and
2 of 3 designs improved**, including one exact recovery. A reader who takes
`REGRESSION` to mean "PARSeq did worse" would be reading it wrong. It means the
frozen rule was tripped by one design, and the rule was written to be tripped that
way on purpose.

## The regression is exactly at the threshold

On the duplicate-crop pair, whitespace-free CER moved from **0.100** (Tesseract) to
**0.200** (PARSeq). The preregistered material-regression threshold is a CER
increase of **>= 0.10**. The observed increase is **exactly 0.100** — it hits the
boundary, it does not sail past it.

This is stated precisely rather than rounded into a narrative. The rule was frozen
before any output existed and was not relaxed afterwards, which is the whole point
of freezing it; but a boundary-exact trip is materially different from a collapse,
and the distinction belongs in the record.

## The regression is an omission, not a fabrication

Tesseract returned `Lo FAT TORIA` — it garbled `La` into `Lo` and fragmented the
roman word, yet those characters land close to the truth string. PARSeq returned
`FATTORIA` — it read one word perfectly and **dropped the script `La` entirely**.

Under a character-error metric the garbled-but-present read scores better than the
clean-but-incomplete one. That is a real property of the metric, not a trick, and
it is why the boundary-sensitive and visual-support views are reported alongside
it. All six PARSeq transcripts were visually supported or partially supported;
**no fabrication was observed**.

## Score ordering is inverted — the most serious finding here

`scoreOrderingRisk` is **true**, and the detail matters more than the flag. The
single exactly-correct item scored **0.593**. The two wrong items scored **0.933**
and **0.822**.

PARSeq was **most confident where it was wrong** on this subset. Any future
attempt to threshold this score would, on this evidence, promote the wrong answers
first. Six items cannot establish that pattern, but it is the opposite of what a
calibration story would need, and it should be treated as a warning rather than
noise.

## No calibration was invented

No threshold was derived from any source, native scores were never rescaled or
mapped to authority states, and they were never compared directly against
Tesseract confidence. The canonical false-reliable-read measure is
**`NOT_ASSESSABLE_NO_CALIBRATED_AUTHORITY_MAPPING`** — deliberately not zero.
Reporting zero merely because PARSeq is unwired from the authority classifier
would be false comfort.

## The no-space charset shapes every number

PARSeq cannot emit a space. Boundary-sensitive exact match is therefore **0 of 6**
for PARSeq by construction, and the primary comparison had to be run on a
whitespace-free representation for the arms to be comparable at all.

Whitespace-free matching is **not** raw exact matching. On the one item PARSeq
matched exactly, the truth happened to be a single word, so the two representations
agree there — that is luck of the corpus, not evidence that the limitation is
harmless.

## This is not a causal attribution

Two arms with different architectures and different intrinsic transforms. Both
start from identical frozen PNG bytes, but Arm B then squeezes them to 32x128 while
Arm A consumes them at native size. No single dimension separates the arms, so
nothing here attributes the difference to a cause.

## Sample size

5 cases, 6 items, 5 distinct pixel sets, 4 crop clusters, **3 designs**. Two of the
three designs are carried by a single item each. The duplicate pair contributed one
crop cluster, not two.

Cannot establish: population accuracy, production prevalence, calibrated
abstention, production licensing clearance, training-data clearance, production
latency suitability, final engine selection, authority integration, or production
replacement.

## Latency and memory are not comparable across arms

Arm A ran in-process on the runner; Arm B ran in a container with model load
excluded. Arm B's ~100 ms per item is internally consistent but says nothing about
production, and nothing about how the two engines would compare in one deployment.

## Every production blocker still stands

Abstention design; confidence calibration; geometry strategy — PARSeq produces no
boxes and none were fabricated; parser integration; an expanded held-out corpus;
training-data due diligence; and production deployment architecture. A KEEP would
not have lifted any of them, and this is not a KEEP.
