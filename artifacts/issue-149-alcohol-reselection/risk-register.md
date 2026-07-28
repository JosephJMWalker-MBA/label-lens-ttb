# Risk register

| Risk | Frozen control |
| --- | --- |
| Fabricating an effect after the no-op audit | Keep recovery triggers and corpus fixed; identical arms force `KILL`. |
| Truth leaks into OCR/selection | Selector seam accepts only primary selection, ordered pass trace, and arm. Truth is joined afterward. |
| Hidden OCR/preprocessing drift | Hash production files; record and compare per-pass plan and OCR trace hashes. |
| Brand or Warning collateral change | Hash both selections per case and require zero arm delta. |
| Latency noise | Record real end-to-end extraction timing, report median/p95 and repeat values, but never include timing in behavior hashes. |
| Confusing evidence state with reliability/authority | Record explicit nulls because the whole-image selector owns neither field. Use `OBSERVED` only as the preregistered reliable-read proxy. |
| Duplicate evidence inflates family count | Use exact committed source SHA-256 and exclude manifest duplicate records. |
| Unit fixture influences decision | Synthetic fixtures prove mechanics only; decision metrics use governed manifest cases. |
| Production import edge | Boundary test rejects production imports of the evaluation module. |
| PR #195 drift | Record and re-check its immutable head before publication. |
| Stochastic behavior | Canonical non-timing behavior hashes must match primary/repeat. |
| Unsupported rotated slice | Report `n=0`; do not manufacture or tune a case after the result. |
