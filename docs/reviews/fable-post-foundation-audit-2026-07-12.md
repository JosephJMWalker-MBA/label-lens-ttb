# Fable Post-Foundation System Audit — 2026-07-12 (refreshed 2026-07-13)

- Status: Completed audit record, refreshed after governance restoration
- Auditor: Fable (AI agent), operating under the ADR-005 check-in discipline
- Original base: `origin/main` at merge of PR #71 (`89b69d2`)
- Refreshed base: `origin/main` at `2e0963f` (PR #76, *Core: add bounded
  orientation and region recovery*), which sits on top of `ab440b8`
  (PR #75, governance-record restoration)
- Mode: audit only — this refresh changed no production code, tests, fixtures,
  evaluation results, ADRs, issues, or repository policy; its only output is
  this document

## Audit refresh after governance restoration

This document was first written on **2026-07-12** against `main` at PR #71
(`89b69d2`). It correctly found that its own commissioning premise — "audit the
system now that ADR-005 is merged" — did **not** hold: ADR-005 and the tooling /
Rubber Duck Review records existed only on open PRs #70 and #73, were truncated,
and were blocked from merge by the documentation-integrity gate. That was the
right call and it drove a governance response.

Since then the repository state that the original audit described has changed:

- **PR #75** (merge `ab440b8`) restored the four governance records to full
  length and made them authoritative on `main`:
  [`docs/adr/ADR-005-bounded-agent-initiative-and-maintainer-check-in.md`](../adr/ADR-005-bounded-agent-initiative-and-maintainer-check-in.md)
  (203 lines), [`docs/ai-assisted-development-tooling.md`](../ai-assisted-development-tooling.md)
  (168 lines), [`docs/rubber-duck-review-tooling.md`](../rubber-duck-review-tooling.md)
  (166 lines), and [`docs/ai-tool-usage-log.md`](../ai-tool-usage-log.md) (68 lines).
- **PRs #70 and #73 were closed as superseded** by #75. The truncated documents
  and their failing CI no longer exist anywhere on `main` or on an open branch.
- **PR #76** (merge `2e0963f`) then added bounded OCR orientation / region
  recovery to the extractor and regenerated the full-corpus evaluation report.
  This directly touches original finding **F-03**.

This refresh **revalidates every original finding against current `main`; it
does not overwrite the historical record.** The governance incident that the
original audit surfaced is preserved verbatim as a historical incident
(Section 3), reclassified rather than erased. Every finding below carries an
explicit disposition — `CURRENT — CONFIRMED`, `CURRENT — REVISED`,
`HISTORICAL — CORRECTED BY PR #75`, `SUPERSEDED`,
`UNRESOLVED — MAINTAINER CONTEXT REQUIRED`, or
`UNCERTAIN — MORE EVIDENCE REQUIRED` — and stable finding IDs are preserved.
ADR-005 now applies in full and governs both this audit's conduct and the
reading of the confirmation-preview (Section 7).

Product behavior from any still-open PR is *not* treated as current behavior
anywhere below; only merged `main` at `2e0963f` is.

## 1. Revised executive verdict

**PROCEED WITH BOUNDED CORRECTIONS.** (Unchanged from the original verdict; the
governance restoration removed the two HIGH pre-merge governance defects and
narrowed, but did not eliminate, the correction list.)

Threshold used: a **PAUSE** verdict would require evidence that the core
authority/evidence layers are confused on `main`, that the UI implies regulatory
authority, that machine uncertainty is hidden, or that the primary workflow is
broken. None of that is present. `main` is green (documentation-integrity gate
`docs:check` **PASS** with a shrink-only baseline of 4 known issues, 0 new,
0 stale; full unit/e2e suites green in CI), the six evidence/authority layers
remain distinct and tested, and the measured-evaluation loop is merged and has
now driven three real extractor improvements (PR #67 abstention, PR #69
reconstruction/ranking, PR #76 orientation/region recovery).

What changed since the original verdict:

- The two **HIGH** governance findings (D2/F-02 truncated ADR-005 and tooling
  docs; blocked CI) are **corrected**: PR #75 restored full documents and
  PRs #70/#73 are closed. This is now a *historical* incident, not a current
  defect (Section 3, F-02).
- The single remaining **HIGH** current finding is **F-01**: the README still
  contradicts merged reality by describing the evaluation harness and reports as
  unmerged. This did not change and remains the most important current finding.
- **F-03** (orientation) is **REVISED**: PR #76 partially mitigates it with
  bounded rotated/region recovery passes, but does not resolve EXIF-normalized
  canonical source geometry. Severity drops from MEDIUM to LOW.
- **F-05** (deployed performance) is **REVISED**: per-pass OCR/recovery timing
  now exists in the evaluation report, and measured local latency rose with the
  added recovery passes; deployed-environment attribution is still unmeasured.

Current finding counts: **BLOCKING 0 · HIGH 1 · MEDIUM 3 · LOW 6 ·
OBSERVATION 4.** Historical/corrected: **1** (F-02). See the reconciled ledger,
Section 12.

## 2. Current system state (on `main` at `2e0963f`)

- **Governance records are whole and authoritative.** ADR-005 defines bounded
  agent initiative and the maintainer check-in discipline in full; it recognizes
  the PR #74 audit behavior as correct and lists "seller confirmation moves from
  preview into active persistence and submission behavior" as a review trigger.
  The tooling, RDR, and usage-log records are complete.
- **Evaluation loop is merged and re-run.** `eval:baseline`, `eval:inventory`,
  `eval:inspect`, `src/fixtures/eval/**`, `docs/extraction-baseline/**`
  (15-label) and `docs/extraction-full-corpus/**` (115-case) are all on `main`.
- **Orientation/region recovery is merged (PR #76).** The extractor now stages
  OCR: a primary full-image pass, then a bounded set of conditional rotated /
  edge-strip / focus recovery passes (max 5 total) triggered only when the
  primary pass leaves brand or alcohol unresolved
  ([`regions.ts`](../../src/pipeline/extractor/regions.ts)). Every pass maps its
  word geometry back into the original uploaded-image frame
  (`mapBoxToOriginalGeometry`) before selection or reporting.
- **Regenerated full-corpus metrics** ([`extractor-report.md`](../extraction-full-corpus/extractor-report.md)):
  brand exact 27%, brand top-3 recall 33%, correct abstention 100%, absent-brand
  false positives 0%, alcohol overall false-certainty 1%; median latency
  1646 ms, p95 4628 ms; median OCR passes 1, p95 4; p95 recovery duration
  2906 ms; p95 total OCR duration 3673 ms. The report now carries an orientation
  slice (90° counterclockwise 33% brand exact; mixed orientation 33%).
- **README is stale** against all of the above evaluation reality (F-01).

## 3. Historical governance incident (preserved; corrected by PR #75)

This is the finding the original audit is most valuable for. It is preserved as
a historical record and reclassified `HISTORICAL — CORRECTED BY PR #75`; it is
**not** a current defect.

**The incident, as it stood on 2026-07-12 (original narrative):**

1. This audit was commissioned "after ADR-005 is merged."
2. ADR-005 in fact existed only on the open PR #73 branch, as a 9-line file that
   ended mid-sentence ("…under a coordinated workflow"), carrying a
   `**Status:** Accepted` line on an unreadable document.
3. The two tooling documents the audit was told to read first
   (`ai-assisted-development-tooling.md`, `rubber-duck-review-tooling.md`)
   existed only on the open PR #70 branch and were likewise truncated
   (the RDR document was 8 lines ending in a comma).
4. Both PRs' `verify` CI jobs were **red** — the documentation-integrity gate
   was correctly refusing to merge truncated documents.
5. The auditor reported the premise mismatch, treated the truncated documents as
   *intent only*, audited merged `main` as the sole source of current behavior,
   and changed no code, issues, ADRs, or policy.

**Governance response taken:** PR #75 re-authored and restored all four records
to full length and merged them (`ab440b8`); PRs #70 and #73 were closed as
superseded. ADR-005 itself now records this exact episode as the expected audit
behavior.

**Corrected current state:** every document named above is present and full on
`main`, and `docs:check` passes with no new or stale issues.

**Residual finding that survives the correction:** the incident was a
document-write/branch-state reliability failure — content that was believed
authored and "Accepted" was in fact truncated on an unmerged branch. The
correction restored the content but the *class* of failure (write-then-assume
without verify-after-write, and citing status from a branch that had not merged)
is a real, if low-severity, lesson. It is recorded as new finding **F-15**
(verify-after-write / branch-state validation, LOW) rather than inflated into a
generalized systemic defect. The documentation-integrity gate performed exactly
as designed and is the reason the truncation never reached `main`; F-15 is about
authoring discipline upstream of the gate, not about the gate.

## 4. What currently composes well

Evidence, on `main` at `2e0963f`:

1. **Honest abstention composes end-to-end without coordination.** The
   extractor's no-brand abstention gate (PR #67) produces `NOT_OBSERVED`; the
   presentation layer built weeks earlier already renders that honestly
   ("Not detected" / "Could not identify safely" in
   [`observation-language.ts`](../../src/features/precheck/observation-language.ts));
   evidence sufficiency marks it `insufficient`; the brand rule returns
   `not_run_insufficient_evidence` rather than a fake outcome; and the
   regenerated full-corpus report still records **100% correct abstention /
   0% absent-brand false positives**, down from the 100% false-positive rate
   RDR-003 called the clearest warning. Independent layers agreeing without
   edits to each other remains the strongest composition evidence in the repo.
2. **Measurement precedes tuning, and now survives a third repair.** The RDR-003
   sequence held again through PR #76: recovery passes were added, the same
   115-case corpus was re-run, and abstention discipline held (still 100% / 0%)
   while brand exact stayed at 27% and an orientation slice was added to the
   report. The report continues to state it "is not evidence that the current
   extractor is production-ready."
3. **Bounded recovery is explainable and geometry-safe.** PR #76's staging is
   capped (max 5 passes), conditional (only when a field is unresolved), and —
   importantly for the authority model — maps every recovered word's geometry
   back to the original image frame before selection. Recovery did not introduce
   a new evidence layer or bypass the shared analyzer contract.
4. **Evidence/authority layering is enforced by tests, not convention.**
   Truth-boundary tests prove production cannot import evaluation truth; the
   browser boundary test forbids server/secret/OCR imports in UI code;
   dispositions are append-only behind a server-issued token; and the export is
   checksum-verified in a real browser download.
5. **The evidence-centered result is anchored to server truth.** Overlays are
   drawn only from server geometry, as percentages of the geometry's own
   reference frame; a real-browser test proves overlay boxes sit inside the
   rendered image at desktop and 375 px widths. Missing geometry degrades to
   explicit honest states.
6. **Documentation governance has teeth — proven twice.** The docs validator's
   shrink-only baseline (4 known truncations remaining) is PASS on `main`, and
   it is the mechanism that kept the truncated governance documents off `main`
   during the incident of Section 3.
7. **Accessibility foundation carries through the evidence UI.** Overlays are
   native buttons with labels, live-region announcements, and dark-mode tokens;
   the preference layer required no rework for the evidence UI.

## 5. Contradictions and drift

| # | Documented claim | Implemented behavior | User-visible consequence | Severity | Disposition |
|---|---|---|---|---|---|
| D1 | [`README.md`](../../README.md) §7 (~line 161): "There is no `eval:baseline` script on `main`…"; §11 (~line 220): evaluation "is in progress on a separate branch and is not merged… no counts published"; §15: "Complete the full-corpus extraction measurement (in progress, separate branch)" | `main` has `eval:baseline`/`eval:inventory`/`eval:inspect`, `src/fixtures/eval/**`, `docs/extraction-baseline/**`, and the 115-case report in `docs/extraction-full-corpus/**` | A reviewer following the README believes the repo has *less* measurement capability than it does, then distrusts the README on discovering the reports — inverting its truth-first purpose | HIGH | CURRENT — CONFIRMED (F-01) |
| D2 | ADR-005 titled "Status: Accepted" while 9 lines and truncated (PR #73) | ADR-005 is now the full 203-line document on `main` | — | — | HISTORICAL — CORRECTED BY PR #75 (F-02) |
| D3 | Repository ADR convention `docs/adr/000N-kebab.md`; `0005-use-cost-aware-openai-vision-fallback.md` already holds id 005 | `main` now also contains `ADR-005-bounded-agent-initiative-and-maintainer-check-in.md`; two files on `main` can be cited as "ADR-005" | Two merged documents share the "ADR-005" identifier under different filename patterns; the validator does not classify the `ADR-005-…` filename as an ADR, so no id-collision or status check fires on it | MEDIUM | CURRENT — CONFIRMED, now a merged fact (F-06) |
| D4 | Page tagline "Prescreen a wine label…"; step heading "3 · Run prescreen" | Button/status/result say "Run pre-check" / "Pre-check complete" / "Pre-check could not complete"; exports say "wine-precheck" | Two names for the same action within one screen | LOW | CURRENT — CONFIRMED (F-07) |
| D5 | RDR-2.0 cadence intent (issue #21: "every three PRs") | Eight+ substantive PRs since RDR-003 (#64–#76) with no RDR-004 | Governance cadence drifting during the fastest implementation period | OBSERVATION | CURRENT — CONFIRMED, count updated (F-14) |
| D6 | Issues #51 (downloads), #57 (measured accuracy) open | Both delivered and merged | Issue list overstates outstanding defects | LOW | CURRENT — CONFIRMED (F-09) |

## 6. Authority and evidence audit

Layer-by-layer, on `main` at `2e0963f`, all **intact** (no layer-mixing found):

- **Machine observation** — evidence-only analyzer contract enforced by schema
  tests; observations carry state/confidence/geometry/provenance and are frozen.
  PR #76's recovery passes feed this contract without a new evidence type and
  re-anchor geometry to the original frame.
- **Applicant-declared values** — carried as `DeclaredFact` with
  `operator-entered` provenance; form labels them "not read from the image by
  OCR." One caution unchanged: the result page shows detected values prominently
  and declared values only inside finding messages — a future side-by-side would
  need care not to visually merge the two layers.
- **Future applicant correction** — exists only as explanatory preview text;
  nothing stores or replays a correction. Intact by absence.
- **Internal reviewer disposition** — append-only, token-gated; UI states it
  "does not represent a TTB action, approval, or rejection."
- **Regulatory authority** — the only approve/reject language in the UI is
  explicit negation; no overall verdict or score exists in UI, export, or report.
- **Provenance** — extractor/OCR/parser identities and versions plus derivative
  SHA-256 flow through result, export, and report.
- **UI language** — plain-language states map 1:1 to machine states, which
  remain visible; `stateExplanation` refuses to convert `NOT_OBSERVED` into
  proven absence.

Possible confusion points: only F-04 (next-step guidance silent about an
honestly absent brand) and the confirmation-preview actor ambiguity (Section 7).

## 7. Confirmation-preview audit, re-read under merged ADR-005

The original audit examined the PR #71 confirmation-preview panel (Fable's own
addition) before ADR-005 was merged. ADR-005 is now authoritative, and it speaks
to this feature directly, so this section is re-read against it.

**What it currently promises:** only that *a future step will exist* — "A future
step will ask the seller to confirm how Label Lens interpreted the artwork
before submitting" — plus five illustrative choices rendered as text, not
controls, followed by an explicit disclaimer that the actions are "not yet
active" and that nothing is stored, changed, or sent to TTB. Tests pin this
honesty; e2e asserts no "Confirm this reading" control exists.

**Consistency with merged ADR-005:** the panel as it exists — text-only,
non-active, storing nothing — is *consistent* with ADR-005, which permits
bounded presentation and explicitly records the PR #74 audit's own restraint as
correct. ADR-005 also names the exact boundary that must not be crossed without
a check-in: "seller confirmation moves from preview into active persistence and
submission behavior" is a listed review trigger. So the preview may remain; any
step toward activation requires a maintainer check-in first.

**Product assumptions the preview still embeds** (unchanged from the original,
and the reason a check-in should precede any activation): confirmation is
per-reading/per-field not whole-label; the confirming actor is "the seller" with
no role distinction from the internal reviewer; the choice vocabulary blends
seller-side correction with reviewer-side classification; the panel sits second
on the result page (above "Evidence details"); and "before submitting" implies a
submission concept the product does not define.

**Disposition:** `UNRESOLVED — MAINTAINER CONTEXT REQUIRED`. All further
confirmation work — including wording changes to the existing panel — should
wait for Joseph's withheld seller context (questions in Section 13). No design
work is done here. (Ledger: F-11.)

## 8. Accessibility and interaction audit

Unchanged in substance from the original; revalidated as still accurate on
`main`.

- **Automated evidence (unit + Playwright):** onboarding first-use/skip/replay;
  theme selection/persistence/pre-paint; text-scaling attributes; reduced-motion
  attribute and spinner suppression; `aria-busy` and duplicate-submit
  prevention; focus-to-result and focus-to-error; skip link and
  `aria-describedby`; native-`details` disclosures; overlay buttons with
  descriptive labels, live-region announcements, bidirectional card↔region
  focus, dark-mode presence, and real-layout containment at two viewport widths.
- **Manual checks still required** (honestly recorded in
  [`accessibility-smoke-checklist.md`](../accessibility-smoke-checklist.md)):
  live screen-reader passes, 200% zoom reflow, the long live processing wait,
  plus two overlay-specific items this audit added — **(a)** small evidence
  regions produce small touch targets on narrow screens (the overlay *is* the
  region; no minimum hit-area), and **(b)** overlay chips render over arbitrary
  artwork, so chip contrast should be spot-checked on dark artwork in both
  themes.

No WCAG conformance claim is made anywhere, which remains correct. (F-12, F-13.)

## 9. Test adequacy

- **Strongly proven:** extraction determinism on identical bytes;
  truth/evaluation boundary isolation; export checksum integrity through a real
  browser download; overlay geometry math (unit) *and* rendered containment
  (e2e); onboarding/theme persistence in a real browser; append-only disposition
  through real endpoints; docs-gate shrink-only baseline semantics.
- **Weakly proven:** responsive stacking and dark-mode readability asserted via
  class/attribute presence in jsdom, not rendered layout/contrast; elapsed-time
  honesty is unit-level; reduced-motion asserted as attribute + CSS existence.
- **Implementation-coupled tests:** the core e2e reads finding rows via styling
  selectors (`.font-medium`, `.font-mono` in
  [`home.spec.ts`](../../tests/e2e/home.spec.ts), still present) — a styling
  change already broke this once during PR #68. Semantic hooks would decouple.
  (F-08.)
- **Missing integration checks:** with PR #76 merged, there are now measured
  orientation slices in the corpus report, but **still no test uploads an
  EXIF-oriented photo** to exercise decode-time orientation end-to-end (F-03);
  no test covers the next-action message when brand is honestly absent and
  alcohol is found (F-04); no automated axe-style scan (deliberately deferred —
  acceptable).
- **False-confidence risks:** Playwright runs Chromium only; local evaluation
  latency (now median 1646 ms) must not be read as deployed latency (Section 10).

## 10. Performance and deployment truth

Reconciled against the regenerated report, without claiming unmeasured causes.

- **Targets:** median < 2 s, p95 < 5 s — explicitly *prototype targets*, per
  [`operator-trust-and-throughput.md`](../operator-trust-and-throughput.md).
- **Measured locally (post-#76):** median 1157 ms → **1646 ms**, p95 2522 ms →
  **4628 ms** across 115 cases. The bounded recovery passes added measurable
  latency: p95 4 OCR passes per image, p95 recovery duration 2906 ms, p95 total
  OCR duration 3673 ms. p95 is now near the 5 s prototype target *on local
  hardware* — still within it, but the margin narrowed and this is the direct,
  accepted cost of the orientation/region recovery.
- **New telemetry now exists — partially.** The report now carries per-pass and
  recovery timing, so the "no stage timing at all" half of the original F-05 is
  no longer true *inside the evaluation harness*. What remains absent is
  **deployed-environment** attribution: cold start vs worker init vs OCR vs
  rules on the Render instance.
- **Observed live:** one first request took ≈ 38 s. Two candidate contributors
  are documented facts — Render free tier "spins down when idle" (`render.yaml`)
  and per-request OCR worker/model initialization — but their relative
  contribution remains unmeasured. No cause is claimed here.
- **Gap and smallest response:** a server-side stage-timing log line (no API
  change) plus one scripted cold/warm measurement against the deployed instance.
  `MAINTAINER CONTEXT REQUIRED` (whether the free-tier demo is meant to meet the
  target at all, or only a warm instance). (F-05.)

## 11. Hiring-assignment boundary

**Already compelling:** a working end-to-end vertical slice with real local OCR;
honest uncertainty; measured accuracy with a 115-case corpus, a written failure
taxonomy, and now an orientation slice; three evidence-driven extractor
improvements with before/after numbers (PR #67, #69, #76); enforced
evidence/authority boundaries; checksum-verified exports; append-only human
workflow; an accessibility/onboarding foundation; a documentation-integrity gate
visibly catching real defects; and full, authoritative governance records
(ADR-005 and the tooling/RDR docs are now merged).

**Should explicitly remain out of scope for the assignment:** seller
confirmation implementation, correction persistence, authentication, retention,
cloud fallback, batch, additional beverage types or fields, and production
hardening/telemetry beyond the single measurement proposed above. The strongest
remaining assignment work is *truth-alignment* (F-01) — making the README match
the merged system — not new capability. The system currently under-claims in the
README and over-claims nothing; fixing D1/F-01 keeps it from appearing *less*
complete than it is, the safe direction to err.

## 12. Reconciled findings ledger

Stable IDs preserved. "Original status" = as filed 2026-07-12; "Refreshed
status" = disposition against `main` at `2e0963f`.

| ID | Current title | Original status | Refreshed status | Severity | Evidence on current `main` | Boundary | Why it matters | Smallest response | Maintainer context? | Homework/future | Disposition vs original |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-01 | README contradicts merged evaluation reality | HIGH | CURRENT — CONFIRMED | HIGH | README §7 (~161)/§11 (~220)/§15 vs `eval:*` scripts + `docs/extraction-baseline/**` + `docs/extraction-full-corpus/**` | Documentation truth | Reviewer-first README fails its own truth standard | Doc-only README sync citing the merged report | No | Homework, before submission | Unchanged |
| F-02 | Governance docs truncated in open PRs; CI failing | HIGH (pre-merge) | HISTORICAL — CORRECTED BY PR #75 | — (was HIGH) | ADR-005 = 203 lines; tooling 168; RDR 166; usage-log 68; PRs #70/#73 closed | Governance | Was: policy governing agents unreadable/unmergeable | None — corrected; see F-15 for residual lesson | Was yes (Joseph authored) | Corrected | **Reclassified: corrected, not carried forward** |
| F-03 | Orientation handling / EXIF normalization | MEDIUM | CURRENT — REVISED | LOW | PR #76 adds bounded rotated/region recovery in `regions.ts`, geometry mapped back to original frame; `image-integrity.ts` still performs no EXIF decode-time normalization; no EXIF fixture | Extractor input contract + UI geometry | Recovery now catches many rotated readings, but a truly EXIF-oriented source photo is still not normalized to a canonical frame | Decide EXIF scope; add one EXIF fixture; either normalize at decode or state screenshots as supported input | Yes — is phone-photo upload in assignment scope? | Future | **Downgraded MEDIUM→LOW; partially mitigated by #76.** Original F-03 was accurate against `ab440b8` |
| F-04 | Next-step guidance never mentions an honestly absent brand | MEDIUM | CURRENT — CONFIRMED | MEDIUM | `nextAction` in `observation-language.ts` still has no branch for brand `NOT_OBSERVED` | UI honesty/coherence | Brand abstention is common and correct; the suggested next step ignores the most decision-relevant fact | One added priority branch with agreed wording | Yes — wording implies workflow | Homework | Unchanged |
| F-05 | Deployed-performance attribution unmeasured | MEDIUM | CURRENT — REVISED | MEDIUM | Report now has p95 OCR passes (4), recovery (2906 ms), total OCR (3673 ms); latency rose to median 1646/p95 4628 ms; no *deployed* stage telemetry | Deployment truth | Eval-harness timing now exists; deployed cold-start attribution still does not; p95 margin to target narrowed | Server-side stage-timing log + one cold/warm scripted deployed measurement | Yes — target applicability to free tier | Future | **Revised: eval telemetry now partial; deployed gap remains** |
| F-06 | Docs validator blind to `ADR-005-*` naming and bold-line status | MEDIUM | CURRENT — CONFIRMED | MEDIUM | `classify` (`^docs/adr/\d{3,4}-`) does not match `ADR-005-…`; both `0005-…` and `ADR-005-…` now coexist on `main`, so a real id-collision is invisible to the validator | Governance tooling | The validator misses ADR-identity defects exactly when a new naming pattern appears — now a merged, not hypothetical, collision | Extend `classify`/status parsing; add fixture tests; resolve the numbering question (Q4) | Depends on Q4 (naming standard) | Future | **Strengthened: now a merged-fact collision, not pre-merge** |
| F-07 | Terminology drift: "prescreen" vs "pre-check" | LOW | CURRENT — CONFIRMED | LOW | `page.tsx` line 23 "Prescreen…" + `PrecheckWorkspace.tsx` line 284 "3 · Run prescreen" vs "Run pre-check"/"Pre-check complete/could not complete" | UI language | Two names for one action on one screen | Pick one term; sweep UI strings only | Yes (product voice) | Homework polish | Unchanged |
| F-08 | Core e2e coupled to styling selectors | LOW | CURRENT — CONFIRMED | LOW | `.font-medium`/`.font-mono` locators still in `home.spec.ts` (lines 91/145/161/223–224) | Test quality | Styling changes break behavior tests | Add semantic hooks (`data-testid`) in one pass | No | Homework polish | Unchanged |
| F-09 | Issue hygiene lags delivery | LOW | CURRENT — CONFIRMED | LOW | #51, #57 delivered but open | Project signal | Reviewers may re-litigate solved work | Maintainer closes/annotates issues | Yes (only Joseph closes) | Housekeeping | Unchanged |
| F-10 | Two evaluation report generations coexist without an index | LOW | CURRENT — CONFIRMED | LOW | `docs/extraction-baseline/**` (15-label) and `docs/extraction-full-corpus/**` (115-case) both on `main`; README references neither | Documentation | Ambiguity about which report is authoritative | One cross-reference note (fold into F-01 fix) | No | Homework, with F-01 | Unchanged |
| F-11 | Confirmation-preview placement and actor ambiguity | OBSERVATION | UNRESOLVED — MAINTAINER CONTEXT REQUIRED | OBSERVATION | Panel text-only and consistent with merged ADR-005; embeds actor/sequence assumptions; ADR-005 makes activation a review trigger | Product boundary | Any activation requires a check-in per ADR-005; wording changes should await withheld seller context | Leave as-is until Joseph answers Section 13 | **Yes — primary case** | After context | **Now grounded in merged ADR-005** |
| F-12 | Manual accessibility checks remain open | OBSERVATION | CURRENT — CONFIRMED | OBSERVATION | `accessibility-smoke-checklist.md` "Recommended" rows + overlay hit-area/chip-contrast items | Accessibility | Automated evidence cannot close these | Run the checklist once before submission | No | Homework, before submission | Unchanged |
| F-13 | Overlay touch targets equal region size | OBSERVATION | CURRENT — CONFIRMED | OBSERVATION | Overlay button geometry = evidence box; small boxes → small targets on mobile | Accessibility/interaction | Tiny alcohol statements may be hard to activate by touch | Evaluate during F-12 pass; add minimum hit-area only if it fails | Yes (interaction design) | Future unless manual pass fails | Unchanged |
| F-14 | RDR cadence drifted during the fastest merge period | OBSERVATION | CURRENT — CONFIRMED | OBSERVATION | Issue #21 (every-three-PRs) open; 8+ substantive PRs since RDR-003 (#64–#76) | Governance rhythm | The period with the most change had the least structured review | Joseph decides whether RDR-004 precedes submission | Yes | Maintainer call | Count updated (#71→#76) |
| F-15 | Verify-after-write / branch-state validation (residual from Section 3) | *new* | CURRENT — CONFIRMED | LOW | Section 3 incident: `**Status:** Accepted` cited from a truncated file on an unmerged branch; content assumed authored without a post-write read | Authoring discipline (upstream of the docs gate) | The docs gate caught the truncation, but the authoring step should verify content and merge state before treating a document as authoritative | Read-back after authoring governance docs; confirm merge before citing status; no code change | No (process) | Homework (governance) | **New; distilled from the corrected F-02 incident, not a generalized defect** |

**Current findings by severity:** BLOCKING 0 · HIGH 1 (F-01) · MEDIUM 3 (F-04,
F-05, F-06) · LOW 6 (F-03, F-07, F-08, F-09, F-10, F-15) · OBSERVATION 4 (F-11,
F-12, F-13, F-14).

**Historical / superseded by disposition:** HISTORICAL — CORRECTED BY PR #75:
1 (F-02, plus table rows D2). SUPERSEDED: none (the truncated-doc PRs #70/#73
are closed, not merged).

## 13. Questions for Joseph

1. **Seller confirmation (primary):** Who is the confirming actor, and is
   confirmation per-field or whole-label? Should the preview's five options
   stay, split into seller-correction vs reviewer-classification vocabularies
   (per RDR-003), or be replaced by your withheld design? Where should the step
   live, and what does "submitting" refer to today? (ADR-005 makes activation a
   review trigger, so this precedes any wording change.)
2. **Confirmation-preview placement:** is second position on the result page
   (above Evidence details) acceptable until the real design lands, or should it
   move below the disclosures?
3. **EXIF scope (F-03):** are phone-photo uploads (EXIF-oriented) inside the
   assignment's supported-input story now that PR #76 adds bounded rotated
   recovery, or should the README/UI state screenshots/normalized images as the
   supported input and defer decode-time EXIF normalization?
4. **ADR numbering (F-06):** keep `000N-kebab` and renumber the initiative ADR
   (e.g. `0010-…`), or adopt the `ADR-00N-…` pattern repo-wide? Two "ADR-005"
   identifiers currently coexist on `main`.
5. **README truth sync (F-01):** confirm the evaluation sections should be
   rewritten to merged reality, and whether the 27% / 33% / 0%-FP figures and
   the new latency numbers should appear in the README or only by link.
6. **Performance target applicability (F-05):** does the p95 < 5 s target apply
   to the free-tier public demo (cold starts included), or a warm instance only?
   (Local p95 is now 4628 ms after recovery passes.)
7. **Governance rhythm (F-14):** should RDR-004 run before submission, given the
   substantive merges since RDR-003?
8. **Issue hygiene (F-09):** may the delivered issues (#51, #57) be closed with
   evidence links, and by whom?
9. **Verify-after-write (F-15):** do you want a lightweight authoring convention
   (read-back + merge-state check before citing a governance document's status)
   recorded, or is the docs gate sufficient on its own?

## 14. Recommended next actions

**Before the next merge (any PR):**
- Resolve the ADR numbering question (Q4); it gates F-06.

**Before assignment submission:**
- README truth sync for the merged evaluation system, including which report is
  authoritative and the post-#76 latency numbers (F-01, F-10) — documentation
  only.
- Run the manual accessibility checklist once, including the two overlay items
  (F-12, F-13).
- Maintainer decisions on Q1–Q3 so F-04 wording and the confirmation-preview
  text can be settled in one small pass.
- Close or annotate delivered issues (F-09, Joseph only).

**After the assignment:**
- EXIF decision + fixture (F-03); deployed stage-timing measurement (F-05); e2e
  semantic hooks (F-08); validator hardening for ADR naming/status (F-06);
  terminology sweep (F-07); record the verify-after-write convention if wanted
  (F-15).

**Future government-grade system:**
- Everything already deferred by RDR-003 (retention, auth, fallback, batch,
  additional fields), plus real deployed telemetry, cross-browser automation,
  and the confirmation workflow once product context is supplied.

## 15. Change log (refresh 2026-07-13)

- Added the refresh header and this change log; base moved from PR #71
  (`89b69d2`) to `origin/main` at `2e0963f` (PR #76 on PR #75).
- **F-02** reclassified `HIGH (pre-merge)` → `HISTORICAL — CORRECTED BY PR #75`;
  the 5-step governance incident is preserved in Section 3, not erased.
- **New F-15** distilled from the corrected F-02 incident (verify-after-write /
  branch-state validation, LOW) — a bounded authoring-discipline lesson, not a
  generalized systemic defect.
- **F-03** `MEDIUM` → `CURRENT — REVISED`, severity `LOW`: PR #76 partially
  mitigates via bounded rotated/region recovery (geometry mapped back to the
  original frame); EXIF-normalized canonical source geometry is still absent.
  The original F-03 was accurate against `ab440b8`.
- **F-05** `MEDIUM` → `CURRENT — REVISED`: per-pass OCR/recovery timing now
  exists in the report; local latency rose (median 1646 ms, p95 4628 ms);
  deployed-environment attribution remains unmeasured.
- **F-06** confirmed and strengthened: the ADR-005 identifier collision is now a
  merged fact on `main` (both `0005-…` and `ADR-005-…` present), not pre-merge.
- **F-11** moved from OBSERVATION note to
  `UNRESOLVED — MAINTAINER CONTEXT REQUIRED`, now grounded in merged ADR-005,
  which lists confirmation activation as a review trigger.
- **F-14** count updated (#71 → #76).
- **F-01, F-04, F-07, F-08, F-09, F-10, F-12, F-13** revalidated on current
  `main` and carried forward `CURRENT — CONFIRMED` unchanged.
- Executive verdict unchanged: **PROCEED WITH BOUNDED CORRECTIONS.** Current
  counts: BLOCKING 0 · HIGH 1 · MEDIUM 3 · LOW 6 · OBSERVATION 4; historical
  corrected: 1.
- The tooling-policy documents (`ai-assisted-development-tooling.md`,
  `rubber-duck-review-tooling.md`, `ai-tool-usage-log.md`) were reassessed at
  full length; no current role/model contradiction was found, so no
  tooling-policy finding is filed.

## Files and evidence inspected (refresh)

`README.md`; `docs/adr/0001…0009`, `docs/adr/0005-use-cost-aware-openai-vision-fallback.md`,
`docs/adr/ADR-005-bounded-agent-initiative-and-maintainer-check-in.md`;
`docs/ai-assisted-development-tooling.md`; `docs/rubber-duck-review-tooling.md`;
`docs/ai-tool-usage-log.md`; `docs/extraction-full-corpus/extractor-report.md`
and `docs/extraction-baseline/`; `docs/accessibility-smoke-checklist.md`;
`docs/operator-trust-and-throughput.md`; `render.yaml`;
`src/pipeline/extractor/regions.ts`, `image-integrity.ts`;
`src/features/precheck/observation-language.ts`, `PrecheckWorkspace.tsx`,
`evidence-geometry.ts`; `src/app/page.tsx`; `src/docs/validate.ts`, `checks.ts`,
`documentation-validator.test.ts`; `tests/e2e/home.spec.ts`; `npm run docs:check`
(PASS, 4 baselined / 0 new / 0 stale, 19 warnings); GitHub state (PR #74 open;
PRs #70/#73 closed; PRs #75/#76 merged; open issues #21/#51/#57).

## Uncertainties

- EXIF misalignment is inferred from documented `sharp`/browser defaults and the
  absence of decode-time orientation in `image-integrity.ts`; no EXIF-oriented
  fixture exists to demonstrate the residual gap after PR #76's recovery passes.
- The 38-second live request was observed once; its cold-start vs
  initialization split is unmeasured, and PR #76 added recovery passes that
  raise worst-case OCR time.
- Full unit/e2e counts were not re-run locally in the audit worktree (dev
  dependencies not installed there); this refresh relies on CI green plus the
  locally verified `docs:check` PASS.
- RDR cadence (F-14) may be aspiration rather than policy while issue #21 is open.

This refresh changed no production code, no tests, no fixtures, no evaluation
results, no issues, no ADRs, and no policy; its only output is this document.
