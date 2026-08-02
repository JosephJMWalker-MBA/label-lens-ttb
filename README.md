# Label Lens TTB

Label Lens TTB is a **domestic-wine label prescreen, authenticated internal-review prototype, and governed OCR research environment**.

It addresses two different questions that regulatory software must not collapse into one:

1. **What evidence did the machine extract?**
2. **Is the evidence chain strong enough for an institution to rely on that output?**

> **Machine extraction may propose evidence. Deterministic rules evaluate that evidence. Human reviewers remain authoritative. Experimental results count only when the evidence chain is independently verifiable.**

Label Lens does not approve or reject labels, is not a TTB system, and is not legal advice.

## Why this project matters

The central risk in regulatory AI is not only that OCR may be wrong. It is that a plausible machine output may be treated as trustworthy without sufficient provenance, isolation, reproducibility, or failure classification.

Label Lens makes those distinctions structural:

- OCR observations retain geometry, confidence, pass provenance, and technical context.
- Regulatory checks are versioned and deterministic rather than delegated to a generative model.
- Submitted evidence is preserved in immutable revisions.
- Reviewer claims and decisions are append-only records.
- Research acquisition is separated from governed truth and post-freeze evaluation.
- An OCR process exiting successfully does not count as a scientific observation unless its evidence can be independently verified.

The project therefore demonstrates more than label extraction. It explores **when machine-produced regulatory evidence deserves institutional trust**.

## What this repository demonstrates

| Capability | Demonstration |
|---|---|
| Operational application | Sellers assemble label evidence and submit immutable package revisions for authenticated internal review. |
| Deterministic decision support | OCR extracts bounded observations; versioned rules evaluate them; the interface produces no aggregate approval verdict. |
| Evidence governance | Integrity records, provenance, authorization boundaries, append-only decisions, and explicit uncertainty remain inspectable. |
| OCR research infrastructure | A fixed-corpus, truth-isolated, reproducible acquisition path is being built for repeated Brand OCR experiments. |
| Fail-closed research behavior | Invalidated runs remain recorded but contribute nothing to metrics, comparisons, or conclusions. |

## Current research status — Issue #149 / PR #219

The research branch is a **draft, unmerged, disarmed experiment** for acquiring complete current-baseline Brand OCR and candidate evidence over a fixed 115-image corpus.

| State | Current value |
|---|---|
| Research target | Complete, untruncated Brand OCR passes, reconstructed lines, candidates, rankings, selections, and provenance |
| Corpus | 115 fixed images: 105 Brand-present and 10 Brand-absent |
| Production behavior | Unchanged |
| Workflow mode | `discover` |
| Execute authorization | `EXECUTE_NOT_AUTHORIZED` |
| Governed execute attempts | 3 |
| Valid scientific observations | 0 |
| Brand metrics produced | No |
| Current implementation state | Attempt 3’s execute-preflight and incomplete-forensic-staging defects are repaired; another execute requires a new exact-SHA review and explicit authorization |

### What the three attempts established

| Attempt | What happened | Scientific treatment |
|---|---|---|
| 1 | Governed OCR returned exit status `0`, but the host verifier could not traverse the container-owned evidence tree and no artifact survived workspace destruction. | Infrastructure-invalidated. No observation exists. |
| 2 | Forensic preservation and downstream infrastructure worked, but the OCR runtime closure failed: all 230 item attempts returned typed runtime failures rather than OCR evidence. | Runtime failure. No Brand result exists. |
| 3 | The isolated execute preflight halted before the first acquisition call because two required OCR runtime path variables were outside the exact environment allowlist. A separate incomplete-forensic staging assumption also failed. | Acquisition-runner failure. Zero acquisition, extractor, item-writer, or run-writer calls. |

In all three cases, the system refused to turn incomplete or invalid evidence into a result. That behavior is a core outcome of the work:

> **Successful computation is not the same as a valid experimental observation.**

The attempt records are preserved here:

