# Repository–Issue Reconciliation and Defragmentation Audit — 2026-07-13

- Status: Completed audit record (read-only)
- Auditor: Claude (AI agent), operating under the ADR-005 check-in discipline
- Base: `origin/main` at `c56a913` (PR #74 merged, on top of PR #76 `2e0963f`,
  PR #75 `ab440b8`)
- Ledger scanned: **26 open + 21 closed = 47 issues** (matches the tracker)
- Mode: audit only — this task changed no production code, tests, fixtures,
  evaluation reports, ADRs, README, issues, or labels. It did not close, reopen,
  comment on, or create any issue. Its only repository output is this document.

> **Governing principle.** The issue tracker is not merely a task list; it is a
> historical decision-and-intent ledger. Defragmentation here means restoring
> correspondence between issue state and system state **without destroying the
> history that explains how the system arrived there**. No issue is called
> completed because similarly named code exists; no issue is called stale merely
> because it is old; accepted ADRs outrank issue convenience.

## 1. Executive verdict

**RECONCILE IN BOUNDED BATCHES — the ledger is materially fragmented but
historically sound.** The 26 "open" issues are not one backlog; they decompose
into roughly **1 active-phase, 5 partially-implemented, 3 implemented/closure-or-
reconcile candidates, 2 stale-premise rewrites, ~11 deliberate future work, 2
external research notes, and 1 live-validation item.** Three specific
corruptions of correspondence dominate and should be fixed first:

1. **Deployment reality drift (#12):** still says "Deploy to Vercel or
   equivalent" while the app is deployed on **Render** (`render.yaml`) — a
   stale-premise rewrite, not a closure.
2. **Completed-but-open evaluation work (#15, and substantial parts of #57):**
   the Kaizen/eval harness the tracker still frames as unbuilt is merged and
   operational (`eval:baseline`/`eval:inventory`/`eval:inspect`,
   `docs/extraction-baseline/**`, `docs/extraction-full-corpus/**`).
3. **Closed work that has since regressed or proved incomplete (#11, #28):**
   #11 (README/docs) is correctly closed historically but the README has since
   drifted (post-foundation audit **F-01**); #28 (documentation-integrity
   checks) is correctly closed but the merged **ADR-005 identifier collision**
   (post-foundation audit **F-06**) shows the check is incomplete. Both need
   **successor** issues, not reopening.

No issue should be closed on assumption. #51 (live download bug) in particular
requires **live revalidation** on Render before any closure, because its claim
is specifically about deployed behavior.

This audit recommends a mutation plan (Section 15) but performs none of it.

## 2. Authoritative current-system snapshot (established before issue reading)

Independently established from `main` at `c56a913`, not from issue text.

- **What the product is:** a domestic-wine label **pre-check and evidence-review
  prototype** (advisory only; explicitly not a TTB approval authority). Primary
  mode: submitter/internal-reviewer pre-check (per closed #32 discovery and
  closed #36 Slice 3).
- **What it implements now:** single-image upload → local Tesseract-WASM OCR with
  bounded staged **orientation/region recovery** (PR #76) → evidence-only
  analyzer contract → two deterministic wine rules (**brand-name**,
  **wine-alcohol**; `src/domain/rules/`) → evidence-centered result UI with
  server-geometry overlays (PR #71) → append-only token-gated human disposition →
  checksum-verified JSON/HTML export. Onboarding, theme/motion, and an
  accessibility foundation are merged (PR #68).
- **What it does not implement:** OpenAI/cloud vision fallback (local-first per
  ADR-0004); the bounded-fallback state machine; designation/appellation and
  net-contents evidence slices (only a `normalize/net-contents` helper exists,
  not a rule/evidence slice); governed evidence persistence/retention; operator-
  friction telemetry; reviewer-demo authentication; TTS/dictation; label
  builder; RAG assistant; seller portal/queue.
- **Current measured extraction state** (`docs/extraction-full-corpus/extractor-report.md`,
  115 cases): brand exact **27%**, brand top-3 **33%**, correct abstention
  **100%**, absent-brand false positives **0%**, alcohol false-certainty **1%**;
  median latency **1646 ms**, p95 **4628 ms**; p95 4 OCR passes; orientation
  slice present. The report states it "is not evidence that the current
  extractor is production-ready." Note the #57 engineering gate (≈80% brand
  selected / 90% top-3) is **not yet met**.
- **Current deployment:** **Render** persistent Node web service (`render.yaml`),
  free-tier spin-down documented; **not Vercel**.
- **Current governance model:** ADRs 0001–0004, 0005 (cost-aware OpenAI vision
  fallback, Accepted but unimplemented), 0009, and **ADR-005** (bounded agent
  initiative / maintainer check-in, restored full by PR #75). Documentation-
  integrity gate (`docs:check`) PASS with a shrink-only baseline of 4.
- **Current known limitations:** README truth drift (F-01); validator blind to
  `ADR-005-*` naming + a live dual-"ADR-005" identifier collision (F-06);
  next-action guidance silent on honest brand absence (F-04); EXIF canonical-
  orientation normalization still absent after #76's recovery passes (F-03);
  deployed-latency attribution unmeasured (F-05).
- **Current active development phase:** **Phase 5A — diagnostic truth** (issue
  #78), described as observability-only with no production selection change.

## 3. Complete 47-issue reconciliation ledger

Every issue appears exactly once. "Evidence" cites `main` at `c56a913` or the
GitHub record. Confidence: H/M/L. "MDR" = maintainer decision required.

### Closed issues (21)

| # | Title | State | Disposition | Current evidence | PR/commit | Governing ADR/boundary | Recommended action | Conf | MDR |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Slice 0: Next.js scaffold | CLOSED | CLOSED — CORRECTLY COMPLETED | App scaffold present | early PRs | — | None | H | No |
| 2 | Upload & expected-fields form | CLOSED | CLOSED — CORRECTLY COMPLETED | Upload workflow exists (evolved) | — | #36 boundary | None | H | No |
| 3 | Label verification data model | CLOSED | CLOSED — CORRECTLY COMPLETED | Typed contracts evolved into evidence/label schemas | — | ADR-0002/0003 | None | H | No |
| 4 | Mock verification report | CLOSED | CLOSED — SUPERSEDED / HISTORICAL | Real analysis replaced mock | — | #36 | None (history) | H | No |
| 5 | AI extraction route (OpenAI vision) | CLOSED | CLOSED — SUPERSEDED / HISTORICAL | Local-first OCR replaced OpenAI extraction path | ADR-0004 pivot | ADR-0004 | None (history) | M | No |
| 7 | Government warning validation | CLOSED | CLOSED — SUPERSEDED / HISTORICAL | Distilled-spirits-era rule; current wine profile has brand+alcohol only | #36 redesign | #36 boundary | None (history) | M | No |
| 8 | Connect analysis → dashboard | CLOSED | CLOSED — CORRECTLY COMPLETED | Live result flow exists (UI evolved) | — | — | None | H | No |
| 9 | Exportable verification report | CLOSED | CLOSED — CORRECTLY COMPLETED | Checksum JSON/HTML export merged | PR #60 | — | None | H | No |
| 10 | Sample labels & test cases | CLOSED | CLOSED — CORRECTLY COMPLETED | Evolved into fixture corpus + eval set | #15/#57 work | — | None (see #6/#39/#40 deps referencing it) | H | No |
| 11 | Setup/tradeoffs/submission docs (README) | CLOSED | CLOSED — COMPLETED THEN LATER REGRESSED | README present but drifted; audit **F-01** | — | Documentation truth | **Successor issue** (README truth-sync); keep #11 closed | H | Yes |
| 13 | Secure deployment modes & no-LLM baseline | CLOSED | CLOSED — SUPERSEDED / HISTORICAL | No-LLM baseline realized; Render deploy diverges from the doc's mode sketch | render.yaml | ADR-0004 | None (history); reconcile forward via #12 | M | No |
| 22 | Evidence-only analyzer contract | CLOSED | CLOSED — CORRECTLY COMPLETED | Enforced by boundary/schema tests | PR (slice-2) | ADR-0009 | None | H | No |
| 23 | First end-to-end thin vertical slice | CLOSED | CLOSED — CORRECTLY COMPLETED | Slice delivered; superseded by wine Slice 3 (#36) | — | ADR-0009 | None | H | No |
| 25 | Canonical evidence identity & provenance | CLOSED | CLOSED — CORRECTLY COMPLETED | SHA-256 + version provenance flow through result/export/report | — | ADR-0003 | None | H | No |
| 26 | Align UI semantics with human authority | CLOSED | CLOSED — CORRECTLY COMPLETED | Approve/reject language only as explicit negation; disposition explicit | PR #71 area | — | None | H | No |
| 27 | Replace operator-trust policy | CLOSED | CLOSED — CORRECTLY COMPLETED | `operator-trust-and-throughput.md` complete | — | — | None | H | No |
| 28 | Documentation integrity checks | CLOSED | CLOSED — SUCCESSOR ISSUE NEEDED | Gate exists and works, but blind to `ADR-005-*` naming + live dual-005 collision (**F-06**) | RDR-001 follow-up | Governance tooling | **Successor issue** (validator hardening); keep #28 closed | H | No |
| 30 | Codex skeptical audit | CLOSED | CLOSED — CORRECTLY COMPLETED | One-off inspection pass | — | ADR-0009 | None | H | No |
| 31 | Codex implement evidence-only contract | CLOSED | CLOSED — CORRECTLY COMPLETED | Implementation of #22; historical task twin | — | ADR-0009 | None (link to #22) | H | No |
| 32 | Product discovery gate (research) | CLOSED | CLOSED — CORRECTLY COMPLETED | `docs/research/**` produced; #36 supersedes | — | — | None | H | No |
| 36 | Slice 3: first wine pre-check slice | CLOSED | CLOSED — CORRECTLY COMPLETED | End-to-end wine pre-check delivered | Slice 3 PRs | #36 boundary | None (canonical current-product issue) | H | No |

### Open issues (26)

| # | Title | State | Disposition | Current evidence | PR/commit | Governing ADR/boundary | Recommended action | Conf | MDR |
|---|---|---|---|---|---|---|---|---|---|
| 6 | Bounded field-specific normalization policies | OPEN | OPEN — PARTIALLY IMPLEMENTED | `normalize/text.ts` (brand) + `normalize/net-contents` helpers exist; no versioned policy-id/version contract, no per-rule policy binding | brand rule | ADR-0002 | Narrow to the unbuilt versioned-policy contract; note what exists | M | Yes |
| 12 | Deploy prototype & submission checklist | OPEN | OPEN — STALE PREMISE / REWRITE NEEDED | Says "Vercel"; deployed on **Render** already | render.yaml | — | Rewrite to Render reality + remaining checklist items | H | Yes |
| 14 | OCR-first pipeline w/ confidence-gated OpenAI fallback | OPEN | OPEN — PARTIALLY IMPLEMENTED | OCR-first pipeline **done** (local Tesseract); OpenAI fallback **not** built; local-first is the accepted direction | ADR-0004/0005 | ADR-0004 vs 0005 | Split: mark OCR-first done; move fallback to the fallback cluster (#24/#29) pending decision | M | Yes |
| 15 | Kaizen evaluation harness | OPEN | OPEN — IMPLEMENTED / CLOSURE CANDIDATE | `eval:baseline`/`inventory`/`inspect` + baseline & full-corpus reports merged | PR #58/#64/#66 | — | **Close with evidence** (or narrow to any explicitly missing capability) | H | Yes |
| 16 | Govern rule registry lifecycle & profile expansion | OPEN | OPEN — PARTIALLY IMPLEMENTED | `domain/rules/registry.ts` + versioned wine profile exist; full category/lifecycle governance not | — | #16 boundary | Keep open; note baseline delivered; sequence after evidence slices | M | Yes |
| 17 | Governed evidence storage & audit chain | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | No persistence in `src/`; ephemeral processing | — | ADR-0004 | Keep open as future; confirm deferral | H | No |
| 21 | Automate RDR 2.0 every three PRs | OPEN | OPEN — STALE PREMISE / REWRITE NEEDED | RDR records exist (RDR-001/002/003) + tooling doc restored; **no** `review:*` generator script; cadence drifted (audit **F-14**); two-voice method superseded by five-voice **#80** | PR #75 (docs) | RDR policy | Rewrite: reconcile cadence + fold method into #80; keep generator scope | M | Yes |
| 24 | Bounded-fallback state machine | OPEN | OPEN — BLOCKED BY DEPENDENCY | Depends on cloud fallback (#14) not built; local-first | — | ADR-0005 | Keep open; mark blocked by fallback decision | H | Yes |
| 29 | Benchmark whether cloud fallback improves outcomes | OPEN | OPEN — BLOCKED BY DEPENDENCY | Depends on fallback existing (#14/#24) | — | ADR-0005 | Keep open; blocked by fallback decision | H | Yes |
| 33 | Platform fingerprinting on Public COLA Registry | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | External TTB-site security observation; no in-repo action | — | Research note | Keep as durable research/observation record | M | No |
| 35 | Public exposure of applicant identity/signature on COLAs | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | External TTB-site privacy observation; informs fixture-privacy policy already honored | #36 privacy rule | Research note | Keep as durable research/observation record | M | No |
| 38 | Measure operator friction & throughput | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | Split from #16; not started; depends on #15/#13/#17 | — | #38 boundary | Keep open as future | H | No |
| 39 | Designation & appellation evidence slice | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | No designation/appellation rule or evidence field in `src/` | — | #36 boundary | Keep open; canonical next evidence slice | H | No |
| 40 | Net-contents & standard-of-fill slice | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | Only `normalize/net-contents` helper; no evidence slice/rule | — | #36 boundary | Keep open; sequence after #39 | M | No |
| 50 | Guided wine label builder (future) | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | Not started; explicitly post-assignment | — | Advisory boundary | Keep open as future | H | No |
| 51 | Bug: live report download buttons do nothing | OPEN | UNCERTAIN — MORE EVIDENCE REQUIRED (LIVE VALIDATION) | Downloads implemented + Playwright coverage merged (PR #60); bug was specifically about **deployed Render** behavior | PR #60 | — | **Revalidate live on Render**, then close or narrow — do not assume | M | Yes |
| 52 | UI-led annotation, onboarding, 5-second result | OPEN | OPEN — PARTIALLY IMPLEMENTED | Onboarding + result hierarchy + working downloads merged (PR #68/#71); UI-led annotation/correction not built; 5 s target unmeasured/unmet | PR #68/#71 | #52 boundary | Split: close/annotate delivered parts; keep annotation + 5 s target open | M | Yes |
| 53 | Accessibility controls & multimodal interaction | OPEN | OPEN — PARTIALLY IMPLEMENTED | Theme/motion/keyboard/live-regions/onboarding merged (PR #68); TTS + dictation not; manual checks pending (audit F-12/F-13) | PR #68 | #53 boundary | Split: mark foundation delivered; keep TTS/dictation + manual gates | M | Yes |
| 54 | Retrieval-grounded employee RAG chat (future) | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | Not started; explicitly post-core | — | Security/governance | Keep open as future | H | No |
| 55 | Seller-assisted submission portal & queue (future) | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | Not started; depends on #54 + core stability | — | ADR-005 (confirmation trigger) | Keep open as future | H | No |
| 56 | Reviewer/admin demo access (assignment UX) | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | No auth/reviewer-demo route in `src/` | — | #56 boundary | Keep open; gated behind core stability | H | No |
| 57 | Measured extraction accuracy & useful output | OPEN | OPEN — ACTIVE PHASE / IN PROGRESS | Harness + abstention (#67) + reconstruction/ranking (#69) + orientation (#76) delivered; correction UI minimal; #57 gate (~80%/90%) not met | PR #58/64/66/67/69/76 | #36 boundary | Keep open; canonical extraction-quality epic; update with measured status | H | Yes |
| 77 | Post-Phase-5 EXIF normalization & YOLO experiments | OPEN | OPEN — FUTURE / INTENTIONALLY DEFERRED | Explicitly gated to after Phase 5; #76 did bounded region rotation but **not** EXIF canonical normalization or YOLO | PR #76 (partial adjacency) | Evidence gate | Keep open; note #76 overlap; EXIF/ YOLO still future | M | No |
| 78 | Phase 5 roadmap: diagnostic truth, confidence, confirmation | OPEN | OPEN — ACTIVE PHASE / IN PROGRESS | Phase 5A active (diagnostic truth); 5B/5C future; ADR-005 governs 5C confirmation | — | ADR-005 | Keep open; consider splitting 5A/5B/5C into trackable children | H | Yes |
| 79 | Separate observation authority from implementation authority | OPEN | OPEN — IMPLEMENTED / CLOSURE CANDIDATE | Pattern now codified in **ADR-005** ("an implementation boundary should constrain changes, not observations") | PR #75 | ADR-005 | **Close as captured by ADR-005**, or convert to AGENTS.md task | M | Yes |
| 80 | Expand RDR with Coach & Analyst (five-voice) | OPEN | OPEN — PARTIALLY IMPLEMENTED | Five-voice method already used in audits (this doc; refreshed post-foundation audit); no reusable template committed | audit records | RDR policy | Keep open; narrow to "commit reusable five-voice template"; absorb #21 method drift | M | Yes |

## 4. Issue-cluster map

- **Current OCR & extraction quality:** #57 (canonical, active), #14 (OCR-first
  done / fallback split), #6 (normalization, partial), #77 (future EXIF/YOLO),
  #78 (Phase 5 active).
- **Evaluation & measurement:** #15 (canonical, **done** → closure candidate),
  #29 (fallback benchmark, blocked), #38 (operator friction, future).
- **Human review & correction:** #52 (annotation, partial), #57 (correction
  capture), #24 (protect active human review during fallback, blocked).
- **Governance & ADR integrity:** #28 (closed; successor needed), #21 (RDR
  cadence, stale), #79 (captured by ADR-005), #80 (five-voice, canonical
  method), #16 (rule-lifecycle governance, partial).
- **Product workflow & usability:** #52 (canonical), #56 (reviewer demo), #50
  (builder), #12 (submission/deploy).
- **Accessibility:** #53 (canonical, partial).
- **Deployment & operations:** #12 (stale premise), #13 (closed), #51 (live
  bug, revalidate).
- **Evidence retention & audit:** #17 (future), #25 (closed foundation).
- **Cloud fallback:** #14 (fallback half), #24 (state machine), #29 (benchmark)
  — all gated on one maintainer decision about whether local-first stays
  exclusive.
- **Future seller/reviewer architecture:** #55, #56, #54, #50.
- **Future evidence fields:** #39 (canonical next), #40 (after #39), #16
  (governance for activating them).
- **Research/security observations (external):** #33, #35 (+ closed #32).

## 5. Contradictions and stale premises

1. **#12 → Vercel vs Render.** The app is deployed on Render (`render.yaml`);
   #12 still says "Deploy to Vercel or equivalent." STALE PREMISE.
2. **#15 framed as unbuilt.** The Kaizen harness is merged and operational;
   README §7/§11/§15 *also* still deny it (audit F-01). The issue and the README
   share the same stale premise.
3. **#14 fallback framing vs ADR-0004 local-first.** #14 assumes a
   confidence-gated OpenAI fallback as the pipeline's completion; current
   architecture is deliberately local-first and the fallback is unbuilt. The
   OCR-first half is done; the fallback half is a live-vs-accepted-direction
   tension shared with #24/#29 and ADR-0005.
4. **#21 two-voice RDR vs #80 five-voice.** #21 specifies a Builder/Reviewer
   two-voice debate and an every-three-PRs cadence; #80 supersedes the method
   with five voices, and the cadence has drifted (audit F-14).
5. **#28 completeness vs merged ADR-005 collision.** #28's documentation-
   integrity check is closed as complete, but the validator does not classify
   `ADR-005-*` filenames and a real dual-"ADR-005" identifier now exists on
   `main` (audit F-06).
6. **#11 README completeness vs current drift.** Historically completed;
   currently regressed (audit F-01).

## 6. Implemented work still marked open

- **#15 Kaizen harness — CLOSURE CANDIDATE** (scripts + reports merged).
- **#57 — ACTIVE but with large delivered portions** (harness, abstention,
  reconstruction/ranking, orientation); the *gate* is unmet, so it stays open.
- **Delivered slices of #52** (onboarding, result hierarchy, working downloads)
  and **#53** (theme/motion/keyboard/live-regions) — partial; the delivered
  parts should be annotated/split rather than left implying nothing is done.
- **#79 governance pattern** — captured by ADR-005 (closure candidate).
- **#14 OCR-first half** — delivered.

## 7. Closed work requiring successors or revalidation

- **#11 (README docs)** → COMPLETED THEN REGRESSED → **successor** README
  truth-sync issue (audit F-01). Keep #11 closed.
- **#28 (documentation-integrity checks)** → SUCCESSOR NEEDED → validator-
  hardening issue for `ADR-005-*` classification + the live dual-005 identifier
  collision (audit F-06). Keep #28 closed.
- **#51 (live download bug)** — not closed; requires **LIVE VALIDATION** on the
  Render deployment before any closure, because its claim is deployment-specific
  even though downloads + Playwright coverage are merged.

## 8. Duplicate and supersession map

- **#22 ↔ #31:** #31 is the Codex *implementation task* for the #22 contract —
  historical twins, both correctly closed; link, do not merge retroactively.
- **#23 → #36:** the generic thin vertical slice was superseded by the wine
  Slice 3; both closed correctly.
- **#4, #5, #7 → #36:** mock report, OpenAI extraction route, and distilled-
  spirits government-warning rule are superseded/historical relative to the
  current wine profile.
- **#21 → #80:** RDR method superseded (two-voice → five-voice); #21 should be
  rewritten/absorbed, not duplicated.
- **#79 → ADR-005:** captured; closure candidate.
- **#14 ↔ #24 ↔ #29:** one cloud-fallback decision governs all three; they are a
  dependency chain, not duplicates.

## 9. Missing issue coverage (current obligations with no issue)

1. **README truth-sync** (audit F-01) — successor to #11.
2. **Validator hardening for `ADR-005-*` naming + dual-005 collision** (audit
   F-06) — successor to #28.
3. **Phase 5D / 5E** — #78 enumerates only 5A/5B/5C; later phases are unrepresented.
4. **AGENTS.md + ADR-index governance** (the constitutional-context work
   discussed to prevent ADR-blindness) — related to #79/#80 but has no dedicated
   tracking issue.
5. **EXIF canonical-orientation normalization** as distinct from #76's bounded
   region recovery (audit F-03) — currently only implicit inside future #77.
6. **Next-action guidance for honest brand absence** (audit F-04) — no issue.

## 10. Proposed canonical roadmap sequence

1. **Now / active:** #57 (extraction quality) and #78 Phase 5A (diagnostic
   truth) — keep as the spine.
2. **Truth-alignment before submission (docs-only, low risk):** successor to
   #11 (README), reconcile #12 (Render), close #15, successor to #28 (validator).
3. **Bounded product completeness:** finish the open halves of #52 (annotation)
   and #53 (TTS/dictation + manual gates); revalidate #51 live.
4. **Evidence expansion:** #39 (designation/appellation) → #40 (net-contents),
   governed by #16 and #6.
5. **Cloud-fallback decision gate:** resolve local-first-only vs fallback
   (ADR-0004 vs 0005); this unblocks/closes #14-fallback, #24, #29.
6. **Governance formalization:** #80 five-voice template, absorbing #21; close
   #79.
7. **Deliberate future:** #17, #38, #50, #54, #55, #56, #77 — remain future.
8. **Durable research notes:** #33, #35 — remain as observations.

## 11. Safe administrative actions (evidence clear, no product decision)

- Rewrite **#12** deployment target Vercel → Render (fact on `main`).
- **Close #15** with an evidence comment linking the merged scripts/reports.
- Post an evidence comment on **#57** recording the delivered PRs and current
  measured status (keep open).
- File the two **successor** issues (#11→README, #28→validator) — *creation is a
  maintainer action per the task's do-not list; drafted below, not executed.*

## 12. Maintainer decisions required

- **Cloud fallback (ADR-0004 vs 0005):** does local-first remain exclusive? This
  governs #14 (fallback half), #24, #29.
- **#79 closure:** accept that ADR-005 captured the pattern and close, or keep as
  an AGENTS.md task?
- **#21 vs #80:** rewrite #21 or fold it into #80; confirm RDR cadence.
- **#51 live status:** who runs the Render revalidation, and is closure or
  narrowing wanted?
- **#52 / #53 splitting:** approve splitting delivered vs remaining scope.
- **#6 / #16 scope narrowing** to the genuinely unbuilt governance layer.
- **Successor issue creation** for F-01 and F-06 (maintainer-only per do-not
  list).

## 13. Five-voice Rubber Duck Review

**Prosecutor —** The tracker materially misrepresents reality in three ways that
could mislead a fresh agent into wrong work: #12 would send someone to configure
**Vercel** for an app already on **Render**; #15 (plus README) would make an
agent *rebuild* a merged, operational evaluation harness; and #14 invites wiring
an **OpenAI fallback** that ADR-0004's local-first decision deliberately avoids.
#28's "complete" closure hides an incomplete check (the live dual-005 collision).
Left unreconciled, "26 open issues" hides that only ~1 is active and ~11 are
explicitly future — an inflated backlog that taxes every planning session.

**Defender —** Almost every "stale" issue was a rational historical step.
#4/#5/#7 were correct for their era and were *deliberately* superseded by the
wine pivot (#32→#36), which is exactly how a discovery-gated project should
evolve. Keeping #17, #38, #50, #54, #55, #56 open is legitimate intent
preservation, not clutter — closing them would erase a carefully sequenced
roadmap. The cloud-fallback trio (#14/#24/#29) is not confused; it is a
correctly-decomposed decision awaiting one maintainer call. The separation of
rule correctness (#16) from operator telemetry (#38), and of extraction (#57)
from presentation (#52/#56), is principled and should be preserved.

**Analyst —** Do not let "26 open" stand undifferentiated. Decomposition:

- By disposition (open): ACTIVE PHASE 2 (#57, #78); PARTIALLY IMPLEMENTED 5 (#6,
  #16, #52, #53, #80); IMPLEMENTED/CLOSURE-OR-CAPTURED CANDIDATE 2 (#15, #79);
  STALE PREMISE / REWRITE 2 (#12, #21); BLOCKED BY DEPENDENCY 2 (#24, #29);
  PARTIALLY IMPLEMENTED w/ dependency 1 (#14); FUTURE / DEFERRED 9 (#17, #38,
  #39, #40, #50, #54, #55, #56, #77); RESEARCH NOTE 2 (#33, #35); LIVE-VALIDATION
  UNCERTAIN 1 (#51). *(= 26.)*
- By disposition (closed): CORRECTLY COMPLETED 13 (#1,2,3,8,9,10,22,23,25,26,27,
  30,31,32→ note #32 research, and #36); SUPERSEDED/HISTORICAL 4 (#4,5,7,13);
  SUCCESSOR NEEDED 1 (#28); COMPLETED-THEN-REGRESSED 1 (#11). *(#36 counted in
  completed; total 21.)*
- Implemented-but-open: **1 full** (#15) + substantial partials in #57/#52/#53.
- Stale-premise: **2** (#12, #21). Partially implemented: **5**. Future/deferred:
  **9** (+2 research). Duplicate/superseded live tension: **#21→#80**,
  **#79→ADR-005**. Closed-regressed/successor: **2** (#11, #28).
- Maintainer-decision issues: **~9**. Issues with no current code evidence (pure
  future/research): #17, #33, #35, #50, #54, #55 — expected and fine.
- **Current obligations with no issue: 6** (Section 9).

**Coach —** The dominant context-debt cost is that a fresh session must
reconstruct which of 26 issues are live. Issues that mix phases are the worst
offenders: **#52** and **#53** each bundle delivered + future scope, so their
"open" state understates progress and forces re-derivation every time; **#57** is
a healthy epic but its measured status lives in PR history, not the issue; the
**cloud-fallback decision** lives only in ADR text and maintainer memory, not in
#14/#24/#29. Titles like #12 actively mislead. The highest-leverage,
lowest-risk relief is documentation-only: reconcile #12, close #15, annotate
#57, and split #52/#53 — converting endurance (re-reading everything each
session) into durable structure. The good news: ADR-005 and the restored
governance records already moved several decisions out of memory and into the
repo; #79 becoming an ADR is the model to repeat for #21/#80.

**Judge —** The evidence justifies bounded reconciliation, not aggressive
cleanup. Classified proposed actions:

- **SAFE ADMINISTRATIVE ACTION:** rewrite #12 to Render; close #15 with evidence;
  evidence-comment #57.
- **MAINTAINER CONFIRMATION REQUIRED:** split #52/#53; narrow #6/#16; rewrite
  #21 / fold into #80; close #79 as captured by ADR-005; create F-01/F-06
  successor issues.
- **ARCHITECTURAL DECISION REQUIRED:** the local-first-vs-cloud-fallback call
  governing #14/#24/#29.
- **LIVE VALIDATION REQUIRED:** #51 download behavior on the Render deployment.

No issue should be closed merely because similarly named code exists (#51 is the
guardrail case); no issue should be closed merely for age (#17/#50/#54/#55 are
legitimately future).

## 14. Sustainability and context-debt assessment

- **Engineering velocity:** sustainable, but tracker hygiene lags delivery
  (eight+ substantive PRs since RDR-003; F-14).
- **Context debt:** **moderate–high**, concentrated in undifferentiated "open"
  count and phase-mixed issues (#52, #53, #57).
- **Documentation drift:** moderate (README F-01; #12 deployment; #21 method).
- **Decision traceability:** partial — the cloud-fallback decision and RDR
  cadence live in ADRs/memory, not in the governing issues.
- **Cognitive-load contributors:** 26-open framing; phase-mixed issues; decisions
  held outside their issues.
- **Repeated-reconstruction sources:** "is the eval harness done?", "are we on
  Vercel or Render?", "is fallback happening?" — all answerable once and pinned.
- **Process improvements that reduce future heroics:** the reconciliation batches
  in Section 15; pinning measured status onto #57; converting #79/#21 patterns
  into ADR/template form as already done for ADR-005.

## 15. Recommended mutation plan (proposed only — not executed)

Ordered. History-preserving comments drafted where closure/rewrite is proposed.

| Order | Issue | Proposed action | Exact reason | Evidence | Preserve-history comment? | Successor/replacement | Dependency impact | Approval level |
|---|---|---|---|---|---|---|---|---|
| 1 | #12 | Rewrite body: Vercel → Render + remaining checklist | Deployed on Render | `render.yaml` | Yes (note original Vercel plan) | — | none | SAFE ADMIN |
| 2 | #15 | Close with evidence | Harness merged & operational | `eval:*` scripts; `docs/extraction-*/**`; PR #58/64/66 | Yes (closure comment below) | — | referenced by #6/#16/#38/#39/#40 as dep → mark satisfied | SAFE ADMIN |
| 3 | #57 | Evidence-comment; keep open | Large delivered portion; gate unmet | PR #67/#69/#76; report metrics | Yes | — | anchors extraction cluster | SAFE ADMIN |
| 4 | #11 | Keep closed; create successor | README regressed since closure | audit F-01; README §7/§11/§15 | Yes | **New:** "README truth-sync to merged evaluation reality" | none | MAINTAINER CONFIRM |
| 5 | #28 | Keep closed; create successor | Check incomplete for ADR-005 naming/collision | audit F-06; `validate.ts classify` | Yes | **New:** "Harden docs validator for `ADR-005-*` + id collision" | none | MAINTAINER CONFIRM |
| 6 | #52 | Split: annotate delivered, keep annotation + 5 s open | Phase-mixed; understates progress | PR #68/#71 | Yes | optional child issues | none | MAINTAINER CONFIRM |
| 7 | #53 | Split: mark foundation done, keep TTS/dictation + manual gates | Phase-mixed | PR #68; F-12/F-13 | Yes | optional child issues | none | MAINTAINER CONFIRM |
| 8 | #21 | Rewrite/absorb into #80; reconcile cadence | Method superseded (two→five voice); no generator | #80; F-14; no `review:*` script | Yes | fold into #80 | governance cluster | MAINTAINER CONFIRM |
| 9 | #79 | Close as captured by ADR-005 (or convert to AGENTS.md task) | Pattern now an accepted ADR | ADR-005 text | Yes (closure comment below) | ADR-005 / AGENTS.md | none | MAINTAINER CONFIRM |
| 10 | #14 | Split OCR-first (done) from fallback; route fallback to decision | OCR-first delivered; fallback unbuilt | ADR-0004; local pipeline | Yes | — | ties to #24/#29 | ARCH DECISION |
| 11 | #24, #29 | Keep open; mark blocked by fallback decision | Depend on unbuilt fallback | — | Yes | — | blocked by #14 decision | ARCH DECISION |
| 12 | #51 | Revalidate live on Render; then close or narrow | Deployment-specific claim | PR #60 (impl); Render | Yes | — | export/eval workflows | LIVE VALIDATION |
| 13 | #6, #16 | Narrow to unbuilt governance layer | Baselines partly delivered | `normalize/*`; `registry.ts` | Yes | — | evidence-slice activation | MAINTAINER CONFIRM |
| 14 | #78 | Consider splitting 5A/5B/5C (+add 5D/5E) into children | Phases need trackable units | #78 body | Yes | child issues | active phase | MAINTAINER CONFIRM |

**Drafted closure comment — #15:**
> Closing as implemented. The Kaizen/evaluation harness is merged and operational
> on `main`: `eval:baseline`, `eval:inventory`, and `eval:inspect` scripts,
> `src/fixtures/eval/**`, and the generated reports in
> `docs/extraction-baseline/**` (15-label) and `docs/extraction-full-corpus/**`
> (115-case, current metrics: brand exact 27%, top-3 33%, 100% correct
> abstention, 0% absent-brand false positives). Delivered across PRs #58/#64/#66.
> Any remaining tuning is tracked under #57. History preserved; reopen only if a
> specific harness capability is found missing.

**Drafted closure comment — #79:**
> Closing as captured by ADR-005 (*Bounded Agent Initiative and Maintainer
> Check-In*), which codifies the governing pattern: "an implementation boundary
> should constrain changes, not observations," with the Observe → Classify →
> Bound → Implement narrowly → Record deferred sequence. If a concrete AGENTS.md /
> ADR-index deliverable is still wanted, that should be a fresh, narrowly scoped
> issue rather than this open-ended record.

**Drafted rewrite scope — #12:** *Title:* "Finalize Render deployment and
submission checklist." *Scope:* deployed URL in README; confirm free-tier
cold-start behavior; API-key/no-LLM baseline behavior; sample-input walkthrough;
final submission checklist — replacing the Vercel assumption.

## 16. Deferred observations (not implemented)

- ADR-005 identifier collision and validator hardening (F-06) — recorded here as
  successor-to-#28; not implemented.
- README truth-sync (F-01) — recorded as successor-to-#11; not implemented.
- Phase 5D/5E and AGENTS.md/ADR-index tracking gaps — recorded as missing
  coverage; no issues created (creation is a maintainer action).
- Cloud-fallback architectural decision — surfaced, not decided.

## 17. Uncertainties and evidence not reproduced

- **#51 live behavior** was **not** reproduced against the deployed Render
  instance (no live validation performed); classification is therefore
  UNCERTAIN pending that check.
- Full unit/e2e suites were **not** re-run in this worktree (dev dependencies not
  installed); `docs:check` PASS was verified for the sibling audit worktree on
  the same `main`.
- Several issue bodies (#13, #14, #15, #30, #31, #35, #77, #78) are long; where
  the tail was not fully material to disposition, classification relied on the
  stated goal, acceptance criteria, and current-`main` evidence.
- PR-to-issue links were inferred from commit/PR history and file evidence, not
  from explicit GitHub "closes #" metadata in every case; identifications marked
  where confidence is M.
- This audit did not read exhaustive issue comment threads; comments were sampled
  only where body/state was ambiguous, per the task's anti-inflation instruction.

This audit changed no production code, tests, fixtures, evaluation reports, ADRs,
README, issues, or labels; it created, closed, edited, and commented on nothing
in the tracker. Its only output is this document.
