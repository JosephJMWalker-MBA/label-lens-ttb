# Decision addendum — narrower contradiction trigger

Diagnosis only. **No production code was modified. E1 was not implemented.**
Branch `research/alcohol-digit-ocr-diagnosis`, base `9ecd7b2`. Reproduction:
`commands.sh` (new steps at the end).

---

## The headline correction

The previous round reported that the corroborated-contradiction signal fires on
`approved-wine-037` **and on two currently-correct cases**. That was wrong, and
the fault was in my instrument, not in the pipeline.

`control-simulation.mjs` parsed re-read text with an ad-hoc regex
(`(\d{1,2}(?:[.,]\d{1,2})?)\s*%`). On the string `135%` that regex cannot match at
the leading digit, backtracks, and returns **35**. The production parser applies
`implicit-decimal-recovery` and returns **13.5** — which is what production had
selected. Both "false alarms" were the measuring instrument disagreeing with
itself.

This round re-derives every re-read through the **real** `selectAlcoholObservation`
and canonicalizes re-read numerals with a mirror of the production
`canonicalizeAlcoholNumber`. Under that apples-to-apples comparison:

| Case | Old (regex) | New (production parse) | Selected value visibly correct? |
|---|---|---|---|
| `approved-wine-037` | fired | **fires** | **no** (visibly 13.0, machine 19.0) |
| `approved-wine-031` | fired | **does not fire** | yes |
| `wine-multi-artifact-05` | fired | **does not fire** | yes |

**The two correct trigger cases were `approved-wine-031` and
`wine-multi-artifact-05`, and neither is a real contradiction.**

## Phase 2 — visual adjudication (independent of stored truth and OCR output)

- `approved-wine-031` — reads **`Alc. 13.5% by Vol`**. Production 13.5 is visibly
  correct; truth 13.5 is visibly correct. The re-read loses the decimal point of a
  small, low-contrast dot in a condensed face, and the crop is clipped on the right
  and contaminated by the line above, so psm 8 returns noise at confidence 30. The
  two re-reads also disagree **with each other**, so agreement alone already
  suppresses it. **No truth review needed.**
- `wine-multi-artifact-05` — reads **`ALC 13.5 % BY VOL`** at ~7 px glyph height,
  the smallest alcohol statement in the corpus. Production 13.5 is visibly correct;
  truth 13.5 is visibly correct. All three re-reads return 13.5 — this case is one
  of the corpus's strongest **corroborations**, not a contradiction. **No truth
  review needed.**

Neither case reveals a fixture or evaluator problem. Both were artefacts of the
earlier analysis.

## Phase 3 — mechanism comparison

| Property | `approved-wine-037` | `approved-wine-031` (correct) | `wine-multi-artifact-05` (correct) |
|---|---|---|---|
| Selected raw | `19.0 % by volume` | `Alc. 13.5% by Vol` | `ALC 135 BY VOL` |
| Selected token confidences | 79 / 90 / 96 / 95 (min **79**) | 89 / 58 / 94 / 67 (min 58) | 91 / 95 / 58 / 92 (min 58) |
| Re-read mean confidence (psm 8 / 11) | 51 / 52 | 30 / 47 | **90 / 90** |
| Re-read agreement | **agree (13.0 / 13.0)** | **disagree** (abstain / 13.5) | agree (13.5 / 13.5) |
| Agreement contradicts selection? | **yes** | n/a | **no** |
| Punctuation preserved in re-read | **yes — `13.0`** | no — `135%` | no — `135%` |
| Decimal preserved in re-read | **yes** | no | no |
| Implicit-decimal recovery needed by re-read | **no** | yes | yes |
| Implicit-decimal recovery needed by selection | no | no | **yes** |
| Numeral glyph count | 3 + separator | 3 + separator | 3 + separator |
| Selected bounding box | 175 × 32 px | 163 × 50 px | **97 × 7 px** |
| Crop padding (token union) | 0.6 × h | 0.6 × h | 0.6 × h |
| Polarity | **light-on-dark** | dark-on-light | dark-on-light |
| Crop contrast range | **134** | 255 | 163 |
| Line completeness of re-read | partial (`%`→`i)`) | fragmentary | complete |
| Selected → alternate difference | **one glyph** (`9`↔`3`) | token restructuring | none |

**Earliest measurable property that separates them:** *whether the two re-reads
agree with each other on a canonicalized numeral that differs from the selected
one.* Nothing earlier is needed — polarity, contrast, confidence and box size all
fail to separate the three (`wine-multi-artifact-05` has the **highest** re-read
confidence of the three and is correct; `approved-wine-031` has the **lowest**).

A secondary, genuinely diagnostic property: `approved-wine-037` is the only one of
the three whose re-read **preserves the decimal separator** and needs **no**
implicit-decimal recovery. That is the perceptual difference between "the digits
came out different" and "the punctuation was lost".

## Phase 4 — narrower triggers, all 115 cases

Full data: `narrower-trigger-results.json`. Deterministic: two complete
re-read runs produced **0** differing re-read texts across 210 OCR calls.

