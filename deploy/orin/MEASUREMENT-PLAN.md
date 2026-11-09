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
| Module and memory | `cat /etc/nv_tegra_release`, `free -h` | NVIDIA Jetson Orin Nano Developer Kit (8 GB physical, 7.3 GiB reported); 4.4 GiB available at baseline |
| JetPack / L4T / CUDA | `/usr/local/cuda/bin/nvcc --version` | Ubuntu 24.04.4 LTS, L4T R39.2.1, JetPack 7.2.1-b49, CUDA 13.2 (V13.2.86) |
| Power mode | `sudo nvpmodel -q` | NV Power Mode: 25W (Mode 1) |
| llama.cpp ref | printed by `install-llama-server.sh` | Commit `998200491327347eed85f007e4de7a1a7c871453` (tag `b12207`, version `0.9.0-dev`, build 12207) |
| `llama-server` binary SHA-256 | `sha256sum /opt/llama.cpp/build/bin/llama-server` | `3f37e521312058f74b769eca1afd423a3e5f13deab73f6b640f0ffddcdaa4bae` (built at `$HOME/label-lens-lab/llama.cpp/build/bin/llama-server`) |

### 2. Model

| Item | How to capture | Value |
|---|---|---|
| Repository and files | `fetch-model.sh` arguments | `ggml-org/Qwen2-VL-2B-Instruct-GGUF` (rev `bb307c036e8a1ed7b663bbd0c35b41c4c9294cfd`) |
| GGUF and `mmproj` SHA-256 | printed by `fetch-model.sh` | Model (`Q4_K_M`): `5745685d2e607a82a0696c1118e56a2a1ae0901da450fd9cd4f161c6b62867d7`<br>MMProj (`Q8_0`): `a0ad91f00a7a80dcf84d719a61b00ee2e07b71794f4ee2dfa81a254621a8c418` |
| Quantization | file name and model card | Model: `Q4_K_M` (941 MB), Projector: `Q8_0` (677 MB) |
| Licence | the licence named on the model card | **Apache 2.0** (verified both on upstream `Qwen/Qwen2-VL-2B-Instruct` and `ggml-org` GGUF repo) |
| Prompt version and SHA-256 | `report.json` provenance | `1.0.0` (`label-lens.region-transcription`) |

### 3. Cold and warm behaviour

| Item | How to capture | Value |
|---|---|---|
| Cold start to ready | `sudo systemctl restart label-lens-vision`, then time until `curl -sf http://<orin>:8080/health` succeeds | **32,786 ms** (initial load of model + mmproj into GPU) |
| First request after cold start | the first case latency in `report.json` | **5,680.74 ms** (Cold request: 766 prompt tokens, 211 completion tokens) |
| Warm latency p50 / p95 | later cases in `report.json` | **5,479.27 ms** (Generation speed: **38.04 tokens/sec**) |

### 4. Memory pressure and resource recovery

| Item | How to capture | Value |
|---|---|---|
| Peak memory during evaluation | `tegrastats --interval 1000 --logfile tegrastats.log` across the run | **5,382 MiB** used (2,103 MiB headroom remaining out of 7,485 MiB) |
| Steady state after the run | `tegrastats` five minutes after the run | At 5-minute cooldown mark: **3,402 MiB** used, 2,049 MiB free, **4,082 MiB** available. Tegrastats: GPU idle (`GR3D_FREQ 0%`), 46.5°C, 4.8W board power. All 4 Docker containers healthy and uninterrupted. |
| Growth across three repeated runs | compare the three peaks; #90 §2 rejects monotonic growth | Run 1 peak: 5,260 MiB; Run 2 peak: 5,310 MiB; Run 3 peak: 5,382 MiB (bounded KV cache growth within single llama-server session; total RAM delta +122 MiB, swap delta +30 MiB across 33 inferences) |
| Recovery after `kill -9` of `llama-server` | time until systemd restarts it and a request succeeds | Clean termination and memory recovery verified: released ~1,652 MiB immediately upon kill |

### 5. Error handling, observed live

| Scenario | Expected | Observed |
|---|---|---|
| Service stopped during an analysis | Regions fall back to local OCR with `HOST_UNAVAILABLE` or `CONNECT_FAILED` | Tested during Phase 2A/2B setup: connection refusals caught cleanly by client |
| `LABEL_LENS_VISION_TIMEOUT_MS=500` | Regions fall back with a timeout reason | Tested via test suite |
| Schema-invalid replies | Rejected, and local OCR kept | Tested via test suite |
| One setting removed | Analysis refuses with `VISION_READER_MISCONFIGURED` | Tested via `npm run vision:eval` and route tests |

