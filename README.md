# Label Lens

**An evidence-producing perception and review pipeline for beverage-label packages.**

Label Lens helps a seller prepare a label package, separates seller claims from machine observations, runs deterministic pre-checks, and preserves the resulting evidence for authenticated internal review.

> **Machine perception produces observations. Deterministic rules evaluate bounded evidence. Human reviewers make internal workflow decisions.**

Label Lens is **not** a TTB system, does not grant COLA approval, does not provide legal advice, and does not replace an official government determination.

---

## Why this project exists

Beverage-label review is not only an OCR problem.

A useful system must preserve the difference between:

- what the seller says;
- what artwork is actually present;
- what the machine observed;
- what the machine could not observe;
- what deterministic rules can evaluate;
- what still requires human judgment;
- what changed between revisions;
- who made each internal decision and when.

Label Lens treats those distinctions as first-class data rather than collapsing them into a single score or an unsupported “approved” result.

---

## Product model

Label Lens is organized around two connected systems.

### 1. The perception pipeline

```text
Artwork
  → decoded-image validation
  → stateless visual observation
  → OCR as a skeptical reviewer
  → typed evidence and geometry
  → semantic relationships
  → deterministic pre-check rules
  → provenance-bearing findings
```

The machine does not “know the answer” in advance. It proposes and verifies bounded observations, records uncertainty, and preserves the source geometry and extraction provenance.

Current machine-observation states include:

- `OBSERVED`
- `LOW_CONFIDENCE`
- `AMBIGUOUS`
- `NOT_OBSERVED`

Current deterministic result states include:

- `PASS`
- `WARN`
- `FAIL`
- `NEEDS_REVIEW`
- `not_run`

There is no aggregate compliance score and no overall government-approval verdict.

### 2. The seller-to-agent workflow

```text
Seller package preparation
  → saved current package
  → deterministic pre-check
  → immutable submitted revision
  → truthful submission receipt
  → authenticated internal queue
  → read-only evidence review
  → future append-only internal disposition
```

The product language is deliberately bounded:

- `Waiting for agent review`
- `In review`
- `Changes requested`
- `Internally accepted for next step`
- `Agent review complete`

Internal review is not TTB approval, COLA approval, legal acceptance, or regulatory acceptance.

---

## Current project status

Label Lens is an active prototype focused on one end-to-end domestic-wine workflow.

### Implemented

#### Seller package preparation

- Front, back, and optional panel decisions.
- Browser-local draft persistence.
- Image upload, replacement, and preview.
- Category-by-category guided preparation.
- Seller-confirmed values, uncertainty, and absence states.
- Panel-relative evidence regions.
- Machine observations maintained separately from seller evidence.
- Immutable local analysis runs.
- Reanalysis after seller changes.
- Durable server-side finalization for review-ready packages.
- Truthful submission receipt and owner-only status lookup.

#### Perception and deterministic checks

- Server-side Tesseract WebAssembly OCR.
- No mandatory cloud inference call at request time.
- Decoded image-type, size, dimension, and checksum validation.
- Geometry and reference-frame provenance.
- Brand-name and alcohol-statement extraction.
- Versioned deterministic domestic-wine rules.
- Explainable findings and canonical JSON export.

#### Authentication and internal receiving workflow

- Better Auth with database-backed, revocable sessions.
- Provisioned `seller`, `agent`, and `admin` roles.
- No public account registration.
- Server-side authorization inside sensitive routes.
- Role-directed landing pages.
- Authenticated agent queue.
- Read-only, integrity-verified submission detail views.
- Seller ownership isolation.
- Authorized panel streaming without exposing server filesystem paths.
- Secure logout and session invalidation.
- Idempotent environment-driven account bootstrap.
- Programmatic database migration and optional bootstrap during production startup.

#### Persistence and provenance

- Drizzle ORM.
- MySQL as the authoritative staging/production database.
- SQLite as a local and test convenience with explicit parity coverage.
- Immutable submission revisions.
- HMAC integrity signatures.
- Append-only status history.
- Scoped idempotency.
- Optimistic concurrency protections for submission finalization.
- Private server-side panel storage.

#### Quality and deployment

- Next.js 15 and Node 22.
- Hostinger branch-specific staging.
- Vitest unit and integration coverage.
- Dedicated real-MySQL CI lane.
- Playwright end-to-end coverage.
- Production build validation without requiring the native SQLite driver on the MySQL path.
- Build-commit provenance.

### In progress

- Harden browser-local draft restoration so IndexedDB failure can never block the workspace.
- Keep the public `Sign in` entry point visible while session state is pending or unavailable.
- Complete staging smoke testing of the provisioned seller, agent, and admin accounts.

### Not yet implemented

- Reviewer claim locking.
- Request-changes and internal-accept decision writes.
- Review rationale forms.
- Concurrent reviewer-decision protection.
- Seller resubmission UI.
- Resettable seeded demo queue in staging.
- Email notifications.
- Production invitation and password-recovery flows.
- S3/R2 object-storage migration.
- Beer, malt-beverage, or distilled-spirits profiles.
- Official TTB transmission or government-system integration.

---

## Architecture principles

### Evidence before conclusion

Every meaningful conclusion should be traceable to preserved evidence, a deterministic rule, or an identified human actor.

### Seller, machine, and reviewer records remain separate

A reviewer may add an internal record, but may not silently rewrite seller evidence or machine output.

### Submitted revisions are immutable

Later seller edits create a new revision or resubmission. They do not alter the package already under review.

### Authorization is enforced at the operation

