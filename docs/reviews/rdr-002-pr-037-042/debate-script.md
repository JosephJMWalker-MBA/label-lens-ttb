# Rubber Duck Review 002 — Debate Script

## Cast and evidence discipline

**Builder:** defends the merged work within its stated prototype boundaries.

**Reviewer:** challenges architecture, evidence quality, operations, security, testing, and sequencing. Each challenge labels itself as an **actual defect**, **accepted prototype limitation**, **future production concern**, **documentation mismatch**, or **unsupported claim**.

The voices cite PRs, issues, commits, files, tests, ADRs, and governing documents rather than inventing intent. The factual record is in [source-brief.md](source-brief.md).

## Opening: what changed across the three PRs?

**Builder:** PR #37 established the first real product loop: one domestic-wine label image enters a local OCR pipeline, becomes typed brand and alcohol evidence, passes through a six-rule deterministic profile, remains separate from human disposition, and exits as canonical JSON and a readable HTML report. PR #41 then prevented that foundation from expanding opportunistically by sequencing corpus and evaluation before new fields and providers. PR #42 froze production behavior and built a versioned corpus contract around the current slice. The cross-PR direction is deliberate:

```text
working path → explicit work sequence → evaluation corpus → measurement
```

Evidence: PRs #37, #41, and #42; [Slice 3 acceptance](../../slice-3-acceptance.md); [Remaining Work Plan](../../remaining-work-plan.md); [Fixture Corpus](../../fixture-corpus.md).

**Reviewer:** That is the intended story. The audit question is whether the last arrow is earned. PR #37 is a large implementation with 128 changed files and 528 passing tests, yet one real label exercises OCR. PR #42 creates 14 indexed entries, but eleven are synthetic token cases, one is an unavailable record, and the only new image is a disabled derivative of the same real label. Before calling this a measurement foundation, we must distinguish a well-governed test catalogue from representative evidence.

**Classification:** Evidence-quality challenge, not a claim that the implemented slice has no value.

**Plausible alternative:** Begin issue #15 only as harness plumbing with every output labeled “preliminary/non-representative,” while a parallel fixture-acquisition gate adds independent real labels before thresholds or product claims are permitted.

## Round 1: did Slice 3 need this many contracts?

**Builder:** The contracts encode the architecture rather than decorate it. Analyzer evidence, evidence sufficiency, deterministic findings, result assembly, export shape, disposition history, provenance, and HTTP responses have different trust boundaries. Shared refinements reject contradictory states, unresolved references, version drift, invalid geometry, stale machine identities, and client-injected decisions. Corrections D and E (`2ac4127`, `c24aaa8`) exist because looser copying and boundary validation were demonstrably inadequate.

Evidence: `src/pipeline/analyzer/analyzer.schema.ts`; `src/domain/evidence/evidence.schema.ts`; `src/domain/verification/finding.schema.ts`; `src/pipeline/result/result.schema.ts`; `src/pipeline/export/json/json-export.schema.ts`; `src/pipeline/result/provenance-reconciliation.test.ts`.

**Reviewer:** **Actual defect.** The contract count has already produced a composition failure. `selectBrandObservation` returns a lone unclassified slogan or appellation as `AMBIGUOUS` with no alternate. `observationSchema` rejects any `AMBIGUOUS` value without at least one distinct alternate. `extractLabelEvidence` composes those layers and therefore returns `INVALID_RESPONSE` instead of usable uncertainty. Selector tests and schema tests both pass because they test opposite halves separately. An independent RDR-002 probe reproduced the failure with `LIVE BOLDLY` and `NAPA VALLEY`.

Evidence: `src/pipeline/extractor/field-selection.ts`; `src/domain/evidence/evidence.schema.ts`; `src/pipeline/extractor/extractor.ts`; `src/pipeline/extractor/field-selection.test.ts`.

**Builder:** That does not invalidate the evidence-only architecture. It shows that the semantic meaning of `AMBIGUOUS` is overloaded: “multiple competing readings” and “one plausible reading that is not authoritative” are different uncertainty conditions. Correction H made the selector conservative but did not reconcile the shared state vocabulary.

