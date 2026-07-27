# Issue 90 VLM Audit Executive Summary

Audit date: 2026-07-27
Branch: codex/issue-90-vlm-audit
Base SHA audited before this artifact commit: 7a4d07a480b0e64440f0fc6d2574c17d1add1389

## Plain Answers

1. Is a VLM currently used in the seller package workflow?
   No. The seller package workflow stores seller-selected regions, OCR-derived machine observations, government-warning results, two-stream comparisons, readiness, and exports. It has no VLM or observer field in the production contracts.

2. Is a VLM currently used in `/api/package/analyze`?
   No. The route calls `extractLabelEvidenceDetailed(input)` directly for each panel. It does not import or invoke the vision observer lifecycle, local VLM adapter, observer proposal adapter, or local VLM configuration resolver.

3. Does VLM output currently alter OCR crops?
   No. Canonical observer proposals contain `ocrInspectionRegion` and `ocrHandoff`, but the only non-test consumer is the vision-region evaluation generation path. Production OCR crop planning is driven by extractor OCR recovery logic and seller-selected regions.

4. Does it alter candidate selection?
   No. Brand and alcohol selection are performed by extractor selection code from OCR passes. The local VLM code imports no production OCR modules or selection logic, and production selection imports no observer modules.

5. Does it alter findings?
   No. Package findings and readiness are computed from seller declarations, OCR observations, seller-region OCR readings, and government-warning rules. VLM text, reason codes, proposals, and raw responses are not finding inputs.

6. Is any VLM output persisted?
   No in production package records. Local VLM evaluation reports can be written under `.local-vlm/**`, and the vision-region benchmark writes public docs only when validated `real-local-vlm` provenance is available. Those are evaluation artifacts, not package persistence.

7. Is any VLM output visible in the UI?
   No. Package preparation and review UI contracts do not include VLM or observer fields.

8. Has a real model ever been executed through the committed governed harness?
   The committed code contains a governed real-model harness capable of executing `llama-server` when explicit local paths and digests are supplied. This audit found committed test fixtures and fake-server evidence, plus code paths for real-local-vlm reports, but no committed real response payloads or public governed benchmark report proving a real model execution already occurred in the repository.

9. What would have to change before the VLM could influence production?
   Production would need an explicit package-analysis hook, production configuration surface, model/provider availability, observer invocation, validated proposal-to-OCR crop creation, candidate generation integration, field selection integration, persisted provenance fields, UI/report rendering contracts, and fail-closed gates preserving OCR independence and human authority.

10. Should the current VLM code be kept, completed, isolated further, or removed?
   Keep it as evaluation-only code, but do not complete or activate production influence until Issue 90 gates are explicitly implemented and reviewed. The current isolation is effective for production, and the remaining dead/unreachable handoff should either be completed under explicit gates or documented as intentionally evaluation-only.

## Bottom Line

No VLM currently influences real Label Lens package analysis, OCR extraction, candidate selection, reliability state, finding, report, API response, persistence record, or UI output. The VLM implementation is an evaluation harness plus fake/test fixtures. Its real-model execution path is fail-closed on missing explicit local configuration and is not reachable from production routes.
