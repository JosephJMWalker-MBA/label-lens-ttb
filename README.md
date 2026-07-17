# Label Lens TTB

Label Lens TTB is a **domestic-wine label prescreen prototype**. A reviewer uploads
wine-label artwork (or loads a bundled sample) and enters the application facts
(brand name and alcohol value). Local OCR/extraction surfaces **brand** and
**alcohol** evidence from the image; deterministic wine rules compare that evidence
against the entered application facts; and the result **preserves uncertainty and
keeps a human authoritative**. It produces an explainable, checksum-protected
report. **It does not approve or reject labels, and it is not a TTB system.**

> **AI and OCR may extract evidence. Deterministic rules evaluate that evidence.
> Human reviewers remain authoritative.**

This is a focused prototype of one review contract on a single image — not a
complete alcohol-label verification system across all beverage types. What is and
is not implemented is stated explicitly below.

---

## 2. Live demo

**<https://ttb-test.com>**

Secondary deployment: <https://label-lens-ttb.onrender.com>

On the deployed demo you can:

- load the bundled **M Cellars** sample, or upload a supported PNG/JPEG wine-label image;
- enter the application **brand name** and **alcohol value**;
- run the prescreen (real local OCR + deterministic rules run server-side);
- inspect the **concise result** and expand full **evidence**, **regulatory checks**, and **technical provenance**;
- record an **internal disposition** (operator workflow note);
- download a **checksum-protected JSON export** and a **readable HTML report**.

> The public deployment is a **reviewer demonstration**, not a government system,
> not a COLA integration, and not a production authorization. It processes one
> image in memory and stores nothing between requests.

---

## 3. Five-minute reviewer path

