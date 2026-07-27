# Issue 90 VLM Runtime Config Audit

## Required For Local VLM Execution

The local VLM resolver requires all of these before it will build a launch spec:

- `LLAMA_SERVER_BIN`
- `LLAMA_SERVER_SHA256`
- `VLM_RUNTIME_KIND`
- `VLM_MODEL_PATH`
- `VLM_MODEL_SHA256`

If any required value is absent, `resolveLocalVlmConfig({})` returns `MISSING_CONFIG`. The issue-specific audit test covers that fail-closed behavior.

## Optional Local Evaluation Variables

- `VLM_MMPROJ_PATH`
- `VLM_MMPROJ_SHA256`
- `VLM_HOST`
- `VLM_STARTUP_TIMEOUT_MS`
- `VLM_REQUEST_TIMEOUT_MS`
- `VLM_TERMINATION_TIMEOUT_MS`
- `VLM_MAX_IMAGE_BYTES`
- `VLM_MAX_OUTPUT_TOKENS`
- `VLM_CONTEXT_SIZE`
- `VLM_GPU_LAYERS`
- `VLM_THREADS`

`VLM_MMPROJ_PATH` and `VLM_MMPROJ_SHA256` must be supplied together or omitted together. Numeric values are parsed as positive or non-negative integers depending on field.

## Defaults And Limits

- Host: `127.0.0.1`
- Startup timeout: 20000 ms
- Request timeout: 30000 ms
- Termination timeout: 5000 ms
- Max image bytes: 6000000
- Max output tokens: 900
- Context size: 4096
- Response byte limit: 24000
- Stdout/stderr byte limits: 64000 each
- Resource sample interval: 250 ms
- Max proposals per image: 12
- Max reason codes per proposal: 9
- Max proposal description length: 160
- Seed: 17
- Temperature: 0

## Network And Deployment Assumptions

The configured host must be loopback (`127.*` or `::1`). The adapter owns a local `llama-server` process and communicates with local `/health` and `/v1/chat/completions` endpoints. This is incompatible with a typical deployed serverless package-analysis route unless a new production service, deployment configuration, and explicit route hook are added.

## Production Route Capability

No production package route currently calls `resolveLocalVlmConfig`, starts `llama-server`, calls the local VLM client, or exposes an observer-enabled flag. With current code, production/staging has no package route capable of invoking a real VLM.

## Fail-Open / Fail-Closed

The local VLM evaluation path is fail-closed on absent config. The production package path has no VLM branch at all, so there is no fail-open path that silently substitutes VLM output into OCR, selection, findings, persistence, or UI.
