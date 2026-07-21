# E1b specification

## Treatment boundary

- **Trigger:** whole-line candidate rejected specifically as `too-many-words`
  (single constant `TRIGGER_REASON` in `simulate.ts`).
- **Gate:** production's own prominence-eligibility expression, with
  `BRAND_SCORE_PROMINENCE_FLOOR_RATIO` and `BRAND_SCORE_PROMINENCE_BUFFER_PX`
  **read from the production source file at runtime**. The simulation throws if
  they cannot be parsed, so it can never silently diverge from production.
  Measured at run time: `ratio=0.4`, `buffer=1px`.
- **Spans:** contiguous 1–4 word windows of an eligible line, excluding the whole
  line. The width cap reuses production's `MAX_BRAND_WORDS`.
- **Everything downstream unchanged:** each span is analysed by the real
  `selectBrandObservation`, which applies the unmodified normalization, filter
  ladder, brand classification, scoring, ranking, prominence handling and
  authority assignment.

`maxProminence` is computed the way production computes it — the maximum
prominence over the **kept** candidates of that pass.

## Nothing changed

`BRAND_SCORE_PROMINENCE_FLOOR_RATIO` · positive-brand-signal rules · designator
vocabulary · possessive handling · producer/bottler rules · filtering · scores ·
ranking · evidence thresholds · authority states · OCR · reconstruction ·
fixtures · schemas · tests · UI.

No alternate threshold was tested. No threshold was tuned after seeing results.

## Sequencing actually followed

1. **Phase 1** ran `simulate.ts --absent-only` over the 10 governed brand-absent
   cases and nothing else.
2. The immediate kill condition fired. **Phase 2 was not run**, and no
   brand-present treatment arm was ever computed.
3. A separate `prominence-probe.ts` then recorded the eligibility decision for
   every `too-many-words` line corpus-wide. **It runs no treatment selection and
   never compares a treated value to truth**, so it yields no gain metric.

## Artifacts deliberately absent

`baseline.json`, `treatment.json`, `changed-cases.json` and
`candidate-volume.json` for the full corpus are **not** present, because Phase 2
was forbidden by the kill condition. Producing them would have required exactly
the present-case treatment metrics the brief said not to inspect. Their absence is
the intended outcome, not an omission.

Per-case treatment detail for the 10 brand-absent cases is in `cases-absent.json`
and `phase-1-absent-safety.json`; the generated-span filter tally for those cases
is in `filter-results-absent.json`.