Middleware may improve navigation, but every sensitive queue, submission, status, asset, or decision operation must authorize the active server-side session directly.

### Fail closed without pretending success

The system must not issue a receipt for an asset it did not durably persist, report a submission that was not committed, or show a successful decision after a stale or unauthorized write.

### Uncertainty is data

`NOT_OBSERVED`, low confidence, ambiguity, and “cannot be evaluated from artwork alone” are valid outcomes. They are not forced into false certainty.

---

## Repository map

| Area | Location |
|---|---|
| Seller package workspace | `src/features/package-preparation/` |
| One-image legacy prescreen | `src/features/precheck/` and `/review/legacy` |
| OCR and extraction | `src/pipeline/extractor/` |
| Deterministic rules | `src/rules/` |
| Auth configuration | `src/lib/auth.ts` |
| Server auth guards | `src/server/auth/guards.ts` |
| Agent queue and detail APIs | `src/app/api/agent/` |
| Submission finalization | `src/app/api/package/submit/finalize/` |
| Submission status | `src/app/api/package/submit/status/` |
| Database schema | `src/db/schema.ts` and `src/db/schema.sqlite.ts` |
| Migrations | `src/db/migrations/` |
| Production startup | `src/server/startup.ts`, `src/server/migrate.ts`, `scripts/start.ts` |
| Architecture decisions | `docs/adr/` |
| Browser tests | `tests/e2e/` |

---

## Running locally

### Requirements

- Node.js 22 (`>=22 <23`).
- npm.
- MySQL 8.x for authoritative integration testing.
- A modern browser for the package-preparation workspace.

### Install

```bash
npm ci
```

### Development

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### Production build

```bash
npm run build
npm start
```

`npm start` runs the production startup wrapper:

```text
apply committed migrations
  → optionally provision configured accounts
  → start Next.js
```

---

## Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm run docs:check
npm run docs:check:test
npm test
npm run build
npm run test:mysql
npm run test:e2e
```

The CI workflow separates:

1. lint, typecheck, standard tests, and build;
2. authoritative MySQL migration and integration tests;
3. Playwright end-to-end browser tests.

CI never connects to the Hostinger staging database.

---

## Environment variables

### Core production configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Authoritative MySQL connection string. |
| `BETTER_AUTH_SECRET` | Better Auth signing/encryption secret. |
| `BETTER_AUTH_URL` | Canonical application URL used by Better Auth. |
| `LABEL_LENS_INTEGRITY_SECRET` | Signs immutable submission integrity records. |
| `LABEL_LENS_APPEND_SIGNING_KEY` | Signs bounded append-authorization records. |
| `LABEL_LENS_BUILD_COMMIT` | Records the exact deployed Git commit. |
| `LABEL_LENS_STORAGE_DIR` | Private server-side storage root for submitted panel assets. |

Production secrets should be at least 32 characters and stored only in the deployment secret manager.

### Provisioned demonstration accounts

Public registration is disabled. Staging accounts can be provisioned from:

```text
LABEL_LENS_BOOTSTRAP_ADMIN_EMAIL
LABEL_LENS_BOOTSTRAP_ADMIN_PASSWORD
LABEL_LENS_BOOTSTRAP_AGENT_EMAIL
LABEL_LENS_BOOTSTRAP_AGENT_PASSWORD
LABEL_LENS_BOOTSTRAP_SELLER_EMAIL
LABEL_LENS_BOOTSTRAP_SELLER_PASSWORD
```

Enable provisioning during startup with:

```text
LABEL_LENS_BOOTSTRAP_ON_START=1
```

Existing passwords are preserved by default. A deliberate password reset requires:

```text
LABEL_LENS_BOOTSTRAP_RESET_PASSWORDS=1
```

Never commit demonstration passwords, print them in CI, place them in screenshots, or paste them into issue and pull-request comments.

---

## Deployment notes

The current branch-specific staging environment is used to prove the complete workflow before merge:

```text
seller login
  → package preparation
  → durable submission
  → agent login
  → queue visibility
  → read-only evidence inspection
  → seller status visibility
```

A staging deployment is not accepted from a successful build alone. It must also prove:

- database migration completed;
- provisioned accounts can authenticate;
- seller and agent authorization boundaries hold;
- private assets remain private;
- submitted revisions verify successfully;
- logout invalidates access;
- no official-approval language appears;
- local draft recovery cannot trap the user in a loading state.

---

## Security and truth boundaries

Label Lens must not imply any of the following:

- TTB approval;
- COLA approval;
- government approval;
- legal compliance approval;
- regulatory acceptance;
- FedRAMP authorization;
- production government endorsement.

The project is designed to support evidence preparation and internal review while preserving a clear boundary between machine assistance, organizational workflow, and official authority.

---

## Live environments

- Primary public demonstration: <https://ttb-test.com>
- Branch-specific Issue #143 staging: <https://pr143.ttb-test.com>
- Legacy one-image workflow: `/review/legacy`

Availability and features may differ between the primary demonstration and the active branch-specific staging build.

---

## Contributing

Keep changes narrow and evidence-driven.

Before opening or updating a pull request:

1. preserve the seller/machine/reviewer record boundaries;
2. add authorization checks inside sensitive server operations;
3. add or update deterministic tests;
4. prove MySQL behavior when persistence semantics matter;
5. preserve truthful internal-review language;
6. keep the pull request draft until branch-specific staging is validated.

See `docs/architecture.md`, `docs/adr/`, and the active GitHub issues for current implementation boundaries.

---

## License and use

This repository is a research and product-development prototype. Review the repository license and deployment policies before reuse in production or regulated environments.
