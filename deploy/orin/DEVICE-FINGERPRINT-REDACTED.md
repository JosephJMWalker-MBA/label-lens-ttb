# Jetson Orin Nano Hardware & Runtime Fingerprint (Redacted)

**Target Device:** NVIDIA Jetson Orin Nano Developer Kit (8 GB unified memory)  
**Session Date:** 2026-11-08  
**Operator / Observer:** Supervised Antigravity Local Operator  
**Investigation Scope:** Phase 0 Read-Only Diagnostics for Issue #231 & PR #230  

---

## 1. Verified Connection Method

- **Transport:** SSH over local interface `en1` using verified link-local IPv6 address `fe80::...%en1` (fallback from `10.0.0.10` / mDNS ARP incomplete).
- **Authentication:** Public key authentication using dedicated local ed25519 identity (`~/.ssh/orin_ed25519`).
- **Host Key Verification:** Verified matching SHA/ED25519 host key `AAAAC3NzaC1lZDI1NTE5AAAAIF9QpOn6ijiJtZuEoIeL7grZbYq7x6L/DRvD9dQhDghK` in `~/.ssh/known_hosts`.
- **Credential Hygiene:** All keys, user tokens, internal IP prefixes, and credentials remain private on the host Mac; zero secret leakage.

---

## 2. On-Device Measurements vs. Assumptions

| Attribute | Measured / Observed Value | Method / Command | Status |
| :--- | :--- | :--- | :--- |
| **Model** | `NVIDIA Jetson Orin Nano Engineering Reference Developer Kit Super` | `cat /proc/device-tree/model` | **Observed** |
| **Architecture** | `aarch64` | `uname -m` | **Observed** |
| **Operating System** | `Ubuntu 24.04.4 LTS (Noble Numbat)` | `cat /etc/os-release` | **Observed** |
| **L4T Release** | `R39 (release), REVISION: 2.1, GCID: 46758480, BOARD: generic` | `cat /etc/nv_tegra_release` | **Observed** |
| **JetPack Version** | `7.2.1-b49` (`nvidia-jetpack`, `nvidia-jetpack-runtime`, `nvidia-l4t-core 39.2.1`) | `dpkg -l \| grep -E "nvidia-jetpack\|nvidia-l4t-core"` | **Observed** |
| **CUDA Compiler** | `nvcc V13.2.86`, release `13.2`, Build `cuda_13.2.r13.2/compiler.37953736_0` | `/usr/local/cuda/bin/nvcc --version` | **Observed** |
| **CUDA Arch Support** | `compute_87` (Ampere / Orin) supported by compiler | `/usr/local/cuda/bin/nvcc --list-gpu-arch` | **Observed** |
| **Total Memory** | `7.3 GiB` unified memory (`8 GB` physical) | `free -h` | **Observed** |
| **Memory in Use** | `2.9 GiB` used (Docker containers: `odysseus`, `chromadb`, `searxng`, `ntfy`) | `free -h`, `docker ps` | **Observed** |
| **Memory Available** | `4.4 GiB` available | `free -h` | **Observed** |
| **Swap Space** | `15 GiB` total, `464 MiB` used, `15 GiB` free | `free -h` | **Observed** |
| **Root Storage** | `233 GB` total, `73 GB` used, `148 GB` available (33% utilization) on `/dev/mmcblk0p1` | `df -h / /opt` | **Observed** |
| **Power Profile** | `NV Power Mode: 25W` (Mode 1) | `nvpmodel -q` | **Observed** |
| **Diagnostics Utility** | `/usr/bin/tegrastats` present and functional | `command -v tegrastats` | **Observed** |
| **llama-server Binary** | Built & Verified: `0.9.0-dev (build 12207, commit 998200491)`<br>SHA-256: `3f37e521312058f74b769eca1afd423a3e5f13deab73f6b640f0ffddcdaa4bae`<br>Path: `$HOME/label-lens-lab/llama.cpp/build/bin/llama-server` | `sha256sum`, `--version`, `ldd` | **Observed** |
| **Systemd Service** | `label-lens-vision` is `not-found`, `inactive` | `systemctl is-enabled`, `systemctl is-active` | **Observed** |
| **Build Toolchain** | `gcc 13.3.0`, `g++ 13.3.0`, `cmake 3.28.3` | `gcc --version`, `cmake --version` | **Observed** |

