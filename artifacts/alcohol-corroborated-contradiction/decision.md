# Decision — corroborated OCR contradiction

Branch `experiment/alcohol-corroborated-contradiction`, base `9ecd7b2`
(`git-sha.txt`). Research result only.

## Production treatment: **KILLED for now — deferred, not refuted**

No production code, schema, extractor, OCR flow, or observation state was
modified. Nothing was implemented. The hypothesis was not shown to be false; it
was shown to be **insufficiently evidenced to ship**.

## What is established

- **`approved-wine-037` is a confirmed OCR engine limitation.** The artwork reads
  `Alcohol 13.0 % by volume`; the primary full-image pass reads `19.0` at token
  confidences 79–96 and asserts it as `OBSERVED`. The wrong digit is in the OCR
  output itself — line grouping, window construction, canonicalization and the
  parser are all innocent.
- **Bounded re-reading can expose a contradictory numeral.** Two bounded re-reads
  of the accepted candidate's own pixels both recover `13.0`, with an explicit
  decimal separator and without implicit-decimal recovery. The contradiction is
  real and measurable.
- **Current evidence is insufficient to establish a production-safe corroboration
  mechanism.** One true positive across 115 cases, no second naturally occurring
  example, and two re-reads that share crop, padding, scale, preprocessing,
  engine build, LSTM mode and language model. Agreement between them is therefore
  not independent corroboration in the sense the trigger's name claims.

## Standing constraints reaffirmed

- **No machine-selected value should be replaced.** `19.0` is not rewritten to
  `13.0`. A value-replacing re-read was already measured and killed: it fixes one
  case and breaks 14–28 currently-correct ones through decimal loss.
- **`LOW_CONFIDENCE` is not an honest substitute.** It describes weakly-resolved
  evidence. `approved-wine-037`'s selected tokens score 79–96. Demoting a
  high-confidence *contradicted* reading into the low-confidence bucket would
  conflate two different failures and mislead every downstream consumer.
- **Ranking metadata must not be fabricated.** `AnalyzerAlternate.ranking` is
  required and its `strategy` enum asserts a candidate-ranking process. A re-read
  was never ranked. Populating that field to satisfy the validator would be a
  false provenance claim, and was rejected.
- **The proposed schema extension remains a design candidate, not an approved
  contract.** The three-part sketch in `specification.md` §2 — a
  `corroborated_ocr_contradiction` ambiguity reason, an optional `rawText` on
  `AnalyzerAlternate`, and relaxing `ranking` to optional — is recorded for a
  future round. It is **not** approved, **not** implemented, and must not be
  treated as settled by any later work that finds this file.

## Why the state question stays open

`AMBIGUOUS` cannot represent the finding honestly today: there is no ambiguity
reason for it, an alternate has nowhere to carry its own raw OCR text, and
`ranking` is required. `NOT_OBSERVED` contradicts the repository's own definition
(a complete statement *was* extracted). Diagnostics-only leaves the certainty
asserted. That leaves no honest state — which is itself part of the reason to
defer rather than force a fit.

## Related, unchanged

`approved-wine-018` (leading `1` dropped) was **not** worked on and remains an
unresolved engine limitation. See `limitations.md`.