- [`attempt-1-incident.json`](artifacts/issue-149-brand-complete-evidence-acquisition/attempt-1-incident.json)
- [`governed-attempt-2-runtime-failure.json`](artifacts/issue-149-brand-complete-evidence-acquisition/governed-attempt-2-runtime-failure.json)
- [`governed-attempt-3-acquisition-runner-failure.json`](artifacts/issue-149-brand-complete-evidence-acquisition/governed-attempt-3-acquisition-runner-failure.json)

The authoritative controls remain visible:

- [`workflow-mode.txt`](artifacts/issue-149-brand-complete-evidence-acquisition/workflow-mode.txt)
- [`execute-authorization.json`](artifacts/issue-149-brand-complete-evidence-acquisition/execute-authorization.json)
- [`workflow-plan.md`](artifacts/issue-149-brand-complete-evidence-acquisition/workflow-plan.md)
- [`limitations.md`](artifacts/issue-149-brand-complete-evidence-acquisition/limitations.md)

### Why the research path exists

Earlier Brand studies committed truncated projections of the evidence produced by the incumbent pipeline. That prevented later zero-OCR analysis from fully re-deriving raw recognition, inspecting every candidate, replaying candidate construction, and measuring both upside and exposure.

The Issue #149 path bypasses the truncated evaluation projection without modifying production behavior. It is designed to acquire the incumbent pipeline’s complete evidence under explicit controls:

```text
Frozen corpus and configuration
  → trusted staging with opaque item identities
  → truth-free preparation artifact
  → isolated acquisition with no checkout, truth, credentials, or network
  → authenticated sealed evidence packages
  → host-side integrity and completeness verification
  → identity-leak verification
  → post-freeze truth mapping and evaluation
```

Acquisition and evaluation are deliberately separated. The OCR runner receives opaque item IDs and staged image bytes, not historical case IDs, governed Brand truth, acceptable values, prior classifications, or the post-freeze identity map.

Detailed contracts and preregistration history are under [`artifacts/issue-149-brand-complete-evidence-acquisition/`](artifacts/issue-149-brand-complete-evidence-acquisition/).

---

## Five-minute evaluation guide

### 1. Understand the governing idea

Read the opening sections above and confirm the separation between:

- machine extraction;
- deterministic evaluation;
- human authority;
- experimental evidence validity.

### 2. Test the operational reviewer workflow

1. Open <https://ttb-test.com/login>.
2. Sign in as `agent@ttb-test.com` using the shared reviewer-demo password below.
3. Open the agent queue and select a submitted package.
4. Inspect the immutable revision, seller-declared facts, machine observations, deterministic findings, and authorized artwork panels.
5. Claim the package so the active reviewer identity is recorded durably.
6. Choose **Request changes** or **Internally accept** and record the internal rationale.
7. Verify that the decision is appended without changing the submitted revision.
8. Confirm that the interface makes no government-approval claim.

### 3. Inspect the research boundary

1. Read [`purpose-and-boundaries.md`](artifacts/issue-149-brand-complete-evidence-acquisition/purpose-and-boundaries.md).
2. Inspect the fixed population in [`population-freeze.json`](artifacts/issue-149-brand-complete-evidence-acquisition/population-freeze.json).
3. Review the isolation contract in [`acquisition-runtime-isolation-contract.json`](artifacts/issue-149-brand-complete-evidence-acquisition/acquisition-runtime-isolation-contract.json).
4. Review the evidence definition in [`evidence-schema.json`](artifacts/issue-149-brand-complete-evidence-acquisition/evidence-schema.json).
5. Inspect the three failed-attempt records and verify that none is eligible for scientific conclusions.
6. Confirm that the branch is disarmed through the two control files linked above.

### 4. Review the implementation boundaries