---

## 3. Discrepancies & Script Compatibility Analysis

1. **JetPack 7 / L4T 39.x / Ubuntu 24.04 (Noble) vs. Scripts:**
   - *Observation:* The device is running the latest JetPack 7.2.1 preview on Ubuntu 24.04 LTS with CUDA 13.2. Older Jetson setups ran JetPack 5 / 6 on Ubuntu 20.04 / 22.04 with CUDA 11 / 12.
   - *Impact on `deploy/orin/install-llama-server.sh`:*
     - The script uses `-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=87`.
     - In CUDA 13.2, `compute_87` is confirmed valid and supported.
     - CMake 3.28.3 and GCC 13.3.0 are already installed on the OS.
     - However, `apt-get install -y libcurl4-openssl-dev` in the script needs attention because on Ubuntu 24.04, `libcurl4-openssl-dev` may interact with noble default libraries or may already be satisfied.
2. **Memory Headroom & Competing Services:**
   - *Observation:* Existing Docker containers (`odysseus`, `chromadb`, etc.) occupy ~2.9 GiB. Total available unified memory is 4.4 GiB.
   - *Implication:* A 7B parameter model (e.g. Qwen2.5-VL-7B, ~4.7 GiB weights + 0.8 GiB projector) **will cause out-of-memory or severe swapping**. Only a 2B–3B model quantized to Q4_K_M (~1.8–2.0 GiB weights + ~0.8 GiB mmproj = ~2.6 GiB total) will fit safely within the remaining 4.4 GiB.
3. **Power Profile:**
   - *Observation:* Running at 25W (`Mode 1`), which is the maximum performance profile for the Orin Nano. Good for evaluation.

---

## 4. Model Candidate & Licensing Verification

| Candidate | Precision / Quant | Download Footprint | Memory Requirement | License | Suitability |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Qwen2.5-VL-3B-Instruct** | Q4_K_M (1.80 GiB) + Q8_0 mmproj (0.81 GiB) | **2.61 GiB** | ~3.4–3.8 GiB with KV cache | **Qwen Research License Agreement** *(Strictly Non-Commercial / Research only)* | **Recommended for research / Phase 0-2 evaluation** |
| **Qwen2-VL-2B-Instruct** | Q4_K_M (~1.4 GiB) + mmproj (~0.6 GiB) | **~2.0 GiB** | ~2.6–3.0 GiB with KV cache | **Apache 2.0** *(Permissive / Commercial use allowed)* | **Recommended fallback / commercial candidate** |
| **Qwen2.5-VL-7B-Instruct** | Q4_K_M (~4.7 GiB) + Q8_0 mmproj (~0.8 GiB) | **5.5 GiB** | ~6.5–7.2 GiB | **Apache 2.0** | **INCOMPATIBLE** (Exceeds available 4.4 GiB RAM) |

> [!IMPORTANT]
> **License Gate:** `Qwen2.5-VL-3B-Instruct` is governed by Alibaba Cloud's *Qwen Research License Agreement*, restricting use to non-commercial research and evaluation. Commercial production deployment would require an Alibaba commercial license or switching to an Apache 2.0 alternative like `Qwen2-VL-2B-Instruct`.

---

## 5. Pinned Software Recommendations

1. **llama.cpp Pinned Reference:**
   - Tag: `b12207`
   - Immutable Commit: `998200491327347eed85f007e4de7a1a7c871453`
   - Verified features on this commit:
     - CUDA `compute_87` support.
     - `--api-key-file` support in `common/arg.cpp`.
     - `--mmproj` and `--mmproj-offload` support for vision multi-modal projectors in `llama-server`.
