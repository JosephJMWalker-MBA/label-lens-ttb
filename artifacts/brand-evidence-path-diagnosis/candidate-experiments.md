# Candidate experiments — brand evidence path

> # ⛔ SUPERSEDED — E1 AND ITS VARIANTS ARE KILLED; THE FAMILY IS CLOSED
>
> This document records the proposals **as first written**, before either was
> simulated. Both were subsequently falsified and neither is recommended:
>
> - **E1** (sub-spans for rejected lines) → simulated as **E1a**: **KILLED**.
>   `e1a-too-many-words-simulation/recommendation.md`
> - **E1 gated by prominence** → simulated as **E1b**: **KILLED in Phase 1**.
>   `e1b-prominence-gated-simulation/recommendation.md`
> - **E2** (multi-line merge) belongs to the same arbitrary-span family and is
>   **closed with it**; it was never simulated.
>
> **Arbitrary contiguous sub-span generation is not a safe treatment and no
> implementation is recommended.** The "(recommended)" heading below is
> historical. **E3 is the only proposal in this file that remains live**, and it
> changes no production behaviour.

Three bounded proposals. **None is implemented.** All are scoped to *candidate
usefulness*; none touches the authority gate, and none is justified by "the
correct candidate is ranked first".

## Protected metrics — shared by all three

Any experiment is killed if it moves these in the wrong direction:

| Metric | Baseline | Requirement |
|---|---|---|
| Wrong value marked `OBSERVED` (false certainty) | **0** | must stay **0** |
| Absent-brand false positives | **0 / 10** | must stay **0** |
| Correct selected value (normalized) | 29 / 105 | must not fall |
| `OBSERVED` count | 4 | must not fall; must not rise without a designator/possessive present |
| Alcohol metrics (recall 70/103, accuracy 68/103, false certainty 0) | — | unchanged |
| Deterministic replay | stable | unchanged |

---

## E1 — generate line sub-spans even when the whole line was rejected — **KILLED (originally recommended)**

**Failure class addressed:** `CANDIDATE_GENERATION_MISS` (43 cases, 37.4 % of the
corpus — the largest class).

**One variable:** the precondition in `shouldTrimWholeLineCandidate`
(`field-selection.ts:1944`). Today sub-spans are generated only when the whole
line already produced a candidate *and* that candidate is `positive` *and* it is
noisy. When a line is rejected outright, no sub-span of it is ever built. The
change is to also generate sub-spans for a **rejected** line. Nothing else moves:
the filter ladder, the classifier, the score weights, the ranking comparator, and
the authority gate are untouched, and every new span must still pass all ten
rejection rules on its own.

**Naturally occurring cases reached:** in **34 of the 43** generation misses the
truth is an *exact* ≤4-word contiguous sub-span of a line the run already
captured. That is the reachable upper bound, not the expected gain — a generated
span must still survive the filters and win the ranking.

**Expected gain:** more correct values selected and a higher top-3 recall.
**Authority is expected to be almost unchanged**, because a plain brand name still
lacks a positive signal. The one case that could legitimately gain `OBSERVED` is
`patricia-green-cellars`, whose truth *carries* a `BRAND_DESIGNATOR` and would be
`positive` — it is lost today only because its line is discarded before any
sub-span is considered.

**False-certainty risk: real and the main thing to watch.** Sub-spans of
regulatory and back-label prose are exactly the material the whole-line filters
exist to suppress. More candidates means more chances for a confident wrong pick.
Two mitigations are already structural: the ten rejection rules apply per span,
and the authority gate still requires a positive signal. The measurement that
matters is the false-certainty count and the absent-brand false-positive count.

**Latency:** more spans per label, no additional OCR passes. `lineWindows` is
O(words × 4). Must be measured; expected small, but the corpus median and p95
must be reported.

**Kill criterion:** any wrong value becomes `OBSERVED`; any absent-brand case
emits a value; normalized-match count falls below 29; or corpus p95 latency rises
by more than 10 %.

---

## E2 — allow a multi-line merge when neither side is `positive` — **CLOSED, never simulated**

**Failure class addressed:** `RECONSTRUCTION_MISS` and the two-line share of
`CANDIDATE_GENERATION_MISS`.

**One variable:** the `if (upper.brandClass !== "positive" && lower.brandClass !== "positive") continue;`
precondition on merges (`field-selection.ts:2234`). The alignment, proximity,
seed-count and token-count caps stay exactly as they are.

**Naturally occurring cases reached: 2** — `chateau-bonneau` ("Château" /
"Bonneau" on separate lines) and `wine-multi-artifact-06` ("Mauro" / "Molino").
Measured directly: these are the only misses where the truth spans two adjacent
captured lines and appears on no single line.

**Expected gain:** at most 2 correct selections. **Ranked second because the reach
is small**, and because relaxing a precondition that currently requires *some*
positive evidence is a larger doctrinal step than E1 for a fifth of the return.

**False-certainty risk:** moderate — merging two unremarkable lines can fabricate
a plausible-looking phrase that never appeared as a unit.

**Latency:** bounded by the existing 3-seeds-per-line cap; the merge count grows
but stays small.

**Kill criterion:** as the shared table, plus: if fewer than 2 cases are actually
corrected, the change is not worth its risk and is reverted.

---

## E3 — measurement only: split `OCR_RECOGNITION_MISS` into non-recognition vs near-miss

**Failure class addressed:** `OCR_RECOGNITION_MISS` (24 cases, 20.9 %).

**One variable:** none in production — this is a diagnostic refinement. Today a
brand read as `Prins` instead of `Prinsi` is scored identically to a brand the
engine never saw, because the harness's containment test is exact-after-
normalization.

**Naturally occurring cases reached:** a first pass finds **3 of the 24** where a
single-character deletion of the truth already appears in the captured lines
(`approved-wine-017`, `approved-wine-047`, `approved-wine-107`). A proper edit-
distance measure would likely find more.

**Expected gain:** no metric change. It tells us whether the second-largest
failure class needs an *OCR* intervention or a *matching-tolerance* one — which
determines whether any future work there is worth attempting at all.

**False-certainty risk:** none — nothing in production changes. **Latency:** none.

**Kill criterion:** if fewer than ~5 of the 24 turn out to be near-misses, close
the question and record `OCR_RECOGNITION_MISS` as a genuine recognition limit.

---

## Original recommendation (superseded): E1, with E3 as a cheap parallel measurement

> **This recommendation no longer stands.** E1 was simulated as E1a and killed;
> its prominence-gated variant E1b was killed in Phase 1. **E3 is the only live
> thread.**

E1 addresses the largest failure class, changes exactly one precondition, reaches
34 naturally occurring cases, and leaves the authority gate untouched. Its
success is measured on candidate usefulness (normalized match, top-3 recall) while
false certainty and absent-brand false positives — both currently **0** — are
hard kill conditions rather than trade-offs.

**Primary kill criterion for E1: any case where a wrong brand value becomes
`OBSERVED`, or any absent-brand case that begins emitting a value. Either
outcome ends the experiment regardless of how much recall it gained.**

## Explicitly not proposed

- **Weakening or widening the positive-signal requirement.** 25 correct values sit
  at rank 1 behind that gate, and it is tempting. It is also the only reason the
  corpus has zero false certainty, and rank is not evidence of correctness — see
  `authority-gates.md`.
- **Re-tuning the score weights.** Ranking loses at most 8 cases corpus-wide and
  completely loses 1. The ceiling is too low to justify disturbing 29 correct
  selections.
- **Adding OCR passes or a second engine.** Out of scope for this round and not
  supported by the evidence.
