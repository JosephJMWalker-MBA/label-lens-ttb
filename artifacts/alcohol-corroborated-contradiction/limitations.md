# Limitations — what this research does not establish

## Evidence base

- **Exactly one true-positive case.** The trigger fires on `approved-wine-037`
  and on no other case in the 115-case corpus. A precision estimate cannot be
  built from a single positive, and "0 false alarms out of 68 correct cases" is a
  measurement of one corpus, not a demonstrated property.
- **No second naturally occurring example** of the primary-versus-re-read
  contradiction mechanism was found.
- **Corpus coverage is insufficient** to estimate either the trigger's precision
  or its false-ambiguity rate with any meaningful confidence interval.

## Independence of the two reads

- **Both reads use the same crop** — the union of the selected candidate's
  `sourceOriginalBoxes`, padded `0.6 × height`.
- **Both reads use the same preprocessing** — `3×` cubic resample,
  `.grayscale().normalise()`.
- **Both reads use the same Tesseract engine, the same OEM 1 LSTM mode, and the
  same vendored `eng` model.**
- **Only the page-segmentation mode differs** (PSM 8 single-word vs PSM 11 sparse
  text).
- **Shared crop or model errors can therefore produce false agreement.** Any
  error caused by the crop rectangle (clipping a glyph, admitting a neighbouring
  line), by the resample (closing a 1-pixel gap, erasing a low-contrast decimal
  point), or by the model (a systematically misread glyph in a given typeface)
  will be reproduced by *both* reads — which the trigger would then score as
  corroboration. The failure modes most likely to yield a confident wrong
  agreement are precisely the ones these two reads share.
- A genuinely more independent variant **was** tested and failed: agreement across
  a token-union crop and an independently derived full-width line band fired zero
  times, because the line band re-segments `13.0` as `| 3.0`. Stronger
  independence was measured and rejected on evidence, not assumed away.
- What suppresses false firing empirically is that PSM 8 and PSM 11 disagree with
  each other in 7 of the 36 cases where both produced a numeral. That is a real
  but **incidental** property, not a designed guarantee.

## Measurement of value

- **The evaluator does not distinguish contradicted `OBSERVED` evidence.**
  `classifyAlcohol` has no `AMBIGUOUS` branch for alcohol: a present truth with a
  detected-but-wrong value is `parser-failure` regardless of state, and
  `alcoholDetected` counts every state except `NOT_OBSERVED`. Implementing the
  trigger would leave detection recall, parsed accuracy, and the failure-class
  histogram **unchanged**. The corpus metric cannot currently reward, or even
  observe, the improvement this experiment was aiming at.
  (`classifyBrand` does have a `correct-uncertainty` path; alcohol does not. That
  asymmetry is pre-existing and was not touched.)

## Out of scope

- **`approved-wine-018` remains unresolved and was not addressed.** Its leading
  `1` is lost to glyph fusion across a 1-pixel gap; the only configuration that
  recovers `13.5` is a hand-tuned crop, and the generalisable crop reads `35`. The
  corroboration signal does not fire on it either, because its two re-reads
  disagree with each other (3.9 vs 35) — the agreement requirement suppresses a
  *correct* recovery there.