**Reviewer:** Agreed. The smallest response is not to remove schemas; it is to align the uncertainty model and add a selector-to-analyzer integration test. One alternative is a distinct state such as `UNCLASSIFIED` or `NEEDS_CONFIRMATION`. Another is allowing `AMBIGUOUS` with a reason code and zero alternates. A third is returning `LOW_CONFIDENCE`, but that would conflate confidence with classification and is less faithful.

**Classification:** Actual defect; targeted hardening required before issue #15 interprets extraction failures.

**Verdict direction:** HARDEN the schema composition, KEEP the evidence/rule boundary.

## Round 2: evidence-only extraction and independent status

**Builder:** ADR 0002 and the Engineering Constitution require probabilistic components to emit evidence, not regulatory conclusions. The analyzer schema cannot emit `PASS`, `FAIL`, `APPROVED`, or government-warning conclusions. Evidence state, rule execution, finding status, and human disposition remain separate. This prevents low-confidence OCR from silently becoming a substantive failure and prevents AI output from impersonating human authority.

Evidence: ADR [0002](../../adr/0002-ai-extracts-rules-decide.md); [Engineering Constitution](../../engineering-constitution.md); `src/pipeline/analyzer/analyzer.schema.ts`; `src/domain/run/run-status.ts`; `src/pipeline/result/result.types.ts`.

**Reviewer:** This is the strongest durable boundary, but the status model must be judged by whether operators can use it, not only whether Zod rejects illegal combinations. Frequent ambiguity may protect against false passes while still making the product operationally unhelpful. There is no corpus-wide real-label ambiguity distribution and no operator-friction evidence yet.

**Classification:** Accepted prototype limitation and future measurement concern, not an implementation defect.

**Plausible alternative:** Keep the independent statuses but add a bounded “why this needs confirmation” reason vocabulary and measure correction time/abandonment in issue #38. Do not collapse statuses into one convenient overall score.

**Verdict direction:** KEEP the boundary; HARDEN reason semantics and measurement.

## Round 3: conservative brand ambiguity

**Builder:** The brand selector was deliberately changed after adversarial attacks. Producer/bottler lines, domains, pure varietal/designation text, and vintage-only text cannot become authoritative brand evidence. Unclassified slogans and appellation-like candidates do not become `OBSERVED` merely because they are large. M Cellars remains `AMBIGUOUS`/`NEEDS_REVIEW`, which is honest given the OCR result.

Evidence: corrections A and H (`e5a6e20`, `7d841e2`); `src/pipeline/extractor/field-selection.ts`; `src/domain/rules/brand-name.rule.ts`; `src/server/precheck-acceptance.test.ts`.

**Reviewer:** The conservative principle is right, but positive-signal classification is a small handcrafted vocabulary. It recognizes designators such as “Cellars,” “Estate,” “Vineyard,” and possessives. A genuine short brand without those signals remains ambiguous, while a slogan containing a designator might look positive. The merged code does not claim general recall, so this is not an unsupported claim. The actual defect is the invalid single-candidate ambiguity composition already identified.

**Classification:** One actual schema defect plus an accepted precision-over-recall limitation.

**Plausible alternatives:**

1. Keep the current gate and measure false-observed versus ambiguity burden on real labels.
2. Add a separately trained/local brand-region classifier only after the corpus can evaluate it, while preserving the same evidence contract.
3. Require explicit operator confirmation for every brand and treat machine selection as a ranked suggestion rather than authoritative `OBSERVED` evidence.

**Verdict direction:** KEEP conservative uncertainty; HARDEN the state model; REVISIT the positive-signal vocabulary after measurement.

## Round 4: local OCR and deterministic alcohol rules

**Builder:** Local-only Tesseract is a concrete answer to restricted-network and replaceability requirements. The model is vendored, its digest enters provenance, and relocation smoke proves that production assets resolve outside the checkout. Alcohol parsing is anchored, decimal-safe, bounded to wine syntax, and separate from actual-content truth. Exact declared comparison is transparent and deterministic for the current slice.

