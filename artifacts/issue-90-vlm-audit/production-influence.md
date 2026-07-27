# Issue 90 Production Influence Audit

## Deterministic Answer

The VLM currently has no production influence.

| Surface | VLM influence | Evidence |
| --- | --- | --- |
| OCR passes executed | No | `ExtractionInput` contains bytes, provenance, OCR engine identity, parser identity, seller-region targets, and diagnostics. It contains no observer input. |
| Regions searched | No | Production region searches are extractor recovery passes and seller-selected regions. Canonical observer proposal fields are not consumed outside evaluation. |
| Candidate lists | No | Candidate generation comes from OCR pass words and parser/selection code. Observer outputs are not candidate inputs. |
| Selected Brand | No | Brand selection is OCR-based and has no observer import or proposal field. |
| Selected Alcohol | No | Alcohol selection is OCR-based and has no observer import or proposal field. |
| Government Warning result | No | Government warning selection reads extractor OCR pass output, not VLM text. |
| Reliability states | No | Seller-region reliability is computed from seller-region OCR readings, not observer proposals. |
| Comparison outcomes | No | Two-stream comparisons use seller declarations, seller-region OCR readings, and machine-discovered OCR readings. |
| API payload | No | `/api/package/analyze` returns `PackageAnalysisRun` without VLM fields. |
| Persisted analysis | No | `SellerPackageDraft.analysisRuns` has no VLM fields. |
| Reviewer UI data | No | Package preparation/review UI contracts contain no VLM fields. |

## Requested Scenarios

A. Observer functionality disabled:
There is no production observer functionality to disable. The package route always calls the OCR extractor directly.

B. Observer functionality configured but unavailable:
There is no production configuration surface for observer functionality. The local evaluation resolver fails closed with `MISSING_CONFIG` when required config is absent.

C. Fake observer returns regions:
Fake observer implementations are confined to `src/fixtures/eval/**` and tests. No production file consumes `FakeVisionObserverAdapter`, `CanonicalRegionProposal`, `ocrHandoff`, or `ocrInspectionRegion`.

D. Real observer configuration absent:
Real observer configuration absence prevents local evaluation scripts from running a model and causes skips or fail-closed config errors. It does not affect package analysis output because package analysis never reads those variables.

## Audit-Supporting Test

`src/fixtures/eval/issue-90-vlm-audit.test.ts` proves:

- package analysis and persistence/UI contracts are free of observer inputs and outputs;
- `/api/package/analyze` routes directly through the OCR extractor with no observer hook;
- canonical observer proposals are not consumed by production OCR or selection code;
- fake observers stay under evaluation fixtures;
- local VLM configuration is fail-closed when absent;
- VLM text fields cannot become package findings or export contract fields directly.
