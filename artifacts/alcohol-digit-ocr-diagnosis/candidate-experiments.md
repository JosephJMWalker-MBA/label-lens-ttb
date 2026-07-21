# Candidate experiments — alcohol digit OCR

> **SUPERSEDED IN PART — see `decision-addendum.md`.** The corroborated-contradiction
> false-alarm figures below (2 of 68 correct cases) were produced by a control that
> parsed re-read text with an ad-hoc regex instead of the production parser. Re-measured
> with the real `selectAlcoholObservation`, the trigger fires on `approved-wine-037`
> and on **no** correct case. Both reported false alarms are withdrawn. Everything else
> in this file — the baseline, the mechanisms, the OCR matrix, and the finding that a
> value-*replacing* re-read breaks 14-28 correct cases — still stands.


Ranked by corpus-wide safety, then correction of confirmed errors, generality,
interpretability, and cost. All figures are from `control-results.json` and
`ocr-matrix.csv` in this directory.

---

## E1 — corroborated-contradiction abstention **(recommended at the time; SUBSEQUENTLY KILLED)**

> **This recommendation no longer stands.** E1 was specified in full and then
> killed without implementation. See
> `../alcohol-corroborated-contradiction/decision.md`. The measured figures in
> this section are the *superseded* ones — the false-alarm row below is withdrawn
> (see the banner at the top of this file).

**One conceptual change:** a confidence/state signal. No value is ever replaced.

**Hypothesis.** When a bounded re-read of the accepted candidate's own pixels
agrees with itself but contradicts the selected value, the selected value is not
trustworthy enough to be asserted as `OBSERVED`. (The word "independent" was used
for this re-read in the original draft; it was later established that the two
reads share crop, preprocessing, engine, model and language, and differ only in
page-segmentation mode. See `../alcohol-corroborated-contradiction/limitations.md`.)

**Trigger.** After an alcohol candidate is accepted, re-OCR a crop derived from
that candidate's recorded `sourceOriginalBoxes` at two page-segmentation modes.
If both re-reads parse to the same value **and** that value differs from the
selected one, demote the observation `OBSERVED → LOW_CONFIDENCE`, preserving the
value and recording the disagreement. The trigger uses only evidence the pipeline
already holds — never fixture identity, never the truth, and no plausibility bound.

**Stage.** Field observation construction (state assignment), after selection.

**Target cases.** `approved-wine-037` fires. `approved-wine-018` does **not**.

**Measured control (68 currently-correct cases).**

| | |
|---|---|
| ~~False alarms on correct cases~~ **WITHDRAWN** | ~~2 / 68 (2.9 %) — `approved-wine-031`, `wine-multi-artifact-05`~~ — a research-instrument bug; the corrected figure is **0 / 68** |
| Of those, re-read was actually right | **0** (both were `135`-style decimal-loss artifacts) |
| Detection recall impact | **none** — value preserved, state stays ≠ `NOT_OBSERVED` |
| Parsed-accuracy impact | **none** — value preserved |

*(Superseded: there were no false alarms. Both cases were artefacts of the
ad-hoc regex described in
`../alcohol-corroborated-contradiction/diagnostic-history-disclosure.md`.)*

**Expected gain.** `approved-wine-037` stops asserting a wrong 19.0 as `OBSERVED`.
Parsed accuracy does **not** improve (the value is still wrong) — this converts
unsupported certainty into visible uncertainty, which is what the doctrine asks
for.

**Latency.** 2 extra OCR calls only for cases that already produced an accepted
candidate (70 of 115); ~40–110 ms each on the measured crops.

**False-certainty risk.** Strictly reduces it. ~~**Regression risk:** 2 correct
cases become `LOW_CONFIDENCE` with unchanged values.~~ *(Withdrawn — no correct
case is demoted. `LOW_CONFIDENCE` was also later rejected as a dishonest state
for this finding; see `state-semantics.md` in this directory and
`../alcohol-corroborated-contradiction/decision.md`.)*

**Tests.** Fires on a synthetic disagreeing re-read; does not fire when re-reads
disagree with each other; does not fire when they agree with the selection; value
and raw evidence preserved on demotion; deterministic.

**Success criteria.** `approved-wine-037` no longer `OBSERVED`; recall and parsed
accuracy unchanged; ≤ 3 correct cases demoted; deterministic replay identical.

**Kill criteria.** Any recall or accuracy loss; > 3 correct cases demoted; the
signal proves non-deterministic; latency p95 rises materially.

---

## E2 — targeted re-read as a *replacement* value **(not recommended)**

**Hypothesis.** Re-OCR of the candidate crop is more accurate than the full-image
pass and should replace the selected value.

**Measured control — this is why it is not recommended:**

| Re-read mode | Targets fixed | Correct cases broken |
|---|---|---|
| psm=sparse | 1 / 2 (`037`) | **14 / 68** |
| psm=singleWord | 1 / 2 (`037`) | **28 / 68** |

Every one of those broken cases is broken the same way: the tight crop loses the
decimal point (`13.5` → `135` → 35). The treatment fixes one case and damages an
order of magnitude more. **Kill on the measurement, not on principle.**

---

## E3 — nothing for `approved-wine-018`; record as a known limitation

**Finding.** The only configurations that read `13.5` require a hand-tuned
`marker+number` crop with `psm=singleWord`. The generalisable crop derived from
the candidate's own geometry yields `135%` → 35. The corroborated signal does not
fire because the two re-reads disagree with each other (3.9 vs 35).

**Recommendation.** No production change. Record as an unresolved engine
limitation: a narrow leading `1` separated from an abbreviating period by a single
pixel, at a font size much larger than its neighbours, is lost by
tesseract.js/LSTM at the resolutions this pipeline uses. Any "fix" available today
is a crop chosen because we already know the answer — which is fixture overfitting
and cannot be expressed as a general rule.

---

## Scope comparison (Phase 5)

| Scope | Trigger relies on truth? | Cost | Overfit risk | Verdict |
|---|---|---|---|---|
| 1. Global primary-pass change | no | high | — | not evaluated; no single global setting won both cases |
| 2. Alcohol-region recovery always | no | 2 OCR/case | medium | subsumed by E2's failure |
| 3. Recovery after a *suspicious* read | **would** (no non-truth definition of "suspicious" survived — plausibility bounds are forbidden) | — | high | rejected |
| 4. Alternate read collected for diagnostics only | no | 2 OCR/case | none | safe but delivers no user-visible benefit |
| 5. Targeted crop from existing evidence geometry | no | 2 OCR/case | **measured: high as replacement, low as signal** | → E1 (signal) / E2 (replacement, killed) |
| 6. No production change | n/a | none | none | → E3 for case 018 |

## Phase 6 — cross-engine evidence

The only OCR engine in the repository is **tesseract.js 7** with a vendored
`eng.traineddata`; there is no system `tesseract` binary and no second engine. The
local VLM material under `src/fixtures/eval/vision-observer/` is evaluation-only
and is not part of the production pipeline. No dependency was added, no model
downloaded, no external service called. **No cross-engine comparison was available
locally**, and obtaining one is out of scope.
