# E3 limitations

- **Measurement only, one corpus, one engine.** 24 cases from a single governed
  115-case corpus, tesseract.js OEM 1 with the vendored `eng` model. Nothing
  generalises beyond it.
- **Small denominators.** `BOUNDED_NEAR_MISS` n = 2. No inference about near-miss
  characteristics (confidence band, brand length) is supportable from two cases;
  the counts are reported, the patterns are not claimed.
- **The 24 are defined by the previous round's attribution.** They are the cases
  the evidence-path diagnosis assigned `OCR_RECOGNITION_MISS` as the *first* stage
  of loss, which relies on a normalized-substring containment test. A brand
  garbled beyond that test counts as "not in OCR" — so this class already mixes
  true non-recognition with severe misrecognition by construction. E3 measures
  that mixture; it does not re-derive the class boundary.
- **The generic-token list is pre-registered, not principled.** Eight tokens were
  fixed in advance. `sweet` is not on it and `wine` is, and both choices changed
  exactly one classification each. Neither list membership was tuned after seeing
  results, but neither is derived from anything beyond judgment.
- **The span window is anchored on the expected token count.** Measured
  sensitivity: it excluded a closer span in 1 of 24 cases and changed no category
  — but where OCR merges or splits words unusually, the window can miss the best
  evidence in principle.
- **`failureShape` is inferred, not observed.** "truncation", "segmentation",
  "recognition", "complete omission" are derived from coverage and distance
  heuristics, not from anything the pipeline reports. Treat them as descriptive
  grouping, not measurement.
- **Coverage uses the whole OCR text, spans use reconstructed lines.** Rule A and
  rule B test against the concatenated normalized OCR of the brand-eligible
  passes, while the edit distance uses line-derived spans. A fragment could
  therefore satisfy rule B while sitting in text no single span covers.
- **`relevantOcrLines` is truncated to 6 per case** to keep the artifact small.
  Full line inventories are not preserved; `allOcrLineCount` records how many
  existed.
- **Only the first acceptable truth string is used** for distance and coverage
  when a fixture lists several. Rule A tokens likewise come from that first
  string.
- **Three classifications are genuinely judgment-dependent** and are referred, not
  resolved (`borderline-review.md`). They are counted in the headline under the
  algorithmic rules as written.
- **`cases.json` is written twice.** `probe.ts` emits it and `classify.mjs`
  augments it with `humanReviewReasons`. Determinism was verified probe-run
  against probe-run (byte-identical); a naive comparison taken after `classify.mjs`
  has run will differ by that single added field and nothing else.
- **No latency, no production impact, and no proposal is validated here.** This
  round establishes which research family is worth opening, nothing more.
