# Orin vision reader: supervised measurement plan and record

- Status: **Not yet run on hardware.** No value in the record below is a measurement until it is filled in during a supervised session on the Jetson Orin.
- Target device: Jetson Orin Nano 8 GB, the owner's direction in #226.
- Gates: #90 decides whether any of this may affect production. Nothing here activates the reader.

## Already validated without hardware (2026-11-08)

These checks prove how the code behaves with a mocked or absent model. They are not evidence of model behaviour.

| Check | Result |
|---|---|
| Vision unit and contract tests (`src/server/vision`, analyze route, corpus-eval helpers) | 63 passed |
| No reader configured: analysis makes no vision request and keeps local OCR | Passed (route test) |
| Partial configuration: analysis refuses with `VISION_READER_MISCONFIGURED` | Passed (route test) |
| Host unreachable: every region falls back to local OCR, with the reason recorded | Passed (route test) |
| Public IP address as the endpoint: refused | Passed (config tests) |
| `npm run vision:check` and `npm run vision:eval` with no configuration | Both refuse with a clear message and change nothing |

## Integration status (for the #90 §6 decision)

When `LABEL_LENS_VISION_ENDPOINT`, `_API_KEY`, and `_MODEL` are all set, `/api/package/analyze` replaces the local OCR readings of seller-marked regions with model transcripts, and those transcripts feed the deterministic comparison. This is API integration. #90 §6 requires explicit maintainer authorization for that, after the evidence gates are accepted, and that authorization has not been given. Until it is:

- leave every `LABEL_LENS_VISION_*` setting unset on every deployment, including the public demo;
- run measurements against a local Label Lens instance on the same LAN as the Orin, using only the frozen public corpus and never customer artwork.

Options for that decision include a shadow mode, which records model readings beside local OCR without replacing them, or keeping replacement behind the authorization.

## Before the session

- The owner supervises the device setup.
- Pin the llama.cpp ref and download exactly two model candidates (see [README.md](README.md), steps 2–3).
- Decide what the session is evidence for. #90 §1 asks for its governed harness (`src/fixtures/eval/vision-observer/local-vlm`); `npm run vision:eval` is this branch's own corpus tool. Record which one produced each number.
- The governed harness starts `llama-server` itself on `127.0.0.1` and samples its memory with `ps`, so its numbers describe the Orin only when it runs on the Orin. Running `npm run vision:eval` from a laptop on the LAN measures transcription and latency, but it cannot observe the Orin's memory: capture that with `tegrastats` on the device.

## Record

### 1. Device and runtime

| Item | How to capture | Value |
|---|---|---|
| Module and memory | `cat /etc/nv_tegra_release`, `free -h` | |
| JetPack / L4T / CUDA | `/usr/local/cuda/bin/nvcc --version` | |
| Power mode | `sudo nvpmodel -q` | |
| llama.cpp ref | printed by `install-llama-server.sh` | |
| `llama-server` binary SHA-256 | `sha256sum /opt/llama.cpp/build/bin/llama-server` | |

### 2. Model

| Item | How to capture | Value |
|---|---|---|
| Repository and files | `fetch-model.sh` arguments | |
| GGUF and `mmproj` SHA-256 | printed by `fetch-model.sh` | |
| Quantization | file name and model card | |
| Licence | the licence named on the model card; confirm it permits this use before any demonstration | |
| Prompt version and SHA-256 | `report.json` provenance | |

### 3. Cold and warm behaviour

| Item | How to capture | Value |
|---|---|---|
| Cold start to ready | `sudo systemctl restart label-lens-vision`, then time until `curl -sf http://<orin>:8080/health` succeeds | |
| First request after cold start | the first case latency in `report.json` | |
| Warm latency p50 / p95 | later cases in `report.json` | |

### 4. Memory pressure and resource recovery

| Item | How to capture | Value |
|---|---|---|
| Peak memory during evaluation | `tegrastats --interval 1000 --logfile tegrastats.log` across the run | |
| Steady state after the run | `tegrastats` five minutes after the run | |
| Growth across three repeated runs | compare the three peaks; #90 §2 rejects monotonic growth | |
| Recovery after `kill -9` of `llama-server` | time until systemd restarts it and a request succeeds | |

### 5. Error handling, observed live

| Scenario | Expected | Observed |
|---|---|---|
| Service stopped during an analysis | Regions fall back to local OCR with `HOST_UNAVAILABLE` or `CONNECT_FAILED` | |
| `LABEL_LENS_VISION_TIMEOUT_MS=500` | Regions fall back with a timeout reason | |
| Schema-invalid replies | Rejected, and local OCR kept | |
| One setting removed | Analysis refuses with `VISION_READER_MISCONFIGURED` | |

### 6. Corpus results (`npm run vision:eval`)

| Measure | Tesseract reference | Candidate A | Candidate B |
|---|---|---|---|
| Whole-label brand present in transcript (115 cases) | | | |
| Whole-label alcohol present in transcript | | | |
| Alcohol false positives on labels without one | | | |
| Bounded brand `reliableButWrong` (10 regions; must be 0) | | | |
| Error and timeout rate | | | |

### 7. Decision record

- Which #90 gates this evidence addresses, and which remain open.
- Which candidate, if any, the numbers favour, and why.
- No production activation follows from this record (#90 §6).
