# Label Lens TTB

Label Lens TTB is a **domestic-wine label prescreen prototype** that helps a seller or reviewer assemble, inspect, and evaluate label evidence without pretending to make a government decision.

A user provides label artwork and application facts. Local OCR extracts bounded evidence from the artwork. Versioned deterministic rules compare that evidence with the declared facts. The system preserves uncertainty, exposes provenance, and keeps the human reviewer authoritative.

> **OCR and AI may extract evidence. Deterministic rules evaluate that evidence. Human reviewers remain authoritative.**

**Label Lens does not approve or reject labels, is not a TTB system, and is not legal advice.**

## Live demo

- Primary: **<https://ttb-test.com>**
- Secondary: <https://label-lens-ttb.onrender.com>
- Legacy one-image review: `/review/legacy`

The public deployment is a reviewer demonstration. It is not a COLA integration, production authorization, or hardened government environment.

---

## Project status

The project has moved beyond a simple OCR demonstration. It now contains two connected product slices:

1. **Seller package preparation** for front, back, and optional label panels.
2. **A one-image domestic-wine prescreen** using real local OCR, deterministic checks, explainable findings, and downloadable reports.

The core architecture is established. The next phase should emphasize **completion and usability of one end-to-end domestic-wine workflow**, rather than adding new beverage categories or reopening settled architecture.

### Current release focus

A seller should be able to:

1. State which package panels exist.
2. Upload the applicable artwork.
3. inspect and magnify each image.
4. Review and correct machine-read evidence.
5. Identify where required information appears.
6. Enter the required application facts.
7. Run deterministic checks.
8. Understand what passed, failed, needs review, or could not be evaluated.
9. Download a clear, traceable package for further human review.

---

## Work completed

### 1. Product and review boundaries

- Defined the product as a **prescreen and evidence-construction system**, not an approval engine.
- Separated:
  - artwork evidence;
  - OCR observations;
  - seller-declared facts;
  - deterministic findings;
  - internal human disposition;
  - actual TTB action, which remains out of scope.
- Preserved uncertainty through explicit states instead of forcing a false binary verdict.
- Documented the prototype, security, retention, compliance, and government-authority boundaries.

### 2. Seller package preparation

The browser-local package workflow currently supports:

- front and back labels;
- optional additional panels;
- reviewed-profile category checklist;
- seller-entered values, uncertainty, and absence states;
- multi-region, panel-relative evidence;
- save and reload;
- immutable package-analysis runs;
- correction and reanalysis;
- gated local agent-package generation.

See [`docs/issue-138-seller-package-preparation.md`](docs/issue-138-seller-package-preparation.md).

### 3. Artwork intake and preview

- PNG and JPEG validation.
- Declared type checked against decoded image format.
- Empty, oversized, corrupt, and out-of-bounds images rejected with typed errors.
- Immediate browser-local preview with filename, type, and size.
- Replace and clear behavior.
- Object URLs revoked when replaced or unmounted.
- Uploads processed in memory and not retained between requests.

### 4. OCR and evidence extraction

- Vendored Tesseract WebAssembly OCR running server-side.
- No mandatory cloud call at request time.
- Current extracted fields:
  - brand name;
  - alcohol statement.
- Typed machine-observation states:
  - `OBSERVED`;
  - `LOW_CONFIDENCE`;
  - `AMBIGUOUS`;
  - `NOT_OBSERVED`.
- Per-field geometry, reference frame, extractor identity, OCR version, parser identity, and derivative SHA-256.
- Versioned fixture corpus and bounded real-OCR regression coverage.

> The original vision includes seven target fields. **Only brand name and alcohol content are extracted today.**

### 5. Deterministic wine checks

Currently executed:

- `wine-alcohol-syntax`;
- `wine-alcohol-declared-comparison`;
- `brand-name-canonical-comparison`.

Registered but deliberately not run from artwork alone:

- `wine-alcohol-actual-content-tolerance`;
- `wine-alcohol-class-type-boundary`;
- `wine-alcohol-omission-eligibility`.

Finding states are:

- `PASS`;
- `WARN`;
- `FAIL`;
- `NEEDS_REVIEW`;
- `not_run`.

There is **no aggregate compliance score or overall pass/fail verdict**.

### 6. Results and reporting

- Concise summary first.
- Progressive disclosure for:
  - evidence;
  - regulatory checks;
  - technical provenance;
  - downloads;
  - internal disposition.
- Deterministic readable HTML report.
- Canonical JSON export with a SHA-256 integrity block.
- Append-only internal disposition history.
- Server-issued authorization token for bounded disposition append operations.
- Machine findings cannot be silently edited or deleted by a disposition.

### 7. Architecture and deployment

Implemented flow:

```text
Browser artwork + declared facts
  → image validation
  → local OCR extraction
  → typed observations + geometry + provenance
  → versioned deterministic wine rules
  → governed findings
  → checksum JSON + readable HTML report
  → append-only human disposition
```

