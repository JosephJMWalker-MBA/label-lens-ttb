# Clean-retry preregistered risk register

| Risk | Frozen mitigation |
| --- | --- |
| Invalid run leaks into decision | Clean output has a separate root; invalid metrics/hashes/classifications are excluded. |
| Alpha stripping or channel addition | Synthetic varied-alpha RGBA regression plus per-case primary/repeat raw-byte audits. |
| Metadata or dimensions drift | Exact non-`IDAT` PNG chunks and exposed Sharp metadata must match each control pair. |
| Otsu name without Otsu math | Pin the 256-bin histogram, between-class variance, lower-tie rule, boundary, and synthetic histograms. |
| Hidden fallback or parameter | Empty/uniform input fails closed; the selector has no parameter or fixed fallback. |
| Sharp threshold or conversion | Source guards forbid Sharp thresholding and channel-conversion calls in the Otsu branch. |
| More than thresholding changes | Configuration isolation must report only `thresholdMethod`; all other preprocessing is frozen. |
| Seller-truth leakage | Truth is joined after OCR; deterministic execution-input test rejects truth fields. |
| Production leakage | Evaluation module remains default-off; production hashes/import edges are checked. |
| PR #195 interference | Selector baseline hash and live PR state are recorded before and after; PR #195 is not edited. |
| Small corpus or family duplication | Report Wilson intervals; require gains across two checksum families; limit conclusion to 11 regions. |
| Timing noise | Require both primary/repeat median <= 1.25x and p95 <= 1.35x. |
| Post-output tuning | Function hashes, ordering, corpus, slices, criteria, and ceilings are frozen here. |