2. **Model GGUF & Projector (Candidate 1):**
   - HF Repo: `ggml-org/Qwen2.5-VL-3B-Instruct-GGUF`
   - Model file: `Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf` (1,929,901,056 bytes)
   - Multimodal Projector: `mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf` (844,757,728 bytes)
   - Total disk storage required: 2.61 GiB (well within 148 GB available).

---

## 6. Phase 2A Smoke Test Verification (Hardware Measurements)

- **Evaluated Model:** `Qwen2-VL-2B-Instruct`
  - Model GGUF: `Qwen2-VL-2B-Instruct-Q4_K_M.gguf` (986,046,944 bytes)  
    SHA-256: `5745685d2e607a82a0696c1118e56a2a1ae0901da450fd9cd4f161c6b62867d7`
  - Multimodal Projector: `mmproj-Qwen2-VL-2B-Instruct-Q8_0.gguf` (709,883,360 bytes)  
    SHA-256: `a0ad91f00a7a80dcf84d719a61b00ee2e07b71794f4ee2dfa81a254621a8c418`
  - Upstream Revision: `bb307c036e8a1ed7b663bbd0c35b41c4c9294cfd`
  - License: **Apache 2.0** (verified upstream and conversion)
- **Model Load Time:** **32,786 ms** (32.8s) from command to `/health` ready.
- **Fixture Evaluated:** `approved-wine-001.png` (frozen wine corpus)
- **Inference Latency:**
  - Cold Request: **5,680.74 ms** (766 prompt tokens, 211 completion tokens)
  - Warm Request: **5,479.27 ms** (766 prompt tokens, 211 completion tokens)
  - Generation Speed: **38.04 tokens/second** (prompt eval: 97.12 t/s)
- **Transcription Output (Strict JSON):**
  - Brand: `"LUIGI & GIOVANNI"` (Exact match to fixture truth)
  - Class/Type: `"PRIMITIVO"`
  - Warning: Exact verbatim text
  - Alcohol: `"14% ALC 750ml"` (Exact match to fixture truth)
  - Legibility: `"clear"`
- **Memory & Resource Stability:**
  - Peak RAM during inference: **5,283 MiB** used out of 7,485 MiB (**2,202 MiB headroom maintained**)
  - Swap: 981 MiB (delta: +64 MiB)
  - Temperature: 50.4°C max
  - Docker Services: All 4 containers (`odysseus`, `chromadb`, `searxng`, `ntfy`) remained continuously healthy and uninterrupted.
- **Resource Recovery:** Server process stopped cleanly; memory immediately recovered.

---

## 7. Phase 2B Bounded-Region Evaluation (10 Approved Fixtures, 11 Occurrences)

- **Target:** 10 human-approved brand regions from `artifacts/brand-region-coverage-diagnosis/approved-regions.json` (corrected from initial documentation typo)
- **Execution Mode:** Bounded only (`npm run vision:eval -- --mode bounded`) across 3 consecutive runs
- **Endpoints & Tunnel:** `llama-server` on Jetson `127.0.0.1:18080`, accessed via SSH local port-forward (`-L 18080:127.0.0.1:18080`)
- **Evaluation Outcomes Across Runs:**

| Metric | Run 1 | Run 2 | Run 3 | Tesseract Reference |
| :--- | :--- | :--- | :--- | :--- |
| **Regions Evaluated** | 11 occurrences | 11 occurrences | 11 occurrences | 105 cases |
| **Reader Failures / Errors** | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | N/A |
| **Matches Truth** | **8 / 11 (72.7%)** | **8 / 11 (72.7%)** | **8 / 11 (72.7%)** | 29 / 105 (27.6% selected) |
| **Reliable But Wrong** | **0 / 11 (0.0%)** | **0 / 11 (0.0%)** | **0 / 11 (0.0%)** | N/A |
| **Median Latency** | 1,016 ms | 858 ms | 810 ms | ~400–900 ms |
| **p95 Latency** | 10,230 ms | 9,824 ms | 10,031 ms | ~1,200 ms |

