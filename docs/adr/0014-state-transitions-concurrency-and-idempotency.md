# ADR 0014: State Transitions, Concurrency, and Idempotency

- Status: Proposed
- Date: 2026-07-18

## Context

In a distributed, multi-user environment, we must protect the integrity of the submission workflow:
1. **Concurrency Races:** Multiple agents may attempt to claim the same pending review case simultaneously, or a seller might resubmit a package while an agent is actively reviewing it.
2. **Illegal State Transitions:** The submission must flow through a strict state machine (e.g., a case cannot transition to `internally_accepted` unless it is currently `in_agent_review` and has been claimed by the requesting agent).
3. **Network Failure & Retries:** Network drops can occur immediately after database transactions complete but before the client receives the HTTP response. When the client retries the request, the server must not duplicate entries or trigger side effects twice.

## Decision

We will implement strict state machine validation, optimistic concurrency control, and request idempotency:

1. **Explicit State Transition Guard:** All state changes are validated against a strict state machine schema. API endpoints will verify the current database status before permitting a state transition. Invalid transitions return `422 Unprocessable Entity`.
2. **Optimistic Concurrency Control (OCC):** Tables representing mutable resources (`submissions`, `claims`) will include an auto-incrementing `version` integer column. Updates will perform matching on both the primary key and the expected version:
   ```typescript
   const updated = await prisma.submission.updateMany({
     where: { submissionId, version: expectedVersion },
     data: { currentStatus: nextStatus, version: { increment: 1 } }
   });
   if (updated.count === 0) throw new ConcurrencyConflictError();
   ```
   A conflict results in a `409 Conflict` HTTP response, prompting the client to reload the latest state.
3. **API Idempotency Layer:** All mutative API endpoints (e.g., `/api/package/submit/finalize`, `/api/agent/review/claim/[id]`, `/api/agent/review/decision/[id]`) require the client to send a unique `X-Idempotency-Key` UUID header.
   - The server checks the `IdempotencyRecord` table. If the key exists, it returns the cached response payload immediately.
   - If the key is new, the server runs the request inside a database transaction, saves the key and response payload, and returns the result.
   - Idempotency records expire and are purged after 24 hours.

## Consequences

Positive:
- Complete elimination of duplicate submissions or double-claims.
- Safe client retries: network failures do not result in corrupted database states.
- Clean append-only audit trail: no duplicate events or transitions are logged.

Trade-offs:
- Clients must generate and persist idempotency keys (e.g. in local storage) across retries.
- Every mutative request incurs a database read to check the idempotency key, slightly increasing request latency.
