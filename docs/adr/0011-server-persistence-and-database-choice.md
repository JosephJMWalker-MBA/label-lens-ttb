# ADR 0011: Server Persistence and Database Choice

- Status: Accepted
- Date: 2026-07-18

## Context

To support the transition from a purely client-side local draft workflow to an agent queue, we require a server-side relational database. The database must store submissions, multi-panel metadata, immutable category snapshots, machine analysis records, agent decisions, and audit events.

The system must run reliably on Hostinger Web Apps. Hostinger provides shared/managed MySQL instances as part of their web hosting plans. Local development and continuous integration (CI) tests require a quick-start, low-overhead database option to avoid requiring all developers and CI runners to spin up full MySQL servers.

Concurrently, we must handle race conditions in the agent portal (e.g., two agents trying to claim the same submission at the same time, or an agent reviewing an outdated revision).

## Decision

We will use a relational database with dialect abstraction to support different database engines in different environments:

1. **Production & Staging:** Deployed on **Hostinger-managed MySQL**.
2. **Local Development & Testing:** Run on **SQLite** to allow zero-config local startup and rapid test runs.
3. **Database Client:** Use a query builder or ORM (such as Prisma or Kysely) that translates queries cleanly to both MySQL and SQLite dialects, avoiding vendor-specific SQL scripts.
4. **Optimistic Concurrency Control (OCC):** The `submissions` and `claims` tables will include a `version` integer column. Updates to status or claims must include the expected version in the `WHERE` clause and increment it on update:
   ```sql
   UPDATE submissions SET current_status = ?, version = version + 1 WHERE submission_id = ? AND version = ?
   ```
   If zero rows are updated, a concurrency conflict is thrown, preventing double-actions.

## Consequences

Positive:
- No additional database hosting costs in production.
- Extremely simple developer onboarding; developers can run `npm run dev` with SQLite instantly.
- Safe, concurrent execution of agent portal operations protected by OCC.
- Strongly typed relational boundaries for complex joins (e.g. queue filters).

Trade-offs:
- Minor dialect differences (e.g., date formats, JSON column handling, auto-increment differences) must be handled by the ORM/client library.
- SQLite is single-write, which is fine for local workloads but must not be used in production.
- SQLite lacks full ENUM support, so application-level string constraints must enforce domain values.