Evidence: ADR [0004](../../adr/0004-local-first-replaceable-analysis.md); `src/pipeline/extractor/ocr-engine.ts`; `src/server/runtime-provenance.ts`; `scripts/relocation-smoke.mjs`; `src/domain/rules/wine-alcohol-parse.ts`; `src/domain/rules/wine-alcohol.rule.ts`.

**Reviewer:** Local OCR is a baseline, not a proven universal provider. Relocation was tested on Node 22/macOS; repeated M Cellars stability does not prove cross-platform byte- or OCR-level reproducibility. Exact declared comparison is appropriate only for “printed value versus operator-declared value”; it must not be mistaken for actual-content tolerance or broader regulatory equivalence. Three of six rules are not run because artwork lacks actual-content evidence.

**Classification:** Accepted prototype limitations; potential unsupported claim only if documentation generalizes beyond the tested platform or comparison meaning. The current Slice 3 document narrows both claims correctly.

**Plausible alternatives:**

- Run a small platform matrix and record platform fingerprints before elevating deterministic OCR claims.
- Containerize the OCR runtime to reduce variation, while still describing hardware/library boundaries honestly.
- Keep exact comparison for the declared-vs-printed rule and add a separately named tolerance rule only when actual-content evidence exists.

**Verdict direction:** KEEP local-only OCR baseline and exact scoped comparison; HARDEN platform evidence; REVISIT exactness when the input contract expands.

## Round 5: six-rule profile or inflated completeness?

**Builder:** The six-rule profile makes external dependencies explicit rather than deleting them. Three content-dependent questions produce `not_run_external_dependency`, so the report shows why artwork cannot decide them. That demonstrates status semantics and prevents fabricated passes.

Evidence: `src/pipeline/precheck/wine-precheck.profile.ts`; `src/domain/rules/wine-alcohol.rule.ts`; `src/server/precheck-acceptance.test.ts`.

**Reviewer:** Calling it a six-rule profile is factually correct but can sound broader than the current evidence supports. Only brand and alcohol-statement evidence exist, and half the profile cannot execute substantively. The report wording is bounded, but planning and stakeholder summaries should say “six ordered outcomes, three external-dependency not-runs,” not imply six independent automated compliance checks.

**Classification:** Documentation-precision concern, not a code defect.

**Plausible alternative:** Split the profile into executable checks and declared dependency checks, or keep one ordered profile but publish an executable-coverage count alongside its version.

**Verdict direction:** KEEP the explicit not-run model; HARDEN profile descriptions.

## Round 6: machine identity, JSON checksum, and HMAC authorization

**Builder:** These mechanisms answer separate questions:

- `machineResultId`: which immutable machine content is this?
- JSON SHA-256: has this complete exported payload changed?
- HMAC append token: did this server authorize appending to that machine identity?

The distinction was not speculative. Adversarial review showed that a client could change content, recompute a checksum and identity, and submit a self-consistent forgery. Correction H binds authorization to `append-token.v1:<machineResultId>` using a server secret and timing-safe comparison.

Evidence: `src/pipeline/result/serialize.ts`; `src/pipeline/export/json/build-json-export.ts`; `src/server/append-token.ts`; `src/app/api/precheck/disposition/route.test.ts`; correction H `7d841e2`.

**Reviewer:** The separation is justified, but it is easy for maintainers and operators to misunderstand. A checksum is not authenticity; the HMAC is append authorization, not user identity; the bearer token can be replayed; and the machine id does not serialize disposition history. This deserves a dedicated ADR because it is durable security architecture, not an incidental helper.

**Classification:** Correct architecture with documentation/governance hardening.

**Plausible alternatives:**

1. Persist server-issued result records and authorize appends by opaque record id, which trades statelessness for storage and audit complexity.
2. Use a signed compact envelope containing machine id, key id, issued-at, and deployment mode, which improves rotation semantics but expands the contract.
3. Keep the simple deterministic HMAC token for the prototype and document replay/key-loss boundaries explicitly—the current lowest-complexity option.

**Verdict direction:** KEEP the three distinctions; HARDEN with an ADR, key-id/rotation plan before production, and clearer recovery behavior.

## Round 7: append-only disposition without persistence

**Builder:** Slice 3 proves that human disposition remains separate and cannot mutate machine findings. A reusable token permits successive appends against the unchanged machine identity, and the refreshed export/report carries the history. Persistence and account authentication were explicitly deferred.

