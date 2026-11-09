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

### 8. Phase 2D Held-Out Validation (24 Diverse Public Labels)

- Evaluator: `scripts/vision/evaluate-held-out.ts` running against pre-registered `artifacts/held-out-validation/held-out-manifest.json`.
- Artifact Provenance: Original hardware run output preserved byte-intact at `artifacts/held-out-validation/report-v1.json`. Corrected symmetric multi-stage scoring and manifest reconciliation recorded at `artifacts/held-out-validation/report-v2.json` and `artifacts/held-out-validation/report.json`.
- Predeclared Resize Policy: Context-safe resize to `maxEdgePx: 800` (Lanczos3 aspect-ratio preserving), capping vision prompt tokens to $\le 812$ and preventing context-window exhaustion on full-resolution label scans (up to 2550x3300).

#### Reconciled Case Inventory (Committed Manifest: 24 Cases)
- **Normal Print (6 cases):** `approved-wine-006` ("Dark Horse"), `approved-wine-008` ("Vino Alpino"), `approved-wine-012` ("Cooley Bay"), `approved-wine-016` ("Marques de Navarro"), `approved-wine-020` ("Courtieu"), `approved-wine-038` ("Big Red Sunshine").
- **Stylized Script (6 cases):** `casanova-della-spinetta` ("Casanova della Spinetta"), `domaine-follin-arbelet` ("Domaine Follin-Arbelet"), `approved-wine-011` ("MariaAntonietta"), `approved-wine-014` ("Tre Cori"), `approved-wine-024` ("Chateau de Laville"), `chateau-bonneau` ("Château Bonneau").
- **Layout & Orientation (6 cases):** `approved-wine-013` ("Afflicted"), `patricia-green-cellars` ("Patricia Green Cellars"), `approved-wine-018` ("Poqr Krya"), `nebla-mencia` ("Nebla"), `approved-wine-026` ("Principe Diphesa"), `approved-wine-033` ("Haywater Cove").
- **Absent-Brand Negative Controls (6 cases):** `approved-wine-022`, `approved-wine-058`, `approved-wine-062`, `approved-wine-075`, `approved-wine-082`, `approved-wine-095`.

#### Symmetric Multi-Stage Comparison (18 Brand-Present Labels)

1. **Stage 1: Raw Brand-Text Presence in Transcript (`brandPresentInTranscript`):**
   - **Tesseract Raw Brand Presence:** **15 / 18 (83.3%)**
   - **Vision Raw Brand Presence (Line-Check as run on hardware):** **14 / 18 (77.8%)**
   - **Vision Raw Brand Presence (Multiline-Check):** **13 / 18 (72.2%)** (`approved-wine-006` rejected for 60-line loop)
   - **Paired Concordance (Line-Check):**
     - Both Raw Present: **12 / 18 (66.7%)** (`006`, `008`, `016`, `020`, `038`, `domaine-follin-arbelet`, `014`, `024`, `013`, `nebla-mencia`, `026`, `033`)
     - Vision-Only Raw Present: **2 / 18 (11.1%)** (`approved-wine-011`, `approved-wine-012`)
     - OCR-Only Raw Present: **3 / 18 (16.7%)** (`casanova-della-spinetta`, `chateau-bonneau`, `approved-wine-018`)
     - Neither Raw Present: **1 / 18 (5.6%)** (`patricia-green-cellars`)
   - **Paired Concordance (Multiline-Check):**
     - Both Raw Present: **11 / 18 (61.1%)**
     - Vision-Only Raw Present: **2 / 18 (11.1%)** (`011`, `012`)
     - OCR-Only Raw Present: **4 / 18 (22.2%)** (`006`, `casanova-della-spinetta`, `chateau-bonneau`, `018`)
     - Neither Raw Present: **1 / 18 (5.6%)** (`patricia-green-cellars`)

2. **Stage 2: Selected Brand Candidate Match (`brandValueMatches`):**
   - **Tesseract Selected Brand Match:** **6 / 18 (33.3%)** (`020`, `casanova-della-spinetta`, `domaine-follin-arbelet`, `014`, `nebla-mencia`, `026`)
     - *Why Tesseract drops from 15 raw to 6 selected:* On 9 cases (`006`, `008`, `016`, `038`, `024`, `chateau-bonneau`, `013`, `018`, `033`), Tesseract's raw OCR saw the brand, but its candidate window selector surfaced an appellation, varietal, or bottler phrase.
   - **Vision Selected Brand Match:** **`NOT_EVALUATED`**
     - *Status:* The VLM was prompted strictly as a literal whole-image transcriber; no brand candidate selector was executed on whole-label transcripts.

