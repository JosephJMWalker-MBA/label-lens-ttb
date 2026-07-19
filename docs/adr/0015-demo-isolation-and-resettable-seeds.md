# ADR 0015: Demo Isolation and Resettable Seeds

- Status: Proposed
- Date: 2026-07-18

## Context

For testing, UI reviews, and staging demonstrations, we need seeded demo submissions in the agent review portal. These demo records must show realistic data, including front and back panels, seller evidence coordinates, and machine analysis runs.

However, demo records must never pollute real seller submission queues or affect production analytics. Testing teams need the ability to reset these demo cases back to a clean, known initial state at any time (e.g., to undo an agent's claim or decision) without impacting active, real seller submissions. 

If the reset code or database queries are improperly written, there is a risk that a cascading delete or bulk reset command could delete or corrupt production data. We must construct a hardened barrier between demo management and production seller records.

Furthermore, we must prevent any possibility of running the demo reset logic in production. Even an environment variable bypass introduces the risk of human error or misconfiguration.

## Decision

We will isolate demo data, implement a secure, isolated local/staging re-seeding mechanism, and compile out/disallow it in production:

1. **Database Flagting & Prefix Isolation:**
   - The `submissions` table includes an `is_demo` boolean column.
   - Demo user accounts are assigned fixed, hardcoded UUIDs starting with a specific namespace prefix (e.g., `00000000-demo-0000-0000-000000000000`). This prevents namespace collisions with dynamically generated seller or agent UUIDs.
2. **Explicit Deletion (No Global Cascades):**
   - The reset transaction must never run a global cascade delete that could inadvertently reach production tables. 
   - Instead of relying on general cascade deletes that could be triggered by deleting a user, the deletion query is strictly scoped and targeted:
     ```sql
     -- Explicitly query demo submission IDs first
     SELECT id FROM submissions WHERE is_demo = true;
     
     -- Delete from child tables only for the matched demo IDs
     DELETE FROM submitted_panels WHERE revision_id IN (SELECT id FROM submission_revisions WHERE submission_id IN (demo_ids));
     DELETE FROM seller_evidence_snapshots WHERE revision_id IN (SELECT id FROM submission_revisions WHERE submission_id IN (demo_ids));
     DELETE FROM machine_analysis_snapshots WHERE revision_id IN (SELECT id FROM submission_revisions WHERE submission_id IN (demo_ids));
     DELETE FROM agent_decisions WHERE submission_id IN (demo_ids);
     DELETE FROM submission_status_events WHERE submission_id IN (demo_ids);
     DELETE FROM submission_revisions WHERE submission_id IN (demo_ids);
     
     -- Finally, delete the parent demo submissions
     DELETE FROM submissions WHERE id IN (demo_ids) AND is_demo = true;
     ```
   - This ensures that even if a cascade constraint is modified, the deletion queries are hard-coded to require specific ID matching and the `is_demo = true` condition.
3. **Queue Query Isolation:** The agent queue retrieval API (`GET /api/agent/queue`) filters out records with `is_demo = true` by default. It will only include them if the caller explicitly appends the query parameter `?includeDemos=true`. The agent queue UI will visually highlight demo records using distinctive badges and warning banners to prevent confusion.
4. **Absolute Production Disabling:** The demo reset endpoint `/api/agent/demo/reset` and associated database seed scripts will be hard-coded to throw an exception and return `404 Not Found` if `NODE_ENV === "production"` is set. **No environment variable overrides or bypasses are permitted.** The execution path is completely blocked in production code.

## Consequences

Positive:
- Showcases and tests can run in staging and development without cluttering or polluting real queues.
- Administrators can reset the system to a clean state instantly during demonstration sessions.
- Explicit, ID-scoped deletion queries completely eliminate the risk of cascading deletes wiping production data.
- Hard production block completely safeguards production databases from accidental seeds or resets, with zero risk of human misconfiguration.

Trade-offs:
- Changing the schema or canonical JSON structure requires updating the static seed JSON fixtures to prevent validation errors during re-seeding.
