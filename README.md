# Label Lens TTB

Label Lens TTB is a **domestic-wine label prescreen and internal-review prototype**. It helps sellers assemble label evidence, runs bounded OCR and deterministic checks, and gives authenticated reviewers a traceable package without pretending to make a government decision.

> **OCR and AI may extract evidence. Deterministic rules evaluate that evidence. Human reviewers remain authoritative.**

**Label Lens does not approve or reject labels, is not a TTB system, and is not legal advice.**

## Live reviewer demo

- Primary deployment: **<https://ttb-test.com>**
- Sign in: **<https://ttb-test.com/login>**
- Legacy one-image review: <https://ttb-test.com/review/legacy>
- Secondary deployment: <https://label-lens-ttb.onrender.com>

### Demonstration accounts

| Role | Email | Landing page |
|---|---|---|
| Admin | `admin@ttb-test.com` | `/admin` |
| Agent/reviewer | `agent@ttb-test.com` | `/agent` |
| Seller | `seller@ttb-test.com` | `/seller` |

The three accounts use the shared reviewer-demo password [4TESTING1234]. These are public demonstration accounts. Do not upload confidential, proprietary, personal, or regulated information. Demo activity may be visible to other reviewers and may be reset without notice.

The public deployment is not a COLA integration, production authorization, government identity system, or hardened government environment.

---

## What is implemented

### Seller package preparation

- Front and back label panels, plus optional additional panels.
- Seller-entered facts, uncertainty, and absence states.
- Multi-region, panel-relative evidence mapping.
- Browser-local draft restoration.
- Immutable package-analysis runs.
- Authenticated package finalization.
- Persisted status receipts and immutable revision history.

### Authenticated review portal

- Better Auth with database-backed, revocable sessions.
- Authenticated `seller`, `agent`, and limited `admin` roles.
- No public signup; accounts are provisioned by the deployment operator.
- Server-side authorization inside sensitive handlers.
- MySQL-authoritative persistence with committed Drizzle migrations.
- Immutable submission revisions with server-recomputed integrity.
- Durable, idempotent package finalization.
- Authenticated agent queue and read-only submission detail.
- Authorized artwork-panel streaming without public object URLs.
- Role-aware navigation, logout, and unauthorized handling.

Reviewer claim locking and append-only request-changes/internal-accept decision writes are intentionally deferred to the next review slice.

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
- Append-only internal disposition history in the one-image path.

---

## Five-minute reviewer paths

### Agent/reviewer

1. Open <https://ttb-test.com/login>.
2. Sign in as `agent@ttb-test.com` using the shared reviewer-demo password.
3. Open the agent queue.
4. Select a submission and inspect its immutable revision, declared facts, checks, and authorized artwork panels.
5. Confirm that the interface uses internal-review language and makes no government-approval claim.

### Seller

1. Open <https://ttb-test.com/login>.
2. Sign in as `seller@ttb-test.com` using the shared reviewer-demo password.
3. Prepare or inspect a package.
4. Finalize it and verify that the resulting status is persisted.
5. Confirm that direct access to `/agent` is denied.

### One-image prescreen

1. Open <https://ttb-test.com>.
2. Load the verified **M Cellars** sample, or upload a supported wine-label image.
3. Enter the application brand name and alcohol value.
4. Run the prescreen.
5. Expand Evidence, Regulatory checks, and Technical provenance.
6. Download the JSON export and HTML report.

---

## Architecture

```text
Browser artwork + declared facts
  → image validation
  → local OCR extraction
  → typed observations + geometry + provenance
  → versioned deterministic wine rules
  → governed findings
  → immutable package revision + integrity record
  → authenticated internal review queue
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

Architecture details are in [`docs/architecture.md`](docs/architecture.md) and [`docs/adr/`](docs/adr/).

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
- Agent or government transmission.
- Beer, malt-beverage, or distilled-spirits scoring.
- FedRAMP authorization, ATO, certification, or government endorsement.

---

## Governing principle

Label Lens should remain useful precisely because it does not hide uncertainty or confuse software assistance with government authority.

> *“Let all things be done decently and in order.” — 1 Corinthians 14:40*