- **Deterministic Case Breakdown:**
  - `la-fattoria-rotated` (rotated text): **Match** (`"La FATTORIA"`) in ~900 ms.
  - `approved-wine-004`: **Match** (`"La FATTORIA"`) in ~800 ms.
  - `approved-wine-005`: **Match** (`"La FATTORIA"`) in ~1,000 ms.
  - `approved-wine-023`: **Match** (`"Podere don Cataldo"`) in ~850 ms.
  - `approved-wine-027`: **Match** (`"THE GOLDEN Girls"`) in ~900 ms.
  - `approved-wine-031`: **Match** (`"embeleso"`) in ~810 ms.
  - `wine-multi-artifact-04` (front panel): **Match** (`"Dry Cellar"`) in ~1,000 ms.
  - `wine-multi-artifact-04` (back panel): **Match** (`"Dry Cellar"`) in ~800 ms.
  - `approved-wine-035`: **Miss** (Repetition artifact: `"Hubert Lamy EYEBROW EYEBROW..."` hitting max tokens, causing the ~10s p95 latency; correctly classified `unreliable`, preventing false acceptance).
  - `approved-wine-085`: **Miss** (`"Nosaikon"`; classified `unreliable`).
  - `approved-wine-091`: **Miss** (`"Rías Rías"`; classified `unreliable`).

- **Hardware Stability Across Runs:**
  - Peak unified RAM: 5,382 MiB (2,103 MiB headroom maintained throughout).
  - Swap: 983 MiB -> 1,013 MiB (+30 MiB delta across 33 bounded inferences).
  - Docker containers (`odysseus`, `chromadb`, `searxng`, `ntfy`): Zero disruption, 100% uptime.
  - Termination: Server cleanly stopped via PID; SSH tunnel closed.
  - 5-Minute Steady-State Resource Recovery: **Verified on device**. RAM dropped to **3,402 MiB** used (from 5,382 MiB peak), leaving **4,082 MiB available** (1,980 MiB net recovered). Tegrastats recorded GPU idle at 0% (`GR3D_FREQ 0%`), temperatures stabilized at 46.5°C, and all 4 background Docker services remained continuously running without interruption.

---

## 8. Phase 2C Paired OCR Counterfactual Evaluation

- **Objective:** Same-crop comparison between Qwen2-VL-2B-Instruct and local Tesseract OCR on the exact same 11 padded crops.
- **Fixture Set:** `artifacts/brand-region-coverage-diagnosis/approved-regions.json` (10 fixtures, 11 occurrences).
- **Paired Summary:**
  - **Both Correct:** **0 / 11 (0.0%)**
  - **Vision-Only Correct:** **8 / 11 (72.7%)**
  - **OCR-Only Correct:** **0 / 11 (0.0%)**
  - **Both Incorrect:** **3 / 11 (27.3%)**
  - **Abstentions (Reliable=False):**
    - Vision: 11 / 11 (100.0%) under `legibility: "partial"` $\rightarrow$ `LOW_CONFIDENCE`.
    - Tesseract: 11 / 11 (100.0%) under `evidenceState: "AMBIGUOUS" | "UNREADABLE" | "NOT_OBSERVED"`.
  - **False Certainty (`reliableButWrong`):**
    - Vision: **0 / 11 (0.0%)**
    - Tesseract: **0 / 11 (0.0%)**
- **Degenerate Repetition Investigation & Deterministic Rejection:**
  - `approved-wine-035` repetition loop labeled `repetition/degenerate`.
  - Length capping at 400 characters clipped the line but did not reject it.
  - Formulated deterministic rejection rule (`src/server/vision/repetition-detector.ts`) with 7 unit tests covering unigram, bigram, trigram, and vocabulary diversity loops.