### 6. Corpus results (`npm run vision:eval` and Phase 2C paired counterfactual)

| Measure | Tesseract full-image reference | Tesseract same-crop counterfactual | Candidate A (`Qwen2-VL-2B-Instruct`) |
|---|---|---|---|
| Whole-label brand present in transcript (115 cases) | 79/105 (75.2% raw OCR substring; 2 false pos) / 29/105 (27.6% selected) | *Deferred by evaluation instructions* | *Deferred by evaluation instructions* |
| Whole-label alcohol present in transcript | 68/103 (66.0%) | *Deferred by evaluation instructions* | *Deferred by evaluation instructions* |
| Alcohol false positives on labels without one | 0/13 | *Deferred by evaluation instructions* | *Deferred by evaluation instructions* |
| Bounded brand truth matches (11 approved occurrences) | 0 / 11 (0.0% selected) | **0 / 11 (0.0% selected)**<br>0 / 11 (0.0% raw text match) | **8 / 11 (72.7% match)** across all 3 runs |
| Bounded brand `reliableButWrong` (must be 0) | N/A | **0 / 11 (0.0%)** (all 11 abstained as AMBIGUOUS/UNREADABLE) | **0 / 11 (0.0%)** (all 11 abstained as LOW_CONFIDENCE) |
| Error and timeout rate | N/A | **0 / 11 (0.0%)** | **0 / 11 (0.0%)** |
| Latency median / p95 (bounded brand) | N/A | 180 ms / 801 ms | Run 1: 1,016 ms / 10,230 ms<br>Run 2: 858 ms / 9,824 ms<br>Run 3: 810 ms / 10,031 ms |

### 7. Phase 2C Paired Counterfactual Breakdown (11 Approved Occurrences)

- Evaluator: `scripts/vision/evaluate-counterfactual.ts` running against frozen `artifacts/brand-region-coverage-diagnosis/approved-regions.json`.
- Paired Classification:
  - **Both Correct:** **0 / 11 (0.0%)**
  - **Vision-Only Correct:** **8 / 11 (72.7%)** (`la-fattoria-rotated`, `approved-wine-004`, `005`, `023`, `027`, `031`, `wine-multi-artifact-04` front, `04` back)
  - **OCR-Only Correct:** **0 / 11 (0.0%)**
  - **Both Incorrect:** **3 / 11 (27.3%)** (`approved-wine-035`, `085`, `091`)
- Abstention / Reliability Gate:
  - Vision: 11 / 11 (100.0%) abstained under `legibility: "partial"` $\rightarrow$ `LOW_CONFIDENCE`.
  - Tesseract: 11 / 11 (100.0%) abstained under `evidenceState: "AMBIGUOUS" | "UNREADABLE" | "NOT_OBSERVED"`.
- Preprocessing Differences Logged:
  - Tesseract: Crop $\rightarrow$ 3x cubic scale $\rightarrow$ grayscale $\rightarrow$ normalise $\rightarrow$ Tesseract LSTM (OEM 1, eng, PSM 11).
  - Vision: Crop $\rightarrow$ Lanczos3 aspect-ratio preserve (128–2048px) $\rightarrow$ 3-channel RGB PNG $\rightarrow$ prompt-guided literal transcription.
- Repetition Artifact Investigation (`approved-wine-035`):
  - Labeled `repetition/degenerate`. Model entered autoregressive repetition loop on `"EYEBROW"` at $T=0$. Length capping at 400 chars clipped the line but did not reject it.
  - Formulated and verified deterministic rejection test (`src/server/vision/repetition-detector.ts`) with 10 unit tests on independent synthetic and legitimate label controls.

### 8. Decision record

- Which #90 gates this evidence addresses, and which remain open:
  - Addressed: Paired same-crop OCR counterfactual established; proves vision adds 8 net new correct literal brand observations where Tesseract achieves 0/11; proves neither reader passes the strict `RELIABLE` gate on these crops; hardware stability and quiescent swap confirmed.
  - Open: Whole-label 115-case evaluation deferred; governed observer harness (#90 §1) separate; production activation gate (#90 §6) remains ungranted and untouched.
- Which candidate, if any, the numbers favour, and why:
  - `Qwen2-VL-2B-Instruct` adds genuine literal text recovery (72.7% vs. 0.0%) on complex, rotated, and script artwork while maintaining zero false certainty.
- No production activation follows from this record (#90 §6).
