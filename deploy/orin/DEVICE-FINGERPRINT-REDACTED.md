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

- **Objective:** Evaluate generalization across 24 diverse public held-out labels representing 4 distinct strata (6 normal print, 6 stylized script, 6 rotated/complex layouts, 6 absent-brand negative controls).
- **Execution:** Serial evaluation (`scripts/vision/evaluate-held-out.ts`) with predeclared resize policy (`maxEdgePx: 800`, Lanczos3 aspect-ratio preserving) keeping vision tokens $\le 812$.
- **Artifact Provenance:** Original hardware run output preserved byte-intact at `artifacts/held-out-validation/report-v1.json`. Corrected symmetric multi-stage scoring and manifest reconciliation recorded at `artifacts/held-out-validation/report-v2.json` and `artifacts/held-out-validation/report.json`.
- **Reconciled Case Inventory (Committed Manifest):**
  - *Normal Print (6):* `approved-wine-006`, `008`, `012`, `016`, `020`, `038`
  - *Stylized Script (6):* `casanova-della-spinetta`, `domaine-follin-arbelet`, `approved-wine-011`, `014`, `024`, `chateau-bonneau`
  - *Layout & Orientation (6):* `approved-wine-013`, `patricia-green-cellars`, `approved-wine-018`, `nebla-mencia`, `approved-wine-026`, `approved-wine-033`
  - *Absent Controls (6):* `approved-wine-022`, `058`, `062`, `075`, `082`, `095`
- **Symmetric Comparison on 18 Brand-Present Labels:**
  - **Stage 1: Raw Brand-Text Presence in Transcript (`brandPresentInTranscript`):**
    - Tesseract: **15 / 18 (83.3%)**
    - Vision (Line-Check as run on hardware): **14 / 18 (77.8%)**
    - Vision (Multiline-Check): **13 / 18 (72.2%)** (`approved-wine-006` rejected for 60-line loop)
    - Paired Concordance (Line-Check): Both 12/18, Vision-only 2/18 (`011`, `012`), OCR-only 3/18 (`casanova-della-spinetta`, `chateau-bonneau`, `018`), Neither 1/18 (`patricia-green-cellars`)
  - **Stage 2: Selected Brand Candidate Match (`brandValueMatches`):**
    - Tesseract: **6 / 18 (33.3%)** (`020`, `casanova-della-spinetta`, `domaine-follin-arbelet`, `014`, `nebla-mencia`, `026`)
    - Vision: **`NOT_EVALUATED`** (whole-image transcription without candidate selector)
  - **Stage 3: Reliable Evidence Match ($\ge 0.8$):**
    - Tesseract: **0 / 18 (0.0%)** (all 18 cases had `evidenceState: AMBIGUOUS` or score < 0.8)
    - Vision: **`NOT_EVALUATED`**
- **Negative Control Abstention (6 Brand-Absent Labels):**
  - Tesseract: **0 / 6 false insertions (100% clean abstention)** (`selectBrandObservation` returned null)
  - Vision: **`NOT_EVALUATED`** (candidate-vs-text discrimination not evaluated on whole image)
- **Degeneration Investigation:**
  - `approved-wine-035`: Motivating fixture from Phase 2B/2C (approved regions); not in 24-case held-out manifest. Prior reference in held-out narrative was a provenance error.
  - `approved-wine-006`: Generated 60 identical lines of `"Contains Sulfites - Canned by Dark Horse"` (21.1s). Caught by multiline repetition detector (`detectDegenerateTranscript`).
- **Hardware Telemetry & 5-Minute Steady-State Recovery:**
  - 5-Minute Cooldown Steady State: **3,253 MiB used**, 2,610 MiB free, **4,231 MiB available** (full recovery to baseline).
  - Swap: 1,122 MiB used (`vmstat 1 3` confirms quiescent state: `so: 0`, CPU 97% idle).
  - Thermals & Power: `tegrastats` records GPU idle at 0% (`GR3D_FREQ 0%`), GPU temp 47.5°C, CPU 47.0°C, board power 4.84W (`VDD_IN 4840mW`).
  - Docker Services: All 4 background containers (`odysseus`, `chromadb`, `searxng`, `ntfy`) remained 100% healthy (`Up 2 weeks`) with zero disruption throughout the 24-case evaluation.

---

## 10. Current Status & Stop Gate

- **Phase 2D Held-Out Validation Status:** **REPAIRED (v2 Evidence Report & Provenance Reconciled)**.
- **Draft PR #232:** Updated on branch `eval/phase-2-orin-vision-counterfactual`. Base explicitly scoped to `claude/affectionate-allen-710869`.
- **Next Safe Action:** Stop before whole-label 115-case evaluation or production integration. Await user review and instructions.