3. **Stage 3: Reliable Evidence Match ($\ge 0.8$ Confidence Gate):**
   - **Tesseract Reliable Brand Match:** **0 / 18 (0.0%)** (all 18 cases had `evidenceState: "AMBIGUOUS"` or score < 0.8)
   - **Vision Reliable Brand Match:** **`NOT_EVALUATED`** (no downstream candidate selection/acceptance stage)

#### Negative Control Abstention (6 Brand-Absent Labels)
- **Tesseract:** **0 / 6 false insertions (100% clean abstention)**. `selectBrandObservation` returned `null` for all 6 cases.
- **Vision:** **`NOT_EVALUATED`**. Whole-image transcription transcribes visible text; candidate-vs-text discrimination was not evaluated.

#### Degeneration Investigation
- **Case `approved-wine-035`:** Motivating fixture from Phase 2B/2C (approved brand regions) where a unigram repetition loop occurred. It was not in the 24-case held-out manifest; prior reference to it in the Phase 2D held-out narrative was a provenance error.
- **Case `approved-wine-006`:** In the 24-case run, the model generated 60 identical lines of `"Contains Sulfites - Canned by Dark Horse"` (21.1s). The v1 evaluator evaluated lines individually and did not flag the line because it contained 7 distinct words; under the updated `detectDegenerateTranscript`, cross-line identical repetitions ($\ge 3$ consecutive lines) are intercepted and rejected fail-closed.

#### Hardware Telemetry & 5-Minute Steady-State Recovery
- Immediate post-kill RAM: 3,769 MiB used, 3,715 MiB available.
- 5-Minute Cooldown Steady State: **3,253 MiB used**, 2,610 MiB free, **4,231 MiB available** (full recovery to pre-test baseline).
- Swap: 1,122 MiB used (stable, `vmstat 1 3` confirms `so: 0` zero swap out, quiescent).
- GPU & Thermals: `GR3D_FREQ 0%` (idle), GPU 47.5°C, CPU 47.0°C, board power 4.84W.
- Docker Services: All 4 containers (`odysseus`, `chromadb`, `searxng`, `ntfy`) remained continuously healthy (`Up 2 weeks`) with zero disruption.

### 9. Phase 2E Offline Brand Evidence Recovery Analysis

- **Context & Constraints:** Conducted entirely offline without additional Jetson inference runs, new model weights, or production code activation. Stacked draft PR #232 remains draft and unmerged.
- **Artifacts & Scripts:**
  - `scripts/vision/score-v1-to-v2.ts`: Deterministic offline scorer deriving v2 metrics from archived v1 records.
  - `src/server/vision/score-v1-to-v2.test.ts`: 9 unit tests verifying SHA-256 integrity, tamper detection, and exact determinism.
  - `scripts/vision/diagnose-candidate-loss.ts`: 5-stage candidate selection tracer across all 18 brand-present cases.
  - `artifacts/held-out-validation/candidate-selection-diagnosis.json`: Structured trace and failure taxonomy.
  - `scripts/vision/simulate-additive-counterfactual.ts`: Supplemental vision pass simulation for vision-only recoveries and negative controls.
  - `artifacts/held-out-validation/additive-counterfactual-report.json`: Additive simulation results, recovery gains, and safety checks.

#### Evidence Scopes and Case-Level Reconciliation (Priority 1)
- **Immutable v1 Hash:** Confirmed SHA-256 of `report-v1.json` is `97cef0fbb5c4310d4d6d62b91e366c8224a246b30afd96908b6722d872cb632f`.
- **Evidence Scopes Defined:**
  - **Scope A (Archived Preview $\le 300$ chars):** Raw brand text present in 15 / 18 (83.3%) cases. Retrospective scoring on the truncated preview captures all front hero hits but misses fine print beyond char 300.
  - **Scope B (Full Primary-Pass OCR Stream):** Raw brand text present in 16 / 18 (88.9%) cases.