Evidence: `src/pipeline/result/disposition.ts`; `src/server/precheck-service.ts`; `src/features/precheck/DispositionSection.tsx`; PR #37 limitations.

**Reviewer:** **Accepted prototype limitation with a future production concern.** “Append-only” is local to the client-submitted history. The same original export and reusable token can be replayed into two divergent histories, each with its own sequence 1. Losing the tab or restarting development can lose the token/history and require re-analysis. Key rotation invalidates outstanding tokens. There is no authenticated actor identity. None of this violates the stated ephemeral prototype, but it must not be described as a durable audit chain.

**Plausible alternatives:**

- Keep ephemeral forkable histories for the prototype and label them “portable operator record,” not “audit log.”
- Add server persistence with optimistic concurrency/version checks under issue #17.
- Issue single-use chained append capabilities, which would require server state and therefore belongs with persistence rather than Slice 3.

**Verdict direction:** KEEP the prototype separation; HARDEN language; REVISIT/replace replay semantics when issue #17 begins.

## Round 8: resource limits and operational behavior

**Builder:** The branch bounds request/file/pixel/frame/region/scale/text work, rejects declared oversized requests before form parsing, and terminates workers in `finally`. It documents that absent or false `Content-Length` can still be buffered and that no distributed concurrency control exists. That is honest prototype engineering.

Evidence: `src/server/resource-policy.ts`; `src/app/api/precheck/route.ts`; `src/pipeline/extractor/image-integrity.ts`; `src/pipeline/extractor/worker-lifecycle.test.ts`; Slice 3 acceptance.

**Reviewer:** Honest limits do not make operational risk disappear. Tesseract worker creation per request is expensive; test durations show real OCR in seconds, not the Constitution's sub-two-second median target. There is no queue, semaphore, timeout, or cancellation boundary. `request.formData()` can buffer before actual-byte enforcement. These are accepted for one-user local proof, but deployment work cannot simply inherit them.

**Classification:** Accepted prototype limitations and future production concerns.

**Plausible alternatives:**

- Add an in-process bounded worker pool and request timeout for demo mode.
- Put OCR behind a local worker process/queue with backpressure.
- Keep per-request workers but constrain public demo mode to deterministic sample-only analysis, as the truncated issue #13 begins to suggest.

**Verdict direction:** KEEP the defensive policy; HARDEN before public upload deployment.

## Round 9: UI usefulness, accessibility, and uncertainty

**Builder:** The UI distinguishes observations, evidence assessments, findings, and human disposition; uses advisory wording; provides keyboard-operable native controls, labels, alerts and live regions; and avoids color-only status. Real browser tests cover the end-to-end flow and downloads.

Evidence: `src/features/precheck/PrecheckWorkspace.tsx`; `src/features/precheck/ResultView.tsx`; `src/features/precheck/DispositionSection.tsx`; component tests; `tests/e2e/home.spec.ts`.

**Reviewer:** The semantics are sound, but accessibility evidence is mostly component queries and browser workflows; there is no axe-style automated audit or assistive-technology evidence. More importantly, usability with frequent ambiguity is unmeasured. Preserving uncertainty is a feature only if the operator receives enough evidence and recovery guidance to act without excessive friction.

**Classification:** Future measurement and accessibility-hardening concern, not a confirmed accessibility defect.

**Plausible alternatives:** Add automated accessibility scanning and a small moderated operator walkthrough before expanding fields; begin local-only friction metrics early without persistent telemetry.

**Verdict direction:** KEEP UI semantics; HARDEN accessibility and operator-friction evidence.

## Round 10: do 618 passing tests prove the right things?

**Builder:** PR #42 reports 618 passing tests. Tests cover schemas, semantics, geometry, rule order, provenance, tampering, HMAC authorization, reports, resources, real OCR, relocation, browser workflows, corpus integrity, privacy patterns, truth separation, and synthetic attacks. The count reflects unusually broad boundary coverage.