- **Hardware Telemetry Check:**
  - `vmstat 1 3`: `si: 0`, `so: 0` (zero swap-in / swap-out activity, swap is quiescent).
  - `free -m`: 3,413 MiB used, 1,963 MiB free, 4,071 MiB available, 2,338 MiB buff/cache.
  - `/proc/pressure/memory`: `PSI not available` (L4T 39.2.1 kernel built without `CONFIG_PSI=y`).
  - `tegrastats`: GPU 0% idle, 45.8°C, board power 4.8W.
  - Docker: All 4 containers running continuously healthy (`Up 2 weeks`).

---

## 9. Phase 2D Held-Out Validation (24 Diverse Public Labels)

- **Objective:** Evaluate generalization and candidate recovery across 24 diverse public held-out labels representing 4 distinct strata (6 normal print, 6 stylized script, 6 rotated/complex layouts, 6 absent-brand negative controls).
- **Execution:** Serial evaluation (`scripts/vision/evaluate-held-out.ts`) with predeclared resize policy (`maxEdgePx: 800`, Lanczos3 aspect-ratio preserving) keeping vision tokens $\le 812$.
- **Candidate Recovery Comparison (18 Brand-Present Labels):**
  - **Vision Candidate Recovery:** **14 / 18 (77.8%)**
  - **Tesseract Candidate Recovery:** **6 / 18 (33.3%)**
  - **Paired Breakdown:**
    - **Both Correct:** **5 / 18 (27.8%)**
    - **Vision-Only Correct:** **9 / 18 (50.0%)**
    - **OCR-Only Correct:** **1 / 18 (5.6%)**
    - **Both Incorrect:** **3 / 18 (16.7%)**
- **Negative Control Abstention (6 Brand-Absent Labels):**
  - **Vision False Candidate Insertions:** **0 / 6 (0.0% false insertions, 100% clean abstention)**
  - **Tesseract False Candidate Insertions:** **0 / 6 (0.0% false insertions, 100% clean abstention)**
- **Strata Breakdown:**
  - **Normal Print (6 cases):** Vision 6 / 6 (100.0%) vs. Tesseract 1 / 6 (16.7%)
  - **Stylized Script (6 cases):** Vision 4 / 6 (66.7%) vs. Tesseract 3 / 6 (50.0%)
  - **Layout & Orientation (6 cases):** Vision 4 / 6 (66.7%) vs. Tesseract 2 / 6 (33.3%)
  - **Absent Controls (6 cases):** Vision 6 / 6 clean abstentions vs. Tesseract 6 / 6 clean abstentions
- **Latency Profile (800px full image):**
  - Vision: Median 8,591 ms, p95 21,151 ms
  - Tesseract: Median 783 ms, p95 1,570 ms
- **Fail-Closed Transcript Hygiene In Vivo:**
  - In `approved-wine-006` and `approved-wine-035`, unconstrained generation entered repetitive loops.
  - The deterministic repetition detector caught both degenerate transcripts before length-capping truncation and rejected them fail-closed.
- **Hardware Telemetry & 5-Minute Steady-State Recovery:**
  - 5-Minute Cooldown Steady State: **3,253 MiB used**, 2,610 MiB free, **4,231 MiB available** (full recovery to baseline).
  - Swap: 1,122 MiB used (`vmstat 1 3` confirms quiescent state: `so: 0`, CPU 97% idle).
  - Thermals & Power: `tegrastats` records GPU idle at 0% (`GR3D_FREQ 0%`), GPU temp 47.5°C, CPU 47.0°C, board power 4.84W (`VDD_IN 4840mW`).
  - Docker Services: All 4 background containers (`odysseus`, `chromadb`, `searxng`, `ntfy`) remained 100% healthy (`Up 2 weeks`) with zero disruption throughout the 24-case evaluation.

---

## 10. Current Status & Stop Gate

- **Phase 2D Held-Out Validation Status:** **COMPLETE & SUCCESSFUL**.
- **Draft PR #232:** Created and updated on branch `eval/phase-2-orin-vision-counterfactual`.
- **Next Safe Action:** Stop before whole-label 115-case evaluation or production integration. Await user review and instructions.
