# Preregistered risk register

| Risk | Pre-treatment mitigation |
| --- | --- |
| Otsu name without Otsu math | Pin the 256-bin histogram, between-class variance, lower-tie rule, binary boundary, and synthetic tests before OCR. |
| Hidden fixed fallback | Empty or uniform grayscale fails closed; no fixed threshold is substituted. |
| Sharp threshold semantics | The Otsu branch contains no Sharp `.threshold(...)` call; custom code emits the binary bytes. |
| More than one variable | Configuration isolation must report only `thresholdMethod`; CLAHE, sharpening, inversion, adaptive thresholding, and denoising remain off. |
| Small bounded corpus | Report Wilson intervals and limit the conclusion to this exact treatment on 11 governed regions. |
| Family duplication | Require gains in at least two distinct source checksum families; report the 8 visual independence families separately. |
| Slice imbalance | Preserve per-slice metrics; do not generalize from the single low-contrast, mixed-contrast, outline/shadow, or small-crop case. |
| Timing noise | Compare paired primary and repeat ratios; enforce 125% median and 135% p95 ceilings in both runs. |
| Visual-mechanism subjectivity | Retain all paired images, inspect them at full resolution, assign one enum, and separate visible evidence from transcript movement. |
| False certainty | Any false or wrong reliable read is an automatic `KILL`; authority thresholds remain unchanged. |
| Seller-truth leakage | Truth is joined only after OCR for scoring and is covered by the existing isolation test. |
| Production leakage | Otsu stays in `src/fixtures/ocr-research`, default-off; production imports and guarded extractor/PR #195 hashes are checked. |
| Post-output tuning | Algorithm, ordering, corpus, slices, thresholds, metrics, behavior-hash policy, and decision logic are frozen in `preregistration.md`. |

## Observed disposition

- The treatment recovered no Brand truth in raw OCR, candidate lists, top three,
  or normalized top one.
- One clean, high-contrast Dry Cellar region changed from non-empty control OCR
  to empty treatment OCR.
- False and wrong reliable reads remained zero.
- Primary and repeat control hashes matched the frozen baseline; primary and
  repeat treatment hashes matched each other.
- Treatment median latency was below control, but treatment p95 exceeded the
  135% ceiling in both final paired runs.
- Full-resolution review retained all 11 pairs and found visible thin-stroke
  loss/fragmentation, background removal without truth recovery,
  confidence-only movement, and one empty-OCR outcome.

The provisional deterministic disposition was `KILL`. A later encoded-artifact
audit found that the custom reconstruction also removed a fully opaque alpha
channel from 7 control-equivalent inputs. `gate-failure.md` therefore supersedes
the provisional disposition for publication: the run is not decision-grade and
does not justify production enablement, post-hoc threshold tuning, or a draft
PR.