**Reviewer:** Counts are not evidence quality. The newly confirmed single-candidate ambiguity bug survives because one unit suite expects the selector to emit `AMBIGUOUS`, another expects ambiguity to have an alternate, and no composition test connects them. Synthetic corpus cases call selectors directly, bypassing analyzer validation. Architecture tests such as `truth-boundary.test.ts` rely on static import and vocabulary searches; they are alarms, not proofs against every dependency path. Repeated runs on one fixture prove local stability, not representative reproducibility. Hash checks prove repository consistency, not external provenance.

**Classification:** Actual missing integration regression plus test-design limitations. The broad claim “618 tests prove general reliability” would be unsupported; PR #42 does not make that claim.

**Plausible alternatives:**

- Add contract/composition tests at every production boundary rather than more isolated schema cases.
- Run synthetic corpus records through an analyzer-response builder/validator, not only field selectors.
- Add dependency-graph enforcement (for example, lint/module-boundary rules) instead of only source regexes.
- Report test categories and falsifiable claims rather than a headline count.

**Verdict direction:** HARDEN test composition; KEEP the current breadth as regression protection.

## Round 11: PR #41's evidence-before-expansion sequence

**Builder:** The sequence responds directly to ADR 0009's warning that architecture was outrunning proof. Corpus before evaluation prevents a harness from being built around hidden expected values. Evaluation before new fields gives every heuristic a baseline. New evidence before rule activation prevents rules from inventing facts. Fallback comes after local baseline measurement so provider complexity must justify itself.

Evidence: PR #41; [Remaining Work Plan](../../remaining-work-plan.md); ADR 0009; issues #6, #16, #24, and #29.

**Reviewer:** The principle is right, but the plan confuses dependency types. It orders #39 and #40 before #6 and #16. Issue #39 says it depends on #6 and #16 before final profile activation; #40 says the same. Issue #6 says policies for those fields should wait until their evidence slices exist. Issue #16 depends on implemented evidence and #6. That is circular if every issue is treated as one indivisible gate.

**Classification:** Planning defect/documentation mismatch; no production defect.

**Builder:** The intended dependency is staged: define evidence, then define normalization, then activate governed rules. The plan's compact arrow chain obscures those sub-stages.

**Reviewer:** Then the plan and issues should say so. Split “evidence contract/extraction” from “comparison policy/rule activation,” or annotate arrows as start, activation, or closure dependencies.

**Plausible alternatives:**

1. A directed acyclic graph of deliverables: #39 evidence contract → #6 field policy → #16 activation metadata → #39 profile activation.
2. Vertical per-field slices containing extraction, field policy, and one governed rule, with #16 providing a minimal lifecycle first.
3. Keep issues intact but add explicit partial-order milestones to each body.

**Verdict direction:** KEEP evidence-before-expansion; HARDEN the dependency model.

## Round 12: are the parallel lanes really parallel?

