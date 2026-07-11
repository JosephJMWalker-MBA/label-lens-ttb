# Rubber Duck Review 002 — Verdict

- **Review id:** `rdr-002-pr-037-042`
- **Review set:** PR [#37](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/37), PR [#41](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/41), PR [#42](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/42)
- **Starting `main` HEAD:** `b2ea2bfc9bd42d3507f94eb0dfa8ac496800b82e`
- **Governing process:** [Rubber Duck Review 2.0](../../rubber-duck-review-2.0.md), issue [#21](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/21)
- **Inputs:** [`source-brief.md`](./source-brief.md), [`debate-script.md`](./debate-script.md)

## Overall checkpoint verdict

**`PAUSE AND EXPAND REAL-WORLD EVIDENCE`**

This is a narrow pause, not a teardown. The three reviewed PRs delivered a
coherent, evidence-first vertical slice, a defensible work sequence, and a
governed evaluation-only corpus. Nothing in the review calls for reversing that
direction or discarding merged work.

The pause is targeted:

- The **evidence-only architecture remains sound.** The analyzer reports
  observations; deterministic rules decide; humans dispose. The separation is
  schema-enforced and durable.
- The **local OCR baseline remains useful.** `tesseract.js@7` with committed
  traineddata, deployment-relative asset lookup, and a relocation smoke is a
  legitimate, replaceable extraction foundation.
- **Deterministic rules and human authority remain durable.** Exact alcohol
  comparison, preserved ambiguity, append-only disposition, and the advisory
  boundary all hold.
- The **measurement harness must not establish a system baseline from one
  enabled real label.** One enabled real-OCR fixture plus synthetic semantic
  regressions cannot describe real-world reliability.
- **One confirmed schema-composition defect and one planning dependency cycle
  require correction first**, before measurement work treats extraction failures
  as meaningful system outcomes and before the plan is executed as written.

The repository should therefore stop expanding scope, correct the confirmed
defect and the cycle, acquire independent real-label evidence, and revise the
measurement harness — then resume.

## Decision table

Verdicts: **KEEP** (sound, retain as-is) · **HARDEN** (retain, but strengthen or
document before relying on it) · **REVISIT** (re-decide when a named condition
arrives) · **REPLACE** (change the approach).

| Decision | Evidence | Verdict | Rationale | Trigger for reconsideration | Owner issue |
|---|---|---|---|---|---|
| Local-only OCR baseline | `ocr-engine.ts`, `asset-packaging.test.ts`, `relocation-smoke.mjs` | KEEP | Replaceable, restricted-network-safe, real-OCR relocation proven | External accuracy/latency needs exceed local engine | [#13](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/13) |
| Evidence-only analyzer boundary | `analyzer.schema.ts`, ADR [0002](../../adr/0002-ai-extracts-rules-decide.md) | KEEP | Rejects regulatory-decision vocabulary; core constitutional separation | — | — |
| Independent status model | `run-status.ts`, `precheck.schema.ts` | KEEP | Processing/evidence/finding/disposition kept distinct | — | — |
| Conservative brand ambiguity | `field-selection.ts`, corrections A/H | HARDEN | Correct intent, but lone unclassified candidate breaks composition (see defect 1) | Defect 1 fixed | new issue (below) |
| Exact alcohol comparison | `wine-alcohol-parse.ts`, `wine-alcohol.rule.ts` | KEEP within current declared-vs-printed scope | Exact basis-point comparison; no fabricated tolerance | Actual-content evidence becomes available | [#6](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/6) |
| Six-rule profile | `wine-precheck.profile.ts`, `precheck-acceptance.test.ts` | HARDEN (documentation) | Behavior sound; wording "six-rule" understates three not-runs | Docs describe six outcomes + three external not-runs | [#16](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/16) |
| Machine-result identity | `serialize.ts`, `assemble.ts` | KEEP | Hashes immutable machine content; excludes disposition | — | — |
| JSON checksum | `build-json-export.ts` | KEEP | Change detection over the export payload | — | — |
| HMAC append token | `append-token.ts`, corrections D/H | KEEP for prototype, HARDEN (documentation) | Authorizes append; corrected a real attack | Persistence or multi-instance deployment begins | [#17](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/17) |
| Append-only disposition history | `disposition.ts`, `precheck-service.ts` | REVISIT | Append-only within each submitted history, not a global serialized log | Persistence begins | [#17](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/17) |
| Relocation smoke | `relocation-smoke.mjs` | KEEP | Proves deployment-relative asset resolution with real OCR | — | — |
| Resource policy | `resource-policy.ts`, `route.ts`, correction F | KEEP, HARDEN before public upload deployment | Defensive limits present; form-data buffering + concurrency unproven | Public upload deployment | [#13](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/13) |
| Two-field Slice 3 boundary | Slice 3 acceptance, PR #37 | KEEP | Narrow complete path over broad incomplete coverage | — | — |
| Evidence-before-expansion principle | [Remaining Work Plan](../../remaining-work-plan.md) | KEEP | Corpus and measurement precede new fields/rules | — | [#41](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/41) |
| Strict whole-issue execution sequence | Remaining Work Plan; issues #39/#40/#6/#16 | REPLACE | Whole-issue gates form cycles (see defect 2) | — | staged DAG (below) |
| Versioned corpus index | `corpus-index.schema.ts`, `corpus-index.test.ts` | KEEP | Strict, versioned, refinement-checked contract | — | [#10](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/10) |
| Source-chain manifest model | `fixture-manifest.schema.ts` | KEEP | Explicit sentinels; on-disk identity verified | — | [#10](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/10) |
| Truth-label boundary | `truth-boundary.test.ts` | KEEP | Production does not import corpus truth | — | — |
| Synthetic adversarial cases | `corpus-adversarial.test.ts` | KEEP as semantic regressions | Cheaply lock known semantic attacks | — | [#15](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/15) |
| One enabled real-OCR fixture | `corpus-index.json`, `corpus-real-ocr.test.ts` | REVISIT / insufficient for baseline claims | One label cannot support representative accuracy | Minimum real-label gate met | [#15](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/15) |
| Unavailable VENOM entry | `corpus-index.json`, [Fixture Corpus](../../fixture-corpus.md) | HARDEN or remove if it cannot become actionable | Inventory, not executable evidence | Screened artwork obtainable, or entry retired | [#10](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/10) |
| Low-resolution derivative | `generate-lowres-derivative.mjs`, lowres manifest | KEEP as a governed derivative, not independent evidence | Deterministic derivative of the same label | Enabled under platform-bounded job | [#15](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/15) |
| Proceeding directly to issue #15 as currently written | issue [#15](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/15) | REPLACE | Body is truncated/obsolete; would bake a baseline from one label | — | rewrite #15 (below) |

## Confirmed defects

1. **Single-candidate uncertainty composition defect.**
   - `selectBrandObservation` emits `AMBIGUOUS` with **zero alternates** for a
     lone plausible but unclassified line (e.g. `LIVE BOLDLY`, `NAPA VALLEY`).
   - The shared `observationSchema` requires every `AMBIGUOUS` observation to
     retain **at least one distinct alternate**.
   - `extractLabelEvidence` validates the selected observation through that
     schema, so the composition becomes a typed **`INVALID_RESPONSE` /
     invalid-shape** failure instead of the intended usable ambiguous evidence.
   - Selector tests assert the pre-validation state and schema tests assert the
     rule separately; **no composition test covers the contradiction.** Green
     unit suites at adjacent layers did not prove their composition.
   - Evidence: `src/pipeline/extractor/field-selection.ts`,
     `src/domain/evidence/evidence.schema.ts`,
     `src/pipeline/extractor/extractor.ts`, independent RDR-002 probe.

2. **Circular planning dependency.**
   - Issues #39 and #40 depend on #6 and #16 before final profile activation.
   - The [Remaining Work Plan](../../remaining-work-plan.md) places #39/#40
     **before** #6/#16 as whole-issue gates.
   - Read literally as blocking whole issues, these relationships form cycles.
   - Correction: replace whole-issue gates with **staged deliverables or a
     per-field DAG** (evidence contract → extraction → field normalization policy
     → rule lifecycle metadata → profile activation).

## Accepted prototype limitations

These are acknowledged and acceptable for a prototype; they bound what may be
claimed, and several become blockers only at a later phase:

- one real OCR label;
- no representative accuracy claim;
- no persistent audit chain;
- reusable bearer append token;
- token loss / restart / key-rotation consequences (outstanding tokens
  invalidated);
- per-request OCR workers (no bounded timeout or queue);
- no concurrency control (no cross-instance OCR serialization or distributed
  rate limit);
- `request.formData()` buffering risk for absent/misreported Content-Length;
- platform-bounded reproducibility (OCR determinism shown only on the locked
  runtime);
- incomplete operator-friction evidence (ambiguity-rate/rework not measured);
- no general accessibility audit (no automated scanner in CI).

## Documentation mismatches

- **ADR [0009](../../adr/0009-freeze-architecture-until-thin-vertical-slice.md)**
  is historically stale relative to the revised Slice 3 boundary: it specified a
  three-rule slice with government-warning verification and required per-stage
  timing; the merged slice is a formally revised two-field, six-outcome boundary
  without government-warning execution and deliberately excludes timing from the
  result/export contracts. No merged ADR supersedes it.
- **Issue [#15](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/15)**
  is outdated: its body is truncated after an obsolete
  `tests/fixtures/labels/...expected-fields.json` layout.
- **Issues [#27](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/27)
  and [#28](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/28)**
  remain incomplete governance work (operator-trust policy and design-review
  checklist are truncated in the repository).
- The **"six-rule profile"** should be described as **six ordered outcomes with
  three external-dependency not-runs**, not six executing regulatory checks.

## Final determination

The repository may proceed only after targeted hardening and independent
real-label acquisition. Do not expand regulatory scope yet.
