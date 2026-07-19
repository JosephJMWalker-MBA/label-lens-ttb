# ADR 0011: Server Persistence and Database Choice

- Status: Proposed
- Date: 2026-07-18

## Context

We need a database mapping layer (ORM/query builder) and schema migration tool to support server-side persistence. The database layer must support complex relational queries (for the queue and status pages), handle transaction boundaries (for submissions and claims), and enforce concurrency locking.

The target production database is **Hostinger-managed MySQL**. For local development and CI testing, we want to maintain the option to use **SQLite** to ensure fast, zero-config startup and test execution. However, using two different database engines introduces the risk of dialect drift (e.g., SQLite lacks native ENUMs, handle JSON columns differently, and has different locking semantics).

We need to choose a specific database library and establish how we will prove correct MySQL behavior during local development and testing.

## Decision

We will use **Prisma** as the primary ORM and schema management tool, with a dual-database verification strategy:

1. **ORM Selection:** Prisma is selected because:
   - It provides standard schema migrations (`prisma migrate`) that translate to both MySQL and SQLite.
   - It generates a strongly typed query client matching our domain model.
   - It natively supports transactional operations (`prisma.$transaction`) necessary for atomic submissions.
2. **Local Parity & Testing Strategy:** 
   - Local unit and integration tests (in Vitest) will run against an in-memory or file-backed **SQLite** database by default for speed.
   - Before any staging deployment or PR merge, developers must run the test suite against a local **MySQL** instance (run via Docker or native service) using a separate test environment file (`.env.test.mysql`). This validates MySQL-specific transaction, constraint, and lock behaviors.
3. **Optimistic Concurrency Control:** Enforced at the Prisma schema level using an auto-incrementing `version` integer field on the `Submission` and `Claim` models. Every update operation must verify and increment the version to prevent overlapping claims or stale updates.

## Consequences

Positive:
- Strongly typed database access layer prevents SQL injection and syntax errors.
- SQLite support keeps local test suites extremely fast (under 10 seconds).
- MySQL test verification ensures dialect drift or transaction isolation level discrepancies are caught locally before deploying to Hostinger.

Trade-offs:
- Prisma schemas are mostly database-agnostic, but some features (like ENUMs or JSON filters) require custom handling or workarounds on SQLite. We will enforce enums as strings with application-level Zod validations to keep schema definitions fully compatible with both SQLite and MySQL.
