# Strict Local VLM Adapter

## Scope

This document defines the evaluation-only Slice 2 adapter for a strictly isolated local multimodal observer backed by `llama.cpp` `llama-server`.

One model process handles one artwork observation. No prior observation, expected value, OCR result, human correction, or regulatory context enters that process.

Passing Slice 2 does not demonstrate useful region proposals or improved OCR. It demonstrates only the tested local runtime's isolation, lifecycle, schema, and resource behavior.

## Why `llama.cpp`

`llama.cpp` is the first local adapter because it exposes a self-hosted server process that can be owned, started, polled, terminated, and measured as an isolated child process without changing production OCR or application APIs.

This slice does not claim broad model compatibility from one successful local model.

## Local dependencies

The repository does not download or build `llama.cpp`, models, or projector files.

Local execution requires explicit digest-pinned configuration:

- `LLAMA_SERVER_BIN`
- `LLAMA_SERVER_SHA256`
- `VLM_MODEL_PATH`
- `VLM_MODEL_SHA256`
- `VLM_MMPROJ_PATH` and `VLM_MMPROJ_SHA256` when the selected model/runtime requires a separate projector

Only loopback hosts are accepted.

## Strict isolation architecture

Slice 2 implements one mode only:

- one new local model server process per observation run

Each observation run:

1. creates an isolated workspace through the accepted Slice 1 lifecycle;
2. allocates a loopback port;
3. spawns one `llama-server` child process without an interactive shell;
4. polls a bounded readiness endpoint before sending the request;
5. sends exactly one observation request containing only the fixed prompt and the gridded derivative;
6. validates and parses at most one JSON object;
7. terminates the owned process;
8. confirms exit and port release;
9. removes the workspace;
10. preserves only governed observations and telemetry.

Warm server mode, persistent sessions, OCR handoff execution, and governed usefulness benchmarking remain deferred.

## Process ownership

The adapter records:

- `pid`
- `processGroupId` where supported
- `port`
- `spawnedAt`
- `readyAt`
- `requestStartedAt`
- `requestCompletedAt`
- `terminationRequestedAt`
- `exitedAt`
- `exitCode`
- `exitSignal`
- `forcedTermination`
- bounded `stdoutBytes`
- bounded `stderrBytes`

Graceful termination escalates to forceful termination after a bounded timeout. Cleanup is not marked complete until the process exits and the port is released.

## Readiness

Readiness uses bounded polling against `llama-server`'s local health endpoint. The adapter records readiness attempts, the first successful readiness time, total startup latency, the last readiness error, exit-before-ready, and startup timeout.

Arbitrary sleep is not the sole readiness mechanism.

## Request and schema contract

The request contains:

- the fixed Slice 2 observer prompt;
- the current gridded observer image;
- the current `observationRunId`;
- JSON output constraints.

The request does not contain:

- OCR results;
- expected brand or alcohol values;
- prior outputs;
- previous images;
- regulatory text;
- seller identity;
- conversation history.

The response parser accepts only:

- one exact JSON object; or
- one enclosing Markdown JSON fence.

It rejects:

- leading or trailing prose;
- malformed JSON;
- duplicate proposal IDs;
- proposal counts above the configured budget;
- unknown or prohibited fields;
- prohibited authority or compliance language;
- invalid grid coordinates.

## Prompt

Prompt provenance is fixed and versioned:

- `promptId: slice2-strict-local-vlm-observer`
- `promptVersion: 1.0.0`
- `promptSha256`: computed from the immutable prompt text

The prompt instructs the observer to stay field-agnostic, avoid transcription, avoid compliance language, and return only JSON.

## Timeout and abort handling

The accepted Slice 1 `AbortSignal` contract remains authoritative.

On timeout or cancellation the adapter:

1. aborts the HTTP request;
2. stops accepting output;
3. requests process termination;
4. escalates to forceful termination if needed;
5. waits for exit;
6. checks port release;
7. returns control to the lifecycle for workspace cleanup.

## Resource telemetry

Slice 2 measures bounded local telemetry only:

- process RSS where observable;
- process-tree RSS where observable;
- workspace bytes before start, at peak, before cleanup, and after cleanup;
- file counts;
- timing for startup, readiness, request, parsing, termination, and total wall time;
- forced termination, cleanup failures, schema failures, and prohibited-output failures.

GPU telemetry is optional and disabled by default. Missing GPU telemetry is reported as unavailable, not zero.

## Synthetic canaries

Contamination tests use deterministic synthetic fixtures with visible non-regulatory canaries such as:

- `ALPHA ORCHID`
- `BETA COMET`
- `GAMMA HARBOR`

These fixtures exist only to detect forbidden context leakage between isolated runs.

## Decision boundaries

Slice 2 decisions are conservative:

- `STATELESS OBSERVER BOUNDARY SUPPORTED`
- `CONTEXT CONTAMINATION DETECTED`
- `RESOURCE LIFECYCLE BOUNDED`
- `RESOURCE LIFECYCLE NOT BOUNDED`
- `MIXED RESULT`
- `INSUFFICIENT EVIDENCE`

These decisions are local runtime findings, not universal proof and not production readiness claims.

## Deferred work

Deferred beyond Slice 2:

- governed visual-quality benchmarking;
- OCR execution from observer regions;
- warm server mode;
- server reuse;
- production integration.