- Product architecture: [`docs/architecture.md`](docs/architecture.md)
- Architecture decisions: [`docs/adr/`](docs/adr/)
- Compliance boundary: [`docs/compliance-readiness-boundary.md`](docs/compliance-readiness-boundary.md)
- Research workflow: [`.github/workflows/issue-149-brand-evidence-acquisition.yml`](.github/workflows/issue-149-brand-evidence-acquisition.yml)
- Acquisition runner: [`scripts/eval/issue-149-brand-evidence-acquisition-run.ts`](scripts/eval/issue-149-brand-evidence-acquisition-run.ts)
- Raw evidence verifier: [`scripts/eval/issue-149-verify-raw-evidence.ts`](scripts/eval/issue-149-verify-raw-evidence.ts)

---

## Live reviewer demo

- Primary deployment: **<https://ttb-test.com>**
- Sign in: **<https://ttb-test.com/login>**
- Legacy one-image prescreen: <https://ttb-test.com/review/legacy>
- Secondary deployment: <https://label-lens-ttb.onrender.com>

### Demonstration accounts

| Role | Email | Landing page |
|---|---|---|
| Admin | `admin@ttb-test.com` | `/admin` |
| Agent/reviewer | `agent@ttb-test.com` | `/agent` |
| Seller | `seller@ttb-test.com` | `/seller` |

The three accounts use the shared reviewer-demo password `4TESTING1234`.

These are public demonstration accounts. Do not upload confidential, proprietary, personal, or regulated information. Demo activity may be visible to other reviewers and may be reset without notice.

The public deployment is not a COLA integration, production authorization, government identity system, or hardened government environment.

---

## What is implemented

### Seller package preparation

- Front and back label panels, plus optional additional panels.
- Seller-entered facts, uncertainty, and absence states.
- Multi-region, panel-relative evidence mapping.
- Multiple browser-local package drafts with restoration.
- Explicit new-package flow without overwriting an existing draft.
- Immutable package-analysis runs.
- Authenticated package finalization.
- Persisted status receipts and immutable revision history.
- Requested-change continuity that seeds a corrected seller revision without rewriting the prior submission.
- Resubmission of the current corrected draft as a new immutable revision.

### Authenticated review portal

- Better Auth with database-backed, revocable sessions.
- Authenticated `seller`, `agent`, and limited `admin` roles.
- No public signup; accounts are provisioned by the deployment operator.
- Server-side authorization inside sensitive handlers.
- MySQL-authoritative persistence with committed Drizzle migrations.
- Immutable submission revisions with server-recomputed integrity.
- Durable, idempotent package finalization.
- Authenticated agent queue and submission detail.
- Durable reviewer claim locking.
- Append-only internal decisions for request changes and internal acceptance.
- Seller-visible decision guidance and preserved review history.
- Authorized artwork-panel streaming without public object URLs.
- Role-aware navigation, logout, and unauthorized handling.

### OCR and deterministic checks

Current machine-extracted fields:

- brand name;
- alcohol statement.

Current deterministic checks:

- `wine-alcohol-syntax`;
- `wine-alcohol-declared-comparison`;
- `brand-name-canonical-comparison`.

Finding states include `PASS`, `WARN`, `FAIL`, `NEEDS_REVIEW`, and `not_run`. There is no aggregate compliance score or overall approval verdict.

### Reporting and provenance

- Concise result summary with progressive disclosure.
- Evidence, checks, technical provenance, and downloads.
- Canonical JSON export and readable HTML report.
- SHA-256 integrity blocks.
- HMAC-signed immutable revision metadata.
- Append-only reviewer claims, internal decisions, status events, and revision history in the package workflow.
- Append-only internal disposition history in the legacy one-image path.

---

## Additional reviewer paths

### Seller

1. Open <https://ttb-test.com/login>.
2. Sign in as `seller@ttb-test.com`.
3. Open **Prepare a package**, create or restore a browser-local draft, and add the required panel artwork and seller evidence.
4. Run the package analysis and submit the current draft for internal review.
5. Verify that the submitted revision and status receipt are persisted and that direct access to `/agent` is denied.
6. After a reviewer requests changes, reopen the package and verify that Label Lens creates a corrected draft while preserving the prior immutable revision and decision history.
7. Save the corrected evidence and resubmit it as a new revision.

### Legacy one-image prescreen