Completed infrastructure includes:

- Next.js standalone production build;
- Node 22 runtime;
- Hostinger deployment at `ttb-test.com`;
- secondary Render deployment;
- deployment-relative OCR asset resolution;
- relocation smoke test using a real OCR request;
- HMAC signing for append authorization;
- runtime health reporting;
- deployed-commit provenance support.

Architecture details: [`docs/architecture.md`](docs/architecture.md) and [`docs/adr/`](docs/adr/).

### 8. Quality, accessibility, and testing

- Unit and component tests with Vitest and Testing Library.
- Architecture and boundary tests.
- Production build validation.
- Standalone relocation smoke test.
- Playwright end-to-end browser coverage.
- Labelled inputs and keyboard-operable disclosures.
- Accessible alert handling.
- Hardened browser download path.
- User-safe bounded errors without stack traces, absolute paths, or environment leakage.

---

## Recommended work to continue

The recommended order is based on completing one useful workflow before expanding scope.

### P1 — Finish the guided seller workflow

- Replace scattered actions with a **persistent control area** that keeps the path to completion visible.
- Keep package progress visible in a fixed footer or equivalent persistent status surface.
- Make **No back label** and **No additional panels** explicit package decisions.
- Keep the central workspace focused on the current task while navigation and submission controls remain stable.
- Move synthetic-label instructions into contextual guidance shown only when relevant.
- Establish one unmistakable completion and handoff state.

### P1 — Complete human verification of OCR

- Show the user exactly what the machine read.
- Show where each observation came from on the artwork.
- Allow correction before rules run or before the package is finalized.
- Preserve the original observation and the human correction as separate provenance-bearing records.
- Re-run analysis from corrected evidence without overwriting prior analysis runs.

### P1 — Strengthen label mapping and inspection

- Complete click-and-draw evidence-region mapping.
- Allow the seller to assign each region to the category it is intended to fulfill.
- Add a practical magnification suite for detailed artwork inspection.
- Make panel-relative coordinates stable across save, reload, correction, and reanalysis.
- Clearly distinguish detected regions, user-confirmed regions, and unresolved regions.

### P1 — Validate the first end-to-end definition of done

A first complete domestic-wine path should demonstrate that a seller can:

- configure the package;
- upload the artwork;
- verify the OCR;
- map required evidence;
- provide declared facts;
- run the registered checks;
- understand all result states;
- see source citations and limitations;
- create a coherent review package.

Do not treat additional beverage categories as release blockers for this path.

### P2 — Complete measured OCR evaluation

- Finish the full-corpus extraction measurement currently developed separately from `main`.
- Categorize failures before tuning.
- Repair the highest-frequency or highest-impact measured failures first.
- Pay particular attention to:
  - decorative or script brand names;
  - low contrast;
  - rotated side text;
  - split alcohol tokens;
  - difficult multi-panel layouts.
- Publish accuracy claims only after the harness and corpus are stable and merged.

### P2 — Expand bounded wine evidence slices

After the first workflow is complete, add fields one at a time with explicit contracts, fixtures, rules, and uncertainty behavior. Likely candidates include:

- net contents;
- government warning;
- class or type;
- bottler or producer information;
- country or state of origin where applicable.

Each new slice should preserve the same distinction between observed evidence, declared facts, deterministic evaluation, and facts that cannot be established from artwork alone.

### P2 — Operational hardening

- Cross-browser verification in Firefox and Safari.
- Secure authenticated seller and reviewer roles.
- Server-persisted packages and multi-device continuation.
- Configurable evidence retention and audit policy.
- Agent or reviewer queue.
- Rate limiting, monitoring, backup, and incident procedures.
- Formal deployment controls for any environment beyond a public demonstration.

### P3 — Deferred expansion

Defer until the domestic-wine workflow is complete and measured:

- beer and malt-beverage profiles;
- distilled-spirits profiles;
- batch or camera intake;
- cloud-vision fallback;
- generalized semantic comparison across all label fields;
- COLA or government-system integration;
- production authorization claims.

---

## Deliberately not implemented

- TTB approval or rejection.
- Overall compliance verdict.
- COLA integration.
- Government authentication, identity, or authorization.
- Production identity and access controls.
- Authenticated seller portal.
- Persistent production evidence store.
- Agent or government transmission.
- Beer, malt-beverage, or spirits scoring.
- Complete regulatory review or entitlement determination.
- Automatic policy creation or self-training.
- FedRAMP authorization, ATO, certification, or government endorsement.

Several of these have future-compatible seams or accepted architectural directions. They are not current behavior.

---

## Five-minute reviewer path