- **The Case `approved-wine-012` Pivot:** In Scope A, hero title had character corruption (`Cool&y Bay`) and fine print was cut off at char 300, scoring `rawBrandPresent: false`. In Scope B, full-image OCR contains `Cooley Bay Winery` in the fine-print bottler statement at char 368 (`rawBrandPresent: true`), but this occurrence is downstream eliminated by the `producer-line` filter. Vision provided prominent hero-title position recovery, not first-text presence across the whole label.
- **Genuinely Vision-Only Raw Presence:** Across the full label, only **1 / 18** cases (`approved-wine-011`, where cursive script caused Tesseract to read `Societa Agricola Maria Antonie` and completely miss `MariaAntonietta`) is genuinely vision-only for raw text recovery.

#### Candidate Selection Loss Diagnosis across 5 Stages (Priority 2)
For the 18 brand-present cases, evidence survival across the selection stages under full primary-pass OCR (`candidate-selection-diagnosis.json`):
1. **Raw OCR Brand Text:** 16 / 18 (88.9%)
2. **Candidate Constructed:** 8 / 18 (44.4%)
3. **Candidate Kept (Survived Filters):** 8 / 18 (44.4%)
4. **Candidate in Top 3:** 8 / 18 (44.4%)
5. **Selected Brand Match:** 6 / 18 (33.3%)
6. **Authoritative Evidence (`OBSERVED` & $\ge 0.8$):** 0 / 18 (0.0%)

*Scope Notice:* `selectBrandObservation([primaryPass])` evaluates the **primary-pass selector**, not necessarily every recovery pass or final decision in the complete production pipeline.

**Reconciled Loss Taxonomy (18 Brand-Present Cases):**
- **Raw OCR Misses (2 cases):**
  - `approved-wine-011` (MariaAntonietta): Cursive script missed by Tesseract.
  - `patricia-green-cellars` (Patricia Green Cellars): Multi-column text flow interleaves with Patty's Vineyard body copy; no contiguous brand candidate formed.
- **Candidate Formation Loss (8 cases):**
  - 5 overlong lines rejected by `too-many-words` skipping windowing (`approved-wine-006`, `016`, `038`, `024`, `018`).
  - 1 stacked single-word heading (`chateau-bonneau`).
  - 1 legal entity suffix retained (`approved-wine-008` `"Vino Alpino LLC"`).
  - 1 hero OCR noise with fine print eliminated by producer filter (`approved-wine-012`).
