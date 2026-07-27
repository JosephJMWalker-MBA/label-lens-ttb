# Risk register

## Decision risks

| Risk | Evidence in this run | Mitigation or disposition |
| --- | --- | --- |
| Small bounded corpus | 11 regions from 10 checksum families and 8 independent visual families; a 0/11 rate still has a 95% Wilson upper bound of 25.9%. | Treat `KILL` as a result for this exact fixed treatment on this governed corpus, not a universal claim about every CLAHE configuration. No parameter sweep is permitted. |
| Family duplication | Three La Fattoria regions share one visual family; two Dry Cellar regions share one source checksum and visual family. | Success required gains across at least two checksum and two independent visual families. No region improved, so duplication cannot create the negative decision. |
| Slice imbalance | The corpus has only 1 low-contrast, 1 mixed-contrast, 1 outline/shadow, 1 small-crop, 2 rotated/unknown, and 3 textured-background regions. | Preserve per-slice metrics and do not infer broad slice performance. The treatment also failed the corpus-wide gain and latency gates. |
| Timing noise | OCR timing varies between processes and cases. | Compare paired aggregate ratios in both primary and repeat runs. Both runs exceeded the preregistered median and p95 ceilings. |
| Visual-mechanism subjectivity | Mechanism names require human inspection of paired images. | Retain all 11 full-resolution paired preprocessed artifacts, assign exactly one primary enum, and separate visible pair evidence from OCR metric movement. |
| Overstating causation | Transcript changes alone do not identify a mechanism. | Mechanism evidence names directly visible treatment-pair artifacts only. The decision is based on preregistered outcome and safety metrics. |
| False certainty | A treatment could improve a transcript while incorrectly becoming reliable. | False reliable reads and wrong reliable reads remained 0 in primary and repeat. Authority and reliability thresholds were unchanged. |
| Production leakage | Evaluation support could accidentally affect production OCR or PR #195. | The treatment is schema-gated, default-off, has no production import edge, and guarded production/PR #195 hashes are asserted in tests and the runner. |
| Seller-truth leakage | Expected Brand values could influence OCR execution. | Truth is joined only after OCR for scoring; the runner records `sellerTruthPassedToOcr: false`, and isolation is covered by tests. |

## Residual interpretation

The result is `KILL` for the exact installed-Sharp invocation
`clahe({ width: 3, height: 3, maxSlope: 3 })` after grayscale/global
normalization in the fixed 3× evaluation pipeline. It does not justify enabling
CLAHE in production, tuning these parameters after inspection, or generalizing
to a different contrast algorithm.