| Trigger | Fired | 037? | Correct cases | LOW_CONF | Absent | OCR-fail | False alarms |
|---|---|---|---|---|---|---|---|
| T1 re-reads agree and contradict selection | **1** | **yes** | **0** | 0 | 0 | 0 | none |
| T2 + explicit decimal separator in both | 1 | yes | 0 | 0 | 0 | 0 | none |
| T3 + no implicit-decimal recovery | 1 | yes | 0 | 0 | 0 | 0 | none |
| T4 + both re-reads yield a complete statement | 0 | **no** | 0 | 0 | 0 | 0 | — |
| T5 + re-read exceeds selected confidence | 0 | **no** | 0 | 0 | 0 | 0 | — |
| T6 two independently derived geometries agree | 0 | **no** | 0 | 0 | 0 | 0 | — |
| T7 cross-PSM without punctuation loss | 1 | yes | 0 | 0 | 0 | 0 | none |
| T8 + inverted polarity | 1 | yes | 0 | 0 | 0 | 0 | none |
| T9 + line crop also contradicts | 1 | yes | 0 | 0 | 0 | 0 | none |

Additional OCR cost is 2 calls per case that already produced an accepted
candidate (70 of 115) for T1–T5 and T7–T9; T6 also costs 2 (one token-union, one
line band). Measured re-read latency on these crops: ~40–110 ms each.

**T1 alone already achieves zero correct-case demotions.** T2, T3, T7, T8 and T9
add conditions that change nothing on this corpus — they must **not** be adopted
on the basis of these numbers, because there is no measurable evidence
distinguishing them from T1 here. T4, T5 and T6 are *worse*: each is defensible in
principle but each loses the only true positive.

Why T4/T5/T6 fail, mechanistically:
- **T4** — neither re-read of `037` assembles an accepted statement (the `%`
  degrades to `i)`). The contradiction is at the **numeral** level; requiring a
  complete second statement discards it.
- **T5** — the re-read of `037` is *less* confident (51/52) than the wrong
  selected reading (min 79). High confidence is exactly what makes this case
  dangerous, so requiring the contradiction to out-score it is self-defeating.
- **T6** — the full-width line band re-introduces the government-warning text and
  segments `13.0` as `| 3.0`. The band is a worse reader, not an independent one.

## Margin — how thin is this?

Of the 70 cases with an accepted candidate: 36 produced a canonicalizable numeral
in **both** re-reads; 29 of those agreed with each other; **28 of the 29 agreed
with the selected value** (corroboration) and exactly **1 contradicted it**
(`approved-wine-037`). The remaining 7 disagreed with each other and were
suppressed by the agreement requirement.

Two honest caveats:

1. **One positive is one positive.** Zero false alarms out of 68 correct cases is
   a real measurement, but the trigger's precision rests on a single true positive.
   It cannot be called a general solution on this evidence.
2. **The numeral-extraction rule is crude.** The study takes the first
   canonicalizable numeric token in the re-read. It fails *safe* here — junk tokens
   (`1`, `2`, `0`) make the two re-reads disagree, so nothing fires — but a
   production implementation would need a defined rule for *which* numeral in the
   re-read corresponds to the accepted candidate's numeral, and that rule is not
   established by this study. `approved-wine-018` illustrates the cost: its psm-8
   re-read recovers the correct 13.5 while psm 11 returns a stray `1`, so the
   agreement requirement suppresses a *correct* recovery.

## Phase 5 — state semantics

See `state-semantics.md`. Summary: `LOW_CONFIDENCE` misdescribes a high-confidence
contradicted reading; diagnostics-only leaves the false certainty asserted;
`NOT_OBSERVED` contradicts the repository's own definition. The closest honest fit
is **`AMBIGUOUS` with a new, explicitly documented ambiguity reason**, value
preserved and the re-read carried as an alternate — noting that no case in the
corpus is currently `AMBIGUOUS`, so its downstream rendering would need checking.
The selected value is not replaced either way.

## Phase 6 — decision

> **SUPERSEDED BY THE FOLLOW-ON ROUND.** The verdict below ("A, qualified") was a
> *research* verdict about the signal's measured safety. The production treatment
> it pointed at was subsequently specified in full and **killed without
> implementation** — see `../alcohol-corroborated-contradiction/decision.md`.
> Nothing below should be read as a live recommendation to change production.

**A, qualified.**

A general trigger with **zero correct-case demotions** exists on this corpus: the
plain contradiction test (**T1**), evaluated with the production parser, fires on
`approved-wine-037` and on nothing else across all 115 cases, deterministically.
None of the narrower variants improves on it, and three of them destroy it.

The qualification is that this rests on **one** true positive and on a
numeral-selection rule that this study did not pin down. So the honest position is
not "ship it" but:

- the **two reported false alarms were measurement error and are withdrawn**;
- the previously stated cost of E1 (2 correct cases demoted) **no longer exists**;
- E1's remaining open question is no longer *safety* but *specification* — which
  re-read numeral is compared, and which state is emitted.

Recommendation for a future round (still not implemented here): specify the
numeral-correspondence rule and the state/reason first, then re-measure T1 with
that specification before any code change. Do **not** stack T2/T3/T7/T8/T9 onto
T1 — this corpus provides no evidence for them.

`approved-wine-018` was not worked on, per instruction, and remains a documented
engine limitation.