1. Open the [live demo](https://ttb-test.com).
2. Click **Load verified M Cellars sample** (or upload a wine-label PNG/JPEG and enter brand + alcohol).
3. Read the **concise summary**: detected brand, detected alcohol, count needing review, one suggested next step.
4. Expand **Evidence details**, **Regulatory checks**, and **Technical provenance** to see raw values, findings, geometry, and versions.
5. In **Downloads**, download the **JSON export** and the **HTML report**; optionally record a disposition and re-download to see it included.
6. Optional: [run locally](#7-running-locally) and inspect the test suites.

---

## 4. What is implemented today

Verified against `main`. This is the current behavior, not a roadmap.

- **One-image domestic-wine workflow** — a single label per run, via upload or the bundled sample; source `upload` or `sample`.
- **PNG/JPEG validation** — declared type checked against decoded format; empty/oversized/corrupt images and out-of-bounds dimensions/pixel budgets are rejected with typed errors.
- **Immediate local image preview** — a client object URL preview with filename/type/size, replace/clear, revoked on change/unmount; the file is not uploaded to build the preview.
- **Application-fact inputs** — operator-entered **brand name** and **alcohol value** (percent), clearly labelled as entered facts, **not** OCR output.
- **Local OCR-based observations** — brand and alcohol evidence extracted by a vendored **Tesseract WebAssembly** engine running server-side (no mandatory cloud call).
- **Machine observation states** — `OBSERVED`, `LOW_CONFIDENCE`, `AMBIGUOUS`, `NOT_OBSERVED`, presented in plain language while the exact state stays in the technical detail.
- **Deterministic wine rules currently present** — executed: `wine-alcohol-syntax`, `wine-alcohol-declared-comparison`, `brand-name-canonical-comparison`; plus three **evidence-dependent** checks that deliberately do **not run** from artwork alone (`wine-alcohol-actual-content-tolerance`, `wine-alcohol-class-type-boundary`, `wine-alcohol-omission-eligibility`).
- **Evidence geometry and provenance** — per-field bounding boxes and reference frame, plus extractor/OCR/parser identities and versions and the derivative SHA-256.
- **Uncertainty and human-review states** — findings are `PASS` / `WARN` / `FAIL` / `NEEDS_REVIEW` / `not_run`; there is **no overall pass/fail verdict**.
- **Checksum-protected JSON export** — canonical JSON with a SHA-256 integrity block that can be re-verified with the committed export logic.
- **Readable HTML report** — a deterministic, human-readable report of the same validated result.
- **Append-only internal disposition history** — an operator can record a bounded internal-workflow decision (e.g. *escalated for human review*) that is appended to the result via a server-issued authorization token; it never edits or deletes machine findings.
- **Progressive-disclosure result UI** — concise summary first, with Evidence / Regulatory checks / Technical provenance / Downloads / disposition behind accessible disclosures.
- **Accessible error handling and real browser downloads** — labelled inputs, keyboard-operable disclosures, `role="alert"` errors, and a hardened download path (see [PR #60](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/60)).
- **A versioned wine-label fixture corpus and a bounded real-OCR regression** — see [`docs/fixture-corpus.md`](docs/fixture-corpus.md) and `src/fixtures/corpus-real-ocr.test.ts`.
- **Testing** — unit/component (Vitest + Testing Library), architectural/boundary tests, a production build, a relocation smoke, and Playwright end-to-end coverage.

> The [original vision](docs/original-vision-and-scope.md) lists seven target
> label fields. **Only brand name and alcohol content are extracted today.**

---

## 5. What is deliberately not implemented

Current non-goals (by design for this prototype):

- No TTB approval or rejection, and no overall compliance verdict.
- No COLA integration; no government authentication, identity, or authorization.
- No production identity/authorization or hardened production environment.
- No batch/multi-image submission workflow; no applicant/seller portal.
- No retained production evidence store (processing is in-memory and ephemeral).
- No cloud-vision fallback in the current public flow (local OCR only).
- No beer, malt-beverage, or spirits scoring — **domestic wine only**.
- No complete regulatory review, entitlement determination, automatic policy creation, or self-training.

Several of these exist as **accepted architecture** or **roadmap** (see §6 and §15) but are **not** current behavior.

---

## 6. System architecture

Current end-to-end flow (implemented on `main`):

```text
Browser (upload + application facts)
  → upload validation (type / size / integrity / bounds)
  → local extraction (Tesseract WASM OCR)
  → typed observations (brand, alcohol; state + geometry + provenance)
  → deterministic wine rules (versioned)
  → governed findings (PASS / WARN / FAIL / NEEDS_REVIEW / not_run)
  → report generation (checksum JSON + readable HTML)
  → human disposition (append-only internal workflow record)
```

Details: [`docs/architecture.md`](docs/architecture.md), the analyzer/result
contracts under `src/pipeline/`, and the ADRs in [`docs/adr/`](docs/adr/).

### Future-compatible architecture (seams, not current behavior)

The code is organized so these accepted directions can be added behind stable
interfaces **without** rework — but none is active in the public flow today:

- **Replaceable analyzers** behind a stable observation contract ([ADR-0004](docs/adr/0004-local-first-replaceable-analysis.md)).
- **Bounded optional cloud-vision enhancement** behind that same interface ([ADR-0005](docs/adr/0005-use-cost-aware-openai-vision-fallback.md)).
- **Secure, configurable evidence retention and audit** ([`docs/evidence-retention-and-auditability.md`](docs/evidence-retention-and-auditability.md)).
- **Batch/camera intake** and **reviewer/applicant workflows** ([`docs/usability-accessibility-batch-workflow.md`](docs/usability-accessibility-batch-workflow.md)).

---

## 7. Running locally

**Prerequisites**

- **Node 22** (`.nvmrc` = `22`; `engines` requires `>=22 <23`).
- A **glibc** environment (Debian/Ubuntu or macOS) for the native `sharp` binary.
- No network is needed at request time — OCR language data and the WASM core are vendored.

**Install, develop, build, and run**

```bash
npm install                # install dependencies
npm run dev                # start the dev server (http://localhost:3000)
npm run build              # production build (Next.js standalone output)
npm run start              # start the production server (binds to $PORT, default 3000)
```

**Quality and tests**

```bash
npm run format:check       # Prettier (use `npm run format` to write)
npm run lint               # ESLint (next lint)
npm run typecheck          # tsc --noEmit
npm test                   # full Vitest suite (unit / component / boundary)
npm run test:coverage      # Vitest with coverage
npm run smoke:relocation   # standalone relocation smoke (requires a prior build)
```

**Playwright (end-to-end)**

```bash
npx playwright install     # one-time: download browser binaries
npm run test:e2e           # runs tests/e2e; starts a dev server automatically
```

**Signing key for pre-checks.** Every pre-check issues an HMAC append-authorization
token. In **development**, a process-local key is used automatically — no setup
needed. In **production** you must set `LABEL_LENS_APPEND_SIGNING_KEY` (see §8), or
pre-checks return HTTP 500. There is no `eval:baseline` script on `main` (the
extraction-accuracy harness is on a separate branch — see §11).

---

## 8. Environment variables

Derived from the code (`src/server/append-token.ts`, `src/app/api/health/route.ts`,
`src/server/runtime-provenance.ts`, `src/pipeline/extractor/ocr-engine.ts`) and
[`docs/deployment.md`](docs/deployment.md). **No secret is committed to the repo.**

| Variable | Required? | Purpose | Local development | Production expectation |
|---|---|---|---|---|
| `LABEL_LENS_APPEND_SIGNING_KEY` | **Required in production** | Secret used to HMAC-sign the per-result append-authorization token | Optional — a process-local key is used automatically when unset (non-production) | Must be set to a ≥ 32-char secret (e.g. `openssl rand -hex 32`); otherwise pre-checks return HTTP 500. Set only in the platform secret store |
| `NODE_ENV` | Set by platform | Selects production vs. development behavior (incl. the signing-key fallback) | Usually `development` | `production` |
| `PORT` | Set by platform | Port the server binds to | Defaults to `3000` | Provided by the host |
| `LABEL_LENS_BUILD_COMMIT` | **Required for auditable Hostinger exports** | Stamps the running commit into export provenance | Unset is fine | Set to the deployed commit SHA on Hostinger; Render can fall back to `RENDER_GIT_COMMIT` |
| `LABEL_LENS_OCR_ASSET_DIR` | Optional | Override the OCR language-data directory | Not needed (resolves deployment-relative) | Not needed |
| `LABEL_LENS_OCR_CORE_DIR` | Optional | Override the OCR WASM-core directory | Not needed (resolves deployment-relative) | Not needed |

---

## 9. Deployment

The primary public deployment runs on **Hostinger Web Apps** at
<https://ttb-test.com>, connected to the GitHub `main` branch with the Next.js
preset and Node 22.x. Details and the full production checklist are in
[`docs/deployment.md`](docs/deployment.md).

- **Primary public demo:** <https://ttb-test.com>
- **Secondary Render demo:** <https://label-lens-ttb.onrender.com>
- **Build / start:** `npm ci --include=dev && npm run build` then `npm run start`.
- **Runtime:** a persistent Node 22 server with `output: "standalone"` (not static hosting, not short-lived serverless — OCR runs in a Node worker); ~512 MB RAM; glibc for `sharp`.
- **Required secret:** `LABEL_LENS_APPEND_SIGNING_KEY`. `GET /api/health` reports `appendSigningKeyConfigured`.
- **Required Hostinger provenance:** `LABEL_LENS_BUILD_COMMIT` set to the deployed commit SHA.
- **Ephemeral by design:** uploads are processed in memory and **never written to disk**; nothing is persisted between requests.

A production smoke test on 2026-07-17 confirmed real server-side OCR, deterministic
rule execution, honest `AMBIGUOUS` / `NEEDS_REVIEW` handling, and successful JSON
and HTML downloads. It also exposed the missing deployed-commit provenance when
`LABEL_LENS_BUILD_COMMIT` is unset; see the deployment document for the corrective
configuration and remaining manual-upload test.

The standalone build is exercised by `npm run smoke:relocation`, which relocates
the standalone output outside the repo and drives a real OCR request — so the
earlier standalone asset-resolution risk is guarded and is **not** a current known
warning.

---

## 10. Evidence, rules, and human authority

> **OCR and AI may extract evidence. Deterministic rules evaluate that evidence.
> Human reviewers remain authoritative.**

The UI keeps these layers distinct:

- **Observed artwork evidence** — what OCR read from the image (brand/alcohol values, confidence, geometry). Uncertain readings stay uncertain (`AMBIGUOUS`, `LOW_CONFIDENCE`, `NOT_OBSERVED`).
- **Application-declared facts** — the brand and alcohol values the operator entered; never presented as extracted.
- **Deterministic findings** — versioned rule outcomes comparing evidence with declared facts (`PASS`/`WARN`/`FAIL`/`NEEDS_REVIEW`). There is no aggregate score.
- **Checks that cannot run without external evidence** — grouped and marked `not_run` (e.g. actual-content tolerance), because artwork alone cannot establish them.
- **Internal human disposition** — an operator's append-only workflow note; it does **not** change machine findings.
- **Actual TTB action** — out of scope; this tool never performs or represents one.

---

## 11. Evaluation status

- The repository on `main` includes a **versioned wine-label fixture corpus** and a **bounded real-OCR regression** (`src/fixtures/corpus-real-ocr.test.ts`, [`docs/fixture-corpus.md`](docs/fixture-corpus.md)) that runs the real extractor deterministically on enabled fixtures.
- A **complete wine-corpus extraction evaluation is in progress on a separate branch** and is **not merged**; its metrics are not yet authoritative. **No provisional counts, accuracy figures, or tuning recommendations from that work are published here.**
- Any early diagnostic baseline was intentionally **small and diagnostic** — a starting instrument, not a production accuracy claim.
- **Tuning should follow measured failure categories, not anecdotes.** Current extraction accuracy must **not** be read as production-ready.

> The measured extraction-accuracy harness and its baseline report are part of the
> in-progress evaluation branch and are **not on `main`**; this README does not
> quote their results.

---

## 12. Tradeoffs and known limitations

- **Local OCR** (vendored Tesseract) supports privacy and reproducibility and needs no cloud call, but it **misses difficult layouts** — decorative/script brands, low contrast, rotated side text, and split alcohol tokens are frequently `AMBIGUOUS` or `NOT_OBSERVED`.
- **Preserving uncertainty** avoids false certainty but can **route more results to a human**, rather than auto-clearing them.
- **Deterministic rules** are explainable and auditable but cover **only the implemented evidence slices** (brand + alcohol); most regulatory checks are intentionally `not_run`.
- **A single-image prototype** proves the review contract but **not batch throughput** or queueing.
- The **public demo differs from a secure government environment** (no auth, ephemeral processing, public custom domain).
- **Artwork alone cannot establish every regulatory fact** (actual alcohol content, class/type, omission eligibility) — these stay `not_run` by design.
- **Browser downloads** were recently hardened ([PR #60](https://github.com/JosephJMWalker-MBA/label-lens-ttb/pull/60)); the Chromium path is covered by Playwright, but **cross-browser (Firefox/Safari) live verification is still recommended** since the original symptom was environment-dependent.

---

## 13. Security and privacy boundary

Only what is true on `main` today:

- **Server-side processing** — OCR, rules, export, and signing run on the server; the browser never calls a model provider directly.
- **No secrets in the client bundle** — the signing key stays server-side; the browser only carries an opaque append token.
- **File validation** — declared type vs. decoded format, size/dimension/pixel-budget limits, corrupt-image rejection.
- **Bounded reports and errors** — user-safe error codes; no stack traces, absolute paths, or environment data leak into responses or exports.
- **No hidden training on uploads** — uploads are used only to produce the current result.
- **Ephemeral retention** — images are processed in memory and not persisted; nothing is retained between requests.
- **Integrity** — exports carry a SHA-256 integrity value re-verifiable with the committed export logic.
- **Public-demo limits** — this is a demonstration, not a hardened production system.

> This is **not** FedRAMP-authorized, not ATO'd, not compliance-certified, and not
> government-endorsed. See [`docs/compliance-readiness-boundary.md`](docs/compliance-readiness-boundary.md).

---

## 14. Stakeholder mapping

From the take-home discovery notes (full narrative in
[`docs/original-vision-and-scope.md`](docs/original-vision-and-scope.md)).

| Stakeholder | Operational concern | Current design response | Remaining gap |
|---|---|---|---|
| **Sarah** — adoption | Fast, obvious tool that removes repetitive work | One-screen review-first flow; concise summary; real server-side prescreen | Speed not yet benchmarked to a budget; no batch to remove bulk work |
| **Dave** — judgment | Human-obvious equivalents (`STONE'S THROW` ≈ `Stone's Throw`) shouldn't be false mismatches | Normalized brand comparison; uncertainty preserved rather than naïve string equality | Broader semantic/nuance coverage across more fields is future work |
| **Jenny** — strict compliance / hard images | Exact statutory text; honest handling of poor images | Deterministic rules with no aggregate verdict; `AMBIGUOUS`/`NOT_OBSERVED` surfaced honestly | Government-warning and layout rules not yet implemented; no image-quality gate |
| **Marcus** — boundaries / federal reality | Standalone, no mandatory cloud, no false FedRAMP claim | Local OCR, no COLA coupling, explicit "not a TTB system" framing | Retention, audit, and secure deployment remain architectural, not active |

---

## 15. Roadmap

Direction, **not commitment**, ordered by evidence rather than hype:

1. Complete the **full-corpus extraction measurement** (in progress, separate branch).
2. Repair the **largest measured extraction failures** first.
3. Add **guided correction and annotation** for reviewers.
4. Expand **bounded wine evidence slices** (e.g. net contents, government warning) rule by rule.
5. Add **applicant and reviewer workflows**.
6. Add **secure evidence retention and audit** infrastructure.
7. Validate **fallback, batch, and operational deployment** modes.

See [`docs/remaining-work-plan.md`](docs/remaining-work-plan.md) and
[`docs/product-plan.md`](docs/product-plan.md).

---

## 16. Repository map

| Area | Location |
|---|---|
| UI / workspace | [`src/features/precheck/`](src/features/precheck/), [`src/app/page.tsx`](src/app/page.tsx) |
| Extractor (OCR + selection) | [`src/pipeline/extractor/`](src/pipeline/extractor/) |
| Analyzer / result contracts | [`src/pipeline/analyzer/`](src/pipeline/analyzer/), [`src/pipeline/result/`](src/pipeline/result/) |
| Rule registry (wine rules) | [`src/domain/rules/`](src/domain/rules/), [`src/domain/verification/`](src/domain/verification/) |
| Report / export | [`src/pipeline/export/`](src/pipeline/export/) |
| API routes | [`src/app/api/precheck/`](src/app/api/precheck/), [`src/app/api/health/`](src/app/api/health/) |
| Fixtures / evaluation corpus | [`src/fixtures/`](src/fixtures/), [`tests/fixtures/precheck/`](tests/fixtures/precheck/) |
| Tests (e2e) | [`tests/e2e/`](tests/e2e/) |
| Architecture / security docs | [`docs/architecture.md`](docs/architecture.md), [`docs/security-deployment-strategy.md`](docs/security-deployment-strategy.md), [`docs/adr/`](docs/adr/) |

More design docs: [`docs/product-plan.md`](docs/product-plan.md),
[`docs/validation-rules.md`](docs/validation-rules.md),
[`docs/ocr-reliability-strategy.md`](docs/ocr-reliability-strategy.md),
[`docs/test-strategy.md`](docs/test-strategy.md),
[`docs/system-governance.md`](docs/system-governance.md),
[`docs/slice-3-acceptance.md`](docs/slice-3-acceptance.md),
[`docs/submission-scope-and-definition-of-done.md`](docs/submission-scope-and-definition-of-done.md),
and the preserved [original vision](docs/original-vision-and-scope.md).

---

## 17. Validation and submission status

Run the repository's full validation locally (these are the commands CI/review use):

```bash
npm run format:check     # formatting
npm run lint             # lint
npm run typecheck        # type checking
npm test                 # unit / component / architecture-boundary tests
npm run build            # production build
npm run smoke:relocation # standalone relocation smoke (after build)
npm run test:e2e         # Playwright browser workflow (after `npx playwright install`)
```

Together these cover formatting, lint, type checking, unit/component tests,
architectural boundaries, the production build, the standalone relocation smoke,
and the real browser workflow. Exact pass counts are intentionally **not** hardcoded
here, since they change as the suite grows — run the commands to see current results.

The system is **live** at <https://ttb-test.com>. This repository is a
hiring-assignment submission; nothing here should be read as a formally accepted,
certified, or complete deliverable.

> *"Let all things be done decently and in order." — 1 Corinthians 14:40*
