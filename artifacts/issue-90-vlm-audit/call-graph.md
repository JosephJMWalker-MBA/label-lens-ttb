# Issue 90 VLM Call Graph

## Production Package Analysis

```text
POST /api/package/analyze
  -> parse SellerPackageDraft and uploaded panel files
  -> getExecutableProvenance()
  -> extractLabelEvidenceDetailed(input)
       -> verify derivative hash and image dimensions
       -> createLocalOcrEngine()
       -> planPrimaryOcrPass()
       -> runOcrPass()
       -> planRecoveryOcrPasses()
       -> runOcrPass() for recovery passes
       -> planSellerRegionOcrPass() for seller-selected regions
       -> selectBrandObservation()
       -> selectAlcoholObservation()
       -> build AnalyzerEvidenceResponse
  -> selectGovernmentWarningObservation()
  -> createAnalysisRun()
  -> return PackageAnalysisRun
```

No call in this graph imports `vision-observer`, `local-vlm`, `LlamaServerVisionObserverAdapter`, `runVisionObserverLifecycle`, `CanonicalRegionProposal`, `ocrInspectionRegion`, or `ocrHandoff`.

## Evaluation Vision Observer

```text
npm run eval:vision-region-benchmark
  -> scripts/eval/run-vision-region-benchmark.ts
  -> runVisionRegionBenchmark()
  -> resolveLocalVlmConfig(process.env)
       -> fail closed with MISSING_CONFIG if required local variables are absent
  -> if config resolved:
       -> LlamaServerVisionObserverAdapter(config)
       -> runVisionObserverLifecycle()
            -> createObserverDerivative()
            -> adapter.observe()
                 -> spawn owned llama-server process
                 -> send local chat/completions request
                 -> parse and validate observer JSON
                 -> terminate process and record telemetry
            -> adaptObserverProposals()
                 -> map grid cells to original-image regions
                 -> build CanonicalRegionProposal and ocrHandoff
                 -> guard original-source handoff, reject overlay handoff
       -> write .local-vlm/vision-region-benchmark reports
       -> write docs/vision-region-benchmark only if validated real-local-vlm evidence exists
```

This graph is not called by the package analysis route, extractor, package persistence, package review UI, exports, or deployment code.

## Local VLM Diagnostics

```text
npm run eval:local-vlm-*
  -> scripts/eval/run-local-vlm-*.ts
  -> resolveLocalVlmConfig(process.env)
       -> skip/fail closed when local configuration is absent
  -> local diagnostic harness
       -> local VLM adapter/client/process
       -> diagnostic report under .local-vlm/**
```

Diagnostic reports are local evaluation outputs. They do not write package analysis records and are not UI inputs.
