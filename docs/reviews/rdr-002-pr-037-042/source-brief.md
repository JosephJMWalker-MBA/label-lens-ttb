# Rubber Duck Review 002 — Source Brief

- **Review id:** `rdr-002-pr-037-042`
- **Review set:** PR [#37](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/37), PR [#41](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/41), and PR [#42](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/42)
- **Starting `main` HEAD:** `b2ea2bfc9bd42d3507f94eb0dfa8ac496800b82e`
- **Governing process:** [Rubber Duck Review 2.0](../../rubber-duck-review-2.0.md), issue [#21](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/21)
- **Evidence date:** 2026-07-11

## Review boundary and method

This is a documentation review of three merged pull requests. It does not alter production code, tests, fixtures, schemas, runtime configuration, or issue scope. The review examined the complete PR bodies, commit ranges, changed-file sets, merged repository state, relevant tests and documentation, open planning issues, ADRs, and CI configuration. GitHub reported no conversation comments, submitted reviews, or inline review threads on any of the three PRs; PR #37's adversarial review history is instead recorded in its correction commits and PR body.

The governing distinctions in this brief are:

- **Verified fact:** directly present in a merged file, commit, PR/issue record, or test.
- **Author-stated rationale:** an explanation in a PR body, issue, commit, ADR, or governing document.
- **Reviewer inference:** an interpretation derived from the verified evidence.
- **Unresolved question:** evidence needed before a durable conclusion can be made.

## Governing context

The [Engineering Constitution](../../engineering-constitution.md) requires evidence before assumption, evidence-only probabilistic extraction, deterministic rules, preserved ambiguity, human authority, explainability, accessibility, privacy, and measured improvement. ADR [0002](../../adr/0002-ai-extracts-rules-decide.md), ADR [0003](../../adr/0003-ocr-is-evidence-not-truth.md), and ADR [0004](../../adr/0004-local-first-replaceable-analysis.md) establish the same extraction/rule/human separation and local-first direction.

ADR [0009](../../adr/0009-freeze-architecture-until-thin-vertical-slice.md) froze further architecture until a real upload-to-disposition slice existed. It specified a three-rule slice including government-warning verification and required end-to-end and per-stage timing. PR #37 ultimately implemented a formally revised two-field, six-rule boundary without government-warning execution, and deliberately excludes timing from deterministic result and export contracts. [Slice 3 acceptance](../../slice-3-acceptance.md) documents that revised behavior. No merged ADR supersedes or amends ADR 0009, so the implementation is coherent with the revised PR/issue boundary but the accepted ADR remains historically stale.

The [Design Review Checklist](../../design-review-checklist.md) and [Operator Trust and Throughput Policy](../../operator-trust-and-throughput.md) are both truncated in the current repository. Issues [#27](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/27) and [#28](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/28) already record the policy replacement and documentation-integrity work.

## PR #37 — Slice 3: local wine pre-check vertical slice

### Verified facts

**Problem solved.** PR #37 moved the repository from a largely conceptual prototype to one operational domestic-wine pre-check. A user can submit one PNG or JPEG, enter declared brand and alcohol values, run local OCR, inspect evidence and ordered findings, append an operator disposition, and download canonical JSON plus a readable HTML report. Evidence: PR #37; [Slice 3 acceptance](../../slice-3-acceptance.md); `tests/e2e/home.spec.ts`.

**Product boundary.** The implemented evidence scope is brand name and alcohol statement only. It is advisory, domestic-wine only, accepts one image, produces no aggregate compliance score, and does not execute designation/appellation, net-contents, government-warning, persistence, batch, PDF, cloud fallback, or government-integration workflows. Evidence: PR #37; [Slice 3 acceptance](../../slice-3-acceptance.md); `src/pipeline/precheck/wine-precheck.profile.ts`; `src/domain/stale-modules.test.ts`.

**Scale of change.** The PR contains 20 commits, 128 changed files, 16,375 additions, and 734 deletions. Twelve implementation commits were followed by corrections A through H after adversarial review. Evidence: PR #37 metadata; commit range `4974d03` through `7d841e2`.

**Local-only OCR.** The production path uses `tesseract.js@7`, a committed English traineddata file, Sharp preprocessing, deployment-relative asset lookup, and no external AI call. `next.config.mjs` traces server assets, and `scripts/relocation-smoke.mjs` copies standalone output outside the checkout and runs real OCR there. Evidence: `src/pipeline/extractor/ocr-engine.ts`; `src/pipeline/extractor/extractor.ts`; `src/server/asset-packaging.test.ts`; `scripts/relocation-smoke.mjs`; correction B `bcc40ff`.

**Evidence-only contract.** Analyzer schemas represent observation state, value, raw text, confidence, geometry, alternates, and provenance, and reject regulatory-decision vocabulary and contradictory states. Findings are produced separately by deterministic rules. Evidence: `src/pipeline/analyzer/analyzer.schema.ts`; `src/domain/evidence/evidence.schema.ts`; `src/domain/verification/finding.schema.ts`; their test suites; ADR 0002.

**Conservative brand extraction.** Producer lines, regulatory text, pure varietal/designation text, domain-like text, and numeric-only vintage text are excluded. A remaining line becomes `OBSERVED` only with a bounded positive signal such as a brand designator or possessive; otherwise it remains `AMBIGUOUS`. The M Cellars fixture remains `AMBIGUOUS` and its brand rule remains `NEEDS_REVIEW`. Evidence: `src/pipeline/extractor/field-selection.ts`; `src/pipeline/extractor/field-selection.test.ts`; corrections A and H (`e5a6e20`, `7d841e2`).

**Confirmed cross-layer defect.** For a single plausible but unclassified line such as `LIVE BOLDLY` or `NAPA VALLEY`, `selectBrandObservation` returns `AMBIGUOUS` with an empty `alternates` array. The shared `observationSchema` requires every `AMBIGUOUS` observation to retain at least one distinct alternate. An independent module-level probe therefore returned `INVALID_SHAPE: fields.brandName.alternates: AMBIGUOUS must preserve at least one distinct alternate candidate.` `extractLabelEvidence` validates the selected observations through that schema, so this input becomes an extraction failure rather than the intended usable ambiguous evidence. Selector tests assert the pre-validation state, and schema tests assert the rule separately; no composition test covers the contradiction. Evidence: `src/pipeline/extractor/field-selection.ts`; `src/domain/evidence/evidence.schema.ts`; `src/pipeline/extractor/extractor.ts`; `src/pipeline/extractor/field-selection.test.ts`; independent RDR-002 probe.

**Alcohol behavior.** The parser accepts bounded anchored direct/range forms, uses exact integer basis-point representation, and rejects arbitrary surrounding prose and wine proof forms. Declared `12.5` matches the observed fixture statement; declared `13` fails the exact declared comparison. Actual-content-dependent rules remain `not_run_external_dependency`. Evidence: `src/domain/rules/wine-alcohol-parse.ts`; `src/domain/rules/wine-alcohol.rule.ts`; `src/domain/rules/wine-alcohol.rule.test.ts`; `src/server/precheck-acceptance.test.ts`.

**Status and rule model.** The implementation preserves processing, evidence, finding, and human-disposition concepts separately. Its ordered wine profile contains six rules; three are actual-content-dependent not-run outcomes for the current artwork-only input. Finding order, versions, authorities, evidence references, and compatible execution/finding states are runtime validated. Evidence: `src/domain/run/run-status.ts`; `src/pipeline/precheck/wine-precheck.profile.ts`; `src/pipeline/precheck/precheck.schema.ts`; `src/pipeline/result/result.schema.ts`; `src/server/precheck-acceptance.test.ts`.

**Provenance and identities.** Runtime provenance records adapter, OCR engine/model digest, parser, profile, rules, authorities, application build, and artifact identities. Assembly cross-validates supplied layers. The machine-result id hashes immutable machine content but excludes human disposition history. The JSON checksum covers the complete export payload except its integrity block. A separate HMAC append token authorizes disposition append for `append-token.v1:<machineResultId>`. Evidence: `src/server/runtime-provenance.ts`; `src/pipeline/result/assemble.ts`; `src/pipeline/result/serialize.ts`; `src/pipeline/export/json/build-json-export.ts`; `src/server/append-token.ts`; corrections D and H (`2ac4127`, `7d841e2`).

**Human disposition and report.** Disposition entries are append-only within the submitted history, carry contiguous sequence numbers and bounded references, and do not alter machine findings or identity. The HTML report is deterministic, escapes controlled text, distinguishes machine outcomes from human workflow, and contains the JSON checksum. Evidence: `src/pipeline/result/disposition.ts`; `src/server/precheck-service.ts`; `src/pipeline/export/report/build-report.ts`; `src/app/api/precheck/disposition/route.ts`; their tests.

**Defensive limits.** The route and extractor bound declared request size, actual file size, media type, dimensions, decoded pixels, frames, OCR regions, scale, intermediate pixels, and OCR text. Worker termination occurs in `finally`. Evidence: `src/server/resource-policy.ts`; `src/app/api/precheck/route.ts`; `src/pipeline/extractor/image-integrity.ts`; `src/pipeline/extractor/regions.ts`; `src/pipeline/extractor/worker-lifecycle.test.ts`; correction F `1337e2c`.

**UI and accessibility.** The workspace uses labels, semantic sections, alerts, polite live regions, keyboard-operable native controls, disabled/loading states, and text rather than color alone to communicate results. Browser tests exercise sample/upload, disposition, and downloads. There is no dedicated automated accessibility scanner in CI. Evidence: `src/features/precheck/PrecheckWorkspace.tsx`; `src/features/precheck/ResultView.tsx`; `src/features/precheck/DispositionSection.tsx`; component tests; `tests/e2e/home.spec.ts`.

**Verification evidence.** PR #37 reports 528 Vitest tests across 52 files, format/lint/typecheck/build success, four Playwright tests, a relocated real-OCR smoke, and a clean final tree at `7d841e29...`. The correction history explicitly records a first `NOT READY` review, seven A–G corrections, a second review with three remaining defects, correction H, and a final `READY FOR PR` review. There are no GitHub review objects corroborating that history; the commits and PR narrative are the available repository record.

### Author-stated rationale

- A narrow complete path was preferred over broad incomplete coverage (PR #37; ADR 0009).
- Ambiguity is intentionally preserved to reduce false passes and automation bias (PR #37; Engineering Constitution principles 1–3).
- Local OCR satisfies restricted-network and provider-replacement constraints (PR #37; ADR 0004).
- Machine identity, JSON integrity, and append authorization solve different problems: stable machine-content identity, change detection, and proof that this server issued append authority (PR #37; [Slice 3 acceptance](../../slice-3-acceptance.md)).
- Resource policy is defensive availability control, not regulation (PR #37; [Slice 3 acceptance](../../slice-3-acceptance.md)).

### Known limitations and deferred work

- Only one real label demonstrates OCR behavior; no general accuracy claim is made.
- Genuine brands without a recognized positive signal may remain ambiguous.
- `request.formData()` may buffer an absent/misreported-length request; no distributed rate limit or cross-instance OCR concurrency control exists.
- Each request creates a Tesseract worker; no bounded timeout or queue is implemented.
- OCR reproducibility is demonstrated only on the tested locked runtime/platform.
- Development append tokens fail after restart; production key rotation invalidates outstanding tokens.
- The append token is a reusable bearer capability. Without persistence, the same original export/token can seed divergent client-held disposition histories; append-only means append-only within each validated submitted history, not a globally serialized audit log.
- Uploads and disposition state are ephemeral. Losing the browser-held result/token requires rerunning the pre-check.
- Per-stage and end-to-end runtime are not part of the result/export and were not recorded as ADR 0009 required. Measurement is deferred to issue #15.
- A lone unclassified brand candidate currently violates the shared ambiguity schema and is converted into a typed extraction failure.

### Claims explicitly not made

- Universal OCR determinism, universal serverless compatibility, representative accuracy, production certification, official TTB approval, legal advice, persistent auditability, account authorization, or general domestic-wine coverage.

### Reviewer inference

The three identity/integrity/authorization layers are technically distinguishable and corrected real attacks, so none is redundant merely because all use hashes. Their combined cognitive cost is nevertheless high for a first slice, and the distinction is durable enough for an ADR and a single conceptual diagram. The numerous duplicated runtime shapes across analyzer, result, export, and service boundaries provide strong rejection behavior but increase schema drift and test coupling. The confirmed selector/schema contradiction demonstrates that green unit suites at adjacent layers do not prove their composition. That defect should be fixed before measurement work treats extraction failures as meaningful system outcomes; after that, measurement should take priority over adding another contract layer.

### Unresolved questions

- What are median/p95 total and per-stage latencies on the supported deployment mode?
- How many real labels become `AMBIGUOUS`, and does that preserve trust or create excessive rework?
- What operational recovery is acceptable after token loss, process restart, or signing-key rotation?
- Is one-worker-per-request viable under concurrent reviewer load?
- Which Slice 3 revision formally supersedes ADR 0009's three-rule/timing definition of done?

## PR #41 — Document the remaining work sequence

### Verified facts

**Problem solved.** PR #41 added one 540-line repository plan connecting otherwise separate backlog issues. It changed documentation only. Evidence: PR #41; commit `fe8d5f9`; [Remaining Work Plan](../../remaining-work-plan.md).

**Planning approach.** The plan adopts “evidence and measurement before expansion,” places fixture corpus #10 before evaluation #15, then sequences designation/appellation #39, net contents #40, normalization #6, rule governance #16, deployment #13/#11/#12, persistence #17, and fallback #24/#14/#29. It also defines parallel governance, measurement, and external-observation lanes. Evidence: [Remaining Work Plan](../../remaining-work-plan.md).

**Backlog changes recorded.** PR #41 states that #6 was rewritten as bounded field-specific normalization, #16 narrowed to rule governance, and #38–#40 created for operator metrics and new evidence slices. The retrieved issue records confirm those open issue bodies. Evidence: PR #41; issues [#6](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/6), [#16](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/16), [#38](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/38), [#39](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/39), and [#40](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/40).

**Executable detail.** Each phase has goals, guardrails, or exit criteria, and the plan establishes small-PR discipline. It is more than a feature list. However, issue #15's current body is truncated after an obsolete `tests/fixtures/labels/...expected-fields.json` layout, and issues #13 and #14 are also truncated. Evidence: retrieved GitHub issue records for [#13](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/13), [#14](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/14), and [#15](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/15).

**Dependency conflicts.** The plan puts #39 and #40 before #6 and #16. Issue #39 says it depends on #6 and #16 before final profile activation. Issue #40 says it depends on #6 and #16 and follows #39. Issue #6 says designation/appellation and net-contents policies should not be implemented until those evidence slices exist. Issue #16 depends on implemented evidence fields and #6. Read literally as blocking whole issues rather than staged deliverables, these relationships form cycles.

**Governance ordering mismatch.** The plan orders #27 → #28 → #21, yet the current accepted operator policy and design-review checklist are already truncated, RDR-002 is being performed manually under #21, and documentation integrity is needed to prevent more incomplete governing artifacts. Evidence: [Remaining Work Plan](../../remaining-work-plan.md); issues #21, #27, #28; local governing documents.

### Author-stated rationale

- A versioned repository plan preserves dependency logic better than isolated issue bodies (PR #41).
- Corpus should precede evaluation so tuning is not measured against invented or hidden answers (PR #41; Remaining Work Plan phase 1).
- New evidence fields should precede rules that depend on them, and fallback should be measured rather than assumed (Remaining Work Plan; issues #24 and #29).
- Governance and external-observation work can proceed without widening the production feature path (Remaining Work Plan).

### Reviewer inference

The plan is executable at the phase level but too strict as a single linear issue chain. Several relationships are “must exist before activation,” not “the whole predecessor issue must close before implementation starts.” Treating contract design, evidence extraction, rule activation, and measurement as sub-stages removes the cycles without abandoning evidence-first sequencing. Deployment-mode definition also informs safe evaluation and telemetry and can run in parallel earlier than the current chain suggests.

### Unresolved questions

- Should #39/#40 split evidence-contract/extraction work from rule activation so #6/#16 dependencies apply only to activation?
- Should #13 deployment-mode definition run alongside #15, even if deployment implementation remains later?
- Should #28 documentation integrity precede or accompany #27 rather than wait for it?
- Which issue owns amendment of stale ADR 0009 and other pre-Slice-3 current-behavior claims?

## PR #42 — Slice 4a: expand domestic-wine fixture corpus

### Verified facts

**Problem solved.** PR #42 created a versioned evaluation-only corpus contract, deterministic derivative tooling, privacy/provenance validation, truth-boundary checks, synthetic domain regressions, and a corpus-driven real-OCR regression. It changed no production extractor, rule, route, UI, or runtime configuration. Evidence: PR #42; commits `6e43b16` through `518d034`; changed-file list.

**Corpus contract.** `label-fixture-corpus.v1` records availability, source role, fixture paths, intended dimensions, bounded expected states/tokens, allowed and forbidden brand candidates, sufficiency, extraction outcome, declared comparisons, not-run rules, challenge tags, real-OCR enablement, synthetic evidence, and an exact truth-label prohibition. Cross-entry schema refinements reject duplicate ids/paths and invalid unavailable or synthetic states. Evidence: `src/fixtures/corpus-index.types.ts`; `src/fixtures/corpus-index.schema.ts`; `src/fixtures/corpus-index.test.ts`.

**Actual composition.** The committed index has 14 entries: one enabled real-OCR M Cellars fixture, one disabled low-resolution derivative of the same M Cellars image, one unavailable VENOM gap, and **eleven** domain-only synthetic cases. PR #42's body says “10 domain-only synthetic cases”; the merged index contains eleven. Evidence: `tests/fixtures/precheck/corpus-index.json`; PR #42.

**Source-chain manifests.** Available binary fixtures reference strict `label-fixture-manifest.v2` manifests. Tests recompute on-disk image hashes, byte sizes, media types, and dimensions and validate manifests. Unknown/unretained source facts use explicit sentinels. Evidence: `src/fixtures/corpus-index.test.ts`; `src/fixtures/fixture-manifest.schema.ts`; fixture manifests.

**Low-resolution derivative.** The new 601×245 PNG is generated from the committed M Cellars OCR JPEG using fixed Sharp parameters. Its exact committed identity is tested; cross-platform byte identity is explicitly not claimed. It is disabled for real OCR, and its allowed observation states are deliberately broad. Its manifest's formal parent is `external-source`, while a provenance note and transformation description identify the actual immediate committed parent file. Evidence: `scripts/fixtures/generate-lowres-derivative.mjs`; `tests/fixtures/precheck/m-cellars-lowres-24205001000905/manifest.json`; corpus index.

**Synthetic cases.** Constructed OCR token lines cover a clean positive brand, producer, varietal, slogan, website, vintage, and appellation confusion, direct/range/malformed alcohol, and insufficient evidence. Tests pass those token lines directly to production field selectors. They measure deterministic selection/parsing behavior after OCR; they do not measure image preprocessing or OCR recovery. Evidence: `src/fixtures/corpus-adversarial.test.ts`; corpus index.

**VENOM entry.** Rainbow Hills Winery / VENOM is recorded as unavailable, with no asset, manifest, transcript, or challenge tags. It makes the missing evidence explicit and prevents fabrication but contributes no executable measurement. Evidence: corpus index; [Fixture Corpus](../../fixture-corpus.md).

**Truth separation.** Production source does not statically import corpus/manifest modules, and `ExtractionInput` is checked for forbidden expected-answer/id/tag field names. These are useful architecture alarms but depend partly on source-text searches and cannot prove the absence of every dynamic, aliased, or semantically renamed path. Evidence: `src/fixtures/truth-boundary.test.ts`.

**Privacy screening.** Corpus tests restrict file extensions and search the index text for email and formatted phone patterns. Manifests describe manual exclusion of certificate/contact/signature regions. Tests prove repository consistency and selected textual patterns; they do not independently prove what was removed from an unavailable original or visually classify every pixel. Evidence: `src/fixtures/corpus-index.test.ts`; fixture manifests; [Fixture Corpus](../../fixture-corpus.md).

**Runtime and size.** PR #42 reports 618 Vitest tests, an approximately 4.5-second real-OCR corpus suite, an approximately 12-second full Vitest wall time, and approximately 172 KB repository-size impact. The new binary is 65,963 bytes; the full current fixture tree is approximately 780 KB. Evidence: PR #42; filesystem inspection.

### Author-stated rationale

- Corpus truth is evaluation input, never extractor input (PR #42; Fixture Corpus).
- Synthetic cases cheaply lock known semantic attacks without pretending to be public records or real OCR evidence (PR #42; `corpus-adversarial.test.ts`).
- An unavailable entry is more honest than fabricating provenance or committing prohibited certificate content (PR #42; Fixture Corpus).
- Production behavior was frozen so corpus work could measure rather than tune the current system (PR #42 scope boundary; Remaining Work Plan).

### Known limitations and deferred work

- No second public domestic-wine label is committed.
- Only one fixture executes real OCR; the low-resolution derivative is disabled.
- Curved text, integrated panels, glare, blur, perspective, and independent compression variation are not image-tested.
- The corpus is hand-curated and not statistically representative.
- Synthetic expectations may encode current selector assumptions and cannot reveal OCR failures.
- The unavailable VENOM record is inventory, not evidence.

### Claims explicitly not made

- General OCR accuracy, representative domestic-wine coverage, cross-platform derivative identity, executable VENOM coverage, or production-behavior improvement.

### Reviewer inference

PR #42 successfully created governance for a future corpus and preserved the production/evaluation boundary. It did not yet create enough independent real-image variation to support meaningful field-accuracy, false-observed, ambiguity-rate, or latency distributions. The repository is ready to design a harness, but not to set consequential thresholds or claim that harness output describes real-world reliability.

### Unresolved questions

- What minimum number and diversity of independently sourced real labels makes a baseline decision-useful?
- Can the low-resolution derivative be enabled in a platform-bounded job now, or does it need redesigned expectations first?
- Should source-chain schema express an immediate committed-derivative parent rather than relying on a note?
- Who approves that privacy screening retains enough realistic label evidence while excluding prohibited record content?

## Cross-PR dependency map

```text
PR #37: operational vertical slice
  one real label → local OCR → typed evidence → deterministic findings
  → HMAC-authorized disposition → canonical JSON + HTML report
        ↓
PR #41: repository work sequence
  evidence before expansion; #10 corpus → #15 evaluation → later fields/rules
        ↓
PR #42: fixture corpus contract
  one enabled real-OCR fixture + one disabled same-label derivative
  + eleven synthetic domain cases + one unavailable gap
        ↓
proposed issue #15: Kaizen evaluation harness
  baseline snapshots, per-field/per-fixture metrics, comparison, thresholds
```

### Is the ordering supported by implemented evidence?

**Yes at the architectural level.** A working production path exists before its harness; fixture truth is kept outside production; known false-positive attacks are encoded; the plan prevents rule expansion from racing ahead of measurement. Evidence: PRs #37, #41, and #42 together.

**Not yet at the representativeness level.** PR #42 mostly catalogues contracts and synthetic post-OCR cases around the same one real label used to build PR #37. It can falsify deterministic selector/parser regressions, but it cannot yet estimate general OCR recovery, ambiguity burden, false-observed frequency, or platform variation. Issue #15 is also truncated and describes an obsolete fixture layout. Evidence supports beginning bounded harness design only after its acceptance boundary is rewritten; consequential measurement needs more independent real-image evidence.

## Evidence inventory

### Pull requests and commits

- PR #37; merge `8890837`; commits `4974d03`–`7d841e2`.
- PR #41; merge `a96ee63`; commit `fe8d5f9`.
- PR #42; merge `b2ea2bf`; commits `6e43b16`–`518d034`.

### Governing and architecture documents

- [Engineering Constitution](../../engineering-constitution.md)
- [Design Review Checklist](../../design-review-checklist.md)
- [Rubber Duck Review 2.0](../../rubber-duck-review-2.0.md)
- [Remaining Work Plan](../../remaining-work-plan.md)
- [Slice 3 Acceptance](../../slice-3-acceptance.md)
- [Fixture Corpus](../../fixture-corpus.md)
- ADRs [0001](../../adr/0001-standalone-system-boundary.md), [0002](../../adr/0002-ai-extracts-rules-decide.md), [0003](../../adr/0003-ocr-is-evidence-not-truth.md), [0004](../../adr/0004-local-first-replaceable-analysis.md), [0005](../../adr/0005-use-cost-aware-openai-vision-fallback.md), and [0009](../../adr/0009-freeze-architecture-until-thin-vertical-slice.md)

### Open issues examined

- #6, #13–#17, #21, #24, #27–#29, and #38–#40.
- Issues #13, #14, and #15 have truncated current bodies; #15 also names a pre-corpus fixture layout.

### CI and known warnings

`.github/workflows/ci.yml` runs `npm ci`, format, lint, typecheck, full Vitest, production build, and Playwright on every pull request with Node 22. It does not run the relocation smoke or derivative-regeneration check. Known non-failing local warnings from the reviewed baseline include Next's `next lint` deprecation, Vite's CJS Node API deprecation, a jsdom navigation-not-implemented message in one passing component test, and Playwright's `NO_COLOR`/`FORCE_COLOR` warning.