1. Open <https://ttb-test.com/review/legacy>.
2. Load the verified **M Cellars** sample, or upload a supported wine-label image.
3. Enter the application brand name and alcohol value.
4. Run the prescreen.
5. Expand Evidence, Regulatory checks, and Technical provenance.
6. Download the JSON export and HTML report.

---

## Product architecture

```text
Browser artwork + declared facts
  → image validation
  → bounded OCR extraction
  → typed observations + geometry + provenance
  → versioned deterministic wine rules
  → governed findings
  → immutable package revision + integrity record
  → authenticated internal review queue
  → durable reviewer claim
  → append-only request-changes or internal-accept decision
  → corrected seller draft and immutable resubmission when required
```

Production infrastructure includes:

- Next.js 15 standalone build;
- Node 22 runtime;
- Hostinger deployment at `ttb-test.com`;
- MySQL-authoritative persistence;
- startup-applied Drizzle migrations;
- database-backed Better Auth sessions;
- standalone migration-artifact verification;
- MySQL production-graph verification with `better-sqlite3` absent;
- runtime health and deployed-commit provenance.

---

## Running locally

### Prerequisites

- Node 22 (`>=22 <23`).
- A glibc environment such as Debian, Ubuntu, or macOS for native image tooling.
- MySQL for the authoritative integration and production path.

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
npm run test:mysql
npm run build
npm run verify:mysql-graph
npm run verify:standalone-migrations
npx playwright install
npm run test:e2e
```

---

## Production environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL connection string. |
| `BETTER_AUTH_SECRET` | Protects authentication and session operations. Keep stable across redeployments. |
| `BETTER_AUTH_URL` | Canonical deployment origin, such as `https://ttb-test.com`. |
| `LABEL_LENS_DB_DIALECT` | Explicitly selects the MySQL production graph. |
| `LABEL_LENS_INTEGRITY_SECRET` | Signs immutable package-revision metadata. |
| `LABEL_LENS_APPEND_SIGNING_KEY` | Signs append-authorization tokens; required for production prechecks. |
| `LABEL_LENS_STORAGE_DIR` | Private server path for persisted artwork panels. |
| `LABEL_LENS_BUILD_COMMIT` | Records deployed-commit provenance. |
| `LABEL_LENS_BOOTSTRAP_ON_START` | Temporary account-provisioning control; disable after bootstrap. |
| `LABEL_LENS_BOOTSTRAP_*_EMAIL` | Admin, agent, and seller emails used during provisioning. |
| `LABEL_LENS_BOOTSTRAP_*_PASSWORD` | Initial account passwords used during provisioning. Never commit private credentials. |

Production prechecks fail closed when `LABEL_LENS_APPEND_SIGNING_KEY` is missing. `/api/health` reports whether it is configured without exposing its value.

---

## Security and privacy boundary

- OCR, deterministic rules, signing, authentication, and authorization run server-side.
- Sensitive routes perform server-side authorization checks.
- Authentication and signing secrets do not enter the browser bundle.
- Sessions are database-backed and revocable.
- Package revisions are immutable and integrity-signed.
- Reviewer claims and internal decisions are append-only records rather than edits to submitted evidence.
- Errors are bounded to avoid leaking paths, credentials, or environment values.
- Shared demo credentials are unsuitable for sensitive information.
- The public demo is not a hardened production environment.

See [`docs/compliance-readiness-boundary.md`](docs/compliance-readiness-boundary.md).

---

## Deliberately out of scope

- TTB approval or rejection.
- Overall compliance verdict.
- COLA or government-system integration.
- Government authentication or authorization.
- Transmission to TTB or another government system.
- Beer, malt-beverage, or distilled-spirits scoring.
- FedRAMP authorization, ATO, certification, or government endorsement.
- Treating any failed Issue #149 acquisition attempt as experimental evidence.

---

## Governing principle

Label Lens should remain useful precisely because it does not hide uncertainty or confuse software assistance with government authority.

> *“Let all things be done decently and in order.” — 1 Corinthians 14:40*
