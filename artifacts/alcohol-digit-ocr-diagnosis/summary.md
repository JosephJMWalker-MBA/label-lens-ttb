# Alcohol digit OCR diagnosis

> **SUPERSEDED IN PART — see `decision-addendum.md`.** The corroborated-contradiction
> false-alarm figures below (2 of 68 correct cases) were produced by a control that
> parsed re-read text with an ad-hoc regex instead of the production parser. Re-measured
> with the real `selectAlcoholObservation`, the trigger fires on `approved-wine-037`
> and on **no** correct case. Both reported false alarms are withdrawn. Everything else
> in this file — the baseline, the mechanisms, the OCR matrix, and the finding that a
> value-*replacing* re-read breaks 14-28 correct cases — still stands.


Diagnosis only. **No production code, parser syntax, ranking, thresholds,
evaluator logic, fixture truth, OCR passes, preprocessing, brand behaviour,
schema, or UI was modified.** Nothing is proposed for commit in this round.

Worktree `label-lens-ttb-ocr`, branch `research/alcohol-digit-ocr-diagnosis`,
base `9ecd7b2` (origin/main). Reproduction: `commands.sh`.

## Phase 0 — measured baseline (current main, 115 cases)

| Metric | Value |
|---|---|
| Present-alcohol cases | 103 |
| Detection recall | 70 / 103 — **68.0 %** |
| Parsed-value accuracy | 68 / 103 — **66.0 %** |
| Alcohol false certainty (repo metric) | **0** |
| Parser failures | **2** — `approved-wine-018`, `approved-wine-037` |
| Absent-alcohol false positives | 0 / 13 |
| States | OBSERVED 64 / LOW_CONFIDENCE 6 / NOT_OBSERVED 45 |
| Brand | exact 27, normalized 29 |
| Latency | median 1389 ms, p95 4869 ms (wall clock; the only figures here that do not reproduce exactly) |

## Phase 1 — earliest failure stage

Both cases fail at **OCR recognition in the primary full-image pass**
(tesseract.js, OEM 1 LSTM, `eng` vendored, **PSM 11 sparse**, scale 1.5,
grayscale + normalise, cubic). The wrong digits are present in the OCR tokens
themselves, so line grouping, window construction, canonicalization, and the
parser are all innocent. Recovery passes never run, because the primary pass
produced a confident value — so no correct alternative was collected and
discarded.

## Phase 2 — the two mechanisms are different

| | `approved-wine-018` | `approved-wine-037` |
|---|---|---|
| Visible | `Alc.13.5% by Vol.` | `Alcohol 13.0 % by volume` |
| Machine | `3.5%` — **leading `1` lost** | `19.0%` — **`3` → `9`** |
| Polarity | dark on light | **light on dark (inverted)** |
| Contrast range | 204 (32–236) | **134 (1–135)** |
| Inter-glyph gaps | `[2,5,1,1,5,1]` px — **1 px** before the numerals | `[5,3,5,13,8]` px — clean |
| Ink runs | one **44 px** merged run | separated; `3` and `0` share identical boxes (w14 h32) |
| Mechanism | **segmentation / glyph fusion** — the narrow `1` is absorbed into the `Alc.` cluster across a 1 px gap under resampling | **shape discrimination** — a low-range, JPEG-softened `3` closes into a `9` |

**They do not share a mechanism.** One is a spacing failure, the other a
contrast/shape failure. No single treatment addresses both, and none was found
that did.

## Phase 3 — OCR matrix (896 runs per case, 3 repeats, vendored engine only)

| | 018 (truth 13.5) | 037 (truth 13.0) |
|---|---|---|
| Runs recovering truth | **75 / 896** | **451 / 896** |
| Where | only `markerAndNumber` (56) + `padded` (19); 52 of 75 at psm=singleWord | **every** crop, PSM, and scale |
| Best deterministic config | `markerAndNumber x1.5 psm=singleWord production` → `"13.5%"` conf 52, 113 ms | `line x1.5 psm=sparse production` → `"ono 13.0 % by volume"` conf 80, 44 ms |

018 recovers **narrowly** and only when the `Alc.` marker is inside the crop;
cropping to the numerals alone never recovers the `1`. At production settings on
a line crop it yields `"Al 13 5% by Vol Ch"` — the `1` returns but the decimal is
lost.

037 recovers **broadly**, under the **existing** treatment and the **existing**
page-segmentation mode. Only the crop differs. Nothing new is required.

Repeatability: all reported winning configurations are deterministic across 3
repeats (`deterministic` column in `ocr-matrix.csv`).

## Phase 4 — corpus control (the decisive result)

Re-OCR each accepted candidate's own recorded geometry (production treatment,
×3, two PSMs) across the 70 cases that have an accepted candidate, 68 of which
are currently correct:

| Re-read used as a **replacement** | Targets fixed | Correct cases broken |
|---|---|---|
| psm=sparse | 1 / 2 (`037`) | **14 / 68** |
| psm=singleWord | 1 / 2 (`037`) | **28 / 68** |

Every break has the same cause: the tight crop drops the decimal point
(`13.5` → `135` → 35; e.g. `alc 135 %by vol`, `126% ALC. BY VOL.` → 26). **A
value-replacing treatment is not corpus-safe for either case.**

Used instead as an **abstention signal** — both re-reads agree with each other
*and* contradict the selected value:

| | |
|---|---|
| Fires on currently-correct cases | **2 / 68 (2.9 %)** — `approved-wine-031`, `wine-multi-artifact-05` |
| Of those, the re-read was actually right | **0** |
| Fires on `approved-wine-037` | **yes** (re-read 13.0 = truth) |
| Fires on `approved-wine-018` | **no** (re-reads disagree: 3.9 vs 35) |

Because the signal only demotes state and never replaces a value, those 2 false
alarms cost no recall and no accuracy.

*Caveat:* the control re-parses `rawText` locally rather than re-entering the
production selector, so `selectedValue` can differ cosmetically from the
pipeline's parsed value in a case like `wine-multi-artifact-05`. This affects the
false-alarm count only in the conservative direction (it can over-report
firings), not the corpus-safety conclusion.

## Phase 6 — cross-engine

Only tesseract.js 7 with the vendored `eng.traineddata` is available; no system
`tesseract` binary, no second engine, and the local VLM material is evaluation-
only and not part of the production pipeline. No dependency added, no model
downloaded, no external service called. **No cross-engine comparison was
possible**, and acquiring one is out of scope.

## Verdict

- The two failures have **different mechanisms** and need different answers.
- **`approved-wine-037`** is a confirmed OCR engine limitation. A
  non-value-replacing abstention signal (E1) was proposed here, then specified in
  full and **killed without implementation** — see
  `../alcohol-corroborated-contradiction/decision.md`. The 2.9 % false-alarm rate
  quoted in earlier drafts is withdrawn (the corrected figure is 0 %), and the
  corrected figure did **not** make the signal shippable: it rests on one true
  positive, and the two re-reads are not meaningfully independent.
- **`approved-wine-018`** has **no safe treatment today.** The only recovering
  configuration is a hand-tuned crop; the generalisable crop reads `35`. Recommend
  recording it as a known engine limitation rather than fixing it.
- **No global preprocessing or PSM change is recommended.** None won both cases,
  and the family that helps `037` damages 14–28 correct cases when allowed to
  replace values.

Ranked experiments and their success/kill criteria: `candidate-experiments.md`.
The final disposition of E1 is in
`../alcohol-corroborated-contradiction/decision.md`; nothing in this record
recommends a production change.
