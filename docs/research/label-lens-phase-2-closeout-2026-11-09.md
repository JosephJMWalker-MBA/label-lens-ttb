# Label Lens TTB — Phase 2 research closeout and evidence ledger

**Record date:** 2026-11-09  
**Scope:** Supervised Jetson Orin Nano vision feasibility, paired OCR evaluation, and deterministic stacked-heading candidate formation (Phases 2A–2I)  
**Disposition:** **Experiment stopped. No production authorization.**  
**Related governance:** [Issue #231](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/231), [Issue #90](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/90), [Issue #226](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/226)  
**Research changes:** [draft PR #230](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/230), [draft PR #232](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/232), [draft PR #233](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/233)

> **Authoritative interpretation:** This closeout supersedes *interpretations and labels*, not the immutable raw observations, in earlier checkpoints. Where early prose disagrees with later replayed case-level evidence, use the corrected Phase 2I artifacts linked below. Earlier files and comments remain intact as an audit trail. No result in this document grants Issue #90 `6 approval.

## 1. Final decision and ownership boundary

1. **Park draft PR #233, unmerged and default-disabled.** Its narrow same-pass stacked-heading rule recovered `CHATEAU BONNEAU` on the 24-case development set but added **zero** treatment-only candidates and **zero** correct selections on the separate 79-case validation set. The predeclared stop rule was met; do not extend the same experiment post hoc merely to find a positive outcome.
2. **Preserve draft PR #230 and stacked draft PR #232, unmerged.** They record an experimental *transcription-reader* lane and its supporting evaluations. PR #230 contains configuration-gated production API integration that could replace bounded OCR if enabled; it is **not authorized**. Configuration-gated code is not a production approval.
3. **Keep the protected full-image Tesseract OCR baseline and deterministic, human-reviewable authority boundaries.** `AMBIGUOUS` is not an accepted finding; `OBSERVED` is not a government/compliance determination.
4. **Do not conflate transcription with the distinct Issue #90 stateless visual-*region observer*.** The latter's geometry, contamination, lifecycle, additive OCR, and `6 independent-authorization gates remain open. Running Qwen2-VL transcription on wine-label images did not satisfy those observer acceptance criteria.
5. **This is a research closure, not a product readiness declaration.** There are unresolved candidate-construction/ranking losses; any future effort requires a new scoped hypothesis, independently selected evidence and a separate owner decision.

**As of this record:** Issues #90 and #231 are open tracking records; #230, #232 and #233 are draft/unmerged. Do not interpret the passage of time or successful hosted CI as a change to that status.

## 2. Definitions — prevent invalid comparisons

| Term | Strict meaning |
| --- | --- |
| **Raw-text presence** | Ground-truth brand text appears as acceptable whole words *anywhere* in a reader's transcript. It says nothing about where on the label, candidate role or authoritative status. |
| **Candidate constructed** | Brand candidate matching acceptable presentation exists in the deterministic selection pool. This is not identical to any raw word substring. |
| **Selected correct** | The selector's winning brand value matches the frozen acceptable presentation. A correct-but-`AMBIGUOUS` selected value is **not** a reliable/accepted observation. |
| **Reliable/accepted** | In this evaluation's brand observation, correct `OBSERVED` selection; still only machine evidence for human review. |
| **False insertion** | Must identify the stage: raw text, constructed candidate, selected brand, or confident `OBSERVED` assertion. Hard-coded "false" is **NOT_EVALUATED**, not zero risk. |
| **Independent support** | Distinct OCR/model passes with authentic provenance. Reformatting two tokens from one pass must not create a second supporting pass. |
| **Development** | The 24-case set involved in discovering and tuning the stacked-heading hypothesis (18 brand-present; 6 absent controls); it is not independent validation of that proposal. |
| **Validation** | The separately frozen 79-case set (72 brand-present targets, 4 absent controls, 3 ambiguous controls). Nine *near-miss rivalry* examples are **within** the 72 targets, not nine additional brand-absent cases. |

Always separate **raw**, **candidate**, **selected**, **authority**, and **deployment** conclusions. Do not calculate uplift by comparing raw vision presence with OCR's selected-brand success.

## 3. Supervised hardware lane (Phase 2A–2C)

**Operator-reported on-device evidence**, reviewed against the published GitHub checkpoints; not an independent rerun on hardware by the documentation reviewer:

- Device: Jetson Orin Nano **8 GB**, isolated user-owned lab; four pre-existing Docker services preserved. Vision server bound to `127.0.0.1:18080` with SSH local forwarding where needed; stopped after runs. No customer artwork or production environment variables authorized.
- Pinned llama.cpp source commit: `998200491327347eed85f007e4de7a1a7c871453`. Reported server SHA-256: `3f37e521312058f74b769eca1afd423a3e5f13deab73f6b640f0ffddcdaa4bae`.
- Model: `ggml-org/Qwen2-VL-2B-Instruct-GGUF`, revision `bb307c036e8a1ed7b663bbd0c35b41c4c9294cfd`; reported model GGUF `Qwen2-VL-2B-Instruct-Q4_K_M.gguf` SHA-256 `5745685d2e607a82a0696c1118e56a2a1ae0901da450fd9cd4f161c6b62867d7`; projector `mmproj-Qwen2-VL-2B-Instruct-Q8_0.gguf` SHA-256 `a0ad91f00a7a80dcf84d719a61b00ee2e07b71794f4ee2dfa81a254621a8c418`. Upstream Qwen2-VL-2B was reported Apache-2.0; license/legal review for intended future deployment is not granted by this statement.
- Phase 2A genuine inference succeeded after a 975×1500 image exceeded the **2048-token context** (2,105 prompt/image tokens); resizing to 520×800 reduced input to 766 prompt tokens. One successful wine-label JSON result is **smoke evidence**, not field-level corpus accuracy. Cold/warm inference approximately 5.68/5.48 seconds; 32.8-second model load.
- Phase 2B: **10 approved fixtures / 11 brand occurrences**, repeated three times on the same inputs. Vision transcript matched expected brand in **8/11 per run**, but **0/11** passed reliability. Every output self-reported `legibility: "partial"`, mapped to 0.5, below the 0.8 reliable threshold. Consequently **0 reliable-but-wrong is vacuous**, because none was reliable. A repeating `EYEBROW` completion in `approved-wine-035` distorted p95 latency.
- Resource evidence: a reported minimum of approximately **2.2 GB available RAM** during the smoke test and retained healthy Docker containers; swap occupancy increased during testing but measured `vmstat` swap-in/out activity was quiescent in a bounded sample. Five-minute RAM recovery was *partial relative to the earlier baseline*. No proof of a long-duration leak-free lifecycle, strict/warm equivalence, or observer resource gate follows.
- Phase 2C's **11 same-crop** comparison usefully exposed complementary candidate-text recovery, but original OCR and VLM preprocessing and scoring stages differed. It is **not** evidence of a 2.6×, 44.5-point, or any other production accuracy uplift.

See [Issue #231](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/231) for supervisor checkpoints and the [measurement plan at the frozen research commit](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/deploy/orin/MEASUREMENT-PLAN.md).

## 4. Canonical textual-evidence evaluation (Phase 2D–2F)

The **24-case** evaluation set contains **18 brand-present** and **6 brand-absent** controls. The original v1 report, corrected v2 replay, and full-OCR reconciliation have different input scopes:

| Measurement | Correct final scope/value | Essential limitation |
| --- | --- | --- |
| Tesseract raw brand presence from *archived 300-character transcript previews* | **15/18** | Excludes text beyond character 300; **not complete OCR**. |
| Tesseract raw brand presence from replayed complete primary OCR | **16/18** | `approved-wine-012` adds `Cooley Bay Winery` in fine print beyond preview. |
| Vision raw brand presence with multilined degeneration rejection | **13/18** | Includes no spatial/text-role classification; one 60-line repetition in `approved-wine-006` rejected. |
| Genuine VLM-only whole-label raw presence in the matched cases | **1/18** | `approved-wine-011`, `MariaAntonietta`. `approved-wine-012` is **not** VLM-only on full-text OCR. |
| Correct Tesseract candidates constructed and kept in primary-pass selector | **8/18** | Much correct raw text never becomes an eligible brand candidate. |
| Correct Tesseract winner selected | **6/18** | Primary-pass *selection* only, not full production extraction performance. |
| Correct machine-authoritative selection on these 18 cases | **0/18** | All six correctly selected were held `AMBIGUOUS` in this evaluation. |

The complete-primary-OCR loss taxonomy is **2 raw misses + 8 candidate-formation losses + 2 ranking displacements + 6 correct-but-AMBIGUOUS = 18**. Diagnose future opportunities at each stage rather than assuming additional model inference is the dominant bottleneck.

**Case `approved-wine-012` is the key scope correction:** vision read the prominent hero brand `Cooley Bay` cleanly; full OCR also contained that brand in a fine-print producer statement, but the selector excluded that producer line. Vision contributed *hero-position clarity*, not brand text absent everywhere from OCR.

The Phase 2E additive 6/18→7/18 was an **oracle-assisted synthetic upper bound**: manually supplied expected tokens, fictional 95% confidence and constructed geometry, not a truth-blind live adapter. Its 0/6 negative-control result used truncated, synthetic inputs and is not an absent-brand safety certification. Any transcript with degenerate repetition must be rejected before length-capping; JSON schema validity alone is insufficient.

Source-of-truth artifacts at the **immutable PR #232 Phase 2I commit**:
- [Held-out 24-case manifest](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/held-out-manifest.json).
- [Original archived v1 report](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/report-v1.json) and [retrospective v2 report](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/report-v2.json).
- [Full evidence reconciliation](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/evidence-reconciliation.json) and [candidate loss diagnosis](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/candidate-selection-diagnosis.json).
- [Offline scoring script](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/scripts/vision/score-v1-to-v2.ts), [reconciliation script](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/scripts/vision/reconcile-evidence.ts), and [oracle-assisted simulation](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/additive-counterfactual-report.json).

## 5. Deterministic stacked-heading treatment (Phases 2F–2I)

The specific hypothesis was a *single-OCR-pass* stacked heading, e.g. `CHATEAU` over `BONNEAU`. The implementation in PR #233 adds an **explicitly opt-in, default-off** narrow candidate merge within the original OCR candidate pool. It retains original source words, confidence, geometry and pass ID; it must not fabricate additional OCR evidence, independent passes or extra authority.

**Corrections in evaluation chronology:**

| Stage | Finding | Valid interpretation |
| --- | --- | --- |
| **2F** | 6/18→7/18 after an artificial extra `focus-crop` pass with assigned 94% confidence | Synthetic-pass *feasibility*, **not** actual same-pass gain. |
| **2G** | 6/18→7/18 with a same-pass *coherent-line-merge surrogate* | Not identical to the narrower PR #233 predicate; cannot claim implementation parity yet. |
| **2H** | Exact PR #233 treatment also 6/18→7/18, recovering `CHATEAU BONNEAU`; no development-set selected regressions | Real exact-implementation improvement **on development cases**, still `AMBIGUOUS` and not independent validation. |
| **2H early report** | Credited `DUCK WALK VINEYARDS` as a new correct stacked candidate on validation | **Retracted**: baseline already constructed and selected this candidate as `OBSERVED`. |
| **2I final** | Recomputed candidate differences and replayed actual extractor branching | **0 treatment-only candidates, 0 correct-selection gains** on 79 cases; park feature. |

**Phase 2I authoritative 79-case result** (72 brand-present targets + 4 absent controls + 3 ambiguous controls; 9 near-miss cases are a subset of targets):

| Metric | Frozen baseline | Exact narrow treatment | Increment attributable to treatment |
| --- | ---: | ---: | ---: |
| Correct selected brand, single primary OCR | **21/72** | **21/72** | **0** |
| Correct selected brand, production-policy replay | **21/72** | **21/72** | **0** |
| Correct `OBSERVED` selections in each scope | **4/72** | **4/72** | **0** |
| New treatment-only candidate formations | — | **0** | **0** |
| Previously correct selections regressed | — | **0** | **0 observed** |
| Absent-control false selected brands | **0/4** | **0/4** | **0** |
| Ambiguous-control selected assertions | **0/3** | **0/3** | **0** |
| Inappropriate `OBSERVED` elevations | — | **0** | **0** |

**Near-miss truth is not “0/9 wrong.”** Of the nine brand-present rivalry cases, **7/9 selected the wrong brand in both conditions**, all `AMBIGUOUS`; zero were confidently wrong `OBSERVED` and **zero** wrong selections were introduced by the treatment. The negative/control set is too small to claim general safety.

**Exact production-policy replay** respects the actual `extractor.ts` branch: conditionally request alcohol recovery based on `primaryAlcohol` status, retain `primaryBrand` when `OBSERVED`, and otherwise reselect across the planned OCR passes. Earlier Phase 2H multipass runs forced alcohol recovery and always recomputed; use Phase 2I for production-policy comparisons.

**Independent-value verdict:** the single `CHATEAU BONNEAU` development recovery prompted a valid hypothesis and an orderly experiment, but there was **no demonstrated incremental gain on independent validation artwork**. No post hoc tuning, new model or larger sample is authorized by this closure.

Canonical Phase 2I evidence at immutable commit `063bcf9b7b563331624b67f252d539efc467279e`:
- [Frozen 79-case validation manifest](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/out-of-sample-validation-manifest.json).
- [Preserved pre-correction v1](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/out-of-sample-validation-report-v1.json) and [corrected v2](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/out-of-sample-validation-report-v2.json).
- [Production-policy attribution report](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/production-policy-attribution-report.json) and [exact runner](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/scripts/vision/evaluate-production-policy-attribution.ts).
- [Exact dev-case parity report](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/063bcf9b7b563331624b67f252d539efc467279e/artifacts/held-out-validation/exact-implementation-parity-report.json).
- [OCR-only default-disabled implementation](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/eab3a4c9eff909de170fdd815c73d60c79993cda/src/pipeline/extractor/field-selection.ts), [stacked-heading guard](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/eab3a4c9eff909de170fdd815c73d60c79993cda/src/pipeline/extractor/stacked-headings.ts), and [unit tests](https://github.com/JosephJMWalker-MBA/label-lens-ttb/blob/eab3a4c9eff909de170fdd815c73d60c79993cda/src/pipeline/extractor/stacked-headings.test.ts).

## 6. Historical corrections ledger — do not repeat superseded claims

1. **8/11 vision vs 29/105 full-image Tesseract selection**: invalid cross-corpus/cross-stage comparison.
2. **14/18 vision raw vs 6/18 OCR selected**: invalid apples-to-oranges “uplift”; corrected by equal-stage comparisons.
3. **0/6 vision absent-field false insertions** in the first evaluator: originally hard-coded `false`, hence **NOT_EVALUATED**. Later synthetic zero-insertion observations have constrained input scopes.
4. **“0 reliable-but-wrong” implies safe reliable inference**: false for Phase 2B because **zero** vision readings were reliable.
5. **“Vision-only 2/18” whole-image recovery**: from truncated OCR previews only; full OCR makes it **1/18**. `Cooley Bay` is present in fine print in full OCR.
6. **15/18 vs 16/18 OCR raw presence**: both valid *only* under explicitly different 300-character-preview versus full-OCR scopes.
7. **Phase 2B “24 labels” or combined “48 unique labels”**: incorrect. Phase 2B had **10 fixtures / 11 occurrences**; development set had 24 cases and overlaps in underlying artwork may exist.
8. **“7/18 vision additive improvement”**: oracle-provided truth tokens, invented confidence and coordinates, not end-to-end vision product evidence.
9. **Phase 2G Condition C = exact PR #233 code**: false; it used a broader coherent-merge surrogate. Exact narrow implementation was evaluated separately.
10. **“1/1 new stacked candidates” on 79 unseen cases**: false attribution. `DUCK WALK VINEYARDS` was already present under the baseline; **0** treatment-only candidates.
11. **“0/9 near-miss misclassifications”**: false if interpreted as total error. **7/9 incorrect selected values existed** before and after, all gated `AMBIGUOUS`.
12. **Phase 2H “complete production multipass”**: early harness did not mirror conditional alcohol recovery and primary `OBSERVED` shortcut. Phase 2I added explicit production-policy replay.
13. **“No regression observed” = “safe/production-ready”**: unsupported. Tests cover bounded public development and validation samples, not long-term, external, or all customer artwork.

Earlier measurement-plan sections are historic working notes; this closeout and the **Phase 2I corrected artifacts** govern any final claims.

## 7. Validation, reproducibility and residual uncertainty

- **Code/CI:** PR #233 final head `eab3a4c9eff909de170fdd815c73d60c79993cda`; [CI run 42639089930](https://github.com/JosephJMWalker-MBA/label-lens-ttb/actions/runs/42639089930). PR #232 final head `063bcf9b7b563331624b67f252d539efc467279e`; [CI run 42639131514](https://github.com/JosephJMWalker-MBA/label-lens-ttb/actions/runs/42639131514). Each final run had successful lint/typecheck/test/build, Playwright, and MySQL integration jobs. One prior PR #233 attempt failed before a successful rerun; never state every historical attempt was green.
- **Hash governance:** Preserve historical post-PR #220 `field-selection.ts` boundary SHA-256 `8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c` separately from PR #233's proposed modified-file SHA-256 `4719a1f42825d43eb4acb792a6f404cc2be48b9302d5bbbe07618ee4b20f608f`. Updating a test hash is not by itself proof that the old production behavior is equivalent; explicit default-off and behavior tests were added.
- **Replay instructions:** check out the exact immutable evidence commit before rerunning scripts, use frozen fixture manifests/asset hashes, run the existing project test/format/typecheck workflow, and compare generated case-level JSON and counts. Do not overwrite v1 source artifacts. Case-level validation runner and report were committed; this closeout itself does **not** assert an independent local replay of all scripts or hardware.
- **Held-out nuance:** The 79 labels were selected from a frozen public development corpus and reported identity-deduplicated. They were unused for this particular stacked-heading design; that is **not** an external population sample, a guarantee against near-duplicate artwork, or proof of future accuracy.
- **Hardware limits:** No completed Issue #90 stateless observer contamination/region-geometry result, no proven production steady-state memory lifecycle, no production whole-label vision candidate selector, no demonstrated reliable vision-based brand acceptance, and no deployment licensing/retention authorization.
- **Status provenance:** This closeout records evidence and review status at the listed commits and time. If PR status changes later, update the decision record with an explicit subsequent approval or superseding document; do not retroactively rewrite this historical conclusion.

## 8. Resume gates — only if a *new* decision is made

**Do not continue this closed stacked-heading experiment merely to find an uplift.** A new OCR proposal needs a distinct measurable hypothesis (e.g., overlong line sub-span formation, producer-line disambiguation, ranking diagnostics), a frozen predeclared scoring rubric, untouched identity-deduplicated cases including genuine absence/near-miss controls, production-path equivalence, and explicit acceptance/stop criteria. Keep raw, constructed, selected and authoritative evidence separate.

**Do not activate the Jetson transcription reader.** Any renewed vision work must first choose whether it is the transcription lane or the distinct #90 stateless region-observer lane, then satisfy that lane's real-model provenance, contamination, resource lifecycle, schema, additive OCR, privacy and human-review gates. All production integration, persistence, UI and network changes require separate maintainer authorization under #90 `6.

**No actions implied by this record:** merge any PR; close Issue #90; change defaults or confidence thresholds; run the full corpus; install models or dependencies; start systemd/LAN services; copy customer artwork; enable `LABEL_LENS_VISION_*` in deployment.

---

**Closing principle:** A clean, reproducible result that says *no measured generalization* is a useful result. Preserve it without promoting the treatment. The next engineering investment should be decided from independently measured candidate-selection losses—not from the sunk cost of this experiment.