1. Open <https://ttb-test.com>.
2. Load the verified **M Cellars** sample, or upload a supported wine-label image.
3. Enter the application brand name and alcohol value.
4. Run the prescreen.
5. Read the concise summary.
6. Expand Evidence, Regulatory checks, and Technical provenance.
7. Download the JSON export and HTML report.
8. Optionally record an internal disposition and download the updated report.

---

## Known limitations and tradeoffs

- Local OCR supports privacy and reproducibility but misses difficult typography and layouts.
- Preserving uncertainty routes more cases to a human instead of auto-clearing them.
- Deterministic rules are explainable but only cover implemented evidence slices.
- Artwork alone cannot establish every regulatory fact.
- The public demo proves the review contract, not batch throughput or production security.
- The package workflow remains browser-local and is not yet a persisted multi-user system.
- Extraction accuracy is not yet a production-readiness claim.

---

## Running locally

### Prerequisites

- Node 22 (`.nvmrc` = `22`; package engines require `>=22 <23`).
- A glibc environment such as Debian, Ubuntu, or macOS for the native `sharp` binary.
- No network is required at request time; OCR language data and WASM assets are vendored.

### Install and run

```bash
npm install
npm run dev
npm run build
npm run start
```

### Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run smoke:relocation
npx playwright install
npm run test:e2e
```

Exact test counts are intentionally not hardcoded because the suite changes as the system grows.

---

## Environment variables

| Variable | Requirement | Purpose |
|---|---|---|
| `LABEL_LENS_APPEND_SIGNING_KEY` | Required in production | HMAC-signs append-authorization tokens. Use a secret of at least 32 characters and store it only in the deployment secret store. |
| `NODE_ENV` | Platform supplied | Selects production or development behavior. |
| `PORT` | Platform supplied | Server port; defaults to `3000` locally. |
| `LABEL_LENS_BUILD_COMMIT` | Required for auditable Hostinger exports | Stamps the deployed commit into runtime provenance. |
| `LABEL_LENS_OCR_ASSET_DIR` | Optional | Overrides OCR language-data location. |
| `LABEL_LENS_OCR_CORE_DIR` | Optional | Overrides OCR WASM-core location. |

A development-only process-local signing key is used when `LABEL_LENS_APPEND_SIGNING_KEY` is unset outside production. Production prechecks fail closed if the key is missing.

---

## Repository map

| Area | Location |
|---|---|
| Primary UI and workspace | [`src/features/precheck/`](src/features/precheck/), [`src/app/page.tsx`](src/app/page.tsx) |
| OCR and extraction | [`src/pipeline/extractor/`](src/pipeline/extractor/) |
| Analyzer and result contracts | [`src/pipeline/analyzer/`](src/pipeline/analyzer/), [`src/pipeline/result/`](src/pipeline/result/) |
| Wine rules | [`src/domain/rules/`](src/domain/rules/), [`src/domain/verification/`](src/domain/verification/) |
| Reports and exports | [`src/pipeline/export/`](src/pipeline/export/) |
| API routes | [`src/app/api/precheck/`](src/app/api/precheck/), [`src/app/api/health/`](src/app/api/health/) |
| Fixtures and evaluation | [`src/fixtures/`](src/fixtures/), [`tests/fixtures/precheck/`](tests/fixtures/precheck/) |
| End-to-end tests | [`tests/e2e/`](tests/e2e/) |
| Architecture and security | [`docs/architecture.md`](docs/architecture.md), [`docs/security-deployment-strategy.md`](docs/security-deployment-strategy.md), [`docs/adr/`](docs/adr/) |

Additional planning and governance documents:

- [`docs/product-plan.md`](docs/product-plan.md)
- [`docs/remaining-work-plan.md`](docs/remaining-work-plan.md)
- [`docs/validation-rules.md`](docs/validation-rules.md)
- [`docs/ocr-reliability-strategy.md`](docs/ocr-reliability-strategy.md)
- [`docs/test-strategy.md`](docs/test-strategy.md)
- [`docs/system-governance.md`](docs/system-governance.md)
- [`docs/submission-scope-and-definition-of-done.md`](docs/submission-scope-and-definition-of-done.md)
- [`docs/original-vision-and-scope.md`](docs/original-vision-and-scope.md)

---

## Security and privacy boundary

- OCR, rules, export generation, and signing run server-side.
- The browser does not call a model provider directly.
- Signing secrets do not enter the client bundle.
- Images are validated and processed in memory.
- Uploads are not retained or used for hidden training.
- Reports and errors are bounded to avoid leaking server paths or environment data.
- Exports contain a re-verifiable SHA-256 integrity value.
- The public demo is not a hardened production environment.

See [`docs/compliance-readiness-boundary.md`](docs/compliance-readiness-boundary.md).

---

## Governing principle

Label Lens should remain useful precisely because it does not hide uncertainty or confuse software assistance with government authority.

> *“Let all things be done decently and in order.” — 1 Corinthians 14:40*