**Builder:** Governance (#27–#28–#21), measurement (#15→#38), and external observations (#33/#35) are kept away from the main feature chain so they do not block production evidence expansion unnecessarily.

**Reviewer:** The governance lane is not executable as written. The Design Review Checklist and accepted Operator Trust policy are already truncated. Issue #28's checks are needed to prevent further damage, but the plan waits for all of #27 first. RDR-002 is being performed manually under #21 before #28. Meanwhile issue #15, #13, and #14 bodies are truncated. Documentation integrity is already an active prerequisite, not a later refinement.

**Classification:** Documentation mismatch and sequencing defect.

**Plausible alternative:** Replace #27's broken policy content and add a minimal broken-link/truncation check in parallel, then expand the checker. Keep RDR automation manual until the artifacts prove useful.

**Reviewer:** Deployment-mode definition also need not wait until every rule-governance issue closes. Issue #13 informs secret handling, public-upload policy, telemetry, and latency measurement. Deployment implementation can remain later while deployment-mode design runs beside #15.

**Verdict direction:** REVISIT strict lane ordering; keep lanes conceptually separate.

## Round 13: does `label-fixture-corpus.v1` abstract too early?

**Builder:** A versioned index prevents ad hoc fixtures from leaking truth into extraction. It distinguishes available assets, synthetic evidence, unavailable gaps, expected states, challenge tags, and real-OCR enablement. Strict cross-entry invariants, manifest references, and a truth-label prohibition establish governance before the corpus grows.

Evidence: `src/fixtures/corpus-index.types.ts`; `src/fixtures/corpus-index.schema.ts`; `src/fixtures/corpus-index.test.ts`; PR #42.

**Reviewer:** The contract is large relative to its empirical base: one enabled real label. Fields such as expected states, permitted candidates, sufficiency, declared comparisons, not-run rule ids, challenge tags, availability, and synthetic token lines may encode current implementation assumptions before scoring semantics have been exercised. Schema versioning is appropriate, but treating v1 as durable would be premature.

**Classification:** Premature-abstraction risk, not a confirmed defect.

**Plausible alternatives:**

- Keep v1 explicitly experimental and allow a breaking v2 after issue #15's first baseline.
- Separate immutable asset/provenance metadata from evaluation-scenario expectations, allowing multiple scenarios per asset.
- Use smaller per-fixture scenario files validated by a thin index, reducing one central schema's breadth.

**Verdict direction:** KEEP a versioned catalogue; REVISIT its expectation shape after the first harness.

## Round 14: synthetic cases—evidence or implementation mirror?

**Builder:** Eleven synthetic domain cases cheaply and deterministically protect known attacks: producer, varietal, slogan, website, vintage, appellation, direct/range/malformed alcohol, clean positive brand, and insufficient evidence. They are explicitly marked synthetic, never enabled for real OCR, and never presented as public records.

Evidence: `tests/fixtures/precheck/corpus-index.json`; `src/fixtures/corpus-adversarial.test.ts`; Fixture Corpus.

**Reviewer:** They are valuable rule/selector examples, but they bypass image processing and OCR. Token geometry and confidence are constructed by the test. Because expectations were written around current selectors, the suite risks measuring agreement with its own assumptions. The PR body also says ten synthetic cases, while the merged index contains eleven—a concrete documentation mismatch.

**Classification:** Useful test class with an author-stated count mismatch and evidence limitations.

**Plausible alternatives:**

- Keep synthetic cases in a “domain contract suite,” separate from accuracy metrics.
- Render synthetic label images and run the real OCR path for a distinct robustness suite, while clearly labeling their artificial origin.
- Prioritize independently sourced public artwork for the evaluation baseline and use synthetic cases only as adversarial unit fixtures.

**Verdict direction:** KEEP synthetic cases; HARDEN category labeling; do not count them as real-world corpus breadth.

## Round 15: unavailable VENOM and the low-resolution derivative

**Builder:** The VENOM entry records an important missing adversarial label without fabricating a crop or exposing prohibited certificate content. The low-resolution derivative adds a documented degradation path with exact committed identity and a reproducible script. Both make gaps visible.

Evidence: corpus index; low-resolution manifest; `scripts/fixtures/generate-lowres-derivative.mjs`; Fixture Corpus.

**Reviewer:** The unavailable entry is useful backlog inventory but has no challenge tags, asset, manifest, truth, or executable behavior. It should not count toward measurement coverage. The low-resolution image is the same label, is disabled for real OCR, and allows such broad expected states that it currently contributes no extraction assertion. Its manifest names `external-source` as formal parent even though the immediate parent is a committed derivative; a prose note repairs the story for humans but the schema cannot express that chain precisely.

**Classification:** Accepted gap; low-value current derivative; provenance-model hardening concern.

**Plausible alternatives:**

- Move unavailable records to a separate acquisition backlog so corpus-entry counts represent executable cases.
- Keep unavailable entries but report executable/real/synthetic/unavailable counts separately everywhere.
- Enable the low-resolution fixture in a platform-bounded OCR job with narrower expectations.
- Extend the manifest parent model to reference a committed derivative by fixture/derivative id.

**Verdict direction:** KEEP honest gap recording; REVISIT whether it belongs in the measured index; HARDEN low-resolution execution and parent semantics.

## Round 16: privacy screening versus realistic evidence

**Builder:** PR #42 forbids certificate pages, applicant contact blocks, emails, phone numbers, handwritten signatures, raw OCR dumps, and unrelated personal data. Manifest records use explicit unknown/unretained sentinels. Label-printed producer/address text remains only when part of approved artwork and needed for producer-brand confusion. This is responsible data minimization.

Evidence: Fixture Corpus; `src/fixtures/corpus-index.test.ts`; fixture manifests; issue #35 context.

**Reviewer:** Privacy controls are necessary, but tests primarily restrict file types and scan index text for email/phone patterns. They cannot prove that every image pixel excludes prohibited certificate content or that manual crops preserve all label context needed for realistic evaluation. Over-cropping could make the benchmark easier; under-cropping could expose data. This is partly a stakeholder/legal policy question, not something regex alone can settle.

**Classification:** Future governance concern; no confirmed personal-data leak in the reviewed artifacts.

**Plausible alternatives:** Adopt a two-person fixture approval checklist, store only approval metadata, define allowed label-printed business content explicitly, and obtain legal/privacy confirmation for public-record reuse. Keep prohibited raw source material outside the repository.

**Verdict direction:** KEEP privacy-first inclusion; HARDEN approval evidence and policy.

## Round 17: should issue #15 be next?

**Builder:** Yes, in principle. Architecture must stop growing and measurement must begin. A harness can expose corpus gaps instead of waiting for a perfect dataset. PR #42 intentionally says the corpus is not representative; issue #15 can create per-fixture results, baseline snapshots, false-observed metrics, and comparisons without claiming population accuracy.

**Reviewer:** Not from the current issue body and not before the confirmed extraction defect is fixed. Issue #15 is truncated and specifies an obsolete fixture layout. A harness that aggregates one real label with eleven synthetic post-OCR cases will produce precise numbers with weak external meaning. Before issue #15 begins as an implementation branch, three targeted prerequisites are genuine blockers:

1. reconcile the single-candidate ambiguity schema defect;
2. rewrite issue #15 around `label-fixture-corpus.v1`, separated metric classes, and non-representative reporting;
3. add at least one independent privacy-safe real label—or explicitly split harness plumbing from any baseline/threshold claim and make real-evidence acquisition a blocking parallel gate before scoring decisions.

**Classification:** Actual defect, documentation blocker, and evidence-readiness decision.

**Plausible alternatives:**

- **Pause and expand:** acquire independent real labels first, then implement the harness.
- **Two-stage issue #15:** build data collection/snapshot mechanics now; prohibit aggregate thresholds until a real-image minimum is met.
- **Platform-bounded pilot:** enable the low-resolution derivative and add one new public label in a dedicated Node 22 job, then begin baseline comparison.

**Builder:** The two-stage alternative best preserves momentum without pretending representativeness. But the current issue does not define that boundary, so proceeding now would require interpretation rather than executing an accepted issue.

## Cross-PR verdict discussion

**Reviewer:** The three PRs form a coherent governance story, but they also reveal a pattern: strong isolated contracts and documentation can create an appearance of closure before composition and external evidence are sufficient. PR #37's 528 tests missed a cross-layer invalid state. PR #41's comprehensive chain contains circular dependencies and truncated execution issues. PR #42's 14-entry index contains only one enabled real OCR fixture and a mismatch in its stated synthetic count.

**Builder:** The response should be bounded. Do not dismantle the evidence architecture, remove corpus governance, or expand regulatory scope. Fix the confirmed semantic contradiction, repair the issue/dependency record, add independent real evidence, and then use the harness to decide what changes deserve promotion.

**Reviewer:** Agreed. This is not `REPLAN THE NEXT PHASE`; the direction survives. It is also not yet `PROCEED TO ISSUE #15` because the issue is not executable as written and the current evidence would encourage overly precise but unrepresentative metrics.

## Closing checkpoint

The debate supports this checkpoint conclusion:

> **PAUSE AND EXPAND REAL-WORLD EVIDENCE.** Preserve the architecture, correct the selector/schema composition defect, rewrite the measurement issue and dependency graph, and obtain independent executable real-image variation before treating evaluation output as a system baseline.

This pause is narrow. It does not reopen deferred designation, net contents, fallback, persistence, PDF, or government integration. It prevents a measurement harness from turning one real label plus implementation-shaped synthetic cases into an authority they have not earned.

