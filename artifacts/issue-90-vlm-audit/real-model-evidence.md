# Issue 90 Real-Model Evidence Audit

## Evidence Found

The repository contains a governed real-local-vlm harness:

- `src/fixtures/eval/vision-observer/local-vlm/llama-server-config.ts`
- `src/fixtures/eval/vision-observer/local-vlm/llama-server-adapter.ts`
- `src/fixtures/eval/vision-region-benchmark.generation.ts`
- `scripts/eval/run-vision-region-benchmark.ts`
- `scripts/eval/run-local-vlm-*.ts`

The harness records model/runtime digests, prompt digests, raw response digests, process/resource telemetry, and contamination/resource diagnostics when explicitly configured.

## Evidence Not Found

This audit did not find committed real response payloads, committed model execution logs, committed screenshots, or a committed public `docs/vision-region-benchmark` report proving that a real model has already executed through the governed harness.

The benchmark runner writes public governed reports only when `shouldWritePublicVisionRegionReport(report)` is true. Otherwise it prints:

```text
SKIP: public governed report not written because validated real-local-vlm evidence is unavailable.
```

## Evidence Classification

| Evidence type | Classification | Reason |
| --- | --- | --- |
| Fake observer adapter and fake llama server tests | TEST_FAKE_ONLY | They exercise the boundary and parser without proving real model behavior. |
| Fixture-generated benchmark report examples in tests | TEST_FAKE_ONLY | They are constructed in tests and include fake-server cases. |
| Local `.local-vlm/**` outputs | EVALUATION_ONLY | They are generated locally and are not package persistence. No committed real payloads were found by this audit. |
| `real-local-vlm` schema and report fields | EVALUATION_ONLY | They govern real evidence when supplied, but do not prove a real execution by themselves. |
| Prior artifact mentions of local VLM | DOCUMENTATION_ONLY | They state the VLM material is evaluation-only. |

## Conclusion

The code can execute a real local VLM in governed evaluation mode, but the committed repository does not currently contain a real-model execution record that changes the production answer. No fake-server or fixture evidence should be cited as proof of real-model production influence.
