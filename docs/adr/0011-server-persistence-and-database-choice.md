# ADR 0011: Server Persistence and Database Choice

- Status: Proposed
- Date: 2026-07-18

## Context

We need a database mapping layer (ORM/query builder) and schema migration tool to support server-side persistence. The database layer must support complex relational queries (for the queue and status pages), handle transaction boundaries (for submissions and claims), and enforce concurrency locking.

The target production database is **Hostinger-managed MySQL**. For local development and CI testing, we want to maintain the option to use **SQLite** to ensure fast, zero-config startup and test execution. 

Prisma was initially considered, but Prisma compile-time schemas require a single, hardcoded `provider` (e.g. `provider = "sqlite"` or `provider = "mysql"`). It is not possible to dynamically switch the datasource provider at runtime without maintaining duplicate schema files, duplicate migrations, and separate generated clients. This would introduce significant risk of schema drift and deployment fragility.

We need a database client that:
1. Allows declaring a single, unified database schema in TypeScript.
2. Supports dynamic runtime driver swapping (SQLite via `better-sqlite3` in development/testing, and MySQL via `mysql2` in staging/production) using the same schema.
3. Provides robust schema migration generation.
4. Guarantees that MySQL-specific transactions, locking, and constraints are fully verified during testing.

## Decision

We will use **Drizzle ORM** as the primary database client and migration tool, combined with a strict MySQL test-verification requirement:

1. **ORM Selection:** Drizzle ORM is selected because:
   - It defines schemas in pure TypeScript (`schema.ts`), allowing the same schema definition to be mapped to either a SQLite or MySQL connection at runtime.
   - It supports generating migrations (`drizzle-kit generate`) for both dialects from the same code structure.
   - It provides lightweight, high-performance query execution and native SQL transaction boundaries (`db.transaction(...)`).
2. **Dynamic Driver Instantiation:** At runtime, the database client imports the appropriate driver based on `DATABASE_URL`:
   - If `sqlite:` protocol, instantiates `drizzle-orm/better-sqlite3`.
   - If `mysql:` protocol, instantiates `drizzle-orm/mysql2`.
3. **Database Verification Parity:**
   - Local unit and integration tests (in Vitest) will run against SQLite by default for developer speed.
   - **Crucial Guardrail:** The authoritative state-machine, transaction, and concurrency tests (OCC) must run against a real local **MySQL** instance (via Docker or native service) using a separate test environment configuration (`.env.test.mysql`). Pre-push and CI pipeline checks will block merges if MySQL test execution fails.

## Consequences

Positive:
- A single source of truth for the database schema in TypeScript prevents schema drift.
- Dynamic runtime driver swapping completely solves Prisma's fixed datasource provider limitation.
- Strict MySQL test verification ensures transaction isolation levels, constraints, and locking behave correctly in the production dialect.

Trade-offs:
- SQLite and MySQL handles certain features (like ENUMs or JSON fields) differently. Drizzle ORM provides separate DSL helper functions for different dialects (e.g. `mysqlEnum` vs `text`). To maintain cross-dialect portability, we will declare table column types using portable primitive types (e.g., standard text columns validated in application code using Zod) rather than dialect-specific schema types.
