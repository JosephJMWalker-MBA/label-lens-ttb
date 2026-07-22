// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- integration test drives loosely-typed dual-dialect Drizzle handles and forged requests */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

const TEST_DB_FILE = ".local/test-agent-portal.db";
const RUN_MYSQL_TESTS = process.env.RUN_MYSQL_TESTS === "1";

vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET ||= "super-secret-test-better-auth-key-1234567890";
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
  process.env.LABEL_LENS_INTEGRITY_SECRET ||= "test-only-integrity-secret-at-least-32-chars";
  if (process.env.RUN_MYSQL_TESTS !== "1") {
    process.env.DATABASE_URL = "file:.local/test-agent-portal.db";
  }
});

import { createTestSqliteDb } from "../../../../tests/integration/test-db-setup";
import { signRevision } from "@/lib/integrity";
import { panelStorageKey, persistPanelAsset } from "@/lib/panel-storage";

const MYSQL_DATABASE_URL = process.env.DATABASE_URL;
if (RUN_MYSQL_TESTS && (!MYSQL_DATABASE_URL || !/^mysql2?:\/\//.test(MYSQL_DATABASE_URL))) {
  throw new Error("RUN_MYSQL_TESTS=1 requires a mysql:// DATABASE_URL");
}

const PANEL_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

type RouteHandler = (request: Request, ctx?: any) => Promise<Response>;

const DIALECTS = RUN_MYSQL_TESTS ? (["mysql"] as const) : (["sqlite"] as const);

for (const dialect of DIALECTS) {
  describe(`Agent portal authorization (${dialect})`, () => {
    let db: any;
    let schema: any;
    let isSQLite: boolean;
    let auth: any;
    let queueGET: RouteHandler;
    let detailGET: RouteHandler;
    let panelGET: RouteHandler;
    let claimPOST: RouteHandler;
    let releasePOST: RouteHandler;
    let requestChangesPOST: RouteHandler;
    let internalAcceptPOST: RouteHandler;
    let sellerStatusGET: RouteHandler;

    async function loadModules() {
      vi.resetModules();
      if (dialect === "sqlite") {
        const sqlite = createTestSqliteDb(TEST_DB_FILE, true);
        sqlite.close();
        process.env.DATABASE_URL = `file:${TEST_DB_FILE}`;
      } else {
        process.env.DATABASE_URL = MYSQL_DATABASE_URL as string;
      }
      const clientMod = await import("@/db/client");
      clientMod.initializeDatabase(process.env.DATABASE_URL as string);
      db = clientMod.db;
      schema = clientMod.schema;
      isSQLite = clientMod.isSQLite;
      auth = (await import("@/lib/auth")).auth;
      queueGET = (await import("./submissions/route")).GET as RouteHandler;
      detailGET = (await import("./submissions/[id]/route")).GET as RouteHandler;
      panelGET = (await import("./submissions/[id]/panels/[panelId]/route")).GET as RouteHandler;
      claimPOST = (await import("./submissions/[id]/claim/route")).POST as RouteHandler;
      releasePOST = (await import("./submissions/[id]/release/route")).POST as RouteHandler;
      requestChangesPOST = (await import("./submissions/[id]/request-changes/route"))
        .POST as RouteHandler;
      internalAcceptPOST = (await import("./submissions/[id]/internal-accept/route"))
        .POST as RouteHandler;
      sellerStatusGET = (await import("../package/submit/status/[id]/route")).GET as RouteHandler;
    }

    const TRIGGER_NAMES = [
      "prevent_submissions_update",
      "prevent_submissions_delete",
      "prevent_revisions_update",
      "prevent_revisions_delete",
      "prevent_reviewer_claims_closed_update",
      "prevent_reviewer_claims_identity_update",
      "prevent_reviewer_claims_delete",
      "prevent_agent_decisions_update",
      "prevent_agent_decisions_delete",
      "prevent_submission_revision_responses_update",
      "prevent_submission_revision_responses_delete",
      "force_version_race_after_agent_decision_insert",
      "force_agent_decision_unique_race",
    ];

    async function dropTriggers() {
      for (const name of TRIGGER_NAMES) {
        if (isSQLite) db.run(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
        else await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
      }
    }

    async function createTriggers() {
      if (isSQLite) {
        db.run(sql`
          CREATE TRIGGER prevent_submissions_update BEFORE UPDATE ON submissions
          BEGIN
            SELECT CASE
              WHEN OLD.creator_id != NEW.creator_id OR OLD.id != NEW.id
                OR OLD.is_demo != NEW.is_demo OR OLD.created_at != NEW.created_at
              THEN RAISE(FAIL, 'Immutable fields on submissions cannot be updated.')
            END;
          END;`);
        db.run(sql`CREATE TRIGGER prevent_submissions_delete BEFORE DELETE ON submissions
          BEGIN SELECT RAISE(FAIL, 'Submissions cannot be deleted.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_revisions_update BEFORE UPDATE ON submission_revisions
          BEGIN SELECT RAISE(FAIL, 'Submission revisions are immutable.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_revisions_delete BEFORE DELETE ON submission_revisions
          BEGIN SELECT RAISE(FAIL, 'Submission revisions are immutable.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_reviewer_claims_closed_update BEFORE UPDATE ON reviewer_claims
          WHEN OLD.state != 'active'
          BEGIN SELECT RAISE(FAIL, 'Closed reviewer claim rows are immutable.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_reviewer_claims_identity_update BEFORE UPDATE ON reviewer_claims
          WHEN OLD.id != NEW.id
            OR OLD.submission_id != NEW.submission_id
            OR OLD.revision_id != NEW.revision_id
            OR OLD.revision_number != NEW.revision_number
            OR OLD.reviewer_id != NEW.reviewer_id
            OR OLD.reviewer_role != NEW.reviewer_role
            OR OLD.claimed_submission_version != NEW.claimed_submission_version
            OR OLD.claimed_at != NEW.claimed_at
            OR OLD.created_at != NEW.created_at
            OR (NEW.state = 'active' AND (
              OLD.active_submission_id IS NOT NEW.active_submission_id
              OR OLD.released_at IS NOT NEW.released_at
              OR OLD.released_by IS NOT NEW.released_by
              OR OLD.released_by_role IS NOT NEW.released_by_role
              OR OLD.release_reason IS NOT NEW.release_reason
              OR OLD.decided_at IS NOT NEW.decided_at
            ))
          BEGIN SELECT RAISE(FAIL, 'Reviewer claim identity fields cannot be updated.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_reviewer_claims_delete BEFORE DELETE ON reviewer_claims
          BEGIN SELECT RAISE(FAIL, 'Reviewer claim rows cannot be deleted.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_agent_decisions_update BEFORE UPDATE ON agent_decisions
          BEGIN SELECT RAISE(FAIL, 'Agent decisions are immutable.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_agent_decisions_delete BEFORE DELETE ON agent_decisions
          BEGIN SELECT RAISE(FAIL, 'Agent decisions are immutable.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_submission_revision_responses_update
          BEFORE UPDATE ON submission_revision_responses
          BEGIN SELECT RAISE(FAIL, 'Submission revision response rows are immutable and cannot be updated.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_submission_revision_responses_delete
          BEFORE DELETE ON submission_revision_responses
          BEGIN SELECT RAISE(FAIL, 'Submission revision response rows are immutable and cannot be deleted.'); END;`);
      } else {
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_submissions_update BEFORE UPDATE ON submissions FOR EACH ROW
          BEGIN
            IF OLD.creator_id <> NEW.creator_id OR OLD.id <> NEW.id
              OR OLD.is_demo <> NEW.is_demo OR OLD.created_at <> NEW.created_at THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable fields on submissions cannot be updated.';
            END IF;
          END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_submissions_delete BEFORE DELETE ON submissions FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submissions cannot be deleted.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_revisions_update BEFORE UPDATE ON submission_revisions FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revisions are immutable.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_revisions_delete BEFORE DELETE ON submission_revisions FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revisions are immutable.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_reviewer_claims_closed_update BEFORE UPDATE ON reviewer_claims FOR EACH ROW
          BEGIN
            IF OLD.state <> 'active' THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Closed reviewer claim rows are immutable.';
            END IF;
          END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_reviewer_claims_identity_update BEFORE UPDATE ON reviewer_claims FOR EACH ROW
          BEGIN
            IF NOT (OLD.id <=> NEW.id)
                OR NOT (OLD.submission_id <=> NEW.submission_id)
                OR NOT (OLD.revision_id <=> NEW.revision_id)
                OR NOT (OLD.revision_number <=> NEW.revision_number)
                OR NOT (OLD.reviewer_id <=> NEW.reviewer_id)
                OR NOT (OLD.reviewer_role <=> NEW.reviewer_role)
                OR NOT (OLD.claimed_submission_version <=> NEW.claimed_submission_version)
                OR NOT (OLD.claimed_at <=> NEW.claimed_at)
                OR NOT (OLD.created_at <=> NEW.created_at) THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer claim identity fields cannot be updated.';
            END IF;
            IF NEW.state = 'active' AND (
                NOT (OLD.active_submission_id <=> NEW.active_submission_id)
                OR NOT (OLD.released_at <=> NEW.released_at)
                OR NOT (OLD.released_by <=> NEW.released_by)
                OR NOT (OLD.released_by_role <=> NEW.released_by_role)
                OR NOT (OLD.release_reason <=> NEW.release_reason)
                OR NOT (OLD.decided_at <=> NEW.decided_at)
            ) THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Active reviewer claims cannot be edited.';
            END IF;
          END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_reviewer_claims_delete BEFORE DELETE ON reviewer_claims FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer claim rows cannot be deleted.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_agent_decisions_update BEFORE UPDATE ON agent_decisions FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Agent decisions are immutable.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_agent_decisions_delete BEFORE DELETE ON agent_decisions FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Agent decisions are immutable.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_submission_revision_responses_update BEFORE UPDATE ON submission_revision_responses FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revision response rows are immutable and cannot be updated.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_submission_revision_responses_delete BEFORE DELETE ON submission_revision_responses FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revision response rows are immutable and cannot be deleted.'; END`),
        );
      }
    }

    async function clearTables() {
      await dropTriggers();
      for (const table of [
        schema.idempotencyRecords,
        schema.submissionRevisionResponses,
        schema.agentDecisions,
        schema.reviewerClaims,
        schema.machineAnalysisSnapshots,
        schema.sellerEvidenceSnapshots,
        schema.submittedPanels,
        schema.submissionStatusEvents,
        schema.submissionRevisions,
        schema.submissions,
        schema.sessions,
        schema.accounts,
        schema.verifications,
        schema.users,
      ]) {
        await db.delete(table);
      }
      await createTriggers();
    }

    async function provision(email: string, role: "seller" | "agent" | "admin") {
      await auth.api.signUpEmail({ body: { email, password: "SecurePassword123!", name: email } });
      if (role !== "seller") {
        if (isSQLite) db.run(sql`UPDATE users SET role = ${role} WHERE email = ${email}`);
        else await db.execute(sql`UPDATE users SET role = ${role} WHERE email = ${email}`);
      }
      const login = await auth.api.signInEmail({
        body: { email, password: "SecurePassword123!" },
        asResponse: true,
      });
      const cookie = login.headers.get("set-cookie") || "";
      const data = (await login.json()) as { user: { id: string } };
      return { cookie, userId: data.user.id };
    }

    async function seedSubmission(
      creatorId: string,
      opts: {
        id?: string;
        status?: string;
        isDemo?: boolean;
        createdAt?: Date;
        writeAsset?: boolean;
      } = {},
    ) {
      const id = opts.id ?? `pkg-${randomUUID().slice(0, 8)}`;
      const status = opts.status ?? "waiting_for_agent_review";
      const createdAt = opts.createdAt ?? new Date();
      const revisionId = randomUUID();
      const panelId = `panel-${id}`;
      const checksum = "a".repeat(64);
      const storageKey = panelStorageKey(id, panelId, checksum);
      const canonicalJson = JSON.stringify({ submissionId: id, revision: 1 });
      const signature = signRevision(canonicalJson);

      await db.insert(schema.submissions).values({
        id,
        creatorId,
        currentStatus: status,
        isDemo: opts.isDemo ?? false,
        version: 1,
        createdAt,
        updatedAt: createdAt,
      });
      await db.insert(schema.submissionRevisions).values({
        id: revisionId,
        submissionId: id,
        revisionNumber: 1,
        profileId: "wine-label-requirements",
        profileVersion: "1.0.0",
        submittedBy: "seller@test.com",
        submittedAt: createdAt,
        canonicalJson,
        integritySignature: signature,
      });
      await db.insert(schema.submittedPanels).values({
        id: panelId,
        revisionId,
        role: "front",
        displayName: "front.png",
        mediaType: "image/png",
        byteSize: PANEL_BYTES.length,
        checksumSha256: checksum,
        width: 1,
        height: 1,
        rotation: 0,
        storageKey,
      });
      await db.insert(schema.sellerEvidenceSnapshots).values({
        id: randomUUID(),
        revisionId,
        categoryId: "brandName",
        decision: "provided",
        expectedValue: "Test Brand",
        regions: JSON.stringify([]),
      });
      await db.insert(schema.machineAnalysisSnapshots).values({
        id: randomUUID(),
        revisionId,
        analysisRunId: "run-1",
        sequence: 1,
        panelRuns: JSON.stringify([{ panelId, machineResultId: "m1", observations: {} }]),
        categories: JSON.stringify([]),
        readiness: "ready_for_agent_submission",
        recordedAt: createdAt,
      });
      await db.insert(schema.submissionStatusEvents).values({
        id: randomUUID(),
        submissionId: id,
        status,
        actorId: creatorId,
        actorRole: "seller",
        reasonComment: "seeded",
        recordedAt: createdAt,
      });
      if (opts.writeAsset ?? true) {
        persistPanelAsset(storageKey, PANEL_BYTES);
      }
      return { id, panelId, revisionId };
    }

    function req(url: string, cookie = "", extraHeaders: Record<string, string> = {}) {
      return new Request(`http://localhost:3000${url}`, {
        headers: { Cookie: cookie, ...extraHeaders },
      });
    }

    function jsonReq(
      url: string,
      cookie: string,
      idempotencyKey: string,
      body: Record<string, unknown>,
      extraHeaders: Record<string, string> = {},
    ) {
      return new Request(`http://localhost:3000${url}`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      });
    }

    function params(id: string) {
      return { params: Promise.resolve({ id }) };
    }

    async function expectStatementFailure(statement: any) {
      if (isSQLite) {
        expect(() => db.run(statement)).toThrow();
      } else {
        await expect(db.execute(statement)).rejects.toThrow();
      }
    }

    async function createForcedDecisionCasRaceTrigger() {
      if (isSQLite) {
        db.run(
          sql.raw(`
          CREATE TRIGGER force_version_race_after_agent_decision_insert
          AFTER INSERT ON agent_decisions
          BEGIN
            UPDATE submissions SET version = version + 1 WHERE id = NEW.submission_id;
          END;
        `),
        );
      } else {
        await db.execute(
          sql.raw(`
          CREATE TRIGGER force_version_race_after_agent_decision_insert
          AFTER INSERT ON agent_decisions FOR EACH ROW
          BEGIN
            UPDATE submissions SET version = version + 1 WHERE id = NEW.submission_id;
          END`),
        );
      }
    }

    async function createForcedAgentDecisionUniqueRaceTrigger() {
      if (!isSQLite) return;
      db.run(
        sql.raw(`
        CREATE TRIGGER force_agent_decision_unique_race
        BEFORE INSERT ON agent_decisions
        BEGIN
          INSERT INTO agent_decisions (
            id,
            submission_id,
            revision_id,
            revision_number,
            claim_id,
            reviewer_id,
            reviewer_role,
            decision_type,
            prior_status,
            resulting_status,
            rationale,
            submission_version_before,
            submission_version_after,
            idempotency_record_key,
            recorded_at
          )
          VALUES (
            '11111111-1111-4111-8111-111111111111',
            NEW.submission_id,
            NEW.revision_id,
            NEW.revision_number,
            NEW.claim_id,
            NEW.reviewer_id,
            NEW.reviewer_role,
            NEW.decision_type,
            NEW.prior_status,
            NEW.resulting_status,
            NEW.rationale,
            NEW.submission_version_before,
            NEW.submission_version_after,
            NEW.idempotency_record_key,
            NEW.recorded_at
          );
        END;
      `),
      );
    }

    async function readSubmission(id: string) {
      return db.query.submissions.findFirst({
        where: (s: any, { eq: e }: any) => e(s.id, id),
      });
    }

    async function readSubmissionEvents(id: string) {
      return db
        .select()
        .from(schema.submissionStatusEvents)
        .where(eq(schema.submissionStatusEvents.submissionId, id));
    }

    function expectOnlyReviewClaimEvents(events: Array<{ status: string }>) {
      const statuses = events.map((event) => event.status);
      expect(events).toHaveLength(2);
      expect(statuses.filter((status) => status === "waiting_for_agent_review")).toHaveLength(1);
      expect(statuses.filter((status) => status === "in_agent_review")).toHaveLength(1);
      expect(statuses).not.toContain("changes_requested");
      expect(statuses).not.toContain("internally_accepted");
    }

    async function assertIdempotencyRecordCount(key: string, expected: number) {
      const rows = await db
        .select()
        .from(schema.idempotencyRecords)
        .where(eq(schema.idempotencyRecords.key, key));
      expect(rows).toHaveLength(expected);
    }

    function expectSellerPayloadBoundary(body: unknown, rationale?: string) {
      const payload = body as Record<string, any>;
      expect(Object.keys(payload).sort()).toEqual([
        "createdAt",
        "currentStatus",
        "events",
        "feedback",
        "revisions",
        "submissionId",
        "submissionVersion",
        "updatedAt",
      ]);
      for (const revision of payload.revisions) {
        expect(Object.keys(revision).sort()).toEqual([
          "id",
          "profileId",
          "profileVersion",
          "revisionNumber",
          "submittedAt",
          "submittedBy",
        ]);
      }
      expect(Object.keys(payload.feedback).sort()).toEqual(["changesRequested"]);
      if (payload.feedback.changesRequested) {
        expect(Object.keys(payload.feedback.changesRequested).sort()).toEqual([
          "rationale",
          "recordedAt",
          "revisionNumber",
        ]);
        if (rationale) {
          expect(payload.feedback.changesRequested.rationale).toBe(rationale);
        }
      }
      for (const event of payload.events) {
        expect(Object.keys(event).sort()).toEqual(["recordedAt", "status"]);
      }

      const raw = JSON.stringify(body);
      expect(raw).not.toMatch(
        /integritySignature|canonicalJson|canonical_json|storageKey|storage_key|filesystem|\.local\/storage|signature|reviewerId|reviewer_id|reviewerRole|claimId|activeClaim|activeSubmissionId|releasedBy|releaseReason|internal_accept|internally accepted/i,
      );
    }

    beforeAll(loadModules);
    beforeEach(clearTables);

    describe("queue API authorization", () => {
      it("rejects anonymous access with 401", async () => {
        expect((await queueGET(req("/api/agent/submissions"))).status).toBe(401);
      });

      it("rejects sellers with 403 (and ignores a forged role header/body)", async () => {
        const seller = await provision("seller@test.com", "seller");
        const res = await queueGET(
          req("/api/agent/submissions", seller.cookie, {
            "x-role": "agent",
            "x-user-role": "admin",
          }),
        );
        expect(res.status).toBe(403);
      });

      it("allows an agent and returns a controlled view model with no secrets", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        await seedSubmission(seller.userId, { status: "waiting_for_agent_review" });

        const res = await queueGET(req("/api/agent/submissions", agent.cookie));
        expect(res.status).toBe(200);
        const body = await res.json();
        const raw = JSON.stringify(body);
        expect(body.items.length).toBe(1);
        expect(body.items[0].submitter.displayName).toBeTruthy();
        expect(body.filter).toBe("waiting");
        // No secrets/paths/canonical leakage.
        expect(raw).not.toMatch(
          /storageKey|storage_key|canonicalJson|canonical_json|integritySignature|\.local\/storage/,
        );
      });

      it("separates demo from real and sorts oldest-first with a stable tie-breaker", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const older = new Date(Date.now() - 60_000);
        const newer = new Date(Date.now() - 10_000);
        await seedSubmission(seller.userId, { id: "pkg-real-new", createdAt: newer });
        await seedSubmission(seller.userId, { id: "pkg-real-old", createdAt: older });
        await seedSubmission(seller.userId, { id: "pkg-demo", isDemo: true });

        const waiting = await (
          await queueGET(req("/api/agent/submissions?filter=waiting", agent.cookie))
        ).json();
        expect(waiting.items.map((i: any) => i.submissionId)).toEqual([
          "pkg-real-old",
          "pkg-real-new",
        ]);
        expect(waiting.items.every((i: any) => i.isDemo === false)).toBe(true);

        const demo = await (
          await queueGET(req("/api/agent/submissions?filter=demo", agent.cookie))
        ).json();
        expect(demo.items.map((i: any) => i.submissionId)).toEqual(["pkg-demo"]);
      });

      it("falls back to the waiting filter for unknown/injection-like filter values", async () => {
        const agent = await provision("agent@test.com", "agent");
        const res = await queueGET(
          req(
            `/api/agent/submissions?filter=${encodeURIComponent("waiting'; DROP TABLE submissions;--")}`,
            agent.cookie,
          ),
        );
        const body = await res.json();
        expect(body.filter).toBe("waiting");
      });
    });

    describe("detail API authorization", () => {
      it("enforces agent-only access and safe not-found behavior", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);

        expect(
          (
            await detailGET(req(`/api/agent/submissions/${id}`), {
              params: Promise.resolve({ id }),
            })
          ).status,
        ).toBe(401);
        expect(
          (
            await detailGET(req(`/api/agent/submissions/${id}`, seller.cookie), {
              params: Promise.resolve({ id }),
            })
          ).status,
        ).toBe(403);

        const ok = await detailGET(req(`/api/agent/submissions/${id}`, agent.cookie), {
          params: Promise.resolve({ id }),
        });
        expect(ok.status).toBe(200);
        const view = await ok.json();
        expect(view.revision.integrityVerified).toBe(true);
        expect(view.sellerEvidence).toBeDefined();
        expect(view.machineAnalysis).toBeDefined();
        expect(JSON.stringify(view)).not.toMatch(/storageKey|canonical_json|\.local\/storage/);

        // Malformed and missing ids both return 404.
        expect(
          (
            await detailGET(req(`/api/agent/submissions/bad%20id`, agent.cookie), {
              params: Promise.resolve({ id: "bad id" }),
            })
          ).status,
        ).toBe(404);
        expect(
          (
            await detailGET(req(`/api/agent/submissions/pkg-missing`, agent.cookie), {
              params: Promise.resolve({ id: "pkg-missing" }),
            })
          ).status,
        ).toBe(404);
      });

      it("fails closed with a controlled 409 when the stored revision integrity does not verify", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);

        // Tamper the canonical json bypassing the immutability trigger.
        if (isSQLite) {
          db.run(sql`DROP TRIGGER IF EXISTS prevent_revisions_update`);
          db.run(
            sql`UPDATE submission_revisions SET canonical_json = '{"tampered":true}' WHERE submission_id = ${id}`,
          );
        } else {
          await db.execute(sql`DROP TRIGGER IF EXISTS prevent_revisions_update`);
          await db.execute(
            sql`UPDATE submission_revisions SET canonical_json = '{"tampered":true}' WHERE submission_id = ${id}`,
          );
        }
        const res = await detailGET(req(`/api/agent/submissions/${id}`, agent.cookie), {
          params: Promise.resolve({ id }),
        });
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({
          error: { code: "REVISION_INTEGRITY_FAILED" },
        });
      });
    });

    describe("agent decision mutations", () => {
      it("rejects anonymous and seller claim attempts", async () => {
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);
        const body = { expectedSubmissionVersion: 1 };

        expect(
          (
            await claimPOST(jsonReq(`/api/agent/submissions/${id}/claim`, "", "k-anon", body), {
              params: Promise.resolve({ id }),
            })
          ).status,
        ).toBe(401);
        expect(
          (
            await claimPOST(
              jsonReq(`/api/agent/submissions/${id}/claim`, seller.cookie, "k-seller", body),
              {
                params: Promise.resolve({ id }),
              },
            )
          ).status,
        ).toBe(403);
      });

      it("claims a waiting submission atomically and replays an identical idempotent retry", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id, revisionId } = await seedSubmission(seller.userId);
        const body = { expectedSubmissionVersion: 1 };

        const first = await claimPOST(
          jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-claim", body),
          params(id),
        );
        expect(first.status).toBe(200);
        const firstPayload = await first.json();
        expect(firstPayload).toMatchObject({
          action: "claim",
          submissionId: id,
          currentStatus: "in_agent_review",
          submissionVersion: 2,
          claim: { revisionId, revisionNumber: 1, state: "active" },
        });

        const second = await claimPOST(
          jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-claim", body),
          params(id),
        );
        expect(second.status).toBe(200);
        expect(second.headers.get("x-idempotent-replay")).toBe("true");
        expect(await second.json()).toEqual(firstPayload);

        const claims = await db.select().from(schema.reviewerClaims);
        expect(claims).toHaveLength(1);
        const sub = await db.query.submissions.findFirst({
          where: (s: any, { eq: e }: any) => e(s.id, id),
        });
        expect(sub?.currentStatus).toBe("in_agent_review");
        expect(sub?.version).toBe(2);
      });

      it("rejects same idempotency key reuse with a different canonical request hash", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);

        expect(
          (
            await claimPOST(
              jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-conflict", {
                expectedSubmissionVersion: 1,
              }),
              params(id),
            )
          ).status,
        ).toBe(200);

        const conflict = await claimPOST(
          jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-conflict", {
            expectedSubmissionVersion: 2,
          }),
          params(id),
        );
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toMatchObject({
          error: { code: "IDEMPOTENCY_CONFLICT" },
        });
      });

      it("rolls back all writes when optimistic version CAS fails", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);

        const response = await claimPOST(
          jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-stale-version", {
            expectedSubmissionVersion: 999,
          }),
          params(id),
        );
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
        expect(await db.select().from(schema.reviewerClaims)).toHaveLength(0);
        expect(await db.select().from(schema.agentDecisions)).toHaveLength(0);
        expect(
          await db
            .select()
            .from(schema.idempotencyRecords)
            .where(
              eq(
                schema.idempotencyRecords.key,
                `agent-review:claim:${agent.userId}:k-stale-version`,
              ),
            ),
        ).toHaveLength(0);
        const events = await db
          .select()
          .from(schema.submissionStatusEvents)
          .where(eq(schema.submissionStatusEvents.submissionId, id));
        expect(events.map((event: any) => event.status)).toEqual(["waiting_for_agent_review"]);
      });

      it("returns a controlled 409 and records nothing when latest revision integrity fails", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);

        if (isSQLite) {
          db.run(sql`DROP TRIGGER IF EXISTS prevent_revisions_update`);
          db.run(
            sql`UPDATE submission_revisions SET canonical_json = '{"tampered":true}' WHERE submission_id = ${id}`,
          );
        } else {
          await db.execute(sql`DROP TRIGGER IF EXISTS prevent_revisions_update`);
          await db.execute(
            sql`UPDATE submission_revisions SET canonical_json = '{"tampered":true}' WHERE submission_id = ${id}`,
          );
        }

        const response = await claimPOST(
          jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-integrity", {
            expectedSubmissionVersion: 1,
          }),
          params(id),
        );
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          error: { code: "REVISION_INTEGRITY_FAILED" },
        });
        expect(await db.select().from(schema.reviewerClaims)).toHaveLength(0);
      });

      it("requests changes with exact revision identity and exposes only bounded seller feedback", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id, revisionId } = await seedSubmission(seller.userId);

        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-claim-for-changes", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();

        const rationale = "Please clarify the brand-name evidence on the front panel.";
        const decisionBody = {
          expectedSubmissionVersion: 2,
          claimId: claim.claim.id,
          reviewedRevisionId: revisionId,
          reviewedRevisionNumber: 1,
          rationale,
        };
        const decision = await requestChangesPOST(
          jsonReq(
            `/api/agent/submissions/${id}/request-changes`,
            agent.cookie,
            "k-changes",
            decisionBody,
          ),
          params(id),
        );
        expect(decision.status).toBe(200);
        const decisionPayload = await decision.json();
        expect(decisionPayload).toMatchObject({
          action: "request_changes",
          currentStatus: "changes_requested",
          submissionVersion: 3,
          decision: {
            type: "changes_requested",
            reviewedRevisionId: revisionId,
            reviewedRevisionNumber: 1,
          },
        });

        const claims = await db.select().from(schema.reviewerClaims);
        expect(claims).toHaveLength(1);
        expect(claims[0].state).toBe("decided");
        expect(claims[0].activeSubmissionId).toBeNull();

        const decisions = await db.select().from(schema.agentDecisions);
        expect(decisions).toHaveLength(1);
        expect(decisions[0].rationale).toBe(rationale);
        expect(decisions[0].priorStatus).toBe("in_agent_review");
        expect(decisions[0].resultingStatus).toBe("changes_requested");
        expect(decisions[0].idempotencyRecordKey).toBe(
          `agent-review:request_changes:${agent.userId}:k-changes`,
        );

        const immutableBeforeReplay = {
          id: decisions[0].id,
          revisionId: decisions[0].revisionId,
          claimId: decisions[0].claimId,
          decisionType: decisions[0].decisionType,
          priorStatus: decisions[0].priorStatus,
          resultingStatus: decisions[0].resultingStatus,
          idempotencyRecordKey: decisions[0].idempotencyRecordKey,
          rationale: decisions[0].rationale,
        };
        const replay = await requestChangesPOST(
          jsonReq(
            `/api/agent/submissions/${id}/request-changes`,
            agent.cookie,
            "k-changes",
            decisionBody,
          ),
          params(id),
        );
        expect(replay.status).toBe(200);
        expect(replay.headers.get("x-idempotent-replay")).toBe("true");
        expect(await replay.json()).toEqual(decisionPayload);
        const decisionsAfterReplay = await db.select().from(schema.agentDecisions);
        expect(decisionsAfterReplay).toHaveLength(1);
        expect({
          id: decisionsAfterReplay[0].id,
          revisionId: decisionsAfterReplay[0].revisionId,
          claimId: decisionsAfterReplay[0].claimId,
          decisionType: decisionsAfterReplay[0].decisionType,
          priorStatus: decisionsAfterReplay[0].priorStatus,
          resultingStatus: decisionsAfterReplay[0].resultingStatus,
          idempotencyRecordKey: decisionsAfterReplay[0].idempotencyRecordKey,
          rationale: decisionsAfterReplay[0].rationale,
        }).toEqual(immutableBeforeReplay);

        const agentDetail = await detailGET(req(`/api/agent/submissions/${id}`, agent.cookie), {
          params: Promise.resolve({ id }),
        });
        expect(agentDetail.status).toBe(200);
        const agentDetailBody = await agentDetail.json();
        expect(agentDetailBody.latestDecision).toMatchObject({
          decisionType: "changes_requested",
          revisionId,
          revisionNumber: 1,
          rationale,
        });

        const sellerStatus = await sellerStatusGET(
          req(`/api/package/submit/status/${id}`, seller.cookie),
          params(id),
        );
        expect(sellerStatus.status).toBe(200);
        const sellerBody = await sellerStatus.json();
        expect(sellerBody.feedback.changesRequested.rationale).toBe(rationale);
        expectSellerPayloadBoundary(sellerBody, rationale);
        expect(sellerBody.events[0].reasonComment).toBeUndefined();

        const otherSeller = await provision("other-seller@test.com", "seller");
        const otherSellerStatus = await sellerStatusGET(
          req(`/api/package/submit/status/${id}`, otherSeller.cookie),
          params(id),
        );
        expect(otherSellerStatus.status).toBe(404);
        const otherSellerBody = await otherSellerStatus.json();
        expect(JSON.stringify(otherSellerBody)).not.toContain(rationale);
        expect(JSON.stringify(otherSellerBody)).not.toContain(id);
      });

      it("requires internal-accept rationale and keeps it out of seller status", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id, revisionId } = await seedSubmission(seller.userId);

        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-claim-accept", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();

        const missing = await internalAcceptPOST(
          jsonReq(
            `/api/agent/submissions/${id}/internal-accept`,
            agent.cookie,
            "k-accept-missing",
            {
              expectedSubmissionVersion: 2,
              claimId: claim.claim.id,
              reviewedRevisionId: revisionId,
              reviewedRevisionNumber: 1,
              rationale: "",
            },
          ),
          params(id),
        );
        expect(missing.status).toBe(400);

        const rationale = "Internal record: package is ready for the next internal step.";
        const accepted = await internalAcceptPOST(
          jsonReq(`/api/agent/submissions/${id}/internal-accept`, agent.cookie, "k-accept", {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            reviewedRevisionId: revisionId,
            reviewedRevisionNumber: 1,
            rationale,
          }),
          params(id),
        );
        expect(accepted.status).toBe(200);
        const decisions = await db.select().from(schema.agentDecisions);
        expect(decisions).toHaveLength(1);
        expect(decisions[0].decisionType).toBe("internally_accepted");
        expect(decisions[0].priorStatus).toBe("in_agent_review");
        expect(decisions[0].resultingStatus).toBe("internally_accepted");
        expect(decisions[0].idempotencyRecordKey).toBe(
          `agent-review:internal_accept:${agent.userId}:k-accept`,
        );
        expect(decisions[0].rationale).toBe(rationale);

        const agentDetail = await detailGET(req(`/api/agent/submissions/${id}`, agent.cookie), {
          params: Promise.resolve({ id }),
        });
        expect(agentDetail.status).toBe(200);
        const agentDetailBody = await agentDetail.json();
        expect(agentDetailBody.latestDecision).toMatchObject({
          decisionType: "internally_accepted",
          revisionId,
          revisionNumber: 1,
          rationale,
        });

        const sellerStatus = await sellerStatusGET(
          req(`/api/package/submit/status/${id}`, seller.cookie),
          params(id),
        );
        const sellerBody = await sellerStatus.json();
        expect(sellerBody.currentStatus).toBe("internally_accepted");
        expectSellerPayloadBoundary(sellerBody);
        expect(JSON.stringify(sellerBody)).not.toContain(rationale);
        expect(sellerBody.feedback.changesRequested).toBeNull();
      });

      it("prevents updating or deleting immutable decision transition and idempotency fields", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id, revisionId } = await seedSubmission(seller.userId);
        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-immutability-claim", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();

        const response = await requestChangesPOST(
          jsonReq(`/api/agent/submissions/${id}/request-changes`, agent.cookie, "k-immutability", {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            reviewedRevisionId: revisionId,
            reviewedRevisionNumber: 1,
            rationale: "Immutable transition fields are required for audit evidence.",
          }),
          params(id),
        );
        expect(response.status).toBe(200);

        const decision = (await db.select().from(schema.agentDecisions))[0];
        expect(decision).toMatchObject({
          priorStatus: "in_agent_review",
          resultingStatus: "changes_requested",
          idempotencyRecordKey: `agent-review:request_changes:${agent.userId}:k-immutability`,
        });

        await expectStatementFailure(
          sql`UPDATE agent_decisions SET prior_status = 'waiting_for_agent_review' WHERE id = ${decision.id}`,
        );
        await expectStatementFailure(
          sql`UPDATE agent_decisions SET resulting_status = 'internally_accepted' WHERE id = ${decision.id}`,
        );
        await expectStatementFailure(
          sql`UPDATE agent_decisions SET idempotency_record_key = 'agent-review:request_changes:test:rewritten' WHERE id = ${decision.id}`,
        );
        await expectStatementFailure(sql`DELETE FROM agent_decisions WHERE id = ${decision.id}`);

        const after = await db.select().from(schema.agentDecisions);
        expect(after).toHaveLength(1);
        expect(after[0]).toMatchObject({
          priorStatus: "in_agent_review",
          resultingStatus: "changes_requested",
          idempotencyRecordKey: `agent-review:request_changes:${agent.userId}:k-immutability`,
        });
      });

      it("releases and then reclaims using a new claim row", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);

        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-claim-release", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();

        const release = await releasePOST(
          jsonReq(`/api/agent/submissions/${id}/release`, agent.cookie, "k-release", {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            reason: "Rebalancing workload.",
          }),
          params(id),
        );
        expect(release.status).toBe(200);
        expect(await release.json()).toMatchObject({
          action: "release",
          currentStatus: "waiting_for_agent_review",
          submissionVersion: 3,
          claim: { state: "released" },
        });

        const reclaim = await claimPOST(
          jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-reclaim", {
            expectedSubmissionVersion: 3,
          }),
          params(id),
        );
        expect(reclaim.status).toBe(200);
        const claims = await db.select().from(schema.reviewerClaims);
        expect(claims).toHaveLength(2);
        expect(new Set(claims.map((row: any) => row.id)).size).toBe(2);
      });

      it("requires admin force-release reason and audits the release", async () => {
        const agent = await provision("agent@test.com", "agent");
        const admin = await provision("admin@test.com", "admin");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);

        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-claim-force", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();

        const missingReason = await releasePOST(
          jsonReq(`/api/agent/submissions/${id}/release`, admin.cookie, "k-force-missing", {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            force: true,
          }),
          params(id),
        );
        expect(missingReason.status).toBe(400);

        const reason = "Reviewer is unavailable; admin releasing for queue continuity.";
        const released = await releasePOST(
          jsonReq(`/api/agent/submissions/${id}/release`, admin.cookie, "k-force", {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            force: true,
            reason,
          }),
          params(id),
        );
        expect(released.status).toBe(200);
        expect(await released.json()).toMatchObject({
          claim: { state: "force_released" },
          currentStatus: "waiting_for_agent_review",
        });
        const rows = await db.select().from(schema.reviewerClaims);
        expect(rows[0].releasedBy).toBe(admin.userId);
        expect(rows[0].releasedByRole).toBe("admin");
        expect(rows[0].releaseReason).toBe(reason);
      });

      it("replays a concurrent identical idempotent claim as the original response", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);
        const body = { expectedSubmissionVersion: 1 };

        const [a, b] = await Promise.all([
          claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-race", body),
            params(id),
          ),
          claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-race", body),
            params(id),
          ),
        ]);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        const firstPayload = await a.json();
        const secondPayload = await b.json();
        expect(secondPayload).toEqual(firstPayload);
        expect(await db.select().from(schema.reviewerClaims)).toHaveLength(1);
      });

      it("replays a concurrent identical idempotent decision as the original response", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id, revisionId } = await seedSubmission(seller.userId);

        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-race-decision-claim", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();
        const body = {
          expectedSubmissionVersion: 2,
          claimId: claim.claim.id,
          reviewedRevisionId: revisionId,
          reviewedRevisionNumber: 1,
          rationale: "Concurrent identical request: seller should clarify brand evidence.",
        };

        const [a, b] = await Promise.all([
          requestChangesPOST(
            jsonReq(
              `/api/agent/submissions/${id}/request-changes`,
              agent.cookie,
              "k-race-decision",
              body,
            ),
            params(id),
          ),
          requestChangesPOST(
            jsonReq(
              `/api/agent/submissions/${id}/request-changes`,
              agent.cookie,
              "k-race-decision",
              body,
            ),
            params(id),
          ),
        ]);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect([
          a.headers.get("x-idempotent-replay"),
          b.headers.get("x-idempotent-replay"),
        ]).toContain("true");
        expect(await b.json()).toEqual(await a.json());
        const decisions = await db.select().from(schema.agentDecisions);
        expect(decisions).toHaveLength(1);
        expect(decisions[0].priorStatus).toBe("in_agent_review");
        expect(decisions[0].resultingStatus).toBe("changes_requested");
        expect(decisions[0].idempotencyRecordKey).toBe(
          `agent-review:request_changes:${agent.userId}:k-race-decision`,
        );
        await assertIdempotencyRecordCount(
          `agent-review:request_changes:${agent.userId}:k-race-decision`,
          1,
        );
      });

      it("rejects same decision idempotency key reuse with a different canonical request hash", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id, revisionId } = await seedSubmission(seller.userId);

        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-decision-hash-claim", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();

        const first = await requestChangesPOST(
          jsonReq(`/api/agent/submissions/${id}/request-changes`, agent.cookie, "k-decision-hash", {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            reviewedRevisionId: revisionId,
            reviewedRevisionNumber: 1,
            rationale: "First bounded change request rationale.",
          }),
          params(id),
        );
        expect(first.status).toBe(200);

        const conflict = await requestChangesPOST(
          jsonReq(`/api/agent/submissions/${id}/request-changes`, agent.cookie, "k-decision-hash", {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            reviewedRevisionId: revisionId,
            reviewedRevisionNumber: 1,
            rationale: "Different rationale under the same idempotency key.",
          }),
          params(id),
        );
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toMatchObject({
          error: { code: "IDEMPOTENCY_CONFLICT" },
        });
        expect(await db.select().from(schema.agentDecisions)).toHaveLength(1);
      });

      it("returns a controlled conflict instead of 500 for a forced SQLite unique-key decision race", async () => {
        if (!isSQLite) return;

        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id, revisionId } = await seedSubmission(seller.userId);
        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-unique-race-claim", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();

        await createForcedAgentDecisionUniqueRaceTrigger();
        const response = await requestChangesPOST(
          jsonReq(`/api/agent/submissions/${id}/request-changes`, agent.cookie, "k-unique-race", {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            reviewedRevisionId: revisionId,
            reviewedRevisionNumber: 1,
            rationale: "This request hits a deterministic unique-key race trigger.",
          }),
          params(id),
        );

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          error: { code: "CONCURRENT_REVIEW_CONFLICT" },
        });
        expect(await db.select().from(schema.agentDecisions)).toHaveLength(0);
        await assertIdempotencyRecordCount(
          `agent-review:request_changes:${agent.userId}:k-unique-race`,
          0,
        );
        const storedClaim = (await db.select().from(schema.reviewerClaims))[0];
        expect(storedClaim.state).toBe("active");
        expect(storedClaim.activeSubmissionId).toBe(id);
        const submission = await readSubmission(id);
        expect(submission?.currentStatus).toBe("in_agent_review");
        expect(submission?.version).toBe(2);
      });

      it("rolls back decision, claim, status, idempotency, and projection writes when final CAS loses", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id, revisionId } = await seedSubmission(seller.userId);
        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-forced-cas-claim", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();

        await createForcedDecisionCasRaceTrigger();
        const response = await requestChangesPOST(
          jsonReq(`/api/agent/submissions/${id}/request-changes`, agent.cookie, "k-forced-cas", {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            reviewedRevisionId: revisionId,
            reviewedRevisionNumber: 1,
            rationale: "A forced trigger bumps version before the final CAS.",
          }),
          params(id),
        );

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
        expect(await db.select().from(schema.agentDecisions)).toHaveLength(0);
        await assertIdempotencyRecordCount(
          `agent-review:request_changes:${agent.userId}:k-forced-cas`,
          0,
        );
        const claims = await db.select().from(schema.reviewerClaims);
        expect(claims).toHaveLength(1);
        expect(claims[0].state).toBe("active");
        expect(claims[0].activeSubmissionId).toBe(id);
        const events = await readSubmissionEvents(id);
        expectOnlyReviewClaimEvents(events);
        const submission = await readSubmission(id);
        expect(submission?.currentStatus).toBe("in_agent_review");
        expect(submission?.version).toBe(2);
      });

      it("prevents released and decided claim rows from becoming active again", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const releasedSubmission = await seedSubmission(seller.userId, { id: "pkg-release-lock" });
        const claimToRelease = await (
          await claimPOST(
            jsonReq(
              `/api/agent/submissions/${releasedSubmission.id}/claim`,
              agent.cookie,
              "k-release-lock-claim",
              {
                expectedSubmissionVersion: 1,
              },
            ),
            params(releasedSubmission.id),
          )
        ).json();
        const release = await releasePOST(
          jsonReq(
            `/api/agent/submissions/${releasedSubmission.id}/release`,
            agent.cookie,
            "k-release-lock",
            {
              expectedSubmissionVersion: 2,
              claimId: claimToRelease.claim.id,
              reason: "Testing release immutability.",
            },
          ),
          params(releasedSubmission.id),
        );
        expect(release.status).toBe(200);
        await expectStatementFailure(
          sql`UPDATE reviewer_claims SET state = 'active', active_submission_id = ${releasedSubmission.id} WHERE id = ${claimToRelease.claim.id}`,
        );

        const decidedSubmission = await seedSubmission(seller.userId, { id: "pkg-decision-lock" });
        const claimToDecide = await (
          await claimPOST(
            jsonReq(
              `/api/agent/submissions/${decidedSubmission.id}/claim`,
              agent.cookie,
              "k-decision-lock-claim",
              {
                expectedSubmissionVersion: 1,
              },
            ),
            params(decidedSubmission.id),
          )
        ).json();
        const decision = await internalAcceptPOST(
          jsonReq(
            `/api/agent/submissions/${decidedSubmission.id}/internal-accept`,
            agent.cookie,
            "k-decision-lock",
            {
              expectedSubmissionVersion: 2,
              claimId: claimToDecide.claim.id,
              reviewedRevisionId: decidedSubmission.revisionId,
              reviewedRevisionNumber: 1,
              rationale: "Internal rationale for accepted synthetic package.",
            },
          ),
          params(decidedSubmission.id),
        );
        expect(decision.status).toBe(200);
        await expectStatementFailure(
          sql`UPDATE reviewer_claims SET state = 'active', active_submission_id = ${decidedSubmission.id} WHERE id = ${claimToDecide.claim.id}`,
        );
        await expectStatementFailure(
          sql`UPDATE reviewer_claims SET state = 'released' WHERE id = ${claimToDecide.claim.id}`,
        );
      });

      it("conflicts on second decisions and blocks admin force-release after a decision", async () => {
        const agent = await provision("agent@test.com", "agent");
        const admin = await provision("admin@test.com", "admin");
        const seller = await provision("seller@test.com", "seller");
        const { id, revisionId } = await seedSubmission(seller.userId);
        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-second-decision-claim", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();
        const firstDecision = await requestChangesPOST(
          jsonReq(
            `/api/agent/submissions/${id}/request-changes`,
            agent.cookie,
            "k-first-decision",
            {
              expectedSubmissionVersion: 2,
              claimId: claim.claim.id,
              reviewedRevisionId: revisionId,
              reviewedRevisionNumber: 1,
              rationale: "First immutable decision.",
            },
          ),
          params(id),
        );
        expect(firstDecision.status).toBe(200);

        const secondDecision = await internalAcceptPOST(
          jsonReq(
            `/api/agent/submissions/${id}/internal-accept`,
            agent.cookie,
            "k-second-decision",
            {
              expectedSubmissionVersion: 3,
              claimId: claim.claim.id,
              reviewedRevisionId: revisionId,
              reviewedRevisionNumber: 1,
              rationale: "Second decision should not be accepted.",
            },
          ),
          params(id),
        );
        expect(secondDecision.status).toBe(409);
        expect(await secondDecision.json()).toMatchObject({
          error: { code: "REVISION_ALREADY_DECIDED" },
        });

        const forceReleaseDecided = await releasePOST(
          jsonReq(`/api/agent/submissions/${id}/release`, admin.cookie, "k-force-decided", {
            expectedSubmissionVersion: 3,
            claimId: claim.claim.id,
            force: true,
            reason: "Attempting to force-release a decided claim.",
          }),
          params(id),
        );
        expect(forceReleaseDecided.status).toBe(409);
        expect(await db.select().from(schema.agentDecisions)).toHaveLength(1);
        const claims = await db.select().from(schema.reviewerClaims);
        expect(claims).toHaveLength(1);
        expect(claims[0].state).toBe("decided");
        expect(claims[0].activeSubmissionId).toBeNull();
      });

      it("prevents another agent from releasing or deciding the active reviewer claim", async () => {
        const agent = await provision("agent@test.com", "agent");
        const otherAgent = await provision("other-agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id, revisionId } = await seedSubmission(seller.userId);
        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-owner-claim", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();

        const otherRelease = await releasePOST(
          jsonReq(`/api/agent/submissions/${id}/release`, otherAgent.cookie, "k-other-release", {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            reason: "Attempting to release another reviewer's claim.",
          }),
          params(id),
        );
        expect(otherRelease.status).toBe(403);
        expect(await otherRelease.json()).toMatchObject({
          error: { code: "CLAIM_OWNED_BY_ANOTHER_REVIEWER" },
        });

        const otherDecision = await requestChangesPOST(
          jsonReq(
            `/api/agent/submissions/${id}/request-changes`,
            otherAgent.cookie,
            "k-other-decision",
            {
              expectedSubmissionVersion: 2,
              claimId: claim.claim.id,
              reviewedRevisionId: revisionId,
              reviewedRevisionNumber: 1,
              rationale: "Attempting to decide another reviewer's claim.",
            },
          ),
          params(id),
        );
        expect(otherDecision.status).toBe(403);
        expect(await otherDecision.json()).toMatchObject({
          error: { code: "CLAIM_OWNED_BY_ANOTHER_REVIEWER" },
        });

        expect(await db.select().from(schema.agentDecisions)).toHaveLength(0);
        const claims = await db.select().from(schema.reviewerClaims);
        expect(claims[0].state).toBe("active");
        expect(claims[0].activeSubmissionId).toBe(id);
        await assertIdempotencyRecordCount(
          `agent-review:release:${otherAgent.userId}:k-other-release`,
          0,
        );
        await assertIdempotencyRecordCount(
          `agent-review:request_changes:${otherAgent.userId}:k-other-decision`,
          0,
        );
      });

      it("rejects stale reviewed revision identity without mutation", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);
        const claim = await (
          await claimPOST(
            jsonReq(`/api/agent/submissions/${id}/claim`, agent.cookie, "k-stale-revision-claim", {
              expectedSubmissionVersion: 1,
            }),
            params(id),
          )
        ).json();

        const stale = await requestChangesPOST(
          jsonReq(
            `/api/agent/submissions/${id}/request-changes`,
            agent.cookie,
            "k-stale-revision",
            {
              expectedSubmissionVersion: 2,
              claimId: claim.claim.id,
              reviewedRevisionId: randomUUID(),
              reviewedRevisionNumber: 1,
              rationale: "This should not write against a mismatched immutable revision id.",
            },
          ),
          params(id),
        );
        expect(stale.status).toBe(409);
        expect(await stale.json()).toMatchObject({
          error: { code: "REVIEWED_REVISION_CONFLICT" },
        });
        expect(await db.select().from(schema.agentDecisions)).toHaveLength(0);
        await assertIdempotencyRecordCount(
          `agent-review:request_changes:${agent.userId}:k-stale-revision`,
          0,
        );
        const claims = await db.select().from(schema.reviewerClaims);
        expect(claims[0].state).toBe("active");
        expect(claims[0].activeSubmissionId).toBe(id);
        const events = await readSubmissionEvents(id);
        expectOnlyReviewClaimEvents(events);
        const submission = await readSubmission(id);
        expect(submission?.currentStatus).toBe("in_agent_review");
        expect(submission?.version).toBe(2);
      });
    });

    describe("panel asset authorization", () => {
      it("streams to agents with nosniff, denies others, and blocks cross-submission/traversal access", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const a = await seedSubmission(seller.userId, { id: "pkg-a" });
        const b = await seedSubmission(seller.userId, { id: "pkg-b" });

        const params = (id: string, panelId: string) => ({
          params: Promise.resolve({ id, panelId }),
        });

        // Anonymous → 401, seller → 403.
        expect(
          (
            await panelGET(
              req(`/api/agent/submissions/pkg-a/panels/${a.panelId}`),
              params("pkg-a", a.panelId),
            )
          ).status,
        ).toBe(401);
        expect(
          (
            await panelGET(
              req(`/api/agent/submissions/pkg-a/panels/${a.panelId}`, seller.cookie),
              params("pkg-a", a.panelId),
            )
          ).status,
        ).toBe(403);

        // Agent → 200 image with nosniff.
        const ok = await panelGET(
          req(`/api/agent/submissions/pkg-a/panels/${a.panelId}`, agent.cookie),
          params("pkg-a", a.panelId),
        );
        expect(ok.status).toBe(200);
        expect(ok.headers.get("content-type")).toBe("image/png");
        expect(ok.headers.get("x-content-type-options")).toBe("nosniff");

        // Panel B under submission A → 404 (cross-submission).
        expect(
          (
            await panelGET(
              req(`/api/agent/submissions/pkg-a/panels/${b.panelId}`, agent.cookie),
              params("pkg-a", b.panelId),
            )
          ).status,
        ).toBe(404);

        // Path-traversal-shaped panelId → 404.
        expect(
          (
            await panelGET(
              req(`/api/agent/submissions/pkg-a/panels/..`, agent.cookie),
              params("pkg-a", "../../etc/passwd"),
            )
          ).status,
        ).toBe(404);
      });
    });

    describe("session revocation", () => {
      it("loses access immediately after the session is revoked", async () => {
        const agent = await provision("agent@test.com", "agent");
        expect((await queueGET(req("/api/agent/submissions", agent.cookie))).status).toBe(200);

        // Revoke by deleting the session row (equivalent to sign-out server-side).
        await db.delete(schema.sessions);
        expect((await queueGET(req("/api/agent/submissions", agent.cookie))).status).toBe(401);
      });
    });
  });
}
