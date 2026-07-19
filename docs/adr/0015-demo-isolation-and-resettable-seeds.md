# ADR 0015: Demo Isolation and Resettable Seeds

- Status: Proposed
- Date: 2026-07-18

## Context

For testing, UI reviews, and staging demonstrations, we need seeded demo submissions in the agent review portal. These demo records must show realistic data, including front and back panels, seller evidence coordinates, and machine analysis runs.

However, demo records must never pollute real seller submission queues or affect production analytics. Furthermore, testing teams need the ability to reset these demo cases back to a clean, known initial state at any time (e.g., to undo an agent's claim or decision) without impacting active, real seller submissions.

## Decision

We will isolate demo data and provide a secure, transactional re-seeding mechanism:

1. **Database Flagting:** The `submissions` table includes an `is_demo` boolean column. All associated tables (revisions, panels, decisions, events) inherit this context or link to the parent submission.
2. **Queue Query Isolation:** The agent queue retrieval API (`GET /api/agent/queue`) filters out records with `is_demo = true` by default. It will only include them if the caller explicitly appends the query parameter `?includeDemos=true`. The agent queue UI will visually highlight demo records using distinctive badges and warning banners to prevent confusion.
3. **Resettable API Endpoint:** We will expose an endpoint `/api/agent/demo/reset` (restricted to Administrator role). When triggered, it:
   - Starts a database transaction.
   - Deletes all records where `is_demo = true`.
   - Re-reads static seed fixtures (JSON files representing standard test labels like M Cellars and approved-wine-035).
   - Inserts fresh demo records, resetting their state, timestamps, and versions to the baseline config.
4. **Cascading Deletes:** The schema defines foreign key constraints with `ON DELETE CASCADE` from all child tables (revisions, panels, snapshots, decisions, events) to `submissions`. This ensures that deleting a parent demo submission deletes all its historical child records atomically, preventing orphaned data.
5. **Production Safety Guards:** The demo reset endpoint is disabled and returns `404 Not Found` if `NODE_ENV = production` is active, unless explicitly bypassed by setting `LABEL_LENS_ENABLE_DEMO_SEEDING = true` in the production environment variables.

## Consequences

Positive:
- Showcases and tests can run in staging and development without cluttering or polluting real queues.
- Administrators can reset the system to a clean state instantly during demonstration sessions.
- Foreign-key cascades guarantee that no database clutter or orphaned rows remain after a reset.

Trade-offs:
- Changing the schema or canonical JSON structure requires updating the static seed JSON fixtures to prevent validation errors during re-seeding.