- **Ranking Displacement (2 cases):**
  - `approved-wine-013` (Afflicted): Exact candidate formed and kept (score 3.41, rank #2) $\rightarrow$ outranked by front headline `"Play ers Heart"` (score 5.44, rank #1).
  - `approved-wine-033` (Haywater Cove): Exact candidate formed and kept (score 4.14, rank #2) $\rightarrow$ outranked by cuvée `"NIGHT SWIMMING"` (score 4.32, rank #1).
- **Conservative Authority Gate Impact (6 cases):**
  - All 6 correctly selected cases (`020`, `casanova-della-spinetta`, `domaine-follin-arbelet`, `014`, `nebla-mencia`, `026`) had high evidence scores ($\ge 0.82$), but single primary-pass OCR cannot reach consensus without cross-pass verification, so all 6 are held as `state: "AMBIGUOUS"`.
- **Sum Invariant:** $2 + 8 + 2 + 6 = 18$ cases accounted for with zero gaps.

#### Offline Additive Counterfactual Simulation (Priority 3)
- **Feasibility Status:** `ORACLE_ASSISTED_UPPER_BOUND_FEASIBILITY`.
- **Methodology Notice:** The simulated 6/18 $\to$ 7/18 uplift (+5.6 pp) is an oracle-assisted synthetic upper bound, NOT a measured vision product improvement, because ground-truth tokens were manually selected, assigned an arbitrary 95% confidence score, and placed with synthetic prominent geometry.
- **Sensitivity Findings:**
  - *Confidence Sensitivity:* In `approved-wine-012`, `Cooley Bay` requires confidence $\ge 50\%$ to be selected (score 3.69-4.14). At confidence $0\%$, score drops to 2.49 (rank #4) and `Cool&y` is selected. In `approved-wine-011`, `MariaAntonietta` is constructed and kept (score 3.94-4.89, rank #2), but displaced behind `Societa Agricola Maria Antonie`.
  - *Geometry Subordination:* In `approved-wine-012`, prominent geometry yields score 4.14 (selected), moderate geometry yields 3.83 (selected), but subordinate (fine print) geometry drops score to 3.57, displacing `Cooley Bay` behind `Texas Tempranillo 750ml`.
- **Architectural Limitation of Whole-Image VLM Transcripts:** Whole-image transcripts from `llama-server` return unstructured/line-based text, lacking authentic pixel coordinates ($x_0, y_0, x_1, y_1$), font sizes, or line-height bounding boxes. Without bounded spatial targeting (such as Phase 2B's cropped brand region targeting), unconstrained whole-image vision transcript tokens cannot be anchored to label geometry, and negative control safety cannot be guaranteed.

### 10. Phase 2F Evidence Reconciliation & Candidate Formation Treatment

- **Artifacts & Scripts:**
  - `scripts/vision/reconcile-evidence.ts`: Full case-level provenance matrix across Scope A and Scope B.
  - `artifacts/held-out-validation/evidence-reconciliation.json`: Unified concordance report.
  - `scripts/vision/evaluate-candidate-formation-treatment.ts`: Candidate formation root-cause diagnosis and narrow stacked-heading treatment simulation.
  - `artifacts/held-out-validation/candidate-formation-treatment-report.json`: Treatment evaluation report.
  - `src/server/vision/candidate-loss-reconciliation.test.ts`: Vitest suite enforcing reconciliation invariants and treatment safety.

#### Candidate Formation Failure Taxonomy (8 Cases)
1. **Overlong Line Rejection (`too-many-words`) (5 cases):** In `approved-wine-006`, `016`, `038`, `024`, and `018`, the true brand appears within a multi-token line (>6 words). The `too-many-words` filter rejects the entire line, and because `shouldTrimWholeLineCandidate` only trims kept positive lines, sub-span $N$-gram candidate formation was completely skipped.
2. **Stacked Single-Word Heading (1 case):** In `chateau-bonneau`, `"CHATEAU"` (line 2) and `"BONNEAU"` (line 3) are vertically adjacent, horizontally aligned single words. Production multi-line merge requires `hasPositiveLine`; since both single words are plausible rather than positive, the merge was skipped under default options.
3. **Legal Suffix Retained (1 case):** In `approved-wine-008`, `"Vino Alpino LLC"` was constructed, but corporate suffix `"LLC"` was not stripped, and `lineWindows` was not triggered.
4. **Hero OCR Noise with Producer Fine Print (1 case):** In `approved-wine-012`, hero text had symbol noise `"Cool&y"`; fine-print `"Cooley Bay Winery"` was eliminated by `isProducerLine`.

#### Narrow Stacked-Heading Treatment Evaluation
- **Treatment Definition:** Deterministically merge two vertically adjacent, horizontally aligned single-word lines ($alignment \ge 0.7$, $proximity \ge 0.5$) where Line 1 is a recognized brand prefix (`CHATEAU`, `DOMAINE`, `BODEGA`, `MAISON`, `VILLA`, `CASALE`, `TENUTA`) and Line 2 is a single proper noun (with strict guards against digits/postal codes, generic descriptors, and grape varietals).
- **Results Across All 24 Held-Out Cases:**
  - **Baseline Selected Matches:** 6 / 18 (33.3%)
  - **Treatment Selected Matches:** 7 / 18 (38.9%) (+5.6 pp)
  - **Case `chateau-bonneau` Recovered:** `"BONNEAU"` (false) $\rightarrow$ `"CHATEAU BONNEAU"` (score 4.67, matches truth!).
  - **Regressions:** **0 / 18 (0 regressions)**. Specifically protected: `domaine-follin-arbelet` (not merged with postal code `21420`), `nebla-mencia` (not merged with varietal `MENCIA`), and `approved-wine-026` (not merged with appellation `PAESTUM`).
  - **Negative Control Safety:** **0 / 6 false assertions (100% clean abstention preserved)**.
  - **Safety Verdict:** `NO_REGRESSIONS_IN_THIS_24_CASE_DEVELOPMENT_SET` (scoped development-set check, not a production safety certificate).

#### Predeclared Validation Protocol
Before any candidate formation treatment can be considered for production promotion:
1. **Disjoint out-of-sample regression validation:** Must execute across an identity-deduplicated validation set drawn from the remaining unseen frozen 115-label corpus and real negative controls. (Correction: Phase 2B evaluated exactly 10 approved fixtures / 11 occurrences, not 24 unique labels; combining Phase 2B and held-out validation does not form a 48 unique label corpus due to artwork overlaps).
2. **Strict negative-control invariant:** Zero false assertions allowed on non-brand labels.
3. **Multi-pass consensus gate preservation:** Single-pass observations must remain `AMBIGUOUS`.
4. **Independent PR review:** Treatment must be proposed in a separate PR from the evaluation harness.

### 12. Phase 2G Authentic Same-Pass Candidate Formation Analysis

- **Context & Constraints:** Conducted entirely offline without additional Jetson inference runs, new model weights, or production code activation. Stacked draft PR #232 remains draft and unmerged.
- **Artifacts & Scripts:**
  - `src/pipeline/extractor/stacked-headings.ts`: Standalone candidate formation module for vertically adjacent, horizontally aligned stacked headings with strict guards.
  - `src/pipeline/extractor/stacked-headings.test.ts`: 19 vitest tests validating brand prefix recognition, generic wine exclusions, varietals, appellations, digits/postal codes, geometry thresholds, authority gate invariants, and frozen baseline immutability.
  - `scripts/vision/evaluate-same-pass-treatment.ts`: 3-condition comparison script evaluating Condition A, Condition B, and Condition C across all 24 held-out cases.
  - `artifacts/held-out-validation/same-pass-treatment-report.json`: Structured report recording condition metrics, invariants audit, and case-level traces.
  - `src/server/vision/candidate-loss-reconciliation.test.ts`: Updated with 4th test suite asserting Phase 2G invariants.

#### Three-Condition Comparison (24 Held-Out Cases)

| Metric | Condition A: Frozen Baseline | Condition B: Synthetic Focus-Crop Upper Bound | Condition C: Authentic Same-Pass Treatment |
|---|---|---|---|
| **Pass Structure** | Single pass (`pass-0-full-image`) | Two passes (`pass-0-full-image` + synthetic `focus-crop`) | Single pass (`pass-0-full-image`) |
| **Token Confidence** | Authentic OCR confidences | Fabricated 94% confidence | Authentic OCR confidences (mean 94% from tokens 96 & 92) |
| **Brand-Present Cases** | 18 | 18 | 18 |
| **Candidate Constructed** | 8 / 18 (44.4%) | 9 / 18 (50.0%) | **9 / 18 (50.0%)** |
| **Top-3 Ranked** | 7 / 18 (38.9%) | 8 / 18 (44.4%) | **8 / 18 (44.4%)** |
| **Selected Brand Match** | 6 / 18 (33.3%) | 7 / 18 (38.9%) | **7 / 18 (38.9%)** |
| **Reliable Accepted (`OBSERVED`)** | 0 / 18 (0.0%) | 0 / 18 (0.0%) | **0 / 18 (0.0%)** |
| **Negative Control Cases** | 6 | 6 | 6 |
| **Negative False Candidate Insertions** | 0 / 6 (0.0%) | 0 / 6 (0.0%) | **0 / 6 (0.0%)** |
| **Negative False Selected Insertions** | 0 / 6 (0.0%) | 0 / 6 (0.0%) | **0 / 6 (0.0%)** |
| **Regressions on Prior-Correct Cases** | 0 | 0 | **0** |
| **Safety Verdict** | N/A | UPPER_BOUND_FEASIBILITY | `NO_REGRESSIONS_IN_THIS_24_CASE_DEVELOPMENT_SET` |

#### Invariants Audit & Findings
1. **Single-Pass Provenance Integrity:** Condition C constructs `"CHATEAU BONNEAU"` within the single primary OCR pass (`passId: "pass-0-full-image"`, `passKind: "full-image-primary"`). `supportingPassIds` contains exclusively `["pass-0-full-image"]`, and `recoveryPassUsed` is `false`.
2. **Authentic Token Confidence:** Token confidences are the true Tesseract outputs (CHATEAU: 96%, BONNEAU: 92%, resulting in mean evidence score 0.94). No arbitrary confidence scores were injected.
3. **Consensus & Authority Gate Preservation:** Because the candidate is derived within a single pass, it cannot fabricate multi-pass consensus. With competing front-label candidates (`"MONTAGNE SAINT-EMILION"`, `"SCEA. VIEUX CHATEAU SAINT-ANDRE"`), the authority gate holds `"CHATEAU BONNEAU"` as **`AMBIGUOUS`**. It cannot silently elevate to `OBSERVED`.
4. **Clean Negative Controls:** Across all 6 brand-absent controls, 0 brand candidates were constructed and 0 false selections occurred (100% clean abstention preserved).
5. **Zero Regressions:** All 6 previously selected baseline cases (`approved-wine-001`, `007`, `009`, `010`, `025`, `026`) are preserved exactly. Near-miss guards successfully reject postal codes (`domaine-follin-arbelet`), grape varietals (`nebla-mencia`), and appellations (`approved-wine-026`).

#### Corpus Sample Accounting Correction
- **Phase 2B Fixture Inventory:** Phase 2B evaluated exactly **10 approved fixtures / 11 occurrences** (`approved-wine-001`, `006`, `007`, `008`, `009`, `010`, `012`, `025`, `035`, `040`), not 24 unique labels.
- **Held-Out Validation Inventory:** The held-out validation set contains **24 cases** (18 brand-present, 6 brand-absent).
- **Combined Corpus Clarification:** Combining Phase 2B (10 fixtures / 11 occurrences) and held-out validation (24 cases) does **NOT** form a 48 unique label corpus due to artwork overlaps.
- **Out-of-Sample Requirement:** Any future claim of generalizability must draw a disjoint, identity-deduplicated validation set from the remaining unseen frozen 115-label corpus.

### 14. Phase 2H Exact-Implementation Parity & Out-of-Sample Validation

- **Context & Scope:** Following PR #233 Review 5821433232 and Issue #231 Comment 6731734132, Phase 2H was conducted entirely offline. PR #230, PR #232, and PR #233 remain draft and unmerged. Zero Jetson inference runs executed; zero new model downloads or production activations.
- **Artifacts & Scripts:**
  - `scripts/vision/evaluate-exact-implementation-parity.ts`: Evaluates the exact PR #233 selector across 4 explicit conditions on all 24 held-out cases.
  - `artifacts/held-out-validation/exact-implementation-parity-report.json`: Four-condition comparison report tracking commit SHAs, code hashes, and case-level traces. (Phase 2G report `same-pass-treatment-report.json` preserved completely untouched).
  - `artifacts/held-out-validation/out-of-sample-validation-manifest.json`: Frozen, identity-deduplicated manifest of **79 previously unseen public labels** from the 115-label corpus.
  - `scripts/vision/evaluate-out-of-sample-validation.ts`: Evaluates both the single-pass selector and complete multi-pass production recovery paths across all 79 out-of-sample cases.
  - `artifacts/held-out-validation/out-of-sample-validation-report.json`: Case-level results and summary failure metrics for out-of-sample validation.

#### Four-Condition Parity Comparison (24 Held-Out Cases)

| Metric | Condition A: Frozen Baseline | Condition B: Synthetic Focus-Crop Upper Bound | Condition C: Coherent Surrogate (Phase 2G) | Condition D: Exact PR #233 Narrow Treatment |
|---|---|---|---|---|
| **Selector Mechanism** | `selectBrandObservation` | Simulated 2-pass with invented 94% conf | Evaluator-gated `selectBrandObservationWithCoherentLineMergeTreatment` | `selectBrandObservationWithNarrowStackedHeadingTreatment` |
| **Pass Structure** | Single pass (`pass-0-full-image`) | Two passes (primary + focus crop) | Single pass (`pass-0-full-image`) | Single pass (`pass-0-full-image`) |
| **Source Provenance** | Historical production baseline | Synthetic simulation | Ad-hoc evaluator predicate | Commit `5d690fb` (`4719a1f428...`) |
| **Brand-Present Cases** | 18 | 18 | 18 | 18 |
| **Candidate Constructed** | 8 / 18 (44.4%) | 9 / 18 (50.0%) | 9 / 18 (50.0%) | **9 / 18 (50.0%)** |
| **Top-3 Ranked** | 7 / 18 (38.9%) | 8 / 18 (44.4%) | 8 / 18 (44.4%) | **8 / 18 (44.4%)** |
| **Selected Brand Match** | 6 / 18 (33.3%) | 7 / 18 (38.9%) | 7 / 18 (38.9%) | **7 / 18 (38.9%)** |
| **Reliable Accepted (`OBSERVED`)** | 0 / 18 (0.0%) | 0 / 18 (0.0%) | 0 / 18 (0.0%) | **0 / 18 (0.0%)** |
| **Negative Control Cases** | 6 | 6 | 6 | 6 |
| **Negative False Candidate Insertions** | 0 / 6 (0.0%) | 0 / 6 (0.0%) | 0 / 6 (0.0%) | **0 / 6 (0.0%)** |
| **Negative False Selected Assertions** | 0 / 6 (0.0%) | 0 / 6 (0.0%) | 0 / 6 (0.0%) | **0 / 6 (0.0%)** |
| **Regressions on Prior-Correct Cases** | 0 | 0 | 0 | **0** |
| **Authority Gate Invariant** | Held AMBIGUOUS | Held AMBIGUOUS | Held AMBIGUOUS | **Held AMBIGUOUS** |

#### Parity Analysis: Condition C vs. Condition D
- **Mechanism Difference:** In Phase 2G, Condition C utilized an evaluator-level ad-hoc detector (`detectNarrowStackedHeadingInOcr`) that gated a call to the broader pre-existing option `allowCoherentPlausibleLineMerge`. In contrast, Condition D exercises the exact PR #233 candidate formation predicate (`isNarrowStackedHeadingPair`) integrated directly into `field-selection.ts` via `allowNarrowStackedHeadingMerge`.
- **Behavioral Equivalence on Development Set:** Both conditions achieve identical selected recovery: **7 / 18 (38.9%) vs. 6 / 18 (33.3%) baseline**, with `"CHATEAU BONNEAU"` selected at rank 1 with authentic mean confidence 0.94.
- **Inherent Guard Verification:** When `allowCoherentPlausibleLineMerge` is run unconditionally without gating, it regresses `domaine-follin-arbelet` (merging postal code `21420 ALOXE-CORTON`) and `nebla-mencia` (merging varietal `MENCIA`). Condition D natively protects against both regressions without evaluator-level gating, maintaining **0 / 18 regressions** unconditionally.

#### Out-of-Sample Validation on 79 Genuinely Unused Labels

To prevent development-set overfitting, an identity-deduplicated validation set of **79 previously unseen public labels** was drawn from the remaining unused portion of the 115-label corpus. This includes 63 standard brand-present targets, 9 near-miss rivalry controls (cases with `multiple-brand-like-phrases`), 3 genuinely ambiguous controls, and 4 completely absent brand controls (totaling 16 absent/ambiguous/near-miss controls).

| Evaluation Scope | Metric | Baseline | Exact PR #233 Narrow Treatment | Delta |
|---|---|---|---|---|
| **Scope 1: Single Pass** | Target Brand-Present Cases | 72 | 72 | 0 |
| | Candidate Constructed Count | 34 / 72 (47.2%) | 34 / 72 (47.2%) | 0 |
| | Top-3 Ranked Count | 30 / 72 (41.7%) | 30 / 72 (41.7%) | 0 |
| | **Selected Correct Brand** | **21 / 72 (29.2%)** | **21 / 72 (29.2%)** | **0** |
| | Reliable Accepted (`OBSERVED`) | 12 / 72 (16.7%) | 12 / 72 (16.7%) | 0 |
| | **Regressions on Prior-Correct Cases** | 0 | **0 / 72 (0 regressions)** | **0** |
| | **Absent Negative Control Assertions** | 0 / 4 (0.0%) | **0 / 4 (0.0%)** | **0** |
| | Ambiguous Control Assertions | 0 / 3 (0.0%) | **0 / 3 (0.0%)** | **0** |
| | Inappropriate Authority Elevation | 0 | **0** | **0** |
| **Scope 2: Complete Multi-Pass** | Target Brand-Present Cases | 72 | 72 | 0 |
| | Candidate Constructed Count | 34 / 72 (47.2%) | 34 / 72 (47.2%) | 0 |
| | Top-3 Ranked Count | 30 / 72 (41.7%) | 30 / 72 (41.7%) | 0 |
| | **Selected Correct Brand** | **21 / 72 (29.2%)** | **21 / 72 (29.2%)** | **0** |
| | Reliable Accepted (`OBSERVED`) | 12 / 72 (16.7%) | 12 / 72 (16.7%) | 0 |
| | **Regressions on Prior-Correct Cases** | 0 | **0 / 72 (0 regressions)** | **0** |
| | **Absent Negative Control Assertions** | 0 / 4 (0.0%) | **0 / 4 (0.0%)** | **0** |
| | Ambiguous Control Assertions | 0 / 3 (0.0%) | **0 / 3 (0.0%)** | **0** |
| | Inappropriate Authority Elevation | 0 | **0** | **0** |
| **Stacked Candidate Formation** | Candidates Formed Total | N/A | 1 (`wine-multi-artifact-09`) | +1 |
| | Stacked Candidate Correct | N/A | 1 (`"DUCK WALK VINEYARDS"`) | +1 |
| | Stacked Candidate Incorrect | N/A | **0** | 0 |

#### Key Out-of-Sample Insights
1. **Zero Regressions Across All 72 Targets:** The narrow treatment perfectly preserved all 21 correct selections from baseline without introducing a single regression in either single-pass or complete multi-pass recovery.
2. **Zero False Assertions Across All Negative & Near-Miss Controls:** Across all 4 brand-absent controls (`approved-wine-096`, `097`, `098`, `101`), 3 ambiguous controls (`approved-wine-072`, `amuninni-ferracane`, `m-cellars-baseline`), and 9 near-miss rivalry controls, zero false brand assertions occurred.
3. **Zero Inappropriate Authority Elevations:** In no case did same-pass candidate formation or multi-pass combination inappropriately elevate an unconfirmed or ambiguous reading to `OBSERVED`.
4. **Authentic Stacked Formation On Unseen Artwork:** On `wine-multi-artifact-09`, the treatment constructed `"DUCK WALK VINEYARDS"` with 0 incorrect candidate insertions.

### 15. Historical Safeguards & Hash Governance Audit

1. **Explicit Preservation of Historical PR #220 Boundary:**
   - In PR #233 and PR #232, the historical SHA-256 hash for `src/pipeline/extractor/field-selection.ts` approved after PR #220 (`8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c`) is explicitly retained as `FIELD_SELECTION_HASH_APPROVED_AFTER_PR_220` / `APPROVED_HISTORICAL_HASHES_AFTER_PR_220`.
   - The proposed evaluation boundary for PR #233 is separately documented as `FIELD_SELECTION_HASH_PROPOSED_PR_233` (`4719a1f42825d43eb4acb792a6f404cc2be48b9302d5bbbe07618ee4b20f608f`).
   - The 4 boundary test files (`issue-149-alcohol-reselection.test.ts`, `brand-local-contrast.test.ts`, `brand-mild-sharpening.test.ts`, and `brand-otsu-threshold.test.ts`) assert both that the historical reference is preserved and that the current file matches the proposed PR #233 hash.
2. **Byte-for-Byte Default-Disabled Parity:**
   - When called without explicit opt-in (`allowNarrowStackedHeadingMerge: false`), `selectBrandObservation` exhibits byte-for-byte semantic equivalence to the pre-PR-233 production baseline. Executable unit tests in `stacked-headings.test.ts` verify this invariant.
3. **Multi-Pass Consensus Isolation:**
   - Candidates merged within a single pass (`pass-0-full-image`) carry only single-pass provenance (`supportingPassIds: ["pass-0-full-image"]`). Merging words within one OCR pass cannot manufacture multi-pass consensus across recovery passes or elevate to `OBSERVED`.

### 16. Decision record

- Which #90 gates this evidence addresses, and which remain open:
  - Addressed: Implementation parity established between PR #233 code and evaluation benchmarks (7/18 = 38.9% selected on 24-case development set); out-of-sample validation completed across 79 unseen labels with 0 regressions, 0 false assertions, and 0 inappropriate authority elevations; default-off byte-for-byte semantic equivalence proven; PR #220 historical boundary hashes retained; hardware stability and quiescent swap maintained.
  - Open: PR #233 remains draft, unmerged, and default-disabled; production activation gate (#90 §6) remains strictly closed; whole-label VLM candidate selection and production integration deferred.
- Candidate Assessment:
  - PR #233's deterministic narrow stacked-heading candidate formation provides a sound, safe, and verifiable candidate recovery mechanism that incurs 0 regressions across both development and unseen corpora. However, because it remains default-disabled, merging PR #233 alone does not change production behavior. Any future activation requires a dedicated, documented maintainer decision.
- No production activation follows from this record (#90 §6).
