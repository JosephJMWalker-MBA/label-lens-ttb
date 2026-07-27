# Issue 90 Dead Or Unreachable Findings

## Production-Unreachable VLM Paths

The following paths are production-unreachable today:

- `runVisionObserverLifecycle`
- `LlamaServerVisionObserverAdapter`
- `resolveLocalVlmConfig`
- `adaptObserverProposals`
- `CanonicalRegionProposal`
- `ocrInspectionRegion`
- `ocrHandoff`
- local VLM diagnostic harnesses
- fake observer adapters

They are reachable from evaluation scripts and tests, but not from `/api/package/analyze`, extractor production code, package persistence, reviewer UI, exports, or deployment configuration.

## Additive OCR Status

The observer adapter creates canonical OCR handoff metadata, but no production OCR crop creation step consumes it. The handoff is therefore a governed evaluation artifact and a prepared integration point, not an active additive OCR path.

## Removal Versus Isolation

This audit does not recommend removal as an immediate production safety measure because the code is already isolated from production. The unresolved engineering choice is whether Issue 90 should:

- complete the additive OCR integration behind explicit production gates and provenance fields; or
- keep the observer as evaluation-only and document the handoff as intentionally non-production.

Until that decision is made, production must not infer support, reliability, findings, or UI output from observer proposals.
